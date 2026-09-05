-- TICKET — CUSTOMER CONTROL CENTER + ADMIN HUB + DRIVER MESSAGING — RPC.
--
-- Tutte SECURITY DEFINER, search_path '', autorizzazione riletta
-- server-side (gps_is_admin / current_user_owns_campaign / operator_id o
-- access_token dell'assignment) — stesso pattern di customer_issues.
-- Il frontend non interroga MAI conversations/conversation_messages/
-- campaign_modification_requests direttamente: solo tramite queste RPC.

begin;

-- ---------------------------------------------------------------------------
-- Helper interno: get-or-create la conversazione customer_admin di una
-- campagna. Non esposto come RPC pubblica (usato solo dalle funzioni sotto).
-- ---------------------------------------------------------------------------
create or replace function public.hub_get_or_create_customer_conversation(p_campaign_id uuid, p_customer_id uuid)
returns uuid
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where kind = 'customer_admin' and campaign_id = p_campaign_id;
  if found then return v_id; end if;
  insert into public.conversations (kind, campaign_id, customer_id)
    values ('customer_admin', p_campaign_id, p_customer_id)
    on conflict (campaign_id) where kind = 'customer_admin' do nothing
    returning id into v_id;
  if v_id is not null then return v_id; end if;
  select id into v_id from public.conversations where kind = 'customer_admin' and campaign_id = p_campaign_id;
  return v_id;
end;
$function$;

create or replace function public.hub_get_or_create_driver_conversation(p_assignment_id uuid)
returns uuid
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where kind = 'driver_admin' and assignment_id = p_assignment_id;
  if found then return v_id; end if;
  insert into public.conversations (kind, assignment_id)
    values ('driver_admin', p_assignment_id)
    on conflict (assignment_id) where kind = 'driver_admin' do nothing
    returning id into v_id;
  if v_id is not null then return v_id; end if;
  select id into v_id from public.conversations where kind = 'driver_admin' and assignment_id = p_assignment_id;
  return v_id;
end;
$function$;

-- ===========================================================================
-- CLIENTE
-- ===========================================================================

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
      'id', m.id, 'sender_role', m.sender_role, 'recipient_role', m.recipient_role,
      'text', m.text, 'channel', m.channel, 'created_at', m.created_at, 'seen_at', m.seen_at,
      'issue_id', m.issue_id, 'modification_request_id', m.modification_request_id
    ) order by m.created_at asc)
    from public.conversation_messages m where m.conversation_id = v_conv_id
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.customer_list_messages(uuid) from public, anon;
grant execute on function public.customer_list_messages(uuid) to authenticated;

create or replace function public.customer_send_message(
  p_campaign_id uuid, p_text text, p_issue_id uuid default null, p_modification_request_id uuid default null
) returns public.conversation_messages
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_conv_id uuid;
  v_msg public.conversation_messages%rowtype;
begin
  if v_uid is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.current_user_owns_campaign(p_campaign_id) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  if nullif(btrim(p_text), '') is null then raise exception 'TESTO_VUOTO' using errcode = '22023'; end if;
  v_conv_id := public.hub_get_or_create_customer_conversation(p_campaign_id, v_uid);
  insert into public.conversation_messages (conversation_id, sender_role, sender_id, recipient_role, text, issue_id, modification_request_id)
    values (v_conv_id, 'customer', v_uid, 'admin', btrim(p_text), p_issue_id, p_modification_request_id)
    returning * into v_msg;
  update public.conversations set updated_at = now() where id = v_conv_id;
  return v_msg;
end;
$function$;
revoke execute on function public.customer_send_message(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.customer_send_message(uuid, text, uuid, uuid) to authenticated;

create or replace function public.customer_mark_messages_seen(p_campaign_id uuid)
returns void
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
  select id into v_conv_id from public.conversations where kind = 'customer_admin' and campaign_id = p_campaign_id;
  if v_conv_id is null then return; end if;
  update public.conversation_messages set seen_at = now()
    where conversation_id = v_conv_id and recipient_role = 'customer' and seen_at is null;
end;
$function$;
revoke execute on function public.customer_mark_messages_seen(uuid) from public, anon;
grant execute on function public.customer_mark_messages_seen(uuid) to authenticated;

create or replace function public.customer_create_modification_request(
  p_campaign_id uuid, p_type text, p_current_value jsonb, p_requested_value jsonb, p_note text default null
) returns public.campaign_modification_requests
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_req public.campaign_modification_requests%rowtype;
begin
  if v_uid is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.current_user_owns_campaign(p_campaign_id) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  if p_type not in ('quantita', 'zona', 'servizio', 'data', 'extra', 'stampa', 'grafica', 'altro') then
    raise exception 'TIPO_NON_VALIDO' using errcode = '22023';
  end if;
  insert into public.campaign_modification_requests (campaign_id, customer_id, type, current_value, requested_value, note)
    values (p_campaign_id, v_uid, p_type, coalesce(p_current_value, '{}'::jsonb), coalesce(p_requested_value, '{}'::jsonb), nullif(btrim(p_note), ''))
    returning * into v_req;
  -- Notifica in-app all'Admin nella stessa conversazione Cliente<->Admin,
  -- cosi' la richiesta e' visibile anche nello storico messaggi.
  perform public.customer_send_message(
    p_campaign_id,
    'Richiesta di modifica: ' || p_type || coalesce(' — ' || p_note, ''),
    null, v_req.id
  );
  return v_req;
end;
$function$;
revoke execute on function public.customer_create_modification_request(uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.customer_create_modification_request(uuid, text, jsonb, jsonb, text) to authenticated;

create or replace function public.customer_list_modification_requests(p_campaign_id uuid)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.current_user_owns_campaign(p_campaign_id) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'type', r.type, 'current_value', r.current_value, 'requested_value', r.requested_value,
      'note', r.note, 'status', r.status, 'admin_note', r.admin_note,
      'created_at', r.created_at, 'decided_at', r.decided_at
    ) order by r.created_at desc)
    from public.campaign_modification_requests r where r.campaign_id = p_campaign_id
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.customer_list_modification_requests(uuid) from public, anon;
grant execute on function public.customer_list_modification_requests(uuid) to authenticated;

