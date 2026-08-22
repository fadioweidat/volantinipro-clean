-- ============================================================
-- CAUSA (diagnosticata sullo stato reale di produzione, non su migration
-- 019 in git che era gia' superata da hardening successivi mai committati):
--
-- 1) public.proof_photos ha RLS abilitata con UNA sola policy, SELECT
--    ("proof_photos_select_authorized"). authenticated ha grant SELECT ma
--    NESSUN grant INSERT sulla tabella (verificato via
--    information_schema.role_table_grants): qualunque insert autenticato
--    fallisce con "permission denied for table proof_photos" (42501) PRIMA
--    ancora che qualunque policy RLS venga valutata — un GRANT mancante a
--    livello di tabella, non un problema di policy.
--
-- 2) La policy storage.objects "proof_photos_storage_insert_authorized"
--    (gia' in produzione) richiede un path ESATTO
--    campaign/<campaignId>/session/<sessionId>/photo/<uuid>.ext, risolto su
--    delivery_sessions per validare driver/assegnazione. Il codice client
--    (buildProofPhotoStoragePath) produceva un formato diverso
--    (<campaignId>/<sessionId|no-session>/<driverId>/<timestamp>-<id>.jpg):
--    corretto separatamente in src/lib/services/gps-api.js, nessuna
--    modifica SQL necessaria per quella parte.
--
-- FIX MINIMO (questa migration):
-- - grant insert sulla tabella per authenticated;
-- - nuova policy INSERT scoped alla stessa fonte di verita' gia' usata dal
--   ramo Operatore della policy SELECT esistente e dalla policy storage
--   (delivery_sessions + gps_assignment_is_valid): un operatore puo'
--   inserire solo foto della propria sessione, per una campagna con
--   assegnazione attiva e valida. gps_is_admin() in OR, stesso pattern gia'
--   usato ovunque nello schema GPS.
-- - la policy SELECT esistente viene ricreata identica, con un solo
--   aggiunta: il ramo Cliente (proprietario campagna) resta limitato alle
--   foto con approved_at non nullo, come gia' fatto lato client da
--   src/pages/customer/CampaignTracking.jsx (approvedOnly:true) ma finora
--   MAI imposto lato RLS. Il ramo Admin e il ramo Operatore non cambiano.
--
-- Nessuna policy permissiva "using (true)", nessun uso di service_role nel
-- browser, RLS resta abilitata (gia' FORCE ROW LEVEL SECURITY, invariato).
-- Nessuna policy UPDATE/DELETE aggiunta: non esiste ancora nessun flusso di
-- approvazione o cancellazione foto nel codice, quindi nessuna regola
-- esplicita da tradurre in policy.
-- ============================================================

grant insert on public.proof_photos to authenticated;

drop policy if exists proof_photos_insert_authorized on public.proof_photos;
create policy proof_photos_insert_authorized on public.proof_photos for insert to authenticated
with check (
  public.gps_is_admin()
  or (
    driver_id = auth.uid()
    and exists (
      select 1
      from public.delivery_sessions s
      where s.id = proof_photos.session_id
        and s.campaign_id = proof_photos.campaign_id
        and s.driver_id = auth.uid()
        and s.assignment_id is not null
        and public.gps_assignment_is_valid(s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now())
    )
  )
);

drop policy if exists proof_photos_select_authorized on public.proof_photos;
create policy proof_photos_select_authorized on public.proof_photos for select to authenticated
using (
  public.gps_is_admin()
  or (
    proof_photos.approved_at is not null
    and exists (
      select 1
      from public.campaigns c
      where c.id = proof_photos.campaign_id
        and c.user_id = auth.uid()
    )
  )
  or exists (
    select 1
    from public.delivery_sessions s
    where s.id = proof_photos.session_id
      and s.campaign_id = proof_photos.campaign_id
      and s.driver_id = auth.uid()
      and s.assignment_id is not null
      and public.gps_assignment_is_valid(s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now())
  )
);
