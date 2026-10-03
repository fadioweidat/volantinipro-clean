-- Persist messages before attempting any Realtime work. Local candidate only.
-- Rollback (restores the Production chat_channel_isolation notifiers):
--   supabase/migrations/rollback/20261002120000_chat_realtime_outbox.rollback.sql
begin;

-- One row per message/seen change. Delivered rows are deleted; failures stay
-- visible (attempts, last_attempt_at, last_error) and are retried with backoff.
-- 'failed' is the dead-letter state after p_max_attempts: it never blocks others.
create table public.chat_realtime_outbox (
  id bigint generated always as identity primary key,
  topics text[] not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending'
    constraint chat_realtime_outbox_status_check check (status in ('pending', 'failed')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  next_attempt_at timestamptz not null default now()
);
create index chat_realtime_outbox_due_idx
  on public.chat_realtime_outbox(next_attempt_at, id) where status = 'pending';
alter table public.chat_realtime_outbox enable row level security;
revoke all on public.chat_realtime_outbox from public, anon, authenticated;
revoke all on sequence public.chat_realtime_outbox_id_seq from public, anon, authenticated;

-- Append-only: no FK or per-conversation upsert lock on the notification path.
create or replace function public.on_conversation_message_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations%rowtype;
  v_topics text[];
begin
  select * into strict v_conv from public.conversations where id = new.conversation_id;
  v_topics := array['conversation:' || v_conv.id::text, 'admin:messages'];
  if v_conv.kind = 'driver_admin' and v_conv.assignment_id is not null then
    v_topics := array_append(v_topics, 'assignment:' || v_conv.assignment_id::text);
  elsif v_conv.kind = 'customer_admin' and v_conv.campaign_id is not null then
    v_topics := array_append(v_topics, 'campaign:' || v_conv.campaign_id::text);
  end if;
  insert into public.chat_realtime_outbox(topics) values (v_topics);
  return new;
end;
$$;

create or replace function public.on_conversation_message_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations%rowtype;
  v_topics text[];
begin
  if old.seen_at is not distinct from new.seen_at then return new; end if;
  select * into strict v_conv from public.conversations where id = new.conversation_id;
  v_topics := array['conversation:' || v_conv.id::text, 'admin:messages'];
  if v_conv.kind = 'driver_admin' and v_conv.assignment_id is not null then
    v_topics := array_append(v_topics, 'assignment:' || v_conv.assignment_id::text);
  elsif v_conv.kind = 'customer_admin' and v_conv.campaign_id is not null then
    v_topics := array_append(v_topics, 'campaign:' || v_conv.campaign_id::text);
  end if;
  insert into public.chat_realtime_outbox(topics) values (v_topics);
  return new;
end;
$$;

-- A procedure so the claim commits before any Realtime work: a cancelled or
-- terminated run still leaves attempts/last_error visible and its rows pending.
-- SECURITY INVOKER and no SET clause are required for COMMIT; every reference is
-- schema-qualified and only postgres (pg_cron) may execute it.
create procedure public.dispatch_chat_realtime_outbox(
  p_batch_size integer default 100,
  p_time_budget interval default interval '3 seconds',
  p_max_attempts integer default 8
) language plpgsql as $$
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
$$;

-- Bounded history: only this feature's cron rows and dead letters are pruned.
create function public.chat_realtime_outbox_housekeeping()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_runs integer;
  v_dead integer;
begin
  with doomed as (
    select d.ctid from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where j.jobname in ('chat-realtime-outbox', 'chat-realtime-outbox-housekeeping')
      and d.end_time is not null
      and d.end_time < pg_catalog.now()
        - case when d.status = 'succeeded' then interval '1 hour' else interval '3 days' end
    limit 50000
  )
  delete from cron.job_run_details d using doomed where d.ctid = doomed.ctid;
  get diagnostics v_runs = row_count;
  delete from public.chat_realtime_outbox
  where status = 'failed' and last_attempt_at < pg_catalog.now() - interval '14 days';
  get diagnostics v_dead = row_count;
  return pg_catalog.jsonb_build_object('cron_runs_deleted', v_runs, 'dead_letters_deleted', v_dead);
end;
$$;

alter function public.on_conversation_message_inserted() owner to postgres;
alter function public.on_conversation_message_updated() owner to postgres;
alter procedure public.dispatch_chat_realtime_outbox(integer, interval, integer) owner to postgres;
alter function public.chat_realtime_outbox_housekeeping() owner to postgres;
revoke all on function public.on_conversation_message_inserted() from public, anon, authenticated;
revoke all on function public.on_conversation_message_updated() from public, anon, authenticated;
revoke all on procedure public.dispatch_chat_realtime_outbox(integer, interval, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.chat_realtime_outbox_housekeeping()
  from public, anon, authenticated, service_role;

-- pg_cron >= 1.5 required; fail atomically if unavailable (never silent disable).
-- pg_cron never overlaps runs of one job; SKIP LOCKED + backoff guard manual calls.
select cron.schedule('chat-realtime-outbox', '5 seconds',
  'call public.dispatch_chat_realtime_outbox()');
select cron.schedule('chat-realtime-outbox-housekeeping', '*/10 * * * *',
  'select public.chat_realtime_outbox_housekeeping()');
commit;
