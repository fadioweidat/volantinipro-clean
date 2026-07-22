begin;

create table if not exists public.operator_assignments (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operator_profiles(id) on delete restrict,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  group_id uuid,
  zone_id uuid,
  status text not null default 'active',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_assignments_status_check
    check (status in ('active', 'revoked', 'completed')),
  constraint operator_assignments_time_window_check
    check (
      ends_at is null
      or starts_at is null
      or ends_at > starts_at
    )
);

create index if not exists operator_assignments_operator_id_idx
  on public.operator_assignments (operator_id);

create index if not exists operator_assignments_campaign_id_idx
  on public.operator_assignments (campaign_id);

create index if not exists operator_assignments_status_idx
  on public.operator_assignments (status);

create index if not exists operator_assignments_validity_idx
  on public.operator_assignments (operator_id, campaign_id, status, starts_at, ends_at);

create index if not exists operator_assignments_active_scope_idx
  on public.operator_assignments (operator_id, campaign_id, group_id, zone_id)
  where status = 'active';

alter table public.operator_assignments enable row level security;

revoke all on table public.operator_assignments from anon;
revoke all on table public.operator_assignments from authenticated;

grant select, insert, update, delete on table public.operator_assignments to authenticated;

drop policy if exists operator_assignments_select_policy on public.operator_assignments;
create policy operator_assignments_select_policy
on public.operator_assignments
for select
to authenticated
using (
  public.jwt_is_admin()
  or operator_id = auth.uid()
);

drop policy if exists operator_assignments_insert_admin on public.operator_assignments;
create policy operator_assignments_insert_admin
on public.operator_assignments
for insert
to authenticated
with check (public.jwt_is_admin());

drop policy if exists operator_assignments_update_admin on public.operator_assignments;
create policy operator_assignments_update_admin
on public.operator_assignments
for update
to authenticated
using (public.jwt_is_admin())
with check (public.jwt_is_admin());

drop policy if exists operator_assignments_delete_admin on public.operator_assignments;
create policy operator_assignments_delete_admin
on public.operator_assignments
for delete
to authenticated
using (public.jwt_is_admin());

commit;
