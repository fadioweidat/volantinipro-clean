-- Migration: 20260919123000_optimize_map_sectors_v2.sql
-- Purpose: Optimize get_map_sectors performance, add geography GiST index to eliminate 57014 statement timeout,
-- normalize service_type input aliases, and provide get_map_sectors_v2 with backwards-compatible get_map_sectors wrapper.

begin;

-- 1. Functional GiST indexes for geography queries on map_sectors
create index if not exists idx_map_sectors_geog
  on public.map_sectors using gist (((geometry::geography)));

create index if not exists idx_map_sectors_service_geog
  on public.map_sectors using gist (service_type, ((geometry::geography)));

-- 2. Primary function get_map_sectors_v2
create or replace function public.get_map_sectors_v2(
  p_service_type text,
  p_center_lat double precision,
  p_center_lng double precision,
  p_radius_km double precision default 5.0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_center_point geography;
  v_radius_meters double precision;
  v_service_norm text;
  v_result jsonb;
begin
  -- Validate inputs
  if p_center_lat is null or p_center_lng is null then
    return jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb);
  end if;

  -- Normalize service type aliases
  v_service_norm := lower(trim(coalesce(p_service_type, 'd2d')));
  if v_service_norm in ('door_to_door', 'door-to-door', 'residential', 'direct') then
    v_service_norm := 'd2d';
  elsif v_service_norm in ('hand_to_hand', 'hand-to-hand', 'promoter', 'street') then
    v_service_norm := 'h2h';
  elsif v_service_norm in ('business_to_business', 'business-to-business', 'business', 'business-distribution') then
    v_service_norm := 'b2b';
  end if;

  v_center_point := ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326)::geography;
  v_radius_meters := coalesce(p_radius_km, 5.0) * 1000.0;

  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(s.geometry)::jsonb,
        'properties', jsonb_build_object(
          'id', s.id,
          'municipality_code', s.municipality_code,
          'sector_number', s.sector_number,
          'sector_name', s.sector_name,
          'service_type', s.service_type
        )
      )
    ), '[]'::jsonb)
  )
  into v_result
  from public.map_sectors s
  where (s.service_type = v_service_norm or s.service_type = p_service_type)
    and ST_DWithin(s.geometry::geography, v_center_point, v_radius_meters);

  return v_result;
end;
$$;

-- 3. Compatibility wrapper get_map_sectors (delegates to get_map_sectors_v2)
create or replace function public.get_map_sectors(
  p_service_type text,
  p_center_lat double precision,
  p_center_lng double precision,
  p_radius_km double precision default 5.0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return public.get_map_sectors_v2(p_service_type, p_center_lat, p_center_lng, p_radius_km);
end;
$$;

-- 4. Permissions
grant execute on function public.get_map_sectors_v2(text, double precision, double precision, double precision) to anon, authenticated, service_role;
grant execute on function public.get_map_sectors(text, double precision, double precision, double precision) to anon, authenticated, service_role;

commit;
