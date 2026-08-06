# REMOTE PRODUCTION MIGRATION MATRIX — VolantiniPro

Verifica diretta del database PostgreSQL remoto (progetto Supabase `mqkelrsvksrzrpmbstvd`, "volantinipro"), **esclusivamente in sola lettura**. Nessun comando DDL/DML eseguito, nessun `db push`, nessun `migration repair`, nessun deploy, nessun push Git. Tutte le query sono state eseguite tramite `supabase db query --linked` (canale ufficiale della CLI verso il progetto collegato, autenticato con il token di login già presente in questo ambiente — **mai stampato**), mai con la chiave `service_role`.

> **Aggiornamento — DEPLOY-PLAN-3 (2026-08-06).** La collisione di versione `001`/`002`/`003` segnalata in Fase 2 come "possibile" è ora **confermata**: query diretta su `supabase_migrations.schema_migrations` conferma che il ledger remoto registra quelle versioni con nome `init`/`policies`/`storage`, non corrispondenti ai file locali `001_add_pagamento.sql`/`002_add_territorial_tables.sql`/`003_add_spatial_rpc.sql`. Questa è la ragione principale del verdetto **PARTIAL** in [PRODUCTION_SAFE_MIGRATION_CHAIN.md](PRODUCTION_SAFE_MIGRATION_CHAIN.md) — che descrive la nuova catena di migrazioni production-safe (namespace `20260806150001`-`20260806150008`) costruita trattando lo schema reale remoto come baseline, senza dipendere in alcun modo dal contenuto di `001`-`003` o da altre versioni in collisione.

> **Aggiornamento — DEPLOY-PLAN-4 (2026-08-06).** Il contenuto SQL testuale completo di `001`/`002`/`003` è stato estratto (colonna `statements` di `supabase_migrations.schema_migrations`) e documentato per intero in [PRODUCTION_MIGRATION_LEDGER_ISOLATION.md](PRODUCTION_MIGRATION_LEDGER_ISOLATION.md) Fase 4 — confermando in modo definitivo, oggetto per oggetto, che il contenuto reale (`profiles`/`campaigns`/RLS policy/bucket storage) non ha nulla in comune con i file locali omonimi. Un runner dedicato ora isola strutturalmente la nuova catena di produzione da questa collisione (verdetto **PRODUCTION MIGRATION LEDGER ISOLATION READY**).

## Fase 1 — Connessione sicura

| Campo | Valore |
|---|---|
| Host | `db.mqkelrsvksrzrpmbstvd.***.supabase.co` (mascherato) |
| Porta | `5432` |
| Database | `postgres` |
| Utente | `po***res` (mascherato — ruolo `postgres`) |
| Connessione riuscita | **Sì** |
| `server_version` | `PostgreSQL 17.6 on aarch64-unknown-linux-gnu` (coerente con `postgres-version` cache di `supabase link`: `17.6.1.084`) |

Nessuna password è stata letta, stampata o salvata in questo documento o nel repository. La connessione è avvenuta tramite il canale gestito della CLI Supabase (`--linked`), non tramite una stringa di connessione con password incorporata.

## Fase 2 — Migration history reale

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

