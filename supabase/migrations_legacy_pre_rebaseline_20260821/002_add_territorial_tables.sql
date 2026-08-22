-- Enable PostGIS
create extension if not exists postgis;

-- Territorial data tables
create table if not exists public.geo_municipalities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'IT',
  region_code text,
  region_name text,
  province_code text,
  province_name text,
  municipality_code text unique,
  municipality_name text not null,
  cadastral_code text,
  households_total integer default 0,
  population_total integer default 0,
  area_km2 numeric(12,4),
  density_per_km2 numeric(12,2),
  centroid_lat double precision,
  centroid_lng double precision,
  geom geometry(MultiPolygon, 4326),
  created_at timestamptz not null default now()
);

create index if not exists geo_municipalities_geom_idx on public.geo_municipalities using gist(geom);
create index if not exists geo_municipalities_name_idx on public.geo_municipalities (municipality_name);

create table if not exists public.demographic_indicators (
  id uuid primary key default gen_random_uuid(),
  municipality_code text references public.geo_municipalities(municipality_code) on delete cascade,
  municipality_name text,
  age_0_14_pct numeric(5,2),
  age_15_34_pct numeric(5,2),
  age_35_64_pct numeric(5,2),
  age_65_plus_pct numeric(5,2),
  foreigners_pct numeric(5,2),
  employment_rate numeric(5,2),
  average_income numeric(12,2),
  old_age_index numeric(12,2),
  businesses_total integer default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.geo_postal_areas (
  id uuid primary key default gen_random_uuid(),
  cap text not null,
  municipality_name text,
  municipality_code text,
  households_total integer default 0,
  population_total integer default 0,
  geom geometry(MultiPolygon, 4326),
  created_at timestamptz not null default now()
);

create index if not exists geo_postal_areas_geom_idx on public.geo_postal_areas using gist(geom);
create index if not exists geo_postal_areas_cap_idx on public.geo_postal_areas (cap);

-- RLS
alter table public.geo_municipalities enable row level security;
alter table public.demographic_indicators enable row level security;
alter table public.geo_postal_areas enable row level security;

create policy "geo_municipalities_read_public" on public.geo_municipalities for select to public using (true);
create policy "demographic_indicators_read_public" on public.demographic_indicators for select to public using (true);
create policy "geo_postal_areas_read_public" on public.geo_postal_areas for select to public using (true);
