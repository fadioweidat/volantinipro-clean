create extension if not exists postgis;

drop function if exists public.territorial_dataset_status();

alter table public.geo_municipalities
  add column if not exists geom geometry(MultiPolygon, 4326);

alter table public.geo_municipalities
  alter column households_total drop default,
  alter column population_total drop default;

alter table public.demographic_indicators
  add column if not exists geography_type text,
  add column if not exists geography_ref text,
  add column if not exists reference_year integer,
  add column if not exists population_total integer,
  add column if not exists households_total integer,
  add column if not exists share_age_0_14 numeric,
  add column if not exists share_age_15_34 numeric,
  add column if not exists share_age_35_64 numeric,
  add column if not exists share_age_65_plus numeric,
  add column if not exists avg_income_estimate numeric,
  add column if not exists source text,
  add column if not exists source_ref text,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists municipality_code text,
  add column if not exists municipality_name text,
  add column if not exists age_0_14_pct numeric(5,2),
  add column if not exists age_15_34_pct numeric(5,2),
  add column if not exists age_35_64_pct numeric(5,2),
  add column if not exists age_65_plus_pct numeric(5,2),
  add column if not exists foreigners_pct numeric(5,2),
  add column if not exists employment_rate numeric(5,2),
  add column if not exists average_income numeric(12,2),
  add column if not exists old_age_index numeric(12,2),
  add column if not exists businesses_total integer,
  add column if not exists updated_at timestamptz;

alter table public.demographic_indicators
  alter column businesses_total drop default;

create unique index if not exists demographic_indicators_municipality_code_key
  on public.demographic_indicators (municipality_code);

create index if not exists geo_municipalities_geom_idx
  on public.geo_municipalities using gist (geom);

create or replace function public.upsert_istat_territorial_batch(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  geo jsonb;
  demo jsonb;
  exists_geo boolean;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
begin
  for item in select * from jsonb_array_elements(rows)
  loop
    geo := item->'geo';
    demo := item->'demographic';

    if nullif(geo->>'municipality_code', '') is null
      or nullif(geo->>'municipality_name', '') is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select exists(
      select 1
      from public.geo_municipalities
      where municipality_code = geo->>'municipality_code'
    ) into exists_geo;

    insert into public.geo_municipalities (
      country_code,
      region_code,
      region_name,
      province_code,
      province_name,
      municipality_code,
      municipality_name,
      cadastral_code,
      households_total,
      population_total,
      area_km2,
      density_per_km2,
      centroid_lat,
      centroid_lng,
      geom
    )
    values (
      coalesce(nullif(geo->>'country_code', ''), 'IT'),
      nullif(geo->>'region_code', ''),
      nullif(geo->>'region_name', ''),
      nullif(geo->>'province_code', ''),
      nullif(geo->>'province_name', ''),
      geo->>'municipality_code',
      geo->>'municipality_name',
      nullif(geo->>'cadastral_code', ''),
      nullif(geo->>'households_total', '')::integer,
      nullif(geo->>'population_total', '')::integer,
      nullif(geo->>'area_km2', '')::numeric,
      nullif(geo->>'density_per_km2', '')::numeric,
      nullif(geo->>'centroid_lat', '')::double precision,
      nullif(geo->>'centroid_lng', '')::double precision,
      case
        when geo ? 'geom_geojson' and geo->'geom_geojson' is not null
          then st_multi(st_setsrid(st_geomfromgeojson(geo->'geom_geojson'), 4326))
        else null
      end
    )
    on conflict (municipality_code) do update set
      country_code = excluded.country_code,
      region_code = excluded.region_code,
      region_name = excluded.region_name,
      province_code = excluded.province_code,
      province_name = excluded.province_name,
      municipality_name = excluded.municipality_name,
      cadastral_code = excluded.cadastral_code,
      households_total = excluded.households_total,
      population_total = excluded.population_total,
      area_km2 = excluded.area_km2,
      density_per_km2 = excluded.density_per_km2,
      centroid_lat = excluded.centroid_lat,
      centroid_lng = excluded.centroid_lng,
      geom = excluded.geom;

    if exists_geo then
      updated_count := updated_count + 1;
    else
      inserted_count := inserted_count + 1;
    end if;

    insert into public.demographic_indicators (
      geography_type,
      geography_ref,
      reference_year,
      population_total,
      households_total,
      share_age_0_14,
      share_age_15_34,
      share_age_35_64,
      share_age_65_plus,
      avg_income_estimate,
      source,
      source_ref,
      raw_payload,
      municipality_code,
      municipality_name,
      age_0_14_pct,
      age_15_34_pct,
      age_35_64_pct,
      age_65_plus_pct,
      foreigners_pct,
      employment_rate,
      average_income,
      old_age_index,
      businesses_total,
      updated_at
    )
    values (
      'municipality',
      geo->>'municipality_code',
      2024,
      nullif(geo->>'population_total', '')::integer,
      nullif(geo->>'households_total', '')::integer,
      nullif(demo->>'age_0_14_pct', '')::numeric,
      nullif(demo->>'age_15_34_pct', '')::numeric,
      nullif(demo->>'age_35_64_pct', '')::numeric,
      nullif(demo->>'age_65_plus_pct', '')::numeric,
      nullif(demo->>'average_income', '')::numeric,
      'ISTAT',
      'ISTAT Demo P2 2024 + POSAS 2025 + Confini amministrativi 2026',
      jsonb_build_object('geo', geo, 'demographic', demo),
      geo->>'municipality_code',
      coalesce(nullif(demo->>'municipality_name', ''), geo->>'municipality_name'),
      nullif(demo->>'age_0_14_pct', '')::numeric,
      nullif(demo->>'age_15_34_pct', '')::numeric,
      nullif(demo->>'age_35_64_pct', '')::numeric,
      nullif(demo->>'age_65_plus_pct', '')::numeric,
      nullif(demo->>'foreigners_pct', '')::numeric,
      nullif(demo->>'employment_rate', '')::numeric,
      nullif(demo->>'average_income', '')::numeric,
      nullif(demo->>'old_age_index', '')::numeric,
      nullif(demo->>'businesses_total', '')::integer,
      now()
    )
    on conflict (municipality_code) do update set
      geography_type = excluded.geography_type,
      geography_ref = excluded.geography_ref,
      reference_year = excluded.reference_year,
      population_total = excluded.population_total,
      households_total = excluded.households_total,
      share_age_0_14 = excluded.share_age_0_14,
      share_age_15_34 = excluded.share_age_15_34,
      share_age_35_64 = excluded.share_age_35_64,
      share_age_65_plus = excluded.share_age_65_plus,
      avg_income_estimate = excluded.avg_income_estimate,
      source = excluded.source,
      source_ref = excluded.source_ref,
      raw_payload = excluded.raw_payload,
      municipality_name = excluded.municipality_name,
      age_0_14_pct = excluded.age_0_14_pct,
      age_15_34_pct = excluded.age_15_34_pct,
      age_35_64_pct = excluded.age_35_64_pct,
      age_65_plus_pct = excluded.age_65_plus_pct,
      foreigners_pct = excluded.foreigners_pct,
      employment_rate = excluded.employment_rate,
      average_income = excluded.average_income,
      old_age_index = excluded.old_age_index,
      businesses_total = excluded.businesses_total,
      updated_at = now();
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count
  );
