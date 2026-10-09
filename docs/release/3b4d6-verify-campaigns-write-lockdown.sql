-- 3B.4-D6 read-only verification. Run BEFORE apply (expect state "pre") and AFTER
-- apply (expect state "post"). It never writes: everything runs in a READ ONLY
-- transaction that is rolled back. Aggregates only; no row contents are returned.
begin transaction read only;
select json_build_object(
  'state', case
    when (select relacl::text from pg_class where oid = 'public.campaigns'::regclass)
         = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
     and (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'campaigns')
         = array['campaigns_admin_all', 'campaigns_own_insert', 'campaigns_own_select', 'campaigns_own_update']
     and not exists (select 1 from pg_trigger where tgrelid = 'public.campaigns'::regclass and tgname = 'campaigns_client_write_guard_trg')
     and not exists (select 1 from pg_proc where proname = 'campaigns_client_write_guard' and pronamespace = 'public'::regnamespace)
      then 'pre'
    when (select relacl::text from pg_class where oid = 'public.campaigns'::regclass)
         = '{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}'
     and (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'campaigns')
         = array['campaigns_admin_all', 'campaigns_own_select']
     and exists (select 1 from pg_trigger where tgrelid = 'public.campaigns'::regclass and tgname = 'campaigns_client_write_guard_trg' and tgenabled = 'O')
     and exists (select 1 from pg_proc where proname = 'campaigns_client_write_guard' and pronamespace = 'public'::regnamespace and not prosecdef)
      then 'post'
    else 'UNEXPECTED' end,
  'acl', (select relacl::text from pg_class where oid = 'public.campaigns'::regclass),
  'column_acl', (select count(*) from pg_attribute where attrelid = 'public.campaigns'::regclass and attacl is not null),
  'rls', (select relrowsecurity from pg_class where oid = 'public.campaigns'::regclass),
  'policies', (select json_agg(json_build_object('name', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by policyname)
               from pg_policies where schemaname = 'public' and tablename = 'campaigns'),
  'triggers', (select json_agg(tgname::text || ':' || tgenabled::text order by tgname) from pg_trigger where tgrelid = 'public.campaigns'::regclass and not tgisinternal),
  'guard_fn', (select json_build_object('secdef', prosecdef, 'anon_exec', has_function_privilege('anon', oid, 'EXECUTE'), 'auth_exec', has_function_privilege('authenticated', oid, 'EXECUTE'))
               from pg_proc where proname = 'campaigns_client_write_guard' and pronamespace = 'public'::regnamespace),
  'privileges', json_build_object(
     'anon', json_build_object('select', has_table_privilege('anon', 'public.campaigns', 'SELECT'),
                               'write', has_table_privilege('anon', 'public.campaigns', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')),
     'authenticated', json_build_object('select', has_table_privilege('authenticated', 'public.campaigns', 'SELECT'),
                               'insert', has_table_privilege('authenticated', 'public.campaigns', 'INSERT'),
                               'update', has_table_privilege('authenticated', 'public.campaigns', 'UPDATE'),
                               'delete', has_table_privilege('authenticated', 'public.campaigns', 'DELETE'),
                               'truncate_refs_trigger_maintain', has_table_privilege('authenticated', 'public.campaigns', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')),
     'service_role_all', has_table_privilege('service_role', 'public.campaigns', 'SELECT') and has_table_privilege('service_role', 'public.campaigns', 'INSERT')
                         and has_table_privilege('service_role', 'public.campaigns', 'UPDATE') and has_table_privilege('service_role', 'public.campaigns', 'DELETE')),
  'writer_rpcs_secdef', (select json_agg(proname::text || ':' || prosecdef::text || ':' || pg_get_userbyid(proowner) order by proname) from pg_proc
                         where pronamespace = 'public'::regnamespace and proname in ('claim_public_campaign', 'customer_accept_supplier_quote', 'supplier_submit_quote',
                           'admin_archive_campaign', 'admin_cancel_campaign', 'admin_reopen_campaign', 'admin_revoke_payment_confirmation',
                           'admin_hard_delete_campaign', 'admin_create_operator_assignment')),
  'rows', (select json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(row_to_json(c)::text, '|' order by id), '')), 'max_updated_at', max(updated_at))
           from public.campaigns c),
  'migration_recorded', exists (select 1 from supabase_migrations.schema_migrations where version = '20261009150000')
) as verification;
rollback;
