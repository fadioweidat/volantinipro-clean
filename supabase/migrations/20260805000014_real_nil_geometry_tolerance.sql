-- Validation profile derived from the authorized DS964 production export:
-- SHA-256 81880a5797b8e3d1f36fca96b301ae9f0f38ef6bed0e1bde685f885d62f04a42.
-- The least-contained official NIL is ROSERIO (82.398035% inside the local
-- ISTAT Milano boundary). 82.398% is the data-derived floor; coordinates are
-- never clipped, snapped, made valid or otherwise rewritten.

alter table public.geo_municipality_nil
  add column if not exists source_url text,
  add column if not exists export_sha256 text,
  add column if not exists outside_area_m2 numeric,
  add column if not exists outside_percentage numeric,
  add column if not exists inside_percentage numeric,
  add column if not exists max_outside_distance_m numeric,
  add column if not exists area_m2 numeric,
  add column if not exists display_geometry_geojson text,
  add column if not exists geometry_validation jsonb not null default '{}'::jsonb;

alter table public.geo_municipality_nil
  drop constraint if exists geo_municipality_nil_export_sha256_check;
alter table public.geo_municipality_nil
  add constraint geo_municipality_nil_export_sha256_check
  check (export_sha256 is null or export_sha256 ~ '^[0-9a-f]{64}$');

create or replace function public.validate_milano_nil_geometry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  milano_geom geometry;
  outside_geom geometry;
  total_m2 double precision;
  outside_m2 double precision;
  inside_ratio double precision;
  max_offset_m double precision := 0;
  minimum_inside_ratio constant double precision := 0.82398;
begin
  new.nil_code := btrim(new.nil_code);
  new.nil_name := btrim(new.nil_name);
  new.municipality_code := '015146';
  new.municipality_name := 'Milano';

  if new.geom is null
     or st_isempty(new.geom)
     or not st_isvalid(new.geom)
     or st_srid(new.geom) <> 4326
     or geometrytype(new.geom) <> 'MULTIPOLYGON' then
    raise exception 'INVALID_NIL_GEOMETRY:%', new.nil_code using errcode = '22023';
  end if;

  select gm.geom into milano_geom
  from public.geo_municipalities gm
  where gm.municipality_code = '015146'
  limit 1;

  if milano_geom is null then
    raise exception 'MILANO_BOUNDARY_NOT_AVAILABLE' using errcode = '55000';
  end if;
  if not st_intersects(new.geom, milano_geom) then
    raise exception 'NIL_DOES_NOT_INTERSECT_MILANO:%', new.nil_code using errcode = '22023';
  end if;

  total_m2 := st_area(new.geom::geography);
  outside_geom := st_difference(new.geom, milano_geom);
  outside_m2 := coalesce(st_area(outside_geom::geography), 0);
  inside_ratio := greatest(0, least(1, (total_m2 - outside_m2) / nullif(total_m2, 0)));

  if total_m2 <= 0 or inside_ratio < minimum_inside_ratio then
    raise exception 'NIL_INSUFFICIENTLY_INSIDE_MILANO:%:%', new.nil_code, round((inside_ratio * 100)::numeric, 6)
      using errcode = '22023';
  end if;

  if not st_isempty(outside_geom) then
    select coalesce(max(st_distance(
      st_transform((point_dump).geom, 32632),
      st_transform(st_boundary(milano_geom), 32632)
    )), 0)
    into max_offset_m
    from st_dumppoints(outside_geom) point_dump;
  end if;

  new.outside_area_m2 := round(outside_m2::numeric, 2);
  new.area_m2 := round(total_m2::numeric, 2);
  new.outside_percentage := round(((outside_m2 / total_m2) * 100)::numeric, 6);
  new.inside_percentage := round((inside_ratio * 100)::numeric, 6);
  new.max_outside_distance_m := round(max_offset_m::numeric, 2);
  new.display_geometry_geojson := st_asgeojson(st_simplifypreservetopology(new.geom, 0.00007));
  new.geometry_validation := jsonb_build_object(
    'rule_version', 'ds964-istat-2026-v1',
    'minimum_inside_percentage', 82.398,
    'boundary_municipality_code', '015146',
    'reference_export_sha256', '81880a5797b8e3d1f36fca96b301ae9f0f38ef6bed0e1bde685f885d62f04a42',
    'geometry_preserved', true
  );
  new.updated_at := now();
  return new;
end
$$;

-- Populate only derived display/validation metadata. The authoritative geom
-- value is assigned to itself and the trigger never rewrites it.
update public.geo_municipality_nil
set geom = geom
where area_m2 is null or display_geometry_geojson is null;

