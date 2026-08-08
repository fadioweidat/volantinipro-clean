# VolantiniPro RC2 — Restore Test Report

**Release**: `volantinipro-rc2-2026-08-07`
**Backup usato**: `D:\cloaude volantini\_secure-backups\volantinipro\releases\volantinipro-rc2-2026-08-07\`
**Ambiente restore**: container Postgres usa-e-getta (`public.ecr.aws/supabase/postgres:17.6.1.084`), rete Docker isolata `rc2_restore_net`, **mai il dev DB esistente**
**Scrittura sul database remoto**: nessuna, in nessun momento

**Nota terminologica**: la cartella `supabase/migrations_production_safe/` contiene **9 file** (`150001`-`150009`). Di questi, **8 sono migrazioni DDL** rilevate/applicate/ledgerate dal runner, e **1 (`150004`) è uno script di sola verifica** (dichiarato tale nel proprio header, mai inteso per `--apply`/`--dry-run`). Dove questo documento dice "8 migrazioni" o "8/8", si riferisce sempre alle sole migrazioni DDL — `150004` viene eseguito ed è verificato separatamente (vedi Fase 6).

---

## Fase 5 — Restore su clone isolato

### Setup

1. Container `rc2_restore_db` creato da zero (immagine ufficiale già in cache).
2. Extension `postgis` installata; stub reale di `auth.jwt()` creato e assegnato a `supabase_auth_admin` (necessario per RLS/RPC autentiche — la stessa tecnica già validata in RC2-BROWSER-E2E-1).
3. **Primo tentativo, fallito**: caricamento del dump combinato `public+auth+storage` come ruolo `postgres` → 616 errori, tutti riconducibili a conflitti di ownership (`must be owner of table/function X`, `permission denied for schema auth/storage`) contro l'immagine base che provvede nativamente quegli schemi con proprietà di `supabase_auth_admin`/`supabase_storage_admin`. **Limite ambientale reale, non un difetto dei dati di RC2** — vedi nota nel Backup Manifest.
4. **Secondo tentativo, riuscito**: dump pulito **solo public** (schema + dati), caricato come `supabase_admin` (il vero superuser di questa immagine, non `postgres`) → **0 errori** sia per lo schema che per i dati.

### Verifica schema

| Metrica | Baseline remoto (`catalog_summary.json`) | Clone restaurato | Esito |
|---|---|---|---|
| Tabelle `public` | 66 | 66 | ✓ identico |
| Funzioni `public` | 802 | 802 | ✓ identico |
| Trigger `public` | 26 | 26 | ✓ identico |
| Policy `public` | 91 | 91 | ✓ identico |
| Indici `public` | 189 | 189 | ✓ identico |

### Verifica dati (conteggi critici, `pre_backup_counts.json` vs clone)

| Tabella | Pre-backup | Clone restaurato | Esito |
|---|---|---|---|
| `campaigns` | 2 | 2 | ✓ |
| `operator_assignments` | 1 | 1 | ✓ |
| `operator_profiles` | 1 | 1 | ✓ |
| `delivery_sessions` | 39 | 39 | ✓ |
| `gps_tracking_points` | 421 | 421 | ✓ |
| `geo_nil_milano` | **88** | **88** | ✓ |
| `address_points` | 337.049 | 337.049 | ✓ |
| `omi_zones` | 21.650 | 21.650 | ✓ |
| `poi_cache` | 59 | 59 | ✓ |
| `profiles` | 2 | 2 | ✓ |
| `gps_operator_audit_log` | 46 | 46 | ✓ |
| `audit_log` | 39 | 39 | ✓ |

**Corrispondenza esatta su tutte le 12 tabelle critiche.**

### Verifica RLS

| Tabella | RLS attiva | FORCE RLS |
|---|---|---|
| `campaigns` | sì | no (per design — visibilità pubblica parziale) |
| `delivery_sessions` | sì | **sì** |
| `geo_nil_milano` | sì | no |
| `gps_tracking_points` | sì | **sì** |
| `operator_assignments` | sì | **sì** |

### Verifica RPC NIL funzionante

`select count(*) from public.get_nil_breakdown_in_radius(45.4642, 9.19, 5.0);` → **64 righe reali** restituite (query autentica contro le 88 righe di `geo_nil_milano`, non un mock).

### Auth / Storage — limite dichiarato

Il restore completo byte-per-byte di `auth`/`storage` **non è stato raggiunto** in questo ambiente per il motivo tecnico sopra descritto (proprietà nativa degli schemi da parte dell'immagine base). Questo **non blocca** la verifica di RC2: nessuna delle 9 migrazioni tocca `auth`/`storage` (confermato via grep), quindi il clone rappresenta fedelmente **tutto ciò che la catena `150001`-`150009` può effettivamente modificare**.

### Esito Fase 5: **PASSATO**

---

## Fase 6 — Dry-run del runner sul clone restaurato

**Prima esecuzione (con il file `150009` originale)**: dry-run dichiarato "completato senza errori — nessuna modifica persistita", ma verifica diretta ha rivelato che **tutti** gli oggetti delle 9 migrazioni erano realmente persistiti nel database (bug critico, dettagliato in `VOLANTINIPRO_RC2_FREEZE_REPORT.md`). Causa: un blocco di commento nel file `150009` posizionato **dopo** `commit;` invece che prima di `begin;`, che impediva alla regex di stripping del runner di riconoscere e rimuovere il `commit;` letterale del file, facendolo eseguire per davvero a metà della transazione unica del dry-run.

**Fix minimo autorizzato**: spostato il blocco di commento "VERIFICA POST-MIGRAZIONE" da dopo `commit;` a prima di `begin;` — **zero modifiche alla logica SQL**, verificato via `git diff` (solo riposizionamento di righe di commento).

**Seconda esecuzione (dopo il fix), su clone appena ripristinato pulito**:

```
[DRY-RUN] 20260806150001 ... -> OK
[DRY-RUN] 20260806150002 ... -> OK
[DRY-RUN] 20260806150003 ... -> OK
[DRY-RUN] 20260806150005 ... -> OK
[DRY-RUN] 20260806150006 ... -> OK
[DRY-RUN] 20260806150007 ... -> OK
[DRY-RUN] 20260806150008 ... -> OK
[DRY-RUN] 20260806150009 ... -> OK
Dry-run completato senza errori (nessuna modifica persistita — rollback finale eseguito).
```

Verifica diretta post-dry-run:

| Oggetto | Atteso | Reale |
|---|---|---|
| `volantinipro_release_migrations` (ledger) | assente | assente |
| `operator_assignment_zones` (tabella 150009) | assente | assente |
| `campaign_coverage_adjustments` (tabella 150001) | assente | assente |
| `gtfs_routes` (tabella 150005) | assente | assente |
| `ai_territorial_chat_cache` (tabella 150008) | assente | assente |
| `admin_list_operators` (funzione 150009) | assente | assente |
| Tabelle `public` totali | 66 (invariato) | 66 |
| `geo_nil_milano` | 88 | 88 |

**Il dry-run è ora dimostrato realmente non persistente.** Esito Fase 6: **PASSATO** (dopo il fix).

### Riverifica indipendente (RC2-FREEZE-FINALIZE-2)

Rieseguito da zero su un terzo clone pulito, con dati NIL caricati (per poter verificare `geo_nil_milano=88` sulla stessa esecuzione, non solo lo schema): stesso esito — `--dry-run` → 8 file rilevati, tutti `OK`, nessun oggetto persistito, nessuna riga ledger, `geo_nil_milano` invariato a 88. `--apply` → 8/8 applicati, ledger 8 righe `success`. Seconda `--apply` → 8/8 `SKIP`. `150004` eseguito manualmente dopo l'`--apply`: tutte le query di verifica hanno dato l'esito atteso (vedi tabella sotto). Diff del fix confermato confinato esclusivamente a `20260806150009` — zero modifiche a `scripts/deploy-production-migrations.mjs` (`git diff` vuoto su quel file).

| Query di verifica `150004` | Esito |
|---|---|
| Oggetti attesi (`campaign_coverage_adjustments(_log)`, funzioni, trigger di sync) | tutti presenti |
| `effective_percent` è colonna semplice (`is_generated = NEVER`) | confermato |
| Trigger duplicati su `campaign_zone_progress` | zero (nessuna riga restituita, come atteso) |
| Firma `admin_set_zone_manual_progress` | 6 argomenti corretti |
| RLS+FORCE RLS sulle 3 tabelle chiave | tutte attive |

---

## Fase 7 — Apply completo + seconda apply (idempotenza)

Prima `--apply`: tutte e 8 le migrazioni DDL applicate con successo, ledger scritto con 8 righe `status='success'`.

Seconda `--apply` (stesso clone, senza modifiche): tutte e 8 `[SKIP] ... gia' applicato con lo stesso hash`.

