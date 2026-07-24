-- GPS-PROD-6M forward-only schema contract. Local database only.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_campaign_delete "char";
  v_zone_delete "char";
begin
  select c.confdeltype
    into v_campaign_delete
  from pg_constraint c
  where c.conrelid = 'public.campaign_zone_progress_history'::regclass
    and c.conname = 'campaign_zone_progress_history_campaign_id_fkey';

  select c.confdeltype
    into v_zone_delete
  from pg_constraint c
  where c.conrelid = 'public.campaign_zone_progress_history'::regclass
    and c.conname = 'campaign_zone_progress_history_campaign_zone_id_fkey';

  if v_campaign_delete is distinct from 'n'::"char"
     or v_zone_delete is distinct from 'n'::"char" then
    raise exception 'history campaign/zone FKs must use ON DELETE SET NULL';
  end if;

  if exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.campaign_zone_progress_history'::regclass
      and c.conname in (
        'campaign_zone_progress_history_campaign_id_fkey',
        'campaign_zone_progress_history_campaign_zone_id_fkey'
      )
      and c.confdeltype = 'c'
  ) then
    raise exception 'history must not cascade from campaign or campaign zone';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.campaign_zone_progress'::regclass
      and c.conname = 'campaign_zone_progress_zone_fkey'
      and c.confdeltype = 'c'
  ) then
    raise exception 'operational progress must retain zone ON DELETE CASCADE';
  end if;
end $$;

do $$
declare
  v_missing text[];
begin
  select array_agg(e.name order by e.name)
    into v_missing
  from (
    values
      ('campaign_id_snapshot'),
      ('campaign_zone_id_snapshot'),
      ('zone_name_snapshot')
  ) as e(name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'campaign_zone_progress_history'
      and c.column_name = e.name
  );

  if v_missing is not null then
    raise exception 'missing history snapshot columns: %', v_missing;
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'campaign_zone_progress_history'
      and c.column_name in ('campaign_id_snapshot', 'campaign_zone_id_snapshot')
      and c.is_nullable <> 'NO'
  ) then
    raise exception 'snapshot identifiers must be NOT NULL';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'campaign_zone_progress_history'
      and c.column_name in ('campaign_id', 'campaign_zone_id')
      and c.is_nullable <> 'YES'
  ) then
    raise exception 'live history references must be nullable';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.campaign_zone_progress_history'::regclass
      and tgname = 'protect_campaign_zone_progress_history_snapshots'
      and not tgisinternal
  ) then
    raise exception 'snapshot immutability trigger missing';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in (
        'campaign_zone_progress',
        'campaign_zone_progress_history'
      )
      and grantee = 'anon'
  ) then
    raise exception 'anon must have no zone progress table grant';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in (
        'campaign_zone_progress',
        'campaign_zone_progress_history'
      )
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'authenticated direct DML must remain denied';
  end if;
end $$;

rollback;

\echo 'GPS zone progress predeploy schema contract: PASS'
