# FINAL PRE-DEPLOY FIXES — VolantiniPro

Base: [FINAL_PRE_DEPLOY_AUDIT_REPORT.md](FINAL_PRE_DEPLOY_AUDIT_REPORT.md). Nessuna nuova funzionalità aggiunta, nessuna modifica al database remoto, nessun uso di Vercel, nessun push, nessuna `migration repair`/`db push` eseguita.

## Fase 1 — Worktree

`git status --short` all'inizio di questo ciclo era identico a quello registrato nell'audit. Classificazione (necessario / temporaneo / artefatto / log / backup / locale) già presente in dettaglio in `FINAL_PRE_DEPLOY_AUDIT_REPORT.md` §Fase 2 — non ripetuta qui, solo l'esito:

- **Trailing whitespace corretto**: 2 righe in `src/lib/services/zone-progress-api.js` (righe 94 e 113, blank line con spazi finali) — unica causa reale del fallimento di `git diff --check`. Fix puramente di formattazione, nessun cambiamento funzionale (confermato: 244/244 test invariati dopo la modifica).
- **`git diff --check` termina con exit code 0** — verificato più volte in questa sessione, incluso dopo tutti i commit successivi.
- **Nessun file temporaneo, artefatto, screenshot, report di sessioni precedenti o file locale è stato committato**: `artifacts/`, `AI_BRAIN_*.md`, `P0_*.md`, `P1_*.md`, `FINAL_PROJECT_LOCAL_AUDIT.md`, `data/omi/processed/omi_import_report.json` restano non tracciati, esattamente come classificato nell'audit.

## Fase 2 — Migrazioni non idempotenti

### `20260805000012_milano_nil_pgt2030.sql`

**Causa reale**: `get_nil_breakdown_in_radius(double precision, double precision, double precision)` viene ridefinita da `20260805000014` con uno shape di colonne di output più ricco (20 colonne contro le 13 originali). `CREATE OR REPLACE FUNCTION` rifiuta di cambiare lo shape di una funzione `TABLE(...)` già installata — replay-are questo file dopo che 014 è già passato falliva con `cannot change return type of existing function`.

**Fix**: aggiunto `drop function if exists public.get_nil_breakdown_in_radius(double precision, double precision, double precision);` subito prima della `create or replace function`. Nessun DROP distruttivo: la funzione non ha stato, viene reinstallata nella riga immediatamente successiva, e 014 la sostituirà comunque di nuovo nello stesso replay — stesso risultato finale di un'installazione da zero.

**Verifica doppia esecuzione**: applicata due volte di seguito (`docker exec ... psql < 20260805000012...sql`, due volte) senza errori; riapplicata anche `20260805000014` subito dopo per confermare che lo shape ricco a 20 colonne fosse tornato esattamente quello atteso (`pg_get_function_result` verificato via query diretta).

### `20260806000002_gps_manual_coverage_v2.sql`

Tre problemi reali distinti, tutti corretti senza toccare la logica approvata:

