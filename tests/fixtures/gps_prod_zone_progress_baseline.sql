-- GPS-PROD-6C-R2 local-only baseline fixture.
--
-- Purpose:
--   Recreate only the production prerequisites required by
--   202607230001_campaign_zone_progress.sql on an isolated local database.
--
-- Production ownership model reproduced here:
--   auth.users.id -> public.profiles.id -> public.campaigns.user_id
--
-- Admin model reproduced here:
--   public.gps_is_admin() allows service_role and profiles.role = 'admin'.
--   It does not allow profiles.role = 'super_admin'.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client'
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.campaign_zones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_name text,
  address_label text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.gps_is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    );
$$;

alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;

drop policy if exists fixture_campaigns_select_owner_or_admin
  on public.campaigns;

create policy fixture_campaigns_select_owner_or_admin
on public.campaigns
for select
to authenticated
using (
  user_id = auth.uid()
  or public.gps_is_admin()
);

revoke all on table public.campaigns from anon;
grant select on table public.campaigns to authenticated;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values
  (
    '10000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gps-prod-local-client-a@example.test',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gps-prod-local-client-b@example.test',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-00000000000c',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gps-prod-local-admin@example.test',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-00000000000d',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'gps-prod-local-super-admin@example.test',
    crypt('local-password', gen_salt('bf')),
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, role) values
  ('10000000-0000-0000-0000-00000000000a', 'client'),
  ('10000000-0000-0000-0000-00000000000b', 'client'),
  ('10000000-0000-0000-0000-00000000000c', 'admin'),
  ('10000000-0000-0000-0000-00000000000d', 'super_admin')
on conflict (id) do update set role = excluded.role;

insert into public.campaigns (id, user_id) values
  (
    '30000000-0000-0000-0000-00000000000a',
    '10000000-0000-0000-0000-00000000000a'
  ),
  (
    '30000000-0000-0000-0000-00000000000b',
    '10000000-0000-0000-0000-00000000000b'
  )
on conflict (id) do update set user_id = excluded.user_id;

insert into public.campaign_zones (
  id,
  campaign_id,
  zone_name,
  address_label,
  created_at
) values
  (
    '40000000-0000-0000-0000-00000000000a',
    '30000000-0000-0000-0000-00000000000a',
    'Zona A1',
    'Area sintetica A1',
    now() - interval '2 minutes'
  ),
  (
    '40000000-0000-0000-0000-00000000000b',
    '30000000-0000-0000-0000-00000000000a',
    'Zona A2',
    'Area sintetica A2',
    now() - interval '1 minute'
  ),
  (
    '40000000-0000-0000-0000-00000000000c',
    '30000000-0000-0000-0000-00000000000b',
    'Zona B1',
    'Area sintetica B1',
    now()
  )
on conflict (id) do nothing;

commit;
