-- Reconcile public.territorial_profile_indicators after partially applied
-- versions of migrations 025/026.
--
-- This migration intentionally does not recreate an authenticated-admin write
-- policy. Writes are reserved to trusted service_role processes. Public API
-- roles can read only the normalized columns; raw_payload remains private.

begin;

do $$
begin
  if to_regclass('public.territorial_profile_indicators') is null then
    raise exception
      'public.territorial_profile_indicators is missing; apply the base schema before migration 028'
      using errcode = '42P01';
  end if;
end
$$;

-- Final DUSAF columns introduced by migration 026. IF NOT EXISTS reconciles
-- legacy tables without pretending to fix an incompatible existing type.
alter table public.territorial_profile_indicators
  add column if not exists green_agricultural_area_pct numeric,
  add column if not exists other_infrastructure_water_area_pct numeric;

-- Fail before replacing constraints or privileges when an existing column has
-- a type different from the canonical 026 schema.
do $$
declare
  mismatches text;
begin
  select string_agg(
           format('%I: expected %s, found %s',
             expected.column_name,
             expected.expected_type,
             coalesce(format_type(attribute.atttypid, attribute.atttypmod), 'MISSING')),
           '; ' order by expected.column_name
         )
    into mismatches
  from (
    values
      ('id', 'uuid'),
      ('geography_type', 'text'),
      ('geography_ref', 'text'),
      ('municipality_code', 'text'),
      ('municipality_name', 'text'),
      ('reference_year', 'integer'),
      ('source', 'text'),
      ('avg_household_size', 'numeric'),
      ('single_households_pct', 'numeric'),
      ('couples_no_children_pct', 'numeric'),
      ('families_with_children_pct', 'numeric'),
      ('single_parent_households_pct', 'numeric'),
      ('other_households_pct', 'numeric'),
      ('residential_area_pct', 'numeric'),
      ('commercial_industrial_area_pct', 'numeric'),
      ('green_agricultural_area_pct', 'numeric'),
      ('other_infrastructure_water_area_pct', 'numeric'),
      ('raw_payload', 'jsonb'),
      ('imported_at', 'timestamp with time zone'),
      ('updated_at', 'timestamp with time zone')
  ) as expected(column_name, expected_type)
  left join pg_attribute as attribute
    on attribute.attrelid = 'public.territorial_profile_indicators'::regclass
   and attribute.attname = expected.column_name
   and attribute.attnum > 0
   and not attribute.attisdropped
  where attribute.attname is null
     or format_type(attribute.atttypid, attribute.atttypmod) <> expected.expected_type;

  if mismatches is not null then
    raise exception 'territorial_profile_indicators schema mismatch: %', mismatches
      using errcode = '42804';
  end if;
end
$$;

-- Preserve a legacy mixed-green value when possible. Conflicting populated
-- values are never overwritten automatically.
do $$
declare
  legacy_type text;
  has_conflict boolean;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into legacy_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.territorial_profile_indicators'::regclass
    and attribute.attname = 'mixed_green_area_pct'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if legacy_type is not null then
    if legacy_type <> 'numeric' then
      raise exception 'mixed_green_area_pct: expected numeric, found %', legacy_type
        using errcode = '42804';
    end if;

    select exists (
      select 1
      from public.territorial_profile_indicators
      where mixed_green_area_pct is not null
        and green_agricultural_area_pct is not null
        and mixed_green_area_pct is distinct from green_agricultural_area_pct
    ) into has_conflict;

    if has_conflict then
      raise exception
        'mixed_green_area_pct conflicts with green_agricultural_area_pct; manual reconciliation required'
        using errcode = '23514';
    end if;

    update public.territorial_profile_indicators
       set green_agricultural_area_pct = mixed_green_area_pct
     where green_agricultural_area_pct is null
       and mixed_green_area_pct is not null;

    alter table public.territorial_profile_indicators
      drop column mixed_green_area_pct;
  end if;
end
$$;

-- The DUSAF source does not distinguish commercial from industrial land.
-- Refuse silent data loss if either obsolete column is populated.
do $$
declare
  obsolete_column text;
  has_values boolean;
begin
  foreach obsolete_column in array array['commercial_area_pct', 'industrial_area_pct']
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'territorial_profile_indicators'
        and column_name = obsolete_column
    ) then
      execute format(
        'select exists (select 1 from public.territorial_profile_indicators where %I is not null)',
        obsolete_column
      ) into has_values;

      if has_values then
        raise exception '% contains data; manual reconciliation required', obsolete_column
          using errcode = '23514';
      end if;

      execute format(
        'alter table public.territorial_profile_indicators drop column %I',
        obsolete_column
      );
    end if;
  end loop;
end
$$;

create unique index if not exists territorial_profile_indicators_unique_geo_year_source
  on public.territorial_profile_indicators
  (geography_type, geography_ref, reference_year, source);

-- CREATE INDEX IF NOT EXISTS does not repair an incompatible index with the
-- same name, so verify uniqueness and key order explicitly.
do $$
declare
  index_is_compatible boolean;
