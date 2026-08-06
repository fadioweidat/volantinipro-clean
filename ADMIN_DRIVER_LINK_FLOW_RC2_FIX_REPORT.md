# Admin Driver Link Flow — RC2-FIX-1 Report

Worktree: `D:\cloaude volantini\volantinipro-rc2-clean` (nuovo, isolato, HEAD detached da `2b2fa8e` — il worktree originale `volantinipro-release-rc-2026-08-06`, contaminato da attività concorrente, **non è stato toccato**). Nessuna migrazione applicata al database remoto reale. Nessun push Git. Nessun tag creato.

Commit locali (in ordine): `0dd9409` (migrazione), `afb445b` (frontend), `3ca2994` (test), `f26cde3` (documentazione).

## Fase 1-2 — Worktree isolato e porting controllato

Nuovo worktree verificato pulito (HEAD `2b2fa8e`, `git status --short` vuoto, nessun `.env`/backup/artefatto, nessun processo Vite/agent puntato su questa directory al momento della creazione).

| File | Diff | Motivo | Accettato |
|---|---|---|---|
| `src/pages/admin/AssignWork.jsx` | Copiato invariato da `feat/ai-foundation` | Componente React autonomo, nessuna dipendenza da routing specifico | Sì |
| `src/pages/admin/CampaignAssignments.jsx` | Copiato invariato | Idem | Sì |
| `src/pages/driver/DriverAssignmentPage.jsx` | Copiato + **riscritta** la sezione foto | L'import `photo-proof.js` non esiste in questo worktree (architettura foto diversa); sostituito con il componente `PodCapture` già usato da `TrackingPage.jsx` | Sì, con modifica necessaria |
| `src/lib/services/admin-api.js` | Append delle funzioni RPC, **senza** la chiamata `logAuditEvent` dell'originale | L'audit è già gestito server-side nelle RPC; `logAuditEvent` client-side è disabilitato per design in questo progetto (P0 security hardening) e le nuove azioni non sono comunque nella sua whitelist | Sì, con adattamento |
| `src/lib/services/admin-api.js` (`getAssignedZones`) | Portata invariata | Dipendenza pre-esistente mancante in questo worktree, richiesta da AssignWork/CampaignAssignments | Sì |
| `src/main.jsx` | Route driver aggiunta seguendo il pattern esistente (regex inline) | Coerente con `TrackingPage`/`DriverCoverageMap`/`CampaignTracking` già presenti | Sì |
| `src/app/routeResolution.js` | **Nuove righe**, non presenti nell'originale | Questo worktree usa un router a token (`routeResolution.js` → `AppRouter.jsx`), non il regex-matching inline di `feat/ai-foundation`; necessario per far funzionare le nuove pagine admin | Sì, scritto da zero per l'architettura reale |
| `src/app/AppRouter.jsx` | **Nuove righe**, non presenti nell'originale | Idem — import + branch `goTo()` + blocchi di render per i nuovi token `admin-assignments:`/`admin-assignments-new:` | Sì, scritto da zero |
| `src/pages/admin/CampaignGroups.jsx` | +2 link di navigazione, stesso pattern `<a href>` già in uso | Coerente con lo stile esistente del file (diverso da quello di `feat/ai-foundation`, ma stesso pattern `<a href>`) | Sì |
| `package.json` | +1 file allo script `test` | Necessario per eseguire i nuovi test | Sì |
| `tests/admin_assignment_flow.test.mjs` | Copiato dal worktree `volantinipro-release-rc-2026-08-06` (dove era stato depositato durante la contaminazione), poi **corretto** in 3 punti | Test unitari puri (nessuna dipendenza DB), verificati innocui nell'audit forense; le assertion sul testo SQL erano scritte contro la versione scartata della migrazione | Sì, con correzioni |

**Non portato**: `supabase/migrations/037_admin_assignment_rpc.sql` (legacy, resta locale, mai incluso nella catena production-safe), qualunque scrittura manuale nel ledger, report/script temporanei (`deploy_report_*.json`, `test_e2e_db.mjs`) trovati nel worktree contaminato durante l'audit.

## Fase 3 — Schema remoto reale (source of truth)

Verificato via `pg_catalog`/`information_schema` diretto (sola lettura, 2026-08-06):

