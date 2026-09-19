-- Multi-zone operational model supersedes the historical one-zone-at-a-time guard.
-- IMPORTANT: do not delete the earlier migration because it is already present
-- in production migration history. This forward migration neutralizes only the
-- obsolete ordering/exclusivity guard; customer issue routing changes from the
-- earlier migration remain intact.

begin;

create or replace function public.gps_zone_start_guard(
  p_assignment_id uuid,
  p_target_zone_id uuid
) returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Intentionally no-op.
  -- Zone operational state is now managed explicitly through
  -- driver_set_zone_work_status(), and multiple zones may be IN_CORSO
  -- concurrently for the same assignment.
  return;
end;
$$;

revoke all on function public.gps_zone_start_guard(uuid, uuid) from public;
grant execute on function public.gps_zone_start_guard(uuid, uuid) to anon, authenticated;

commit;