begin
  select index_meta.indisunique
     and array(
       select attribute.attname
       from unnest(index_meta.indkey::smallint[]) with ordinality as key(attnum, position)
       join pg_attribute as attribute
         on attribute.attrelid = index_meta.indrelid
        and attribute.attnum = key.attnum
       order by key.position
     ) = array['geography_type', 'geography_ref', 'reference_year', 'source']::name[]
    into index_is_compatible
  from pg_index as index_meta
  join pg_class as index_class on index_class.oid = index_meta.indexrelid
  join pg_namespace as namespace on namespace.oid = index_class.relnamespace
  where namespace.nspname = 'public'
    and index_class.relname = 'territorial_profile_indicators_unique_geo_year_source';

  if index_is_compatible is distinct from true then
    raise exception
      'territorial_profile_indicators_unique_geo_year_source has an incompatible definition'
      using errcode = '42P07';
  end if;
end
$$;

alter table public.territorial_profile_indicators
  drop constraint if exists territorial_profile_indicators_pct_range_check;

alter table public.territorial_profile_indicators
  add constraint territorial_profile_indicators_pct_range_check check (
    (single_households_pct is null or single_households_pct between 0 and 100) and
    (couples_no_children_pct is null or couples_no_children_pct between 0 and 100) and
    (families_with_children_pct is null or families_with_children_pct between 0 and 100) and
    (single_parent_households_pct is null or single_parent_households_pct between 0 and 100) and
    (other_households_pct is null or other_households_pct between 0 and 100) and
    (residential_area_pct is null or residential_area_pct between 0 and 100) and
    (commercial_industrial_area_pct is null or commercial_industrial_area_pct between 0 and 100) and
    (green_agricultural_area_pct is null or green_agricultural_area_pct between 0 and 100) and
    (other_infrastructure_water_area_pct is null or other_infrastructure_water_area_pct between 0 and 100)
  ) not valid;

alter table public.territorial_profile_indicators
  validate constraint territorial_profile_indicators_pct_range_check;

alter table public.territorial_profile_indicators enable row level security;

drop policy if exists territorial_profile_indicators_admin_write
  on public.territorial_profile_indicators;

drop policy if exists territorial_profile_indicators_select_anon
  on public.territorial_profile_indicators;

create policy territorial_profile_indicators_select_anon
  on public.territorial_profile_indicators
  for select
  to anon, authenticated
  using (true);

-- RLS does not replace SQL privileges. Remove all browser-role write access
-- (including TRUNCATE) and keep raw_payload unavailable to public API roles.
revoke all privileges on table public.territorial_profile_indicators
  from public, anon, authenticated;

grant select (
  id,
  geography_type,
  geography_ref,
  municipality_code,
  municipality_name,
  reference_year,
  source,
  avg_household_size,
  single_households_pct,
  couples_no_children_pct,
  families_with_children_pct,
  single_parent_households_pct,
  other_households_pct,
  residential_area_pct,
  commercial_industrial_area_pct,
  green_agricultural_area_pct,
  other_infrastructure_water_area_pct,
  imported_at,
  updated_at
) on table public.territorial_profile_indicators to anon, authenticated;

grant select, insert, update, delete
  on table public.territorial_profile_indicators to service_role;

comment on table public.territorial_profile_indicators is
  'Normalized territorial indicators: public read of mapped columns; writes and raw_payload reserved to service_role.';

comment on column public.territorial_profile_indicators.raw_payload is
  'Private source payload for trusted imports and audit; not exposed to anon or authenticated.';

-- Postconditions: no browser-role writes, no public raw payload, no admin
-- policy, and the public normalized SELECT policy is present.
do $$
begin
  if has_table_privilege('anon', 'public.territorial_profile_indicators', 'INSERT')
     or has_table_privilege('anon', 'public.territorial_profile_indicators', 'UPDATE')
     or has_table_privilege('anon', 'public.territorial_profile_indicators', 'DELETE')
     or has_table_privilege('anon', 'public.territorial_profile_indicators', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.territorial_profile_indicators', 'INSERT')
     or has_table_privilege('authenticated', 'public.territorial_profile_indicators', 'UPDATE')
     or has_table_privilege('authenticated', 'public.territorial_profile_indicators', 'DELETE')
     or has_table_privilege('authenticated', 'public.territorial_profile_indicators', 'TRUNCATE') then
    raise exception 'browser roles still have write privileges on territorial_profile_indicators'
      using errcode = '42501';
  end if;

  if has_column_privilege('anon', 'public.territorial_profile_indicators', 'raw_payload', 'SELECT')
     or has_column_privilege('authenticated', 'public.territorial_profile_indicators', 'raw_payload', 'SELECT') then
    raise exception 'raw_payload is still readable by a browser role'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from pg_class as table_meta
    join pg_namespace as namespace on namespace.oid = table_meta.relnamespace
    where namespace.nspname = 'public'
      and table_meta.relname = 'territorial_profile_indicators'
      and table_meta.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on territorial_profile_indicators'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'territorial_profile_indicators'
      and policyname = 'territorial_profile_indicators_admin_write'
  ) then
    raise exception 'authenticated admin write policy still exists'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'territorial_profile_indicators'
      and policyname = 'territorial_profile_indicators_select_anon'
      and cmd = 'SELECT'
      and roles @> array['anon', 'authenticated']::name[]
  ) then
    raise exception 'public normalized SELECT policy is missing'
      using errcode = '42501';
  end if;
end
$$;

commit;
