# DEPLOY-PLAN-3 — Production-Safe Release Migration Chain

Stato: **COMPLETO** — verdetto finale **PARTIAL** in fondo al documento.

> **Aggiornamento — DEPLOY-PLAN-4 (2026-08-06).** Il rischio di collisione con `001`/`002`/`003` — motivo del verdetto PARTIAL qui sotto — è stato **isolato** (non risolto) in [PRODUCTION_MIGRATION_LEDGER_ISOLATION.md](PRODUCTION_MIGRATION_LEDGER_ISOLATION.md): un runner dedicato (`scripts/deploy-production-migrations.mjs`) applica esclusivamente i file di questa cartella, con un ledger proprio (`public.volantinipro_release_migrations`), hash SHA-256, stop-su-errore e una guardia che rifiuta categoricamente qualunque file in stile `001`/`002`/`003`. Verdetto di quel ticket: **READY**. Le tre collisioni sono inoltre ora documentate con il contenuto SQL esatto realmente applicato su remoto (non più solo per differenza di nome).

> **Aggiornamento — RC2-FIX-1 (2026-08-06).** Aggiunta una nona migrazione alla catena: `20260806150009_admin_driver_assignment_flow.sql` (flusso di assegnazione Admin→Driver). Riscritta da zero dopo che l'audit forense RC2-FORENSIC-AND-FREEZE-1 aveva trovato una versione precedente (mai committata, mai applicata) con 3 RPC su 7 che fallivano realmente contro lo schema remoto vero (presupponeva colonne `operator_profiles.id`/`.phone`/`.status`/`.metadata` inesistenti — lo schema reale ha `user_id`/`active` booleano, nessun `phone`/`metadata`). La nuova versione è verificata contro lo schema remoto reale confermato via `pg_catalog`, testata end-to-end su clone (dry-run, apply, riapplicazione idempotente, tutte le 8 RPC con dati reali, casi di sicurezza cross-operatore e non autenticato). Dettaglio completo in [ADMIN_DRIVER_LINK_FLOW_RC2_FIX_REPORT.md](ADMIN_DRIVER_LINK_FLOW_RC2_FIX_REPORT.md). Nessuna applicazione al database remoto reale. Tag proposto (non creato): `volantinipro-rc2-2026-08-06`.

> **Aggiornamento — RC2-BROWSER-E2E-1 + RC2-FINALIZE-1 (2026-08-06/07).** `20260806150009` è stata riverificata **in un browser reale**, non solo via RPC/SQL diretto: stack Postgres+GoTrue+PostgREST+Kong locale con la catena `150001`-`150009` applicata, login magic-link autentico per Admin/Driver A/Driver B/Cliente, creazione assegnazione via UI Admin reale, tracking GPS Driver reale (start/pausa/riprendi/termina con verifica DB ad ogni passo), matrice di sicurezza completa (Driver B/Cliente/non autenticato/Admin negati o limitati correttamente), e — punto esplicitamente richiesto prima di poter dichiarare PASSED — revoca reale durante sessione attiva (Admin revoca via `admin_revoke_operator_assignment`, Riprendi bloccato sia lato UI che dal backend `gps_transition_session`, Termina resta disponibile e completa correttamente, `_revoked_pending_stop` e audit log confermati). Durante questa verifica sono stati corretti due bug nel **frontend** (non nella migrazione `150009` stessa, che resta invariata): `useGpsTracking.js` non esponeva campi richiesti da `DriverAssignmentPage.jsx`; `DriverAssignmentPage.jsx` bloccava l'accesso post-revoca anche con sessione live. Dettaglio in [ADMIN_DRIVER_LINK_FLOW_BROWSER_E2E_REPORT.md](ADMIN_DRIVER_LINK_FLOW_BROWSER_E2E_REPORT.md). Verdetto: **PASSED**. Tag annotato locale creato: `volantinipro-rc2-2026-08-07`. Nessuna applicazione al database remoto reale, nessun push, nessun deploy.

Baseline: lo schema **reale del database remoto** `mqkelrsvksrzrpmbstvd` ("volantinipro", eu-west-1), verificato via `supabase db query --linked` (sola lettura, nessuna scrittura eseguita) il 2026-08-06. Non i 60 file di migrazione locali — quelli sono stati usati solo come sorgente di contenuto SQL da riutilizzare dove compatibile.

