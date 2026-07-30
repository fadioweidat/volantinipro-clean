-- GPS PHASE 4 schema contract.
-- Run only against a local/replayed database after applying
-- 030_reconcile_gps_session_rpc.sql. Catalog-driven only, does not contact
-- production and does not insert/modify any data.
-- Requires psql because ON_ERROR_STOP is a psql meta-command.

\set ON_ERROR_STOP on

begin;

do $$
declare
  missing text[];
begin
  select array_agg(fn order by fn)
    into missing
  from (
    values
      ('gps_start_session'),
      ('gps_transition_session'),
      ('gps_insert_point'),
      ('gps_heartbeat_session'),
      ('gps_get_operator_campaign'),
      ('gps_is_admin'),
      ('gps_assignment_is_valid')
  ) as expected(fn)
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = expected.fn
  );

  if missing is not null then
    raise exception 'missing GPS RPC functions: %', missing;
  end if;
end $$;

do $$
declare
  bad text[];
begin
  select array_agg(p.proname order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'gps_start_session', 'gps_transition_session', 'gps_insert_point',
      'gps_heartbeat_session', 'gps_get_operator_campaign', 'gps_is_admin',
      'gps_assignment_is_valid'
    )
    and (
      not p.prosecdef
      or p.proconfig is null
      or not ('search_path=""' = any (p.proconfig))
    );

  if bad is not null then
    raise exception 'GPS RPC functions missing SECURITY DEFINER or empty search_path: %', bad;
  end if;
end $$;

do $$
declare
  fn text;
  has_anon boolean;
  has_authenticated boolean;
  has_service_role boolean;
begin
  foreach fn in array array[
    'gps_start_session', 'gps_transition_session', 'gps_insert_point',
    'gps_heartbeat_session', 'gps_get_operator_campaign', 'gps_is_admin',
    'gps_assignment_is_valid'
  ]
  loop
    select
      bool_or(r.rolname = 'anon'),
      bool_or(r.rolname = 'authenticated'),
      bool_or(r.rolname = 'service_role')
      into has_anon, has_authenticated, has_service_role
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
    lateral aclexplode(p.proacl) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and p.proname = fn and a.privilege_type = 'EXECUTE';

    if has_anon then
      raise exception '% must not be executable by anon', fn;
    end if;
    if not has_authenticated or not has_service_role then
      raise exception '% must be executable by authenticated and service_role', fn;
    end if;
  end loop;
end $$;

do $$
declare
  missing text[];
begin
  select array_agg(t order by t)
    into missing
  from (
    values
      ('profiles'), ('campaigns'), ('operational_groups'),
      ('operator_assignments'), ('operator_profiles'), ('gps_operator_audit_log')
  ) as expected(t)
  where to_regclass('public.' || expected.t) is null;

  if missing is not null then
    raise exception 'missing GPS reconciliation prerequisite tables: %', missing;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'delivery_sessions'
      and indexname = 'delivery_sessions_one_active_operator_campaign_uidx'
  ) then
    raise exception 'missing partial unique index enforcing one active session per driver+campaign';
  end if;
end $$;

do $$
declare
  missing text[];
begin
  select array_agg(t order by t)
    into missing
  from (
    values
      ('operational_groups'), ('operator_assignments'),
      ('operator_profiles'), ('gps_operator_audit_log')
  ) as expected(t)
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = expected.t
      and c.relrowsecurity
      and c.relforcerowsecurity
  );

  if missing is not null then
    raise exception 'GPS reconciliation tables missing forced RLS: %', missing;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'campaigns' and c.relrowsecurity
  ) then
    raise exception 'campaigns must have RLS enabled';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity
  ) then
    raise exception 'profiles must have RLS enabled';
  end if;
end $$;

rollback;

\echo 'gps_rpc_reconciliation_schema_contract: PASS'