**Risultato completo (11 righe — questa è l'intera ledger remota, non un estratto)**:

| version | name |
|---|---|
| 001 | init |
| 002 | policies |
| 003 | storage |
| 004 | geo |
| 005 | geo_policies |
| 006 | economic_and_poi_activation |
| 007 | geometry_in_breakdown |
| 008 | postal_areas_milano |
| 034 | *(null)* |
| 035 | *(null)* |
| 20260805000010 | **reconcile_remote_operator_assignments** (21 statement) |

**Confronto con le 60 migrazioni locali** (`supabase migration list`, eseguito con lo stesso canale):

| Versione | File locale | Registrata remoto | Schema presente | Azione proposta |
|---|---|---|---|---|
| 001 | `001_add_pagamento.sql` | Sì (`init`) | Da riverificare — il nome remoto (`init`) non corrisponde al nome del file locale (`add_pagamento`): **possibile collisione di versione anche qui**, stesso pattern di `20260805000010` | Indagine ulteriore |
| 002 | `002_add_territorial_tables.sql` | Sì (`policies`) | Come sopra — nome non corrispondente | Indagine ulteriore |
| 003 | `003_add_spatial_rpc.sql` | Sì (`storage`) | Come sopra — nome non corrispondente; **confermato**: la funzione `get_municipalities_in_radius` che questo file definisce **non esiste sul remoto** | Indagine ulteriore (probabile collisione: la "003" remota è un'altra migrazione, non questa) |
| 004–008 | vari | Sì | Non verificato singolarmente (stesso pattern sospetto) | Indagine ulteriore |
| 009–033 (esclusi 034/035) | vari | **No** | **Parzialmente presente** — molti oggetti che queste migrazioni dovrebbero creare esistono già (es. `gps_tracking_points`, `delivery_sessions`, `campaign_zones`, `profiles`, `poi_cache`, `omi_zones`, `address_points`, `gtfs_stops` tutti presenti con RLS attiva) | **Solo riconciliazione history** per gli oggetti confermati presenti — non riapplicare il DDL, registrare soltanto la versione nella ledger dopo verifica riga per riga del contenuto reale applicato |
| 034, 035 | `034_revert_stale_session_autoclose.sql`, `035_fix_coverage_geometry.sql` | Sì (nome null) | Non verificato nel dettaglio in questo ciclo | Nessuna (già registrata) |
| **20260805000010** | `20260805000010_gtfs_routes_stop_times.sql` | **Sì, ma con contenuto diverso** (`reconcile_remote_operator_assignments`, 21 statement — non il file GTFS locale) | `gtfs_routes`/`gtfs_stop_times` **assenti**, `gtfs_stops` presente ma vuota | **Migrazione sostituita / collisione di versione** — il file locale non può essere applicato sotto questo numero di versione: la ledger ha già un'altra migrazione registrata con questo identificatore esatto. Serve rinumerare il file locale (nuovo timestamp) prima di qualunque applicazione, non un semplice push |
| 20260805000011 | `20260805000011_poi_cache_radius.sql` | No | `poi_cache` presente (probabilmente da altra origine), RPC `get_cached_pois_in_radius` non verificata in questo ciclo (richiede `service_role`, non testata per non usare quella chiave) | Indagine ulteriore, poi applicazione SQL reale se la RPC risulta assente |
| **20260805000012** | `20260805000012_milano_nil_pgt2030.sql` | No | **`geo_municipality_nil` assente**. **Trovato invece**: `public.geo_nil_milano`, tabella indipendente con **88 righe reali** (coerente con le 88 NIL di Milano), consumata da una versione **diversa e più ricca** di `get_nil_breakdown_in_radius` (19 colonne, incluse variabili demografiche — età, reddito, attività — assenti da qualunque versione locale) | **Non applicare così com'è — rischio di regressione**: applicare questo file creerebbe una tabella `geo_municipality_nil` vuota e parallela, e **sovrascriverebbe** `get_nil_breakdown_in_radius` con una versione a 13 colonne che punta alla tabella vuota, rompendo la funzionalità NIL reale già in produzione. Decisione di prodotto necessaria: adattare la migrazione a `geo_nil_milano`, oppure escluderla definitivamente |
| 20260805000013 | `20260805000013_address_points_radius_summary.sql` | No | RPC `get_address_points_radius_summary` **assente** confermato; `address_points` presente con 337.049 righe reali | Applicazione SQL reale (basso rischio: solo indice + funzione, nessuna tabella nuova, non tocca la tabella con dati) |
| **20260805000014** | `20260805000014_real_nil_geometry_tolerance.sql` | No | Dipende da `012` — **non applicabile finché `012` non è risolta** (vedi sopra) | Subordinata alla decisione su `012` |
| **202607230001** | `202607230001_campaign_zone_progress.sql` | **No** | **Schema completamente presente**: tabella `campaign_zone_progress` (0 righe), `campaign_zone_progress_history`, 2 trigger, 2 policy, 4 indici — tutto verificato via catalogo diretto, corrisponde esattamente al contenuto di questo file | **Solo riconciliazione history** — schema già applicato correttamente (verosimilmente via SQL Editor Dashboard o script diretto), va solo registrata la versione nella ledger, **non va rieseguito il DDL** |
| **20260724101527** | `20260724101527_campaign_zone_progress_predeploy_fixes.sql` | **No** | **Schema presente**: colonne snapshot (`campaign_id_snapshot`, `campaign_zone_id_snapshot`, `zone_name_snapshot`) confermate su `campaign_zone_progress_history` | **Solo riconciliazione history**, stesso motivo di `202607230001` |
| 20260731*, 20260801*, 20260803*, 20260805000001-009 | vari | No | Non verificati singolarmente in questo ciclo (fuori dal set esplicitamente richiesto) | Indagine ulteriore prima del deploy — stesso trattamento sospettato di `202607230001` |
| **20260806000001** | `20260806000001_campaign_coverage_adjustments.sql` | No | **Assente, confermato**: `campaign_coverage_adjustments` e `campaign_coverage_adjustments_log` non esistono | Applicazione SQL reale (tabelle nuove, nessun dato da perdere — `campaign_zone_progress` ha 0 righe, quindi nessun rischio di conflitto con dati esistenti) |
| **20260806000002** | `20260806000002_gps_manual_coverage_v2.sql` | No | **Assente, confermato**: `campaign_zone_progress` non ha le colonne `adjustment_type`/`inaccessible_percent`/`notes`/`source`; `effective_percent` risulta ancora `GENERATED ALWAYS` con la formula originale | Applicazione SQL reale — **rischio basso in questo caso specifico** perché `campaign_zone_progress` ha 0 righe reali sul remoto (verificato via `COUNT(*)`), quindi la UPDATE di riconciliazione (potenzialmente pericolosa su dati reali) non toccherebbe nessuna riga |
| **20260806000003** | `20260806000003_gps_coverage_canonical_consolidation.sql` | No | **Assente, confermato** | Applicazione SQL reale, subordinata a `20260806000001` e `20260806000002` (dipendenza strutturale già documentata) |
| 20260806000004 | `20260806000004_harden_security_definer_search_path.sql` | No | **3 delle 4 funzioni esistono senza search_path fisso** (`get_map_sectors`, `upsert_gtfs_stops_batch`, `upsert_omi_zones_batch` — confermato `search_path` nullo); **la quarta, `get_municipalities_in_radius`, non esiste affatto sul remoto** | **Il file così com'è fallirebbe se applicato al remoto** (`ALTER FUNCTION` su una funzione inesistente) — va reso condizionale (`DO $$ IF EXISTS ... $$`) o applicato senza lo statement relativo a `get_municipalities_in_radius`, verificando prima perché quella funzione manca (probabile altra collisione nella serie "003") |

**Versioni esplicitamente richieste, non presenti né in locale né nella ledger remota**: `000`, `20260522174101` — nessun file corrispondente in `supabase/migrations/`, nessuna riga nella ledger. Nessuna azione necessaria; da confermare con l'owner se attese da un altro ambiente/branch non presente in questo repository.

## Fase 3 — Schema remoto reale (catalogo diretto, mai PostgREST)

| Oggetto | Esiste | Righe | Colonne critiche osservate | RLS | Policy | Trigger | Note |
|---|---|---|---|---|---|---|---|
| `geo_municipality_nil` | **No** | — | — | — | — | — | Nome usato dai file locali `012`/`014`; non presente sul remoto |
| `geo_nil_milano` | **Sì** | **88** | (non enumerate in dettaglio in questo ciclo — solo esistenza/conteggio, per restare strettamente in ambito) | Attiva | Non enumerate in dettaglio | Non enumerati in dettaglio | Tabella NIL reale di produzione, indipendente dai file migrazione di questa serie |
| `address_points` | Sì | 337.049 | — | Attiva | — | — | Volume reale significativo |
| `omi_zones` | Sì | 21.650 | — | Attiva | — | — | — |
| `gtfs_stops` | Sì | 0 | — | Attiva | — | — | Tabella presente ma vuota |
| `gtfs_routes` | **No** | — | — | — | — | — | Da `20260805000010`, non applicata (collisione versione) |
| `gtfs_stop_times` | **No** | — | — | — | — | — | Come sopra |
| `poi_cache` | Sì | 59 | — | Attiva | — | — | — |
| `campaigns` | Sì | 2 | — | Attiva | — | — | Dati reali di produzione, minimi |
| `driver_gps_tracking_points` | **No** | — | — | — | — | — | Nome non esistente in nessun ambiente; il nome reale è `gps_tracking_points` |
| `gps_tracking_points` (nome reale) | Sì | 421 | — | **Attiva, forzata** (`FORCE ROW LEVEL SECURITY`) | — | — | Traccia GPS reale presente, mai letta riga per riga in questo ciclo |
| `delivery_sessions` | Sì | 39 | — | Attiva, forzata | — | — | — |
| `campaign_zone_progress` | Sì | 0 | Schema originale (`202607230001`), **manca** `adjustment_type`/`inaccessible_percent`/`notes`/`source`; `effective_percent` ancora `GENERATED ALWAYS` | Attiva, forzata | 2 (`campaign_zone_progress_select_admin`, `campaign_zone_progress_select_customer`) | 2 (`set_campaign_zone_progress_campaign_id`, `set_campaign_zone_progress_updated_at`) | 4 indici (pkey, uidx zona, campaign_id, updated_at) |
| `campaign_coverage_adjustments` | **No** | — | — | — | — | — | Da `20260806000001`, non applicata |
| `campaign_coverage_adjustments_history` | **No** | — | — | — | — | — | Nome richiesto dal ticket; il nome usato nei file locali è `campaign_coverage_adjustments_log`, **anch'esso assente** |
| `ai_territorial_chat_cache` | **No** | — | — | — | — | — | Da migrazione `036`, non applicata |
| `ai_territory_summaries` | Sì | 0 | — | Attiva | — | — | — |

**Funzioni dipendenti verificate**: `get_nil_breakdown_in_radius` (esiste, ma interroga `geo_nil_milano` con uno shape a 19 colonne — versione indipendente dai file locali `012`/`014`); `get_map_sectors` (esiste, `search_path` non fisso); `get_municipalities_in_radius` (**non esiste**); `upsert_gtfs_stops_batch`/`upsert_omi_zones_batch` (esistono, `search_path` non fisso).

**Nessun dato personale è stato letto**: tutte le query hanno usato `COUNT(*)`, `information_schema`/`pg_catalog`, o `pg_get_functiondef` (definizioni di funzione, non dati applicativi). Nessuna riga di `campaigns`/`profiles`/`gps_tracking_points` è stata restituita o riportata in questo documento.

**Stato generale del server**: dimensione database **351 MB**; **0 query attive**, **0 lock non concessi** al momento della verifica (finestra libera da contese); estensioni installate: `postgis 3.3.7`, `postgis_topology 3.3.7`, `pgcrypto 1.3`, `pg_stat_statements 1.11`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`, `plpgsql 1.0` — tutte quelle richieste dalle migrazioni locali sono già presenti.

## Fase 4 — Drift, classificato

1. **Migrazioni registrate con schema assente**: nessuna trovata con certezza in questo ciclo per le versioni ispezionate a fondo (001–008 hanno nomi remoti diversi dai file locali, ma non è stato verificato se lo *schema* corrispondente sia assente — solo che il *nome* differisce; richiede indagine ulteriore, non classificabile con certezza qui).
2. **Schema presente con migrazione non registrata**: **confermato per `202607230001` e `20260724101527`** (schema completo verificato via catalogo), e sospettato (non confermato riga per riga) per gran parte delle versioni brevi 009–033.
3. **File locali non applicati**: `20260805000011`–`014`, `20260806000001`–`004` (schema assente, confermato).
4. **Versioni remote senza file locale**: nessuna — le 11 righe della ledger remota corrispondono tutte a versioni che hanno (o dovrebbero avere, salvo collisione) un file locale omonimo.
5. **Oggetti divergenti**: **`get_nil_breakdown_in_radius`** (implementazione remota indipendente, più ricca, su tabella diversa) è il caso più critico; **versione `20260805000010`** (contenuto SQL completamente diverso sotto lo stesso identificatore) è il secondo; **sospetto non confermato** su `001`/`002`/`003` (nomi non corrispondenti ai file locali).
6. **Migrazioni che non devono essere rieseguite**: `202607230001`, `20260724101527` (rischierebbero di fallire su oggetti già esistenti, o nel caso delle CHECK/trigger di generare errori "already exists" — da riconciliare solo nella ledger, mai ri-applicate come DDL).

## Fase 5 — Piano esatto, versione per versione (non eseguito)

**A. History da riconciliare (nessun DDL, solo `INSERT INTO supabase_migrations.schema_migrations`, da eseguire manualmente da un operatore dopo verifica riga-per-riga del contenuto reale applicato)**:
`202607230001`, `20260724101527`, e — solo dopo indagine ulteriore per confermare che lo schema coincida davvero con il file locale — l'intera serie `009`–`033` (esclusi `034`/`035` già registrati) più `20260731*`, `20260801*`, `20260803*`, `20260805000001`–`009`.

**B. Migrazioni SQL da applicare (schema realmente assente, nessun conflitto di versione)**:
`20260805000011`, `20260805000013`, `20260806000001`, `20260806000002` (rischio dati basso: tabella target vuota), `20260806000003` (dopo `001`/`002`).

**C. Migrazioni già materialmente presenti (non riapplicare)**:
`202607230001`, `20260724101527` (vedi A) — schema identico al file locale.

**D. Migrazioni da escludere / bloccate finché non riconciliate manualmente**:
- `20260805000010` — collisione di versione con `reconcile_remote_operator_assignments`; richiede **rinumerazione del file locale**, non un'applicazione diretta.
- `20260805000012`, `20260805000014` — richiedono una **decisione di prodotto** su `geo_nil_milano` vs `geo_municipality_nil` prima di qualunque applicazione; applicare oggi creerebbe una regressione funzionale.
- `20260806000004` — richiede la rimozione/condizionamento dello statement su `get_municipalities_in_radius` (funzione inesistente sul remoto) prima di poter essere applicata senza errore.
- `001`, `002`, `003` (e potenzialmente l'intera serie breve) — nomi remoti non corrispondenti ai file locali: **indagine ulteriore obbligatoria** prima di assumere che qualunque azione (anche la sola riconciliazione history) sia sicura.

**E. Verifiche post-applicazione (per ciascuna migrazione di categoria B, dopo un'eventuale applicazione futura)**:
`to_regclass()` per ogni nuova tabella; conteggio colonne per le funzioni con `RETURNS TABLE`; `proconfig` per le funzioni indurite; test funzionale end-to-end (stesso schema di verifica già eseguito in locale in `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md` §7, da ripetere su dati di test dedicati e reversibili sul remoto, mai su `campaigns`/`profiles` reali).

**Nessun `db push --include-all` è proposto**, per le ragioni sopra: la ledger remota ha collisioni di versione confermate (`20260805000010`) e nomi non corrispondenti per la serie breve (`001`–`003` almeno), condizioni per cui il ticket vieta esplicitamente questa scorciatoia.

## Verdetto di questa verifica

La migration history remota **è stata letta direttamente** (Fase 2, query reale contro `supabase_migrations.schema_migrations`, 11 righe complete). Tuttavia **non tutte le migrazioni hanno un'azione certa**: la serie breve `001`–`003` (almeno) mostra nomi remoti non corrispondenti ai file locali, non ancora investigata a fondo; `20260805000010` è in collisione di versione confermata; `20260805000012`/`014` richiedono una decisione di prodotto non eseguibile in un ciclo di sola lettura; `20260806000004` applicherebbe uno statement su una funzione inesistente. Il verdetto complessivo di questo ciclo è riportato in fondo a `VOLANTINIPRO_DEPLOY_RUNBOOK.md`.
