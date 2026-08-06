# VolantiniPro — Release Manifest

Nessuna azione remota eseguita. Nessun deploy eseguito. Nessun push Git (né di commit né di tag). Un tag annotato **locale** (`volantinipro-rc-2026-08-06`) è stato creato in RELEASE-FREEZE-2 — vedi sotto — ma non pushato. Tutte le query verso il progetto Supabase remoto in questo documento sono state eseguite in **sola lettura** (richieste `GET`/`POST` PostgREST con la sola chiave pubblica `anon`, mai la chiave `service_role`), senza mai stampare valori di chiavi o dati personali — solo esistenza di tabelle/funzioni e conteggi/ID minimi.

> **Aggiornamento — DEPLOY-PLAN-2 (Remote Migration History Verification).** Le sezioni Fase 3/Fase 4 sotto restano come registro storico della prima verifica (via PostgREST, con i limiti dichiarati di non avere accesso diretto a Postgres). Un secondo ciclo ha ottenuto **accesso diretto e in sola lettura al database Postgres remoto** tramite `supabase db query --linked` (canale ufficiale della CLI, nessuna password gestita manualmente) e ha letto la migration history reale (`supabase_migrations.schema_migrations`, 11 righe) più il catalogo diretto (`pg_catalog`/`information_schema`), risolvendo l'ambiguità precedente e scoprendone di nuove e più critiche — in particolare una **collisione di versione** (`20260805000010` registrata con contenuto completamente diverso dal file locale) e una **tabella NIL di produzione reale e indipendente** (`geo_nil_milano`, 88 righe) mai vista dai file di migrazione di questa serie. Dettaglio completo in [REMOTE_PRODUCTION_MIGRATION_MATRIX.md](REMOTE_PRODUCTION_MIGRATION_MATRIX.md). **Verdetto invariato: NO-GO**, ora con motivazioni più precise (vedi `VOLANTINIPRO_DEPLOY_RUNBOOK.md`).

> **Aggiornamento — RELEASE-FREEZE-1 (2026-08-06).** Release candidate definita: `volantinipro-rc-2026-08-06`, commit `574805b`. Tag **non ancora creato** (worktree non interamente pulito). Backup reale completo del remoto eseguito ed integralmente verificato tramite restore su clone isolato: ogni conteggio critico e ogni conteggio di catalogo identico tra remoto e clone, `geo_nil_milano` confermato 88/88, RPC NIL funzionante, catena production-safe applicata con successo e in modo idempotente sul clone restaurato. Dettagli completi in [VOLANTINIPRO_RELEASE_FREEZE_REPORT.md](VOLANTINIPRO_RELEASE_FREEZE_REPORT.md), [VOLANTINIPRO_BACKUP_MANIFEST.md](VOLANTINIPRO_BACKUP_MANIFEST.md), [VOLANTINIPRO_RESTORE_TEST_REPORT.md](VOLANTINIPRO_RESTORE_TEST_REPORT.md). **Verdetto: RELEASE FREEZE AND RESTORE READY — NO-GO**, per un solo motivo procedurale (worktree non interamente pulito — lavoro applicativo non correlato ancora non committato), non tecnico: la parte backup/restore/migrazioni è interamente verificata e pronta.

