-- Rollback of 20261023235000_chat_outbox_dispatch_every_30s.sql: original procedure (no early exit,
-- live definition of 2026-10-23) and original schedules (5 seconds, every 10 minutes).

CREATE OR REPLACE PROCEDURE public.dispatch_chat_realtime_outbox(IN p_batch_size integer DEFAULT 100, IN p_time_budget interval DEFAULT '00:00:03'::interval, IN p_max_attempts integer DEFAULT 8)
 LANGUAGE plpgsql
AS $procedure$
declare
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_prev_tx_timeout text := pg_catalog.current_setting('transaction_timeout');
  v_ids bigint[];
  v_topic text;
  v_failed jsonb := '{}'::jsonb;
  v_skipped text[] := '{}'::text[];
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 1000
     or p_time_budget is null or p_max_attempts is null or p_max_attempts < 1 then
    raise exception 'OUTBOX_PARAMETRI_NON_VALIDI' using errcode = '22023';
  end if;
  -- Hard cap for each following transaction of this run (pg_cron opens one
  -- session per run): a stuck delivery ends the session, never the cron.
  perform pg_catalog.set_config('transaction_timeout', '10s', false);

  -- 1. Claim. Backoff is set now, so an interrupted batch is retried later and
  --    can never be claimed twice concurrently.
  perform pg_catalog.set_config('lock_timeout', '1000', true);
  with due as (
    select o.id from public.chat_realtime_outbox o
    where o.status = 'pending' and o.next_attempt_at <= pg_catalog.now()
    order by o.next_attempt_at, o.id
    limit p_batch_size
    for update skip locked
  ), claimed as (
    update public.chat_realtime_outbox o
       set attempts = o.attempts + 1,
           last_attempt_at = pg_catalog.now(),
           last_error = 'DISPATCH_INTERRUPTED',
           next_attempt_at = pg_catalog.now()
             + pg_catalog.make_interval(secs => least(300, 5 * pg_catalog.power(2, least(o.attempts, 6))))
      from due where o.id = due.id
    returning o.id
  )
  select pg_catalog.array_agg(claimed.id) into v_ids from claimed;
  commit;

  if v_ids is not null then
    -- 2. Deliver each distinct topic once, isolated in its own subtransaction.
    perform pg_catalog.set_config('lock_timeout', '1000', true);
    for v_topic in
      select distinct t.topic
      from public.chat_realtime_outbox o, pg_catalog.unnest(o.topics) as t(topic)
      where o.id = any(v_ids) order by t.topic
    loop
      if pg_catalog.clock_timestamp() - v_started > p_time_budget then
        v_skipped := v_skipped || v_topic;
        continue;
      end if;
      begin
        -- No content, sender identity or client-supplied payload is broadcast.
        perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', v_topic, false);
        -- realtime.send turns ordinary errors into a WARNING: require the row.
        if not exists (
          select 1 from realtime.messages m
          where m.topic = v_topic and m.event = 'messages_changed'
            and m.inserted_at = pg_catalog.now()::timestamp
        ) then
          raise exception 'REALTIME_SEND_NOT_PERSISTED' using errcode = 'P0001';
        end if;
      exception when others then
        -- QUERY_CANCELED is not caught here: it aborts the run, rows stay claimed.
        v_failed := v_failed || pg_catalog.jsonb_build_object(
          v_topic, pg_catalog.left(SQLSTATE || ': ' || SQLERRM, 300));
      end;
    end loop;

    -- 3. Settle. Delivered rows go away; untouched rows are released; failed
    --    rows keep their error and dead-letter after p_max_attempts.
    delete from public.chat_realtime_outbox o
    where o.id = any(v_ids)
      and not exists (select 1 from pg_catalog.unnest(o.topics) as t(topic)
                      where v_failed ? t.topic or t.topic = any(v_skipped));
    update public.chat_realtime_outbox o
       set attempts = o.attempts - 1, last_error = 'BUDGET_EXCEEDED',
           next_attempt_at = pg_catalog.now()
    where o.id = any(v_ids)
      and not exists (select 1 from pg_catalog.unnest(o.topics) as t(topic) where v_failed ? t.topic);
    update public.chat_realtime_outbox o
       set last_error = (select pg_catalog.string_agg(t.topic || ' -> ' || (v_failed ->> t.topic), '; ')
                         from pg_catalog.unnest(o.topics) as t(topic) where v_failed ? t.topic),
           status = case when o.attempts >= p_max_attempts then 'failed' else 'pending' end
    where o.id = any(v_ids)
      and exists (select 1 from pg_catalog.unnest(o.topics) as t(topic) where v_failed ? t.topic);
    commit;
  end if;
  perform pg_catalog.set_config('transaction_timeout', v_prev_tx_timeout, false);
end;
$procedure$;

select cron.schedule('chat-realtime-outbox', '5 seconds', 'call public.dispatch_chat_realtime_outbox()');
select cron.schedule('chat-realtime-outbox-housekeeping', '*/10 * * * *', 'select public.chat_realtime_outbox_housekeeping()');
