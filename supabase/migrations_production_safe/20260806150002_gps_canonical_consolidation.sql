begin;

-- DEPLOY-PLAN-3 — Production-safe GPS schema, step 2 of 4 (canonical consolidation).
-- Requires step 1 (20260806150001) to have run first: the columns/tables it
-- adds are referenced directly below.
--
-- IMPORTANT schema difference vs the local development migrations, verified
-- via direct read-only introspection on 2026-08-06: the remote
-- public.campaign_zones table does NOT have a `geometry` PostGIS column
-- (only `polygon_geojson jsonb` + `center_lat`/`center_lng`/`radius_m`).
-- The zone-geometry resolution below uses only these two fallbacks, unlike
-- the 3-tier fallback in the local-only migration chain.

-- ============================================================
-- 1) effective_percent: convert from GENERATED ALWAYS (the original
--    202607230001 formula: manual_percent if override else automatic_percent)
--    to a plain column with a single canonical writer. Existing values
--    copied first — on the verified 0-row baseline this changes nothing,
--    but the copy-before-drop order makes this safe even if rows exist by
--    the time this actually runs.
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
    if not exists (select 1 from pg_constraint where conname = 'campaign_zone_progress_effective_percent_range') then
      alter table public.campaign_zone_progress
        add constraint campaign_zone_progress_effective_percent_range
        check (effective_percent is null or (effective_percent >= 0 and effective_percent <= 100));
    end if;
  end if;
end $$;

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

drop trigger if exists set_campaign_zone_progress_effective_percent_legacy on public.campaign_zone_progress;
create trigger set_campaign_zone_progress_effective_percent_legacy
before insert or update on public.campaign_zone_progress
for each row execute function public.set_campaign_zone_progress_effective_percent_legacy();

-- ============================================================
-- 2) Canonical per-zone calculation engine. Zone geometry resolved only from
--    polygon_geojson or center_lat/center_lng/radius_m (verified remote
--    schema, no `geometry` column on campaign_zones).
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

  if v_zone.polygon_geojson is not null then
    v_total_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_zone.polygon_geojson::text), 4326));
  elsif v_zone.center_lat is not null and v_zone.center_lng is not null and v_zone.radius_m is not null then
    v_total_geom := public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(v_zone.center_lng::double precision, v_zone.center_lat::double precision), 4326)::public.geography, v_zone.radius_m)::public.geometry);
  else
    return pg_catalog.jsonb_build_object(
      'campaign_zone_id', p_campaign_zone_id, 'campaign_id', v_campaign_id,
      'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null, 'manual_coverage_pct', null,
      'inaccessible_area_pct', null, 'final_operational_coverage_pct', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (select id from public.delivery_sessions where campaign_zone_id = p_campaign_zone_id)
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
  where zone_id = p_campaign_zone_id and revoked_at is null and adjustment_type in ('manual_covered', 'partially_covered');

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
  where zone_id = p_campaign_zone_id and revoked_at is null and adjustment_type = 'inaccessible';

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
    'campaign_zone_id', p_campaign_zone_id, 'campaign_id', v_campaign_id,
    'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct', case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct', case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id, 'calculation_status', 'calculation_failed', 'reason_not_calculable', SQLERRM
  );
end;
$$;

create or replace function public.calculate_campaign_final_coverage(
  p_campaign_id uuid
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
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geom))
  into v_total_geom
  from (
    select
      case
        when z.polygon_geojson is not null then
          public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(z.polygon_geojson::text), 4326))
        when z.center_lat is not null and z.center_lng is not null and z.radius_m is not null then
          public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(z.center_lng::double precision, z.center_lat::double precision), 4326)::public.geography, z.radius_m)::public.geometry)
        else null
      end as geom
    from public.campaign_zones z
    where z.campaign_id = p_campaign_id
  ) zones
  where geom is not null;

  if v_total_geom is null then
    return pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id, 'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null, 'manual_coverage_pct', null, 'inaccessible_area_pct', null, 'final_operational_coverage_pct', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (select id from public.delivery_sessions where campaign_id = p_campaign_id)
    and lat != 0 and lng != 0 and (accuracy is null or accuracy <= 65)
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
  where campaign_id = p_campaign_id and revoked_at is null and adjustment_type in ('manual_covered', 'partially_covered');

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
  where campaign_id = p_campaign_id and revoked_at is null and adjustment_type = 'inaccessible';

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
    'campaign_id', p_campaign_id, 'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct', case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct', case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end
  );