> **Aggiornamento — RELEASE-FREEZE-2 (2026-08-06). Worktree pulito e RC finale.** Creato un worktree Git separato e pulito (`D:\cloaude volantini\volantinipro-release-rc-2026-08-06`, HEAD detached da `574805b`, mai toccato il worktree originale) contenente esclusivamente i 5 documenti finali di release, scansionati per segreti/dati personali (nessuno trovato) e committati localmente. `npm ci`/`npm test` (243/243)/`npm run build` tutti riusciti nel worktree pulito; `git status --short` vuoto; `git diff --check` senza errori; diff esatto contro `574805b` limitato ai 5 file attesi, nessun file mancante o estraneo.
>
> **Sicurezza credenziali**: la credenziale pooler temporanea esposta in un comando diagnostico durante RELEASE-FREEZE-1 è stata verificata assente da repository (working tree e intera cronologia Git), dalla directory di backup sicura, da `.bash_history` (inesistente) e dalla cronologia PowerShell. È presente in un solo punto: il file di trascrizione di questa stessa sessione di conversazione (log nativo della piattaforma, non un file di progetto, mai raggiungibile da Git). Procedura di rotazione documentata in [VOLANTINIPRO_RELEASE_FREEZE_REPORT.md](VOLANTINIPRO_RELEASE_FREEZE_REPORT.md) — **non eseguita**, richiede autorizzazione esplicita separata.
>
> **Commit finale e tag RC**: il commit che introduce questa stessa versione del manifest è il commit finale della release — identificabile in modo univoco tramite il tag annotato locale `volantinipro-rc-2026-08-06` (`git show volantinipro-rc-2026-08-06`), puntato esattamente su di esso, non su `574805b`. Sezione dettagliata sotto.
>
> **Verdetto**: **RELEASE FREEZE AND RESTORE READY — GO**

## Fase 6 (RELEASE-FREEZE-2) — Riepilogo release candidate finale

| Campo | Valore |
|---|---|
| Nome release | `volantinipro-rc-2026-08-06` |
| Tag RC | `volantinipro-rc-2026-08-06` (annotato, locale, **non pushato**) |
| Commit finale | Il commit taggato da `volantinipro-rc-2026-08-06` nel worktree `volantinipro-release-rc-2026-08-06` (messaggio: `docs(release): finalize freeze backup and restore evidence`) |
| Worktree release | `D:\cloaude volantini\volantinipro-release-rc-2026-08-06` (HEAD detached, separato dal worktree di sviluppo originale, mai toccato) |

### Commit inclusi nella release (dalla baseline pre-serie alla RC finale)

| Commit | Messaggio |
|---|---|
| `8b2eaa8` | `chore(deploy): add isolated production migration runner` |
| `6cb517a` | `chore(db): track production-safe migration chain` |
| `574805b` | `docs(deploy): finalize migration isolation and runbook` |
| (tag) | `docs(release): finalize freeze backup and restore evidence` — commit finale, taggato |

Più i 21 commit della serie AI-BRAIN + GPS-MANUAL-COVERAGE + FINAL-PRE-DEPLOY già presenti su `574805b` (vedi elenco storico più sotto in questo documento).

### Componenti della release

- Runner `scripts/deploy-production-migrations.mjs` (applica esclusivamente `supabase/migrations_production_safe/`, mai `supabase db push`)
- Catena di migrazione production-safe: `supabase/migrations_production_safe/20260806150001` → `20260806150008` (8 file)
- Documentazione: `PRODUCTION_SAFE_MIGRATION_CHAIN.md`, `PRODUCTION_MIGRATION_LEDGER_ISOLATION.md`, `REMOTE_PRODUCTION_MIGRATION_MATRIX.md`, `VOLANTINIPRO_DEPLOY_RUNBOOK.md`
- Evidenza di freeze/backup/restore: `VOLANTINIPRO_RELEASE_FREEZE_REPORT.md`, `VOLANTINIPRO_BACKUP_MANIFEST.md`, `VOLANTINIPRO_RESTORE_TEST_REPORT.md`
- `package.json`/`package-lock.json` con `pg` come devDependency (tooling per il runner)

### Backup

| Campo | Valore |
|---|---|
| Percorso | `_secure-backups/volantinipro/releases/volantinipro-rc-2026-08-06/` (fuori dal repository, mai tracciato) |
| Hash SHA-256 | `schema_public_auth_storage.sql` → `8ce891a60997be8770b3bd8f716c9a139b5f7c1d1c140e0f2c7fb525d7b19b52`; `data_public_auth_storage.sql` → `fcd8f1cc104dfa6aec0f8d9746ee022a65d74b1829a6a198933efb67a6f4248c`; elenco completo in `checksums_sha256.txt` accanto ai file |
| Restore test | Eseguito su clone Postgres isolato (mai il DB di sviluppo esistente): ogni conteggio critico e di catalogo identico al remoto, `geo_nil_milano` 88/88, RPC NIL funzionante — dettaglio in `VOLANTINIPRO_RESTORE_TEST_REPORT.md` |
| Migration chain | Applicata con successo e in modo idempotente sul clone restaurato (dry-run + apply + riapplicazione + rollback test, tutti passati) |

