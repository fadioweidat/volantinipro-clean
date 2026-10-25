-- Admin monitor read model only. No UPDATE, data backfill, RLS or driver changes.
-- Apply from integration through the database session, after release approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create schema gps_monitor_private;
revoke all on schema gps_monitor_private from public, anon, authenticated, service_role;

-- Same thresholds/last-VALID-point algorithm as src/lib/gps/pointQuality.js.
-- Count includes excluded fixes: quality filtering never deletes history.
create function gps_monitor_private.session_stats(p_session uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  p record; n bigint := 0; valid_n bigint := 0; meters double precision := 0;
  prev_lat double precision; prev_lng double precision; prev_t timestamptz;
  t timestamptz; elapsed double precision; d double precision; a double precision;
  first_t timestamptz; last_t timestamptz; latest jsonb;
begin
  for p in select id,lat,lng,accuracy,recorded_at,created_at
    from public.gps_tracking_points where session_id=p_session
    order by coalesce(recorded_at,created_at),id
  loop
    n := n+1; t := coalesce(p.recorded_at,p.created_at);
    first_t := least(first_t,t); last_t := greatest(last_t,t);
    latest := jsonb_build_object('id',p.id,'lat',p.lat,'lng',p.lng,
      'accuracy',p.accuracy,'recorded_at',p.recorded_at,'created_at',p.created_at);
    if t is null or p.lat is null or p.lng is null
      or p.lat not between -90 and 90 or p.lng not between -180 and 180
      or (p.lat=0 and p.lng=0) or p.accuracy>100 then continue; end if;
    d := 0;
    if prev_t is not null then
      a := power(sin(radians(p.lat-prev_lat)/2),2)
        + cos(radians(prev_lat))*cos(radians(p.lat))*power(sin(radians(p.lng-prev_lng)/2),2);
      a := greatest(0,least(1,a));
      d := 6371000*2*atan2(sqrt(a),sqrt(1-a));
      elapsed := extract(epoch from t-prev_t);
      if (elapsed<1 and d<1) or (elapsed>=1 and d/elapsed>45) then continue; end if;
    end if;
    meters := meters+d; valid_n := valid_n+1;
    prev_t := t; prev_lat := p.lat; prev_lng := p.lng;
  end loop;
  return jsonb_build_object('point_count',n,'valid_count',valid_n,
    'km',round((meters/1000)::numeric,2),'first_point_at',first_t,
    'last_point_at',last_t,'latest',latest);
end;
$$;
revoke all on function gps_monitor_private.session_stats(uuid) from public,anon,authenticated,service_role;

-- Date interval selects SESSION last activity, not a slice of its trace.
-- Each matching session reports ALL its fixes, including archived/test campaigns.
-- One JSON envelope avoids PostgREST max_rows truncating summaries.
create function gps_monitor_private.summaries(p_from timestamptz,p_to timestamptz,p_status text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record; stats jsonb; rows jsonb := '[]'; session_json jsonb;
begin
  if auth.uid() is null or not coalesce(public.gps_is_admin(),false) then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if p_from is not null and p_to is not null and p_from>p_to then
    raise exception 'Invalid date interval' using errcode='22023'; end if;
  if p_status is null or p_status not in ('all_history','all','started','paused','completed','cancelled','history','live') then
    raise exception 'Invalid session status' using errcode='22023'; end if;
  for r in
    select s.*,coalesce(nullif(c.campaign_name,''),nullif(c.title,''),c.id::text) campaign_label,
      coalesce(nullif(s.driver_name,''),nullif(op.display_name,''),nullif(oa.participant_label,''),
        nullif(s.metadata->>'driver_name',''),nullif(s.metadata->>'driverName','')) operator_label,
      g.name group_label,
      coalesce(pt.last_at,s.updated_at,s.ended_at,s.paused_at,s.started_at,s.created_at) activity_at
    from public.delivery_sessions s
    left join public.campaigns c on c.id=s.campaign_id
    left join public.operator_assignments oa on oa.id=s.assignment_id
    left join public.operator_profiles op on op.user_id=coalesce(oa.operator_id,s.driver_id)
    left join public.operational_groups g on g.id=s.group_id
    left join lateral (select max(coalesce(p.recorded_at,p.created_at)) last_at
      from public.gps_tracking_points p where p.session_id=s.id) pt on true
    where (p_status in ('all_history','all','history','live') or s.status=p_status)
      and (p_from is null or coalesce(pt.last_at,s.updated_at,s.ended_at,s.paused_at,s.started_at,s.created_at)>=p_from)
      and (p_to is null or coalesce(pt.last_at,s.updated_at,s.ended_at,s.paused_at,s.started_at,s.created_at)<=p_to)
      and (p_status<>'all' or (s.status not in ('completed','cancelled') and
        coalesce(pt.last_at,s.updated_at,s.ended_at,s.paused_at,s.started_at,s.created_at)>=now()-interval '24 hours'))
      and (p_status<>'live' or (s.status not in ('completed','cancelled') and pt.last_at>=now()-interval '2 minutes'))
      and (p_status<>'history' or s.status in ('completed','cancelled') or
        coalesce(pt.last_at,s.updated_at,s.ended_at,s.paused_at,s.started_at,s.created_at)<now()-interval '24 hours')
    order by activity_at desc nulls last,s.id
  loop
    stats := gps_monitor_private.session_stats(r.id);
    session_json := jsonb_build_object('id',r.id,'campaign_id',r.campaign_id,'driver_id',r.driver_id,
      'driver_name',r.operator_label,'group_id',r.group_id,'device_id',r.device_id,
      'assignment_id',r.assignment_id,'status',r.status,'started_at',r.started_at,
      'paused_at',r.paused_at,'ended_at',r.ended_at,'created_at',r.created_at,'updated_at',r.updated_at);
    rows := rows || jsonb_build_array(stats || jsonb_build_object('session',session_json,
      'activityAt',r.activity_at,'campaignName',r.campaign_label,'groupName',coalesce(r.group_label,'Senza gruppo')));
  end loop;
  return jsonb_build_object('rows',rows);
end;
$$;
revoke all on function gps_monitor_private.summaries(timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
grant usage on schema gps_monitor_private to authenticated;
grant execute on function gps_monitor_private.summaries(timestamptz,timestamptz,text) to authenticated;
create function public.gps_admin_session_summaries(
  p_from timestamptz default null,p_to timestamptz default null,p_status text default 'all_history')
returns jsonb language sql stable security invoker set search_path = '' as $$
  select gps_monitor_private.summaries(p_from,p_to,p_status);
$$;
revoke all on function public.gps_admin_session_summaries(timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.gps_admin_session_summaries(timestamptz,timestamptz,text) to authenticated;
comment on function public.gps_admin_session_summaries(timestamptz,timestamptz,text) is
  'Admin only. Whole-session summaries selected by last activity (inclusive UTC bounds). Never writes GPS data.';
commit;