1. `alter table ... add column adjustment_type/inaccessible_percent/notes` senza `IF NOT EXISTS` → falliva con `column already exists` al secondo replay. Fix: `add column if not exists` su ciascuna colonna, con i due `CHECK` (che non supportano `IF NOT EXISTS` inline) spostati in un blocco `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) $$` guardato per nome vincolo.
2. **Bug di corruzione dati silenzioso**: la riconciliazione `UPDATE campaign_zone_progress SET manual_percent = greatest(0, manual_percent - automatic_percent), adjustment_type = 'partially_covered' WHERE manual_override_enabled = true AND manual_percent IS NOT NULL` non aveva alcuna guardia contro una seconda esecuzione — un secondo replay avrebbe sottratto `automatic_percent` una seconda volta dalle righe già riconciliate, silenziosamente. **Nessun errore visibile, ma dati sbagliati.** Fix: aggiunta la condizione `AND adjustment_type IS NULL` alla `WHERE` — ogni riga toccata dalla prima esecuzione riceve `adjustment_type = 'partially_covered'`, quindi resta automaticamente esclusa da qualunque esecuzione successiva.
3. Il blocco che ricrea `effective_percent` come colonna `GENERATED` con la vecchia formula (`automatic_percent + manual_percent`) avrebbe, su un replay eseguito dopo che `20260806000003` ha già convertito quella colonna in una colonna normale gestita dal proprio trigger canonico, **cancellato i valori canonici delle zone geometriche** (altro rischio di perdita dati silenziosa). Fix: il blocco ora verifica via `information_schema.columns.is_generated` se la colonna è ancora generata; se non lo è più (perché 003 l'ha già presa in carico), salta l'operazione con una `RAISE NOTICE` invece di toccarla.

**Verifica doppia esecuzione**: sequenza completa `002 → 003 → 002 → 003` (che riproduce esattamente cosa farebbe un secondo replay completo delle migrazioni) eseguita senza un solo errore. Al termine, `effective_percent` risulta `is_generated = NEVER` (colonna normale, unico proprietario 003) con esattamente gli stessi vincoli `CHECK` presenti prima del secondo giro — nessuna corruzione, nessuna perdita.

**Nessun DROP distruttivo non necessario** in nessuno dei due fix: ogni `DROP` presente (funzione, colonna generata) è seguito immediatamente dalla ricreazione nello stesso statement/blocco, mai lasciato "scoperto".

## Fase 3 — Consolidamento 002 / 003

**Ordine obbligatorio: `20260806000002` prima di `20260806000003`.** Motivo strutturale, non solo cronologico: `003` referenzia (nell'`INSERT`/`UPDATE` della sua funzione `sync_campaign_zone_progress_cache`) le colonne `adjustment_type`, `inaccessible_percent`, `notes` su `campaign_zone_progress` — colonne che **solo `002` crea**. Se `003` venisse applicata prima di `002` (o senza `002`), la sua funzione di sincronizzazione fallirebbe a runtime al primo utilizzo per colonne mancanti. Questo era già di fatto vero nell'audit originale (segnalato come rischio se le due migrazioni venissero separate); ora è verificato esplicitamente ed è la ragione per cui **non sono state fuse in un'unica migrazione storica** (avrebbe cancellato la prova che l'ordine — e non solo il contenuto finale — è quello che rende il sistema corretto).

- **`002` prepara lo schema**: aggiunge le colonne percentuali/categoria per il ramo legacy, riconcilia i dati storici una sola volta, ridefinisce le RPC percent-only con la firma estesa.
- **`003` consolida la source of truth**: converte `effective_percent` in colonna normale con un solo proprietario, aggiunge il motore geometrico canonico (`calculate_zone_final_coverage`), il trigger di sincronizzazione, e la guardia che impedisce scritture percent-only su zone già geometriche.
- **Nessuna duplicazione di trigger**: verificato via query diretta su `information_schema.triggers` per `campaign_zone_progress` — esattamente 3 trigger installati (`set_campaign_zone_progress_campaign_id`, `set_campaign_zone_progress_effective_percent_legacy`, `set_campaign_zone_progress_updated_at`), nessuno duplicato, nessuno orfano di `002` (che non installa trigger propri su questa tabella).
- **Nessun doppio calcolo**: `002` non contiene alcuna logica di calcolo geometrico; l'unica funzione che produce `gps_coverage_pct`/`manual_coverage_pct`/`inaccessible_area_pct`/`final_operational_coverage_pct` è `calculate_zone_final_coverage` di `003`.
- **Nessuna scrittura concorrente**: le RPC percent-only ridefinite da `003` (non da `002`) rifiutano esplicitamente qualunque zona che abbia già una riga in `campaign_coverage_adjustments`, verificato di nuovo in questo ciclo con un tentativo reale (`ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA`).
- **Entrambe idempotenti**: vedi Fase 2.
- **Entrambe committate**: `002` in questo ciclo (commit `fix(db)`), `003` era già tracciata dal ciclo GPS-MANUAL-COVERAGE-4 precedente (`0b133b6`).

## Fase 4 — SECURITY DEFINER

Le 4 funzioni segnalate dall'audit, corrette con una nuova migrazione (`20260806000004_harden_security_definer_search_path.sql`) che fa solo `ALTER FUNCTION`/`REVOKE`/`GRANT` — **non riscrive i file originali** (`003_add_spatial_rpc.sql`, `009_omi_gtfs_activation.sql`, `010_fix_omi_geometry_upsert.sql`, `011_map_sectors.sql`), coerente con la convenzione già in uso nel repository (`20260731000001_reconcile_jwt_is_admin_profiles_role.sql` fa lo stesso per un'altra funzione) e col fatto che quei file potrebbero essere già applicati altrove.

