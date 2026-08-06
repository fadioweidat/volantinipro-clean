# DEPLOY-PLAN-4 — Production Migration Ledger Isolation

Base: [PRODUCTION_SAFE_MIGRATION_CHAIN.md](PRODUCTION_SAFE_MIGRATION_CHAIN.md), [REMOTE_PRODUCTION_MIGRATION_MATRIX.md](REMOTE_PRODUCTION_MIGRATION_MATRIX.md), [VOLANTINIPRO_DEPLOY_RUNBOOK.md](VOLANTINIPRO_DEPLOY_RUNBOOK.md).

Nessuna scrittura sul database remoto è stata eseguita per produrre questo documento. Nessun `migration repair`, nessun `db push`, nessun deploy, nessun push Git, nessuna modifica alla logica applicativa. Tutte le query verso il remoto sono state eseguite in sola lettura via `supabase db query --linked`. Tutti i test del runner (Fase 5) sono stati eseguiti esclusivamente contro un container Postgres locale usa-e-getta, mai contro il remoto.

---

## Fase 1 — Classificazione migrazioni

### A. LEGACY LOCAL HISTORY

`supabase/migrations/000*.sql` … `037*.sql` e i file con timestamp `202607*`/`202608*` precedenti a `20260806150001` (61 file totali in `supabase/migrations/`). Servono esclusivamente a ricostruire un database locale di sviluppo da zero (`supabase db reset`). **Non rappresentano il ledger di produzione**: la Fase 4 sotto dimostra con query dirette che almeno tre di questi file (`001`, `002`, `003`) non corrispondono affatto al contenuto realmente applicato su remoto con lo stesso identificativo di versione.

### B. REMOTE LEGACY HISTORY

Le versioni realmente registrate in `supabase_migrations.schema_migrations` sul progetto remoto (`mqkelrsvksrzrpmbstvd`), verificate via `supabase migration list --linked` il 2026-08-06:

`001` (`init`), `002` (`policies`), `003` (`storage`), `004`, `005`, `006`, `007`, `008`, `034`, `035`, `20260805000010` — più altre versioni remote non ancora enumerate singolarmente (il ledger remoto contiene più voci di quelle risolvibili 1:1 con i nomi dei file locali; vedi [REMOTE_PRODUCTION_MIGRATION_MATRIX.md](REMOTE_PRODUCTION_MIGRATION_MATRIX.md) Fase 2). Questa è la storia reale di produzione — indipendente e, in punti concreti, **divergente** dalla cartella locale.

### C. PRODUCTION RELEASE CHAIN

`supabase/migrations_production_safe/20260806150001` → `20260806150008` (8 file). **Unica catena autorizzata per questo rilascio.** Costruita in DEPLOY-PLAN-3 trattando lo schema reale remoto come baseline (non i file locali A), verificata con un dry-run a doppia applicazione (vedi `PRODUCTION_SAFE_MIGRATION_CHAIN.md` Fase 9).

### A e B non devono essere riconciliati automaticamente

Non esiste, in questo ticket o nei precedenti, alcuna azione che tenti di far coincidere il contenuto di A con B (nessun `migration repair`, nessuna rinomina, nessun tentativo di "correggere" il ledger remoto). Il motivo è duplice:

1. **A e B sono già, di fatto, cataloghi diversi** — B contiene il vero bootstrap del progetto (tabelle `profiles`/`campaigns` sotto i nomi `init`/`policies`/`storage`), mentre A contiene file scritti in un momento successivo dello sviluppo locale con un modello dati parzialmente diverso (`clienti`/`campagne`) che sul remoto esistono comunque, ma sotto **altre versioni non ancora identificate**, non sotto `001`/`002`/`003`. Forzare una corrispondenza 1:1 significherebbe o sovrascrivere lo storico reale del progetto (`migration repair` su versioni già eseguite) o rinominare localmente file che già fanno parte della cronologia condivisa del repository — entrambe operazioni pericolose e fuori scope.
2. **Non è necessario per l'obiettivo di questo ticket.** L'obiettivo è rendere C indipendente da A/B, non far quadrare la contabilità storica di A/B. Una riconciliazione di A/B, se mai necessaria, è un progetto a parte (raccomandato in `PRODUCTION_SAFE_MIGRATION_CHAIN.md` Fase 11 come `DEPLOY-PLAN-4bis` o simile) — vedi anche Fase 4 sotto.

