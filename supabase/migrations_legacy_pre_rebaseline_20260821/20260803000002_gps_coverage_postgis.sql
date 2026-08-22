-- ============================================================
-- Migration: 20260803000002_gps_coverage_public.sql
-- Description: Create delivery_session_coverage table and RPC
-- for real spatial intersection of GPS tracking points with Zone
-- ============================================================

-- ============================================================
-- 1. Table: delivery_session_coverage
-- ============================================================
create table if not exists public.delivery_session_coverage (
  session_id uuid primary key references public.delivery_sessions(id) on delete cascade,
  campaign_zone_id uuid not null references public.campaign_zones(id) on delete cascade,
  coverage_percent numeric(5,2) not null,
  covered_area_m2 numeric not null,
  total_area_m2 numeric not null,
  buffer_meters numeric not null default 30,
  valid_points integer not null default 0,
  excluded_points integer not null default 0,
  calculation_status text not null,
  reason_not_calculable text,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint delivery_session_coverage_percent_range
    check (coverage_percent >= 0 and coverage_percent <= 100)
);

create index if not exists delivery_session_coverage_zone_idx on public.delivery_session_coverage using btree (campaign_zone_id);

alter table public.delivery_session_coverage enable row level security;

drop policy if exists delivery_session_coverage_select_policy on public.delivery_session_coverage;
create policy delivery_session_coverage_select_policy
on public.delivery_session_coverage
for select
using (
  public.jwt_is_admin()
  or exists (
    select 1 from public.delivery_sessions s
    where s.id = session_id and s.driver_id = auth.uid()
  )
);

-- Nessuna policy di INSERT/UPDATE: viene popolata esclusivamente via RPC SECURITY DEFINER.

-- ============================================================
-- 2. RPC: gps_calculate_zone_coverage
-- ============================================================
create or replace function public.gps_calculate_zone_coverage(
  p_session_id uuid,
  p_buffer_meters numeric default 30
) returns jsonb
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_uid uuid := auth.uid();
  v_role text := auth.role();
  v_session public.delivery_sessions%rowtype;
  v_zone public.campaign_zones%rowtype;
  v_zone_geom public.geometry;
  v_track_geom public.geometry;
  v_buffered_track public.geometry;
  v_intersection public.geometry;
  v_total_area numeric;
  v_covered_area numeric;
  v_coverage_percent numeric(5,2);
  v_valid_points integer := 0;
  v_total_points integer := 0;
  v_excluded_points integer := 0;
  v_status text;
  v_reason text := null;
  v_result jsonb;
  v_has_access boolean := false;
  v_is_admin boolean := false;
