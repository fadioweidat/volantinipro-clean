BEGIN;

-- 1. Update public.gps_assignment_is_valid to accept null operator_id via v2 logic
CREATE OR REPLACE FUNCTION public.gps_assignment_is_valid(
  p_assignment_id uuid,
  p_operator_id uuid,
  p_campaign_id uuid,
  p_group_id uuid,
  p_at timestamp with time zone DEFAULT now()
) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  select public.gps_assignment_is_valid_v2(p_assignment_id, p_operator_id, p_campaign_id, p_group_id, p_at);
$$;

-- 2. Update validate_delivery_session_assignment trigger to use v2 validation
CREATE OR REPLACE FUNCTION public.validate_delivery_session_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.assignment_id is null then
    return new;
  end if;

  if not public.gps_assignment_is_valid_v2(
    new.assignment_id,
    new.driver_id,
    new.campaign_id,
    new.group_id,
    coalesce(new.started_at, now())
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- 3. Update gps_start_session_v3 to prioritize token authorization when provided
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
  -- 1. Token authorization first (canonical for driver WhatsApp links)
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

-- 4. Update get_active_driver_session_v3 to prioritize token authorization when provided
CREATE OR REPLACE FUNCTION public.get_active_driver_session_v3(
  p_assignment_id uuid,
  p_access_token text DEFAULT NULL::text,
  p_device_id text DEFAULT NULL::text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
  v_last_gps timestamptz;
begin
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_access_token is not null then
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.access_token = p_access_token;
    if not found then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  elsif v_uid is not null then
    select a.* into v_assignment from public.operator_assignments a
      where a.id = p_assignment_id and a.operator_id = v_uid;
    if not found then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
    v_identity := v_uid;
  else
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select * into v_session from public.delivery_sessions s
    where s.assignment_id = p_assignment_id and s.driver_id = v_identity
      and s.status in ('started', 'paused')
    order by s.started_at desc nulls last, s.created_at desc limit 1;

  if not found then
    return jsonb_build_object('session', null);
  end if;

  if p_device_id is not null and v_session.device_id is not null and v_session.device_id <> p_device_id then
    return jsonb_build_object('session', null, 'blocked', 'device_mismatch');
  end if;

  select max(recorded_at) into v_last_gps from public.gps_tracking_points where session_id = v_session.id;
  return jsonb_build_object('session', to_jsonb(v_session), 'last_gps_recorded_at', v_last_gps);
end;
$function$;

COMMIT;
