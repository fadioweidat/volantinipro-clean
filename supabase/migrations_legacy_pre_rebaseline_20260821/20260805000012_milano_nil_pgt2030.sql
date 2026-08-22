create table if not exists public.geo_municipality_nil (
  id uuid primary key default gen_random_uuid(),
  nil_code text not null unique,
  nil_name text not null,
  municipality_code text not null default '015146',
  municipality_name text not null default 'Milano',
  valid_from date,
  valid_to date,
  source text not null,
  source_updated_at timestamptz,
  license text not null default 'CC BY 4.0',
  geom geometry(MultiPolygon, 4326) not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_municipality_nil_milano_check check (municipality_code = '015146' and lower(municipality_name) = 'milano'),
  constraint geo_municipality_nil_code_check check (btrim(nil_code) <> ''),
  constraint geo_municipality_nil_name_check check (btrim(nil_name) <> ''),
  constraint geo_municipality_nil_geom_check check (not st_isempty(geom) and st_isvalid(geom))
);

create index if not exists geo_municipality_nil_geom_idx on public.geo_municipality_nil using gist (geom);
create index if not exists geo_municipality_nil_name_idx on public.geo_municipality_nil (lower(nil_name));

create or replace function public.validate_milano_nil_geometry()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare milano_geom geometry;
begin
  new.nil_code := btrim(new.nil_code);
  new.nil_name := btrim(new.nil_name);
  new.municipality_code := '015146';
  new.municipality_name := 'Milano';
  new.geom := st_multi(st_collectionextract(st_makevalid(st_setsrid(new.geom, 4326)), 3));
  if new.geom is null or st_isempty(new.geom) or not st_isvalid(new.geom) then
    raise exception 'INVALID_NIL_GEOMETRY:%', new.nil_code;
  end if;
  select geom into milano_geom from public.geo_municipalities where municipality_code = '015146' limit 1;
  if milano_geom is null then raise exception 'MILANO_BOUNDARY_NOT_AVAILABLE'; end if;
  if not st_coveredby(new.geom, milano_geom) then raise exception 'NIL_OUTSIDE_MILANO:%', new.nil_code; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists geo_municipality_nil_validate on public.geo_municipality_nil;
create trigger geo_municipality_nil_validate before insert or update on public.geo_municipality_nil
for each row execute function public.validate_milano_nil_geometry();

create or replace function public.upsert_milano_nil_batch(rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; affected integer := 0; geometry_value geometry;
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) loop
    if nullif(item->>'nil_code','') is null or nullif(item->>'nil_name','') is null or item->'geometry' is null then
      raise exception 'NIL_REQUIRED_FIELD_MISSING';
    end if;
    geometry_value := st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(item->'geometry'),4326)),3));
    insert into public.geo_municipality_nil (
      nil_code,nil_name,valid_from,valid_to,source,source_updated_at,license,geom,raw_payload
    ) values (
      item->>'nil_code', item->>'nil_name', nullif(item->>'valid_from','')::date,
      nullif(item->>'valid_to','')::date, item->>'source', nullif(item->>'source_updated_at','')::timestamptz,
      coalesce(nullif(item->>'license',''),'CC BY 4.0'), geometry_value, coalesce(item->'raw_payload','{}'::jsonb)
    ) on conflict (nil_code) do update set
      nil_name=excluded.nil_name, valid_from=excluded.valid_from, valid_to=excluded.valid_to,
      source=excluded.source, source_updated_at=excluded.source_updated_at, license=excluded.license,
      geom=excluded.geom, raw_payload=excluded.raw_payload, updated_at=now();
    affected := affected + 1;
  end loop;
  return affected;
end $$;

-- Idempotenza: una migrazione successiva (20260805000014) sostituisce questa
-- stessa funzione con uno shape di ritorno piu' ricco (drop+create con set di
-- colonne diverso). PostgreSQL rifiuta un CREATE OR REPLACE che cambi lo shape
-- delle colonne di output di una funzione TABLE(...) gia' installata: senza
-- questo DROP esplicito, una riapplicazione completa delle migrazioni in
-- ordine (010->014, poi di nuovo 010->014) fallisce qui alla seconda passata,
-- perche' la funzione trovata a quel punto e' gia' la versione ricca di 014,
-- non quella originale di questo file. Il DROP e' innocuo: la CREATE che
-- segue reinstalla immediatamente la firma di QUESTO file, che 014 sostituira'
-- di nuovo con la propria versione piu' completa nello stesso replay, esattamente
-- come in un'installazione da zero. Nessun dato perso: la funzione non ha stato.
drop function if exists public.get_nil_breakdown_in_radius(double precision, double precision, double precision);

create or replace function public.get_nil_breakdown_in_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
returns table (
  nil_code text, nil_name text, comune_name text, municipality_code text,
  households_total bigint, population_total bigint, area_km2 numeric,
  intersection_ratio numeric, households_in_radius bigint, population_in_radius bigint,
  geometry_geojson text, source text, source_updated_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  with search_area as (
    select st_buffer(st_setsrid(st_point(center_lng,center_lat),4326)::geography,
      greatest(0.1,least(50,radius_km))*1000)::geometry geom
  )
  select n.nil_code,n.nil_name,n.municipality_name,n.municipality_code,
    null::bigint,null::bigint,round((st_area(n.geom::geography)/1000000.0)::numeric,6),
    round((st_area(st_intersection(n.geom,a.geom)::geography)/nullif(st_area(n.geom::geography),0))::numeric,8),
    null::bigint,null::bigint,st_asgeojson(n.geom),n.source,n.source_updated_at
  from public.geo_municipality_nil n cross join search_area a
  where st_intersects(n.geom,a.geom)
  order by n.nil_code
$$;

alter table public.geo_municipality_nil enable row level security;
drop policy if exists geo_municipality_nil_read on public.geo_municipality_nil;
create policy geo_municipality_nil_read on public.geo_municipality_nil for select using (true);
grant select on public.geo_municipality_nil to anon, authenticated, service_role;
grant execute on function public.get_nil_breakdown_in_radius(double precision,double precision,double precision) to anon, authenticated, service_role;
revoke execute on function public.upsert_milano_nil_batch(jsonb) from public;
grant execute on function public.upsert_milano_nil_batch(jsonb) to service_role;
revoke execute on function public.upsert_milano_nil_batch(jsonb) from anon, authenticated;
