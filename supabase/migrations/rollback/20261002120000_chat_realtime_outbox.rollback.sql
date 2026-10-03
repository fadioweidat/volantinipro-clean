-- ROLLBACK of 20261002120000_chat_realtime_outbox.sql. Run manually, never by
-- the migration runner (this folder is not scanned by the Supabase CLI).
-- Restores the CURRENT Production notifiers: the chat_channel_isolation bodies
-- (version 20260923184105) copied byte-for-byte, i.e. invalidation-only
-- "messages_changed" with {"changed":true}. It never restores the 2026-09-12
-- triggers that broadcast message text. The channel guard trigger, restrictive
-- policy and revoked helpers are not touched. conversation_messages is not
-- touched. Pending outbox hints are discarded: clients still poll the
-- authorized RPCs, so no message is lost.
begin;

-- Feature cron history first (jobids disappear with unschedule).
delete from cron.job_run_details d using cron.job j
where d.jobid = j.jobid
  and j.jobname in ('chat-realtime-outbox', 'chat-realtime-outbox-housekeeping');
select cron.unschedule(jobid) from cron.job
where jobname in ('chat-realtime-outbox', 'chat-realtime-outbox-housekeeping');

-- Waits for an in-flight dispatcher run (its claim/delivery row locks).
lock table public.chat_realtime_outbox in access exclusive mode;

create or replace function public.on_conversation_message_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations where id = NEW.conversation_id;
  if not found then return NEW; end if;
  if v_conv.kind = 'driver_admin' and v_conv.assignment_id is not null then
    perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'assignment:' || v_conv.assignment_id::text, false);
  elsif v_conv.kind = 'customer_admin' and v_conv.campaign_id is not null then
    perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'campaign:' || v_conv.campaign_id::text, false);
  end if;
  perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'conversation:' || NEW.conversation_id::text, false);
  perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'admin:messages', false);
  return NEW;
end;
$$;

create or replace function public.on_conversation_message_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conv public.conversations%rowtype;
begin
  if OLD.seen_at is not distinct from NEW.seen_at then return NEW; end if;
  select * into v_conv from public.conversations where id = NEW.conversation_id;
  if not found then return NEW; end if;
  if v_conv.kind = 'driver_admin' and v_conv.assignment_id is not null then
    perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'assignment:' || v_conv.assignment_id::text, false);
  elsif v_conv.kind = 'customer_admin' and v_conv.campaign_id is not null then
    perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'campaign:' || v_conv.campaign_id::text, false);
  end if;
  perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'conversation:' || NEW.conversation_id::text, false);
  perform realtime.send('{"changed":true}'::jsonb, 'messages_changed', 'admin:messages', false);
  return NEW;
end;
$$;

-- Production ACL of the notifiers (default EXECUTE grants; trigger functions
-- cannot be invoked directly, so this only restores catalog parity).
grant execute on function public.on_conversation_message_inserted() to public, anon, authenticated, service_role;
grant execute on function public.on_conversation_message_updated() to public, anon, authenticated, service_role;

drop procedure public.dispatch_chat_realtime_outbox(integer, interval, integer);
drop function public.chat_realtime_outbox_housekeeping();
drop table public.chat_realtime_outbox;
commit;
