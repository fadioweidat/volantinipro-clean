begin;

-- GPS-MANUAL-COVERAGE-4 — Canonical architecture consolidation.
--
-- Two independent implementations of "Admin manual coverage correction"
-- exist in this repository (see GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md
-- for the full comparison matrix and decision rationale):
--   A. campaign_zone_progress  — percent-only override, zone-level, no
--      geometry per correction (20260806000002_gps_manual_coverage_v2.sql).
--   B. campaign_coverage_adjustments — free-hand polygon per correction,
--      real PostGIS geometry, campaign- or zone-scoped
--      (20260806000001_campaign_coverage_adjustments.sql).
--
-- Decision (Option 1, as specified): campaign_coverage_adjustments becomes
-- the single source of truth for individual manual corrections.
-- campaign_zone_progress becomes a derived/cached per-zone summary, kept in
-- sync by a trigger — never written concurrently by two independent paths
-- for the same zone. Zones with no geometry keep working exactly as before
-- through the legacy percent-only RPCs (fallback, nothing removed, no data
-- lost). This migration does not delete or alter a single existing row.

create extension if not exists postgis;

-- ============================================================
-- 1) campaign_zone_progress becomes source-tagged: 'legacy' for every row
--    written by the pre-existing percent-only flow, 'geometric' for rows
--    kept in sync from campaign_coverage_adjustments. Existing rows keep
--    their real values untouched — only the new column is backfilled.
-- ============================================================
alter table public.campaign_zone_progress
  add column if not exists source text not null default 'legacy';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'campaign_zone_progress_source_check'
  ) then
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_source_check
      check (source in ('legacy', 'geometric'));
  end if;
end $$;

-- ============================================================
-- 2) effective_percent stops being a fixed-formula generated column: the
--    'geometric' path needs to store the canonical
--    final_operational_coverage_pct (which accounts for the inaccessible
--    area in the denominator — a shape the old automatic+manual generated
--    expression cannot represent). Existing computed values are copied
--    across first, so no row's effective_percent changes value here.
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaign_zone_progress'
      and column_name = 'effective_percent' and is_generated = 'ALWAYS'
  ) then
    alter table public.campaign_zone_progress add column effective_percent_migrated numeric(5,2);
    update public.campaign_zone_progress set effective_percent_migrated = effective_percent;
    alter table public.campaign_zone_progress drop column effective_percent;
    alter table public.campaign_zone_progress rename column effective_percent_migrated to effective_percent;
    alter table public.campaign_zone_progress
      add constraint campaign_zone_progress_effective_percent_range
      check (effective_percent is null or (effective_percent >= 0 and effective_percent <= 100));
  end if;
end $$;

-- Legacy write path (unchanged formula, unchanged behaviour) now sets
-- effective_percent explicitly instead of relying on a generated column,
-- so a 'legacy' zone keeps producing exactly the same number as before.
create or replace function public.set_campaign_zone_progress_effective_percent_legacy()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.source = 'legacy' then
    new.effective_percent := case
      when new.manual_override_enabled then least(100, new.automatic_percent + coalesce(new.manual_percent, 0))
      else new.automatic_percent
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists set_campaign_zone_progress_effective_percent_legacy
  on public.campaign_zone_progress;

create trigger set_campaign_zone_progress_effective_percent_legacy
before insert or update on public.campaign_zone_progress
for each row
execute function public.set_campaign_zone_progress_effective_percent_legacy();

-- ============================================================
-- 3) event_type on the history table gains one more value for the new
--    sync path. Existing rows/values are untouched.
-- ============================================================
alter table public.campaign_zone_progress_history
  drop constraint if exists campaign_zone_progress_history_event_type_check;

alter table public.campaign_zone_progress_history
  add constraint campaign_zone_progress_history_event_type_check
  check (event_type in ('automatic_recalc', 'manual_override', 'manual_clear', 'geometric_sync'));

