-- 3B.4-V controlled release: apply ONLY 20261009170000_campaign_summary_security_invoker.sql.
-- NOT AUTHORIZED UNTIL EXPLICIT APPROVAL. Never use `supabase db push`.
-- Run as postgres, as ONE transaction (own BEGIN/COMMIT): SQL editor "Run",
-- `supabase db query --linked -f <this file>`, or `psql -v ON_ERROR_STOP=1 -f` (no -1).
-- Independent of 3B.4-D6 (20261009150000): either order is valid.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Guard 1: live state must still be the audited state (2026-10-09).
do $$
begin
  if current_setting('server_version_num')::int < 170000 then
    raise exception '3B4V_ABORT: PostgreSQL >= 17 required (security_invoker needs >= 15, MAINTAIN >= 17)';
  end if;
  if current_user <> 'postgres' then
    raise exception '3B4V_ABORT: run as postgres (owner/grantor), not %', current_user;
  end if;
  if (select relkind from pg_class where oid = 'public.campaign_summary'::regclass) <> 'v'
     or (select pg_get_userbyid(relowner) from pg_class where oid = 'public.campaign_summary'::regclass) <> 'postgres' then
    raise exception '3B4V_ABORT: campaign_summary is not a postgres-owned view';
  end if;
  if (select reloptions from pg_class where oid = 'public.campaign_summary'::regclass) is not null then
    raise exception '3B4V_ABORT: campaign_summary already has reloptions';
  end if;
  if (select relacl::text from pg_class where oid = 'public.campaign_summary'::regclass)
     <> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception '3B4V_ABORT: campaign_summary ACL differs from audit';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.campaign_summary'::regclass and attacl is not null) then
    raise exception '3B4V_ABORT: unexpected column-level ACL on campaign_summary';
  end if;
  if md5(pg_get_viewdef('public.campaign_summary'::regclass, true)) <> 'ab3f147ae7ef5ece7555debe9afde189' then
    raise exception '3B4V_ABORT: campaign_summary definition differs from audit';
  end if;
  if not ((select relrowsecurity from pg_class where oid = 'public.campaigns'::regclass)
          and (select relrowsecurity from pg_class where oid = 'public.quotes'::regclass)
          and (select relrowsecurity from pg_class where oid = 'public.campaign_analysis'::regclass)) then
    raise exception '3B4V_ABORT: RLS disabled on a base table';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261009170000') then
    raise exception '3B4V_ABORT: version 20261009170000 already recorded';
  end if;
end $$;

-- ===== BEGIN 20261009170000_campaign_summary_security_invoker.sql (verbatim statements) =====
alter view public.campaign_summary set (security_invoker = true);

revoke all on table public.campaign_summary from anon;
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.campaign_summary from authenticated;
-- ===== END migration =====

-- Guard 2: effective result inside the same transaction.
do $$
begin
  if (select reloptions::text from pg_class where oid = 'public.campaign_summary'::regclass) <> '{security_invoker=true}' then
    raise exception '3B4V_ABORT: security_invoker not set';
  end if;
  if has_table_privilege('anon', 'public.campaign_summary', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') then
    raise exception '3B4V_ABORT: anon still has a privilege on campaign_summary';
  end if;
  if not has_table_privilege('authenticated', 'public.campaign_summary', 'SELECT')
     or has_table_privilege('authenticated', 'public.campaign_summary', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') then
    raise exception '3B4V_ABORT: authenticated privileges are not SELECT-only';
  end if;
  if not has_table_privilege('service_role', 'public.campaign_summary', 'SELECT') then
    raise exception '3B4V_ABORT: service_role lost SELECT';
  end if;
  if md5(pg_get_viewdef('public.campaign_summary'::regclass, true)) <> 'ab3f147ae7ef5ece7555debe9afde189' then
    raise exception '3B4V_ABORT: view definition changed';
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261009170000', 'campaign_summary_security_invoker', array[
  'alter view public.campaign_summary set (security_invoker = true)',
  'revoke all on table public.campaign_summary from anon',
  'revoke insert, update, delete, truncate, references, trigger, maintain on table public.campaign_summary from authenticated'
]);

commit;
