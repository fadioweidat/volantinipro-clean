-- 3B.4-S controlled release: apply ONLY 20261009120000_smart_pairing_slots_write_lockdown.sql.
-- NOT AUTHORIZED UNTIL EXPLICIT APPROVAL. Never use `supabase db push`: 11 other repo
-- migrations are not in Production history and would be pushed too.
-- Run as role postgres, as ONE transaction. This file has its own BEGIN/COMMIT, so use
-- the SQL editor "Run" or `psql -v ON_ERROR_STOP=1 -f <this file>` (no -1).
-- Any failed guard aborts everything and nothing is committed.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Guard 1: live state must still be the preflighted state (2026-10-09).
do $$
begin
  if current_setting('server_version_num')::int < 170000 then
    raise exception '3B4S_ABORT: PostgreSQL >= 17 required for MAINTAIN';
  end if;
  if current_user <> 'postgres' then
    raise exception '3B4S_ABORT: run as postgres (grantor/owner), not %', current_user;
  end if;
  if (select relacl::text from pg_class where oid = 'public.smart_pairing_slots'::regclass)
     <> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception '3B4S_ABORT: table ACL differs from preflight';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.smart_pairing_slots'::regclass and attacl is not null) then
    raise exception '3B4S_ABORT: unexpected column-level ACL';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots') <> 2
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots'
                    and policyname = 'Public read slots' and cmd = 'SELECT' and roles = '{public}' and qual = 'true' and with_check is null)
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots'
                    and policyname = 'Service role all' and cmd = 'ALL' and roles = '{public}' and qual = 'true' and with_check = 'true') then
    raise exception '3B4S_ABORT: policies differ from preflight';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261009120000') then
    raise exception '3B4S_ABORT: version 20261009120000 already recorded';
  end if;
end $$;

-- ===== BEGIN 20261009120000_smart_pairing_slots_write_lockdown.sql (verbatim statements) =====
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.smart_pairing_slots from anon, authenticated;

drop policy if exists "Service role all" on public.smart_pairing_slots;
drop policy if exists "smart_pairing_slots_service_role_all" on public.smart_pairing_slots;
create policy "smart_pairing_slots_service_role_all"
  on public.smart_pairing_slots
  for all
  to service_role
  using (true)
  with check (true);
-- ===== END migration =====

-- Guard 2: effective result, checked inside the same transaction.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if not has_table_privilege(r, 'public.smart_pairing_slots', 'SELECT') then
      raise exception '3B4S_ABORT: % lost SELECT', r;
    end if;
    if has_table_privilege(r, 'public.smart_pairing_slots', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') then
      raise exception '3B4S_ABORT: % still has a write privilege', r;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.smart_pairing_slots', 'SELECT')
     or not has_table_privilege('service_role', 'public.smart_pairing_slots', 'INSERT')
     or not has_table_privilege('service_role', 'public.smart_pairing_slots', 'UPDATE')
     or not has_table_privilege('service_role', 'public.smart_pairing_slots', 'DELETE') then
    raise exception '3B4S_ABORT: service_role lost access';
  end if;
  if (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots')
     <> array['Public read slots', 'smart_pairing_slots_service_role_all'] then
    raise exception '3B4S_ABORT: unexpected policy set';
  end if;
end $$;

-- Keep migration history consistent with the repo (same shape as existing rows).
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261009120000', 'smart_pairing_slots_write_lockdown', array[
  'revoke insert, update, delete, truncate, references, trigger, maintain on table public.smart_pairing_slots from anon, authenticated',
  'drop policy if exists "Service role all" on public.smart_pairing_slots',
  'drop policy if exists "smart_pairing_slots_service_role_all" on public.smart_pairing_slots',
  'create policy "smart_pairing_slots_service_role_all" on public.smart_pairing_slots for all to service_role using (true) with check (true)'
]);

commit;
