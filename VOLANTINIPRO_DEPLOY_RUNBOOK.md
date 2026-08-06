# VolantiniPro — Deploy Runbook

Base: [VOLANTINIPRO_RELEASE_MANIFEST.md](VOLANTINIPRO_RELEASE_MANIFEST.md), [FINAL_PRE_DEPLOY_AUDIT_REPORT.md](FINAL_PRE_DEPLOY_AUDIT_REPORT.md), [FINAL_PRE_DEPLOY_FIXES_REPORT.md](FINAL_PRE_DEPLOY_FIXES_REPORT.md), [REMOTE_PRODUCTION_MIGRATION_MATRIX.md](REMOTE_PRODUCTION_MIGRATION_MATRIX.md). Nessuna azione remota di scrittura è stata eseguita per produrre questo documento — solo query in sola lettura (documentate nel Manifest Fase 3 e nella Matrix, quest'ultima con accesso diretto e verificato al Postgres remoto). Nessun comando di scrittura qui sotto è stato lanciato.

> **Aggiornamento — DEPLOY-PLAN-2.** La riga "Migration history" della tabella di Fase 5 sotto e l'intera Fase 6 sono state riscritte con dati reali (non più "non disponibile in questo ambiente" — l'accesso diretto è stato ottenuto e usato, in sola lettura, tramite `supabase db query --linked`). Il verdetto finale di questo documento (fondo pagina) riflette i risultati di [REMOTE_PRODUCTION_MIGRATION_MATRIX.md](REMOTE_PRODUCTION_MIGRATION_MATRIX.md).

> **Aggiornamento — DEPLOY-PLAN-3 (2026-08-06).** La strategia di migrazione (Fase 6 sotto) è superata dalla nuova catena production-safe in [PRODUCTION_SAFE_MIGRATION_CHAIN.md](PRODUCTION_SAFE_MIGRATION_CHAIN.md): 8 nuovi file in `supabase/migrations_production_safe/` (namespace `20260806150001`-`20260806150008`), verificati con un dry-run reale a doppia applicazione su clone locale dello schema remoto (idempotenti, senza errori, senza duplicati). Verdetto di quella catena: **PARTIAL** — pronta tecnicamente, ma bloccata dalla regola esplicita del ticket a causa di una collisione di versione confermata e non correlata (`001`/`002`/`003`, fuori scope di questa catena). Il GO/NO-GO complessivo di questo runbook (Fase 12 sotto) resta **NO-GO** finché quella collisione non è formalmente chiusa.

> **Aggiornamento — DEPLOY-PLAN-4 (2026-08-06).** Il metodo di applicazione della catena production-safe è ora **esclusivamente** `node scripts/deploy-production-migrations.mjs --apply` (mai `supabase db push` standard, che legge `supabase/migrations/` e scriverebbe su `supabase_migrations.schema_migrations`). Dettagli completi, incluso il gate di backup/restore collegato, in [PRODUCTION_MIGRATION_LEDGER_ISOLATION.md](PRODUCTION_MIGRATION_LEDGER_ISOLATION.md). **Precondizioni obbligatorie prima di qualunque `--apply` reale sul database remoto** (aggiunte alla Fase 5 sotto): (1) backup verificato eseguito, (2) restore test eseguito con successo, (3) `select count(*) from public.geo_nil_milano` deve restituire `88` immediatamente prima dell'esecuzione, (4) `supabase migration list --linked` deve corrispondere esattamente a quanto registrato in `REMOTE_PRODUCTION_MIGRATION_MATRIX.md` — qualunque nuova versione remota non documentata blocca l'esecuzione fino a nuova verifica. Il GO/NO-GO resta **NO-GO** (la collisione `001`/`002`/`003` è isolata dal nuovo meccanismo ma non ancora chiusa; il backup/restore reale non è mai stato eseguito).

> **Aggiornamento — RELEASE-FREEZE-1 (2026-08-06).** Le precondizioni (1) e (2) sopra sono ora **soddisfatte**: backup reale completo eseguito e verificato tramite restore su clone isolato (ogni conteggio critico/di catalogo identico al remoto, `geo_nil_milano` 88/88, RPC NIL funzionante, catena production-safe applicata con successo e in modo idempotente sul clone). Dettagli in [VOLANTINIPRO_RELEASE_FREEZE_REPORT.md](VOLANTINIPRO_RELEASE_FREEZE_REPORT.md), [VOLANTINIPRO_BACKUP_MANIFEST.md](VOLANTINIPRO_BACKUP_MANIFEST.md), [VOLANTINIPRO_RESTORE_TEST_REPORT.md](VOLANTINIPRO_RESTORE_TEST_REPORT.md). Il GO/NO-GO complessivo resta **NO-GO**, ma ora per un solo motivo **procedurale e non tecnico**: il worktree locale contiene lavoro applicativo non correlato non ancora committato (deliberatamente non toccato, come richiesto) e non è quindi formalmente "congelato" nella sua interezza. Nessuna migrazione è mai stata applicata al database remoto reale.

> **Aggiornamento — RC2-FIX-1 (2026-08-06).** Durante PRODUCTION-DEPLOY-1 il worktree di release congelato è stato trovato contaminato da attività concorrente non coordinata (deploy fermato correttamente, audit forense in [RC2_FORENSIC_AUDIT_REPORT.md](RC2_FORENSIC_AUDIT_REPORT.md), verdetto PARTIAL). Questo ticket ha creato un nuovo worktree pulito da `2b2fa8e`, riscritto la migrazione `20260806150009` (flusso Admin→Driver) contro lo schema remoto reale verificato, e portato il frontend corrispondente adattandolo all'architettura reale di questo worktree (router a token, non il pattern regex del worktree di sviluppo di origine). Verificato end-to-end su clone: catena completa (`150001`-`150009`) dry-run + apply + riapplicazione idempotente, tutte le 8 RPC testate con dati reali, `npm test` 280/280, `npm run build` OK. Verdetto: [ADMIN_DRIVER_LINK_FLOW_RC2_FIX_REPORT.md](ADMIN_DRIVER_LINK_FLOW_RC2_FIX_REPORT.md). Tag proposto (non creato, richiede autorizzazione): `volantinipro-rc2-2026-08-06`. Nessuna migrazione applicata al remoto, nessun push.