-- ============================================================
-- 4) Canonical per-zone calculation — same engine (same union/difference
--    logic) as calculate_campaign_final_coverage, scoped to a single zone
--    instead of the whole campaign, so it can feed the per-zone cache row.
--    Only geometric adjustments explicitly tied to this zone (zone_id =
--    p_campaign_zone_id) are counted here; campaign-wide adjustments
--    (zone_id is null) are intentionally out of scope for a per-zone number
--    — they only affect calculate_campaign_final_coverage.
-- ============================================================
create or replace function public.calculate_zone_final_coverage(
  p_campaign_zone_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_campaign_id uuid;
  v_zone public.campaign_zones%rowtype;
  v_total_geom public.geometry;
  v_gps_geom public.geometry;
  v_manual_geom public.geometry;
  v_inaccessible_geom public.geometry;
  v_manual_incremental_geom public.geometry;
  v_effective_covered_geom public.geometry;
  v_total_area numeric := 0;
  v_gps_area numeric := 0;
  v_manual_area numeric := 0;
  v_inaccessible_area numeric := 0;
  v_effective_area numeric := 0;
  v_effective_total_area numeric := 0;
begin
  select * into v_zone from public.campaign_zones where id = p_campaign_zone_id;
  if not found then
    raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
  end if;
  v_campaign_id := v_zone.campaign_id;

  select exists (
    select 1 from public.campaigns c where c.id = v_campaign_id and c.user_id = v_uid
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_zone.geometry is not null then
    v_total_geom := public.ST_MakeValid(v_zone.geometry);
  elsif v_zone.polygon_geojson is not null then
    v_total_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_zone.polygon_geojson::text), 4326));
  elsif v_zone.center_lat is not null and v_zone.center_lng is not null and v_zone.radius_m is not null then
    v_total_geom := public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(v_zone.center_lng, v_zone.center_lat), 4326)::public.geography, v_zone.radius_m)::public.geometry);
  else
    return pg_catalog.jsonb_build_object(
      'campaign_zone_id', p_campaign_zone_id,
      'campaign_id', v_campaign_id,
      'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null,
      'manual_coverage_pct', null,
      'inaccessible_area_pct', null,
      'final_operational_coverage_pct', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (
    select id from public.delivery_sessions where campaign_zone_id = p_campaign_zone_id
  )
  and lat != 0 and lng != 0
  and (accuracy is null or accuracy <= 65)
  having count(*) >= 2;

  if v_gps_geom is not null and not public.ST_IsEmpty(v_gps_geom) then
    v_gps_area := public.ST_Area(v_gps_geom::public.geography);
  else
    v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_gps_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_manual_geom
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id
    and revoked_at is null
    and adjustment_type in ('manual_covered', 'partially_covered');

  if v_manual_geom is not null and not public.ST_IsEmpty(v_manual_geom) then
    v_manual_geom := public.ST_Intersection(public.ST_MakeValid(v_manual_geom), v_total_geom);
    v_manual_incremental_geom := public.ST_Difference(v_manual_geom, v_gps_geom);
    v_manual_area := public.ST_Area(v_manual_incremental_geom::public.geography);
  else
    v_manual_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_manual_incremental_geom := v_manual_geom;
    v_manual_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_inaccessible_geom
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id
    and revoked_at is null
    and adjustment_type = 'inaccessible';

  if v_inaccessible_geom is not null and not public.ST_IsEmpty(v_inaccessible_geom) then
    v_inaccessible_geom := public.ST_Intersection(public.ST_MakeValid(v_inaccessible_geom), v_total_geom);
    v_inaccessible_area := public.ST_Area(v_inaccessible_geom::public.geography);
  else
    v_inaccessible_area := 0;
  end if;

  v_effective_covered_geom := public.ST_UnaryUnion(public.ST_Collect(array[v_gps_geom, v_manual_incremental_geom]));
  if v_effective_covered_geom is not null and not public.ST_IsEmpty(v_effective_covered_geom) then
    v_effective_area := public.ST_Area(v_effective_covered_geom::public.geography);
  else
    v_effective_area := 0;
  end if;

  v_effective_total_area := greatest(v_total_area - v_inaccessible_area, 0);

  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id,
    'campaign_id', v_campaign_id,
    'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct',
      case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct',
      case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct',
      case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct',
      case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id,
    'calculation_status', 'calculation_failed',
    'reason_not_calculable', SQLERRM
  );
end;
$$;

-- ============================================================
-- 5) Cache sync: the ONLY writer of campaign_zone_progress rows tagged
--    'geometric'. Runs with definer privileges from the trigger below —
--    not exposed to any client role directly, exactly like the reasoning
--    already applied to gps_calculate_zone_coverage's own persistence step.
-- ============================================================
create or replace function public.sync_campaign_zone_progress_cache(
  p_campaign_zone_id uuid,
  p_changed_by uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_campaign_id uuid;
  v_calc jsonb;
  v_latest_active public.campaign_coverage_adjustments%rowtype;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  select campaign_id into v_campaign_id from public.campaign_zones where id = p_campaign_zone_id;
  if v_campaign_id is null then
    return;
  end if;

  v_calc := public.calculate_zone_final_coverage(p_campaign_zone_id);
  if coalesce(v_calc->>'calculation_status', '') <> 'ready' then
    return;
  end if;

  select *
  into v_latest_active
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id
    and revoked_at is null
  order by updated_at desc
  limit 1;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source,
    automatic_percent, manual_percent, inaccessible_percent, effective_percent,
    adjustment_type, manual_override_enabled, override_reason, notes,
    calculation_version, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'geometric',
    (v_calc->>'gps_coverage_pct')::numeric,
    -- La stessa colonna manual_percent porta il vincolo storico "NULL quando
    -- l'override e' disattivo": deve restare NULL se non c'e' alcuna
    -- correzione geometrica attiva su questa zona, non 0.
    case when v_latest_active.id is not null then (v_calc->>'manual_coverage_pct')::numeric else null end,
    (v_calc->>'inaccessible_area_pct')::numeric,
    (v_calc->>'final_operational_coverage_pct')::numeric,
    v_latest_active.adjustment_type,
    v_latest_active.id is not null,
    v_latest_active.reason,
    v_latest_active.notes,
    'zone-progress-geometric-v1',
    p_changed_by,
    now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'geometric',
        automatic_percent = excluded.automatic_percent,
        manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent,
        effective_percent = excluded.effective_percent,
        adjustment_type = excluded.adjustment_type,
        manual_override_enabled = excluded.manual_override_enabled,
        override_reason = excluded.override_reason,
        notes = excluded.notes,
        calculation_version = excluded.calculation_version,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id,
    campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type,
    old_automatic_percent, new_automatic_percent,
    old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent,
    old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type,
    old_inaccessible_percent, inaccessible_percent,
    old_notes, notes,
    reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'geometric_sync',
    v_old.automatic_percent, v_new.automatic_percent,
    v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent,
    v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type,
    v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes,
    coalesce('Sincronizzazione automatica da correzione geometrica: ' || coalesce(v_latest_active.reason, 'nessuna correzione attiva'), 'Sincronizzazione automatica'),
    v_calc, 'zone-progress-geometric-v1', p_changed_by
  );
