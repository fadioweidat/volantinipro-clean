begin;

-- Aggregazione read-only per il report finale. Restituisce solo stato/tempi e
-- COUNT/MIN/MAX; nessuna coordinata, identita Driver o payload foto.
create or replace function public.final_distribution_report_telemetry(p_campaign_id uuid)
returns table (
  session_id uuid,
  campaign_zone_id uuid,
  status text,
  started_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
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
  if auth.uid() is null or not (
    public.gps_is_admin()
    or exists (
      select 1 from public.campaigns campaign
      where campaign.id = p_campaign_id
        and campaign.user_id = auth.uid()
    )
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  with gps as (
    select point.session_id, count(*) as gps_count,
           min(point.recorded_at) as first_gps_at,
           max(point.recorded_at) as last_gps_at
    from public.gps_tracking_points point
    join public.delivery_sessions session on session.id = point.session_id
    where session.campaign_id = p_campaign_id
    group by point.session_id
  ), photos as (
    select photo.session_id, count(*) as photo_count
    from public.proof_photos photo
    where photo.campaign_id = p_campaign_id and photo.approved_at is not null
    group by photo.session_id
  )
  select session.id, session.campaign_zone_id, session.status,
         session.started_at, session.paused_at, session.ended_at,
         coalesce(gps.gps_count, 0), gps.first_gps_at, gps.last_gps_at,
         coalesce(photos.photo_count, 0)
  from public.delivery_sessions session
  left join gps on gps.session_id = session.id
  left join photos on photos.session_id = session.id
  where session.campaign_id = p_campaign_id
  order by session.started_at nulls last, session.created_at;
end;
$$;

revoke all on function public.final_distribution_report_telemetry(uuid) from public;
revoke all on function public.final_distribution_report_telemetry(uuid) from anon;
grant execute on function public.final_distribution_report_telemetry(uuid) to authenticated, service_role;

commit;