---

## Fase 2 — Metodo di applicazione

### Opzioni valutate

| Opzione | Esito valutazione |
|---|---|
| 1. `psql` file-per-file | Valido in linea di principio, ma richiede un binario `psql` disponibile sull'host che esegue il deploy (non garantito — verificato assente su questo host) e non offre controllo nativo di hash/ledger/report senza uno script di wrapping attorno. |
| 2. Script Node/PowerShell controllato | **Scelto.** Controllo completo su: lista file (solo `migrations_production_safe/`, mai `supabase/migrations/`), hash SHA-256, transazione per file, stop su errore, ledger dedicato, output sanitizzato, report finale. Nessuna dipendenza da un binario `psql` esterno: usa il driver `pg` (aggiunto come devDependency, libreria di tooling, non logica applicativa). |
| 3. Comando Supabase CLI mirato | `supabase db query --linked -f <file>` **non legge mai `supabase/migrations/`** e **non scrive mai** su `supabase_migrations.schema_migrations` (a differenza di `db push`/`migration up`/`migration repair`) — soddisferebbe il vincolo di esclusione totale delle migrazioni legacy. Scartato come meccanismo primario solo perché l'output via Management API è JSON con markers di sicurezza pensati per query interattive, non ottimizzato per un loop programmatico con hash/durata/ledger/transazioni esplicite; resta comunque un **canale di verifica secondario valido** (usato nei test di Fase 5 per letture di controllo). |

**Non usato**: `supabase db push` standard — legge sempre `supabase/migrations/` e scrive sempre su `supabase_migrations.schema_migrations`, esattamente il comportamento che questo ticket deve escludere.

### Il metodo scelto: `scripts/deploy-production-migrations.mjs`

Vedi il file per l'implementazione completa. Proprietà garantite (verificate in Fase 5):

- **Applica in ordine**: i file sono ordinati per nome (`YYYYMMDDHHMMSS_` come prefisso, ordine lessicografico = ordine cronologico).
- **Si ferma al primo errore**: `--apply` interrompe immediatamente la catena al primo file fallito; nessun file successivo viene eseguito.
- **Registra hash**: SHA-256 di ogni file, calcolato sul contenuto esatto su disco, salvato nel ledger.
- **Registra durata**: tempo di esecuzione in millisecondi per ogni file, salvato nel ledger e nel report.
- **Query di verifica**: la Fase 4 della catena GPS (`20260806150004_gps_post_migration_verify.sql`) resta lo script di verifica post-migrazione dedicato — il runner lo esclude esplicitamente dall'elenco applicabile (è sola lettura, non uno schema change) mentre l'operatore lo esegue come passo di verifica separato.
- **Impedisce la doppia applicazione accidentale**: se una versione risulta già `success` nel ledger con lo stesso hash, viene **saltata** (idempotente); se risulta già `success` con hash diverso, il runner **si blocca** (vedi Fase 6).
- **Non tocca mai 001/002/003**: la directory sorgente predefinita è **esclusivamente** `supabase/migrations_production_safe/`; un guardiano aggiuntivo (`LEGACY_PATTERN`) rifiuta immediatamente l'intera esecuzione se un qualunque file nella directory sorgente ha un nome in stile legacy (`0NN_...`) — verificato in Fase 5 con un test dedicato.

---

## Fase 3 — Release ledger dedicato

### Decisione: tabella dedicata `public.volantinipro_release_migrations`, non il ledger Supabase standard

| Opzione | Perché scartata / scelta |
|---|---|
| Usare `supabase_migrations.schema_migrations` con nuove versioni | **Scartata.** Quella tabella è di proprietà e gestione esclusiva della Supabase CLI (`db push`/`migration repair`/`migration up`). Scriverci manualmente creerebbe uno stato ibrido che la CLI potrebbe interpretare in modo imprevedibile in un futuro `db push`, e mescolerebbe la cronologia della catena production-safe con la cronologia legacy A/B che questo stesso ticket vuole isolare — l'opposto dell'obiettivo. |
| Tabella dedicata `public.volantinipro_release_migrations` | **Scelta.** Isolamento totale dalla CLI e da A/B; schema pensato esclusivamente per la catena C; nessuna ambiguità su quale ledger sia autorevole per quale scopo. |

