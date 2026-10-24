-- Additive GPS backup. Existing points, functions, triggers, RLS policies and
-- session lifecycle are not rewritten. Apply only after reviewing the guide.
begin;

create table public.traccar_devices (
  device_id text primary key check (device_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  -- Personal account OR an exact assignment (also supports anonymous OPs).
  operator_id uuid references public.operator_profiles(user_id),
  assignment_id uuid references public.operator_assignments(id) on delete cascade,
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
notify pgrst, 'reload schema';
commit;
