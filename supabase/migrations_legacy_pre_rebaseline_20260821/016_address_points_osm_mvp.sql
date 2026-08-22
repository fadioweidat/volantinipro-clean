create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.address_points (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  comune text not null,
  codice_comune text,
  via text,
  numero_civico text,
  lat double precision not null,
  lng double precision not null,
  geom geometry(Point, 4326) not null,
  confidence numeric(3,2) default 1.00,
  raw_tags jsonb,
  updated_at timestamptz default now(),
  constraint address_points_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists address_points_geom_gix
  on public.address_points using gist (geom);

create index if not exists address_points_comune_idx
  on public.address_points (comune);

create index if not exists address_points_codice_comune_idx
  on public.address_points (codice_comune);

create unique index if not exists address_points_source_source_id_uidx
  on public.address_points (source, source_id)
  where source_id is not null;

create or replace function public.sync_address_points_geom()
returns trigger
language plpgsql
as $$
begin
  new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326);
  return new;
end;
$$;

drop trigger if exists address_points_sync_geom on public.address_points;
create trigger address_points_sync_geom
before insert or update of lat, lng
on public.address_points
for each row
execute function public.sync_address_points_geom();

create or replace function public.touch_address_points_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists address_points_touch_updated_at on public.address_points;
create trigger address_points_touch_updated_at
before update on public.address_points
for each row
execute function public.touch_address_points_updated_at();

create or replace function public.get_address_points_in_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
returns table (
  id uuid,
  source text,
  comune text,
  codice_comune text,
  via text,
  numero_civico text,
  lat double precision,
  lng double precision,
  confidence numeric,
  distance_m double precision
)
language sql
stable
security invoker
as $$
  with point as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography as geog
  )
  select
    ap.id,
    ap.source,
    ap.comune,
    ap.codice_comune,
    ap.via,
    ap.numero_civico,
    ap.lat,
    ap.lng,
    ap.confidence,
    st_distance(ap.geom::geography, (select geog from point)) as distance_m
  from public.address_points ap
  where ap.geom is not null
    and st_dwithin(
      ap.geom::geography,
      (select geog from point),
      greatest(0, radius_km) * 1000
    )
  order by distance_m asc;
$$;

create or replace function public.upsert_address_points_batch(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  exists_row boolean;
  source_value text;
  source_id_value text;
  comune_value text;
  lat_value double precision;
  lng_value double precision;
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    source_value := nullif(item->>'source', '');
    source_id_value := nullif(item->>'source_id', '');
    comune_value := nullif(item->>'comune', '');
    lat_value := nullif(item->>'lat', '')::double precision;
    lng_value := nullif(item->>'lng', '')::double precision;

    if source_value is null
       or source_id_value is null
       or comune_value is null
       or nullif(item->>'numero_civico', '') is null
       or lat_value is null
       or lng_value is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select exists(
      select 1
      from public.address_points
      where source = source_value
        and source_id = source_id_value
    ) into exists_row;

    insert into public.address_points (
      source,
      source_id,
      comune,
      codice_comune,
      via,
      numero_civico,
      lat,
      lng,
      geom,
      confidence,
      raw_tags
    )
    values (
      source_value,
      source_id_value,
      comune_value,
      nullif(item->>'codice_comune', ''),
      nullif(item->>'via', ''),
      nullif(item->>'numero_civico', ''),
      lat_value,
      lng_value,
      st_setsrid(st_makepoint(lng_value, lat_value), 4326),
      coalesce(nullif(item->>'confidence', '')::numeric, 1.00),
      coalesce(item->'raw_tags', '{}'::jsonb)
    )
    on conflict (source, source_id) where source_id is not null do update set
      comune = excluded.comune,
      codice_comune = excluded.codice_comune,
      via = excluded.via,
      numero_civico = excluded.numero_civico,
      lat = excluded.lat,
      lng = excluded.lng,
      geom = excluded.geom,
      confidence = excluded.confidence,
      raw_tags = excluded.raw_tags,
      updated_at = now();

    if exists_row then
      updated_count := updated_count + 1;
    else
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count
  );
end;
$$;

alter table public.address_points enable row level security;

drop policy if exists address_points_read_public on public.address_points;
create policy address_points_read_public
on public.address_points
for select
to public
using (true);