Schema effettivamente creato dal runner stesso (idempotente, `create table if not exists`, non tracciato come file numerato della catena — vedi nota sotto):

```sql
create table if not exists public.volantinipro_release_migrations (
  version text primary key,
  filename text not null,
  sha256 text not null,
  applied_at timestamptz not null default now(),
  applied_by text not null,
  release_name text not null,
  execution_ms integer not null,
  status text not null check (status in ('success', 'failed'))
);
revoke all on table public.volantinipro_release_migrations from public, anon, authenticated;
```

Requisiti soddisfatti:
- **Non sostituisce `supabase_migrations.schema_migrations`**: tabelle completamente separate, nessun trigger o vincolo le collega.
- **Version univoca**: `version` è chiave primaria.
- **Hash verificato**: ogni riga porta lo SHA-256 del file al momento dell'applicazione; il runner confronta questo hash col file corrente ad ogni esecuzione (vedi Fase 6).
- **Nessun dato sensibile**: nessuna colonna contiene segreti, password o token; `applied_by` è lo username del sistema operativo dell'operatore (es. `deploy-bot`), non una credenziale.
- **Scrittura limitata al processo di deploy**: `REVOKE ALL ... FROM public, anon, authenticated` — solo il ruolo con cui si connette il runner (tipicamente `postgres`/`service_role` in un contesto CI/CD con credenziali dedicate, mai esposte al client) può scrivere.

**Perché il bootstrap della tabella non è un file numerato di `migrations_production_safe/`**: la tabella *traccia* la catena C, quindi non ha senso farla anche *parte* della catena che traccia se stessa (comporterebbe una dipendenza circolare concettuale — "il file che crea la tabella-ledger" dovrebbe esso stesso avere una riga nel ledger prima ancora che la tabella esista). Il runner la crea come passo di bootstrap indipendente e idempotente ad ogni esecuzione in modalità `--apply`, prima di processare qualunque file della catena.

---

## Fase 4 — Collisioni 001/002/003, con evidenza diretta

Verificato oggi (2026-08-06) via `supabase db query --linked` sulle colonne `version`, `name`, `statements` di `supabase_migrations.schema_migrations` — contenuto **completo e testuale** delle tre migrazioni realmente eseguite su remoto sotto quei identificativi.

### `001`

| Campo | Valore |
|---|---|
| Nome remoto | `init` |
| Nome file locale con la stessa versione | `001_add_pagamento.sql` |
| Oggetti remoti associati | `public.profiles`, `public.campaigns`, `public.campaign_zones`, `public.campaign_pois`, `public.campaign_analysis`, `public.ai_reports`, `public.campaign_assets`, `public.campaign_events`, `public.quotes`, funzione `public.set_updated_at()`, funzione+trigger `public.handle_new_user()` su `auth.users`, 10 indici |
| Oggetti locali associati (stesso numero di versione) | `public.clienti`, `public.campagne`, colonne di pagamento (`stato_pagamento`, `pagamento_tipo`, ...), funzione+trigger `genera_causale()` |
| Perché non fare `migration repair` | Il repair riscriverebbe la riga `001` del ledger remoto facendola puntare a `001_add_pagamento.sql`, ma la migrazione **realmente eseguita** (`init`) ha già creato oggetti reali e popolati in produzione (`profiles`, `campaigns`, ...). Un repair non esegue né disfa DDL — cambia solo l'etichetta nel ledger — quindi lascerebbe il ledger a mentire su cosa sia stato eseguito, con effetti imprevedibili sul prossimo `db push` (che confronterebbe i file locali col ledger "riparato" e potrebbe tentare di ri-applicare `001_add_pagamento.sql`, che potrebbe fallire o duplicare oggetti se `clienti`/`campagne` sono già presenti sotto un'altra versione, o creare confusione se non lo sono). |
| Perché non rinominare il ledger remoto | Rinominare (`update supabase_migrations.schema_migrations set name = ...`) è una scrittura diretta sul ledger di produzione — esplicitamente vietata da questo ticket ("non modificare il database remoto") e comunque rischiosa: la Supabase CLI usa quel nome per generare messaggi diagnostici e per la corrispondenza history; un nome alterato senza un file locale reale con quel nome esatto crea un disallineamento permanente rilevabile solo manualmente. |
| Come si neutralizza il rischio nella nuova procedura | La catena C (`150001`-`150008`) non fa mai riferimento, non dipende da, e non tenta di ri-applicare alcun oggetto creato da `001`. Il runner Fase 2 legge esclusivamente `migrations_production_safe/` e rifiuta categoricamente qualunque file con nome in stile `001_...` (guardia `LEGACY_PATTERN`, verificata in Fase 5). Il rischio di collisione è quindi reso strutturalmente irraggiungibile dal nuovo metodo, indipendentemente dallo stato irrisolto di A/B. |

