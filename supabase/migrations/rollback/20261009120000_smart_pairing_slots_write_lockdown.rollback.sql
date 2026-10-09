-- ROLLBACK of 20261009120000_smart_pairing_slots_write_lockdown.sql. Run manually,
-- never by the migration runner (this folder is not scanned by the Supabase CLI).
-- Restores the exact pre-migration state of public.smart_pairing_slots:
--   * policy "Service role all" FOR ALL TO public USING (true) WITH CHECK (true);
--   * anon/authenticated table privileges arwdDxtm.
-- WARNING: this re-opens anonymous INSERT/UPDATE/DELETE. Use it only to undo an
-- unexpected regression, and then re-apply a corrected lockdown.
-- No data is touched.
begin;

drop policy if exists "smart_pairing_slots_service_role_all" on public.smart_pairing_slots;
drop policy if exists "Service role all" on public.smart_pairing_slots;
create policy "Service role all"
  on public.smart_pairing_slots
  using (true)
  with check (true);

grant insert, update, delete, truncate, references, trigger, maintain
  on table public.smart_pairing_slots to anon, authenticated;

commit;
