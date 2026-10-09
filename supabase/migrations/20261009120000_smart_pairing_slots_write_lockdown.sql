-- 20261009120000_smart_pairing_slots_write_lockdown.sql
--
-- Phase 3B.4-S. public.smart_pairing_slots was writable by anyone holding the
-- anon key:
--   * policy "Service role all" is FOR ALL TO public USING (true) WITH CHECK (true),
--     despite its name (the remote baseline creates it without a TO clause);
--   * anon and authenticated hold every table privilege (arwdDxtm).
-- No Production code writes this table: the last client reference
-- (select id where stato = 'attiva') was removed in e00c348, 2026-08-05.
-- Legitimate writers are service_role, which has BYPASSRLS, and the table
-- owner postgres.
--
-- Minimal fix:
--   * revoke every write privilege from anon/authenticated;
--   * scope the ALL policy to service_role.
-- SELECT is kept exactly as it is: the "Public read slots" policy and the
-- SELECT grant are unchanged, and so is the available_slots_with_pairing view.
-- No data, column, constraint, trigger or index is touched. Idempotent.
-- Rollback: supabase/migrations/rollback/20261009120000_smart_pairing_slots_write_lockdown.rollback.sql

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