begin
  -- Controllo permessi
  v_is_admin := public.jwt_is_admin() or v_role = 'service_role';

  select * into v_session from public.delivery_sessions where id = p_session_id;
  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = '42501';
  end if;

  if v_is_admin or v_session.driver_id = v_uid then
    v_has_access := true;
  end if;

  if not v_has_access then
    v_status := 'unauthorized';
    v_reason := 'Accesso negato alla sessione specificata.';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason
    );
  end if;

  -- 1. Recupero Zona
  if v_session.campaign_zone_id is null then
    v_status := 'zone_geometry_missing';
    v_reason := 'La sessione non è associata ad alcuna campagna_zone_id';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', null,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason
    );
  end if;

  select * into v_zone from public.campaign_zones where id = v_session.campaign_zone_id;

  -- Definisci e valida la geometria della zona
  if v_zone.geometry is not null then
    v_zone_geom := public.ST_MakeValid(v_zone.geometry);
  elsif v_zone.center_lat is not null and v_zone.center_lng is not null and v_zone.radius_m is not null then
    v_zone_geom := public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(v_zone.center_lng, v_zone.center_lat), 4326)::public.geography, v_zone.radius_m)::public.geometry);
  else
    v_status := 'zone_geometry_missing';
    v_reason := 'Geometria zona non disponibile (nessun poligono, nessun centro/raggio)';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason
    );
  end if;

  -- 2. Filtro avanzato dei punti e generazione LineString
  -- Evitiamo duplicati identici e salti anomali (> 130 km/h = ~36 m/s)
  with raw_points as (
    select
      geom,
      recorded_at,
      pg_catalog.lag(recorded_at) over (order by recorded_at asc) as prev_recorded_at,
      pg_catalog.lag(geom) over (order by recorded_at asc) as prev_geom
    from public.gps_tracking_points
    where session_id = p_session_id
      and lat != 0 and lng != 0
      and (accuracy is null or accuracy <= 65)
  ),
  speed_filtered as (
    select
      geom,
      recorded_at,
      case
        when prev_recorded_at is not null and extract(epoch from (recorded_at - prev_recorded_at)) > 0
        then public.ST_Distance(geom::public.geography, prev_geom::public.geography) / extract(epoch from (recorded_at - prev_recorded_at))
        else 0
      end as speed_mps,
      public.ST_Distance(geom::public.geography, prev_geom::public.geography) as dist_from_prev
    from raw_points
    where prev_geom is null or public.ST_Distance(geom::public.geography, prev_geom::public.geography) > 0
  ),
  valid_points_cte as (
    select geom, recorded_at
    from speed_filtered
    where speed_mps <= 36.1 -- max ~130 km/h
  )
  select
    (select pg_catalog.count(*) from public.gps_tracking_points where session_id = p_session_id),
    (select pg_catalog.count(*) from valid_points_cte),
    (select public.ST_MakeLine(geom order by recorded_at asc) from valid_points_cte)
  into v_total_points, v_valid_points, v_track_geom;

  v_excluded_points := v_total_points - v_valid_points;

  if v_valid_points < 2 or v_track_geom is null or public.ST_IsEmpty(v_track_geom) then
    v_status := 'not_enough_points';
    v_reason := 'Servono almeno 2 punti GPS validi';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason,
      'valid_points', v_valid_points,
      'excluded_points', v_excluded_points
    );
  end if;

  -- 4. Operazioni Spaziali
  begin
    v_buffered_track := public.ST_MakeValid(public.ST_Buffer(v_track_geom::public.geography, p_buffer_meters)::public.geometry);
    v_buffered_track := public.ST_MakeValid(public.ST_UnaryUnion(v_buffered_track));

    if not public.ST_IsValid(v_zone_geom) then
       v_zone_geom := public.ST_MakeValid(v_zone_geom);
    end if;

    v_intersection := public.ST_Intersection(v_buffered_track, v_zone_geom);

    -- 5. Calcolo Aree
    v_total_area := public.ST_Area(v_zone_geom::public.geography);
    v_covered_area := public.ST_Area(v_intersection::public.geography);

    if v_total_area <= 0 then
      v_coverage_percent := 0;
    else
      v_coverage_percent := least(greatest((v_covered_area / v_total_area) * 100, 0), 100);
    end if;

    v_status := 'ready';

    -- 6. Persistenza
    insert into public.delivery_session_coverage (
      session_id, campaign_zone_id, coverage_percent, covered_area_m2, total_area_m2,
      buffer_meters, valid_points, excluded_points, calculation_status, calculated_at, updated_at
    ) values (
      p_session_id, v_zone.id, pg_catalog.round(v_coverage_percent, 2), pg_catalog.round(v_covered_area, 2), pg_catalog.round(v_total_area, 2),
      p_buffer_meters, v_valid_points, v_excluded_points, v_status, pg_catalog.now(), pg_catalog.now()
    )
    on conflict (session_id) do update set
      coverage_percent = excluded.coverage_percent,
      covered_area_m2 = excluded.covered_area_m2,
      total_area_m2 = excluded.total_area_m2,
      buffer_meters = excluded.buffer_meters,
      valid_points = excluded.valid_points,
      excluded_points = excluded.excluded_points,
      calculation_status = excluded.calculation_status,
      calculated_at = excluded.calculated_at,
      updated_at = pg_catalog.now();

    -- Return JSON
    v_result := pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'zone_name', v_zone.zone_name,
      'total_area_m2', pg_catalog.round(v_total_area, 2),
      'covered_area_m2', pg_catalog.round(v_covered_area, 2),
      'uncovered_area_m2', pg_catalog.round(greatest(v_total_area - v_covered_area, 0), 2),
      'coverage_percent', pg_catalog.round(v_coverage_percent, 2),
      'valid_points', v_valid_points,
      'excluded_points', v_excluded_points,
      'buffer_meters', p_buffer_meters,
      'calculated_at', pg_catalog.now(),
      'calculation_status', v_status
    );

    return v_result;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'calculation_status', 'calculation_failed',
      'reason_not_calculable', SQLERRM
    );
  end;
end;
$$;
