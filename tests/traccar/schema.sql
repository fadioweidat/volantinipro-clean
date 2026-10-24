-- Isolated PostgreSQL test fixture. Only columns/constraints consumed by the
-- adapter, based on the production schema inspected 2026-10-24. No real data.
-- Full PostGIS, Realtime and browser rendering require the staging pilot.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create table public.operator_profiles(user_id uuid primary key, active boolean not null default true, disabled_at timestamptz);
create table public.campaigns(id uuid primary key, status text not null);
create table public.operational_groups(id uuid primary key, campaign_id uuid references public.campaigns, unique(id,campaign_id));
create table public.operator_assignments(
  id uuid primary key, operator_id uuid references public.operator_profiles(user_id),
  campaign_id uuid not null references public.campaigns, group_id uuid not null,
  status text not null default 'active', revoked_at timestamptz,
  starts_at timestamptz not null, ends_at timestamptz,
  foreign key(group_id,campaign_id) references public.operational_groups(id,campaign_id)
);
create table public.delivery_sessions(
  id uuid primary key, campaign_id uuid not null references public.campaigns,
  group_id uuid, assignment_id uuid references public.operator_assignments,
  driver_id uuid not null, device_id text, status text not null,
  started_at timestamptz, paused_at timestamptz, ended_at timestamptz, updated_at timestamptz,
  check(status in ('started','paused','completed','cancelled'))
);
create table public.gps_tracking_points(
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null,
  session_id uuid not null references public.delivery_sessions on delete cascade,
  driver_id uuid not null, lat float8 not null, lng float8 not null,
  accuracy float8, speed float8, heading float8, recorded_at timestamptz not null,
  created_at timestamptz default now()
);
grant select, insert, update, delete on all tables in schema public to service_role;
