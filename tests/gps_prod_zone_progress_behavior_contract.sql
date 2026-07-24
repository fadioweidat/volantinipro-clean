-- GPS-PROD-6C-R2 production-like behavior contract.
-- Run only with psql against the isolated local fixture database.
-- All mutations are wrapped in one transaction and rolled back.

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

create or replace function pg_temp.expect_error(
  p_statement text,
  p_expected_state text,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_actual_state text;
begin
  begin
    execute p_statement;
  exception
    when others then
      v_actual_state := sqlstate;
  end;

  if v_actual_state is null then
    raise exception 'ASSERTION_FAILED: % did not fail', p_label;
  end if;
  if v_actual_state <> p_expected_state then
    raise exception
      'ASSERTION_FAILED: % returned SQLSTATE %, expected %',
      p_label,
      v_actual_state,
      p_expected_state;
  end if;
  raise notice 'PASS: % (SQLSTATE %)', p_label, v_actual_state;
end;
$$;

-- Admin: authoritative production role is profiles.role = 'admin'.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000c","role":"authenticated"}',
  true
);
select pg_temp.assert_true(public.gps_is_admin(), 'admin gps_is_admin true');

select public.admin_set_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000a',
  42.50,
  'Correzione sintetica Admin'
);
select pg_temp.assert_true(
  (
    select manual_override_enabled
       and manual_percent = 42.50
       and effective_percent = 42.50
       and updated_by = '10000000-0000-0000-0000-00000000000c'::uuid
    from public.campaign_zone_progress
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000a'
  ),
  'admin set override and actor'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.campaign_zone_progress_history
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000a'
      and event_type = 'manual_override'
      and changed_by = '10000000-0000-0000-0000-00000000000c'::uuid
  ),
  'admin set history and actor'
);
select pg_temp.assert_true(
  jsonb_array_length(
    public.get_campaign_zone_progress(
      '30000000-0000-0000-0000-00000000000b'
    )
  ) = 1,
  'admin reads any campaign'
);

select public.admin_clear_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000a',
  'Ritorno sintetico ad automatico'
);
select pg_temp.assert_true(
  (
    select not manual_override_enabled
       and manual_percent is null
       and effective_percent = automatic_percent
       and updated_by = '10000000-0000-0000-0000-00000000000c'::uuid
    from public.campaign_zone_progress
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000a'
  ),
  'admin clear restores automatic percent'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.campaign_zone_progress_history
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000a'
      and event_type = 'manual_clear'
      and changed_by = '10000000-0000-0000-0000-00000000000c'::uuid
  ),
  'admin clear history and actor'
);

select public.admin_set_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000c',
  30,
  'Progress sintetico campagna B'
);
select pg_temp.assert_true(
  (select count(*) >= 3 from public.campaign_zone_progress_history),
  'admin can read history'
);
reset role;

-- Customer A: owner-only read, no Admin mutation and no history visibility.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);
select pg_temp.assert_true(not public.gps_is_admin(), 'customer is not admin');
select pg_temp.assert_true(
  jsonb_array_length(
    public.get_campaign_zone_progress(
      '30000000-0000-0000-0000-00000000000a'
    )
  ) = 2,
  'owner reads own campaign zones'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.campaign_zone_progress
    where campaign_id = '30000000-0000-0000-0000-00000000000a'
  ),
  'owner reads own persisted progress'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.campaign_zone_progress
    where campaign_id = '30000000-0000-0000-0000-00000000000b'
  ),
  'customer cannot read another campaign progress'
);
select pg_temp.expect_error(
  $$select public.get_campaign_zone_progress('30000000-0000-0000-0000-00000000000b')$$,
  '42501',
  'customer RPC cannot read another campaign'
);
select pg_temp.expect_error(
  $$select public.admin_set_zone_manual_progress(
      '40000000-0000-0000-0000-00000000000a', 10, 'Negato'
    )$$,
  '42501',
  'customer Admin RPC denied'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.campaign_zone_progress_history),
  'customer cannot read history'
);
reset role;

-- Super Admin is intentionally not part of the production gps_is_admin gate.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000d","role":"authenticated"}',
  true
);
select pg_temp.assert_true(not public.gps_is_admin(), 'super_admin gps_is_admin false');
select pg_temp.expect_error(
  $$select public.admin_set_zone_manual_progress(
      '40000000-0000-0000-0000-00000000000a', 10, 'Negato'
    )$$,
  '42501',
  'super_admin Admin RPC denied'
);
select pg_temp.expect_error(
  $$select public.get_campaign_zone_progress('30000000-0000-0000-0000-00000000000a')$$,
  '42501',
  'super_admin has no implicit customer or Admin read'
);
reset role;