## Fase 5 — Backup e restore (obbligatorio prima di qualunque migrazione)

| Componente | Comando previsto | Destinazione | Cifratura | Hash/integrità |
|---|---|---|---|---|
| Schema | `supabase db dump --db-url "$REMOTE_DB_URL" --schema-only -f backup_schema_$(date +%Y%m%d%H%M).sql` | Storage offline (non nel repo Git) | Cifratura at-rest del volume/bucket di backup (es. AES-256 lato storage) | `sha256sum backup_schema_*.sql > backup_schema_*.sql.sha256` |
| Dati | `supabase db dump --db-url "$REMOTE_DB_URL" --data-only -f backup_data_$(date +%Y%m%d%H%M).sql` | Come sopra, **accesso ristretto** (contiene dati reali) | Come sopra + cifratura in transito (TLS, già garantita dalla connection string `sslmode=require`) | `sha256sum` come sopra |
| Auth (utenti, identities) | Backup nativo Supabase (Dashboard → Database → Backups) o `pg_dump` mirato allo schema `auth` se si ha accesso diretto | Come sopra | Come sopra | Come sopra |
| Storage (metadata, non i file binari) | `pg_dump` mirato allo schema `storage` (tabelle `objects`, `buckets`) — i file binari restano nel bucket, non serve ri-copiarli se il bucket non viene toccato | Come sopra | Come sopra | Come sopra |
| Configurazione Edge Function (env/secrets) | `supabase secrets list --project-ref "$PROJECT_REF"` (elenca solo i **nomi**, mai i valori) → registrare manualmente quali secret sono attesi, non il loro contenuto | Documento operativo separato, **mai nel repository** | N/A (nessun valore esportato) | N/A |
| Migration history | `SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version;` — **eseguita in sola lettura in DEPLOY-PLAN-2** via `supabase db query --linked` (11 righe lette, vedi `REMOTE_PRODUCTION_MIGRATION_MATRIX.md` Fase 2); per il backup vero e proprio va comunque salvata una copia completa con la colonna `statements` (non stampata qui per estensione) | File di testo separato dal dump schema/dati | Come sopra | `sha256sum` |

**Verifica integrità**: confrontare l'hash calcolato subito dopo il dump con l'hash ricalcolato sul file nella destinazione finale, prima di considerare il backup valido.

### Prova di restore (obbligatoria — il piano non è approvabile senza)

1. Su un database Postgres locale pulito (es. il container Docker locale già usato in questa serie di sessioni, in un database separato da quello di sviluppo — `CREATE DATABASE restore_test;`), eseguire: `psql "$LOCAL_TEST_DB_URL" -f backup_schema_*.sql` poi `psql "$LOCAL_TEST_DB_URL" -f backup_data_*.sql`.
2. Verificare che il numero di tabelle, il numero di righe per le tabelle critiche (`campaigns`, `profiles`, `campaign_zones`) e la presenza delle funzioni chiave (`gps_is_admin`, `get_map_sectors`) corrispondano ai conteggi registrati prima del dump.
3. Eseguire `npm test` contro un ambiente puntato sul database ripristinato (stessa tecnica già usata in `FINAL_PRE_DEPLOY_FIXES_REPORT.md` Fase 6 con `supabase db reset`) — se i test che non richiedono dati specifici passano, il restore è strutturalmente valido.
4. Documentare l'esito (successo/fallimento, tempo impiegato, eventuali errori) nel log operativo del deploy, **prima** di procedere allo Step 5 del runbook (Fase 10).

Senza il punto 3 completato con esito positivo, il deploy **non può procedere** (Fase 12, GO/NO-GO).

## Fase 6 — Strategia migrazioni (ordine esatto)

> **Correzione DEPLOY-PLAN-2**: la verifica con accesso diretto ha rivelato fatti che cambiano materialmente il piano sotto, riassunti qui e dettagliati in `REMOTE_PRODUCTION_MIGRATION_MATRIX.md`:
> - **`20260805000010` non è "applicabile senza dipendenze"** come scritto sotto — la ledger remota ha già una riga registrata sotto questo identificatore di versione, con contenuto SQL completamente diverso (`reconcile_remote_operator_assignments`, 21 statement). Il file locale **non può essere applicato con questo numero di versione**; serve rinumerarlo prima di qualunque comando.
> - **`20260805000012`/`014` (categoria territoriale) non vanno applicate così come sono**: esiste già sul remoto una tabella NIL di Milano reale e popolata (`geo_nil_milano`, 88 righe), indipendente e più ricca della `geo_municipality_nil` che questi file creerebbero. Applicarle causerebbe una regressione funzionale (la RPC `get_nil_breakdown_in_radius` reale verrebbe sostituita da una versione più povera che punta a una tabella vuota). Richiede una decisione di prodotto, non un'applicazione SQL.
> - **`20260806000002` risulta a rischio più basso del previsto**: `campaign_zone_progress` ha **0 righe reali** sul remoto (verificato via `COUNT(*)`), quindi la UPDATE di riconciliazione di quel file non toccherebbe alcuna riga esistente.
> - **`20260806000004` fallirebbe se applicata così com'è**: una delle 4 funzioni che indurisce (`get_municipalities_in_radius`) **non esiste sul remoto** — l'`ALTER FUNCTION` corrispondente andrebbe rimosso o reso condizionale prima dell'applicazione.
>
> Le sezioni seguenti restano come piano-tipo per-categoria (struttura/formato ancora valido), ma **prima di eseguire qualunque comando reale vanno lette insieme alla Matrix**, non da sole.