### Known limitations

- Collisione di versione `001`/`002`/`003` **isolata ma non risolta** — `PRODUCTION_SAFE_MIGRATION_CHAIN.md` resta a verdetto PARTIAL su quel punto specifico; la nuova catena non ne dipende in alcun modo.
- Nessuna migrazione è mai stata applicata al database remoto reale — tutta la verifica è su clone.
- Il worktree di sviluppo originale (`volantinipro-full-site-final`) contiene ancora lavoro applicativo non committato di altri ticket, deliberatamente non toccato — questo worktree separato per la release non ne è affetto.

### Credenziale da ruotare prima del deploy reale

Una credenziale pooler temporanea (ruolo di sessione CLI `cli_login_postgres.mqkelrsvksrzrpmbstvd`, non la password primaria del database) è stata esposta una volta in un comando diagnostico durante RELEASE-FREEZE-1. Verificata assente da repository, cronologia Git, directory di backup, cronologia shell — presente solo nel log nativo di questa sessione di conversazione (non un artefatto di progetto). **Raccomandazione prima di qualunque deploy reale**: eseguire `supabase logout` + `supabase login` per invalidare la sessione CLI corrente (e con essa il ruolo pooler effimero); valutare come difesa aggiuntiva la rotazione della password primaria del database dalla Dashboard Supabase. Procedura completa in `VOLANTINIPRO_RELEASE_FREEZE_REPORT.md`. **Non eseguita in questo ticket — richiede autorizzazione esplicita separata.**

## Fase 1 — Identità della release

```
repository        D:/cloaude volantini/volantinipro-full-site-final
branch            feat/full-site-final
HEAD              04c7008821087f81523b80b3a21ad1835346fa69
remote            origin  https://github.com/fadioweidat/volantinipro-clean.git (mai usato in questa sessione)
```

**Ultimo tag disponibile**: `v1.0-before-step2-review` (commit `0396053`, 2026-07-18) — **non rappresentativo dello stato attuale**: precede l'intera serie di sessioni AI-BRAIN + GPS-MANUAL-COVERAGE + FINAL-PRE-DEPLOY (21 commit, dal 2026-08-05 al 2026-08-06). Nessun tag esiste sul lavoro di questa serie.

**Commit dalla precedente release "di fatto" (baseline pre-serie `ad0ee3d^`) a HEAD** (21 commit):
```
04c7008 docs(deploy): update pre-deploy audit status
e3d26e7 test(db): add migration replay and security coverage
d5d1e6f chore(db): track required territorial and GPS migrations
e52fdb1 fix(security): harden security definer search paths
5474482 fix(db): make NIL and GPS migrations idempotent
a9a23e3 docs(gps): document source of truth and migration path
9bf465e test(gps): add legacy and geometric coexistence coverage
c174a66 fix(gps-customer): consume canonical operational coverage
8032e14 fix(gps-admin): finalize coverage adjustment panel wiring
0b133b6 refactor(gps): establish canonical manual coverage model
66965a8 docs(gps-coverage): add implementation report
1559e66 feat(gps-coverage): add Admin manual coverage adjustment API + panel
18aec90 feat(gps-coverage): add campaign_coverage_adjustments local migration
1034288 docs(ai): correct commit list in AI BRAIN V3 report to match actual 3 commits
07ce7fb docs(ai): add AI BRAIN V3 end-to-end report
b08eb69 fix(ai-admin): bridge Supabase session before invoking ai-admin-copilot
128dff2 fix(ai-territory): resolve authenticated territorial identity
2a574ad test(ai): add authorization grounding and fallback coverage
a907844 refactor(ai): adapt existing assistants to unified brain
dc7a514 feat(ai): add shared intent router and response contract
4f7ae53 feat(ai): add shared authorized context layer
```