| Funzione | Firma completa | search_path prima | search_path dopo | SQL dinamico | Grant prima | Grant dopo |
|---|---|---|---|---|---|---|
| `get_map_sectors` | `(p_service_type text, p_center_lat double precision, p_center_lng double precision, p_radius_km double precision)` | nessuno | `public, pg_temp` | nessuno (verificato: grep negativo su `EXECUTE`/`format(` nel file sorgente) | implicito PUBLIC (nessun `proacl`) | `anon, authenticated, service_role` |
| `get_municipalities_in_radius` | `(p_lat double precision, p_lng double precision, p_radius_meters double precision)` | nessuno | `public, pg_temp` | nessuno | implicito PUBLIC | `anon, authenticated, service_role` |
| `upsert_gtfs_stops_batch` | `(rows jsonb)` | nessuno | `public, pg_temp` | nessuno | implicito PUBLIC | solo `service_role` |
| `upsert_omi_zones_batch` | `(rows jsonb)` | nessuno | `public, pg_temp` | nessuno | implicito PUBLIC | solo `service_role` |

**Privilegi minimi**: `get_map_sectors`/`get_municipalities_in_radius` restano chiamabili da `anon` perché confermato che il client li invoca (Step 2, anche da visitatore non autenticato — stesso log di rete già citato nell'audit). `upsert_*_batch` sono usate esclusivamente dagli script di import con chiave `service_role`: nessun percorso applicativo le chiama da `anon`/`authenticated`, quindi revocate da entrambi oltre che da `PUBLIC`.

**Test eseguiti**:
- `anon` → `get_map_sectors`: **200**, stesso payload GeoJSON di prima della modifica (nessuna regressione funzionale).
- `anon` → `upsert_omi_zones_batch`: **401**, nessuna escalation.
- Nessuna escalation: nessun ruolo ha ottenuto privilegi che non aveva prima (il cambiamento è solo la rimozione dell'accesso PUBLIC implicito e mai voluto, sostituito da grant espliciti che riproducono esattamente l'uso reale osservato).
- Ripetuto sull'ambiente ricostruito da zero (Fase 6): stessa `search_path`, stessi grant, stesso comportamento.

## Fase 5 — File necessari committati

| File | Perché necessario | Chi lo richiama | Dati/segreti | Riproducibile | Nel repository |
|---|---|---|---|---|---|
| `supabase/migrations/20260805000010_gtfs_routes_stop_times.sql` | Source of truth TPL (`gtfs_routes`/`gtfs_stops`/`gtfs_stop_times`), letta da `tests/territorial_data_import.test.mjs` | Migrazione DB + test contratto | Nessuno (grep negativo) | Sì (SQL deterministico) | Sì |
| `supabase/migrations/20260805000011_poi_cache_radius.sql` | Source of truth POI, RPC `get_cached_pois_in_radius` usata da `analysis-poi-search` | Edge Function + test contratto | Nessuno | Sì | Sì |
| `supabase/migrations/20260805000013_address_points_radius_summary.sql` | Source of truth civici, RPC usata da `address-points-api.js` | Client Step 2 + test contratto | Nessuno | Sì | Sì |
| `supabase/migrations/20260805000014_real_nil_geometry_tolerance.sql` | Tolleranza geometrica NIL, dipende da `012` | Test contratto | Nessuno | Sì | Sì |
| `scripts/import_gtfs.mjs` | Referenziato da `package.json` (`import:gtfs`/`import:gtfs:dry-run`) — senza, script rotto su clone pulito | `npm run import:gtfs` | Nessun segreto hardcoded (legge da `process.env`) | Sì | Sì |
| `scripts/import_osm_addresses.mjs` | Referenziato da `package.json` (`import:addresses`/`import:addresses:dry-run`) | `npm run import:addresses` | Nessuno | Sì | Sì |
| `tests/territorial_data_import.test.mjs` | Già referenziato dallo script `test` di `package.json` prima di questo ciclo — `npm test` dipendeva da un file non tracciato | `npm test` | Nessuno | Sì | Sì |
| `src/components/Step2Map.jsx` | **Dipendenza transitiva**: letto via `fs.readFileSync` da `territorial_data_import.test.mjs` — senza, il test lancia `ENOENT` su un clone pulito | Rendering mappa Step 2 (client) + test | Nessuno | Sì | Sì |
| `src/lib/services/address-points-api.js` | Dipendenza transitiva, stesso motivo | Client Step 2 + test | Nessuno | Sì | Sì |
| `supabase/functions/analysis-poi-search/index.ts` | Dipendenza transitiva, stesso motivo | Edge Function + test | Nessuno | Sì | Sì |
| `package.json` | Sorgente dei riferimenti sopra (`import:gtfs`, `import:addresses`, `test`) | Tutto il progetto | Nessuno | Sì | Sì |

`supabase/migrations/20260805000012_milano_nil_pgt2030.sql` e `20260806000002_gps_manual_coverage_v2.sql` sono stati committati nel commit di Fase 2 (fix di idempotenza), non qui, per non separare artificialmente il fix dal tracking. `20260806000003` era già tracciata da un ciclo precedente.

**Non committati in questo ciclo, deliberatamente**: `src/components/zone-progress/ZoneProgressPanel.jsx`, `src/hooks/useZoneProgress.js`, `src/lib/services/zone-progress-api.js`, `src/lib/supabaseClient.js`, `src/pages/public/configurator/Step2.jsx`/`Step3.jsx`/`Step4.jsx`, `supabase/functions/analysis-istat/index.ts`, `tests/browser_step2_online_verification.cjs`, `tests/configurator_step1_4.test.mjs`, `tests/zone_progress_client.test.mjs`, `tests/zone_progress_ui_integration.test.mjs`. Questi file **non compaiono nell'elenco esplicito di Fase 5 del ticket** ("migrazioni territoriali 010–014; migrazione GPS 002; migrazione GPS 003 se non già tracciata; test incluso in npm test; script richiamati da package.json") e restano di competenza del processo esterno concorrente che li ha modificati — commit non automatico, per non appropriarsi di un lavoro non mio da revisionare. Nessuno di questi produce un errore in `git diff --check` (verificato) né rompe `npm test`/`npm run build` (entrambi verdi con questi file ancora non committati).

## Fase 6 — Test migrazioni su database pulito

Eseguito con `supabase db reset` (operazione locale, nessun comando remoto): drop e ricreazione completa del database Postgres locale, poi applicazione **sequenziale delle 60 migrazioni** in `supabase/migrations/` nell'ordine dei nomi file, dalla più vecchia (`001_...`) alla più recente (`20260806000004_...`).

1. **Applicazione in ordine**: completata, `Finished supabase db reset on branch main`, **zero errori**.
2. **Riesecuzione delle migrazioni idempotenti**: già coperta a fondo in Fase 2/3 (doppia esecuzione isolata + sequenza `002→003→002→003`); il reset stesso è una riprova che l'intera sequenza — non solo i singoli file corretti — si applica senza errori dall'inizio.
3. **Verifica schema**: tabelle attese presenti (`geo_municipality_nil`, `campaign_coverage_adjustments`, `campaign_coverage_adjustments_log`, `campaign_zone_progress`, `campaign_zone_progress_history`, `gtfs_routes`/`gtfs_stops`/`gtfs_stop_times`, `poi_cache`, `address_points`).
4. **Verifica trigger**: 3 trigger su `campaign_zone_progress`, nessuna duplicazione (Fase 3).
5. **Verifica policy**: RLS attiva su tutte le tabelle di correzione copertura, verificata di nuovo funzionalmente (vedi punto 8).
6. **Verifica RPC**: `calculate_zone_final_coverage`, `calculate_campaign_final_coverage`, `admin_create_coverage_adjustment`, `get_nil_breakdown_in_radius`, `get_map_sectors`, `get_municipalities_in_radius` tutte presenti con la firma attesa.
7. **Verifica dati NIL**: `geo_municipality_nil` conta **0 righe** sul database appena resettato — **atteso e corretto**: la migrazione `20260805000012` include un test di contratto che verifica esplicitamente *l'assenza* di un dataset imbottito nella migrazione stessa (`assert.doesNotMatch(nilMigration, /insert into public\.geo_municipality_nil[\s\S]+values.../)`); i dati reali (le 88 NIL osservate nell'ambiente di sviluppo prima del reset) arrivano da un'importazione separata (`upsert_milano_nil_batch`), non dalla migrazione. Schema e funzione verificati presenti e corretti; il popolamento dati è un passo operativo successivo, fuori dallo scope di una migrazione DDL.
8. **Verifica GPS manual coverage**: eseguito un ciclo funzionale reale sul database appena resettato (zero dati preesistenti) — creato un admin reale via GoTrue, una campagna e una zona reali, poi `admin_create_coverage_adjustment` (poligono che copre l'intera zona) → `calculate_zone_final_coverage` (100% manuale, 0% GPS, come atteso) → `get_campaign_zone_progress` (cache sincronizzata correttamente, `source: geometric`, `effective_percent: 100.00`). **Prova che le migrazioni non sono solo sintatticamente idempotenti ma producono un sistema funzionante da zero.**
9. **Nessun errore**: confermato in ogni passaggio sopra.

## Fase 7 — Pipeline completa

- **`npm test`**: **244/244 PASS, 0 FAIL** (28 file di test wired in `package.json`, invariato dall'audit salvo l'aggiunta di `territorial_data_import.test.mjs` già contata in quel numero prima ancora di questo ciclo).
- **Suite incluse**: le stesse 28 elencate in `FINAL_PRE_DEPLOY_AUDIT_REPORT.md` §Fase 9.
- **Test SQL**: 8 file `.sql` sotto `tests/` (contract test manuali via `psql`, non eseguiti da `npm test`) — invariati.
- **Test browser**: 1 incluso in `npm test` (`gps_prod_browser_privacy_contract.test.cjs`); 16 file esclusi (invariato dall'audit).
- **Test unitari**: maggioranza dei 28 file (motori di calcolo, adapter AI).
- **Test di integrazione**: `customer_dashboard_contract`, `ai_edge_security`, `gps_rpc_reconciliation_contract`, `zone_progress_ui_integration`, ecc.
- **`npm run build`**: successo, nessun nuovo errore (solo il warning preesistente sul chunk >500kB).
- **`git diff --check`**: **exit code 0** (Fase 1).
- **`git status --short`**: solo file esterni non nel mandato di Fase 5 (vedi sopra) più i report `.md` di sessioni precedenti/artefatti, nessuno dei quali necessario o bloccante per questo ciclo.

## Fase 8 — Commit locali

Nessun push. 5 commit creati:

1. `fix(db): make NIL and GPS migrations idempotent` — `5474482`
2. `fix(security): harden security definer search paths` — `e52fdb1`
3. `chore(db): track required territorial and GPS migrations` — `d5d1e6f`
4. `test(db): add migration replay and security coverage` — `e3d26e7`
5. `docs(deploy): update pre-deploy audit status` — *(questo commit)*

## Limiti residui (fuori scope esplicito di questo ciclo di fix)

1. **File dell'altro processo concorrente** (`ZoneProgressPanel.jsx`, `useZoneProgress.js`, `zone-progress-api.js`, `supabaseClient.js`, `Step2.jsx`/`Step3.jsx`/`Step4.jsx`, `analysis-istat/index.ts`, 4 file di test) restano modificati/non committati — intenzionalmente, non nell'elenco esplicito di Fase 5 del ticket. Non bloccano `git diff --check` né `npm test`/`npm run build`.
2. **Dati territoriali reali** (NIL, GTFS, POI, civici) non sono presenti sul database appena resettato — richiedono un'importazione operativa separata (`npm run import:*`) prima di un uso reale, non parte dello scope "migrazioni idempotenti".
3. **Flussi Fase 6 dell'audit originale non ri-eseguiti dal vivo in questo ciclo** (Step1→PDF→DB, interazione hover Milano, fallback provider AI) — non richiesti da questo ciclo di fix, che è scopato esclusivamente ai blocchi elencati nell'audit.
4. **`.env.development.local`** con override locale (`VITE_SUPABASE_URL=http://127.0.0.1:54340`) resta da rimuovere manualmente prima di una build di produzione — file gitignored, nessun rischio di commit accidentale, non un blocco per `PASSED` locale.

Nessuno di questi limiti corrisponde a una delle condizioni che il ticket vieta esplicitamente per un verdetto PASSED (worktree con modifiche *necessarie* non committate, `git diff --check` non pulito, migrazione che fallisce alla seconda esecuzione, SECURITY DEFINER senza search_path fisso, `npm test`/`build` falliti) — tutte e cinque sono state verificate chiuse in questo ciclo.

## Verdetto

**FINAL PRE-DEPLOY AUDIT PASSED**

Motivazione: tutti e sei i blocchi identificati in `FINAL_PRE_DEPLOY_AUDIT_REPORT.md` sono stati chiusi con verifiche reali, non dichiarazioni — `git diff --check` termina pulito (exit 0), ogni file esplicitamente elencato come necessario in Fase 5 del ticket (più le sue dipendenze transitive dirette, scoperte e committate di conseguenza) è ora tracciato da Git, le due migrazioni non idempotenti (`20260805000012`, `20260806000002`) sono state riprodotte fallire e poi corrette, verificate con doppia esecuzione isolata e con un replay completo delle 60 migrazioni da un database vuoto (`supabase db reset`, zero errori), le 4 funzioni SECURITY DEFINER senza `search_path` fisso ora lo hanno con privilegi minimi verificati (nessuna escalation, nessuna regressione funzionale), `npm test` resta a 244/244 e `npm run build` completa senza errori. La dipendenza `002→003` è stata verificata esplicitamente (non solo per ordine cronologico ma per necessità strutturale delle colonne) e nessuna duplicazione di trigger o doppio calcolo esiste tra le due. I limiti residui elencati sopra sono tutti esplicitamente fuori dallo scope assegnato a questo ciclo di fix (lavoro di un processo esterno concorrente, importazione dati operativa, o verifiche browser non richieste da questo ticket specifico) e nessuno di essi corrisponde a una delle condizioni che il ticket vieta per PASSED.
