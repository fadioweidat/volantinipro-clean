-- Add geometry_geojson to get_comuni_breakdown_in_radius
-- Uses ST_SimplifyPreserveTopology for clean polygons; full municipality boundary returned.
-- Requires drop+recreate because RETURNS TABLE signature changes.

drop function if exists public.get_comuni_breakdown_in_radius(double precision, double precision, double precision);

create function public.get_comuni_breakdown_in_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision
)
returns table (
  municipality_code text,
  comune_name text,
  households_total integer,
  population_total integer,
  area_km2 numeric,
  density_per_km2 numeric,
  pct_copertura numeric,
  volantini_nel_raggio integer,
  age_0_14_pct numeric,
  age_65_plus_pct numeric,
  average_income numeric,
  old_age_index numeric,
  businesses_total integer,
  geometry_geojson text
)
language sql
stable
security invoker
as $$
  with point as (
    select st_setsrid(st_point(p_lng, p_lat), 4326)::geography as geog
  ),
  candidates as (
    select
      gm.*,
      case
        when gm.geom is null then null
        else st_area(st_intersection(gm.geom, st_buffer((select geog from point), p_radius_km * 1000)::geometry)::geography)
      end as intersection_m2,
      case when gm.geom is null then null else st_area(gm.geom::geography) end as municipality_m2
    from public.geo_municipalities gm
    where gm.geom is not null
      and st_dwithin(gm.geom::geography, (select geog from point), p_radius_km * 1000)
  )
  select
    c.municipality_code,
    c.municipality_name as comune_name,
    c.households_total,
    c.population_total,
    c.area_km2,
    c.density_per_km2,
    least(100, greatest(1, round((coalesce(c.intersection_m2 / nullif(c.municipality_m2, 0), 1) * 100)::numeric, 2))) as pct_copertura,
    greatest(0, round(coalesce(c.households_total, 0) * coalesce(c.intersection_m2 / nullif(c.municipality_m2, 0), 1) * 1.1))::integer as volantini_nel_raggio,
    di.age_0_14_pct,
    di.age_65_plus_pct,
    di.average_income,
    di.old_age_index,
    di.businesses_total,
    case
      when c.geom is not null
        then st_asgeojson(st_simplifypreservetopology(c.geom, 0.0001))
      else null
    end as geometry_geojson
  from candidates c
  left join public.demographic_indicators di
    on di.municipality_code = c.municipality_code
  order by c.geom <-> st_setsrid(st_point(p_lng, p_lat), 4326);
$$;
