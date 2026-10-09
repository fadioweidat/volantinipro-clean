-- 3B.4-V read-only verification. Run BEFORE apply (expect "pre") and AFTER apply
-- (expect "post"). READ ONLY transaction, rolled back; aggregates only.
begin transaction read only;
select json_build_object(
  'state', case
    when (select reloptions from pg_class where oid = 'public.campaign_summary'::regclass) is null
     and (select relacl::text from pg_class where oid = 'public.campaign_summary'::regclass)
         = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
      then 'pre'
    when (select reloptions::text from pg_class where oid = 'public.campaign_summary'::regclass) = '{security_invoker=true}'
     and (select relacl::text from pg_class where oid = 'public.campaign_summary'::regclass)
         = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}'
      then 'post'
    else 'UNEXPECTED' end,
  'options', (select reloptions::text from pg_class where oid = 'public.campaign_summary'::regclass),
  'acl', (select relacl::text from pg_class where oid = 'public.campaign_summary'::regclass),
  'owner', (select pg_get_userbyid(relowner) from pg_class where oid = 'public.campaign_summary'::regclass),
  'def_md5', md5(pg_get_viewdef('public.campaign_summary'::regclass, true)),
  'column_acl', (select count(*) from pg_attribute where attrelid = 'public.campaign_summary'::regclass and attacl is not null),
  'privileges', json_build_object(
    'anon_any', has_table_privilege('anon', 'public.campaign_summary', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
    'authenticated_select', has_table_privilege('authenticated', 'public.campaign_summary', 'SELECT'),
    'authenticated_other', has_table_privilege('authenticated', 'public.campaign_summary', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
    'service_role_select', has_table_privilege('service_role', 'public.campaign_summary', 'SELECT')),
  'base_rls', (select json_object_agg(relname, relrowsecurity) from pg_class where oid in ('public.campaigns'::regclass, 'public.quotes'::regclass, 'public.campaign_analysis'::regclass)),
  'rows_via_owner', (select count(*) from public.campaign_summary),
  'migration_recorded', exists (select 1 from supabase_migrations.schema_migrations where version = '20261009170000')
) as verification;
rollback;