**File modificati/non tracciati ancora presenti nel worktree** (classificati in Fase 2):
```
 M data/omi/processed/omi_import_report.json
 M src/components/zone-progress/ZoneProgressPanel.jsx
 M src/hooks/useZoneProgress.js
 M src/lib/services/zone-progress-api.js
 M src/lib/supabaseClient.js
 M src/pages/public/configurator/Step2.jsx
 M src/pages/public/configurator/Step3.jsx
 M src/pages/public/configurator/Step4.jsx
 M supabase/functions/analysis-istat/index.ts
 M tests/browser_step2_online_verification.cjs
 M tests/configurator_step1_4.test.mjs
 M tests/zone_progress_client.test.mjs
 M tests/zone_progress_ui_integration.test.mjs
?? AI_BRAIN_V1_ARCHITECTURE.md
?? AI_BRAIN_V2_IMPLEMENTATION_REPORT.md
?? FINAL_PROJECT_LOCAL_AUDIT.md
?? P0_CUSTOMER_DASHBOARD_FIX_REPORT.md
?? P0_DATABASE_AI_SECURITY_FIX_REPORT.md
?? P1_NIL_ADDRESS_ACTIVATION_REPORT.md
?? P1_REAL_NIL_MIGRATION_REPORT.md
?? P1_TERRITORIAL_DATA_ACTIVATION_REPORT.md
?? artifacts/
```

### Definizione release

| Campo | Valore |
|---|---|
| Release candidate commit | `04c7008821087f81523b80b3a21ad1835346fa69` (HEAD) |
| Nome release | `VolantiniPro — AI Brain + GPS Manual Coverage + Pre-Deploy Hardening` |
| Tag proposto (non creato) | `predeploy-ready-v1` |
| Data release (proposta) | 2026-08-06 |
| Componenti inclusi | Context/Router/Schema/Adapter AI condivisi (Admin, Cliente, Territoriale); modello canonico copertura GPS manuale (`campaign_coverage_adjustments` come source of truth, `campaign_zone_progress` come cache derivata); migrazioni territoriali GTFS/POI/NIL/civici; hardening 4 funzioni SECURITY DEFINER; 4 Edge Function AI verificate in locale |

**Il tag non è stato creato**, come richiesto.

## Fase 2 — Esclusione file non approvati dalla release