end;
$$;

-- ============================================================
-- 3) Coverage adjustment RPCs (create/update/revoke), identical in behaviour
--    to the local 20260806000001 chain.
-- ============================================================
create or replace function public.admin_create_coverage_adjustment(
  p_campaign_id uuid, p_zone_id uuid, p_adjustment_type text,
  p_geometry_geojson jsonb, p_reason text, p_notes text default null, p_metadata jsonb default '{}'::jsonb
)
returns public.campaign_coverage_adjustments
language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;
  if p_geometry_geojson is null then
    raise exception 'GEOMETRIA_OBBLIGATORIA' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
  if v_geom is null or public.ST_IsEmpty(v_geom) or public.GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
    raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
  end if;
  if public.GeometryType(v_geom) = 'MULTIPOLYGON' then
    if public.ST_NumGeometries(v_geom) <> 1 then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    v_geom := public.ST_GeometryN(v_geom, 1);
  end if;

  insert into public.campaign_coverage_adjustments (campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by)
  values (p_campaign_id, p_zone_id, p_adjustment_type, v_geom, btrim(p_reason), nullif(btrim(p_notes), ''), coalesce(p_metadata, '{}'::jsonb), v_uid)
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'created', v_new.adjustment_type, v_new.reason, v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$$;

create or replace function public.admin_update_coverage_adjustment(
  p_adjustment_id uuid, p_adjustment_type text, p_geometry_geojson jsonb,
  p_reason text, p_notes text default null, p_metadata jsonb default null
)
returns public.campaign_coverage_adjustments
language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old from public.campaign_coverage_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;

  if p_geometry_geojson is not null then
    v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
    if v_geom is null or public.ST_IsEmpty(v_geom) or public.GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    if public.GeometryType(v_geom) = 'MULTIPOLYGON' then
      if public.ST_NumGeometries(v_geom) <> 1 then
        raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
      end if;
      v_geom := public.ST_GeometryN(v_geom, 1);
    end if;
  else
    v_geom := v_old.geometry;
  end if;

  update public.campaign_coverage_adjustments
  set adjustment_type = p_adjustment_type, geometry = v_geom, reason = btrim(p_reason),
      notes = nullif(btrim(p_notes), ''), metadata = coalesce(p_metadata, metadata), updated_by = v_uid, updated_at = now()
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'updated', v_new.adjustment_type, v_new.reason, v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$$;

create or replace function public.admin_revoke_coverage_adjustment(
  p_adjustment_id uuid, p_reason text
)
returns public.campaign_coverage_adjustments
language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old from public.campaign_coverage_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;

  update public.campaign_coverage_adjustments
  set revoked_at = now(), revoked_by = v_uid, revoke_reason = btrim(p_reason), updated_by = v_uid, updated_at = now()
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'revoked', v_new.adjustment_type, btrim(p_reason), v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$$;

create or replace function public.get_campaign_coverage_adjustments(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_is_driver boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    select exists (
      select 1 from public.operator_assignments a
      where a.campaign_id = p_campaign_id and a.operator_id = v_uid and a.status = 'active' and a.revoked_at is null
    ) into v_is_driver;
  end if;
  if not v_is_admin and not v_is_owner and not v_is_driver then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case when v_is_admin then
      jsonb_build_object('id', a.id, 'campaign_id', a.campaign_id, 'zone_id', a.zone_id, 'adjustment_type', a.adjustment_type,
        'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb, 'reason', a.reason, 'notes', a.notes, 'metadata', a.metadata,
        'created_by', a.created_by, 'created_at', a.created_at, 'updated_at', a.updated_at, 'updated_by', a.updated_by,
        'revoked_at', a.revoked_at, 'revoked_by', a.revoked_by, 'revoke_reason', a.revoke_reason)
    else
      jsonb_build_object('id', a.id, 'campaign_id', a.campaign_id, 'zone_id', a.zone_id, 'adjustment_type', a.adjustment_type,
        'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb, 'updated_at', a.updated_at)
    end order by a.created_at
  ), '[]'::jsonb)
  into v_result
  from public.campaign_coverage_adjustments a
  where a.campaign_id = p_campaign_id and (v_is_admin or a.revoked_at is null);

  return v_result;
