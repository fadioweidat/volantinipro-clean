-- ROLLBACK of 20261009150000_campaigns_owner_write_lockdown.sql. Run manually,
-- never by the migration runner (this folder is not scanned by the Supabase CLI).
-- Restores the exact pre-migration state of public.campaigns:
--   * policies campaigns_own_insert / campaigns_own_update (verbatim from Production);
--   * anon arwdDxtm and authenticated arwdDxtm table privileges;
--   * no campaigns_client_write_guard trigger/function.
-- WARNING: this re-opens direct owner INSERT/UPDATE of prices, status and
-- payment metadata. Use only to undo a demonstrated regression.
-- No data is touched.
begin;

drop trigger if exists campaigns_client_write_guard_trg on public.campaigns;
drop function if exists public.campaigns_client_write_guard();

drop policy if exists "campaigns_own_insert" on public.campaigns;
create policy "campaigns_own_insert"
  on public.campaigns
  for insert
  to authenticated
  with check ((auth.uid() = user_id));

drop policy if exists "campaigns_own_update" on public.campaigns;
create policy "campaigns_own_update"
  on public.campaigns
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

grant insert, update, delete, truncate, references, trigger, maintain
  on table public.campaigns to anon;
grant truncate, references, trigger, maintain
  on table public.campaigns to authenticated;

commit;
