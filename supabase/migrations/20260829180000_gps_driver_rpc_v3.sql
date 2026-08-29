-- GPS Driver RPC _v3 — identita' = coalesce(operator_assignments.operator_id, id).
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- PERCHE'
-- Con Driver Group Access (20260829170000) un partecipante ottiene una
-- operator_assignments ANONIMA (operator_id NULL) con un proprio access_token.
-- Le RPC v1/v2 risolvono l'identita' come access_token -> operator_id e
-- verificano delivery_sessions.driver_id = operator_id: per un'assignment
-- anonima operator_id e' NULL e falliscono (OPERATORE_NON_AUTENTICATO). Le _v3
-- usano l'identita' = coalesce(a.operator_id, a.id):
--   * assignment personale  -> identita' = operator_id  (comportamento identico a v1/v2)
--   * assignment participant -> identita' = assignment.id
-- delivery_sessions.driver_id e gps_tracking_points.driver_id contengono
-- questa identita'. Ogni participant ha quindi la SUA sessione isolata
-- (indice unique delivery_sessions_one_active_operator_campaign_uidx su
-- (driver_id, campaign_id)).
--
-- SICUREZZA (invariata rispetto a _v2):
--   * il group token NON compare qui: le _v3 accettano solo il token PERSONALE
--     dell'assignment (personale o participant).
--   * device ownership: p_device_id confrontato con delivery_sessions.device_id
--     -> DEVICE_MISMATCH.
--   * gps_insert_point_v3: solo status='started' -> PAUSED_SESSION /
--     SESSION_COMPLETED altrimenti.
--   * validazione via gps_assignment_is_valid_v2 (LEFT JOIN operator_profiles).
--   * pause/resume/stop scoped a p_session_id, mai per campaign_id.
--
-- BACKWARD COMPATIBILITY: v1 e v2 restano intatte (nessun DROP). Il frontend
-- chiama _v3 -> fallback _v2 -> fallback v1.
--
-- NON tocca: pricing, stampa, Resend, pagamenti, customer, coverage aggregata,
-- geofence, auth cliente/admin, RPC personali esistenti. Nessun cron/trigger.

begin;

-- ---------------------------------------------------------------------------
-- 1. gps_start_session_v3
-- ---------------------------------------------------------------------------
create or replace function public.gps_start_session_v3(
  p_assignment_id uuid,
  p_device_id text default null,
  p_campaign_zone_id uuid default null,
  p_access_token text default null
) returns public.delivery_sessions
  language plpgsql security definer set search_path to ''
