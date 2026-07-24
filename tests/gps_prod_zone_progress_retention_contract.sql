-- GPS-PROD-6M destructive retention contract. Isolated local database only.
\set ON_ERROR_STOP on
\pset pager off

begin;

create or replace function pg_temp.assert_true(
  p_condition boolean,
  p_label text
)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'ASSERTION_FAILED: %', p_label;
  end if;
  raise notice 'PASS: %', p_label;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000c","role":"authenticated"}',
  true
);
select public.admin_set_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000c',
  64,
  'Retention contract override'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
       and bool_and(campaign_id_snapshot = '30000000-0000-0000-0000-00000000000b'::uuid)
       and bool_and(campaign_zone_id_snapshot = '40000000-0000-0000-0000-00000000000c'::uuid)
       and bool_and(zone_name_snapshot = 'Zona B1')
    from public.campaign_zone_progress_history
    where reason = 'Retention contract override'
  ),
  'Admin override creates immutable origin snapshots'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.campaign_zone_progress_history
    where reason = 'Retention contract override'
  ),
  'Admin can read retained history'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000b","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.campaign_zone_progress_history),
  'Customer cannot read history'
);
reset role;

delete from public.campaign_zones
where id = '40000000-0000-0000-0000-00000000000c';

select pg_temp.assert_true(
  not exists (
    select 1
    from public.campaign_zone_progress
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000c'
  ),
  'Zone deletion removes operational progress'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
       and bool_and(campaign_zone_id is null)
       and bool_and(campaign_zone_id_snapshot = '40000000-0000-0000-0000-00000000000c'::uuid)
    from public.campaign_zone_progress_history
    where reason = 'Retention contract override'
  ),
  'Zone deletion retains history and zone snapshot'
);

delete from public.campaigns
where id = '30000000-0000-0000-0000-00000000000b';

select pg_temp.assert_true(
  (
    select count(*) = 1
       and bool_and(campaign_id is null)
       and bool_and(campaign_id_snapshot = '30000000-0000-0000-0000-00000000000b'::uuid)
    from public.campaign_zone_progress_history
    where reason = 'Retention contract override'
  ),
  'Campaign deletion retains history and campaign snapshot'
);

do $$
begin
  begin
    update public.campaign_zone_progress_history
    set zone_name_snapshot = 'Mutazione vietata'
    where reason = 'Retention contract override';
    raise exception 'snapshot update unexpectedly succeeded';
  exception
    when sqlstate '23000' then
      raise notice 'PASS: snapshot mutation denied';
  end;
end $$;

delete from public.profiles
where id = '10000000-0000-0000-0000-00000000000c';

select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(changed_by is null)
    from public.campaign_zone_progress_history
    where reason = 'Retention contract override'
  ),
  'Actor FK remains ON DELETE SET NULL'
);

commit;

\echo 'GPS zone progress retention contract: 8 passed, 0 failed'
