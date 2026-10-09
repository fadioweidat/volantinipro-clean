-- Read-only verification for 20261009160000_campaign_summary_view_lockdown.sql.
-- Run BEFORE apply (expect "pre") and AFTER apply (expect "post"). READ ONLY
-- transaction, rolled back; aggregates and catalog only.
-- ACLs are compared as sorted entry sets (entry order has no security meaning;
-- the candidate's rollback re-grants anon/authenticated after service_role).
begin transaction read only;
with v as (
  select reloptions,
         (select string_agg(e, ',' order by e) from unnest(relacl::text[]) e) as acl_sorted,
         relacl::text as acl, pg_get_userbyid(relowner) as owner
  from pg_class where oid = 'public.campaign_summary'::regclass
)
select json_build_object(
  'state', case
    when v.reloptions is null
     and v.acl_sorted = 'anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres'
      then 'pre'
    when v.reloptions::text = '{security_invoker=true}'
     and v.acl_sorted = 'postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres'
      then 'post'
    else 'UNEXPECTED' end,
  'options', v.reloptions::text,
  'acl', v.acl,
  'owner', v.owner,
  'def_md5', md5(pg_get_viewdef('public.campaign_summary'::regclass, true)),
  'column_acl', (select count(*) from pg_attribute where attrelid = 'public.campaign_summary'::regclass and attacl is not null),
  'privileges', json_build_object(
    'anon_any', has_table_privilege('anon', 'public.campaign_summary', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
    'authenticated_any', has_table_privilege('authenticated', 'public.campaign_summary', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
    'service_role_select', has_table_privilege('service_role', 'public.campaign_summary', 'SELECT')),
  'base_rls', (select json_object_agg(relname, relrowsecurity) from pg_class where oid in ('public.campaigns'::regclass, 'public.quotes'::regclass, 'public.campaign_analysis'::regclass)),
  'base_acls_sorted', (select json_object_agg(relname, (select string_agg(e, ',' order by e) from unnest(relacl::text[]) e)) from pg_class
                       where oid in ('public.quotes'::regclass, 'public.campaign_analysis'::regclass)),
  'dependent_views', (select count(*) from pg_depend d join pg_rewrite r on r.oid = d.objid where d.refobjid = 'public.campaign_summary'::regclass and r.ev_class <> 'public.campaign_summary'::regclass),
  'rows_via_owner', (select count(*) from public.campaign_summary),
  'migration_recorded', exists (select 1 from supabase_migrations.schema_migrations where version = '20261009160000')
) as verification
from v;
rollback;
