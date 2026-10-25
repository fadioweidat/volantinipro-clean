-- Additive GPS backup. Existing points, functions, triggers, RLS policies and
-- session lifecycle are not rewritten. Apply only after reviewing the guide.
begin;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

create table public.traccar_devices (
  device_id text primary key check (device_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  -- Personal account OR an exact assignment (also supports anonymous OPs).
  operator_id uuid references public.operator_profiles(user_id),
  assignment_id uuid references public.operator_assignments(id) on delete cascade,
  admin_session_id uuid references public.delivery_sessions(id) on delete cascade,
  vp_device_id text not null check (length(btrim(vp_device_id)) between 1 and 200),
  enabled boolean not null default false,
  enabled_from timestamptz not null,
  enabled_until timestamptz not null,
  created_at timestamptz not null default now(),
  rate_window_started_at timestamptz,
  rate_count integer not null default 0,
  constraint traccar_one_target check (num_nonnulls(operator_id, assignment_id) = 1),
  -- A stale 'started' session must not become a permanent off-duty tracker.
  constraint traccar_finite_shift check (
    enabled_until > enabled_from and enabled_until <= enabled_from + interval '24 hours'
  )
);
alter table public.traccar_devices enable row level security;
revoke all on public.traccar_devices from public, anon, authenticated;
grant select, insert, update, delete on public.traccar_devices to service_role;
comment on table public.traccar_devices is
  'Server-only Traccar allowlist. Hashes only; no plaintext device secrets. Explicit bounded shift window.';

-- Nullable: do not label or rewrite historical/raw app points.
alter table public.gps_tracking_points
  add column source text,
  add column source_event_id text,
  add column source_metadata jsonb;
create unique index gps_tracking_points_traccar_event_uidx
  on public.gps_tracking_points(source_event_id) where source = 'traccar';

create function public.traccar_ingest_point(
  p_device_id text,
  p_token_hash text,
  p_recorded_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_speed double precision default null,
  p_heading double precision default null,
  p_altitude double precision default null,
  p_battery_level double precision default null,
  p_is_charging boolean default null
) returns text
language plpgsql security invoker set search_path to ''
as $$
declare
  v_device public.traccar_devices%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_session_ids uuid[];
  v_now timestamptz;
  v_event_key text;
  v_inserted uuid;
begin
  -- Defense in depth if called directly with a server credential.
  if p_recorded_at is null or not isfinite(p_recorded_at)
    or p_lat is null or not (p_lat between -90 and 90)
    or p_lng is null or not (p_lng between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy >= 0 and p_accuracy < 'Infinity'::float8))
    or (p_speed is not null and not (p_speed >= 0 and p_speed < 'Infinity'::float8))
    or (p_heading is not null and not (p_heading between 0 and 360))
    or (p_altitude is not null and not (p_altitude > '-Infinity'::float8 and p_altitude < 'Infinity'::float8))
    or (p_battery_level is not null and not (p_battery_level between 0 and 100)) then
    return 'ignored';
  end if;

  -- Serializes concurrent retries and rate counts for this single device.
  select * into v_device from public.traccar_devices
  where device_id = p_device_id and token_hash = p_token_hash and enabled
  for update;
  if not found then return 'ignored'; end if;
  v_now := clock_timestamp();
  if not (v_now >= v_device.enabled_from and v_now < v_device.enabled_until)
    or not (p_recorded_at >= v_device.enabled_from and p_recorded_at < v_device.enabled_until)
    or p_recorded_at < v_now - interval '5 minutes'
    or p_recorded_at > v_now + interval '30 seconds' then
    return 'ignored';
  end if;

  if v_device.rate_window_started_at is null
    or v_device.rate_window_started_at <= v_now - interval '1 minute' then
    update public.traccar_devices set rate_window_started_at = v_now, rate_count = 1
    where device_id = p_device_id;
  elsif v_device.rate_count >= 120 then
    return 'ignored';
  else
    update public.traccar_devices set rate_count = rate_count + 1 where device_id = p_device_id;
  end if;

  -- Count at most two candidates: ambiguity is rejected, never resolved by
  -- choosing the most recent job or another worker's device.
  select array_agg(candidate.id) into v_session_ids from (
    select s.id
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where ((v_device.operator_id is not null and a.operator_id = v_device.operator_id)
      or (v_device.assignment_id is not null and a.id = v_device.assignment_id))
      and s.device_id = v_device.vp_device_id
      and (v_device.admin_session_id is null or s.id = v_device.admin_session_id)
      and s.driver_id = coalesce(a.operator_id, a.id)
      and s.campaign_id = a.campaign_id and s.group_id = a.group_id
      and s.status = 'started' and s.ended_at is null
      and s.started_at <= p_recorded_at
      and coalesce(s.updated_at, s.started_at) <= p_recorded_at
      and public.gps_assignment_is_valid_v2(a.id, s.driver_id, s.campaign_id, s.group_id, v_now)
      and public.gps_assignment_is_valid_v2(a.id, s.driver_id, s.campaign_id, s.group_id, p_recorded_at)
    limit 2
  ) candidate;
  if coalesce(cardinality(v_session_ids), 0) <> 1 then return 'ignored'; end if;

  -- Lock assignment before session, matching the existing start RPC's order.
  select a.* into v_assignment from public.operator_assignments a
  join public.delivery_sessions s on s.assignment_id = a.id
  where s.id = v_session_ids[1] for share of a;
  select * into v_session from public.delivery_sessions where id = v_session_ids[1] for update;
  if not found then return 'ignored'; end if;
  perform 1 from public.campaigns where id = v_session.campaign_id for share;
  if v_assignment.operator_id is not null then
    perform 1 from public.operator_profiles where user_id = v_assignment.operator_id for share;
  end if;
  -- Recheck after locks/waits: pause, stop, revoke and shift expiry must win.
  v_now := clock_timestamp();
  if v_session.status <> 'started' or v_session.ended_at is not null
    or v_session.assignment_id is distinct from v_assignment.id
    or (v_device.admin_session_id is not null and v_session.id is distinct from v_device.admin_session_id)
    or (v_device.operator_id is not null and v_assignment.operator_id is distinct from v_device.operator_id)
    or (v_device.assignment_id is not null and v_assignment.id is distinct from v_device.assignment_id)
    or v_session.device_id is distinct from v_device.vp_device_id
    or v_session.driver_id is distinct from coalesce(v_assignment.operator_id, v_assignment.id)
    or v_session.campaign_id is distinct from v_assignment.campaign_id
    or v_session.group_id is distinct from v_assignment.group_id
    or v_session.started_at is null or p_recorded_at < v_session.started_at
    or p_recorded_at < coalesce(v_session.updated_at, v_session.started_at)
    or v_now >= v_device.enabled_until
    or p_recorded_at < v_now - interval '5 minutes'
    or not public.gps_assignment_is_valid_v2(v_assignment.id, v_session.driver_id,
      v_session.campaign_id, v_session.group_id, v_now)
    or not public.gps_assignment_is_valid_v2(v_assignment.id, v_session.driver_id,
      v_session.campaign_id, v_session.group_id, p_recorded_at) then
    return 'ignored';
  end if;

  v_event_key := encode(sha256(convert_to(
    p_device_id || '|' || extract(epoch from p_recorded_at)::text || '|' || p_lat::text || '|' || p_lng::text,
    'UTF8')), 'hex');
  insert into public.gps_tracking_points (
    campaign_id, session_id, driver_id, lat, lng, accuracy, speed, heading, recorded_at,
    source, source_event_id, source_metadata
  ) values (
    v_session.campaign_id, v_session.id, v_session.driver_id,
    p_lat, p_lng, p_accuracy, p_speed, p_heading, p_recorded_at,
    'traccar', v_event_key,
    jsonb_strip_nulls(jsonb_build_object('altitude', p_altitude,
      'battery_level', p_battery_level, 'is_charging', p_is_charging))
  ) on conflict (source_event_id) where source = 'traccar' do nothing
  returning id into v_inserted;
  return case when v_inserted is null then 'duplicate' else 'stored' end;