Namespace nuove migrazioni: `20260806150001` → `20260806150008`, cartella `supabase/migrations_production_safe/`. Nessuna di queste versioni esiste nel ledger remoto `supabase_migrations.schema_migrations` (verificato).

---

## Fase 1 — Tabella di mappatura

| Migrazione locale originale | Nuova migrazione produzione | Motivo |
|---|---|---|
| `20260806000001_gps_manual_coverage_v2.sql` (colonne + tabella adjustments) | `20260806150001_gps_schema_v2_columns_and_adjustments_table.sql` | Rinumerata (nessuna collisione diretta, ma inclusa nel nuovo namespace per coerenza dell'intera catena GPS); riscritta contro lo schema reale remoto di `campaign_zones` (nessuna colonna `geometry`, solo `polygon_geojson`+`center_lat`/`center_lng`/`radius_m`) |
| `20260806000002_gps_manual_coverage_reconcile.sql` (riconciliazione dati legacy) | *(nessuna — assorbita/non necessaria)* | `campaign_zone_progress` remoto ha **0 righe reali** (verificato via `COUNT(*)`) → nessun dato legacy da riconciliare. Il passo di riconciliazione difensivo (`UPDATE ... WHERE adjustment_type IS NULL`) è incluso come no-op atteso dentro `20260806150001` invece di essere un file separato, perché non c'è nulla da migrare |
| `20260806000003_gps_manual_coverage_functions.sql` (funzioni di calcolo e RPC) | `20260806150002_gps_canonical_consolidation.sql` | Rinumerata; funzioni di risoluzione geometria zona riscritte da 3 a 2 fallback (rimossa la ramo `geometry` inesistente su remoto); `admin_set_zone_manual_progress`/`admin_clear_zone_manual_progress` esplicitamente `DROP`pate prima della ricreazione perché il remoto ha ancora le firme originali pre-`002` (3 arg / 2 arg) |
| `20260806000004_harden_security_definer_search_path.sql` | `20260806150006_security_definer_conditional_hardening.sql` | Riscritta con guardie condizionali per-funzione: 3 delle 4 funzioni esistono su remoto e vengono hardenate; `get_municipalities_in_radius` è **confermata assente** su remoto → saltata con `RAISE NOTICE`, mai creato un placeholder |
| `20260805000010_gtfs_routes_stop_times.sql` | `20260806150005_gtfs_routes_stop_times_v2.sql` | **Collisione di versione confermata**: `20260805000010` è già registrata sul ledger remoto sotto una migrazione completamente diversa e non correlata (`reconcile_remote_operator_assignments`, 21 statement). Contenuto copiato invariato, solo rinumerato |
| `20260805000013_address_points_radius_summary.sql` | `20260806150007_territory_address_points_radius_summary.sql` | Nessuna collisione diretta nota, ma rinumerata nel nuovo namespace per coerenza della catena; contenuto copiato invariato (già idempotente). `address_points` (337.049 righe reali) non viene toccata, solo aggiunti indice e funzione |
| `036_ai_territorial_chat_cache.sql` + `037_campaign_ai_report.sql` | `20260806150008_ai_schema_chat_cache_and_report.sql` | Unite in un unico file; contenuto invariato (già idempotente). `ai_summary` già esiste su remoto (no-op garantito), `ai_suggestions` e `ai_territorial_chat_cache` confermati assenti |
| `20260805000012_milano_nil_pgt2030.sql` | **ESCLUSA** | Vedi Fase 3 — Strategia A: il remoto ha già una soluzione NIL reale e indipendente (`geo_nil_milano`, 88 righe, RPC ricca con campi demografici). Creare `geo_municipality_nil` produrrebbe un secondo sistema NIL parallelo e duplicato, non richiesto e rischioso |
| `20260805000014_real_nil_geometry_tolerance.sql` | **ESCLUSA** | Stessa motivazione — dipende interamente da `geo_municipality_nil`, che non viene creata |
| `001_add_pagamento.sql` / `002_add_territorial_tables.sql` / `003_add_spatial_rpc.sql` | **NON MAPPATE — bloccante, vedi Fase 2 sotto** | Sospetta collisione di nome/versione con voci `001`/`002`/`003` ("init"/"policies"/"storage") già presenti sul ledger remoto: non ancora confermato con certezza se rappresentano lo stesso contenuto logico o contenuti diversi sotto lo stesso identificativo breve. Non incluse nella catena finché questo punto non è chiarito (vedi verdetto) |

Tutte le altre migrazioni locali (35+ file non elencati sopra) risultano già applicate e compatibili con lo stato remoto verificato, oppure fuori dallo scope tecnico di questo ticket (nessuna modifica richiesta sul lato loro).

---

## Fase 3 — Strategia NIL production-safe

**Decisione: Strategia A — mantenere `geo_nil_milano` come unica fonte di verità.**

Fatti verificati (query dirette, sola lettura, 2026-08-06):
- `geo_nil_milano` esiste già su remoto: 88 righe reali, colonne `id`, `nil_code`, `nil_name`, `geom`, `source`, `source_url`, `valid_from`, `valid_to`, `created_at`, `updated_at`.
- Il remoto espone già una RPC di breakdown NIL che unisce `geo_nil_milano` a `geo_municipalities` per i campi demografici (join separato, non colonne dirette sulla tabella NIL).
- Nessuna migrazione locale nel repository ha mai creato `geo_nil_milano` — è uno sviluppo di produzione indipendente, non tracciato localmente.
- Le migrazioni locali `20260805000012`/`20260805000014` creano invece `geo_municipality_nil`, una tabella diversa con schema diverso (include colonne demografiche/di validazione dirette sulla tabella stessa, trigger di validazione contro `geo_municipalities`, propria `upsert_milano_nil_batch`, propria `get_nil_breakdown_in_radius`).

Perché non Strategia B (migrare i dati da `geo_nil_milano` a `geo_municipality_nil`) né Strategia C (sostituire `geo_nil_milano` con lo schema locale) — quest'ultima esplicitamente vietata dal ticket ("Non scegliere automaticamente C"):
- Applicare `20260805000012` creerebbe `geo_municipality_nil` vuota accanto a `geo_nil_milano` popolata: due sistemi NIL paralleli con nomi di funzione quasi identici (`get_nil_breakdown_in_radius`), alto rischio di ambiguità per il codice applicativo che già chiama la versione basata su `geo_nil_milano`.
- Migrare le 88 righe reali richiederebbe mappare lo schema sorgente (senza campi di validazione geometrica) su un trigger di validazione con soglie hard-coded (`minimum_inside_ratio = 0.82398`) tarate su un dataset di validazione (DS964) mai verificato contro i dati reali di `geo_nil_milano` — rischio concreto di rigetto o corruzione silenziosa di geometrie reali di produzione.
- Nessun vantaggio funzionale netto: il remoto ha già una soluzione NIL funzionante e usata.

**Azione presa**: nessuna migrazione NIL inclusa nella catena production-safe. `20260805000012` e `20260805000014` sono escluse dalla Fase 1. Non è stata creata una vista di compatibilità aggiuntiva perché nessun consumatore locale noto dipende dal nome `geo_municipality_nil` in produzione (verificato: quel nome non è mai referenziato fuori dai due file di migrazione locali stessi) — aggiungerla oggi sarebbe una funzionalità non richiesta, in violazione del vincolo "purely local preparation" e del principio di non introdurre astrazioni speculative.

---

## Fase 6 — Hardening SECURITY DEFINER condizionale

Vedi `20260806150006_security_definer_conditional_hardening.sql`. Esito per funzione (verificato 2026-08-06):

| Funzione | Stato su remoto | Azione |
|---|---|---|
| `get_map_sectors(text, float8, float8, float8)` | Esiste, `search_path` non fissato | Hardened (`search_path = public, pg_temp`, grant minimi) |
| `upsert_gtfs_stops_batch(jsonb)` | Esiste, `search_path` non fissato | Hardened, grant ristretto a `service_role` |
| `upsert_omi_zones_batch(jsonb)` | Esiste, `search_path` non fissato | Hardened, grant ristretto a `service_role` |
| `get_municipalities_in_radius(...)` | **Assente** (0 righe per qualunque firma testata) | Saltata con `RAISE NOTICE`, nessun placeholder creato. Registrata come "funzione assente" — merita un'indagine separata (fuori scope di questo ticket) sul sospetto legato alla collisione `001`/`002`/`003` sopra |

---

## Fase 7 — Territory/civici delta

Vedi `20260806150007_territory_address_points_radius_summary.sql`. `address_points` (337.049 righe reali) non toccata; aggiunti solo indice parziale GIST e funzione `get_address_points_radius_summary` (entrambi confermati assenti su remoto).

## Fase 8 — AI schema delta

Vedi `20260806150008_ai_schema_chat_cache_and_report.sql`. `ai_territorial_chat_cache` (confermata assente) creata; `campaigns.ai_summary` (già presente, no-op) e `campaigns.ai_suggestions` (confermata assente) aggiunte via `ADD COLUMN IF NOT EXISTS`.

---

## Fase 9 — Dry-run su clone locale del remoto reale

Eseguito il 2026-08-06, interamente locale, nessuna scrittura sul database remoto.

Procedura:
1. Container Postgres usa-e-getta (`docker run public.ecr.aws/supabase/postgres:17.6.1.084`, la stessa immagine del container `supabase_db` locale) — isolato dallo stack di sviluppo locale esistente per non intaccare i dati di test già accumulati nelle ticket precedenti.
2. Schema `public` azzerato e ricreato; estensioni `postgis`, `pgcrypto`, `uuid-ossp` reinstallate; stub minimi per `auth.jwt()` (già presenti `auth.uid()`/`auth.role()`/`auth.email()` nell'immagine ufficiale).
3. Caricato `remote_baseline_schema.sql` (il dump reale a sola lettura di 6.730 righe già catturato in DEPLOY-PLAN-2 via `supabase db dump --linked --schema public`) → **caricamento completo, 0 errori**.
4. Applicate in ordine tutte le migrazioni di `supabase/migrations_production_safe/` (`150001` → `150003`, `150005` → `150008`; la `150004` è lo script di verifica, non uno schema change) → **0 errori**.
5. Eseguito `20260806150004_gps_post_migration_verify.sql` → tutti gli oggetti attesi presenti, `effective_percent` correttamente `is_generated = NEVER`, **zero trigger duplicati**, firma di `admin_set_zone_manual_progress` corretta a 6 argomenti, RLS+FORCE RLS attive sulle 3 tabelle chiave.
6. **Test di idempotenza**: l'intera catena (150001→150003, 150005→150008) riapplicata una seconda volta sullo stesso clone → **0 errori alla seconda passata**, e la verifica post-migrazione ripetuta produce risultati identici (nessun drift, nessun duplicato).
7. Confermato strutturalmente: `geo_nil_milano` e `get_nil_breakdown_in_radius` restano intatti (nessuna migrazione della nuova catena li tocca); `to_regclass('public.geo_municipality_nil')` restituisce `NULL` — confermato che la Strategia A (Fase 3) non ha creato la tabella NIL parallela.
8. Container usa-e-getta rimosso al termine (`docker rm -f`) — nessuno stato residuo.

**Esito Fase 9: PASSATO.**

---

## Fase 10 — Tabella di revisione SQL per-migrazione

| Versione | Scopo | Oggetti modificati | Lock atteso | Rischio | Rollback | Query di verifica | Dipendenze |
|---|---|---|---|---|---|---|---|
| `20260806150001` | Aggiunge colonne/vincoli a `campaign_zone_progress`(_history), crea `campaign_coverage_adjustments`(_log) | 2 tabelle nuove, 2 tabelle alterate (solo `ADD COLUMN IF NOT EXISTS`) | `ACCESS EXCLUSIVE` breve su `campaign_zone_progress` per `ALTER TABLE`; nessun lock su tabelle vuote nuove | Basso — additivo, nessuna colonna esistente modificata/rimossa; baseline confermata 0 righe su `campaign_zone_progress` | `DROP TABLE IF EXISTS campaign_coverage_adjustments_log, campaign_coverage_adjustments; ALTER TABLE campaign_zone_progress DROP COLUMN IF EXISTS adjustment_type, ...` (sicuro perché nessun dato reale nelle nuove colonne) | Query 1 e 2 di `150004` | Nessuna |
| `20260806150002` | Funzioni di calcolo copertura, RPC di correzione manuale, sostituzione `admin_set_zone_manual_progress`/`admin_clear_zone_manual_progress` | ~10 funzioni (create/replace), 1 trigger, conversione `effective_percent` da colonna generata a normale | Nessun lock prolungato — funzioni non bloccano; conversione colonna generata è `ACCESS EXCLUSIVE` breve, guardata da controllo idempotente | **Medio** — il `DROP FUNCTION` delle vecchie firme di `admin_set_zone_manual_progress`/`admin_clear_zone_manual_progress` è irreversibile senza il codice originale; mitigato perché il codice sorgente delle vecchie firme è conservato in questo stesso file (righe di history) e in `supabase/migrations/` locale | Ricreare le funzioni con le vecchie firme dal file storico corrispondente; per `effective_percent`, ripristinare `GENERATED ALWAYS AS (...)` è possibile solo se nessuna riga ha divergenza manuale (verificabile) | Query 2, 3, 4 di `150004` | `150001` |
| `20260806150003` | Ri-afferma RLS/FORCE RLS e grant sulle tabelle nuove; guardia dinamica contro grant PUBLIC accidentali | Nessun oggetto nuovo, solo `ALTER TABLE ... ENABLE/FORCE RLS`, `REVOKE`/`GRANT` | Nessuno (metadati) | Trascurabile — puramente idempotente e difensivo | `REVOKE`/`GRANT` inversi se necessario (non previsto) | Query 5 di `150004` | `150001`, `150002` |
| `20260806150004` | Script di sola verifica (non uno schema change) | Nessuno — solo `SELECT` | Nessuno | Nullo | N/A | È essa stessa la verifica | `150001`-`150003`, `150005`-`150008` |
| `20260806150005` | Crea `gtfs_routes`/`gtfs_stop_times` + RPC batch, rinumerata per evitare la collisione confermata su `20260805000010` | 2 tabelle nuove, 2 funzioni, RLS+grant | Nessuno su tabelle preesistenti; `gtfs_stops` non toccata | Basso — puramente additivo, non tocca `gtfs_stops` esistente | `DROP TABLE IF EXISTS gtfs_stop_times, gtfs_routes; DROP FUNCTION IF EXISTS upsert_gtfs_routes_batch, upsert_gtfs_stop_times_batch;` | Verifica manuale `to_regclass` | Nessuna |
| `20260806150006` | Hardening `search_path` condizionale su 3 funzioni SECURITY DEFINER esistenti; salta `get_municipalities_in_radius` (assente) | 3 funzioni alterate (`ALTER FUNCTION ... SET search_path`), grant ristretti | Nessuno | Basso — `ALTER FUNCTION` non blocca, non cambia il comportamento della funzione salvo la risoluzione di `search_path` | `ALTER FUNCTION ... RESET search_path;` + ripristino grant originali se necessario | `select proconfig from pg_proc where proname in (...)` | Nessuna (verifica esistenza runtime via `pg_proc`) |
| `20260806150007` | Indice parziale GIST + RPC `get_address_points_radius_summary` | 1 indice, 1 funzione | `SHARE` lock per `CREATE INDEX` (non `CONCURRENTLY` — tabella già esistente con 337k righe: **valutare `CREATE INDEX CONCURRENTLY` in fase di esecuzione reale se il downtime è una preoccupazione**, annotato come nota operativa per il runbook) | Basso-medio — l'indice su 337k righe può richiedere qualche secondo di lock; nessuna riga esistente modificata | `DROP INDEX IF EXISTS address_points_osm_geography_idx; DROP FUNCTION IF EXISTS get_address_points_radius_summary;` | `to_regclass`, `pg_proc` | Nessuna |
| `20260806150008` | Crea `ai_territorial_chat_cache`; aggiunge `campaigns.ai_suggestions` (`ai_summary` già presente, no-op) | 1 tabella nuova, 1 colonna aggiunta | `ACCESS EXCLUSIVE` breve su `campaigns` per `ADD COLUMN` (tabella con righe reali — verificare dimensione in fase di esecuzione, atteso comunque rapido per `ADD COLUMN ... DEFAULT` costante non volatile) | Basso | `DROP TABLE IF EXISTS ai_territorial_chat_cache; ALTER TABLE campaigns DROP COLUMN IF EXISTS ai_suggestions;` | `to_regclass`, `information_schema.columns` | Nessuna |

Nessuna migrazione della catena esegue `DELETE`/`TRUNCATE`/`DROP TABLE` su dati esistenti. L'unica operazione potenzialmente distruttiva in senso stretto è il `DROP FUNCTION` delle vecchie firme in `150002` (funzioni, non dati) — rollback disponibile come da tabella sopra.

---

## Fase 11 — Verdetto finale

**Riepilogo condizioni di blocco esplicite del ticket:**

| Condizione di blocco | Stato |
|---|---|
| Esistono ancora collisioni di versione | **SÌ — confermata** (vedi sotto) |
| La strategia NIL non preserva la produzione | NO — Strategia A preserva `geo_nil_milano` intatta, nessuna migrazione la tocca |
| Una migrazione dipende da una versione locale in collisione | NO — nessuna migrazione della nuova catena (`150001`-`150008`) dipende dal contenuto delle versioni `001`/`002`/`003` o `20260805000010` originali |
| Il dry-run sul clone simulato non passa | NO — Fase 9 passata, incluso il test di idempotenza a doppia applicazione |
| Una migrazione distruttiva manca di rollback | NO — vedi tabella Fase 10, ogni oggetto nuovo/modificato ha un rollback definito |

**Collisione di versione confermata (bloccante secondo la regola esplicita del ticket):**
Verificato oggi (2026-08-06) via `supabase db query --linked` diretto su `supabase_migrations.schema_migrations`: le versioni `001`, `002`, `003` sono registrate sul ledger remoto con nome `init`, `policies`, `storage` rispettivamente — mentre i file locali con lo stesso identificativo di versione sono `001_add_pagamento.sql`, `002_add_territorial_tables.sql`, `003_add_spatial_rpc.sql`. I nomi non corrispondono in alcun modo (pagamenti/tabelle territoriali/RPC spaziali vs. init/policies/storage), che è lo stesso pattern già confermato per `20260805000010`. Questo indica che il contenuto realmente applicato su remoto sotto le versioni `001`-`003` è **quasi certamente diverso** dal contenuto dei file locali con lo stesso nome — una collisione di versione reale, non solo sospetta.

Questa collisione **non blocca la sicurezza tecnica della nuova catena** (`150001`-`150008`): nessuna migrazione della nuova catena include, riapplica o dipende dal contenuto di `001`/`002`/`003`. Il dry-run Fase 9 lo dimostra concretamente (la catena si applica pulita, due volte, su un clone dello schema reale). Tuttavia, la regola esplicita del ticket ("non deve essere READY se... esistono ancora collisioni di versione") è formulata in modo assoluto, non limitato alle sole migrazioni di questa catena — e questa collisione specifica resta irrisolta e fuori dallo scope tecnico di DEPLOY-PLAN-3 (che riguarda la creazione di una nuova catena, non la riconciliazione retroattiva della storia `001`-`037`).

### VERDETTO: **PARTIAL**

La catena di migrazioni production-safe (`supabase/migrations_production_safe/20260806150001` → `20260806150008`) è tecnicamente pronta, verificata via dry-run reale a doppia applicazione, non distruttiva, e non dipende da alcun contenuto in collisione. Può essere applicata in sicurezza sul database remoto reale **quando** la collisione di versione `001`/`002`/`003` sarà stata formalmente indagata e chiusa (raccomandazione: query diretta `pg_get_functiondef`/confronto colonna-per-colonna tra il contenuto applicato su remoto sotto `001`-`003` e il contenuto dei file locali corrispondenti, per determinare con certezza se si tratta di collisione di nome innocua o di reale divergenza di schema — task consigliato come ticket separato, es. `DEPLOY-PLAN-4 — Riconciliazione 001-003`).

Nessuna azione di deploy, `db push`, `migration repair` o modifica del database remoto è stata eseguita in questo ticket, come richiesto.
