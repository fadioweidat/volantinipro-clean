begin;

alter table public.delivery_sessions
  add column if not exists assignment_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_sessions_assignment_id_fkey'
      and conrelid = 'public.delivery_sessions'::regclass
  ) then
    alter table public.delivery_sessions
      add constraint delivery_sessions_assignment_id_fkey
      foreign key (assignment_id)
      references public.operator_assignments(id)
      on delete restrict;
  end if;
end $$;

create index if not exists delivery_sessions_assignment_id_idx
  on public.delivery_sessions (assignment_id);

create index if not exists delivery_sessions_driver_campaign_assignment_idx
  on public.delivery_sessions (driver_id, campaign_id, assignment_id);

drop policy if exists delivery_sessions_insert_driver on public.delivery_sessions;
create policy delivery_sessions_insert_driver
on public.delivery_sessions
for insert
to authenticated
with check (
  driver_id = auth.uid()
  and assignment_id is not null
  and exists (
    select 1
    from public.operator_assignments a
    where a.id = delivery_sessions.assignment_id
      and a.operator_id = auth.uid()
      and a.campaign_id = delivery_sessions.campaign_id
      and a.status = 'active'
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at > now())
  )
);

drop policy if exists delivery_sessions_update_driver on public.delivery_sessions;
create policy delivery_sessions_update_driver
on public.delivery_sessions
for update
to authenticated
using (
  public.jwt_is_admin()
  or driver_id = auth.uid()
)
with check (
  public.jwt_is_admin()
  or (
    driver_id = auth.uid()
    and assignment_id is not null
    and exists (
      select 1
      from public.operator_assignments a
      where a.id = delivery_sessions.assignment_id
        and a.operator_id = auth.uid()
        and a.campaign_id = delivery_sessions.campaign_id
        and a.status = 'active'
        and (a.starts_at is null or a.starts_at <= now())
        and (a.ends_at is null or a.ends_at > now())
    )
  )
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
    join public.operator_assignments a
      on a.id = s.assignment_id
    where s.id = gps_tracking_points.session_id
      and s.campaign_id = gps_tracking_points.campaign_id
      and s.driver_id = auth.uid()
      and s.status in ('started', 'paused')
      and a.operator_id = auth.uid()
      and a.campaign_id = gps_tracking_points.campaign_id
      and a.status = 'active'
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at > now())
  )
);

drop policy if exists proof_photos_insert_driver on public.proof_photos;
create policy proof_photos_insert_driver
on public.proof_photos
for insert
to authenticated
with check (
  driver_id = auth.uid()
  and session_id is not null
  and exists (
    select 1
    from public.delivery_sessions s
    join public.operator_assignments a
      on a.id = s.assignment_id
    where s.id = proof_photos.session_id
      and s.campaign_id = proof_photos.campaign_id
      and s.driver_id = auth.uid()
      and s.status in ('started', 'paused')
      and a.operator_id = auth.uid()
      and a.campaign_id = proof_photos.campaign_id
      and a.status = 'active'
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at > now())
  )
);

commit;
