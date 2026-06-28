-- Migration 20260628_gps_monitor_admin.sql
-- Creates operational groups, assigned zones, and admin coverage corrections tables for the Admin GPS Monitor.

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- 1. Operational Groups table
create table if not exists public.operational_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  name text not null,
  lead_name text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists operational_groups_campaign_id_idx on public.operational_groups(campaign_id);

-- 2. Assigned Zones table (polygons/sectors assigned to a group or driver)
create table if not exists public.assigned_zones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  group_id uuid references public.operational_groups(id) on delete set null,
  driver_id uuid,
  label text not null,
  target_km double precision default 0,
  target_poi integer default 0,
  geom geometry(Polygon, 4326),
  created_at timestamptz default now()
);

create index if not exists assigned_zones_campaign_id_idx on public.assigned_zones(campaign_id);
create index if not exists assigned_zones_group_id_idx on public.assigned_zones(group_id);
create index if not exists assigned_zones_geom_gix on public.assigned_zones using gist (geom);

-- 3. Admin Coverage Corrections table
create table if not exists public.admin_coverage_corrections (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  group_id uuid references public.operational_groups(id) on delete set null,
  driver_id uuid,
  admin_id uuid,
  correction_type text not null check (correction_type in ('coperto_manualmente', 'da_rifare', 'impossibile', 'validato_admin')),
  reason text not null check (reason in ('GPS debole', 'zona montagna', 'strada privata', 'accesso impossibile', 'rete assente', 'operatore conferma copertura', 'verifica admin', 'altro')),
  label text not null,
  notes text,
  estimated_km double precision default 0,
  geom geometry(Geometry, 4326),
  created_at timestamptz default now()
);

create index if not exists admin_coverage_corrections_campaign_id_idx on public.admin_coverage_corrections(campaign_id);
create index if not exists admin_coverage_corrections_group_id_idx on public.admin_coverage_corrections(group_id);
create index if not exists admin_coverage_corrections_geom_gix on public.admin_coverage_corrections using gist (geom);

-- Safely add missing columns to delivery_sessions if not already present
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'delivery_sessions' and column_name = 'group_id') then
    alter table public.delivery_sessions add column group_id uuid references public.operational_groups(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'delivery_sessions' and column_name = 'driver_name') then
    alter table public.delivery_sessions add column driver_name text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'delivery_sessions' and column_name = 'updated_at') then
    alter table public.delivery_sessions add column updated_at timestamptz default now();
  end if;
end $$;

-- Enable RLS
alter table public.operational_groups enable row level security;
alter table public.assigned_zones enable row level security;
alter table public.admin_coverage_corrections enable row level security;

-- Policies for operational_groups
drop policy if exists operational_groups_select_policy on public.operational_groups;
create policy operational_groups_select_policy on public.operational_groups for select using (true);

drop policy if exists operational_groups_all_admin on public.operational_groups;
create policy operational_groups_all_admin on public.operational_groups for all using (public.jwt_is_admin()) with check (public.jwt_is_admin());

-- Policies for assigned_zones
drop policy if exists assigned_zones_select_policy on public.assigned_zones;
create policy assigned_zones_select_policy on public.assigned_zones for select using (true);

drop policy if exists assigned_zones_all_admin on public.assigned_zones;
create policy assigned_zones_all_admin on public.assigned_zones for all using (public.jwt_is_admin()) with check (public.jwt_is_admin());

-- Policies for admin_coverage_corrections
drop policy if exists admin_coverage_corrections_select_policy on public.admin_coverage_corrections;
create policy admin_coverage_corrections_select_policy on public.admin_coverage_corrections for select using (true);

drop policy if exists admin_coverage_corrections_all_admin on public.admin_coverage_corrections;
create policy admin_coverage_corrections_all_admin on public.admin_coverage_corrections for all using (public.jwt_is_admin()) with check (public.jwt_is_admin());
