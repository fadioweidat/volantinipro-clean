begin;

-- DEPLOY-PLAN-3 — Production-safe GPS schema, step 1 of 4.
--
-- Baseline assumed (verified via direct read-only pg_catalog query against
-- the real remote database on 2026-08-06, see REMOTE_PRODUCTION_MIGRATION_MATRIX.md):
--   - public.campaign_zone_progress EXISTS with the ORIGINAL columns/generated
--     effective_percent from 202607230001_campaign_zone_progress.sql (0 rows).
--   - public.campaign_zone_progress_history EXISTS with the snapshot columns
--     from 20260724101527_campaign_zone_progress_predeploy_fixes.sql.
--   - public.campaign_coverage_adjustments and its log table DO NOT exist.
--   - The local migrations 20260806000001/000002/000003/000004 have NEVER
--     been applied to this database (confirmed: no adjustment_type/source
--     column on campaign_zone_progress).
--
-- Because campaign_zone_progress has 0 real rows on the remote database
-- (verified via COUNT(*)), this chain skips the "legacy percent-override
-- reconciliation UPDATE" that the local 20260806000002_gps_manual_coverage_v2.sql
-- performs — there is nothing to reconcile. This migration only ADDS the
-- columns/table needed by step 2 (canonical consolidation). It never touches
-- gps_tracking_points/delivery_sessions (the real GPS track), and never
-- creates a second, competing effective_percent formula.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ============================================================
-- 1) campaign_zone_progress / campaign_zone_progress_history:
--    add the columns step 2 needs, IF NOT EXISTS throughout so this file is
--    safe to replay even if partially applied.
-- ============================================================
alter table public.campaign_zone_progress
  add column if not exists adjustment_type text,
  add column if not exists inaccessible_percent numeric(5,2),
  add column if not exists notes text,
  add column if not exists source text not null default 'legacy';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_zone_progress_adjustment_type_check') then
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_adjustment_type_check
      check (adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_zone_progress_inaccessible_percent_check') then
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_inaccessible_percent_check
      check (inaccessible_percent is null or (inaccessible_percent >= 0 and inaccessible_percent <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_zone_progress_source_check') then
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_source_check
      check (source in ('legacy', 'geometric'));
  end if;
end $$;

-- Defensive-only: if this database ever gained real manual_percent rows
-- between the audit read and this migration running, reconcile them exactly
-- like the local chain does, still guarded against a second execution. On
-- the verified 0-row baseline this UPDATE matches zero rows and is a no-op.
update public.campaign_zone_progress
set manual_percent = greatest(0, manual_percent - automatic_percent),
    adjustment_type = 'partially_covered'
where manual_override_enabled = true and manual_percent is not null and adjustment_type is null;

alter table public.campaign_zone_progress_history
  add column if not exists adjustment_type text,
  add column if not exists inaccessible_percent numeric(5,2),
  add column if not exists notes text,
  add column if not exists old_adjustment_type text,
  add column if not exists old_inaccessible_percent numeric(5,2),
  add column if not exists old_notes text;

alter table public.campaign_zone_progress_history
  drop constraint if exists campaign_zone_progress_history_event_type_check;

alter table public.campaign_zone_progress_history
  add constraint campaign_zone_progress_history_event_type_check
  check (event_type in ('automatic_recalc', 'manual_override', 'manual_clear', 'geometric_sync'));

-- ============================================================
-- 2) campaign_coverage_adjustments + log — new tables, confirmed absent.
--    Identical to 20260806000001_campaign_coverage_adjustments.sql (already
--    verified correct and idempotent in this repository's local chain),
--    reproduced here under a collision-free version number.
-- ============================================================
create table if not exists public.campaign_coverage_adjustments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_id uuid references public.campaign_zones(id) on delete cascade,
  adjustment_type text not null,
  geometry public.geometry(Polygon, 4326) not null,
  reason text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,

  constraint campaign_coverage_adjustments_type_check
    check (adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible')),
  constraint campaign_coverage_adjustments_reason_required
    check (nullif(btrim(reason), '') is not null),
  constraint campaign_coverage_adjustments_geometry_valid
    check (public.ST_IsValid(geometry) and not public.ST_IsEmpty(geometry)),
  constraint campaign_coverage_adjustments_revocation_check
    check (
      (revoked_at is null and revoked_by is null)
      or (revoked_at is not null and revoked_by is not null and nullif(btrim(revoke_reason), '') is not null)
    )
);

create or replace function public.set_campaign_coverage_adjustment_zone_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_zone_campaign_id uuid;
begin
  if new.zone_id is not null then
    select z.campaign_id into v_zone_campaign_id
    from public.campaign_zones z
    where z.id = new.zone_id;

    if v_zone_campaign_id is null then
      raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
    end if;

    if v_zone_campaign_id <> new.campaign_id then
      raise exception 'ZONA_CAMPAGNA_INCOERENTE' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_campaign_coverage_adjustment_zone_guard
  on public.campaign_coverage_adjustments;

create trigger set_campaign_coverage_adjustment_zone_guard
before insert or update of zone_id, campaign_id
on public.campaign_coverage_adjustments
for each row
execute function public.set_campaign_coverage_adjustment_zone_guard();

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

drop trigger if exists set_campaign_coverage_adjustments_updated_at
  on public.campaign_coverage_adjustments;

create trigger set_campaign_coverage_adjustments_updated_at
before update on public.campaign_coverage_adjustments
for each row
execute function public.set_updated_at();

create index if not exists campaign_coverage_adjustments_campaign_id_idx
  on public.campaign_coverage_adjustments (campaign_id);
create index if not exists campaign_coverage_adjustments_zone_id_idx
  on public.campaign_coverage_adjustments (zone_id);
create index if not exists campaign_coverage_adjustments_geometry_gix
  on public.campaign_coverage_adjustments using gist (geometry);
create index if not exists campaign_coverage_adjustments_active_idx
  on public.campaign_coverage_adjustments (campaign_id)
  where revoked_at is null;

create table if not exists public.campaign_coverage_adjustments_log (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid references public.campaign_coverage_adjustments(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_id uuid,
  event_type text not null,
  adjustment_type text not null,
  reason text not null,
  notes text,
  geometry_geojson jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint campaign_coverage_adjustments_log_event_type_check
    check (event_type in ('created', 'updated', 'revoked')),
  constraint campaign_coverage_adjustments_log_reason_required
    check (nullif(btrim(reason), '') is not null)
);

create index if not exists campaign_coverage_adjustments_log_campaign_idx
  on public.campaign_coverage_adjustments_log (campaign_id, created_at desc);
create index if not exists campaign_coverage_adjustments_log_adjustment_idx
  on public.campaign_coverage_adjustments_log (adjustment_id, created_at desc);

alter table public.campaign_coverage_adjustments enable row level security;
alter table public.campaign_coverage_adjustments force row level security;
alter table public.campaign_coverage_adjustments_log enable row level security;
alter table public.campaign_coverage_adjustments_log force row level security;

revoke all on table public.campaign_coverage_adjustments from anon;
revoke all on table public.campaign_coverage_adjustments from authenticated;
revoke all on table public.campaign_coverage_adjustments_log from anon;
revoke all on table public.campaign_coverage_adjustments_log from authenticated;

grant select on table public.campaign_coverage_adjustments to authenticated;
grant select on table public.campaign_coverage_adjustments_log to authenticated;

drop policy if exists campaign_coverage_adjustments_select_admin on public.campaign_coverage_adjustments;
create policy campaign_coverage_adjustments_select_admin
on public.campaign_coverage_adjustments for select to authenticated
using (public.gps_is_admin());

drop policy if exists campaign_coverage_adjustments_select_customer on public.campaign_coverage_adjustments;
create policy campaign_coverage_adjustments_select_customer
on public.campaign_coverage_adjustments for select to authenticated
using (
  revoked_at is null
  and exists (select 1 from public.campaigns c where c.id = campaign_coverage_adjustments.campaign_id and c.user_id = auth.uid())
);

drop policy if exists campaign_coverage_adjustments_select_driver on public.campaign_coverage_adjustments;
create policy campaign_coverage_adjustments_select_driver
on public.campaign_coverage_adjustments for select to authenticated
using (
  revoked_at is null
  and exists (
    select 1 from public.operator_assignments a
    where a.campaign_id = campaign_coverage_adjustments.campaign_id
      and a.operator_id = auth.uid() and a.status = 'active' and a.revoked_at is null
  )
);

drop policy if exists campaign_coverage_adjustments_log_select_admin on public.campaign_coverage_adjustments_log;
create policy campaign_coverage_adjustments_log_select_admin
on public.campaign_coverage_adjustments_log for select to authenticated
using (public.gps_is_admin());

commit;
