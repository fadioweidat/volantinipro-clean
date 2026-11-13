-- Milano: famiglie e abitanti dei NIL riproporzionati sul dato ISTAT del comune.
--
-- PROPOSTA, NON APPLICATA. Va applicata solo dalla sessione database autorizzata,
-- dopo l'OK esplicito di Fadi, salvando prima la definizione attuale:
--   select pg_get_functiondef('public.get_nil_breakdown_in_radius(double precision,double precision,double precision)'::regprocedure);
-- Rollback: supabase/migrations_pending_approval/20261113180000_milano_nil_istat_normalized_shares.rollback.sql
-- Al momento dell'OK: spostare in supabase/migrations/ (e il rollback in supabase/migrations/rollback/).
--
-- Prima: quota NIL = area(NIL) / area(comune ISTAT). I confini NIL (PGT 2030)
-- superano il confine ISTAT, quindi la somma degli 88 NIL era 744.299 famiglie
-- (1.370.130 abitanti) invece di 741.887 (1.365.698).
-- Dopo: quota NIL = area(NIL) / somma aree dei NIL, poi parti intere con il
-- metodo del resto maggiore sugli 88 NIL interi (parita': nil_code), cosi' la
-- somma e' ESATTAMENTE households_total / population_total di geo_municipalities
-- (015146). Stessa firma, stesse colonne, stesso ordine, stessa geometria
-- restituita; cambiano solo i valori di famiglie/abitanti/volantini/densita'.
-- La quota dentro il raggio (area intersecata / area NIL) non cambia.

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
      coalesce(gm.population_total, 0)::numeric as population_total
    from public.geo_municipalities gm
    where lower(gm.municipality_name) = 'milano'
       or gm.municipality_code = '015146'
    order by case when gm.municipality_code = '015146' then 0 else 1 end
    limit 1
  ),
  -- Quote di TUTTI i NIL (non solo quelli nel raggio): il resto maggiore deve
  -- essere lo stesso per ogni richiesta, altrimenti un raggio parziale non torna.
  all_nil as materialized (
    select n.nil_code, st_area(n.geom::geography) as nil_m2
    from public.geo_nil_milano n
    where n.geom is not null
  ),
  exact as materialized (
    select
      a.nil_code,
      m.households_total * a.nil_m2 / nullif(sum(a.nil_m2) over (), 0) as hh_exact,
      m.population_total * a.nil_m2 / nullif(sum(a.nil_m2) over (), 0) as pop_exact
    from all_nil a
    cross join milano m
  ),
  floored as materialized (
    select e.*, floor(e.hh_exact) as hh_floor, floor(e.pop_exact) as pop_floor
    from exact e
  ),
  leftover as materialized (
    select
      (select households_total from milano) - sum(f.hh_floor) as hh_left,
      (select population_total from milano) - sum(f.pop_floor) as pop_left
    from floored f
  ),
  ranked as materialized (
    select
      f.*,
      row_number() over (order by f.hh_exact - f.hh_floor desc, f.nil_code) as hh_rank,
      row_number() over (order by f.pop_exact - f.pop_floor desc, f.nil_code) as pop_rank
    from floored f
  ),
  nil_istat as materialized (
    select
      r.nil_code,
      (r.hh_floor + case when r.hh_rank <= (select hh_left from leftover) then 1 else 0 end)::numeric as nil_households,
      (r.pop_floor + case when r.pop_rank <= (select pop_left from leftover) then 1 else 0 end)::numeric as nil_population
    from ranked r
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
      coalesce(c.intersection_m2 / nullif(c.nil_m2, 0), 0) as nil_radius_ratio,
      coalesce(ni.nil_households, 0) as nil_households,
      coalesce(ni.nil_population, 0) as nil_population
    from candidates c
    cross join milano m
    left join nil_istat ni on ni.nil_code = c.nil_code
    where c.intersection_m2 > 0
  )
  select
    'nil'::text as territory_level,
    e.nil_code,
    e.nil_name,
    e.municipality_code,
    e.municipality_name as comune_name,
    greatest(0, e.nil_households)::integer as households_total,
    greatest(0, e.nil_population)::integer as population_total,
    greatest(0, round(e.nil_households * e.nil_radius_ratio))::integer as households_in_radius,
    greatest(0, round(e.nil_population * e.nil_radius_ratio))::integer as population_in_radius,
    round((e.nil_m2 / 1000000.0)::numeric, 3) as area_km2,
    case
      when e.nil_m2 > 0 then round((e.nil_population / (e.nil_m2 / 1000000.0))::numeric, 2)
      else null
    end as density_per_km2,
    least(100, greatest(1, round((e.nil_radius_ratio * 100)::numeric, 2))) as pct_copertura,
    greatest(0, round(e.nil_households * e.nil_radius_ratio * 1.1))::integer as volantini_nel_raggio,
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
$function$;

-- Permessi invariati: CREATE OR REPLACE conserva owner e GRANT esistenti.
