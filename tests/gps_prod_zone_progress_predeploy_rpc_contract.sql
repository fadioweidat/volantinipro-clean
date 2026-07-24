-- GPS-PROD-6M forward-only RPC contract. Local database only.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_set text;
  v_clear text;
  v_lock text := 'pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_campaign_zone_id::text,0))';
begin
  select lower(pg_get_functiondef(
    'public.admin_set_zone_manual_progress(uuid,numeric,text)'::regprocedure
  )) into v_set;
  select lower(pg_get_functiondef(
    'public.admin_clear_zone_manual_progress(uuid,text)'::regprocedure
  )) into v_clear;

  if position(v_lock in regexp_replace(v_set, '\s+', '', 'g')) = 0
     or position(v_lock in regexp_replace(v_clear, '\s+', '', 'g')) = 0 then
    raise exception 'both Admin RPCs must use the same transaction advisory lock';
  end if;

  if position('pg_advisory_xact_lock' in v_set) > position('into v_old' in v_set)
     or position('pg_advisory_xact_lock' in v_clear) > position('into v_old' in v_clear) then
    raise exception 'advisory lock must precede old-state read';
  end if;

  if v_set like '%pg_advisory_lock(%' or v_clear like '%pg_advisory_lock(%' then
    raise exception 'session-level advisory locks are forbidden';
  end if;

  if v_set like '%execute %' or v_clear like '%execute %' then
    raise exception 'dynamic SQL is forbidden';
  end if;

  if v_set not like '%campaign_zone_id_snapshot%'
     or v_set not like '%campaign_id_snapshot%'
     or v_set not like '%zone_name_snapshot%'
     or v_clear not like '%campaign_zone_id_snapshot%'
     or v_clear not like '%campaign_id_snapshot%'
     or v_clear not like '%zone_name_snapshot%' then
    raise exception 'both Admin RPCs must populate history snapshots';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'admin_set_zone_manual_progress',
        'admin_clear_zone_manual_progress'
      )
      and grantee = 'anon'
  ) then
    raise exception 'anon must not execute Admin progress RPCs';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.admin_set_zone_manual_progress(uuid,numeric,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.admin_set_zone_manual_progress(uuid,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated and service_role RPC grants must remain available';
  end if;
end $$;

rollback;

\echo 'GPS zone progress predeploy RPC contract: PASS'
