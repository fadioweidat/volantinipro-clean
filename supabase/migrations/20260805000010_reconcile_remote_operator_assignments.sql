-- ============================================================
-- Migrazione: 20260805000010_reconcile_remote_operator_assignments.sql
--
-- CONTESTO
-- La migrazione 035_operator_assignments.sql è già registrata in
-- supabase_migrations.schema_migrations (version='035', name=null)
-- ma è stata eseguita su un DB remoto dove la tabella
-- public.operator_assignments era stata creata da migrazioni extra
-- remote (202607230001 o simili) con schema parzialmente diverso:
--   - zone_id    → mancante
--   - metadata   → mancante
--   - group_id   → NOT NULL nel remoto (vs nullable nel locale)
--   - starts_at  → NOT NULL DEFAULT now() nel remoto
--   - revoked_at → presente solo nel remoto
--
-- Questa migrazione è ADDITIVA e IDEMPOTENTE:
--   - non elimina colonne esistenti
--   - non tocca dati
--   - non fa reset
--   - non modifica altre tabelle
--
-- COLONNA CANONICA: zone_id
-- Uso nel codice: nessun riferimento diretto in frontend o edge
-- functions. La colonna è definita nel contratto locale (035) come
-- puntatore opzionale a public.campaign_zones.id.
-- Nessun RPC (gps_get_operator_campaign, gps_start_session,
-- gps_transition_zone) fa riferimento esplicito a zone_id.
-- La colonna è usata solo dall'indice operator_assignments_active_scope_idx.
--
-- FK SU campaign_zones: SOSPESA (vedi ragionamento in fondo)
-- ============================================================

begin;

-- ── 1. Aggiungi zone_id se mancante ────────────────────────────────────────
-- zone_id è nullable UUID: punta concettualmente a campaign_zones(id),
-- ma la FK non viene ancora imposta (vedi punto 3 sotto).
alter table public.operator_assignments
  add column if not exists zone_id uuid;

-- ── 2. Aggiungi metadata se mancante ───────────────────────────────────────
-- Nel DB remoto la colonna non era presente.
-- NOT NULL + DEFAULT '{}' è sicuro anche su righe esistenti.
alter table public.operator_assignments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ── 3. Indice active_scope con zone_id ─────────────────────────────────────
-- Questo indice era la riga che falliva nella 035 originale.
-- Ora che zone_id esiste, viene creato normalmente.
-- L'indice è già presente nel remoto (aggiunto manualmente durante il fix),
-- per cui IF NOT EXISTS è sufficiente.
create index if not exists operator_assignments_active_scope_idx
  on public.operator_assignments (operator_id, campaign_id, group_id, zone_id)
  where status = 'active';

-- ── 4. Indici locali mancanti nel remoto ───────────────────────────────────
-- Il remoto ha indici con nomi diversi da quelli locali.
-- Aggiungiamo quelli locali come IF NOT EXISTS; non eliminiamo i remoti.
create index if not exists operator_assignments_operator_id_idx
  on public.operator_assignments (operator_id);

create index if not exists operator_assignments_campaign_id_idx
  on public.operator_assignments (campaign_id);

create index if not exists operator_assignments_status_idx
  on public.operator_assignments (status);

create index if not exists operator_assignments_validity_idx
  on public.operator_assignments (operator_id, campaign_id, status, starts_at, ends_at);

-- ── 5. RLS e policy idempotenti ────────────────────────────────────────────
-- Il remoto ha già: operator_assignments_admin_all, operator_assignments_own_select
-- (via gps_is_admin()). Aggiungiamo le policy locali standard senza eliminare quelle remote.
alter table public.operator_assignments enable row level security;

revoke all on table public.operator_assignments from anon;
revoke all on table public.operator_assignments from authenticated;
grant select, insert, update, delete on table public.operator_assignments to authenticated;

drop policy if exists operator_assignments_select_policy on public.operator_assignments;
create policy operator_assignments_select_policy
  on public.operator_assignments
  for select
  to authenticated
  using (
    public.jwt_is_admin()
    or operator_id = auth.uid()
  );

drop policy if exists operator_assignments_insert_admin on public.operator_assignments;
create policy operator_assignments_insert_admin
  on public.operator_assignments
  for insert
  to authenticated
  with check (public.jwt_is_admin());

drop policy if exists operator_assignments_update_admin on public.operator_assignments;
create policy operator_assignments_update_admin
  on public.operator_assignments
  for update
  to authenticated
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

drop policy if exists operator_assignments_delete_admin on public.operator_assignments;
create policy operator_assignments_delete_admin
  on public.operator_assignments
  for delete
  to authenticated
  using (public.jwt_is_admin());

-- ── NOTE SU FK zone_id → campaign_zones(id) ────────────────────────────────
--
-- Verifica pre-FK eseguita: orphan_count = 0
-- (nessuna riga con zone_id IS NOT NULL fuori da campaign_zones.id)
--
-- La FK NON viene aggiunta in questa migrazione perché:
--
-- 1. La tabella campaign_zones nel remoto ha uno schema completamente
--    diverso da quello locale (colonne: zone_name, address_label,
--    center_lat/lng numeric, radius_m integer, polygon_geojson,
--    group_id, priority, status, quantity_assigned, ecc.)
--    vs locale (zone_order, service_type, municipality_code, ecc.)
--    Le due versioni sono incompatibili e la FK imporrebbe un accoppiamento
--    su una tabella che potrebbe essere sostituita.
--
-- 2. Nessun RPC né codice frontend usa zone_id come riferimento FK;
--    il campo è riservato a uso futuro.
--
-- 3. I valori zone_id attuali sono tutti NULL (colonna appena aggiunta),
--    quindi nessun dato operativo dipende dalla FK oggi.
--
-- Quando il contratto di campaign_zones sarà stabilizzato,
-- aggiungere una migrazione separata con:
--   alter table public.operator_assignments
--     add constraint operator_assignments_zone_id_fkey
--     foreign key (zone_id)
--     references public.campaign_zones(id)
--     on delete set null;  -- SET NULL per non bloccare cancellazione zone
-- ────────────────────────────────────────────────────────────────────────────

commit;
