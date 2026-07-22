begin;

-- GPS-4G: make the existing GPS RLS policies reachable by authenticated users
-- and fix INSERT ownership checks that must compare the delivery session
-- campaign with the new row campaign.
--
-- This migration intentionally does not add service_role grants. Browser GPS
-- workflows must use the existing authenticated Supabase client only.

alter table public.delivery_sessions enable row level security;
alter table public.gps_tracking_points enable row level security;
alter table public.proof_photos enable row level security;

revoke all on table public.delivery_sessions from anon;
revoke all on table public.gps_tracking_points from anon;
revoke all on table public.proof_photos from anon;

revoke all on table public.delivery_sessions from authenticated;
revoke all on table public.gps_tracking_points from authenticated;
revoke all on table public.proof_photos from authenticated;

drop policy if exists delivery_sessions_select_policy on public.delivery_sessions;
create policy delivery_sessions_select_policy
on public.delivery_sessions
for select
to authenticated
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
  or public.current_user_owns_campaign(campaign_id)
);

drop policy if exists delivery_sessions_insert_driver on public.delivery_sessions;
create policy delivery_sessions_insert_driver
on public.delivery_sessions
for insert
to authenticated
with check (driver_id = auth.uid());

drop policy if exists delivery_sessions_update_driver on public.delivery_sessions;
create policy delivery_sessions_update_driver
on public.delivery_sessions
for update
to authenticated
using (public.jwt_is_admin() or driver_id = auth.uid())
with check (public.jwt_is_admin() or driver_id = auth.uid());

drop policy if exists gps_tracking_points_select_policy on public.gps_tracking_points;
create policy gps_tracking_points_select_policy
on public.gps_tracking_points
for select
to authenticated
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
  or public.current_user_owns_campaign(campaign_id)
);

drop policy if exists gps_tracking_points_insert_driver on public.gps_tracking_points;
create policy gps_tracking_points_insert_driver
on public.gps_tracking_points
for insert
to authenticated
with check (
  driver_id = auth.uid()
  and exists (
    select 1
    from public.delivery_sessions s
    where s.id = gps_tracking_points.session_id
      and s.campaign_id = gps_tracking_points.campaign_id
      and s.driver_id = auth.uid()
      and s.status in ('started', 'paused')
  )
);

drop policy if exists proof_photos_select_policy on public.proof_photos;
create policy proof_photos_select_policy
on public.proof_photos
for select
to authenticated
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
  or public.current_user_owns_campaign(campaign_id)
);

drop policy if exists proof_photos_insert_driver on public.proof_photos;
create policy proof_photos_insert_driver
on public.proof_photos
for insert
to authenticated
with check (
  driver_id = auth.uid()
  and (
    session_id is null
    or exists (
      select 1
      from public.delivery_sessions s
      where s.id = proof_photos.session_id
        and s.campaign_id = proof_photos.campaign_id
        and s.driver_id = auth.uid()
    )
  )
);

grant select, insert, update on table public.delivery_sessions to authenticated;
grant select, insert on table public.gps_tracking_points to authenticated;
grant select, insert on table public.proof_photos to authenticated;

commit;