### `002`

| Campo | Valore |
|---|---|
| Nome remoto | `policies` |
| Nome file locale | `002_add_territorial_tables.sql` |
| Oggetti remoti associati | 9× `alter table ... enable row level security` + 17 `create policy` su `profiles`/`campaigns`/`campaign_zones`/`campaign_pois`/`campaign_analysis`/`ai_reports`/`campaign_assets`/`campaign_events`/`quotes` |
| Oggetti locali associati | `public.geo_municipalities`, `public.demographic_indicators`, relativi indici GIST |
| Perché non fare repair | Stesso ragionamento di `001`: le RLS policy remote sono già attive e proteggono dati reali; un repair non le rimuove né le sostituisce, cambia solo l'etichetta, lasciando il ledger inconsistente con la realtà del database. |
| Perché non rinominare il ledger | Stesso ragionamento di `001` — scrittura diretta vietata sul ledger remoto, rischio di disallineamento permanente. |
| Come si neutralizza il rischio | Nessuna migrazione C ricrea o modifica le policy elencate sopra; `20260806150003_gps_security_rls_verify.sql` opera esclusivamente su `campaign_coverage_adjustments`(_log) e `campaign_zone_progress`, tabelle create da `150001`, mai su `profiles`/`campaigns` direttamente in modo che collida con `002`. |

### `003`

| Campo | Valore |
|---|---|
| Nome remoto | `storage` |
| Nome file locale | `003_add_spatial_rpc.sql` |
| Oggetti remoti associati | 3 bucket `storage.buckets` (`campaign-assets`, `campaign-reports`, `proof-photos`), 2 policy `storage.objects` (`storage_own_insert`, `storage_own_select`) |
| Oggetti locali associati | funzione `public.get_municipalities_in_radius(double precision, double precision, double precision)` |
| Perché non fare repair | Le stesse osservazioni di `001`/`002`, con un'aggravante specifica: DEPLOY-PLAN-3 aveva già confermato che `get_municipalities_in_radius` **non esiste affatto** su remoto (0 righe per qualunque firma in `pg_proc`). Questo è coerente al 100% con l'evidenza qui: il vero contenuto remoto di `003` non ha mai creato quella funzione — è la conferma diretta e definitiva del sospetto sollevato in `REMOTE_PRODUCTION_MIGRATION_MATRIX.md`. Un repair che facesse puntare `003` a `003_add_spatial_rpc.sql` senza mai eseguirne il contenuto lascerebbe il ledger a dichiarare applicata una funzione che in realtà non esiste — il tipo esatto di incoerenza pericolosa che questo ticket vuole eliminare per la nuova catena. |
| Perché non rinominare il ledger | Stesso ragionamento — vietato, rischioso, non necessario per l'obiettivo. |
| Come si neutralizza il rischio | `20260806150006_security_definer_conditional_hardening.sql` (DEPLOY-PLAN-3, Fase 6) già gestisce esplicitamente questo caso: verifica l'esistenza di `get_municipalities_in_radius` a runtime via `pg_proc` e, se assente — come confermato qui — salta l'hardening con un `RAISE NOTICE`, senza mai creare una funzione placeholder e senza mai fallire la migrazione. |

### Sintesi

Tutte e tre le collisioni sono ora **confermate con il testo SQL esatto**, non solo per differenza di nome. In tutti e tre i casi la nuova catena C non dipende in alcun modo dal contenuto reale o presunto di `001`/`002`/`003`, e il runner Fase 2 rende strutturalmente impossibile che un file in stile `00N_` venga letto o eseguito da questo meccanismo.

