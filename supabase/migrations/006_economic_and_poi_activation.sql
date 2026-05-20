create table if not exists public.economic_indicators (
  id uuid primary key default gen_random_uuid(),
  municipality_code text unique,
  municipality_name text,
  average_income numeric(12,2),
  employment_rate numeric(5,2),
  businesses_total integer,
  source_name text not null,
  source_year integer,
  source_level text not null default 'municipality',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists economic_indicators_municipality_name_idx
  on public.economic_indicators (municipality_name);

create table if not exists public.poi_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  name text,
  category text,
  service_context text,
  lat numeric(10,7),
  lng numeric(10,7),
  address text,
  municipality_code text,
  geom geometry(Point, 4326),
  raw_json jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists poi_cache_provider_idx
  on public.poi_cache (provider);

create index if not exists poi_cache_service_context_idx
  on public.poi_cache (service_context);

create index if not exists poi_cache_municipality_code_idx
  on public.poi_cache (municipality_code);

create index if not exists poi_cache_geom_idx
  on public.poi_cache using gist (geom);

create table if not exists public.poi_search_logs (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  lat numeric(10,7),
  lng numeric(10,7),
  radius_km numeric(8,3),
  providers_used text[] not null default '{}',
  results_count integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.sync_poi_cache_geom()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := st_setsrid(st_makepoint(new.lng::double precision, new.lat::double precision), 4326);
  else
    new.geom := null;
  end if;
  return new;
end;
$$;

drop trigger if exists poi_cache_sync_geom on public.poi_cache;
create trigger poi_cache_sync_geom
before insert or update on public.poi_cache
for each row
execute function public.sync_poi_cache_geom();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists economic_indicators_touch_updated_at on public.economic_indicators;
create trigger economic_indicators_touch_updated_at
before update on public.economic_indicators
for each row
execute function public.touch_updated_at();

create or replace function public.upsert_economic_indicators_batch(rows jsonb)
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
begin
  for item in select * from jsonb_array_elements(rows)
  loop
    if nullif(item->>'municipality_code', '') is null
       and nullif(item->>'municipality_name', '') is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select exists(
      select 1
      from public.economic_indicators
      where municipality_code is not distinct from nullif(item->>'municipality_code', '')
    ) into exists_row;

    insert into public.economic_indicators (
      municipality_code,
      municipality_name,
      average_income,
      employment_rate,
      businesses_total,
      source_name,
      source_year,
      source_level,
      raw_payload
    )
    values (
      nullif(item->>'municipality_code', ''),
      nullif(item->>'municipality_name', ''),
      nullif(item->>'average_income', '')::numeric,
      nullif(item->>'employment_rate', '')::numeric,
      nullif(item->>'businesses_total', '')::integer,
      coalesce(nullif(item->>'source_name', ''), 'UNKNOWN'),
      nullif(item->>'source_year', '')::integer,
      coalesce(nullif(item->>'source_level', ''), 'municipality'),
      coalesce(item->'raw_payload', '{}'::jsonb)
    )
    on conflict (municipality_code) do update set
      municipality_name = excluded.municipality_name,
      average_income = excluded.average_income,
      employment_rate = excluded.employment_rate,
      businesses_total = excluded.businesses_total,
      source_name = excluded.source_name,
      source_year = excluded.source_year,
      source_level = excluded.source_level,
      raw_payload = excluded.raw_payload,
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

alter table public.economic_indicators enable row level security;
alter table public.poi_cache enable row level security;
alter table public.poi_search_logs enable row level security;

drop policy if exists economic_indicators_read_public on public.economic_indicators;
create policy economic_indicators_read_public
on public.economic_indicators
for select
to public
using (true);

drop policy if exists poi_cache_read_public on public.poi_cache;
create policy poi_cache_read_public
on public.poi_cache
for select
to public
using (true);

drop policy if exists poi_search_logs_service_role_only on public.poi_search_logs;
create policy poi_search_logs_service_role_only
on public.poi_search_logs
for select
to public
using (auth.role() = 'service_role');
