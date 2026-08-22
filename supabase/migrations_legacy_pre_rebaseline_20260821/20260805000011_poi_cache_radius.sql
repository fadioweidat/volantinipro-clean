create or replace function public.get_cached_pois_in_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_service text
)
returns table (
  provider text, external_id text, name text, category text,
  lat numeric, lng numeric, raw_json jsonb
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.provider, p.external_id, p.name, p.category, p.lat, p.lng, p.raw_json
  from public.poi_cache p
  where p.geom is not null
    and (p.service_context = p_service or p.service_context is null)
    and st_dwithin(
      p.geom::geography,
      st_setsrid(st_point(p_lng, p_lat), 4326)::geography,
      greatest(0.1, least(50, p_radius_km)) * 1000
    )
  order by p.geom <-> st_setsrid(st_point(p_lng, p_lat), 4326)
  limit 500
$$;

grant execute on function public.get_cached_pois_in_radius(double precision, double precision, double precision, text) to service_role;
revoke execute on function public.get_cached_pois_in_radius(double precision, double precision, double precision, text) from anon, authenticated;