end;
$$;

-- ============================================================
-- 4) Cache sync trigger + legacy RPC guard (identical behaviour to the local
--    chain — 6-arg admin_set_zone_manual_progress, geometric-zone guard).
--    The remote currently has the ORIGINAL 3-arg / 2-arg signatures from
--    202607230001 — these must be dropped explicitly before recreating with
--    the new signature (CREATE OR REPLACE cannot change parameter count).
-- ============================================================
create or replace function public.sync_campaign_zone_progress_cache(p_campaign_zone_id uuid, p_changed_by uuid)
returns void
language plpgsql security definer set search_path to '' as $$
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

  select * into v_latest_active from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null order by updated_at desc limit 1;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, automatic_percent, manual_percent, inaccessible_percent, effective_percent,
    adjustment_type, manual_override_enabled, override_reason, notes, calculation_version, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'geometric',
    (v_calc->>'gps_coverage_pct')::numeric,
    case when v_latest_active.id is not null then (v_calc->>'manual_coverage_pct')::numeric else null end,
    (v_calc->>'inaccessible_area_pct')::numeric,
    (v_calc->>'final_operational_coverage_pct')::numeric,
    v_latest_active.adjustment_type, v_latest_active.id is not null, v_latest_active.reason, v_latest_active.notes,
    'zone-progress-geometric-v1', p_changed_by, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'geometric', automatic_percent = excluded.automatic_percent, manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent, effective_percent = excluded.effective_percent,
        adjustment_type = excluded.adjustment_type, manual_override_enabled = excluded.manual_override_enabled,
        override_reason = excluded.override_reason, notes = excluded.notes, calculation_version = excluded.calculation_version,
        updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'geometric_sync',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes,
    coalesce('Sincronizzazione automatica da correzione geometrica: ' || coalesce(v_latest_active.reason, 'nessuna correzione attiva'), 'Sincronizzazione automatica'),
    v_calc, 'zone-progress-geometric-v1', p_changed_by
  );
end;
$$;

revoke all on function public.sync_campaign_zone_progress_cache(uuid, uuid) from public, anon, authenticated;

create or replace function public.campaign_coverage_adjustments_sync_trigger()
returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.zone_id is not null then
    perform public.sync_campaign_zone_progress_cache(new.zone_id, coalesce(new.updated_by, new.created_by));
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_coverage_adjustments_sync_zone_cache on public.campaign_coverage_adjustments;
create trigger campaign_coverage_adjustments_sync_zone_cache
after insert or update on public.campaign_coverage_adjustments
for each row execute function public.campaign_coverage_adjustments_sync_trigger();

-- Drop the ORIGINAL 202607230001 signatures before recreating with the new
-- 6-arg / same-2-arg-but-guarded signature — required because remote still
-- has the original 3-arg admin_set_zone_manual_progress (verified).
drop function if exists public.admin_set_zone_manual_progress(uuid, numeric, text);
drop function if exists public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text);

create or replace function public.admin_set_zone_manual_progress(
  p_campaign_zone_id uuid, p_adjustment_type text, p_manual_percent numeric,
  p_inaccessible_percent numeric, p_reason text, p_notes text
)
returns public.campaign_zone_progress
language plpgsql security definer set search_path to '' as $$
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
    set source = 'legacy', adjustment_type = excluded.adjustment_type, manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent, manual_override_enabled = true,
        override_reason = excluded.override_reason, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
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

drop function if exists public.admin_clear_zone_manual_progress(uuid, text);

