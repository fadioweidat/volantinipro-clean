-- GPS-PROD-6C RPC behavior contract.
-- Run only against a local database with synthetic users after applying the
-- design migration. The assertions intentionally exercise only the new
-- progress surface; production must not be used.
-- Requires psql because ON_ERROR_STOP is a psql meta-command.

\set ON_ERROR_STOP on

begin;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_campaign_zone_progress'
      and pg_get_function_identity_arguments(p.oid) = 'p_campaign_id uuid'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'get_campaign_zone_progress contract missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_set_zone_manual_progress'
      and pg_get_function_identity_arguments(p.oid) = 'p_campaign_zone_id uuid, p_manual_percent numeric, p_reason text'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'admin_set_zone_manual_progress contract missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_clear_zone_manual_progress'
      and pg_get_function_identity_arguments(p.oid) = 'p_campaign_zone_id uuid, p_reason text'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'admin_clear_zone_manual_progress contract missing';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'get_campaign_zone_progress',
        'admin_set_zone_manual_progress',
        'admin_clear_zone_manual_progress'
      )
      and grantee = 'anon'
  ) then
    raise exception 'anon must not execute zone progress RPCs';
  end if;
end $$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.get_campaign_zone_progress(uuid)'::regprocedure)
    into v_def;

  if v_def not like '%c.user_id = v_uid%' then
    raise exception 'read RPC must authorize customer ownership through campaigns.user_id';
  end if;

  if v_def like ('%public.' || 'clienti%') or v_def like ('%customer_' || 'id%') then
    raise exception 'read RPC must not use legacy customer ownership path';
  end if;

  if v_def not like '%not v_is_admin and not v_is_owner%' then
    raise exception 'read RPC must explicitly deny non-admin non-owners inside SECURITY DEFINER';
  end if;
end $$;

do $$
declare
  v_set_def text;
  v_clear_def text;
begin
  select pg_get_functiondef('public.admin_set_zone_manual_progress(uuid,numeric,text)'::regprocedure)
    into v_set_def;
  select pg_get_functiondef('public.admin_clear_zone_manual_progress(uuid,text)'::regprocedure)
    into v_clear_def;

  if v_set_def not like '%not public.gps_is_admin()%' then
    raise exception 'set RPC must check gps_is_admin()';
  end if;
  if v_clear_def not like '%not public.gps_is_admin()%' then
    raise exception 'clear RPC must check gps_is_admin()';
  end if;
  if v_set_def not like '%PERCENTUALE_NON_VALIDA%' then
    raise exception 'set RPC must reject percentages outside 0..100';
  end if;
  if v_set_def not like '%MOTIVO_OBBLIGATORIO%' or v_clear_def not like '%MOTIVO_OBBLIGATORIO%' then
    raise exception 'set/clear RPCs must require a reason';
  end if;
  if v_set_def not like '%campaign_zone_progress_history%' or v_clear_def not like '%campaign_zone_progress_history%' then
    raise exception 'set/clear RPCs must write history';
  end if;
  if v_set_def not like '%from public.campaign_zones z%' or v_clear_def not like '%from public.campaign_zones z%' then
    raise exception 'set/clear RPCs must derive campaign_id from campaign_zones';
  end if;
  if v_set_def like ('%customer_' || 'id%') or v_clear_def like ('%customer_' || 'id%')
     or v_set_def like ('%public.' || 'clienti%')
     or v_clear_def like ('%public.' || 'clienti%') then
    raise exception 'set/clear RPCs must not depend on legacy customer ownership';
  end if;
end $$;

-- Behavioral cases to run with synthetic local fixtures in the next validation
-- phase:
-- 1. automatic effective_percent when override is disabled;
-- 2. manual effective_percent when override is enabled;
-- 3. non-owner customer cannot read another campaign;
-- 4. owner customer receives only customer-safe JSON keys;
-- 5. non-admin cannot set or clear override;
-- 6. admin can set and clear override;
-- 7. each set/clear appends one history row;
-- 8. application roles cannot update or delete history rows.

rollback;
