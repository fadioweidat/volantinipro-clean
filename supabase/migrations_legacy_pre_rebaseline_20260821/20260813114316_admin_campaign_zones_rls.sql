-- Admin AssignWork must be able to read and update structured campaign zones.
-- Owner policies remain unchanged; gps_is_admin() is the existing Admin gate.
drop policy if exists campaign_zones_admin_select on public.campaign_zones;
create policy campaign_zones_admin_select
on public.campaign_zones
for select
to authenticated
using ((select public.gps_is_admin()));

drop policy if exists campaign_zones_admin_update on public.campaign_zones;
create policy campaign_zones_admin_update
on public.campaign_zones
for update
to authenticated
using ((select public.gps_is_admin()))
with check ((select public.gps_is_admin()));