Le migrazioni approvate (10 file di questa serie di sessioni, vedi Manifest Fase 4) si applicano **nell'ordine dei nomi file** (invariante già rispettata localmente e verificata con `supabase db reset`), raggruppate per categoria come richiesto. All'interno di ogni categoria l'ordine tra le migrazioni elencate è quello di applicazione.

### 1. Migrazioni di tracking/history
Nessuna migrazione dedicata solo alla ledger in questa release — la registrazione in `supabase_migrations.schema_migrations` avviene automaticamente per ogni file applicato via `supabase migration up`/`db push`. **Prerequisito soddisfatto in DEPLOY-PLAN-2**: la ledger remota è stata ispezionata direttamente (11 righe, vedi Matrix Fase 2) — ma la riconciliazione delle versioni "schema presente/non registrato" (`202607230001`, `20260724101527`, verosimilmente gran parte della serie `009`–`033`) resta da eseguire manualmente, riga per riga, non con un comando automatico.

### 2. Migrazioni schema — `20260805000010_gtfs_routes_stop_times.sql`
- **Prerequisito aggiornato**: risolvere prima la collisione di versione con `reconcile_remote_operator_assignments` (rinumerare il file locale) — vedi nota di correzione sopra. Finché non risolto, questa migrazione **non è applicabile**.
- SQL: `CREATE TABLE IF NOT EXISTS public.gtfs_routes/gtfs_stop_times`, indici, RLS, grant.
- Durata stimata: <1s (nessun dato, solo DDL).
- Lock previsto: `ACCESS EXCLUSIVE` transitorio sulle nuove tabelle (nessun impatto su tabelle esistenti).
- Prova di successo: `SELECT to_regclass('public.gtfs_routes');` non nullo.
- Query di verifica: `SELECT count(*) FROM public.gtfs_routes;` (atteso 0 subito dopo il deploy schema, popolamento dati separato).
- Rollback: `DROP TABLE IF EXISTS public.gtfs_routes, public.gtfs_stop_times CASCADE;` (sicuro, tabelle nuove senza dipendenti).
- Rischio dati: nullo (tabelle nuove).

### 2. Migrazioni schema — `20260805000012_milano_nil_pgt2030.sql`
- Prerequisiti: **verificare prima, con accesso diretto, se `geo_municipality_nil` esiste già** (Manifest Fase 3 — esito ambiguo via PostgREST). Se esiste già con dati reali, non riapplicare senza un piano di conciliazione dati separato.
- SQL: `CREATE TABLE IF NOT EXISTS public.geo_municipality_nil`, trigger di validazione geometrica, RPC `get_nil_breakdown_in_radius` (con il fix di idempotenza di questo ciclo: `DROP FUNCTION IF EXISTS` prima della `CREATE OR REPLACE`).
- Durata stimata: <1s.
- Lock previsto: `ACCESS EXCLUSIVE` transitorio, solo su oggetti nuovi/propri.
- Prova di successo: `SELECT to_regclass('public.geo_municipality_nil');` non nullo; `SELECT proname FROM pg_proc WHERE proname='get_nil_breakdown_in_radius';` una riga.
- Query di verifica: `SELECT count(*) FROM geo_municipality_nil;` (0 atteso prima del popolamento dati).
- Rollback: `DROP TABLE IF EXISTS public.geo_municipality_nil CASCADE;` **solo se la tabella era vuota prima di questa migrazione** (verificare con la query sopra prima di eseguire il rollback).
- Rischio dati: nullo se la tabella non esisteva prima; **da rivalutare manualmente** se l'ambiguità della Fase 3 si rivelasse "la tabella esiste già con dati".

### 2. Migrazioni schema — `20260805000013_address_points_radius_summary.sql`, `20260805000014_real_nil_geometry_tolerance.sql`
- Prerequisiti: `20260805000012` per la `014` (dipendenza diretta sulla tabella NIL).
- SQL: indice GIST su `address_points`, RPC `get_address_points_radius_summary`; funzioni di tolleranza geometrica NIL.
- Durata stimata: la creazione dell'indice GIST su `address_points` può richiedere secondi/minuti in produzione se la tabella ha già molte righe reali (verificare `SELECT count(*) FROM address_points;` prima — osservato "presente con dati" in Fase 3 del Manifest, conteggio esatto non ottenibile con la sola chiave anon).
- Lock previsto: **`SHARE` durante la creazione dell'indice** (non blocca le letture, blocca le scritture concorrenti su `address_points` per la durata della creazione) — usare `CREATE INDEX CONCURRENTLY` se il volume reale è alto, valutazione da fare con l'operatore al momento del deploy.
- Prova di successo: `\d address_points` mostra l'indice; RPC risponde `200` a una chiamata di test.
- Query di verifica: chiamata reale alla RPC con coordinate note, confronto con l'equivalente locale.
- Rollback: `DROP FUNCTION IF EXISTS get_address_points_radius_summary(...); DROP INDEX IF EXISTS address_points_osm_geography_idx;`
- Rischio dati: nullo (nessuna tabella nuova, solo indice/funzione).

### 3. Migrazioni dati
Nessuna in questa release: tutte le migrazioni committate sono DDL/funzioni; il popolamento dati reali (NIL, GTFS, POI, civici) è un passo **operativo separato** (`npm run import:*`), esplicitamente fuori da questo runbook di migrazione schema, da pianificare a parte con throttling verso le API esterne (OSM, GTFS provider).

