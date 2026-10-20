-- Preserve existing results, signature, permissions and boundary definitions.
-- Materialize intermediate geographic calculations once per invocation.
CREATE OR REPLACE FUNCTION public.get_nil_breakdown_in_radius(center_lat double precision, center_lng double precision, radius_km double precision)
 RETURNS TABLE(territory_level text, nil_code text, nil_name text, municipality_code text, comune_name text, households_total integer, population_total integer, households_in_radius integer, population_in_radius integer, area_km2 numeric, density_per_km2 numeric, pct_copertura numeric, volantini_nel_raggio integer, age_0_14_pct numeric, age_65_plus_pct numeric, average_income numeric, old_age_index numeric, businesses_total integer, geometry_geojson text)
 LANGUAGE sql
 STABLE
AS $function$
  with point as (
    select st_setsrid(st_point(center_lng, center_lat), 4326)::geography as geog
  ),
  milano as materialized (
    select
      gm.municipality_code,
      gm.municipality_name,
      coalesce(gm.households_total, 0)::numeric as households_total,
      coalesce(gm.population_total, 0)::numeric as population_total,
      nullif(st_area(gm.geom::geography), 0) as municipality_m2
    from public.geo_municipalities gm
    where lower(gm.municipality_name) = 'milano'
       or gm.municipality_code = '015146'
    order by case when gm.municipality_code = '015146' then 0 else 1 end
    limit 1
  ),
  candidates as materialized (
    select
      n.*,
      st_area(n.geom::geography) as nil_m2,
      st_area(st_intersection(n.geom, st_buffer((select geog from point), greatest(radius_km, 0) * 1000)::geometry)::geography) as intersection_m2
    from public.geo_nil_milano n
    where n.geom is not null
      and st_dwithin(n.geom::geography, (select geog from point), greatest(radius_km, 0) * 1000)
  ),
  enriched as materialized (
    select
      c.*,
      m.municipality_code,
      m.municipality_name,
      coalesce(c.nil_m2 / nullif(m.municipality_m2, 0), 0) as nil_city_ratio,
      coalesce(c.intersection_m2 / nullif(c.nil_m2, 0), 0) as nil_radius_ratio,
      m.households_total,
      m.population_total
    from candidates c
    cross join milano m
    where c.intersection_m2 > 0
  )
  select
    'nil'::text as territory_level,
    e.nil_code,
    e.nil_name,
    e.municipality_code,
    e.municipality_name as comune_name,
    greatest(0, round(e.households_total * e.nil_city_ratio))::integer as households_total,
    greatest(0, round(e.population_total * e.nil_city_ratio))::integer as population_total,
    greatest(0, round(e.households_total * e.nil_city_ratio * e.nil_radius_ratio))::integer as households_in_radius,
    greatest(0, round(e.population_total * e.nil_city_ratio * e.nil_radius_ratio))::integer as population_in_radius,
    round((e.nil_m2 / 1000000.0)::numeric, 3) as area_km2,
    case
      when e.nil_m2 > 0 then round((e.population_total * e.nil_city_ratio / (e.nil_m2 / 1000000.0))::numeric, 2)
      else null
    end as density_per_km2,
    least(100, greatest(1, round((e.nil_radius_ratio * 100)::numeric, 2))) as pct_copertura,
    greatest(0, round(e.households_total * e.nil_city_ratio * e.nil_radius_ratio * 1.1))::integer as volantini_nel_raggio,
    di.age_0_14_pct,
    di.age_65_plus_pct,
    di.average_income,
    di.old_age_index,
    di.businesses_total,
    st_asgeojson(st_simplifypreservetopology(e.geom, 0.00007)) as geometry_geojson
  from enriched e
  left join public.demographic_indicators di
    on di.municipality_code = e.municipality_code
  order by e.geom <-> st_setsrid(st_point(center_lng, center_lat), 4326);
$function$
