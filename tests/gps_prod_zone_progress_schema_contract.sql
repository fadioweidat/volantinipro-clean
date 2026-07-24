-- GPS-PROD-6C schema contract.
-- Run only against a local database after applying the design migration.
-- This test is intentionally catalog-driven and does not contact production.
-- Requires psql because ON_ERROR_STOP is a psql meta-command.

\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.campaign_zone_progress') is null then
    raise exception 'missing campaign_zone_progress';
  end if;
  if to_regclass('public.campaign_zone_progress_history') is null then
    raise exception 'missing campaign_zone_progress_history';
  end if;
end $$;

do $$
declare
  missing text[];
begin
  select array_agg(expected.column_name order by expected.column_name)
    into missing
  from (
    values
      ('id'),
      ('campaign_zone_id'),
      ('campaign_id'),
      ('automatic_percent'),
      ('manual_percent'),
      ('manual_override_enabled'),
      ('effective_percent'),
      ('override_reason'),
      ('calculation_version'),
      ('source_summary'),
      ('automatic_updated_at'),
      ('updated_by'),
      ('created_at'),
      ('updated_at')
  ) as expected(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'campaign_zone_progress'
      and c.column_name = expected.column_name
  );

  if missing is not null then
    raise exception 'missing progress columns: %', missing;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_zone_progress'
      and column_name = 'effective_percent'
      and is_generated = 'ALWAYS'
  ) then
    raise exception 'effective_percent must be generated always';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_zone_progress'::regclass
      and conname = 'campaign_zone_progress_campaign_zone_uidx'
      and contype = 'u'
  ) then
    raise exception 'missing unique(campaign_zone_id)';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_zone_progress'::regclass
      and conname = 'campaign_zone_progress_zone_fkey'
      and contype = 'f'
  ) then
    raise exception 'missing FK to campaign_zones(id)';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_zones'::regclass
      and conname = 'campaign_zones_id_campaign_id_uidx'
  ) then
    raise exception 'campaign_zones must not gain redundant unique(id,campaign_id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.campaign_zone_progress'::regclass
      and tgname = 'set_campaign_zone_progress_campaign_id'
      and not tgisinternal
  ) then
    raise exception 'missing trigger deriving campaign_id from campaign_zones';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.campaign_zone_progress'::regclass
      and c.contype = 'f'
      and a.attname = 'updated_by'
      and c.confrelid = 'public.profiles'::regclass
  ) then
    raise exception 'updated_by must reference public.profiles(id)';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.campaign_zone_progress_history'::regclass
      and c.contype = 'f'
      and a.attname = 'changed_by'
      and c.confrelid = 'public.profiles'::regclass
  ) then
    raise exception 'changed_by must reference public.profiles(id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_zone_progress_history'::regclass
      and conname = 'campaign_zone_progress_history_event_type_check'
      and pg_get_constraintdef(oid) like '%automatic_recalc%'
      and pg_get_constraintdef(oid) like '%manual_override%'
      and pg_get_constraintdef(oid) like '%manual_clear%'
  ) then
    raise exception 'history event type contract missing';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_class
    where oid = 'public.campaign_zone_progress'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'campaign_zone_progress must have forced RLS';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.campaign_zone_progress_history'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'campaign_zone_progress_history must have forced RLS';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in ('campaign_zone_progress', 'campaign_zone_progress_history')
      and grantee = 'anon'
  ) then
    raise exception 'anon must not have grants on zone progress tables';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in ('campaign_zone_progress', 'campaign_zone_progress_history')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'authenticated must not have direct DML grants on zone progress tables';
  end if;
end $$;

rollback;