as $$
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
  if v_uid is not null then
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.operator_id = v_uid for update;
    if not found then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;
    v_identity := v_uid;
  else
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.access_token = p_access_token for update;
    if not found then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
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
$$;
alter function public.gps_start_session_v3(uuid, text, uuid, text) owner to postgres;
revoke all on function public.gps_start_session_v3(uuid, text, uuid, text) from public;
grant execute on function public.gps_start_session_v3(uuid, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. gps_insert_point_v3
-- ---------------------------------------------------------------------------
create or replace function public.gps_insert_point_v3(
  p_session_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_speed double precision default null,
  p_heading double precision default null, p_recorded_at timestamptz default now(),
  p_access_token text default null, p_device_id text default null
) returns public.gps_tracking_points
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
  v_point public.gps_tracking_points%rowtype;
begin
  if v_uid is not null then
    v_identity := v_uid;
  else
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select coalesce(a.operator_id, a.id) into v_identity
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_identity is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
  end if;

  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'COORDINATE_NON_VALIDE' using errcode = '22023';
  end if;

  select * into v_session from public.delivery_sessions s
    where s.id = p_session_id and s.driver_id = v_identity and s.assignment_id is not null;
  if not found then raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;

  if v_session.status in ('completed', 'cancelled') then raise exception 'SESSION_COMPLETED' using errcode = '42501'; end if;
  if v_session.status = 'paused' then raise exception 'PAUSED_SESSION' using errcode = '42501'; end if;
  if v_session.status <> 'started' then raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;

  if not public.gps_assignment_is_valid_v2(
    v_session.assignment_id, v_identity, v_session.campaign_id, v_session.group_id, now()
  ) then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_device_id is not null and v_session.device_id is not null and v_session.device_id <> p_device_id then
    raise exception 'DEVICE_MISMATCH' using errcode = '42501';
  end if;

  insert into public.gps_tracking_points (campaign_id, session_id, driver_id, lat, lng, accuracy, speed, heading, recorded_at)
  values (v_session.campaign_id, v_session.id, v_identity, p_lat, p_lng, p_accuracy, p_speed, p_heading, coalesce(p_recorded_at, now()))
  returning * into v_point;
  return v_point;
end;
$$;
alter function public.gps_insert_point_v3(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text, text) owner to postgres;
revoke all on function public.gps_insert_point_v3(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text, text) from public;
grant execute on function public.gps_insert_point_v3(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. gps_transition_session_v3
-- ---------------------------------------------------------------------------
create or replace function public.gps_transition_session_v3(
  p_session_id uuid, p_action text, p_access_token text default null, p_device_id text default null
) returns public.delivery_sessions
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
  v_is_admin boolean := public.gps_is_admin();
  v_assignment_status text;
  v_revoked_at timestamptz;
begin
  if v_uid is not null then
    v_identity := v_uid;
  elsif not v_is_admin then
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select coalesce(a.operator_id, a.id) into v_identity
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_identity is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
  end if;

  select * into v_session from public.delivery_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002'; end if;

  if not v_is_admin then
    if v_session.driver_id <> v_identity or v_session.assignment_id is null then
      raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
    if p_device_id is not null and v_session.device_id is not null and v_session.device_id <> p_device_id then
      raise exception 'DEVICE_MISMATCH' using errcode = '42501';
    end if;
    if not public.gps_assignment_is_valid_v2(
      v_session.assignment_id, v_identity, v_session.campaign_id, v_session.group_id, now()
    ) then
      select status, revoked_at into v_assignment_status, v_revoked_at
        from public.operator_assignments where id = v_session.assignment_id;
      if v_assignment_status = 'revoked' or v_revoked_at is not null then
        if p_action not in ('complete', 'cancel') then
          raise exception 'ASSEGNAZIONE_REVOCATA' using errcode = '42501';
        end if;
      else
        raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_action = 'pause' and v_session.status = 'started' then
    update public.delivery_sessions set status = 'paused', paused_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'resume' and v_session.status = 'paused' then
    update public.delivery_sessions set status = 'started', paused_at = null, updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'complete' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions set status = 'completed', ended_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'cancel' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'cancelled', ended_at = coalesce(ended_at, now()), updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'closed_by_admin', v_is_admin, 'closed_at', now(),
            'previous_status', v_session.status, 'reason', 'stale_session_recovery')
      where id = p_session_id returning * into v_session;
  else
    raise exception 'TRANSIZIONE_SESSIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (operator_id, action, campaign_id, assignment_id, session_id)
  values (v_identity, 'session_' || p_action, v_session.campaign_id, v_session.assignment_id, v_session.id);
  return v_session;
end;
$$;
alter function public.gps_transition_session_v3(uuid, text, text, text) owner to postgres;
revoke all on function public.gps_transition_session_v3(uuid, text, text, text) from public;
grant execute on function public.gps_transition_session_v3(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_active_driver_session_v3
-- ---------------------------------------------------------------------------
create or replace function public.get_active_driver_session_v3(
  p_assignment_id uuid, p_access_token text default null, p_device_id text default null
) returns jsonb
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
  v_last_gps timestamptz;
begin
  if p_assignment_id is null then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;

  if v_uid is not null then
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.operator_id = v_uid;
    if not found then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;
    v_identity := v_uid;
  else
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.access_token = p_access_token;
    if not found then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  end if;

  select * into v_session from public.delivery_sessions s
    where s.assignment_id = p_assignment_id and s.driver_id = v_identity
      and s.status in ('started', 'paused')
    order by s.started_at desc nulls last, s.created_at desc limit 1;

  if not found then return jsonb_build_object('session', null); end if;

  if p_device_id is not null and v_session.device_id is not null and v_session.device_id <> p_device_id then
    return jsonb_build_object('session', null, 'blocked', 'device_mismatch');
  end if;

  select max(recorded_at) into v_last_gps from public.gps_tracking_points where session_id = v_session.id;
  return jsonb_build_object('session', to_jsonb(v_session), 'last_gps_recorded_at', v_last_gps);
end;
$$;
alter function public.get_active_driver_session_v3(uuid, text, text) owner to postgres;
revoke all on function public.get_active_driver_session_v3(uuid, text, text) from public;
grant execute on function public.get_active_driver_session_v3(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. gps_transition_zone_v3  (start/complete zona per il participant)
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
    -- NB: a differenza della v1, NON marca automaticamente "Completata" la
    -- zona precedente (una zona condivisa non e' finita perche' un operatore
    -- la lascia). Riporta solo la zona target a "In corso".
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
alter function public.gps_transition_zone_v3(uuid, text, text, uuid) owner to postgres;
revoke all on function public.gps_transition_zone_v3(uuid, text, text, uuid) from public;
grant execute on function public.gps_transition_zone_v3(uuid, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. gps_heartbeat_session_v3
-- ---------------------------------------------------------------------------
create or replace function public.gps_heartbeat_session_v3(
  p_session_id uuid, p_access_token text default null
) returns public.delivery_sessions
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
begin
  if v_uid is not null then
    v_identity := v_uid;
  else
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select coalesce(a.operator_id, a.id) into v_identity
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_identity is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
  end if;

  select * into v_session from public.delivery_sessions s
    where s.id = p_session_id and s.driver_id = v_identity
      and s.status in ('started', 'paused') and s.assignment_id is not null
      and public.gps_assignment_is_valid_v2(s.assignment_id, v_identity, s.campaign_id, s.group_id, now())
    for update;
  if not found then raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;

  update public.delivery_sessions set updated_at = now() where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;
alter function public.gps_heartbeat_session_v3(uuid, text) owner to postgres;
revoke all on function public.gps_heartbeat_session_v3(uuid, text) from public;
grant execute on function public.gps_heartbeat_session_v3(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_driver_group_tracking — supporto participant (CREATE OR REPLACE,
--    stessa firma; per un'assignment personale il comportamento e' identico:
--    coalesce(operator_id, id) = operator_id).
-- ---------------------------------------------------------------------------
create or replace function public.get_driver_group_tracking(
  p_assignment_id uuid, p_access_token text default null
) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_sessions jsonb;
  v_points jsonb;
begin
  if p_assignment_id is null then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;

  if v_uid is null then
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select * into v_assignment from public.operator_assignments
      where id = p_assignment_id and access_token = p_access_token;
    if not found then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  else
    select * into v_assignment from public.operator_assignments
      where id = p_assignment_id and operator_id = v_uid;
    if not found then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;
    v_identity := v_uid;
  end if;

  if not public.gps_assignment_is_valid_v2(
    v_assignment.id, v_identity, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_assignment.group_id is null then
    return jsonb_build_object('sessions', '[]'::jsonb, 'points', '[]'::jsonb);
  end if;

  with grp as (
    select s.id, s.status, s.started_at, s.paused_at, s.ended_at,
      (s.driver_id = v_identity) as is_self,
      -- Etichetta: nome operativo del participant (participant_label) o
      -- "Operatore N". Mai UUID, mai dati personali.
      coalesce(a.participant_label, 'Operatore ' || row_number() over (order by s.started_at asc nulls last, s.created_at asc)) as label,
      row_number() over (order by s.started_at asc nulls last, s.created_at asc) as n
    from public.delivery_sessions s
    left join public.operator_assignments a on a.id = s.assignment_id
    where s.campaign_id = v_assignment.campaign_id
      and s.group_id = v_assignment.group_id
      and s.status in ('started', 'paused', 'completed')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'status', g.status, 'started_at', g.started_at,
      'paused_at', g.paused_at, 'ended_at', g.ended_at, 'is_self', g.is_self,
      'display_label', case when g.is_self then 'Tu' else g.label end
    ) order by g.n), '[]'::jsonb)
  into v_sessions from grp g;

  select coalesce(jsonb_agg(jsonb_build_object(
      'session_id', p.session_id, 'lat', p.lat, 'lng', p.lng,
      'recorded_at', p.recorded_at, 'accuracy', p.accuracy
    ) order by p.recorded_at asc), '[]'::jsonb)
  into v_points from public.gps_tracking_points p
  where p.session_id in (
    select s.id from public.delivery_sessions s
    where s.campaign_id = v_assignment.campaign_id
      and s.group_id = v_assignment.group_id
      and s.status in ('started', 'paused', 'completed')
  );

  return jsonb_build_object('sessions', v_sessions, 'points', v_points);
end;
$$;
alter function public.get_driver_group_tracking(uuid, text) owner to postgres;
revoke all on function public.get_driver_group_tracking(uuid, text) from public;
grant execute on function public.get_driver_group_tracking(uuid, text) to anon, authenticated;

commit;