-- ===========================================================================
-- DRIVER (auth o token, mai Magic Link/OTP)
-- ===========================================================================

create or replace function public.hub_resolve_driver_assignment(p_assignment_id uuid, p_access_token text)
returns public.operator_assignments
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
begin
  if v_uid is not null then
    select * into v_assignment from public.operator_assignments where id = p_assignment_id and operator_id = v_uid;
  else
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select * into v_assignment from public.operator_assignments where id = p_assignment_id and access_token = p_access_token;
  end if;
  if not found then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
  return v_assignment;
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
      'id', m.id, 'sender_role', m.sender_role, 'recipient_role', m.recipient_role,
      'text', m.text, 'channel', m.channel, 'created_at', m.created_at, 'seen_at', m.seen_at,
      'issue_id', m.issue_id
    ) order by m.created_at asc)
    from public.conversation_messages m where m.conversation_id = v_conv_id
  ), '[]'::jsonb);
end;
$function$;
grant execute on function public.driver_list_messages(uuid, text) to anon, authenticated;

create or replace function public.driver_send_message(
  p_assignment_id uuid, p_text text, p_access_token text default null, p_issue_id uuid default null
) returns public.conversation_messages
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_assignment public.operator_assignments%rowtype;
  v_conv_id uuid;
  v_msg public.conversation_messages%rowtype;
  v_identity uuid;
begin
  v_assignment := public.hub_resolve_driver_assignment(p_assignment_id, p_access_token);
  if nullif(btrim(p_text), '') is null then raise exception 'TESTO_VUOTO' using errcode = '22023'; end if;
  v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  v_conv_id := public.hub_get_or_create_driver_conversation(v_assignment.id);
  insert into public.conversation_messages (conversation_id, sender_role, sender_id, recipient_role, text, issue_id)
    values (v_conv_id, 'driver', v_identity, 'admin', btrim(p_text), p_issue_id)
    returning * into v_msg;
  update public.conversations set updated_at = now() where id = v_conv_id;
  return v_msg;
end;
$function$;
grant execute on function public.driver_send_message(uuid, text, text, uuid) to anon, authenticated;

create or replace function public.driver_mark_messages_seen(p_assignment_id uuid, p_access_token text default null)
returns void
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_assignment public.operator_assignments%rowtype;
  v_conv_id uuid;
begin
  v_assignment := public.hub_resolve_driver_assignment(p_assignment_id, p_access_token);
  select id into v_conv_id from public.conversations where kind = 'driver_admin' and assignment_id = v_assignment.id;
  if v_conv_id is null then return; end if;
  update public.conversation_messages set seen_at = now()
    where conversation_id = v_conv_id and recipient_role = 'driver' and seen_at is null;
end;
$function$;
grant execute on function public.driver_mark_messages_seen(uuid, text) to anon, authenticated;

-- ===========================================================================
-- ADMIN
-- ===========================================================================

create or replace function public.admin_list_conversations(p_kind text default null, p_unread_only boolean default false)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  if p_kind is not null and p_kind not in ('customer_admin', 'driver_admin') then
    raise exception 'FILTRO_NON_VALIDO' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'campaign_id', c.campaign_id, 'assignment_id', c.assignment_id,
      'campaign_name', camp.campaign_name, 'customer_name', camp.customer_name,
      'zone_name', ass_zone.zone_name, 'assignment_status', a.status,
      'updated_at', c.updated_at,
      'unread_count', (select count(*) from public.conversation_messages m where m.conversation_id = c.id and m.recipient_role = 'admin' and m.seen_at is null),
      'last_message', (select jsonb_build_object('text', m2.text, 'sender_role', m2.sender_role, 'created_at', m2.created_at)
        from public.conversation_messages m2 where m2.conversation_id = c.id order by m2.created_at desc limit 1)
    ) order by c.updated_at desc)
    from public.conversations c
    left join public.campaigns camp on camp.id = c.campaign_id
    left join public.operator_assignments a on a.id = c.assignment_id
    left join public.campaign_zones ass_zone on ass_zone.id = a.zone_id
    where (p_kind is null or c.kind = p_kind)
      and (not p_unread_only or exists (
        select 1 from public.conversation_messages m3 where m3.conversation_id = c.id and m3.recipient_role = 'admin' and m3.seen_at is null
      ))
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.admin_list_conversations(text, boolean) from public, anon;
grant execute on function public.admin_list_conversations(text, boolean) to authenticated;

