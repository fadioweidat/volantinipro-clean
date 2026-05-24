drop function if exists public.get_omi_zones_in_radius(double precision, double precision, double precision, integer, integer);

create or replace function public.get_omi_zones_in_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision,
  target_year integer default null,
  target_semester integer default null
)
returns table (
  source text,
  year integer,
  semester integer,
  municipality_name text,
  municipality_code text,
  zone_code text,
  zone_name text,
  min_value numeric,
  max_value numeric,
  typology text,
  geometry_geojson text
)
language sql
stable
security invoker
as $$
  with point as (
    select st_setsrid(st_point(center_lng, center_lat), 4326)::geography as geog
  )
  select
    z.source,
    z.year,
    z.semester,
    z.municipality_name,
    z.municipality_code,
    z.zone_code,
    z.zone_name,
    z.min_value,
    z.max_value,
    z.typology,
    case when z.geom is not null then st_asgeojson(st_simplifypreservetopology(z.geom, 0.0001)) else null end as geometry_geojson
  from public.omi_zones z
  where z.geom is not null
    and st_dwithin(z.geom::geography, (select geog from point), greatest(0, radius_km) * 1000)
    and (target_year is null or z.year = target_year)
    and (target_semester is null or z.semester = target_semester)
  order by z.year desc nulls last, z.semester desc nulls last, z.municipality_name, z.zone_code, z.typology
  limit 200;
$$;

create or replace function public.get_omi_zones_in_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision
)
returns table (
  source text,
  year integer,
  semester integer,
  municipality_name text,
  municipality_code text,
  zone_code text,
  zone_name text,
  min_value numeric,
  max_value numeric,
  typology text,
  geometry_geojson text
)
language sql
stable
security invoker
as $$
  select *
  from public.get_omi_zones_in_radius(
    center_lat => p_lat,
    center_lng => p_lng,
    radius_km => p_radius_km,
    target_year => null,
    target_semester => null
  );
$$;