end;
$$;
revoke all on function public.traccar_ingest_point(text,text,timestamptz,float8,float8,float8,float8,float8,float8,float8,boolean)
  from public, anon, authenticated;
grant execute on function public.traccar_ingest_point(text,text,timestamptz,float8,float8,float8,float8,float8,float8,float8,boolean)
  to service_role;
-- Privileged implementation is outside the exposed Data API schema. Public
-- wrapper uses invoker permissions, and EVERY action rechecks the existing
-- authenticated admin authorization. No existing auth/GPS RPC is replaced.
create schema traccar_private;
revoke all on schema traccar_private from public, anon;
grant usage on schema traccar_private to authenticated;

create function traccar_private.admin_control(
  p_action text, p_campaign_id uuid, p_assignment_id uuid, p_device_id text,
  p_token_hash text, p_hours integer, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_now timestamptz;
  v_until timestamptz;
  v_assignment public.operator_assignments%rowtype;
  v_device public.traccar_devices%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_device_id text;
  v_label text;
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.gps_is_admin(), false) then
    raise exception 'SOLO_ADMIN_AUTORIZZATO' using errcode = '42501';
  end if;

  if p_action = 'list' then
    select jsonb_build_object(
      'assignments', coalesce((select jsonb_agg(x) from (
        select a.id, a.campaign_id, coalesce(c.campaign_name,c.title) as campaign_title,
          coalesce(o.display_name,a.participant_label,'Operatore') as operator_label
        from public.operator_assignments a
        join public.campaigns c on c.id = a.campaign_id
        left join public.operator_profiles o on o.user_id = a.operator_id
        where public.gps_assignment_is_valid_v2(a.id,coalesce(a.operator_id,a.id),a.campaign_id,a.group_id,clock_timestamp())
        order by a.created_at desc limit 200
      ) x), '[]'::jsonb),
      'sessions', coalesce((select jsonb_agg(x) from (
        select s.id, s.campaign_id, s.assignment_id, s.status, s.started_at, s.ended_at,
          s.metadata->>'traccar_device_id' as device_id,
          coalesce(c.campaign_name,c.title) as campaign_title,
          coalesce(s.driver_name,'Operatore') as operator_label,
          d.enabled_until, coalesce(d.enabled,false) as enabled,
          (select max(p.recorded_at) from public.gps_tracking_points p where p.session_id=s.id and p.source='traccar') as last_point_at
        from public.delivery_sessions s
        join public.campaigns c on c.id=s.campaign_id
        left join public.traccar_devices d on d.admin_session_id=s.id
        where s.metadata->>'source' = 'traccar_admin_backup'
          and (s.status in ('started','paused') or s.ended_at >= clock_timestamp()-interval '1 day')
        order by s.started_at desc nulls last limit 50
      ) x), '[]'::jsonb)
    ) into v_result;
    return v_result;
  end if;

  if p_action = 'start' then
    if p_campaign_id is null or p_assignment_id is null or p_device_id is null
      or p_device_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
      or p_hours is null or p_hours < 1 or p_hours > 24 then
      raise exception 'PARAMETRI_PIANO_B_NON_VALIDI' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('traccar-admin:'||p_device_id,0));
    select * into v_device from public.traccar_devices where device_id=p_device_id for update;
    select * into v_assignment from public.operator_assignments where id=p_assignment_id for update;
    if not found or v_assignment.campaign_id <> p_campaign_id then
      raise exception 'ASSEGNAZIONE_NON_VALIDA' using errcode='22023';
    end if;
    perform 1 from public.campaigns where id=p_campaign_id for share;
    if v_assignment.operator_id is not null then
      select display_name into v_label from public.operator_profiles where user_id=v_assignment.operator_id for share;
    else
      v_label := coalesce(v_assignment.participant_label,'Operatore');
    end if;
    v_now := clock_timestamp();
    if not public.gps_assignment_is_valid_v2(v_assignment.id,coalesce(v_assignment.operator_id,v_assignment.id),
      v_assignment.campaign_id,v_assignment.group_id,v_now) then
      raise exception 'ASSEGNAZIONE_NON_ATTIVA_O_CAMPAGNA_NON_IN_CORSO' using errcode='42501';
    end if;
    if v_device.admin_session_id is not null then
      select * into v_session from public.delivery_sessions where id=v_device.admin_session_id for update;
      if found and v_session.status in ('started','paused') then
        if v_session.status='started' and v_session.assignment_id=p_assignment_id
          and v_device.token_hash=p_token_hash and v_device.enabled and v_device.enabled_until>v_now then
          return jsonb_build_object('session_id',v_session.id,'enabled_until',v_device.enabled_until,'reused',true);
        end if;
        raise exception 'SESSIONE_PIANO_B_GIA_APERTA: chiudila o rigenera il suo URL' using errcode='23505';
      end if;
    elsif v_device.device_id is not null and exists (
      select 1 from public.delivery_sessions s join public.operator_assignments a on a.id=s.assignment_id
      where s.device_id=v_device.vp_device_id and s.status in ('started','paused')
        and ((v_device.assignment_id is not null and a.id=v_device.assignment_id)
          or (v_device.operator_id is not null and a.operator_id=v_device.operator_id))
    ) then
      raise exception 'DEVICE_ID_GIA_USATO_DA_SESSIONE_APP: scegli un Device ID backup distinto' using errcode='23505';
    end if;
    v_until := least(v_now+make_interval(hours=>p_hours), coalesce(v_assignment.ends_at,'infinity'::timestamptz));
    insert into public.delivery_sessions (
      campaign_id,assignment_id,group_id,driver_id,driver_name,device_id,status,
      started_at,updated_at,metadata
    ) values (
      v_assignment.campaign_id,v_assignment.id,v_assignment.group_id,
      coalesce(v_assignment.operator_id,v_assignment.id),v_label,'traccar-backup:'||p_device_id,'started',
      v_now,v_now,jsonb_build_object('source','traccar_admin_backup','traccar_device_id',p_device_id,
        'opened_by_admin',auth.uid(),'backup_until',v_until)
    ) returning * into v_session;
    insert into public.traccar_devices (
      device_id,token_hash,assignment_id,admin_session_id,vp_device_id,enabled,enabled_from,enabled_until
    ) values (
      p_device_id,p_token_hash,v_assignment.id,v_session.id,v_session.device_id,true,v_now,v_until
    ) on conflict(device_id) do update set
      token_hash=excluded.token_hash,operator_id=null,assignment_id=excluded.assignment_id,
      admin_session_id=excluded.admin_session_id,vp_device_id=excluded.vp_device_id,
      enabled=true,enabled_from=excluded.enabled_from,enabled_until=excluded.enabled_until,
      rate_window_started_at=null,rate_count=0;
    insert into public.gps_operator_audit_log(operator_id,action,campaign_id,assignment_id,session_id,context)
    values(auth.uid(),'traccar_admin_session_started',v_session.campaign_id,v_session.assignment_id,v_session.id,
      jsonb_build_object('source','traccar','enabled_until',v_until));
    return jsonb_build_object('session_id',v_session.id,'enabled_until',v_until,'reused',false);
  end if;

  if p_action in ('close','rotate_key') then
    select * into v_session from public.delivery_sessions where id=p_session_id;
    if not found or v_session.metadata->>'source' is distinct from 'traccar_admin_backup' then
      raise exception 'SESSIONE_PIANO_B_NON_TROVATA' using errcode='42501';
    end if;
    v_device_id := v_session.metadata->>'traccar_device_id';
    perform pg_advisory_xact_lock(hashtextextended('traccar-admin:'||v_device_id,0));
    select * into v_device from public.traccar_devices where device_id=v_device_id for update;
    select * into v_session from public.delivery_sessions where id=p_session_id for update;
    if v_session.metadata->>'source' is distinct from 'traccar_admin_backup' then
      raise exception 'SESSIONE_PIANO_B_NON_TROVATA' using errcode='42501';
    end if;
    if p_action='close' then
      if v_session.status in ('started','paused') then
        -- Reuse the existing admin-aware transition; no lifecycle RPC changed.
        perform public.gps_transition_session_v3(v_session.id,'complete',null,null);
      end if;
      update public.traccar_devices set enabled=false where admin_session_id=v_session.id;
      return jsonb_build_object('session_id',v_session.id,'closed',true);
    end if;
    v_now := clock_timestamp();
    if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'CHIAVE_NON_VALIDA' using errcode='22023';
    end if;
    if v_device.admin_session_id is distinct from v_session.id or not v_device.enabled
      or v_device.enabled_until<=v_now or v_session.status<>'started' then
      raise exception 'SESSIONE_PIANO_B_NON_ATTIVA: chiudi e avvia un nuovo turno' using errcode='42501';
    end if;
    update public.traccar_devices set token_hash=p_token_hash where admin_session_id=v_session.id;
    insert into public.gps_operator_audit_log(operator_id,action,campaign_id,assignment_id,session_id,context)
    values(auth.uid(),'traccar_key_rotated',v_session.campaign_id,v_session.assignment_id,v_session.id,'{}'::jsonb);
    return jsonb_build_object('session_id',v_session.id,'enabled_until',v_device.enabled_until);
  end if;
  raise exception 'AZIONE_PIANO_B_NON_VALIDA' using errcode='22023';
end;
$$;
revoke all on function traccar_private.admin_control(text,uuid,uuid,text,text,integer,uuid) from public,anon,service_role;
grant execute on function traccar_private.admin_control(text,uuid,uuid,text,text,integer,uuid) to authenticated;

create function public.traccar_admin_control(
  p_action text, p_campaign_id uuid default null, p_assignment_id uuid default null,
  p_device_id text default null, p_token_hash text default null,
  p_hours integer default 2, p_session_id uuid default null
) returns jsonb language sql security invoker set search_path to ''
as $$ select traccar_private.admin_control(p_action,p_campaign_id,p_assignment_id,p_device_id,p_token_hash,p_hours,p_session_id); $$;
revoke all on function public.traccar_admin_control(text,uuid,uuid,text,text,integer,uuid) from public,anon,service_role;
grant execute on function public.traccar_admin_control(text,uuid,uuid,text,text,integer,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