create or replace function public.admin_list_messages(p_conversation_id uuid)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'sender_role', m.sender_role, 'recipient_role', m.recipient_role,
      'text', m.text, 'channel', m.channel, 'created_at', m.created_at, 'seen_at', m.seen_at,
      'issue_id', m.issue_id, 'modification_request_id', m.modification_request_id
    ) order by m.created_at asc)
    from public.conversation_messages m where m.conversation_id = p_conversation_id
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.admin_list_messages(uuid) from public, anon;
grant execute on function public.admin_list_messages(uuid) to authenticated;

create or replace function public.admin_send_message(
  p_conversation_id uuid, p_text text, p_issue_id uuid default null, p_modification_request_id uuid default null
) returns public.conversation_messages
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_conv public.conversations%rowtype;
  v_recipient text;
  v_msg public.conversation_messages%rowtype;
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  if nullif(btrim(p_text), '') is null then raise exception 'TESTO_VUOTO' using errcode = '22023'; end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then raise exception 'CONVERSAZIONE_NON_TROVATA' using errcode = 'P0002'; end if;
  v_recipient := case when v_conv.kind = 'customer_admin' then 'customer' else 'driver' end;
  insert into public.conversation_messages (conversation_id, sender_role, sender_id, recipient_role, text, issue_id, modification_request_id)
    values (p_conversation_id, 'admin', v_uid, v_recipient, btrim(p_text), p_issue_id, p_modification_request_id)
    returning * into v_msg;
  update public.conversations set updated_at = now() where id = p_conversation_id;
  return v_msg;
end;
$function$;
revoke execute on function public.admin_send_message(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.admin_send_message(uuid, text, uuid, uuid) to authenticated;

create or replace function public.admin_mark_messages_seen(p_conversation_id uuid)
returns void
  language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  update public.conversation_messages set seen_at = now()
    where conversation_id = p_conversation_id and recipient_role = 'admin' and seen_at is null;
end;
$function$;
revoke execute on function public.admin_mark_messages_seen(uuid) from public, anon;
grant execute on function public.admin_mark_messages_seen(uuid) to authenticated;

create or replace function public.admin_list_modification_requests(p_campaign_id uuid default null, p_status text default null)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'campaign_id', r.campaign_id, 'campaign_name', camp.campaign_name, 'customer_name', camp.customer_name,
      'type', r.type, 'current_value', r.current_value, 'requested_value', r.requested_value,
      'note', r.note, 'status', r.status, 'admin_note', r.admin_note,
      'created_at', r.created_at, 'decided_at', r.decided_at
    ) order by (r.status <> 'pending'), r.created_at desc)
    from public.campaign_modification_requests r
    left join public.campaigns camp on camp.id = r.campaign_id
    where (p_campaign_id is null or r.campaign_id = p_campaign_id)
      and (p_status is null or r.status = p_status)
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.admin_list_modification_requests(uuid, text) from public, anon;
grant execute on function public.admin_list_modification_requests(uuid, text) to authenticated;

create or replace function public.admin_decide_modification_request(p_request_id uuid, p_decision text, p_admin_note text default null)
returns public.campaign_modification_requests
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_req public.campaign_modification_requests%rowtype;
  v_conv_id uuid;
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected', 'applied', 'cancelled') then
    raise exception 'DECISIONE_NON_VALIDA' using errcode = '22023';
  end if;
  update public.campaign_modification_requests
    set status = p_decision, admin_note = nullif(btrim(p_admin_note), ''), decided_by = v_uid, decided_at = now()
    where id = p_request_id
    returning * into v_req;
  if not found then raise exception 'RICHIESTA_NON_TROVATA' using errcode = 'P0002'; end if;
  -- Notifica in-app al Cliente nella conversazione della campagna — mai un
  -- aggiornamento automatico del prezzo/pagamento, solo comunicazione dello
  -- stato (il pricing reale passa dal flusso Admin/pricing esistente).
  -- get-or-create: la conversazione potrebbe non esistere ancora se il
  -- Cliente non ha mai scritto (la richiesta di modifica stessa arriva
  -- sempre da customer_create_modification_request, che la crea, ma
  -- resta un fallback difensivo per dati storici).
  v_conv_id := public.hub_get_or_create_customer_conversation(v_req.campaign_id, v_req.customer_id);
  perform public.admin_send_message(
    v_conv_id,
    'La tua richiesta di modifica (' || v_req.type || ') e'' stata aggiornata: ' || p_decision
      || coalesce(' — ' || p_admin_note, ''),
    null, v_req.id
  );
  return v_req;
end;
$function$;
revoke execute on function public.admin_decide_modification_request(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_modification_request(uuid, text, text) to authenticated;

commit;