end;
$$;

create or replace function public.get_comuni_breakdown_in_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision
)
returns table (
  municipality_code text,
  comune_name text,
  households_total integer,
  population_total integer,
  area_km2 numeric,
  density_per_km2 numeric,
  pct_copertura numeric,
  volantini_nel_raggio integer,
  age_0_14_pct numeric,
  age_65_plus_pct numeric,
  average_income numeric,
  old_age_index numeric,
  businesses_total integer
)
language sql
stable
security invoker
as $$
  with point as (
    select st_setsrid(st_point(p_lng, p_lat), 4326)::geography as geog
  ),
  candidates as (
    select
      gm.*,
      st_area(st_intersection(gm.geom, st_buffer((select geog from point), p_radius_km * 1000)::geometry)::geography) as intersection_m2,
      st_area(gm.geom::geography) as municipality_m2
    from public.geo_municipalities gm
    where gm.geom is not null
      and st_dwithin(gm.geom::geography, (select geog from point), p_radius_km * 1000)
  )
  select
    c.municipality_code,
    c.municipality_name as comune_name,
    c.households_total,
    c.population_total,
    c.area_km2,
    c.density_per_km2,
    least(100, greatest(1, round((coalesce(c.intersection_m2 / nullif(c.municipality_m2, 0), 1) * 100)::numeric, 2))) as pct_copertura,
    case
      when c.households_total is null then null
      else greatest(0, round(c.households_total * coalesce(c.intersection_m2 / nullif(c.municipality_m2, 0), 1) * 1.1))::integer
    end as volantini_nel_raggio,
    di.age_0_14_pct,
    di.age_65_plus_pct,
    di.average_income,
    di.old_age_index,
    di.businesses_total
  from candidates c
  left join public.demographic_indicators di
    on di.municipality_code = c.municipality_code
  order by c.geom <-> st_setsrid(st_point(p_lng, p_lat), 4326);
$$;

create or replace function public.territorial_dataset_status()
returns table (
  postgis_enabled boolean,
  geo_municipalities_count bigint,
  demographic_indicators_count bigint,
  supported_regions text[],
  lombardia_municipalities_count bigint,
  target_municipalities_present bigint,
  random_validation_examples_present bigint
)
language sql
stable
security invoker
as $$
  with target_names(name) as (
    values
      ('milano'),
      ('sesto san giovanni'),
      ('cinisello balsamo'),
      ('bresso'),
      ('cormano'),
      ('cusano milanino'),
      ('paderno dugnano'),
      ('varedo'),
      ('monza'),
      ('nova milanese'),
      ('bollate'),
      ('senago'),
      ('desio'),
      ('muggio'),
      ('muggiò'),
      ('lissone')
  ),
  random_names(name) as (
    values
      ('lecco'),
      ('como'),
      ('bergamo'),
      ('brescia'),
      ('milano'),
      ('varedo'),
      ('paderno dugnano'),
      ('cormano'),
      ('cusano milanino')
  )
  select
    exists(select 1 from pg_extension where extname = 'postgis') as postgis_enabled,
    (select count(*) from public.geo_municipalities) as geo_municipalities_count,
    (select count(*) from public.demographic_indicators) as demographic_indicators_count,
    (select array_agg(distinct region_name order by region_name) from public.geo_municipalities where region_name is not null) as supported_regions,
    (select count(*) from public.geo_municipalities where region_code = '03' or lower(region_name) = 'lombardia') as lombardia_municipalities_count,
    (
      select count(distinct lower(gm.municipality_name))
      from public.geo_municipalities gm
      join target_names tn on lower(gm.municipality_name) = tn.name
    ) as target_municipalities_present,
    (
      select count(distinct lower(gm.municipality_name))
      from public.geo_municipalities gm
      join random_names rn on lower(gm.municipality_name) = rn.name
    ) as random_validation_examples_present;
$$;
