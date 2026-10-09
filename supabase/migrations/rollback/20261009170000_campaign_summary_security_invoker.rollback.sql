-- ROLLBACK of 20261009170000_campaign_summary_security_invoker.sql. Run manually,
-- never by the migration runner (this folder is not scanned by the Supabase CLI).
-- Restores the exact pre-migration state of public.campaign_summary:
--   * no reloptions (owner-rights evaluation);
--   * ACL {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm},
--     re-granted in that order so the stored ACL text is byte-identical.
-- WARNING: this re-opens anonymous and cross-customer reads of every campaign.
-- Use only to undo a demonstrated regression. No data is touched; the grants are
-- re-created inside one transaction, so no reader observes an intermediate state.
begin;

alter view public.campaign_summary reset (security_invoker);

revoke all on table public.campaign_summary from anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.campaign_summary to anon;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.campaign_summary to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.campaign_summary to service_role;

commit;
