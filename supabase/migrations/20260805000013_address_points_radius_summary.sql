create index if not exists address_points_osm_geography_idx
  on public.address_points using gist ((geom::geography))
  where source = 'osm' and geom is not null;

grant select on public.address_points to anon, authenticated, service_role;

create or replace function public.get_address_points_radius_summary(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision,
  max_rows integer default 1500
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with point as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography geog
  ), matching as materialized (
    select ap.id, ap.source, ap.comune, ap.codice_comune, ap.via, ap.numero_civico,
      ap.lat, ap.lng, ap.confidence,
      st_distance(ap.geom::geography, point.geog) distance_m
    from public.address_points ap cross join point
    where ap.source = 'osm'
      and ap.geom is not null
      and st_dwithin(ap.geom::geography, point.geog, greatest(0, least(3, radius_km)) * 1000)
  ), sampled as (
    select * from matching order by distance_m limit greatest(0, least(1500, max_rows))
  )
  select jsonb_build_object(
    'count', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(to_jsonb(sampled) order by distance_m) from sampled), '[]'::jsonb)
  )
$$;

grant execute on function public.get_address_points_radius_summary(double precision,double precision,double precision,integer)
  to anon, authenticated, service_role;