---

## Fase 5 — Test del deploy runner

Eseguiti il 2026-08-06 contro un container Postgres 17.6 usa-e-getta (`public.ecr.aws/supabase/postgres:17.6.1.084`, stessa immagine del container `supabase_db` locale), caricato con lo schema reale del remoto (`remote_baseline_schema.sql`, il dump a sola lettura già catturato in DEPLOY-PLAN-2/3). **Mai eseguito contro il remoto.**

| # | Scenario | Esito |
|---|---|---|
| 1 | Prima applicazione (`--dry-run` poi `--apply`) | **PASSATO.** Dry-run: tutti i 7 file validati in un'unica transazione mai committata (vedi nota sotto), rollback finale confermato (nessun oggetto persistito, verificato con `to_regclass`). Apply: tutti i 7 file applicati con successo, ledger popolato con 7 righe `success`. |
| 2 | Seconda esecuzione (`--apply` ripetuto) | **PASSATO.** Tutti i 7 file rilevati come già applicati con hash identico → `[SKIP]`, nessuna riscrittura, nessun errore. |
| 3 | File con hash modificato | **PASSATO.** File `150008` alterato in una copia temporanea (mai nella cartella reale) → il runner rileva `HASH MISMATCH` sulla versione `20260806150008` e si ferma immediatamente (`exit 1`), nessun file successivo processato. |
| 4 | File mancante | **PASSATO.** File `150007` rimosso da una copia temporanea dopo essere già stato applicato → il runner rileva che una versione presente con successo nel ledger non ha più un file corrispondente e si ferma (`exit 1`) prima di processare qualunque file. |
| 5 | Errore SQL simulato | **PASSATO.** File di test aggiuntivo (`150009_broken_test_only.sql`, mai nella catena reale) con una chiamata a funzione inesistente → il runner si ferma al primo errore, non processa file successivi (nessuno, essendo l'ultimo), riporta l'errore Postgres esatto. |
| 6 | Rollback del singolo file | **PASSATO.** Verificato che la tabella creata prima della riga che genera l'errore nello stesso file (`dp4_scenario5_marker`) **non esiste** dopo il fallimento — confermato che la transazione per-file dello scenario 5 è stata correttamente annullata nella sua interezza. |
| 7 | Ledger coerente | **PASSATO.** Al termine dei test, il ledger conteneva esattamente 8 righe: le 7 migrazioni reali con `status = success` e il file di test con `status = failed` — nessuna riga mancante, duplicata o con stato errato. |

**Verifica aggiuntiva (guardia anti-legacy)**: una copia del vero `001_add_pagamento.sql` inserita nella cartella sorgente puntata dal runner (`--dir`) causa un rifiuto immediato e totale dell'esecuzione (`[FATALE] ... nome in stile legacy ...`, `exit 1`), prima di connettersi anche solo al database. Conferma diretta che 001/002/003 non possono in alcun modo essere interpretate automaticamente da questo meccanismo.

**Nota tecnica rilevante trovata durante i test**: il primo tentativo di implementazione del `--dry-run` avvolgeva ogni singolo file nella propria transazione `BEGIN`/`ROLLBACK` attorno al contenuto del file — ma ogni file della catena contiene già un proprio `begin;`/`commit;` interno (per leggibilità come file standalone). Un `begin;` annidato dentro una transazione già aperta viene ignorato silenziosamente da Postgres, quindi il `commit;` interno del file **committava realmente** la transazione esterna del runner, vanificando il rollback. Il bug è stato individuato durante lo Scenario 1 stesso (una tabella risultava esistere dopo un `--dry-run`, quando non sarebbe dovuta esistere), corretto spostando il controllo della transazione interamente al runner (il `begin;`/`commit;` di ogni file viene rimosso programmaticamente prima dell'esecuzione) e ri-verificato con successo. Documentato qui perché è esattamente il tipo di errore silenzioso che la Fase 5 di questo ticket doveva scoprire.

---

## Fase 6 — Backup e restore gate

Il runner **non implementa da solo** un gate di backup/restore (fuori scope tecnico di uno script SQL — un backup/restore reale richiede infrastruttura Supabase/pg_dump esterna, già pianificata in `VOLANTINIPRO_DEPLOY_RUNBOOK.md` Fase 5). Il collegamento è **procedurale**: il Runbook viene aggiornato (vedi sotto) per elencare esplicitamente le precondizioni che devono essere verificate manualmente o da automazione CI/CD **prima** di invocare `--apply` sul database remoto:

| Condizione di blocco | Come si verifica | Stato attuale (2026-08-06) |
|---|---|---|
| Nessuna applicazione senza backup verificato | Eseguire e verificare l'integrità del backup pianificato in Runbook Fase 5 (`pg_dump`/snapshot Supabase) prima di ogni `--apply` reale | Pianificato, non eseguito (nessun deploy reale in corso) |
| Nessuna applicazione senza restore test | Il restore test pianificato in Runbook Fase 5 deve essere stato eseguito con successo su un ambiente separato | Pianificato, non eseguito |
| Nessuna applicazione se il ledger contiene la stessa versione con hash differente | **Automatizzato nel runner** — vedi Fase 5 Scenario 3, verificato: il runner si ferma da solo, nessuna azione manuale richiesta | Verificato funzionante |
| Nessuna applicazione se `geo_nil_milano` non contiene 88 righe | Query manuale pre-flight: `select count(*) from public.geo_nil_milano;` — verificato oggi, **88 righe confermate** sul remoto reale (sola lettura) | Verificato: 88/88 ✓ |
| Nessuna applicazione se la migration history remota differisce dalla matrice approvata | Confronto manuale pre-flight tra `supabase migration list --linked` e `REMOTE_PRODUCTION_MIGRATION_MATRIX.md` — nessuna variazione registrata rispetto a DEPLOY-PLAN-2/3 | Verificato: nessuna deviazione rilevata |

Le prime due condizioni (backup verificato, restore test) restano **gate manuali/organizzativi** — nessuno script può auto-certificarli in modo affidabile senza eseguire realmente un backup/restore contro l'infrastruttura di produzione, operazione esplicitamente fuori scope per questo ticket ("non modificare il database remoto"). Sono quindi documentate come precondizioni operative esplicite nel Runbook aggiornato, non come controlli automatici nel runner.

---

## Verdetto

**PRODUCTION MIGRATION LEDGER ISOLATION READY**

Condizioni di blocco esplicite del ticket, verificate una per una:

| Condizione | Stato |
|---|---|
| Il runner può leggere o applicare le migrazioni legacy | **NO** — legge esclusivamente `supabase/migrations_production_safe/`; guardia `LEGACY_PATTERN` rifiuta categoricamente qualunque file in stile `00N_`, verificato con test diretto |
| 001/002/003 possono ancora essere interpretate automaticamente | **NO** — strutturalmente impossibile con questo meccanismo (vedi test sopra); inoltre ora sono documentate con il contenuto SQL esatto e reale, non solo sospette |
| Non esiste controllo hash | **FALSO** — SHA-256 per file, verificato in ledger, con blocco automatico su mismatch (Scenario 3) |
| Non esiste stop su errore | **FALSO** — verificato (Scenario 5): interruzione immediata al primo errore, nessun file successivo processato |
| Non è stato provato sul clone | **FALSO** — tutti i 7 scenari richiesti più la guardia anti-legacy sono stati eseguiti ed hanno superato il test su un clone locale reale dello schema remoto |

La catena C resta quella già verificata in `PRODUCTION_SAFE_MIGRATION_CHAIN.md` (verdetto **PARTIAL** per la collisione 001/002/003 non ancora *risolta* — non è compito di questo ticket risolverla, solo isolarne il rischio). Questo ticket **isola** con successo la nuova catena da quella collisione: il meccanismo di applicazione è ora strutturalmente incapace di essere influenzato da A/B, indipendentemente da quando/se A/B verranno mai riconciliati. Le due condizioni residue per un deploy reale (backup verificato, restore test eseguito) restano gate organizzativi espliciti nel Runbook, non tecnicamente parte di "isolamento del ledger" — motivo per cui il verdetto di *questo* ticket è READY pur restando `PRODUCTION_SAFE_MIGRATION_CHAIN.md` a PARTIAL sul piano più ampio del deploy.