| Tabella | Colonne reali usate |
|---|---|
| `operator_profiles` | `user_id` (non `id`), `display_name`, `active` (booleano, non `status` testuale), `disabled_at`, `created_at`, `updated_at`. **Nessuna colonna `phone`/`metadata`.** |
| `profiles` | `id` (= `auth.users.id`), `full_name`, `phone`, `company_name`, `role`, `created_at`, `updated_at`. Telefono/nome operatore letti da qui via `LEFT JOIN profiles.id = operator_profiles.user_id` — mai inventati; se assenti, `null` (il client mostra "dato non disponibile"). |
| `operator_assignments` | `id`, `operator_id`, `campaign_id`, `group_id` (**NOT NULL** — scoperto durante il test funzionale, non documentato nella versione precedente), `status`, `starts_at`, `ends_at`, `revoked_at`, `created_by`, `created_at`, `updated_at`, `zone_id`, `metadata`. |
| `campaigns` | `id`, `status`, `title`, e altre — usate solo per validare l'esistenza e leggere il titolo. |
| `assigned_zones` | `id`, `campaign_id`, `group_id`, `driver_id`, `label`, `target_km`, `target_poi`, `geom`, `created_at` — tabella preesistente, non correlata a `operator_assignment_zones` (nuova). |
| `delivery_sessions` | `driver_id`, `driver_name`, `driver_phone`, `device_id`, `assignment_id`, `campaign_zone_id`, `status`, `started_at`, `paused_at`, `ended_at`, `metadata`. |
| `audit_log` | `id`, `created_at`, `actor_id` (non `admin_id`), `actor_email`, `action` (whitelist chiusa via CHECK — estesa in questa migrazione), `resource_type`, `resource_id` (**text**, non uuid), `metadata`, `success` (NOT NULL), `error_message`, `user_agent`. |
| `auth.users` | `id`, `email` — verificato per i fixture di test. |

Nessuna colonna inventata: ogni riferimento nella nuova migrazione è stato verificato contro questo elenco prima di scrivere l'SQL.

## Fase 4-6 — Nuova migrazione, zone, RPC corrette

`supabase/migrations_production_safe/20260806150009_admin_driver_assignment_flow.sql` — riscritta integralmente. Requisiti soddisfatti (verificati per esecuzione reale, non per lettura del codice):

