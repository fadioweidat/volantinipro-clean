begin;

-- Read-only aggregation for the Admin daily report. It avoids transferring
-- complete GPS tracks when the UI only needs COUNT/MIN/MAX per session.
create or replace function public.admin_daily_report_telemetry(p_session_ids uuid[])
returns table (
  session_id uuid,
  gps_count bigint,
  first_gps_at timestamptz,
  last_gps_at timestamptz,
  photo_count bigint
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.gps_is_admin() then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  with requested as (
    select distinct unnest(coalesce(p_session_ids, array[]::uuid[])) as id
  ),
  gps as (
    select point.session_id,
           count(*) as gps_count,
           min(point.recorded_at) as first_gps_at,
           max(point.recorded_at) as last_gps_at
    from public.gps_tracking_points point
    join requested on requested.id = point.session_id
    group by point.session_id
  ),
  photos as (
    select photo.session_id, count(*) as photo_count
    from public.proof_photos photo
    join requested on requested.id = photo.session_id
    group by photo.session_id
  )
  select requested.id,
         coalesce(gps.gps_count, 0),
         gps.first_gps_at,
         gps.last_gps_at,
         coalesce(photos.photo_count, 0)
  from requested
  left join gps on gps.session_id = requested.id
  left join photos on photos.session_id = requested.id;
end;
$$;

revoke all on function public.admin_daily_report_telemetry(uuid[]) from public;
revoke all on function public.admin_daily_report_telemetry(uuid[]) from anon;
grant execute on function public.admin_daily_report_telemetry(uuid[]) to authenticated, service_role;

commit;
