-- 3B.4-S read-only verification. Run BEFORE apply (expect state "pre") and AFTER
-- apply (expect state "post"). It never writes: the whole query runs in a
-- READ ONLY transaction that is rolled back.
begin transaction read only;
select json_build_object(
  'state', case
    when (select relacl::text from pg_class where oid = 'public.smart_pairing_slots'::regclass)
         = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
     and (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots')
         = array['Public read slots', 'Service role all'] then 'pre'
    when (select relacl::text from pg_class where oid = 'public.smart_pairing_slots'::regclass)
         = '{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}'
     and (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots')
         = array['Public read slots', 'smart_pairing_slots_service_role_all'] then 'post'
    else 'UNEXPECTED' end,
  'acl', (select relacl::text from pg_class where oid = 'public.smart_pairing_slots'::regclass),
  'policies', (select json_agg(json_build_object('name', policyname, 'roles', roles, 'cmd', cmd, 'using', qual, 'check', with_check) order by policyname)
               from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots'),
  'anon_write', has_table_privilege('anon', 'public.smart_pairing_slots', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'authenticated_write', has_table_privilege('authenticated', 'public.smart_pairing_slots', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'anon_select', has_table_privilege('anon', 'public.smart_pairing_slots', 'SELECT'),
  'service_role_write', has_table_privilege('service_role', 'public.smart_pairing_slots', 'INSERT')
                        and has_table_privilege('service_role', 'public.smart_pairing_slots', 'UPDATE')
                        and has_table_privilege('service_role', 'public.smart_pairing_slots', 'DELETE'),
  'column_acl', (select count(*) from pg_attribute where attrelid = 'public.smart_pairing_slots'::regclass and attacl is not null),
  'rls', (select relrowsecurity from pg_class where oid = 'public.smart_pairing_slots'::regclass),
  'rows', (select json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(row_to_json(s)::text, '|' order by id), '')))
           from public.smart_pairing_slots s),
  'view_acl', (select relacl::text from pg_class where oid = 'public.available_slots_with_pairing'::regclass),
  'triggers', (select count(*) from pg_trigger where tgrelid = 'public.smart_pairing_slots'::regclass and not tgisinternal),
  'indexes', (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'smart_pairing_slots'),
  'migration_recorded', exists (select 1 from supabase_migrations.schema_migrations where version = '20261009120000')
) as verification;
rollback;