- Nessuna scrittura nel ledger (rimossa la sezione "self-registration" della versione precedente).
- Idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE`, riapplicazione via runner → tutti `[SKIP]`.
- `SECURITY DEFINER` + `SET search_path = public, pg_temp` su tutte le 8 funzioni.
- `REVOKE ALL ... FROM public, anon, authenticated` seguito da `GRANT EXECUTE ... TO authenticated` — mai accesso `anon`.
- Controllo Admin reale (`public.jwt_is_admin()`), mai bypassabile lato client.
- Validazione `campaign_id` (esistenza reale in `campaigns`).
- Validazione `operator_id` contro `operator_profiles.user_id` + `active = true` + `disabled_at is null`.
- Validazione `starts_at < ends_at`.
- **Assegnazioni sovrapposte impedite**: nuovo controllo esplicito (intervallo semi-aperto) — comportamento diverso e più restrittivo della versione precedente, che le permetteva deliberatamente. Testato: creazione di una seconda assegnazione attiva sovrapposta per lo stesso operatore/campagna → rifiutata con errore chiaro.
- `operator_id`/`campaign_id` protetti da update (rifiutati esplicitamente se presenti nel patch).
- Audit log creato per create/update/revoke — **verificato scrivere realmente** (la versione precedente falliva sempre silenziosamente per un nome di colonna sbagliato; corretto e confermato con una query diretta su `audit_log` dopo ogni operazione).
- Nessuna modifica a GPS preesistente eccetto l'estensione mirata di `gps_transition_session` (Fase 7 sotto) — `gps_start_session`, `gps_assignment_is_valid` e tutte le altre RPC GPS **non toccate**.
- Nessun riferimento a `geo_nil_milano`.

`operator_assignment_zones`: tabella creata con `id`, `assignment_id`, `zone_id` nullable (FK `campaign_zones`), `municipality_code` nullable, `municipality_name`, `quantity`, `created_at`; indici su `assignment_id`/`zone_id`; unique parziali per evitare duplicati; RLS con `FORCE ROW LEVEL SECURITY`; policy `oaz_admin_all` (gestione admin) e `oaz_operator_read_own` (lettura solo della propria assegnazione via `operator_assignments.operator_id = auth.uid()`).

**Nota sul frontend**: `AssignWork.jsx`/`CampaignAssignments.jsx` (portati invariati) continuano a salvare comuni/zone/quantità nel campo `metadata` JSONB di `operator_assignments`, non nella tabella strutturata `operator_assignment_zones` — quest'ultima è disponibile (RPC `admin_set_assignment_zones`/`list_assignment_zones` funzionanti e testate) ma non ancora consumata dall'interfaccia attuale. Non è un difetto di questo fix (il frontend non è stato riscritto, solo portato), ma un lavoro futuro se si vuole migrare dal salvataggio in `metadata` alla tabella strutturata.

RPC implementate e testate realmente (8, non 7 — rinominata `admin_get_assignment_zones` in `list_assignment_zones` e aggiunta `get_driver_assignment`):
`admin_list_operators`, `admin_list_campaign_assignments`, `admin_create_operator_assignment`, `admin_update_operator_assignment`, `admin_revoke_operator_assignment`, `get_driver_assignment`, `list_assignment_zones`, `admin_set_assignment_zones`.

## Fase 7 — Semantica revoca sessione attiva

Regola implementata e verificata con un test reale end-to-end (start sessione → pausa → revoca admin → tentativo resume → tentativo complete):

| Comportamento | Verificato |
|---|---|
| Revoca blocca nuove sessioni | ✅ — invariato, già garantito da `gps_assignment_is_valid()` (non modificata) |
| Revoca blocca Pausa → Riprendi | ✅ — `gps_transition_session` (CREATE OR REPLACE) ora rifiuta `resume` con errore dedicato `ASSEGNAZIONE_REVOCATA` se l'assegnazione è revocata |
| Sessione già attiva può solo essere terminata | ✅ — `complete`/`cancel` restano permessi anche dopo la revoca, per permettere al driver di chiudere pulitamente |
| Nessun nuovo Resume | ✅ — stesso meccanismo sopra |
| Admin vede stato `revoked_pending_stop` | ✅ — `admin_revoke_operator_assignment` marca `metadata._revoked_pending_stop = true` se esisteva una sessione `started`/`paused` al momento della revoca; verificato con una revoca reale su una sessione attiva |
| Audit log presente | ✅ — verificato con query diretta su `audit_log` dopo la revoca |

## Fase 8 — Test migrazione su clone reale

Container Postgres 17.6 usa-e-getta, caricato con lo schema remoto reale (`remote_baseline_schema.sql`), **mai il database remoto**.

| Controllo | Esito |
|---|---|
| Catena `150001`-`150008` + nuova `150009` | ✅ tutte applicate senza errori |
| `--dry-run` (rollback completo) | ✅ nessun oggetto persistito dopo il dry-run |
| `--apply` | ✅ tutte con successo, incluse le 3 iterazioni di correzione durante il test (bug `group_id` NOT NULL, bug `audit_log.action` whitelist, bug ambiguità colonna `id` in `get_driver_assignment`) |
| Verifica ledger | ✅ 8 righe `success` in `public.volantinipro_release_migrations` |
| Seconda `--apply` | ✅ tutti `[SKIP]`, hash identico |
| Hash coerente | ✅ |
| `geo_nil_milano` (struttura) | ✅ nessuna migrazione la referenzia |
| Nessuna regressione RPC NIL | ✅ nessuna funzione NIL toccata da questa catena |

## Fase 9 — Test funzionali (RPC layer, con dati isolati poi non ripuliti dal container usa-e-getta distrutto a fine sessione)

**Ambito di questa verifica**: test automatici via `psql` diretto contro le RPC reali (stesso percorso di codice che il frontend chiamerebbe via `supabase.rpc(...)`), **non** un click-through manuale nel browser sull'interfaccia React. Il build passa e le route sono cablate correttamente, ma non è stata eseguita una sessione di test E2E in un vero browser in questo ciclo — vedi limitazione dichiarata in fondo.

| Scenario | Esito |
|---|---|
| Admin: crea campagna/operatore di test, crea assegnazione | ✅ |
| Admin: seleziona operatore attivo (lista corretta, esclude inattivo) | ✅ |
| Admin: quantità/date/gruppo (auto-risolto se non specificato) | ✅ |
| Admin: modifica scadenza | ✅ (RPC `admin_update_operator_assignment`, testata) |
| Admin: revoca | ✅ |
| Driver: apre il proprio link/assegnazione (`get_driver_assignment`) | ✅ |
| Driver: nessuna esposizione di lavori altrui | ✅ — operatore diverso → `Accesso negato` |
| Driver: Start/Pausa/Riprendi/Termina | ✅ — testato l'intero ciclo incluso il blocco post-revoca |
| Sicurezza: driver diverso respinto | ✅ |
| Sicurezza: utente non autenticato respinto | ✅ |
| Sicurezza: non-admin (cliente) non può chiamare `admin_list_operators` | ✅ |
| Sicurezza: assegnazione duplicata sovrapposta respinta | ✅ |
| Sicurezza: date invalide respinte | ✅ |
| Sicurezza: operatore inattivo respinto | ✅ |

Dati di test rimossi automaticamente con la distruzione del container Docker usa-e-getta a fine sessione (`docker rm -f`) — mai su un database persistente, mai sul remoto.

## Fase 10 — Pipeline

| Comando | Esito |
|---|---|
| `npm ci` | Riuscito |
| `npm test` | **280/280 passati** (243 baseline + 37 nuovi in `admin_assignment_flow.test.mjs`) |
| `npm run build` | Riuscito (1 warning benigno su import dinamico/statico di `supabaseClient.js`, non un errore) |
| `git diff --check` | Nessun errore |

Nessuna contraddizione tra il report e `package.json`: lo script `test` include esplicitamente `tests/admin_assignment_flow.test.mjs`.

## Fase 11 — Proposta RC2

3 commit locali creati (ordine: migrazione → frontend → test → documentazione). **Nessun tag creato.**

Tag proposto: **`volantinipro-rc2-2026-08-06`**, da puntare sul commit finale di questo worktree (`f26cde3` al momento di questo report). Richiede autorizzazione esplicita per la creazione, come richiesto dal ticket.

## Limitazioni dichiarate

- **Nessun test E2E in browser reale** eseguito in questo ciclo — solo test automatici (unit + RPC diretta via `psql`). Il build passa e le route sono verificate cablate correttamente, ma un click-through manuale sull'interfaccia (Admin crea assegnazione → copia link → apre come Driver → Start/Pausa/Termina nel browser) non è stato eseguito.
- `AssignWork.jsx`/`CampaignAssignments.jsx` continuano a usare `metadata` JSONB per comuni/zone/quantità invece della tabella strutturata `operator_assignment_zones` (disponibile ma non consumata dal frontend portato).
- Il worktree `feat/ai-foundation` (origine dei file `.jsx` portati) contiene ancora lavoro non committato proprio, incluso un tocco alla migrazione legacy `008_postal_areas_milano.sql` — fuori scope di questo ticket, non toccato.

## Verdetto

**RC2 ADMIN DRIVER LINK FLOW PARTIAL**

Motivazione: tutti i requisiti tecnici del ticket sul livello dati/RPC (schema reale come source of truth, migrazione riscritta e verificata per esecuzione reale contro un clone dello schema remoto vero, zone strutturate, 8 RPC corrette e testate con dati reali inclusi i casi di sicurezza, semantica di revoca esplicita e verificata end-to-end, porting controllato con adattamento all'architettura reale del worktree, pipeline pulita — 280/280 test, build OK) sono soddisfatti con evidenza diretta, non teorica.

Il verdetto **non è PASSED** perché la Fase 9 del ticket richiede esplicitamente "test automatici **e browser reali**" — solo la parte automatica è stata eseguita in questo ciclo (test unitari + chiamate RPC dirette via `psql`, lo stesso percorso di codice che il browser chiamerebbe, ma non un click-through reale nell'interfaccia). Data la ragione stessa per cui questo ticket esiste — un verdetto PASSED dichiarato in precedenza senza verifica reale, poi smentito da un audit forense — non è corretto derubricare questa mancanza a semplice "limitazione di ambito" e dichiarare comunque PASSED: è un passo esplicitamente richiesto dal ticket, non ancora eseguito.

Il verdetto **non è FAILED** perché nessun difetto noto rimane aperto in tutto ciò che è stato effettivamente verificato — ogni bug reale trovato durante lo sviluppo (schema `operator_profiles`, `group_id` NOT NULL, whitelist `audit_log.action`, ambiguità colonna in `get_driver_assignment`) è stato corretto e ri-verificato.

**Cosa serve per passare a PASSED**: un ciclo di test E2E in un browser reale (Admin crea assegnazione → copia/apre il link → Driver esegue Start/Pausa/Riprendi/Termina → Admin vede lo stato aggiornato) contro un ambiente con il frontend di questo worktree servito realmente e collegato a un clone/ambiente di sviluppo con il database aggiornato con la catena `150001`-`150009`.