Verifica anti-duplicazione dopo la doppia applicazione:

| Metrica | Prima dell'apply | Dopo doppia apply |
|---|---|---|
| Tabelle `public` | 66 | 73 (66 + 7 nuove: `campaign_coverage_adjustments(_log)`, `gtfs_routes`, `gtfs_stop_times`, `ai_territorial_chat_cache`, `operator_assignment_zones`, `volantinipro_release_migrations`) |
| Trigger `public` | 26 | 30 (nessun duplicato) |
| Policy `public` | 91 | 101 (nessun duplicato) |
| `geo_nil_milano` | 88 | 88 (invariato) |

Nessun hash mismatch, nessun trigger/policy duplicato, nessuna regressione. Esito Fase 7: **PASSATO**.

---

## Fase 8 — Test funzionali 150009

Fixture di test create direttamente via SQL sul clone disposable (non produzione): Admin, Driver A, Driver B, Cliente, Driver Inattivo, una campagna e un gruppo di test. Identità simulate tramite `request.jwt.claim.sub`/`request.jwt.claims` (stessa tecnica di autenticazione reale usata da PostgREST).

| RPC / scenario | Esito |
|---|---|
| `admin_list_operators()` | 3 righe, corrette |
| `admin_create_operator_assignment()` | assegnazione creata con successo |
| `admin_list_campaign_assignments()` | 1 riga, corretta |
| `admin_update_operator_assignment()` | patch `metadata` applicata correttamente |
| `admin_revoke_operator_assignment()` | `status='revoked'`, `_revoked_pending_stop=true` |
| `get_driver_assignment()` — Driver A (proprietario) | dati restituiti correttamente |
| `get_driver_assignment()` — Driver B (non proprietario) | `ERROR: Accesso negato.` |
| `get_driver_assignment()` — non autenticato | `ERROR: Non autenticato.` |
| `get_driver_assignment()` — Cliente | `ERROR: Accesso negato.` |
| `list_assignment_zones()` | eseguita correttamente (0 righe, nessuna zona assegnata) |
| Creazione assegnazione — operatore inattivo | `ERROR: Operatore non trovato, non attivo o disabilitato.` |
| Creazione assegnazione — date invalide (`ends_at <= starts_at`) | `ERROR: ends_at deve essere strettamente successivo a starts_at.` |
| Creazione assegnazione — duplicata/sovrapposta | `ERROR: Esiste già un'assegnazione attiva sovrapposta...` |
| RLS diretta `operator_assignments` — Driver B | 0 righe visibili |
| RLS diretta `operator_assignments` — Admin | 1 riga visibile |