| File | Appartenenza | Entra nella release | Motivo | Rischio | Azione richiesta prima del deploy |
|---|---|---|---|---|---|
| `data/omi/processed/omi_import_report.json` | Report di processo (import OMI) | **No** | Non è codice/schema, è un artefatto di un'esecuzione locale di uno script di import | Nessuno (dato non sensibile, non applicativo) | Nessuna — ignorare o rigenerare all'occorrenza |
| `src/components/zone-progress/ZoneProgressPanel.jsx` | Altro processo (estensione percent-only di `campaign_zone_progress`) | **No, non in questo ciclo** | Fuori dal mandato esplicito dei cicli precedenti (GPS-MANUAL-COVERAGE-4, FINAL-PRE-DEPLOY-FIXES); modifica un componente UI condiviso con la vista Cliente/Admin già in uso | Medio — se non riconciliato, la release include un componente che diverge dal comportamento testato in questo ciclo | Revisione e commit esplicito da parte del proprietario di quel lavoro, **prima** del freeze release |
| `src/hooks/useZoneProgress.js` | Altro processo | **No, non in questo ciclo** | Come sopra | Medio | Come sopra |
| `src/lib/services/zone-progress-api.js` | Altro processo | **No, non in questo ciclo** | Come sopra (già ripulito da trailing whitespace nel ciclo FINAL-PRE-DEPLOY-FIXES, il resto del contenuto resta di competenza esterna) | Medio | Come sopra |
| `src/lib/supabaseClient.js` | Altro processo | **No, non in questo ciclo** | Modifica il bridge di sessione condiviso da tutta l'app | **Alto** se contiene un bug non testato in questo ciclo — verificare con `npm test` prima di committare | Revisione dedicata, non un semplice commit-e-basta |
| `src/pages/public/configurator/Step2.jsx`, `Step3.jsx`, `Step4.jsx` | Altro processo | **No, non in questo ciclo** | Componenti del Configuratore, flusso critico per il business | Medio-Alto | Revisione + smoke test Configuratore completo prima del commit |
| `supabase/functions/analysis-istat/index.ts` | Altro processo | **No, non in questo ciclo** | Edge Function territoriale già deployata; modifiche non testate in questo ciclo | Medio | Revisione + test locale della function prima del deploy |
| `tests/browser_step2_online_verification.cjs`, `tests/configurator_step1_4.test.mjs`, `tests/zone_progress_client.test.mjs`, `tests/zone_progress_ui_integration.test.mjs` | Altro processo (test) | **No, non in questo ciclo** | Modifiche ai test associate alle modifiche applicative sopra, stesso proprietario | Basso (sono test, non codice di produzione) ma da tenere allineati ai file che testano | Committare insieme ai file applicativi corrispondenti, non separatamente |
| `AI_BRAIN_V1_ARCHITECTURE.md`, `AI_BRAIN_V2_IMPLEMENTATION_REPORT.md`, `FINAL_PROJECT_LOCAL_AUDIT.md`, `P0_CUSTOMER_DASHBOARD_FIX_REPORT.md`, `P0_DATABASE_AI_SECURITY_FIX_REPORT.md`, `P1_NIL_ADDRESS_ACTIVATION_REPORT.md`, `P1_REAL_NIL_MIGRATION_REPORT.md`, `P1_TERRITORIAL_DATA_ACTIVATION_REPORT.md` | Documentazione di sessioni precedenti | **No** | Report di lavoro intermedio, non documentazione di prodotto | Nessuno | Nessuna azione — restano fuori dalla release per design (non sono artefatti di deploy) |
| `artifacts/step2-online-2026-07-19/*` | Screenshot/JSON di verifica manuale | **No** | Artefatti di test visivo, non build output | Nessuno | Nessuna — eventualmente spostare fuori dal repo se serve conservarli |

**Nessun file è stato cancellato o committato automaticamente in questa fase**, come richiesto. La release candidate (`HEAD` = `04c7008`) include già tutto ciò che è stato classificato "necessario" nei cicli precedenti (migrazioni territoriali 010–014, migrazione GPS 002/003/004, test/script associati, hardening sicurezza) — i file sopra sono **residui di un processo esterno concorrente**, non parte del lavoro di questa serie di sessioni, e restano volutamente fuori dalla release candidate finché il loro proprietario non li revisiona e committa.

## Fase 3 — Stato del database remoto (sola lettura)

**Metodo e limite di accesso dichiarato esplicitamente**: le uniche credenziali disponibili in questo ambiente per il progetto remoto sono la chiave pubblica `anon`/`publishable` (in `.env`, tracciata solo come placeholder in `.env.example`) e — presente ma **mai usata** in questa sessione — una chiave `service_role`/`secret` in un file locale ignorato da Git. Nessuna stringa di connessione Postgres diretta (host/porta/password del database) è presente in alcun file di questo ambiente. Di conseguenza:

- **Osservabile via PostgREST (REST API, sola lettura, chiave anon)**: esistenza di tabelle/funzioni esposte, tramite l'errore di schema-cache che PostgREST restituisce per un oggetto assente (`PGRST205`/`PGRST202`) contro un 200/401 per un oggetto presente.
- **Non osservabile senza una connessione Postgres diretta**: versione PostgreSQL, elenco estensioni, contenuto di `supabase_migrations.schema_migrations`, definizioni di trigger/policy/indici, dimensione del database, lock o query lunghe (`pg_stat_activity`). **Questo è un gap reale e bloccante per una riconciliazione certa** — vedi Fase 4 e il verdetto finale.

### Tabelle verificate (PostgREST, chiave anon, sola lettura)

