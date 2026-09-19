-- TICKET — DRIVER OPERATIONS: segnalazioni cliente per zona + UNA zona alla volta.
--
-- ROOT CAUSE (verificato con query in sola lettura sul DB di produzione):
--
-- 1) SEGNALAZIONE CLIENTE NON ARRIVA AL DRIVER. Campagna dc5a5357-…: la sola
--    segnalazione ("via orobono") ha zone_id NULL, assignment_id NULL,
--    routed_to 'admin_queue'. Il form Cliente lasciava la zona facoltativa
--    ("Zona non specificata (verifica manuale Admin)") e customer_create_issue
--    instrada al driver SOLO con una zona nota: senza zona nessun driver
--    (l'unico assignment attivo copre 20 zone) poteva riceverla, e
--    driver_list_issues non esponeva la zona per filtrarla lato Driver.
--    Fix: la zona e' OBBLIGATORIA quando la campagna ha zone (server-side, non
--    solo UI) e driver_list_issues restituisce zone_id/zone_name.
--
-- 2) UNA ZONA ALLA VOLTA. Nessun controllo server-side impediva di avviare una
--    zona mentre un'altra dello stesso incarico era gia' "In corso", ne' di
--    saltare l'ordine del programma; la UI, a sessione chiusa, mostrava
--    "Inizia" su TUTTE le zone. Fix: gps_zone_start_guard() richiamata da
--    gps_start_session_v3 e gps_transition_zone_v3('start'): blocca l'avvio se
--    un'altra zona dell'incarico e' "In corso" o se una zona precedente
--    dell'ordine di programma non e' "Completata".
--
-- Nessuna modifica a tabelle, RLS, prezzi, quantita' o pipeline GPS raw: le
-- funzioni sono ricreate identiche alle versioni correnti + il solo guard.

begin;

-- ---------------------------------------------------------------------------
-- Guard: una sola zona "In corso" per incarico + ordine di programma.
-- ---------------------------------------------------------------------------
create or replace function public.gps_zone_start_guard(p_assignment_id uuid, p_target_zone_id uuid)
returns void
  language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_target public.campaign_zones%rowtype;
  v_other text;
  v_prev text;
begin
  if p_assignment_id is null or p_target_zone_id is null then return; end if;

  select z.* into v_target from public.campaign_zones z where z.id = p_target_zone_id;
  if not found then return; end if;

  -- (a) un'altra zona dello stesso incarico e' gia' "In corso"
  select z.zone_name into v_other
  from public.operator_assignment_zones oaz
  join public.campaign_zones z on z.id = oaz.zone_id
  where oaz.assignment_id = p_assignment_id
    and z.id <> p_target_zone_id
    and z.status = 'In corso'
  order by z.priority nulls last, z.zone_name
  limit 1;
  if v_other is not null then
    raise exception 'ZONA_ALTRA_IN_CORSO: Completa o termina % prima di iniziare %.', v_other, v_target.zone_name
      using errcode = '23514';
  end if;

  -- (b) una zona PRECEDENTE dell'ordine di programma non e' completata
  select z.zone_name into v_prev
  from public.operator_assignment_zones oaz
  join public.campaign_zones z on z.id = oaz.zone_id
  where oaz.assignment_id = p_assignment_id
    and z.id <> p_target_zone_id
    and coalesce(z.status, 'Da iniziare') <> 'Completata'
    and (coalesce(z.priority, 999999), z.zone_name) < (coalesce(v_target.priority, 999999), v_target.zone_name)
  order by z.priority nulls last, z.zone_name
  limit 1;
  if v_prev is not null then
    raise exception 'ZONA_PRECEDENTE_NON_COMPLETATA: Completa % prima di iniziare %.', v_prev, v_target.zone_name
      using errcode = '23514';
  end if;
