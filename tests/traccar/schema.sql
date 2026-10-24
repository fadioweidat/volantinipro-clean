-- Isolated PostgreSQL test fixture. Only columns/constraints consumed by the
-- adapter, based on the production schema inspected 2026-10-24. No real data.
-- Full PostGIS, Realtime and browser rendering require the staging pilot.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create table public.profiles(id uuid primary key,role text);
-- Test-only deterministic allowlist; production admin helpers are not changed.
create function public.is_authorized_admin_email() returns boolean language sql stable as $$ select coalesce(current_setting('request.jwt.claim.email',true)='admin@test.invalid',false) $$;
create table public.operator_profiles(user_id uuid primary key, display_name text not null default 'Operatore test', active boolean not null default true, disabled_at timestamptz);
create table public.campaigns(id uuid primary key, title text default 'Campagna test',campaign_name text,status text not null);
create table public.operational_groups(id uuid primary key, campaign_id uuid references public.campaigns, unique(id,campaign_id));
create table public.operator_assignments(
  id uuid primary key, operator_id uuid references public.operator_profiles(user_id),
  campaign_id uuid not null references public.campaigns, group_id uuid not null,
  status text not null default 'active', revoked_at timestamptz,
  starts_at timestamptz not null, ends_at timestamptz,
  participant_label text,created_at timestamptz default now(),
  foreign key(group_id,campaign_id) references public.operational_groups(id,campaign_id)
);
create table public.delivery_sessions(
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns,
  group_id uuid, assignment_id uuid references public.operator_assignments,
  driver_id uuid not null, device_id text, status text not null,
  started_at timestamptz, paused_at timestamptz, ended_at timestamptz, updated_at timestamptz,
  driver_name text,metadata jsonb default '{}'::jsonb,campaign_zone_id uuid,
  check(status in ('started','paused','completed','cancelled'))
);
create unique index delivery_sessions_one_active_device_campaign_uidx
  on public.delivery_sessions(driver_id,campaign_id,coalesce(device_id,''))
  where assignment_id is not null and status in ('started','paused');
create table public.gps_operator_audit_log(
  id bigint generated always as identity primary key,operator_id uuid,action text not null,
  campaign_id uuid,assignment_id uuid,session_id uuid,context jsonb not null default '{}',created_at timestamptz default now()
);
create table public.gps_tracking_points(
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null,
  session_id uuid not null references public.delivery_sessions on delete cascade,
  driver_id uuid not null, lat float8 not null, lng float8 not null,
  accuracy float8, speed float8, heading float8, recorded_at timestamptz not null,
  created_at timestamptz default now()
);
grant select, insert, update, delete on all tables in schema public to service_role;
