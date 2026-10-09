-- 3B.4-D6 controlled release: apply ONLY 20261009150000_campaigns_owner_write_lockdown.sql.
-- NOT AUTHORIZED UNTIL EXPLICIT APPROVAL. Never use `supabase db push` (Production
-- migration history diverges from the repository).
-- Run as role postgres, as ONE transaction. This file has its own BEGIN/COMMIT: use the
-- SQL editor "Run", `supabase db query --linked -f <this file>` (the tested path), or
-- `psql -v ON_ERROR_STOP=1 -f <this file>` (no -1). Any failed guard aborts everything.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Guard 1: live state must still be the audited state (2026-10-09).
do $$
begin
  if current_setting('server_version_num')::int < 170000 then
    raise exception '3B4D6_ABORT: PostgreSQL >= 17 required for MAINTAIN';
  end if;
  if current_user <> 'postgres' then
    raise exception '3B4D6_ABORT: run as postgres (grantor/owner), not %', current_user;
  end if;
  if (select relacl::text from pg_class where oid = 'public.campaigns'::regclass)
     <> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception '3B4D6_ABORT: campaigns ACL differs from audit';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.campaigns'::regclass and attacl is not null) then
    raise exception '3B4D6_ABORT: unexpected column-level ACL on campaigns';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.campaigns'::regclass) then
    raise exception '3B4D6_ABORT: RLS disabled on campaigns';
  end if;
  if (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'campaigns')
       <> array['campaigns_admin_all', 'campaigns_own_insert', 'campaigns_own_select', 'campaigns_own_update']
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_own_insert'
                    and cmd = 'INSERT' and roles = '{authenticated}' and qual is null and with_check = '(auth.uid() = user_id)')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_own_update'
                    and cmd = 'UPDATE' and roles = '{authenticated}' and qual = '(auth.uid() = user_id)' and with_check = '(auth.uid() = user_id)')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_own_select'
                    and cmd = 'SELECT' and roles = '{authenticated}' and qual = '(auth.uid() = user_id)')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_admin_all'
                    and cmd = 'ALL' and roles = '{authenticated}' and qual ~ 'profiles\.role = ANY \(ARRAY\[''admin''::text, ''super_admin''::text\]\)') then
    raise exception '3B4D6_ABORT: campaigns policies differ from audit';
  end if;
  if (select array_agg(tgname::text order by tgname) from pg_trigger where tgrelid = 'public.campaigns'::regclass and not tgisinternal)
     <> array['campaigns_marketplace_assignment_guard_trg', 'campaigns_marketplace_code', 'set_campaigns_updated_at'] then
    raise exception '3B4D6_ABORT: campaigns triggers differ from audit';
  end if;
  if exists (select 1 from pg_proc where proname = 'campaigns_client_write_guard' and pronamespace = 'public'::regnamespace) then
    raise exception '3B4D6_ABORT: campaigns_client_write_guard already exists';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261009150000') then
    raise exception '3B4D6_ABORT: version 20261009150000 already recorded';
  end if;
end $$;

-- ===== BEGIN 20261009150000_campaigns_owner_write_lockdown.sql (verbatim statements) =====
drop policy if exists "campaigns_own_insert" on public.campaigns;
drop policy if exists "campaigns_own_update" on public.campaigns;

revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.campaigns from anon;
revoke truncate, references, trigger, maintain
  on table public.campaigns from authenticated;

create or replace function public.campaigns_client_write_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Same admin predicate as policy campaigns_admin_all.
  if current_user in ('anon', 'authenticated')
     and not exists (
       select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = any (array['admin', 'super_admin'])
     ) then
    raise exception 'CAMPAIGN_WRITE_SERVER_ONLY' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.campaigns_client_write_guard() from public, anon, authenticated;

drop trigger if exists campaigns_client_write_guard_trg on public.campaigns;
create trigger campaigns_client_write_guard_trg
  before insert or update or delete on public.campaigns
  for each row execute function public.campaigns_client_write_guard();
-- ===== END migration =====

-- Guard 2: effective result inside the same transaction.
do $$
begin
  if has_table_privilege('anon', 'public.campaigns', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') then
    raise exception '3B4D6_ABORT: anon still has a write privilege';
  end if;
  if not has_table_privilege('anon', 'public.campaigns', 'SELECT') then
    raise exception '3B4D6_ABORT: anon SELECT grant changed';
  end if;
  if has_table_privilege('authenticated', 'public.campaigns', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') then
    raise exception '3B4D6_ABORT: authenticated still has TRUNCATE/REFERENCES/TRIGGER/MAINTAIN';
  end if;
  if not (has_table_privilege('authenticated', 'public.campaigns', 'SELECT') and has_table_privilege('authenticated', 'public.campaigns', 'INSERT')
          and has_table_privilege('authenticated', 'public.campaigns', 'UPDATE') and has_table_privilege('authenticated', 'public.campaigns', 'DELETE')) then
    raise exception '3B4D6_ABORT: authenticated lost a privilege admins need';
  end if;
  if not (has_table_privilege('service_role', 'public.campaigns', 'SELECT') and has_table_privilege('service_role', 'public.campaigns', 'INSERT')
          and has_table_privilege('service_role', 'public.campaigns', 'UPDATE') and has_table_privilege('service_role', 'public.campaigns', 'DELETE')) then
    raise exception '3B4D6_ABORT: service_role lost access';
  end if;
  if (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'campaigns')
     <> array['campaigns_admin_all', 'campaigns_own_select'] then
    raise exception '3B4D6_ABORT: unexpected policy set';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.campaigns'::regclass and tgname = 'campaigns_client_write_guard_trg' and tgenabled = 'O') then
    raise exception '3B4D6_ABORT: guard trigger missing or disabled';
  end if;
  if has_function_privilege('anon', 'public.campaigns_client_write_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.campaigns_client_write_guard()', 'EXECUTE') then
    raise exception '3B4D6_ABORT: guard function executable by clients';
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261009150000', 'campaigns_owner_write_lockdown', array[
  'drop policy if exists "campaigns_own_insert" on public.campaigns',
  'drop policy if exists "campaigns_own_update" on public.campaigns',
  'revoke insert, update, delete, truncate, references, trigger, maintain on table public.campaigns from anon',
  'revoke truncate, references, trigger, maintain on table public.campaigns from authenticated',
  'create or replace function public.campaigns_client_write_guard() returns trigger language plpgsql security invoker set search_path = '''' (see migration file)',
  'revoke all on function public.campaigns_client_write_guard() from public, anon, authenticated',
  'drop trigger if exists campaigns_client_write_guard_trg on public.campaigns',
  'create trigger campaigns_client_write_guard_trg before insert or update or delete on public.campaigns for each row execute function public.campaigns_client_write_guard()'
]);

commit;
