-- ROLLBACK of 20261009160000_campaign_summary_view_lockdown.sql. Run manually,
-- never by the migration runner (this folder is not scanned by the Supabase CLI).
-- Restores the exact pre-migration state of public.campaign_summary:
--   * no reloptions (security_invoker unset, i.e. owner rights);
--   * anon arwdDxtm and authenticated arwdDxtm.
-- WARNING: this re-opens the RLS bypass: anon can read every campaign with its
-- latest quote and campaign_analysis. Use only to undo a demonstrated regression.
-- No data is touched.
begin;

alter view public.campaign_summary reset (security_invoker);

grant all on table public.campaign_summary to anon, authenticated;

commit;