create or replace function public.admin_clear_zone_manual_progress(
  p_campaign_zone_id uuid, p_reason text
)
returns public.campaign_zone_progress
language plpgsql security definer set search_path to '' as $$
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
    set source = 'legacy', adjustment_type = null, manual_percent = null, inaccessible_percent = null,
        manual_override_enabled = false, override_reason = null, notes = null, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
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

-- get_campaign_zone_progress: same 1-arg signature as remote already has, so
-- CREATE OR REPLACE is safe here (no drop needed) — just extends the JSON
-- payload with the new columns.
create or replace function public.get_campaign_zone_progress(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case when v_is_admin then
      jsonb_build_object('campaign_zone_id', z.id, 'campaign_id', z.campaign_id, 'zone_name', z.zone_name, 'address_label', z.address_label,
        'effective_percent', coalesce(p.effective_percent, 0), 'updated_at', p.updated_at,
        'automatic_percent', coalesce(p.automatic_percent, 0), 'manual_percent', p.manual_percent,
        'inaccessible_percent', p.inaccessible_percent, 'adjustment_type', p.adjustment_type,
        'manual_override_enabled', coalesce(p.manual_override_enabled, false), 'override_reason', p.override_reason,
        'notes', p.notes, 'source', coalesce(p.source, 'legacy'),
        'calculation_version', p.calculation_version, 'source_summary', coalesce(p.source_summary, '{}'::jsonb),
        'automatic_updated_at', p.automatic_updated_at, 'updated_by', p.updated_by)
    else
      jsonb_build_object('campaign_zone_id', z.id, 'campaign_id', z.campaign_id, 'zone_name', z.zone_name, 'address_label', z.address_label,
        'effective_percent', coalesce(p.effective_percent, 0), 'automatic_percent', coalesce(p.automatic_percent, 0),
        'manual_percent', p.manual_percent, 'inaccessible_percent', p.inaccessible_percent, 'adjustment_type', p.adjustment_type,
        'manual_override_enabled', coalesce(p.manual_override_enabled, false), 'updated_at', p.updated_at)
    end order by z.created_at, z.id
  ), '[]'::jsonb)
  into v_result
  from public.campaign_zones z
  left join public.campaign_zone_progress p on p.campaign_zone_id = z.id and p.campaign_id = z.campaign_id
  where z.campaign_id = p_campaign_id;

  return v_result;
end;
$$;

revoke all on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb) from public;
revoke all on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb) from public;
revoke all on function public.admin_revoke_coverage_adjustment(uuid, text) from public;
revoke all on function public.get_campaign_coverage_adjustments(uuid) from public;
revoke all on function public.calculate_campaign_final_coverage(uuid) from public;
revoke all on function public.calculate_zone_final_coverage(uuid) from public;
revoke all on function public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text) from public;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text) from public;
revoke all on function public.get_campaign_zone_progress(uuid) from public;

revoke all on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb) from anon;
revoke all on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb) from anon;
revoke all on function public.admin_revoke_coverage_adjustment(uuid, text) from anon;
revoke all on function public.get_campaign_coverage_adjustments(uuid) from anon;
revoke all on function public.calculate_campaign_final_coverage(uuid) from anon;
revoke all on function public.calculate_zone_final_coverage(uuid) from anon;
revoke all on function public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text) from anon;
revoke all on function public.admin_clear_zone_manual_progress(uuid, text) from anon;
revoke all on function public.get_campaign_zone_progress(uuid) from anon;

grant execute on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_revoke_coverage_adjustment(uuid, text) to authenticated, service_role;
grant execute on function public.get_campaign_coverage_adjustments(uuid) to authenticated, service_role;
grant execute on function public.calculate_campaign_final_coverage(uuid) to authenticated, service_role;
grant execute on function public.calculate_zone_final_coverage(uuid) to authenticated, service_role;
grant execute on function public.admin_set_zone_manual_progress(uuid, text, numeric, numeric, text, text) to authenticated, service_role;
grant execute on function public.admin_clear_zone_manual_progress(uuid, text) to authenticated, service_role;
grant execute on function public.get_campaign_zone_progress(uuid) to authenticated, service_role;

commit;