create or replace function public.upsert_milano_nil_batch(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  affected integer := 0;
  geometry_value geometry;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'NIL_ROWS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(rows)
  loop
    if nullif(item->>'nil_code', '') is null
       or nullif(item->>'nil_name', '') is null
       or nullif(item->>'source', '') is null
       or item->'geometry' is null then
      raise exception 'NIL_REQUIRED_FIELD_MISSING' using errcode = '22023';
    end if;

    geometry_value := st_geomfromgeojson((item->'geometry')::text);
    if geometry_value is null
       or st_srid(geometry_value) <> 4326
       or geometrytype(geometry_value) <> 'MULTIPOLYGON'
       or st_isempty(geometry_value)
       or not st_isvalid(geometry_value) then
      raise exception 'INVALID_NIL_GEOMETRY:%', item->>'nil_code' using errcode = '22023';
    end if;

    insert into public.geo_municipality_nil (
      nil_code, nil_name, valid_from, valid_to, source, source_url,
      source_updated_at, license, export_sha256, geom, raw_payload
    ) values (
      item->>'nil_code', item->>'nil_name', nullif(item->>'valid_from', '')::date,
      nullif(item->>'valid_to', '')::date, item->>'source', nullif(item->>'source_url', ''),
      nullif(item->>'source_updated_at', '')::timestamptz,
      coalesce(nullif(item->>'license', ''), 'CC BY 4.0'),
      nullif(item->>'export_sha256', ''), geometry_value,
      coalesce(item->'raw_payload', '{}'::jsonb)
    )
    on conflict (nil_code) do update set
      nil_name = excluded.nil_name,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      source = excluded.source,
      source_url = excluded.source_url,
      source_updated_at = excluded.source_updated_at,
      license = excluded.license,
      export_sha256 = excluded.export_sha256,
      geom = excluded.geom,
      raw_payload = excluded.raw_payload,
      updated_at = now();
    affected := affected + 1;
  end loop;
  return affected;
end
$$;

drop function if exists public.get_nil_breakdown_in_radius(double precision, double precision, double precision);
create function public.get_nil_breakdown_in_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
returns table (
  territory_level text,
  nil_code text,
  nil_name text,
  municipality_code text,
  comune_name text,
  households_total bigint,
  population_total bigint,
  households_in_radius bigint,
  population_in_radius bigint,
  area_km2 numeric,
  density_per_km2 numeric,
  pct_copertura numeric,
  volantini_nel_raggio bigint,
  geometry_geojson text,
  source text,
  source_url text,
  valid_from date,
  license text,
  outside_area_m2 numeric,
  outside_percentage numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if center_lat is null or center_lat < -90 or center_lat > 90
     or center_lng is null or center_lng < -180 or center_lng > 180
     or radius_km is null or radius_km <= 0 or radius_km > 50 then
    raise exception 'INVALID_NIL_RADIUS_INPUT' using errcode = '22023';
  end if;

  return query
  with search_area as (
    select st_buffer(st_setsrid(st_point(center_lng, center_lat), 4326)::geography, radius_km * 1000)::geometry geom
  ), milano as (
    select gm.municipality_code, gm.municipality_name,
      coalesce(gm.households_total, 0)::numeric households,
      coalesce(gm.population_total, 0)::numeric population,
      nullif(st_area(gm.geom::geography), 0) municipality_m2
    from public.geo_municipalities gm
    where gm.municipality_code = '015146'
    limit 1
  ), candidates as (
    select n.*, n.area_m2::double precision nil_m2,
      case
        when st_covers(a.geom, n.geom) then st_area(n.geom::geography)
        else st_area(st_intersection(n.geom, a.geom)::geography)
      end intersection_m2
    from public.geo_municipality_nil n cross join search_area a
    where st_intersects(n.geom, a.geom)
  )
  select 'nil'::text, c.nil_code, c.nil_name, m.municipality_code, m.municipality_name,
    greatest(0, round(m.households * c.nil_m2 / m.municipality_m2))::bigint,
    greatest(0, round(m.population * c.nil_m2 / m.municipality_m2))::bigint,
    greatest(0, round(m.households * c.nil_m2 / m.municipality_m2 * c.intersection_m2 / nullif(c.nil_m2, 0)))::bigint,
    greatest(0, round(m.population * c.nil_m2 / m.municipality_m2 * c.intersection_m2 / nullif(c.nil_m2, 0)))::bigint,
    round((c.nil_m2 / 1000000.0)::numeric, 3),
    case when c.nil_m2 > 0 then round((m.population / m.municipality_m2 * 1000000.0)::numeric, 2) end,
    round((100 * c.intersection_m2 / nullif(c.nil_m2, 0))::numeric, 2),
    greatest(0, round(m.households * c.nil_m2 / m.municipality_m2 * c.intersection_m2 / nullif(c.nil_m2, 0) * 1.1))::bigint,
    c.display_geometry_geojson,
    c.source, c.source_url, c.valid_from, c.license, c.outside_area_m2, c.outside_percentage
  from candidates c cross join milano m
  where c.intersection_m2 > 0
  order by c.nil_code;
end
$$;

revoke execute on function public.get_nil_breakdown_in_radius(double precision,double precision,double precision) from public;
grant execute on function public.get_nil_breakdown_in_radius(double precision,double precision,double precision)
  to anon, authenticated, service_role;

revoke execute on function public.upsert_milano_nil_batch(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_milano_nil_batch(jsonb) to service_role;