end;
$function$;
revoke all on function public.gps_zone_start_guard(uuid, uuid) from public;
grant execute on function public.gps_zone_start_guard(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- gps_start_session_v3 — identica a 20260914020000 + guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gps_start_session_v3(
  p_assignment_id uuid,
  p_device_id text DEFAULT NULL::text,
  p_campaign_zone_id uuid DEFAULT NULL::uuid,
  p_access_token text DEFAULT NULL::text
) RETURNS public.delivery_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
  v_group_name text;
  v_blocking public.delivery_sessions%rowtype;
  v_last_activity timestamptz;
  v_age_seconds numeric;
begin
  if p_access_token is not null then
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.access_token = p_access_token for update;
    if not found then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  elsif v_uid is not null then
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.operator_id = v_uid for update;
    if not found then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
    v_identity := v_uid;
  else
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  if not public.gps_assignment_is_valid_v2(
    v_assignment.id, v_identity, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_campaign_zone_id is not null and not exists (
    select 1 from public.campaign_zones z
    where z.id = p_campaign_zone_id
      and z.campaign_id = v_assignment.campaign_id
      and z.group_id = v_assignment.group_id
  ) then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  -- UNA zona alla volta + ordine di programma (server-side, non solo UI).
  perform public.gps_zone_start_guard(v_assignment.id, p_campaign_zone_id);

  select g.name into v_group_name from public.operational_groups g
    where g.id = v_assignment.group_id and g.campaign_id = v_assignment.campaign_id;

  select s.* into v_blocking from public.delivery_sessions s
    where s.driver_id = v_identity
      and s.campaign_id = v_assignment.campaign_id
      and s.assignment_id is not null
      and s.status in ('started', 'paused')
    order by s.started_at desc nulls last, s.created_at desc
    limit 1 for update;

  if found then
    if v_blocking.status = 'paused' then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % in pausa', v_blocking.id using errcode = '23505';
    end if;
    select greatest(
      coalesce((select max(p.recorded_at) from public.gps_tracking_points p where p.session_id = v_blocking.id), v_blocking.started_at),
      v_blocking.started_at
    ) into v_last_activity;
    v_age_seconds := extract(epoch from (now() - v_last_activity));
    if v_age_seconds <= 600 then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % attiva, ultima attivita'' % secondi fa', v_blocking.id, round(v_age_seconds) using errcode = '23505';
    elsif v_age_seconds <= 14400 then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % ferma da % secondi', v_blocking.id, round(v_age_seconds) using errcode = '23505';
    else
      raise exception 'ABANDONED_SESSION_EXISTS: sessione % inattiva da % ore', v_blocking.id, round(v_age_seconds / 3600, 1) using errcode = '23505';
    end if;
  end if;

  begin
    insert into public.delivery_sessions (
      assignment_id, campaign_id, group_id, driver_id, device_id,
      status, started_at, paused_at, ended_at, metadata, updated_at, campaign_zone_id
    ) values (
      v_assignment.id, v_assignment.campaign_id, v_assignment.group_id,
      v_identity, nullif(btrim(p_device_id), ''), 'started', now(), null, null,
      jsonb_build_object(
        'source', case when v_assignment.operator_id is null then 'driver_group_participant' else 'gps_authenticated_operator' end,
        'group_id', v_assignment.group_id, 'group_name', v_group_name,
        'campaign_zone_id', p_campaign_zone_id
      ), now(), p_campaign_zone_id
    ) returning * into v_session;
  exception when unique_violation then
    raise exception 'SESSIONE_GIA_ATTIVA' using errcode = '23505';
  end;

  if p_campaign_zone_id is not null then
    update public.campaign_zones
      set status = 'In corso', started_at = coalesce(started_at, now()), updated_at = now()
      where id = p_campaign_zone_id;
  end if;

  insert into public.gps_operator_audit_log (operator_id, action, campaign_id, assignment_id, session_id, context)
  values (v_identity, 'session_started', v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('has_device_id', v_session.device_id is not null, 'campaign_zone_id', p_campaign_zone_id, 'participant', v_assignment.operator_id is null));

  return v_session;
end;
$function$;

-- ---------------------------------------------------------------------------
-- gps_transition_zone_v3 — identica a 20260829180000 + guard su 'start'.
-- ---------------------------------------------------------------------------
create or replace function public.gps_transition_zone_v3(
  p_campaign_zone_id uuid, p_action text, p_access_token text default null, p_assignment_id uuid default null
) returns public.delivery_sessions
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_identity uuid;
  v_zone public.campaign_zones%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_previous_zone_id uuid;
begin
  if v_uid is not null then
    v_identity := v_uid;
  else
    if p_access_token is null or p_assignment_id is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select coalesce(operator_id, id) into v_identity
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_identity is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
  end if;

  select z.* into v_zone from public.campaign_zones z where z.id = p_campaign_zone_id for update;
  if not found then raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002'; end if;

  select s.* into v_session from public.delivery_sessions s
    where s.driver_id = v_identity and s.status in ('started', 'paused')
      and s.campaign_id = v_zone.campaign_id and s.group_id = v_zone.group_id
      and s.assignment_id is not null
      and public.gps_assignment_is_valid_v2(s.assignment_id, v_identity, s.campaign_id, s.group_id, now())
    order by s.started_at desc nulls last, s.created_at desc
    limit 1 for update;
  if not found then raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501'; end if;

  v_previous_zone_id := v_session.campaign_zone_id;

  if p_action = 'start' then
    -- UNA zona alla volta + ordine di programma (server-side).
    perform public.gps_zone_start_guard(v_session.assignment_id, p_campaign_zone_id);
    update public.campaign_zones
      set status = 'In corso', started_at = coalesce(started_at, now()), completed_at = null, updated_at = now()
      where id = p_campaign_zone_id;
    update public.delivery_sessions
      set campaign_zone_id = p_campaign_zone_id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('campaign_zone_id', p_campaign_zone_id),
          updated_at = now()
      where id = v_session.id returning * into v_session;
  elsif p_action = 'complete' then
    if v_previous_zone_id is distinct from p_campaign_zone_id then
      raise exception 'ZONA_SESSIONE_NON_CORRISPONDENTE' using errcode = '42501';
    end if;
    update public.campaign_zones
      set status = 'Completata', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = p_campaign_zone_id;
  else
    raise exception 'AZIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (operator_id, action, campaign_id, assignment_id, session_id, context)
  values (v_identity, case when p_action = 'start' then 'zone_started' else 'zone_completed' end,
    v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('previous_zone_id', v_previous_zone_id, 'campaign_zone_id', p_campaign_zone_id));
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- customer_create_issue — come 20260905120000, ma la zona e' OBBLIGATORIA
-- quando la campagna ha zone (mai piu' segnalazioni orfane in admin_queue
-- solo perche' il Cliente ha lasciato "Zona non specificata").
-- ---------------------------------------------------------------------------
create or replace function public.customer_create_issue(
  p_campaign_id uuid, p_municipality text, p_street text, p_house_number text,
  p_lat double precision, p_lng double precision, p_reason text, p_notes text default null,
  p_zone_id uuid default null
) returns public.customer_issues
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_zone_id uuid;
  v_group_id uuid;
  v_cands uuid[];
  v_assignment public.operator_assignments%rowtype;
  v_routed text := 'admin_queue';
  v_status text := 'new';
  v_driver_id uuid;
  v_issue public.customer_issues%rowtype;
begin
  if v_uid is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.current_user_owns_campaign(p_campaign_id) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  if nullif(btrim(p_municipality), '') is null or nullif(btrim(p_street), '') is null then
    raise exception 'INDIRIZZO_INCOMPLETO' using errcode = '22023';
  end if;
  if p_reason not in ('non_ricevuto', 'via_non_coperta', 'zona_da_verificare', 'altro') then
    raise exception 'MOTIVO_NON_VALIDO' using errcode = '22023';
  end if;

  if p_zone_id is not null then
    select z.id, z.group_id into v_zone_id, v_group_id
    from public.campaign_zones z
    where z.id = p_zone_id and z.campaign_id = p_campaign_id;
    if not found then
      raise exception 'ZONA_NON_VALIDA' using errcode = '22023';
    end if;
  elsif p_lat is not null and p_lng is not null then
    select z.id, z.group_id into v_zone_id, v_group_id
    from public.campaign_zones z
    where z.campaign_id = p_campaign_id and z.geometry is not null
      and public.ST_Contains(z.geometry, public.ST_SetSRID(public.ST_MakePoint(p_lng, p_lat), 4326))
    order by z.priority nulls last
    limit 1;
  end if;

  -- Zona obbligatoria se la campagna ha zone reali.
  if v_zone_id is null and exists (select 1 from public.campaign_zones z where z.campaign_id = p_campaign_id) then
    raise exception 'ZONA_OBBLIGATORIA' using errcode = '22023';
  end if;

  if v_zone_id is not null then
    select array_agg(distinct a.id) into v_cands
    from public.operator_assignments a
    left join public.operator_assignment_zones oaz on oaz.assignment_id = a.id
    where a.campaign_id = p_campaign_id
      and a.status = 'active' and a.revoked_at is null
      and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
      and (oaz.zone_id = v_zone_id or a.zone_id = v_zone_id
           or (v_group_id is not null and a.group_id = v_group_id));
  end if;

  -- Instrada SOLO se il candidato e' UNO E UNO SOLO. Altrimenti resta in coda
  -- Admin (che instrada con admin_route_issue). Mai al driver sbagliato.
  if v_cands is not null and array_length(v_cands, 1) = 1 then
    select * into v_assignment from public.operator_assignments where id = v_cands[1];
    v_routed := 'driver';
    v_status := 'assigned';
    v_driver_id := coalesce(v_assignment.operator_id, v_assignment.id);
  end if;

  insert into public.customer_issues
    (campaign_id, created_by, municipality, street, house_number, lat, lng, reason, notes,
     status, zone_id, assignment_id, routed_to, driver_id)
  values (p_campaign_id, v_uid, btrim(p_municipality), btrim(p_street), nullif(btrim(p_house_number), ''),
     p_lat, p_lng, p_reason, nullif(btrim(p_notes), ''),
     v_status, v_zone_id,
     case when v_routed = 'driver' then v_assignment.id else null end,
     v_routed, v_driver_id)
  returning * into v_issue;

  insert into public.issue_events (issue_id, event_type, actor, context)
  values (v_issue.id, 'CUSTOMER_ISSUE_CREATED', v_uid,
    jsonb_build_object('routed_to', v_routed, 'zone_id', v_zone_id));
  if v_routed = 'driver' then
    insert into public.issue_events (issue_id, event_type, actor, context)
    values (v_issue.id, 'DRIVER_ISSUE_ASSIGNED', v_uid,
      jsonb_build_object('assignment_id', v_assignment.id));
  end if;

  return v_issue;
end;
$function$;

-- ---------------------------------------------------------------------------
-- driver_list_issues — come 20260905120000 + zone_id / zone_name, cosi' il
-- Driver mostra le segnalazioni della zona attiva e distingue quelle future.
-- ---------------------------------------------------------------------------
create or replace function public.driver_list_issues(p_assignment_id uuid, p_access_token text default null)
returns jsonb
  language plpgsql stable security definer set search_path to ''
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

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'municipality', i.municipality, 'street', i.street, 'house_number', i.house_number,
      'lat', i.lat, 'lng', i.lng, 'reason', i.reason, 'notes', i.notes, 'status', i.status,
      'zone_id', i.zone_id, 'zone_name', z.zone_name,
      'created_at', i.created_at, 'seen_at', i.seen_at, 'taken_at', i.taken_at, 'resolved_at', i.resolved_at, 'resolution_note', i.resolution_note
    ) order by (i.status = 'resolved' or i.status = 'not_resolvable'), i.created_at desc)
    from public.customer_issues i
    left join public.campaign_zones z on z.id = i.zone_id
    where i.assignment_id = p_assignment_id
  ), '[]'::jsonb);
end;
$function$;
grant execute on function public.driver_list_issues(uuid, text) to anon, authenticated;

commit;