| Tabella/Funzione | Stato remoto osservato | Evidenza |
|---|---|---|
| `geo_municipalities` | Presente | `200`, 0 righe visibili con la chiave anon |
| `geo_municipality_nil` | **Assente dalla cache schema PostgREST** (ambiguo — vedi nota sotto) | `404 PGRST205`, suggerimento "Perhaps you meant 'geo_municipalities'" |
| `address_points` | Presente, con dati | `200`, righe presenti |
| `omi_zones` | Presente, con dati | `200`, righe presenti |
| `gtfs_stops` | Presente, vuota | `200`, 0 righe |
| `gtfs_routes` | **Assente** | `404 PGRST205` |
| `gtfs_stop_times` | **Assente** | `404 PGRST205` |
| `poi_cache` | Presente, con dati | `200`, righe presenti |
| `campaigns` | Presente | `200`, 0 righe visibili (RLS/anon) |
| `campaign_zones` | Presente | `200`, 0 righe visibili |
| `campaign_zone_progress` | Presente, RLS attiva | `401` permission denied (tabella esiste, accesso correttamente negato ad anon) |
| `campaign_zone_progress.source` (colonna) | **Assente** | `400`, `column campaign_zone_progress.source does not exist` — **prova diretta che la migrazione `20260806000003` non è applicata remotamente** |
| `campaign_zone_progress_history` | Presente, RLS attiva | `401` |
| `campaign_coverage_adjustments` | **Assente** | `404 PGRST205` — **prova diretta che `20260806000001` non è applicata** |
| `campaign_coverage_adjustments_log` | **Assente** | `404 PGRST205` |
| `gps_tracking_points` | Presente, RLS attiva | `401` |
| `delivery_sessions` | Presente, RLS attiva | `401` |
| `ai_territorial_chat_cache` | **Assente** | `404 PGRST205` |
| `ai_territory_summaries` | Presente | `200`, 0 righe visibili |
| `profiles` | Presente | `200`, 0 righe visibili |
| RPC `get_map_sectors` | Presente e funzionante | `200`, GeoJSON reale restituito |
| RPC `get_nil_breakdown_in_radius` | **Ambiguo** | `200`, `[]` — la funzione risponde ma la tabella che dovrebbe interrogare (`geo_municipality_nil`) risulta assente da PostgREST: o la funzione esiste in una versione precedente che punta altrove, o la tabella esiste ma non è nella cache schema PostgREST (richiede `NOTIFY pgrst, 'reload schema'` o verifica diretta) |
| RPC `get_address_points_radius_summary` | **Assente** | `404 PGRST202` — **prova diretta che `20260805000013` non è applicata** |

**Nessuna riga di dato personale è stata letta o riportata**: tutte le richieste hanno usato `select=id&limit=1` o funzioni aggregate/GeoJSON pubbliche; nessun contenuto di `profiles`/`campaigns`/dati cliente è stato osservato (tutti 0 righe visibili con la chiave anon, coerente con RLS).

## Fase 4 — Riconciliazione migration history (best-effort, senza accesso diretto a Postgres)

