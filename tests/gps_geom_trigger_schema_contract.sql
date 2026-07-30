-- GPS PHASE 5 schema contract.
-- Run only against a local/replayed database after applying
-- 031_fix_gps_geom_trigger_search_path.sql. Catalog-driven only, does not
-- contact production and does not insert/modify any data.
-- Requires psql because ON_ERROR_STOP is a psql meta-command.

\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regprocedure('public.set_gps_tracking_point_geom()') is null then
    raise exception 'missing set_gps_tracking_point_geom()';
  end if;
end $$;

do $$
declare
  cfg text[];
begin
  select proconfig into cfg
  from pg_proc
  where proname = 'set_gps_tracking_point_geom'
    and pronamespace = 'public'::regnamespace;

  if cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception 'set_gps_tracking_point_geom must have an explicit empty search_path';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    where p.proname = 'set_gps_tracking_point_geom'
      and p.pronamespace = 'public'::regnamespace
      and p.prosrc ~ 'public\.ST_SetSRID\(public\.ST_MakePoint'
  ) then
    raise exception 'set_gps_tracking_point_geom must call schema-qualified PostGIS functions';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'gps_tracking_points'
      and t.tgname = 'gps_tracking_points_set_geom'
      and p.proname = 'set_gps_tracking_point_geom'
      and not t.tgisinternal
  ) then
    raise exception 'missing gps_tracking_points_set_geom trigger wired to the fixed function';
  end if;
end $$;

do $$
declare
  extschema text;
begin
  select extnamespace::regnamespace::text into extschema
  from pg_extension where extname = 'postgis';

  if extschema is null then
    raise exception 'postgis extension not installed';
  end if;
  if extschema <> 'public' then
    raise exception 'postgis extension schema changed from the verified production value (public): now %', extschema;
  end if;
end $$;

rollback;

\echo 'gps_geom_trigger_schema_contract: PASS'