### 4. Migrazioni RLS/security — `20260806000004_harden_security_definer_search_path.sql`
- Prerequisiti: le 4 funzioni (`get_map_sectors`, `get_municipalities_in_radius`, `upsert_gtfs_stops_batch`, `upsert_omi_zones_batch`) devono già esistere sul remoto (confermato per `get_map_sectors` in Fase 3 del Manifest; le altre 3 da verificare).
- SQL: solo `ALTER FUNCTION ... SET search_path`, `REVOKE`/`GRANT` — nessuna modifica al corpo delle funzioni.
- Durata stimata: <1s.
- Lock previsto: breve lock catalogo (`ALTER FUNCTION`), nessun impatto su query in corso.
- Prova di successo: query diretta su `pg_proc.proconfig` mostra `search_path=public, pg_temp`.
- Query di verifica: chiamata reale a `get_map_sectors` con anon key → stesso payload di prima.
- Rollback: `ALTER FUNCTION ... RESET search_path;` + ripristino grant precedenti (`GRANT EXECUTE ... TO PUBLIC`) — sconsigliato, il rollback di un hardening di sicurezza va evitato salvo rottura funzionale confermata.
- Rischio dati: nullo (nessuna tabella toccata).

### 5. Migrazioni RPC
Comprese nelle categorie sopra (ogni migrazione territoriale/GPS porta le proprie RPC) — nessuna migrazione RPC-only separata in questa release.

### 6. Migrazioni GPS — `20260806000001_campaign_coverage_adjustments.sql`, `20260806000002_gps_manual_coverage_v2.sql`, `20260806000003_gps_coverage_canonical_consolidation.sql`
- Prerequisiti: **ordine tassativo 001 → 002 → 003** (003 dipende dalle colonne che 002 aggiunge a `campaign_zone_progress`, documentato in `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md`).
- SQL: nuova tabella `campaign_coverage_adjustments` (+log), nuove colonne su `campaign_zone_progress` esistente (**tabella con dati reali potenziali** — a differenza delle tabelle territoriali, questa ha righe reali in produzione), trigger di sincronizzazione, guardia anti-scrittura-concorrente.
- Durata stimata: <1s per le nuove tabelle; l'`ALTER TABLE ADD COLUMN` su `campaign_zone_progress` è istantaneo in Postgres moderno (colonne nullable, nessun riscrittura tabella) anche con dati reali.
- Lock previsto: `ACCESS EXCLUSIVE` breve su `campaign_zone_progress` durante l'`ALTER TABLE` (millisecondi, non blocca a lungo anche con molte righe, essendo `ADD COLUMN` senza default calcolato).
- Prova di successo: `SELECT to_regclass('public.campaign_coverage_adjustments');`; `SELECT column_name FROM information_schema.columns WHERE table_name='campaign_zone_progress' AND column_name='source';` una riga.
- Query di verifica: replica del test funzionale già eseguito in locale (`FINAL_PRE_DEPLOY_FIXES_REPORT.md` Fase 6, punto 8) contro il remoto con un utente/campagna di test **dedicati e reversibili**, mai su dati reali di un cliente.
- Rollback: **non banale** — `002` modifica righe esistenti di `campaign_zone_progress` (la UPDATE di riconciliazione). Rollback = `DROP TABLE campaign_coverage_adjustments* CASCADE;` + `ALTER TABLE campaign_zone_progress DROP COLUMN adjustment_type, inaccessible_percent, notes, source;` **ripristina lo schema ma non i valori di `manual_percent` riconciliati dalla UPDATE di `002`** — per questo il backup dati pre-migrazione (Fase 5) è indispensabile prima di questo blocco specifico.
- Rischio dati: **medio-alto**, unico blocco della release che scrive su una tabella con dati reali esistenti — trattare con più cautela delle altre categorie, eseguire in una finestra a basso traffico.

### 7. Migrazioni territoriali
Vedi categoria 2 (schema) — GTFS, NIL, civici sono trattate lì poiché in questa release sono esclusivamente DDL.

### 8. Migrazioni AI
Nessuna migrazione AI-specifica non già coperta: le tabelle `ai_territorial_chat_cache`/`ai_territory_summaries` risultano da migrazioni precedenti a questa serie (036/029), non modificate qui. `ai_territorial_chat_cache` è risultata assente in Fase 3 del Manifest — **non è in questa release**, segnalato come gap preesistente da chiarire con l'operatore ma non un blocco introdotto da questo ciclo.

**Nulla di quanto sopra è stato applicato.**

## Fase 7 — Edge Function deploy plan

