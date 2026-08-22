create extension if not exists postgis;

create table if not exists public.transport_stops (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  stop_id text not null,
  stop_name text not null,
  stop_type text default 'unknown',
  lat double precision not null,
  lng double precision not null,
  geom geometry(Point, 4326) not null,
  raw_tags jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  route_id text not null,
  route_short_name text,
  route_long_name text,
  route_type integer,
  route_type_label text default 'unknown',
  route_color text,
  route_text_color text,
  raw_tags jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.transport_stop_routes (
  source text not null,
  stop_id text not null,
  route_id text not null,
  updated_at timestamptz default now(),
  primary key (source, stop_id, route_id)
);

create index if not exists transport_stops_geom_gix
  on public.transport_stops using gist (geom);

create unique index if not exists transport_stops_source_stop_id_uidx
  on public.transport_stops (source, stop_id);

create unique index if not exists transport_routes_source_route_id_uidx
  on public.transport_routes (source, route_id);

create index if not exists transport_stop_routes_source_stop_id_idx
  on public.transport_stop_routes (source, stop_id);

create index if not exists transport_stop_routes_source_route_id_idx
  on public.transport_stop_routes (source, route_id);

create or replace function public.touch_transport_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transport_stops_touch_updated_at on public.transport_stops;
create trigger transport_stops_touch_updated_at
before update on public.transport_stops
for each row
execute function public.touch_transport_updated_at();

drop trigger if exists transport_routes_touch_updated_at on public.transport_routes;
create trigger transport_routes_touch_updated_at
before update on public.transport_routes
for each row
execute function public.touch_transport_updated_at();

create or replace function public.get_transport_stops_in_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
returns table (
  stop_id text,
  stop_name text,
  stop_type text,
  routes jsonb,
  distance_m double precision,
  lat double precision,
  lng double precision,
  source text
)
language sql
stable
security invoker
as $$
  with point as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography as geog
  )
  select
    s.stop_id,
    s.stop_name,
    s.stop_type,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'route_id', r.route_id,
          'route_short_name', r.route_short_name,
          'route_long_name', r.route_long_name,
          'route_type', r.route_type,
          'route_type_label', r.route_type_label,
          'route_color', r.route_color,
          'route_text_color', r.route_text_color
        )
      ) filter (where r.route_id is not null),
      '[]'::jsonb
    ) as routes,
    st_distance(s.geom::geography, (select geog from point)) as distance_m,
    s.lat,
    s.lng,
    s.source
  from public.transport_stops s
  left join public.transport_stop_routes sr
    on sr.source = s.source
   and sr.stop_id = s.stop_id
  left join public.transport_routes r
    on r.source = sr.source
   and r.route_id = sr.route_id
  where s.geom is not null
    and st_dwithin(
      s.geom::geography,
      (select geog from point),
      greatest(0, radius_km) * 1000
    )
  group by s.source, s.stop_id, s.stop_name, s.stop_type, s.lat, s.lng, s.geom
  order by distance_m asc;
$$;

alter table public.transport_stops enable row level security;
alter table public.transport_routes enable row level security;
alter table public.transport_stop_routes enable row level security;

drop policy if exists transport_stops_read_public on public.transport_stops;
create policy transport_stops_read_public
on public.transport_stops
for select
to public
using (true);

drop policy if exists transport_routes_read_public on public.transport_routes;
create policy transport_routes_read_public
on public.transport_routes
for select
to public
using (true);

drop policy if exists transport_stop_routes_read_public on public.transport_stop_routes;
create policy transport_stop_routes_read_public
on public.transport_stop_routes
for select
to public
using (true);