-- service_role uses the production Admin gate without an auth.uid actor.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.assert_true(public.gps_is_admin(), 'service_role gps_is_admin true');
select public.admin_set_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000b',
  55,
  'Operazione sintetica service_role'
);
reset role;
select pg_temp.assert_true(
  (
    select updated_by is null
    from public.campaign_zone_progress
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000b'
  ),
  'service_role progress actor is null'
);
select pg_temp.assert_true(
  (
    select changed_by is null
    from public.campaign_zone_progress_history
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000b'
      and event_type = 'manual_override'
    order by created_at desc
    limit 1
  ),
  'service_role history actor is null'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.admin_clear_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000b',
  'Clear sintetico service_role'
);
select pg_temp.assert_true(
  jsonb_array_length(
    public.get_campaign_zone_progress(
      '30000000-0000-0000-0000-00000000000a'
    )
  ) = 2,
  'service_role reads progress RPC'
);
reset role;
select pg_temp.assert_true(
  (
    select updated_by is null
    from public.campaign_zone_progress
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000b'
  ) and (
    select changed_by is null
    from public.campaign_zone_progress_history
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000b'
      and event_type = 'manual_clear'
    order by created_at desc
    limit 1
  ),
  'service_role clear actors are null'
);

-- anon has no table, RPC or DML privileges.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_error(
  'select * from public.campaign_zone_progress',
  '42501',
  'anon SELECT progress denied'
);
select pg_temp.expect_error(
  'select * from public.campaign_zone_progress_history',
  '42501',
  'anon SELECT history denied'
);
select pg_temp.expect_error(
  $$select public.get_campaign_zone_progress('30000000-0000-0000-0000-00000000000a')$$,
  '42501',
  'anon EXECUTE RPC denied'
);
select pg_temp.expect_error(
  $$insert into public.campaign_zone_progress (campaign_zone_id, campaign_id)
    values (
      '40000000-0000-0000-0000-00000000000b',
      '30000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  'anon DML denied'
);
reset role;

-- Authenticated non-admin users have SELECT-only table grants.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);
select pg_temp.expect_error(
  $$insert into public.campaign_zone_progress (campaign_zone_id, campaign_id)
    values (
      '40000000-0000-0000-0000-00000000000b',
      '30000000-0000-0000-0000-00000000000a'
    )$$,
  '42501',
  'authenticated INSERT progress denied'
);
select pg_temp.expect_error(
  'update public.campaign_zone_progress set automatic_percent = 1',
  '42501',
  'authenticated UPDATE progress denied'
);
select pg_temp.expect_error(
  'delete from public.campaign_zone_progress',
  '42501',
  'authenticated DELETE progress denied'
);
select pg_temp.expect_error(
  $$insert into public.campaign_zone_progress_history (
      campaign_zone_id, campaign_id, event_type, reason
    ) values (
      '40000000-0000-0000-0000-00000000000a',
      '30000000-0000-0000-0000-00000000000a',
      'manual_override',
      'Negato'
    )$$,
  '42501',
  'authenticated INSERT history denied'
);
select pg_temp.expect_error(
  $$update public.campaign_zone_progress_history set reason = 'Negato'$$,
  '42501',
  'authenticated UPDATE history denied'
);
select pg_temp.expect_error(
  'delete from public.campaign_zone_progress_history',
  '42501',
  'authenticated DELETE history denied'
);
reset role;

-- Input validation through Admin RPCs.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000c","role":"authenticated"}',
  true
);
select pg_temp.expect_error(
  $$select public.admin_set_zone_manual_progress(
      '40000000-0000-0000-0000-00000000000a', -0.01, 'Negativo'
    )$$,
  '22023',
  'negative percentage denied'
);
select pg_temp.expect_error(
  $$select public.admin_set_zone_manual_progress(
      '40000000-0000-0000-0000-00000000000a', 100.01, 'Eccessivo'
    )$$,
  '22023',
  'percentage above 100 denied'
);
select pg_temp.expect_error(
  $$select public.admin_set_zone_manual_progress(
      '40000000-0000-0000-0000-00000000000a', 10, '   '
    )$$,
  '22023',
  'empty set reason denied'
);
select pg_temp.expect_error(
  $$select public.admin_clear_zone_manual_progress(
      '40000000-0000-0000-0000-00000000000a', null
    )$$,
  '22023',
  'missing clear reason denied'
);
reset role;

-- campaign_id is derived from campaign_zones and mismatches are rejected.
delete from public.campaign_zone_progress
where campaign_zone_id = '40000000-0000-0000-0000-00000000000b';
insert into public.campaign_zone_progress (campaign_zone_id)
values ('40000000-0000-0000-0000-00000000000b');
select pg_temp.assert_true(
  (
    select campaign_id = '30000000-0000-0000-0000-00000000000a'::uuid
    from public.campaign_zone_progress
    where campaign_zone_id = '40000000-0000-0000-0000-00000000000b'
  ),
  'campaign_id derived from campaign zone'
);
delete from public.campaign_zone_progress
where campaign_zone_id = '40000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error(
  $$insert into public.campaign_zone_progress (campaign_zone_id, campaign_id)
    values (
      '40000000-0000-0000-0000-00000000000b',
      '30000000-0000-0000-0000-00000000000b'
    )$$,
  '23514',
  'campaign and zone mismatch denied'
);

rollback;

\echo 'GPS zone progress behavior contract: 38 passed, 0 failed'