| Function | Commit sorgente | JWT verification | Env richieste | Ruolo autorizzato | Comando deploy previsto | Test curl post-deploy | Rollback | Rischio |
|---|---|---|---|---|---|---|---|---|
| `ai-admin-copilot` | `HEAD` (`04c7008`), invariata da AI-BRAIN-3 | Sì (verificato server-side via `auth.getUser`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | `admin`/`super_admin` | `supabase functions deploy ai-admin-copilot --project-ref "$PROJECT_REF"` | `curl -X POST "$URL/functions/v1/ai-admin-copilot" -H "Authorization: Bearer <token-admin-reale>" -d '{"dashboardData":{}}'` → atteso `200` con `status:"ai"` | `supabase functions delete ai-admin-copilot` + redeploy versione precedente da tag | Basso — funzione già verificata in locale con dati reali |
| `ai-assistant-territory` | `HEAD` | Sì | idem | qualunque utente autenticato (autorizzazione applicativa) | idem | `curl ... -d '{"snapshot":{...},"question":"..."}'` → `200` | idem | Basso |
| `ai-campaign-report` | `HEAD` | Sì | idem | owner campagna o admin | idem | `curl ... -d '{"campaignId":"<id-test>"}'` → `200` proprietario, `403` non proprietario | idem | Basso |
| `analyze-territory-summary` | `HEAD` | Sì | idem + verifica numerica anti-allucinazione interna | qualunque utente autenticato | idem | `curl ... -d '{"payload":{...}}'` → `200` | idem | Basso |
| `analysis-istat` | `HEAD` (file modificato nel worktree esterno, **non incluso in questa release candidate** — vedi Fase 2) | Sì (ma funziona con sola anon key) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAPBOX_TOKEN` | pubblico | idem | `curl ... -H "apikey: $ANON_KEY"` → `200` | idem | **Medio** — la versione da deployare deve essere quella committata in `HEAD`, non la versione modificata non committata nel worktree; verificare esplicitamente prima del deploy quale versione si sta pubblicando |
| `analysis-poi-search` | `HEAD` (committata in `d5d1e6f`) | Sì (anon key sufficiente) | idem + `GOOGLE_PLACES_API_KEY`/`GOOGLE_API_KEY`, `FOURSQUARE_API_KEY`, `OVERPASS_ENDPOINT` | pubblico | idem | `curl ...` → `200` | idem | Basso — versione committata e testata in questo ciclo |
| `analysis-omi-zones` | `HEAD` | Sì | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | pubblico | idem | `curl ...` con parametri validi → `200` (nel test locale un GET senza parametri ha dato `400`, comportamento atteso, non un errore) | idem | Basso |

**Ordine di deploy Edge Function proposto**: `analysis-istat`, `analysis-poi-search`, `analysis-omi-zones` (dipendenze dati territoriali) prima di `ai-assistant-territory`/`analyze-territory-summary` (le consumano indirettamente via il context layer applicativo, non una dipendenza diretta a runtime, ma coerente con l'ordine "territorio prima di AI" del resto del piano); `ai-admin-copilot`/`ai-campaign-report` per ultime (dipendono solo da tabelle già esistenti).

**Nessun deploy eseguito.**

## Fase 8 — Env e segreti

| Variabile | Locale | Staging | Produzione | Segreto | Pubblica (`VITE_*`) | Obbligatoria |
|---|---|---|---|---|---|---|
| `SUPABASE_URL` | Docker locale (`127.0.0.1:54340`) o remoto per test mirati | URL progetto staging | URL progetto produzione | No | No (solo `VITE_SUPABASE_URL` lo è) | Sì |
| `VITE_SUPABASE_URL` | Come sopra | Come sopra | Come sopra | No | **Sì** | Sì |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | Chiave locale demo / `sb_publishable_...` remota | Chiave staging | Chiave produzione | No (è pubblica per design) | **Sì** | Sì |
| `SUPABASE_SERVICE_ROLE_KEY` | Presente in `.env.development.local` (gitignored) | Da impostare solo lato server/Edge Function | Come sopra | **Sì, massima sensibilità** | No, **mai** | Sì (solo Edge Function/script server-side) |
| `OPENAI_API_KEY` | Presente in `supabase/functions/.env` (gitignored) | Da impostare via `supabase secrets set` | Come sopra | **Sì** | No | Sì (per risposte AI reali; in assenza, fallback controllato — verificato in AI-BRAIN-3) |
| Modello OpenAI | `gpt-4o-mini` (hardcoded in ogni Edge Function AI) | Stesso | Stesso | No | No | N/A — non è una env var in questa codebase, è un valore fisso nel codice sorgente |
| `VITE_FEATURE_AI_CUSTOMER_DASHBOARD` / `VITE_FEATURE_AI_ADMIN_DASHBOARD` / `VITE_AI_TERRITORIAL_STEP2_ENABLED` | `true` in `.env.development.local` | Da impostare esplicitamente | **Da impostare esplicitamente** — default `false` se assente (fail-closed, ma non l'intento prodotto) | No | **Sì** | No (ma raccomandata, altrimenti AI spenta silenziosamente) |
| `VITE_MAPBOX_TOKEN` | Presente in `.env` | Opzionale | Opzionale | No (token pubblico Mapbox, ma da non esporre senza necessità) | **Sì** | No — fallback CARTO verificato funzionante senza |
| Stripe | **Nessuna variabile Stripe trovata nel codice o in `.env.example`** — il pagamento osservato nel codice usa un flusso "bonifico" (`VITE_IBAN`/`VITE_INTESTATARIO`/`VITE_BANCA`), non Stripe | N/A | N/A | N/A | N/A | **No — non presente in questa release, non bloccante, ma da confermare con l'owner se atteso** |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Solo placeholder in `.env.example` | Da impostare | Da impostare | **Sì** | No | Sì (per `send-email-conferma`) |
| Webhook | **Nessun webhook in ingresso trovato nel codice** (nessun endpoint Edge Function che riceve chiamate da servizi esterni oltre alle chiamate dirette dal client) | N/A | N/A | N/A | N/A | No |
| CORS / allowed origins | Tutte le Edge Function usano `Access-Control-Allow-Origin: *` (verificato nel codice sorgente di tutte e 4 le function AI) | Stesso, salvo restrizione esplicita | **Da restringere in produzione** al dominio reale dell'app, se richiesto dalla policy di sicurezza dell'organizzazione — non bloccante per il funzionamento, ma un hardening consigliato fuori dallo scope tecnico di questo ciclo (richiederebbe modificare il codice applicativo, vietato in questo ciclo) | No | N/A | No (funziona con `*`, più permissivo del necessario) |

**Verifiche richieste**:
- Nessun segreto committato: confermato nei cicli precedenti (grep negativo ripetuto su tutto il repository).
- Nessuna chiave stampata in questo documento o in questa sessione: confermato — la chiave `service_role` reale presente in `.env.development.local` non è mai stata letta né riportata in nessun output di questa sessione.
- `.env.example` completo: verificato nel ciclo FINAL-PRE-DEPLOY-AUDIT — contiene tutti i placeholder rilevanti, nessun valore reale.
- Feature AI abilitate correttamente in produzione: **da fare esplicitamente al momento del deploy** — il default è spento, non un errore ma un passo operativo da non dimenticare (già segnalato come rischio nell'audit).
- Le Edge Function ricevono i secret necessari: da impostare con `supabase secrets set OPENAI_API_KEY=... RESEND_API_KEY=... GOOGLE_PLACES_API_KEY=... FOURSQUARE_API_KEY=...` sul progetto di destinazione — comando **non eseguito**.

## Fase 9 — Frontend deploy plan

| Campo | Valore |
|---|---|
| Branch sorgente | `feat/full-site-final` |
| Commit da pubblicare | `04c7008821087f81523b80b3a21ad1835346fa69` (HEAD, dopo il freeze release candidate — Fase 10 Step 1) |
| Build command | `npm run build` (verificato: successo, 685 moduli, nessun errore) |
| Output directory | `dist/` (standard Vite, confermato da `vite.config.js`) |
| Env richieste in produzione | Tutte le `VITE_*` della matrice Fase 8, impostate sulla piattaforma di hosting scelta (non Vercel per questo ciclo, per istruzione esplicita — piattaforma da definire con l'owner) |
| Dominio | Da definire con l'owner (non presente in nessun file di configurazione osservato) |
| Redirect | SPA fallback richiesto: tutte le route non-asset devono servire `index.html` (routing lato client basato su `page` state + `history.pushState`, confermato in `AppRouter.jsx`) |
| Cache | Asset con hash nel nome file (`index-*.js`, standard Vite) → cache-control lunga (`immutable`) sicura; `index.html` → `no-cache` per garantire che i nuovi asset vengano sempre serviti dopo un deploy |
| Headers | Nessun header di sicurezza custom (CSP, HSTS, ecc.) trovato nel codice — da definire a livello di piattaforma di hosting, fuori dallo scope applicativo di questo ciclo |
| CORS | Non applicabile al frontend statico stesso (le richieste CORS rilevanti sono verso Supabase, coperte in Fase 8) |
| Fallback SPA | Vedi "Redirect" sopra |
| Route Admin/Cliente/Driver | `/admin`, `/admin/live`, `/admin/campaigns/:id/{gps,operations,groups,report}` (Admin); `/dashboard`, `/customer/campaigns/:id/{tracking,report,payment}` (Cliente); `/driver/tracking/:campaignId` (Driver, entry point standalone fuori da `AppRouter` — confermato in `src/main.jsx`) — tutte richiedono il fallback SPA sopra per funzionare con un refresh diretto sull'URL |

### Smoke test post-deploy frontend (da eseguire manualmente, non automatizzato in questo ciclo)

| Area | Verifica |
|---|---|
| Homepage | Carica, nessun errore console critico |
| Configuratore | Step1→2→3→4 completabile, PDF generabile |
| Login | Magic link Cliente e Admin arrivano e autenticano |
| Admin | Dashboard carica, elenco campagne, GPS monitor, pannello correzione copertura |
| Cliente | Dashboard, tracking, foto, report, assistente AI risponde |
| Driver | Login, start/pause/resume/stop sessione, upload POD |
| PDF | Preventivo generato e scaricabile |
| Mappa | Step 2 carica (CARTO fallback se senza Mapbox token), Milano NIL selezionabile |
| AI | Risposta reale (non fallback) da almeno un pannello (Admin o Territoriale) |
| GPS live | Traccia visibile su mappa Admin durante una sessione Driver reale di test |

**Nessun deploy Vercel o di altra piattaforma è stato eseguito.**

## Fase 10 — Runbook di pubblicazione (bloccante, numerata)

| # | Passaggio | Comando | Operatore | Prerequisito | Successo atteso | Condizione STOP | Rollback |
|---|---|---|---|---|---|---|---|
| 1 | Congelamento release | Nessun nuovo commit su `feat/full-site-final` da questo momento | Tech lead | Fase 2 di questo runbook completata (file esterni riconciliati o esplicitamente esclusi) | Branch immutabile fino a fine deploy | File "necessario" ancora non committato | Nessuno (nessuna azione eseguita) |
| 2 | Tag release candidate | `git tag -a predeploy-ready-v1 -m "..." 04c7008` | Tech lead | Step 1 | Tag locale creato | — | `git tag -d predeploy-ready-v1` |
| 3 | Backup | Comandi Fase 5 | DBA/operatore con accesso diretto | Step 2, credenziali DB dirette disponibili | 3 file di backup con hash verificato | Backup incompleto o hash non verificabile | Nessuno (sola lettura) |
| 4 | Prova restore | Procedura Fase 5 | DBA | Step 3 completato con successo | Restore su ambiente locale/clone riuscito, `npm test` compatibile passa | Restore fallisce o dati mancanti | Nessuno (ambiente di test, non tocca il remoto) |
| 5 | Riconciliazione migration history | Ispezione diretta `supabase_migrations.schema_migrations` + confronto con la tabella Manifest Fase 4 | DBA con accesso diretto | Step 4 | Ogni riga della tabella Fase 4 confermata (non più "non verificabile") | Drift rilevato (migrazione registrata ma schema assente, o viceversa) | Nessuno (sola lettura) — se drift, **STOP definitivo**, non procedere allo Step 6 senza un piano di riconciliazione dedicato |
| 6 | Migrazioni DB | `supabase db push --project-ref "$PROJECT_REF"` **solo dopo Step 5 senza drift**, migrazione per migrazione nell'ordine di Fase 6 | DBA | Step 5 pulito | Ogni migrazione applicata senza errore, ledger aggiornata | Un file fallisce | Rollback specifico per migrazione (Fase 6 di questo documento) + ripristino da backup Step 3 se necessario |
| 7 | Verifica DB | Query di verifica di ogni migrazione (Fase 6) | DBA | Step 6 | Tutte le query di verifica danno l'esito atteso | Una verifica fallisce | Rollback mirato, non l'intero schema |
| 8 | Deploy Edge Function | Comandi Fase 7, nell'ordine indicato | DevOps | Step 7 | Ogni function risponde come da test curl previsto | Una function non risponde o risponde 500 | `supabase functions delete` + redeploy versione precedente |
| 9 | Configurazione secret | `supabase secrets set ...` (Fase 8) | DevOps | Step 8 | `supabase secrets list` mostra tutti i nomi attesi | Un secret manca | Impostare il secret mancante, non serve rollback distruttivo |
| 10 | Smoke test backend | Test curl reali per ogni Edge Function + RPC critiche | QA/DevOps | Step 9 | Tutte le risposte 200/401/403 attese, nessun 500 | Una risposta inattesa | Tornare allo Step 8 per la function coinvolta |
| 11 | Deploy frontend | Build + pubblicazione sulla piattaforma di hosting scelta (non descritto nel dettaglio: fuori scope, "non usare Vercel" per questo ciclo) | DevOps | Step 10 | Sito raggiungibile sul dominio target | Build fallisce o sito non raggiungibile | Rollback alla release precedente della piattaforma di hosting |
| 12 | Smoke test frontend | Checklist Fase 9 di questo documento | QA | Step 11 | Tutti i flussi rispondono come nei test locali | Un flusso critico rotto | Rollback Step 11 |
| 13 | Verifica osservabilità | Controllo log Edge Function, nessun errore ricorrente nei primi minuti; controllo che nessun segreto compaia nei log | DevOps | Step 12 | Log puliti | Errori ricorrenti o segreto loggato | Indagine mirata, eventuale rollback della function coinvolta |
| 14 | Approvazione | Revisione della checklist GO/NO-GO (Fase 12) da parte del responsabile | Product owner / Tech lead | Step 13 | Firma/approvazione esplicita registrata | Un punto della checklist non soddisfatto | Non procedere allo Step 15 |
| 15 | Tag finale | `git tag -a v-release-YYYYMMDD -m "..." 04c7008` (o commit più recente se sono stati fatti fix durante il deploy) | Tech lead | Step 14 | Tag definitivo creato, release considerata conclusa | — | `git tag -d` se la release viene invalidata subito dopo |

**Nessuno di questi passaggi è stato eseguito in questa sessione.**

## Fase 11 — Rollback per scenario

| Scenario | Cosa può essere rollbackato | Cosa richiede restore da backup | Tempo stimato | Impatto | Verifica successiva |
|---|---|---|---|---|---|
| Migration failure (schema-only, tabelle nuove) | Sì — `DROP TABLE`/`DROP FUNCTION` mirato (Fase 6) | No, se la migrazione ha toccato solo oggetti nuovi | Minuti | Basso — nessun dato reale perso | Riapplicare la query di verifica della migrazione, atteso "oggetto assente" |
| Migration failure su `campaign_zone_progress` (categoria GPS, `002`) | Parzialmente — schema sì, valori riconciliati dalla UPDATE no | **Sì**, per i valori di `manual_percent` riconciliati | 30–60 minuti (restore mirato da backup dati) | Medio — possibile discrepanza temporanea sui pannelli di copertura Admin/Cliente fino al restore | Confronto dei valori `manual_percent`/`effective_percent` post-restore con lo snapshot pre-migrazione |
| Edge Function failure | Sì — `supabase functions delete` + redeploy versione precedente (se già pubblicata) o disattivazione temporanea del flag `VITE_FEATURE_AI_*` corrispondente lato frontend | No | Minuti | Basso-Medio — pannelli AI mostrano il fallback controllato invece di spegnersi (comportamento già verificato sicuro) | Test curl ripetuto sulla function |
| Frontend failure | Sì — rollback alla release precedente della piattaforma di hosting | No | Minuti (dipende dalla piattaforma) | Alto se prolungato (utenti bloccati) — priorità massima di rollback | Smoke test frontend ripetuto |
| RLS failure (policy troppo permissiva o troppo restrittiva) | Sì — `DROP POLICY`/`CREATE POLICY` mirato alla singola tabella coinvolta | No, salvo che dati siano già stati esposti/persi per l'errore (caso da trattare come incidente di sicurezza, non solo rollback tecnico) | Minuti per il fix tecnico, ore/giorni per l'eventuale gestione incidente | **Alto** se la policy era troppo permissiva e dati sono stati esposti | Ripetere i test di sicurezza (401/403/RLS) di `FINAL_PRE_DEPLOY_AUDIT_REPORT.md` |
| AI provider failure (OpenAI down o quota esaurita) | Nessun rollback necessario — comportamento di fallback controllato già verificato (nessun crash, nessun testo grezzo mostrato) | No | N/A — non è un guasto da rollback, è un percorso già gestito | Basso | Verificare che il fallback compaia correttamente nella UI |
| GPS regression (traccia non registrata, correzione non sincronizzata) | Sì — rollback della sola migrazione GPS coinvolta (`001`/`002`/`003`), **mai** intervento diretto sui punti GPS (`gps_tracking_points` non va mai toccata, per design) | Solo per la cache `campaign_zone_progress`, mai per la traccia originale | Minuti-ore | Medio | Rieseguire il ciclo funzionale end-to-end di `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md` §7 |
| Dati territoriali mancanti (NIL/GTFS/POI non popolati dopo il deploy schema) | N/A — non è un guasto, è un passo operativo separato non ancora eseguito (Fase 6, categoria 3) | No | Ore (dipende dal volume di dati da importare) | Basso — l'app degrada correttamente mostrando "dato non disponibile", non crasha | Rieseguire `npm run import:*` e verificare i conteggi |
| Autenticazione rotta | **Non rollbackabile con un comando singolo** — richiede diagnosi (Supabase Auth è un servizio gestito, non parte delle migrazioni di questa release) | Solo se la causa è una migrazione RLS di questa release, in quel caso vedi "RLS failure" sopra | Variabile | **Molto alto** — blocca l'intera app | Login di test per ciascun ruolo (Admin/Cliente/Driver) |

## Fase 12 — Checklist GO / NO-GO

| Area | Stato | Evidenza |
|---|---|---|
| Codice | ✅ Pronto | `HEAD` = `04c7008`, `git diff --check` pulito, `npm test` 244/244, `npm run build` senza errori |
| Database (schema locale) | ✅ Pronto | `supabase db reset` da zero, 60 migrazioni, zero errori |
| **Migration history (remota)** | ⚠️ **Letta, ma non ancora certa in ogni sua riga** | **Aggiornato in DEPLOY-PLAN-2**: ledger remota letta direttamente (11 righe reali, `REMOTE_PRODUCTION_MIGRATION_MATRIX.md` Fase 2). Confermate con certezza: una collisione di versione (`20260805000010`), 2 casi di schema-presente-non-registrato (`202607230001`, `20260724101527`), 1 tabella NIL di produzione indipendente e non presente nei file locali (`geo_nil_milano`). **Non ancora certa**: i nomi remoti di `001`/`002`/`003` non corrispondono ai file locali omonimi — richiede indagine ulteriore prima di poter affermare "nessuna versione ambigua resta aperta" |
| **Backup** | ❌ **Non eseguito** | Nessun comando remoto di scrittura eseguito in nessuno dei due cicli (per istruzione esplicita) — solo lettura |
| **Restore provato** | ❌ **Non eseguito** | Dipende dal backup sopra |
| File necessari nella release | ⚠️ **Parziale** | Tutto ciò che era esplicitamente nel mandato dei cicli precedenti è committato; **file di un processo esterno concorrente restano fuori dalla release candidate** (Fase 2) — decisione esplicita, non un errore, ma da riconciliare prima del freeze reale |
| Edge Function | ✅ Pronte (in locale) | Tutte e 7 verificate localmente con chiamate reali nei cicli precedenti; **non ancora deployate** |
| Env/segreti | ⚠️ **Da configurare al momento del deploy** | Nessun segreto committato (verificato), ma le variabili di produzione (incluse le 3 flag AI) non sono ancora impostate su alcuna piattaforma remota |
| Sicurezza | ✅ Pronto (in locale) | 401/403/RLS/search_path tutti verificati nei cicli precedenti |
| Test | ✅ Pronto | 244/244, build pulita |
| Monitoraggio | ⚠️ **Non definito** | Nessuna configurazione di osservabilità (log aggregation, alerting) trovata o definita in questo ciclo — da stabilire con l'owner |
| Rollback | ✅ Definito | Fase 11 di questo documento |
| Responsabile approvazione | ⚠️ **Da nominare** | Nessun nome specifico assegnato in questo ciclo — campo da compilare dall'organizzazione |

### Verdetto

**DEPLOY PLAN READY — NO-GO**

*(Aggiornato in DEPLOY-PLAN-2 — il blocco "accesso diretto mancante" del ciclo precedente è stato risolto, ma la verifica reale ha scoperto motivi più concreti e più critici per restare NO-GO, non meno.)*

Motivazione, strettamente secondo le condizioni che il ticket vieta esplicitamente per un GO:
1. **"Nessuna versione ambigua deve restare aperta"** — falso qui: i nomi remoti delle versioni `001` (`init`), `002` (`policies`), `003` (`storage`) **non corrispondono** ai file locali omonimi (`001_add_pagamento.sql`, `002_add_territorial_tables.sql`, `003_add_spatial_rpc.sql`) — confermato indipendentemente dal fatto che `get_municipalities_in_radius` (definita da `003_add_spatial_rpc.sql`) **non esiste sul remoto**. Questo è lo stesso pattern della collisione già confermata su `20260805000010`, ma non ancora investigato a fondo per la serie breve. Senza chiarire questo, non si può escludere che l'intera serie `001`–`008` registrata in ledger sia in realtà un insieme di migrazioni diverse da quelle presenti nel repository locale.
2. **Non è richiesta nessuna operazione distruttiva non reversibile — ma una lo sarebbe se eseguita senza le correzioni trovate**: applicare `20260805000012`/`014` così come sono causerebbe una regressione funzionale reale (sostituzione di `get_nil_breakdown_in_radius`, oggi funzionante su dati reali di produzione — 88 NIL —, con una versione che punta a una tabella vuota). Questo non è ancora "distruttivo" perché non è stato eseguito, ma il piano **non può** proporre di eseguirlo come "migrazione da applicare" senza prima una decisione di prodotto — la condizione di GO richiede che nessuna azione residua nel piano rischi questo, e oggi due migrazioni lo farebbero se applicate alla lettera.
3. **Backup non eseguito, restore non provato** — invariato dal ciclo precedente: nessun comando di scrittura è stato eseguito in nessuno dei due cicli (per istruzione esplicita, sola lettura in DEPLOY-PLAN-2).
4. **File necessari restano fuori dalla release** — invariato: i file dell'altro processo concorrente (Manifest Fase 2) restano non riconciliati.

Questo NO-GO, come il precedente, **non è un fallimento del piano**: la verifica diretta richiesta da questo ciclo ha funzionato esattamente come doveva — ha trasformato un'incertezza generica ("non possiamo verificare") in fatti precisi e azionabili (una collisione di versione confermata, una tabella di produzione indipendente scoperta, una funzione mancante che romperebbe una migrazione di sicurezza già pronta). Il percorso per arrivare a GO è più chiaro ora, non più oscuro: risolvere i 4 punti sopra (indagine sui nomi `001`–`003`, decisione di prodotto su `geo_nil_milano`, backup+restore reali, riconciliazione dei file esterni) con l'operatore giusto per ciascuno, poi ripetere questa stessa verifica.
