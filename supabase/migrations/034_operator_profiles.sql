begin;

create table if not exists public.operator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_profiles_status_check
    check (status in ('active', 'suspended', 'archived'))
);

create index if not exists operator_profiles_status_idx
  on public.operator_profiles (status);

alter table public.operator_profiles enable row level security;

revoke all on table public.operator_profiles from anon;
revoke all on table public.operator_profiles from authenticated;

grant select, insert, update, delete on table public.operator_profiles to authenticated;

drop policy if exists operator_profiles_select_policy on public.operator_profiles;
create policy operator_profiles_select_policy
on public.operator_profiles
for select
to authenticated
using (
  public.jwt_is_admin()
  or id = auth.uid()
);

drop policy if exists operator_profiles_insert_admin on public.operator_profiles;
create policy operator_profiles_insert_admin
on public.operator_profiles
for insert
to authenticated
with check (public.jwt_is_admin());

drop policy if exists operator_profiles_update_admin on public.operator_profiles;
create policy operator_profiles_update_admin
on public.operator_profiles
for update
to authenticated
using (public.jwt_is_admin())
with check (public.jwt_is_admin());

drop policy if exists operator_profiles_delete_admin on public.operator_profiles;
create policy operator_profiles_delete_admin
on public.operator_profiles
for delete
to authenticated
using (public.jwt_is_admin());

commit;
