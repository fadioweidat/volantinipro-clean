create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.omi_zones (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'Agenzia Entrate - OMI',
  year integer,
  semester integer,
  municipality_name text not null,
  municipality_code text,
  zone_code text,
  zone_name text,
  min_value numeric(12,2),
  max_value numeric(12,2),
  typology text,
  currency text not null default 'EUR/mq',
  geom geometry(MultiPolygon, 4326),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists omi_zones_municipality_name_idx
  on public.omi_zones (lower(municipality_name));

create index if not exists omi_zones_municipality_code_idx
  on public.omi_zones (municipality_code);

create index if not exists omi_zones_geom_idx
  on public.omi_zones using gist (geom);

create unique index if not exists omi_zones_identity_idx
  on public.omi_zones (
    coalesce(year, 0),
    coalesce(semester, 0),
    lower(municipality_name),
    coalesce(zone_code, ''),
    coalesce(typology, '')
  );

create table if not exists public.gtfs_stops (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'GTFS / Trasporto pubblico',
  agency text,
  stop_id text not null,
  stop_name text not null,
  stop_lat numeric(10,7) not null,
  stop_lng numeric(10,7) not null,
  municipality_code text,
  municipality_name text,
  geom geometry(Point, 4326),
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);

create unique index if not exists gtfs_stops_source_stop_id_idx
  on public.gtfs_stops (source, stop_id);

create index if not exists gtfs_stops_geom_idx
  on public.gtfs_stops using gist (geom);

create or replace function public.sync_gtfs_stop_geom()
returns trigger
language plpgsql
as $$
begin
  new.geom := st_setsrid(st_point(new.stop_lng::double precision, new.stop_lat::double precision), 4326);
  return new;
end;
$$;

drop trigger if exists gtfs_stops_sync_geom on public.gtfs_stops;
create trigger gtfs_stops_sync_geom
before insert or update of stop_lat, stop_lng
on public.gtfs_stops
for each row
execute function public.sync_gtfs_stop_geom();

alter table if exists public.poi_cache add column if not exists bbox_hash text;
alter table if exists public.poi_cache add column if not exists service_type text;
alter table if exists public.poi_cache add column if not exists bbox text;
alter table if exists public.poi_cache add column if not exists pois jsonb not null default '[]'::jsonb;
alter table if exists public.poi_cache alter column external_id drop not null;

create unique index if not exists poi_cache_bbox_hash_key
  on public.poi_cache (bbox_hash);

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
  with point as (
    select st_setsrid(st_point(p_lng, p_lat), 4326)::geography as geog
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
    and st_dwithin(z.geom::geography, (select geog from point), greatest(0, p_radius_km) * 1000)
  order by z.year desc nulls last, z.semester desc nulls last, z.municipality_name, z.zone_code, z.typology
  limit 200;
$$;

create or replace function public.get_omi_zones_by_municipality(
  p_municipality_name text,
  p_municipality_code text default null
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
  where (
      p_municipality_code is not null
      and z.municipality_code = p_municipality_code
    )
    or (
      p_municipality_name is not null
      and lower(z.municipality_name) = lower(p_municipality_name)
    )
  order by z.year desc nulls last, z.semester desc nulls last, z.zone_code, z.typology
  limit 200;
$$;

create or replace function public.get_gtfs_stops_in_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_limit integer default 200
)
returns table (
  source text,
  agency text,
  stop_id text,
  stop_name text,
  stop_lat numeric,
  stop_lng numeric,
  distance_km numeric
)
language sql
stable
security invoker
as $$
  with point as (
    select st_setsrid(st_point(p_lng, p_lat), 4326)::geography as geog
  )
  select
    s.source,
    s.agency,
    s.stop_id,
    s.stop_name,
    s.stop_lat,
    s.stop_lng,
    round((st_distance(s.geom::geography, (select geog from point)) / 1000)::numeric, 3) as distance_km
  from public.gtfs_stops s
  where s.geom is not null
    and st_dwithin(s.geom::geography, (select geog from point), greatest(0, p_radius_km) * 1000)
  order by s.geom <-> st_setsrid(st_point(p_lng, p_lat), 4326)
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

create or replace function public.upsert_omi_zones_batch(rows jsonb)
returns integer
language plpgsql
security definer
as $$
declare
  item jsonb;
  affected integer := 0;
  geom_value geometry(MultiPolygon, 4326);
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    geom_value := null;
    if coalesce(item->>'geometry_geojson', item->>'geom_geojson', item->>'geometry') is not null then
      geom_value := st_multi(st_setsrid(st_geomfromgeojson(coalesce(item->>'geometry_geojson', item->>'geom_geojson', item->>'geometry')), 4326))::geometry(MultiPolygon, 4326);
    end if;

    insert into public.omi_zones (
      source,
      year,
      semester,
      municipality_name,
      municipality_code,
      zone_code,
      zone_name,
      min_value,
      max_value,
      typology,
      currency,
      geom,
      raw_payload
    )
    values (
      coalesce(nullif(item->>'source', ''), 'Agenzia Entrate - OMI'),
      nullif(item->>'year', '')::integer,
      nullif(item->>'semester', '')::integer,
      nullif(coalesce(item->>'municipality_name', item->>'comune'), ''),
      nullif(coalesce(item->>'municipality_code', item->>'codice_comune'), ''),
      nullif(coalesce(item->>'zone_code', item->>'zona'), ''),
      nullif(coalesce(item->>'zone_name', item->>'nome_zona'), ''),
      nullif(coalesce(item->>'min_value', item->>'valore_minimo'), '')::numeric,
      nullif(coalesce(item->>'max_value', item->>'valore_massimo'), '')::numeric,
      nullif(coalesce(item->>'typology', item->>'tipologia'), ''),
      coalesce(nullif(item->>'currency', ''), 'EUR/mq'),
      geom_value,
      item
    )
    on conflict (
      (coalesce(year, 0)),
      (coalesce(semester, 0)),
      (lower(municipality_name)),
      (coalesce(zone_code, '')),
      (coalesce(typology, ''))
    )
    do update set
      source = excluded.source,
      municipality_code = excluded.municipality_code,
      zone_name = excluded.zone_name,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      currency = excluded.currency,
      geom = coalesce(excluded.geom, public.omi_zones.geom),
      raw_payload = excluded.raw_payload,
      updated_at = now();

    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

create or replace function public.upsert_gtfs_stops_batch(rows jsonb)
returns integer
language plpgsql
security definer
as $$
declare
  item jsonb;
  affected integer := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    insert into public.gtfs_stops (
      source,
      agency,
      stop_id,
      stop_name,
      stop_lat,
      stop_lng,
      municipality_code,
      municipality_name,
      raw_payload,
      imported_at
    )
    values (
      coalesce(nullif(item->>'source', ''), 'GTFS / Trasporto pubblico'),
      nullif(item->>'agency', ''),
      nullif(item->>'stop_id', ''),
      nullif(item->>'stop_name', ''),
      nullif(item->>'stop_lat', '')::numeric,
      nullif(coalesce(item->>'stop_lng', item->>'stop_lon'), '')::numeric,
      nullif(item->>'municipality_code', ''),
      nullif(item->>'municipality_name', ''),
      item,
      now()
    )
    on conflict (source, stop_id)
    do update set
      agency = excluded.agency,
      stop_name = excluded.stop_name,
      stop_lat = excluded.stop_lat,
      stop_lng = excluded.stop_lng,
      municipality_code = excluded.municipality_code,
      municipality_name = excluded.municipality_name,
      raw_payload = excluded.raw_payload,
      imported_at = now();

    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

alter table public.omi_zones enable row level security;
alter table public.gtfs_stops enable row level security;

drop policy if exists omi_zones_read_public on public.omi_zones;
create policy omi_zones_read_public
on public.omi_zones
for select
using (true);

drop policy if exists gtfs_stops_read_public on public.gtfs_stops;
create policy gtfs_stops_read_public
on public.gtfs_stops
for select
using (true);
