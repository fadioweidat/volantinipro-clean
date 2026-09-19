-- Multi-device GPS for shared Driver assignment links.
-- One active GPS session per DEVICE per campaign, while multiple devices may
-- work concurrently on different zones of the same assignment.
begin;

drop index if exists public.delivery_sessions_one_active_operator_campaign_uidx;

create unique index if not exists delivery_sessions_one_active_device_campaign_uidx
on public.delivery_sessions (
  driver_id,
  campaign_id,
  coalesce(device_id, '')
)
where assignment_id is not null
  and status in ('started','paused');

create or replace function public.gps_start_session_v3(
  p_assignment_id uuid,
  p_device_id text default null,
  p_campaign_zone_id uuid default null,
  p_access_token text default null
) returns public.delivery_sessions
language plpgsql
security definer
set search_path to 'public','pg_temp'
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
  v_device_id text := nullif(btrim(p_device_id), '');
begin
  if p_access_token is not null then
    select a.* into v_assignment
    from public.operator_assignments a
    where a.id = p_assignment_id and a.access_token = p_access_token
    for update;
    if not found then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode='42501';
    end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  elsif v_uid is not null then
    select a.* into v_assignment
    from public.operator_assignments a
    where a.id = p_assignment_id and a.operator_id = v_uid
    for update;
    if not found then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode='42501';
    end if;
    v_identity := v_uid;
  else
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode='42501';
  end if;

  if not public.gps_assignment_is_valid_v2(
    v_assignment.id, v_identity, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode='42501';
  end if;

  if p_campaign_zone_id is not null and not exists (
    select 1
    from public.campaign_zones z
    where z.id = p_campaign_zone_id
      and z.campaign_id = v_assignment.campaign_id
      and z.group_id = v_assignment.group_id
      and exists (
        select 1 from public.operator_assignment_zones oaz
        where oaz.assignment_id = v_assignment.id and oaz.zone_id = z.id
      )
  ) then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode='42501';
  end if;

  -- The old zone-order guard is intentionally a no-op in the multi-zone model.
  perform public.gps_zone_start_guard(v_assignment.id, p_campaign_zone_id);

  select g.name into v_group_name
  from public.operational_groups g
  where g.id = v_assignment.group_id and g.campaign_id = v_assignment.campaign_id;

  -- Block only this device. Other devices using the same shared assignment
  -- link may hold their own active session concurrently.
  select s.* into v_blocking
  from public.delivery_sessions s
  where s.driver_id = v_identity
    and s.campaign_id = v_assignment.campaign_id
    and s.assignment_id is not null
    and s.status in ('started','paused')
    and (
      (v_device_id is not null and coalesce(s.device_id,'') = v_device_id)
      or
      (v_device_id is null)
    )
  order by s.started_at desc nulls last, s.created_at desc
  limit 1
  for update;

  if found then
    if v_blocking.status = 'paused' then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % in pausa su questo dispositivo',
        v_blocking.id using errcode='23505';
    end if;
    select greatest(
      coalesce((select max(p.recorded_at) from public.gps_tracking_points p where p.session_id=v_blocking.id), v_blocking.started_at),
      v_blocking.started_at
    ) into v_last_activity;
    v_age_seconds := extract(epoch from (now() - v_last_activity));
    if v_age_seconds <= 600 then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % attiva su questo dispositivo',
        v_blocking.id using errcode='23505';
    elsif v_age_seconds <= 14400 then
      raise exception 'ACTIVE_SESSION_EXISTS: sessione % ferma su questo dispositivo',
        v_blocking.id using errcode='23505';
    else
      raise exception 'ABANDONED_SESSION_EXISTS: sessione % inattiva su questo dispositivo',
        v_blocking.id using errcode='23505';
    end if;
  end if;

  begin
    insert into public.delivery_sessions (
      assignment_id,campaign_id,group_id,driver_id,device_id,status,
      started_at,paused_at,ended_at,metadata,updated_at,campaign_zone_id
    ) values (
      v_assignment.id,v_assignment.campaign_id,v_assignment.group_id,
      v_identity,v_device_id,'started',now(),null,null,
      jsonb_build_object(
        'source',case when v_assignment.operator_id is null then 'driver_group_participant' else 'gps_authenticated_operator' end,
        'group_id',v_assignment.group_id,
        'group_name',v_group_name,
        'campaign_zone_id',p_campaign_zone_id,
        'multi_device',true
      ),
      now(),p_campaign_zone_id
    )
    returning * into v_session;
  exception when unique_violation then
    raise exception 'SESSIONE_GIA_ATTIVA' using errcode='23505';
  end;

  if p_campaign_zone_id is not null then
    update public.campaign_zones
    set status='In corso',
        started_at=coalesce(started_at,now()),
        completed_at=null,
        updated_at=now()
    where id=p_campaign_zone_id;
  end if;

  insert into public.gps_operator_audit_log
    (operator_id,action,campaign_id,assignment_id,session_id,context)
  values (
    v_identity,'session_started',v_session.campaign_id,v_session.assignment_id,v_session.id,
    jsonb_build_object(
      'has_device_id',v_session.device_id is not null,
      'device_id',v_session.device_id,
      'campaign_zone_id',p_campaign_zone_id,
      'participant',v_assignment.operator_id is null,
      'multi_device',true
    )
  );

  return v_session;
end;
$$;

create or replace function public.get_active_driver_session_v3(
  p_assignment_id uuid,
  p_access_token text default null,
  p_device_id text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_session public.delivery_sessions%rowtype;
  v_last_gps timestamptz;
  v_device_id text := nullif(btrim(p_device_id), '');
begin
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode='42501';
  end if;

  if p_access_token is not null then
    select a.* into v_assignment
    from public.operator_assignments a
    where a.id=p_assignment_id and a.access_token=p_access_token;
    if not found then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode='42501';
    end if;
    v_identity := coalesce(v_assignment.operator_id,v_assignment.id);
  elsif v_uid is not null then
    select a.* into v_assignment
    from public.operator_assignments a
    where a.id=p_assignment_id and a.operator_id=v_uid;
    if not found then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode='42501';
    end if;
    v_identity := v_uid;
  else
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode='42501';
  end if;

  -- Device-scoped resume. A session on another phone is NOT a conflict and
  -- must not be adopted by this phone.
  select * into v_session
  from public.delivery_sessions s
  where s.assignment_id=p_assignment_id
    and s.driver_id=v_identity
    and s.status in ('started','paused')
    and (
      (v_device_id is not null and coalesce(s.device_id,'')=v_device_id)
      or
      (v_device_id is null)
    )
  order by s.started_at desc nulls last,s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('session',null);
  end if;

  select max(recorded_at) into v_last_gps
  from public.gps_tracking_points
  where session_id=v_session.id;

  return jsonb_build_object(
    'session',to_jsonb(v_session),
    'last_gps_recorded_at',v_last_gps
  );
end;
$$;

-- Completing a device-owned GPS session manually also completes that session's
-- zone. This is the explicit Driver "Termina zona" action; there is no
-- automatic completion at 80/90/100% coverage.
create or replace function public.gps_transition_session_v3(
  p_session_id uuid,
  p_action text,
  p_access_token text default null,
  p_device_id text default null
) returns public.delivery_sessions
language plpgsql
security definer
set search_path to ''
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
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode='42501';
    end if;
    select coalesce(a.operator_id,a.id) into v_identity
    from public.delivery_sessions s
    join public.operator_assignments a on a.id=s.assignment_id
    where s.id=p_session_id and a.access_token=p_access_token;
    if v_identity is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode='42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions
  where id=p_session_id
  for update;
  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode='P0002';
  end if;

  if not v_is_admin then
    if v_session.driver_id<>v_identity or v_session.assignment_id is null then
      raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode='42501';
    end if;
    if p_device_id is not null and v_session.device_id is not null and v_session.device_id<>p_device_id then
      raise exception 'DEVICE_MISMATCH' using errcode='42501';
    end if;
    if not public.gps_assignment_is_valid_v2(
      v_session.assignment_id,v_identity,v_session.campaign_id,v_session.group_id,now()
    ) then
      select status,revoked_at into v_assignment_status,v_revoked_at
      from public.operator_assignments
      where id=v_session.assignment_id;
      if v_assignment_status='revoked' or v_revoked_at is not null then
        if p_action not in ('complete','cancel') then
          raise exception 'ASSEGNAZIONE_REVOCATA' using errcode='42501';
        end if;
      else
        raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode='42501';
      end if;
    end if;
  end if;

  if p_action='pause' and v_session.status='started' then
    update public.delivery_sessions
    set status='paused',paused_at=now(),updated_at=now()
    where id=p_session_id returning * into v_session;
  elsif p_action='resume' and v_session.status='paused' then
    update public.delivery_sessions
    set status='started',paused_at=null,updated_at=now()
    where id=p_session_id returning * into v_session;
  elsif p_action='complete' and v_session.status in ('started','paused') then
    update public.delivery_sessions
    set status='completed',ended_at=now(),updated_at=now()
    where id=p_session_id returning * into v_session;

    if v_session.campaign_zone_id is not null then
      update public.campaign_zones
      set status='Completata',
          completed_at=coalesce(completed_at,now()),
          updated_at=now()
      where id=v_session.campaign_zone_id;
    end if;
  elsif p_action='cancel' and v_session.status in ('started','paused') then
    update public.delivery_sessions
    set status='cancelled',
        ended_at=coalesce(ended_at,now()),
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'closed_by_admin',v_is_admin,
          'closed_at',now(),
          'previous_status',v_session.status,
          'reason','stale_session_recovery'
        )
    where id=p_session_id returning * into v_session;
  else
    raise exception 'TRANSIZIONE_SESSIONE_NON_VALIDA' using errcode='22023';
  end if;

  insert into public.gps_operator_audit_log
    (operator_id,action,campaign_id,assignment_id,session_id,context)
  values (
    v_identity,
    'session_'||p_action,
    v_session.campaign_id,
    v_session.assignment_id,
    v_session.id,
    jsonb_build_object('campaign_zone_id',v_session.campaign_zone_id,'device_id',v_session.device_id)
  );

  return v_session;
end;
$$;

commit;
