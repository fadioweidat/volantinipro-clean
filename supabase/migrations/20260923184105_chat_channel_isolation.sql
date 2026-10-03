-- Repository baseline for the migration ALREADY APPLIED in Production as
-- version 20260923184105 "chat_channel_isolation" (byte-identical source,
-- verified against supabase_migrations.schema_migrations.statements).
-- Same version, so environments that already ran it skip it. Re-running it
-- is a no-op: function bodies are identical and the trigger/policy are only
-- created when missing (never dropped or recreated).
-- Chat isolation: public realtime carries invalidation only, never content.
-- Existing authorized RPCs remain the sole message transport for token Drivers
-- and Customers. No message is deleted, moved, or rewritten.
begin;

-- Internal SECURITY DEFINER helpers must not be remotely callable.
revoke execute on function public.hub_get_or_create_customer_conversation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.hub_get_or_create_driver_conversation(uuid) from public, anon, authenticated;

-- Stop unfiltered Postgres row subscriptions, including old deployed clients.
-- Other tables and structured-issue delivery are unaffected.
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'conversation_messages') then
    alter publication supabase_realtime drop table public.conversation_messages;
  end if;
end $$;

create or replace function public.guard_conversation_message_channel()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  select kind into v_kind from public.conversations where id = NEW.conversation_id;
  if not coalesce(
    (v_kind = 'customer_admin' and ((NEW.sender_role = 'customer' and NEW.recipient_role = 'admin') or (NEW.sender_role = 'admin' and NEW.recipient_role = 'customer')))
    or (v_kind = 'driver_admin' and ((NEW.sender_role = 'driver' and NEW.recipient_role = 'admin') or (NEW.sender_role = 'admin' and NEW.recipient_role = 'driver'))), false) then
    raise exception 'CHAT_CHANNEL_MISMATCH' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke execute on function public.guard_conversation_message_channel() from public, anon, authenticated;
do $guard$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.conversation_messages'::regclass
                 and tgname = 'trg_guard_conversation_message_channel' and not tgisinternal) then
    create trigger trg_guard_conversation_message_channel
    before insert or update of conversation_id, sender_role, recipient_role on public.conversation_messages
    for each row execute function public.guard_conversation_message_channel();
  end if;
end $guard$;

-- Ambiguous historical records remain available to Admin for investigation,
-- but never reach participants through direct SELECT/PostgREST.
do $policy$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'conversation_messages' and policyname = 'conversation_messages_channel_guard') then
    create policy conversation_messages_channel_guard on public.conversation_messages
    as restrictive for select to authenticated
    using (public.gps_is_admin() or exists (
      select 1 from public.conversations c where c.id = conversation_messages.conversation_id
      and ((c.kind = 'customer_admin' and ((sender_role = 'customer' and recipient_role = 'admin') or (sender_role = 'admin' and recipient_role = 'customer')))
        or (c.kind = 'driver_admin' and ((sender_role = 'driver' and recipient_role = 'admin') or (sender_role = 'admin' and recipient_role = 'driver'))))
    ));
  end if;
end $policy$;

create or replace function public.customer_list_messages(p_campaign_id uuid)
returns jsonb
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_conv_id uuid;
begin
  if v_uid is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.current_user_owns_campaign(p_campaign_id) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  v_conv_id := public.hub_get_or_create_customer_conversation(p_campaign_id, v_uid);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'conversation_id', m.conversation_id, 'sender_role', m.sender_role, 'recipient_role', m.recipient_role,
      'text', m.text, 'channel', m.channel, 'created_at', m.created_at, 'seen_at', m.seen_at,
      'issue_id', m.issue_id, 'modification_request_id', m.modification_request_id
    ) order by m.created_at asc)
    from public.conversation_messages m where m.conversation_id = v_conv_id
      and ((m.sender_role = 'customer' and m.recipient_role = 'admin')
        or (m.sender_role = 'admin' and m.recipient_role = 'customer'))
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.driver_list_messages(p_assignment_id uuid, p_access_token text default null)
returns jsonb
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_assignment public.operator_assignments%rowtype;
  v_conv_id uuid;
begin
  v_assignment := public.hub_resolve_driver_assignment(p_assignment_id, p_access_token);
  v_conv_id := public.hub_get_or_create_driver_conversation(v_assignment.id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'conversation_id', m.conversation_id, 'sender_role', m.sender_role, 'recipient_role', m.recipient_role,
      'text', m.text, 'channel', m.channel, 'created_at', m.created_at, 'seen_at', m.seen_at,
      'issue_id', m.issue_id
    ) order by m.created_at asc)
    from public.conversation_messages m where m.conversation_id = v_conv_id
      and ((m.sender_role = 'driver' and m.recipient_role = 'admin')
        or (m.sender_role = 'admin' and m.recipient_role = 'driver'))
  ), '[]'::jsonb);
end;
$function$;

-- Payload has no text, IDs, roles, issue data, or other message content.
-- An unauthenticated broadcast can only request a reload; each RPC rechecks
-- campaign ownership / assignment credentials / Admin permission on every read.
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
commit;