end;
$$;

revoke all on function public.sync_campaign_zone_progress_cache(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- 6) Trigger: any create/update/revoke on a zone-scoped
--    campaign_coverage_adjustments row refreshes that zone's cache.
--    Campaign-wide adjustments (zone_id is null) do not touch any zone
--    cache row — by design, they are outside per-zone granularity.
-- ============================================================
create or replace function public.campaign_coverage_adjustments_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.zone_id is not null then
    perform public.sync_campaign_zone_progress_cache(new.zone_id, coalesce(new.updated_by, new.created_by));
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_coverage_adjustments_sync_zone_cache
  on public.campaign_coverage_adjustments;

create trigger campaign_coverage_adjustments_sync_zone_cache
after insert or update on public.campaign_coverage_adjustments
for each row
execute function public.campaign_coverage_adjustments_sync_trigger();

-- ============================================================
-- 7) Guard the legacy percent-only RPCs: once a zone has at least one
--    campaign_coverage_adjustments row (even revoked — the zone has
--    "moved" to the geometric engine and must not silently drift back), a
--    direct percent write is rejected with a clear, actionable error
--    instead of creating a second, disconnected number. Zones that have
--    never used geometry are completely unaffected (fallback preserved).
-- ============================================================
create or replace function public.admin_set_zone_manual_progress(
  p_campaign_zone_id uuid,
  p_adjustment_type text,
  p_manual_percent numeric,
  p_inaccessible_percent numeric,
  p_reason text,
  p_notes text
)
returns public.campaign_zone_progress
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if exists (select 1 from public.campaign_coverage_adjustments where zone_id = p_campaign_zone_id) then
    raise exception 'ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA: usa il disegno poligono in mappa per questa zona, non l''override percentuale.' using errcode = '22023';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_manual_percent is not null and (p_manual_percent < 0 or p_manual_percent > 100) then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_inaccessible_percent is not null and (p_inaccessible_percent < 0 or p_inaccessible_percent > 100) then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select z.campaign_id into v_campaign_id from public.campaign_zones z where z.id = p_campaign_zone_id;
  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id for update;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, adjustment_type, manual_percent, inaccessible_percent,
    manual_override_enabled, override_reason, notes, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'legacy', p_adjustment_type, p_manual_percent, p_inaccessible_percent,
    true, btrim(p_reason), btrim(p_notes), v_uid, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'legacy',
        adjustment_type = excluded.adjustment_type,
        manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent,
        manual_override_enabled = true,
        override_reason = excluded.override_reason,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id,
    campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type,
    old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent,
    old_notes, notes, reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'manual_override',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes, btrim(p_reason), v_new.source_summary, v_new.calculation_version, v_uid
  );

  return v_new;
end;
$$;

create or replace function public.admin_clear_zone_manual_progress(
  p_campaign_zone_id uuid,
  p_reason text
)
returns public.campaign_zone_progress
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if exists (select 1 from public.campaign_coverage_adjustments where zone_id = p_campaign_zone_id) then
    raise exception 'ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA: revoca le correzioni poligono per questa zona, non l''override percentuale.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select z.campaign_id into v_campaign_id from public.campaign_zones z where z.id = p_campaign_zone_id;
  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id for update;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, adjustment_type, manual_percent, inaccessible_percent,
    manual_override_enabled, override_reason, notes, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'legacy', null, null, null, false, null, null, v_uid, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'legacy',
        adjustment_type = null, manual_percent = null, inaccessible_percent = null,
        manual_override_enabled = false, override_reason = null, notes = null,
        updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id,
    campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type,
    old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent,
    old_notes, notes, reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'manual_clear',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes, btrim(p_reason), v_new.source_summary, v_new.calculation_version, v_uid
  );

  return v_new;
end;
$$;

revoke all on function public.calculate_zone_final_coverage(uuid) from public, anon;
grant execute on function public.calculate_zone_final_coverage(uuid) to authenticated, service_role;

commit;