| Versione | File locale | History remota (`supabase_migrations.schema_migrations`) | Schema remoto osservato | Azione proposta | Rischio |
|---|---|---|---|---|---|
| `001`–`037`, `202607230001`, `20260724101527`, `20260731*`, `2026080[1-3]*`, `20260805000001`–`009` | Presenti, committate | **Non verificabile** (nessun accesso diretto) | Oggetti corrispondenti (`campaigns`, `campaign_zones`, `campaign_zone_progress`, `gps_tracking_points`, `delivery_sessions`, `profiles`, `ai_territory_summaries`, RLS attiva) **osservati presenti e funzionanti** | **Assumere già applicate** — evidenza di schema forte, ma senza `schema_migrations` la registrazione formale resta da confermare da un operatore con accesso diretto | Basso se confermato, **medio** se la ledger non fosse allineata (possibile drift silenzioso) |
| `20260805000010_gtfs_routes_stop_times` | Presente, committata (`d5d1e6f`) | Non verificabile | **Schema parzialmente assente**: `gtfs_stops` esiste (da migrazione più vecchia) ma `gtfs_routes`/`gtfs_stop_times` no | **Candidata ad applicazione SQL reale** | Medio — tabelle nuove, nessun dato esistente da perdere |
| `20260805000011_poi_cache_radius` | Presente, committata (`d5d1e6f`) | Non verificabile | `poi_cache` esiste (probabilmente da migrazione precedente); RPC `get_cached_pois_in_radius` non verificata (richiede `service_role`, non testata con anon per non usare quella chiave) | **Da verificare con operatore autorizzato** prima di classificare | Basso |
| `20260805000012_milano_nil_pgt2030` | Presente, committata (`5474482`, con fix idempotenza) | Non verificabile | **Ambiguo** — vedi nota RPC sopra | **Candidata ad applicazione SQL reale, ma verificare prima se `geo_municipality_nil` esiste davvero** (possibile problema di cache PostgREST, non di schema) tramite un operatore con accesso diretto | Medio — il fix di idempotenza rende sicura una riapplicazione anche se la tabella esistesse già |
| `20260805000013_address_points_radius_summary` | Presente, committata (`d5d1e6f`) | Non verificabile | RPC assente confermato | **Candidata ad applicazione SQL reale** | Basso — solo indice + funzione, nessuna tabella nuova |
| `20260805000014_real_nil_geometry_tolerance` | Presente, committata (`d5d1e6f`) | Non verificabile | Dipende da `012`, non verificabile indipendentemente | **Candidata, subordinata alla verifica di `012`** | Basso, dipendente |
| `20260806000001_campaign_coverage_adjustments` | Presente, committata (`18aec90`) | Non verificabile | **Assente, confermato** | **Candidata ad applicazione SQL reale** | Medio — tabelle nuove, nessun dato esistente da perdere, ma introduce RLS/trigger nuovi da verificare post-deploy |
| `20260806000002_gps_manual_coverage_v2` | Presente, committata (`5474482`, con fix idempotenza) | Non verificabile | **Assente, confermato** (`campaign_zone_progress.source` non esiste, quindi nemmeno le colonne di `002` possono esistere) | **Candidata ad applicazione SQL reale** | **Medio-Alto** — modifica `campaign_zone_progress` esistente con dati potenzialmente reali; il fix di idempotenza di questo ciclo copre il replay, ma la riconciliazione dati (righe `manual_percent` storiche) va rivalutata su dati reali remoti, non sui dati di test locali |
| `20260806000003_gps_coverage_canonical_consolidation` | Presente, committata (`0b133b6`) | Non verificabile | **Assente, confermato** | **Candidata, subordinata a `002`** (dipendenza strutturale documentata in `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md`) | Medio |
| `20260806000004_harden_security_definer_search_path` | Presente, committata (`e52fdb1`) | Non verificabile | Non verificabile senza `pg_proc`/`pg_catalog` diretto | **Candidata ad applicazione SQL reale** (idempotente per costruzione — solo `ALTER FUNCTION`/`REVOKE`/`GRANT`) | Basso |

**Nessuna migrazione è "sostituita" o "da non rieseguire"**: tutte le migrazioni committate in questa serie di sessioni risultano, sulla base dell'evidenza raccolta, **non ancora applicate al remoto**.

**Non viene proposto un `db push --include-all`.** La ragione è esplicita: senza accesso a `supabase_migrations.schema_migrations` non è possibile escludere un drift silenzioso (una migrazione applicata manualmente sul remoto ma mai registrata, o viceversa una registrata ma il cui SQL è stato modificato dopo l'applicazione). Il piano operativo (Fase 6 del runbook) prescrive **verifica riga per riga della ledger reale prima di qualunque comando di push**, non un push cieco.

---

Il resto del piano (backup/restore, strategia migrazioni dettagliata, Edge Function, env/segreti, frontend, runbook di pubblicazione, rollback, checklist GO/NO-GO) è in [VOLANTINIPRO_DEPLOY_RUNBOOK.md](VOLANTINIPRO_DEPLOY_RUNBOOK.md).