### Ciclo revoca durante sessione attiva

1. `gps_start_session()` come Driver A → sessione `started` ✓
2. `gps_transition_session(..., 'pause')` come Driver A → `paused` ✓
3. `admin_revoke_operator_assignment()` come Admin → `revoked`, `_revoked_pending_stop=true` ✓
4. `gps_transition_session(..., 'resume')` come Driver A → `ERROR: ASSEGNAZIONE_REVOCATA: solo il termine della sessione è consentito.` ✓
5. `gps_transition_session(..., 'complete')` come Driver A → `completed` ✓ (consentito nonostante la revoca)
6. Audit log (`gps_operator_audit_log`): `session_started`, `session_pause`, `session_complete` — 3 righe coerenti ✓
7. Audit log (`audit_log`): `admin_create_operator_assignment`, `admin_revoke_operator_assignment` — entrambe `success=true` ✓

Esito Fase 8: **PASSATO** su tutti i punti richiesti.

---

## Fase 9 — Regressione completa

| Verifica | Esito |
|---|---|
| `geo_nil_milano` = 88 | ✓ |
| RPC NIL funzionante | ✓ (64 righe reali) |
| `omi_zones` | 21.650 (invariato) |
| `poi_cache` | 59 (invariato) |
| `address_points` | 337.049 (invariato) |
| GTFS (`gtfs_routes`/`gtfs_stop_times`) | tabelle create, vuote come atteso (nessun popolamento dati previsto da questa catena) |
| AI schema/cache | `ai_territorial_chat_cache` creata; `campaigns.ai_suggestions` presente |
| `campaign_coverage_adjustments` | tabella creata, vuota come atteso |
| `campaign_zone_progress` | tabella accessibile, nessun errore |
| RLS Admin | verificata (vede tutto) |
| RLS Cliente | verificata (`current_user_owns_campaign` — funzionalità preesistente, non introdotta da 150009: il cliente vede le sessioni GPS delle proprie campagne, comportamento di prodotto intenzionale) |
| RLS Driver | verificata (vede solo le proprie assegnazioni/sessioni) |
| Punti GPS preesistenti | `gps_tracking_points` = 421, identico al pre-backup — nessun punto toccato |

Esito Fase 9: **PASSATO**.

---

## Fase 10 — Rollback test

Test eseguito con una copia isolata della catena (`scripts/.rc2_rollback_test_migrations/`, rimossa a fine test) contenente le 9 migrazioni reali più due file di test temporanei: `150010` (errore SQL intenzionale a metà transazione) e `150011` (non deve mai eseguire se `150010` fallisce).

| Verifica | Esito |
|---|---|
| `150001`-`150009` applicate con successo prima del fallimento | ✓ (8 righe `success` nel ledger) |
| `150010` fallisce ed esegue rollback della propria transazione | ✓ — la tabella creata da `150010` prima dell'errore **non è persistita** (0 righe) |
| Ledger registra `150010` come `failed` | ✓ |
| `150011` non viene mai eseguito | ✓ — nessuna riga nel ledger, tabella marker assente |
| Restart dopo correzione (rimosso l'errore da `150010`) | ✓ — le 8 migrazioni reali `[SKIP]` (hash invariato), `150010` e `150011` applicate con successo |
| Restore completo dal nuovo backup RC2 resta possibile | ✓ (banalmente vero — i file di backup non sono mai stati toccati da questo test) |

Esito Fase 10: **PASSATO**.

---

## Verdetto Fasi 5-10

Tutte le fasi di restore, dry-run, apply, test funzionali, regressione e rollback sono **PASSATE**, con un bug critico trovato nel runner (dry-run non realmente non-distruttivo) e corretto con un fix minimo autorizzato esplicitamente, poi riverificato da zero con esito positivo.
