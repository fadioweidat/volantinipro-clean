-- RPC for radius search
create or replace function public.get_municipalities_in_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision
)
returns setof public.geo_municipalities
language plpgsql
security definer
as $$
begin
  return query
  select *
  from public.geo_municipalities
  where st_dwithin(
    geom,
    st_setsrid(st_point(p_lng, p_lat), 4326)::geography,
    p_radius_meters
  )
  order by st_distance(
    geom,
    st_setsrid(st_point(p_lng, p_lat), 4326)::geography
  );
end;
$$;
