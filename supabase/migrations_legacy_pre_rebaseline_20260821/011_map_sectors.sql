-- Migration 011: Operational sectors table for flyer distribution planning
-- Adds map_sectors table with PostGIS geometry, spatial index, and Varedo test data.

-- ── Table ──────────────────────────────────────────────────────────────────
create table if not exists public.map_sectors (
  id                uuid        primary key default gen_random_uuid(),
  service_type      text        not null check (service_type in ('d2d','h2h','b2b')),
  municipality_code text        not null,
  sector_number     integer     not null default 1,
  sector_name       text,
  geometry          geometry(MultiPolygon, 4326) not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (service_type, municipality_code, sector_number)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_map_sectors_geom
  on public.map_sectors using gist (geometry);

create index if not exists idx_map_sectors_service_mun
  on public.map_sectors (service_type, municipality_code);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.map_sectors enable row level security;

do $guard$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'map_sectors' and policyname = 'Public read'
  ) then
    create policy "Public read"
      on public.map_sectors for select using (true);
  end if;
end
$guard$;

-- ── updated_at trigger ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_map_sectors_updated_at on public.map_sectors;
create trigger trg_map_sectors_updated_at
  before update on public.map_sectors
  for each row execute function public.touch_updated_at();

-- ── RPC: get_map_sectors ───────────────────────────────────────────────────
-- Returns GeoJSON FeatureCollection of sectors within radius of center point.
create or replace function public.get_map_sectors(
  p_service_type text,
  p_center_lat   float,
  p_center_lng   float,
  p_radius_km    float default 5
)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'type',     'FeatureCollection',
    'features', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type',       'Feature',
          'geometry',   st_asgeojson(s.geometry)::jsonb,
          'properties', jsonb_build_object(
            'id',                s.id,
            'municipality_code', s.municipality_code,
            'sector_number',     s.sector_number,
            'sector_name',       s.sector_name,
            'service_type',      s.service_type
          )
        )
      ),
      '[]'::jsonb
    )
  ) into v_result
  from public.map_sectors s
  where s.service_type = p_service_type
    and st_dwithin(
          s.geometry::geography,
          st_setsrid(st_makepoint(p_center_lng, p_center_lat), 4326)::geography,
          p_radius_km * 1000
        );
  return v_result;
end;
$$;

-- ── Seed data: Varedo (municipality_code = 108045) ─────────────────────────
-- 4 operational sectors clipped from real ISTAT polygon (area: 4.80 km²).
-- Geometry derived via Sutherland-Hodgman polygon clipping on the 28-point
-- ISTAT boundary, subdivided into a 2x2 grid.

delete from public.map_sectors
  where municipality_code = '108045' and service_type = 'd2d';

insert into public.map_sectors
  (service_type, municipality_code, sector_number, sector_name, geometry)
values
  (
    'd2d', '108045', 1, 'Nord-Ovest',
    ST_GeomFromText('MULTIPOLYGON(((
      9.16635769 45.59854810,
      9.14423438 45.59854810,
      9.14415307 45.59889362,
      9.14515226 45.59868531,
      9.14552434 45.59876408,
      9.14568068 45.59879718,
      9.14738417 45.59915952,
      9.15033670 45.60046080,
      9.15110955 45.60176492,
      9.15317937 45.60406904,
      9.15753304 45.60605425,
      9.16133411 45.60729057,
      9.16591103 45.60782464,
      9.16635769 45.60786286,
      9.16635769 45.59854810
    )))', 4326)
  ),
  (
    'd2d', '108045', 2, 'Nord-Est',
    ST_GeomFromText('MULTIPOLYGON(((
      9.17483355 45.60741516,
      9.17476431 45.60709956,
      9.17457300 45.60622745,
      9.17666264 45.60526562,
      9.18151645 45.60456043,
      9.18819532 45.60030707,
      9.18856230 45.59935550,
      9.18732255 45.59854810,
      9.16635769 45.59854810,
      9.16635769 45.60786286,
      9.16720286 45.60793517,
      9.17012173 45.60694524,
      9.17483974 45.60854203,
      9.17595676 45.60931557,
      9.17483355 45.60741516
    )))', 4326)
  ),
  (
    'd2d', '108045', 3, 'Sud-Ovest',
    ST_GeomFromText('MULTIPOLYGON(((
      9.16635769 45.59854810,
      9.16635769 45.59162966,
      9.16294837 45.59154154,
      9.15074439 45.58893630,
      9.14676824 45.58778063,
      9.14423438 45.59854810,
      9.16635769 45.59854810
    )))', 4326)
  ),
  (
    'd2d', '108045', 4, 'Sud-Est',
    ST_GeomFromText('MULTIPOLYGON(((
      9.18732255 45.59854810,
      9.17691858 45.59177241,
      9.17082243 45.59174506,
      9.16635769 45.59162966,
      9.16635769 45.59854810,
      9.18732255 45.59854810
    )))', 4326)
  );

-- ── Verify ─────────────────────────────────────────────────────────────────
-- After running, check the import:
-- select sector_number, sector_name,
--        round(st_area(geometry::geography)/1e6, 3) as area_km2,
--        st_npoints(geometry) as points
-- from public.map_sectors
-- where municipality_code = '108045'
-- order by sector_number;
