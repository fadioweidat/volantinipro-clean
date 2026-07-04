# Setup SQL — Moduli Enterprise (Audit Log, CRM, DMS, Config Center, AI Anomalie)

Questo file documenta le migration `020`–`024` in `supabase/migrations/`,
che ricostruiscono lo schema dei moduli admin già implementati e
verificati live in produzione. `020`–`023` sono la versione "in repository"
degli script SQL che finora esistevano solo come file locali non tracciati
(`AUDIT_LOG_SETUP.sql`, `CRM_CLIENTI_SETUP.sql`, `DMS_ARCHIVIO_SETUP.sql`,
`CONFIG_CENTER_SETUP.sql` alla radice del progetto — `.gitignore` esclude
`*.sql` in root, per questo non erano mai entrati nel repo). `024` chiude
il gap segnalato più sotto per il modulo AI Anomalie.

Nessuna di queste migration è stata eseguita da questa sessione: sono
state solo scritte su disco. Lo schema che descrivono corrisponde a
quanto già verificato live su Supabase in sessioni precedenti (probe
REST read-only su `audit_log`, `clienti`, `clienti_referenti`,
`documenti`, `impostazioni` — tutte esistenti e funzionanti).

## Ordine di esecuzione (obbligatorio)

Vanno eseguite **in ordine numerico**, nell'editor SQL di Supabase:

1. `020_audit_log_setup.sql`
2. `021_crm_clienti_setup.sql`
3. `022_dms_archivio_setup.sql`
4. `023_config_center_setup.sql`
5. `024_ai_anomalie_audit_action.sql`

L'ordine è vincolante perché ogni migration da 021 in poi fa
`ALTER TABLE public.audit_log ... ADD CONSTRAINT audit_log_action_check`
ripetendo l'intera whitelist azioni fino a quel punto (drop-then-add,
l'unico modo idempotente di estendere un CHECK in PostgreSQL). Se
`020` non è stata eseguita prima, la tabella `audit_log` non esiste
ancora e le successive falliscono.

## Cosa crea ciascun file

| Migration | Modulo | Crea/estende | Abilita |
|---|---|---|---|
| `020_audit_log_setup.sql` | Audit Log | `public.audit_log` (tabella + RLS + policy insert/select) | `src/lib/audit.js` → `logAuditEvent()` |
| `021_crm_clienti_setup.sql` | CRM Clienti | ALTER `public.clienti` (+16 colonne anagrafiche), CREATE `public.clienti_referenti`, estende whitelist audit | `src/lib/services/crm-api.js`, `src/pages/admin/ClientiCRM.jsx` |
| `022_dms_archivio_setup.sql` | DMS Archivio | bucket storage `documents`, CREATE `public.documenti`, estende whitelist audit | `src/lib/services/dms-api.js`, `src/pages/admin/DocumentiDMS.jsx` |
| `023_config_center_setup.sql` | Config Center | CREATE `public.impostazioni` + seed 12 chiavi default, estende whitelist audit | `src/lib/services/config-api.js`, `src/pages/admin/CentroConfigurazione.jsx` |
| `024_ai_anomalie_audit_action.sql` | AI Anomalie | Nessuna tabella — estende solo whitelist audit con `ai_anomaly_scan_performed` | `src/lib/services/anomalie-api.js`, `src/pages/admin/AnomalieAI.jsx` |

Il modulo **AI Copilot — Rilevamento Anomalie non richiede nuove tabelle**:
legge dati già esistenti (`delivery_sessions`, `gps_tracking_points`,
`proof_photos`, oltre allo stesso `audit_log`) tramite regole
deterministiche calcolate lato client in `anomalie-api.js` — nessun LLM,
nessuna nuova fonte dati. L'unico elemento SQL mancante era la voce in
whitelist per l'evento che il modulo scrive in `audit_log` ad ogni
scansione, colmata da `024`.

Ogni file è **idempotente** (rieseguibile senza effetti collaterali):
`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, `DROP POLICY IF EXISTS` +
`CREATE POLICY`, `INSERT ... ON CONFLICT DO NOTHING`.

## Dipendenze pre-esistenti (non create da queste migration)

- `public.profiles(id uuid, role text)` — usata da tutte le policy RLS
  admin-only (`role in ('admin','super_admin')`). Deve già esistere.
- `public.clienti` — la 021 la estende con `ALTER TABLE`, non la crea.
  Deve già esistere con almeno una colonna `id uuid primary key`.
- `pgcrypto` (per `gen_random_uuid()`) — abilitata da `020`.

## Cosa NON è stato creato (fuori scopo, volutamente)

Come da istruzioni, queste migration **non** introducono tabelle non
verificate/non implementate. In particolare **non** creano:
`payments`, `pagamenti`, `invoices`, `fatture`, `suppliers`, `fornitori`,
`webhook_logs`, `notification_logs`, `backup_jobs`, `tickets`,
`activity_log`. Queste tabelle sono referenziate nel codice da
`FinancialDashboard.jsx` e `AutomationCenter.jsx` tramite
`selectOptionalTable()` (che degrada senza errori se la tabella manca),
ma **non sono mai state verificate/implementate** — non rientrano nel
perimetro di questo setup.

## Moduli che restano non configurati da questo setup

- **Financial Dashboard**, **Automation Center**: dipendono da diverse
  tabelle economiche/di log elencate sopra, mai create.
- **GPS Monitor**, **Gruppi/Operazioni/Report Campagna**: usano tabelle
  già esistenti (`delivery_sessions`, `gps_tracking_points`,
  `proof_photos`, `campaigns`, `assigned_zones`, ecc.) create da
  migration precedenti (`002`–`019`), non da questo setup.

## File legacy alla radice del progetto

`AUDIT_LOG_SETUP.sql`, `CRM_CLIENTI_SETUP.sql`, `DMS_ARCHIVIO_SETUP.sql`,
`CONFIG_CENTER_SETUP.sql` (più i diagnostici `AUDIT_LOG_DIAGNOSTIC.sql`,
`AUDIT_LOG_MINIMAL_TEST.sql`, `DMS_DIAGNOSTIC.sql`) restano sul disco,
ignorati da git. Il contenuto è ora duplicato in modo tracciato dentro
`supabase/migrations/020`–`024`; i file in root possono essere tenuti
come appunti locali o rimossi manualmente — non toccati da questa sessione.
Non esiste un equivalente legacy per `024`: quella voce era stata
applicata live senza mai passare da un file SQL dedicato.
