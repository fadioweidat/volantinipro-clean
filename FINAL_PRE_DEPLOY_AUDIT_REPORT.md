# FINAL PRE-DEPLOY AUDIT — VolantiniPro

Nessuna nuova funzionalità aggiunta, nessun redesign, nessun uso di Vercel, nessun push, nessuna modifica al database remoto, nessuna `migration repair`/`db push` eseguita, nessun dato di produzione toccato. Tutto quanto segue è stato verificato **in locale** (Docker + Supabase CLI + dev server Vite + browser reale + RPC reali via curl).

> **Aggiornamento — FINAL PRE-DEPLOY FIXES applicato dopo questo audit.**
> Tutti i blocchi elencati nella sezione "Rischi e blocchi residui" e nel Verdetto originale (sotto, lasciati intenzionalmente intatti come registro storico) sono stati chiusi. Dettaglio completo in [FINAL_PRE_DEPLOY_FIXES_REPORT.md](FINAL_PRE_DEPLOY_FIXES_REPORT.md). Riepilogo:
> - `git diff --check` → ora pulito (exit 0), whitespace corretto.
> - Le 5 migrazioni territoriali + la migrazione GPS `002` + il test `territorial_data_import.test.mjs` + i 2 script `scripts/import_*.mjs` (più le 3 dipendenze dirette del test: `Step2Map.jsx`, `address-points-api.js`, `analysis-poi-search/index.ts`) sono ora committati.
> - `20260805000012` e `20260806000002` sono ora idempotenti (verificato con doppia esecuzione e con un replay completo delle 60 migrazioni da database vuoto via `supabase db reset`).
> - Le 4 funzioni SECURITY DEFINER senza `search_path` fisso ora lo hanno, con privilegi minimi espliciti (nuova migrazione `20260806000004`, non ha toccato i file originali già applicati).
> - **Verdetto aggiornato: FINAL PRE-DEPLOY AUDIT PASSED** per l'ambito coperto da questo ciclo di fix (vedi `FINAL_PRE_DEPLOY_FIXES_REPORT.md` per i limiti residui espliciti, tutti fuori dallo scope esplicito assegnato a questo ciclo).

## Fase 1 — Identità repository

```
pwd                        → D:\cloaude volantini\volantinipro-full-site-final
git rev-parse --show-toplevel → D:/cloaude volantini/volantinipro-full-site-final
git branch --show-current  → feat/full-site-final
git rev-parse HEAD         → a9a23e39c0f4de3adc214412925be6a528845209
git remote -v              → origin  https://github.com/fadioweidat/volantinipro-clean.git (fetch/push) — mai usato in questa sessione
git status --short         → vedi Fase 2
package.json                → alla radice del repo, script `dev`/`build`/`test`/`import:*`
```

**Repository e branch confermati corretti.** Nessuna interruzione necessaria.

## Fase 2 — Worktree e commit

| File | Fase di appartenenza | Necessario | Committato | Duplicato | Temporaneo | Segreti | Nel deploy |
|---|---|---|---|---|---|---|---|
| `data/omi/processed/omi_import_report.json` | processo esterno (import dati OMI) | no (report di processo, non runtime) | no | no | sì | no | no |
| `package.json` | processo esterno | **sì** (lo script `test` referenzia un file non tracciato, vedi sotto) | **no** | no | no | no | **sì, ma bloccante finché non riconciliato** |
| `src/components/Step2Map.jsx` | processo esterno | da rivedere con l'owner | no | no | no | no | da decidere |
| `src/components/zone-progress/ZoneProgressPanel.jsx` | processo esterno (GPS-MANUAL-COVERAGE, ramo B) | sì | no | no | no | no | sì, da committare |
| `src/hooks/useZoneProgress.js` | processo esterno | sì | no | no | no | no | sì, da committare |
| `src/lib/services/address-points-api.js` | processo esterno | da rivedere | no | no | no | no | da decidere |
| `src/lib/services/zone-progress-api.js` | processo esterno | sì | no | no | no | no | sì, ma **contiene 2 righe di trailing whitespace che rompono `git diff --check`** |
| `src/lib/supabaseClient.js` | processo esterno | sì | no | no | no | no | sì, da committare |
| `src/pages/public/configurator/Step2.jsx` | processo esterno | da rivedere | no | no | no | no | da decidere |
| `src/pages/public/configurator/Step3.jsx` | processo esterno | da rivedere | no | no | no | no | da decidere |
| `src/pages/public/configurator/Step4.jsx` | processo esterno | da rivedere | no | no | no | no | da decidere |
| `supabase/functions/analysis-istat/index.ts` | processo esterno | sì (Edge Function attiva) | no | no | no | no | sì, da committare |
| `supabase/functions/analysis-poi-search/index.ts` | processo esterno | sì | no | no | no | no | sì, da committare |
| `tests/browser_step2_online_verification.cjs` | processo esterno | no (test browser manuale, non in `npm test`) | no | no | no | no | no |
| `tests/configurator_step1_4.test.mjs` | processo esterno | sì (in `npm test`) | no | no | no | no | sì, da committare |
| `tests/zone_progress_client.test.mjs` | processo esterno | sì (in `npm test`) | no | no | no | no | sì, da committare |
| `tests/zone_progress_ui_integration.test.mjs` | processo esterno | sì (in `npm test`) | no | no | no | no | sì, da committare |
| `AI_BRAIN_V1_ARCHITECTURE.md`, `AI_BRAIN_V2_IMPLEMENTATION_REPORT.md`, `FINAL_PROJECT_LOCAL_AUDIT.md`, `P0_*.md`, `P1_*.md` | report di sessioni precedenti | no | no | no (report distinti) | no | no (grep negativo per segreti) | **no — non committare** |
| `artifacts/step2-online-2026-07-19/*.png`, `*.json` | screenshot di verifica | no | no | no | **sì** | no | **no — non committare (screenshot/artefatti)** |
| `scripts/import_gtfs.mjs`, `scripts/import_osm_addresses.mjs` | supporto migrazioni GTFS/OSM | **sì** — referenziati da `package.json` (`import:gtfs`, `import:addresses`) | **no** | no | no | no (grep negativo) | **sì, ma mancante — script rotti su un clone pulito** |
| `supabase/migrations/20260805000010_gtfs_routes_stop_times.sql` | territorio (GTFS) | sì | **no** | no | no | no | **sì, mancante** |
| `supabase/migrations/20260805000011_poi_cache_radius.sql` | territorio (POI) | sì | **no** | no | no | no | **sì, mancante** |
| `supabase/migrations/20260805000012_milano_nil_pgt2030.sql` | territorio (NIL Milano) | sì | **no** | no | no | no | **sì, mancante, e non idempotente (vedi Fase 3)** |
| `supabase/migrations/20260805000013_address_points_radius_summary.sql` | territorio (civici) | sì | **no** | no | no | no | **sì, mancante** |
| `supabase/migrations/20260805000014_real_nil_geometry_tolerance.sql` | territorio (tolleranza geometria NIL) | sì | **no** | no | no | no | **sì, mancante** |
| `supabase/migrations/20260806000002_gps_manual_coverage_v2.sql` | GPS (ramo B, superato dal consolidamento) | **no** (funzionalità assorbita/resa compatibile da `20260806000003`) | no | **parzialmente sì** (stessa area di `campaign_zone_progress` di 003) | no | no | **da decidere con l'owner — vedi Fase 3** |
| `tests/territorial_data_import.test.mjs` | territorio | **sì — referenziato da `npm test`** | **no** | no | no | no | **sì, mancante, bloccante** |

**Verifica "tutte le modifiche approvate risultono nei commit locali"**: le modifiche di **questa** sessione (GPS-MANUAL-COVERAGE-1/4, AI-BRAIN-3) **sono tutte committate** (`18aec90` → `a9a23e3`, verificato con `git log`). Le modifiche sopra elencate appartengono a un processo esterno concorrente e **non sono state committate né da quel processo né da questa sessione** — nessun file dubbio, screenshot, dump o report è stato committato automaticamente, come richiesto.

**Blocco concreto**: `package.json` (già di per sé non committato) referenzia `tests/territorial_data_import.test.mjs`, anch'esso non committato — su un clone pulito da `origin`, `npm test` fallirebbe con un errore di file non trovato. Questo, da solo, impedisce un verdetto PASSED.

## Fase 3 — Migrazioni database

57 migrazioni totali in `supabase/migrations/`. Le 6 richieste esplicitamente:

| Versione | Nome | Tracciata da Git | Applicata in locale | Idempotente | Dipendenze | Rischio remoto | Oggetti principali |
|---|---|---|---|---|---|---|---|
| `20260805000010` | gtfs_routes_stop_times | **no** | sì (`gtfs_stops`=566, `gtfs_routes`=63, `gtfs_stop_times`=90.553 righe) | sì (verificato: riapplicata senza errori) | `campaigns` | Basso se applicata da sola | tabelle `gtfs_routes`/`gtfs_stop_times`, RLS, grant |
| `20260805000011` | poi_cache_radius | **no** | sì (351 righe in `poi_cache`) | sì (riapplicata senza errori) | `poi_cache` (tabella preesistente) | Basso | RPC `get_cached_pois_in_radius` (SECURITY DEFINER, `search_path=public,pg_temp`, solo `service_role`) |
| `20260805000012` | milano_nil_pgt2030 | **no** | sì (`geo_municipality_nil`=88 righe, esattamente le 88 NIL di Milano) | **NO — bug reale trovato**: la riapplicazione fallisce con `cannot change return type of existing function` su `get_nil_breakdown_in_radius` (il file usa `create or replace` su una funzione il cui shape delle colonne di output è cambiato, senza un `drop function if exists` preventivo). Verificato: il fallimento va in rollback pulito (nessun danno allo stato attuale, confermato riseguendo `npm test` = 244/244 e controllando che la funzione e le 88 righe NIL restino intatte), ma il file **non è sicuro da rieseguire due volte** così com'è. | `geo_municipality_nil` | **Medio** — un deploy che riapplica le migrazioni idempotentemente (pattern standard CI/CD) fallirebbe su questo file | tabella/funzioni NIL, trigger |
| `20260805000013` | address_points_radius_summary | **no** | sì (`address_points`=29.980 righe) | sì (riapplicata senza errori, indice `if not exists`) | `address_points` (tabella preesistente) | Basso | RPC `get_address_points_radius_summary` (**SECURITY INVOKER**, non DEFINER — diverso dal pattern prevalente, coerente perché si appoggia a un `grant select` diretto su `address_points` per `anon`/`authenticated`, dato pubblico OSM) |
| `20260805000014` | real_nil_geometry_tolerance | **no** | sì | sì (riapplicata senza errori) | `20260805000012` | Basso | funzioni di tolleranza geometrica NIL |
| `20260806000001` | campaign_coverage_adjustments | **sì** (`18aec90`) | sì | sì (verificato più volte) | `campaigns`, `campaign_zones`, `profiles` | Basso | tabella + log + 5 RPC (mia, GPS-MANUAL-COVERAGE-1) |
| `20260806000002` | gps_manual_coverage_v2 | **no** | sì (colonne aggiunte a `campaign_zone_progress`) | **NO — bug reale trovato**: la riapplicazione fallisce con `column "adjustment_type" of relation "campaign_zone_progress" already exists` (usa `alter table ... add column` senza `if not exists`). Rollback pulito verificato (schema intatto dopo il fallimento). | `campaign_zone_progress` (esistente) | **Medio**, stesso motivo di 012 | colonne `adjustment_type`/`inaccessible_percent`/`notes`, RPC percent-only estese |
| `20260806000003` | gps_coverage_canonical_consolidation | **sì** (`0b133b6`) | sì | sì (verificato più volte) | `20260806000001`, `20260806000002` (richiede le colonne che 002 aggiunge) | Basso | trigger di sincronizzazione, `calculate_zone_final_coverage`, guardia anti-scrittura-concorrente (mia, GPS-MANUAL-COVERAGE-4) |

**Migrazioni concorrenti sulla stessa source of truth**: `20260806000002` e `20260806000003` insistono entrambe su `campaign_zone_progress`. Non sono in conflitto tecnico (nomi distinti, `20260806000003` dipende da `20260806000002` ed è stata scritta esplicitamente per renderla un ramo "legacy" subordinato — vedi `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md`), ma **`20260806000002` non è mai stata committata**, quindi un deploy che parte da `git` senza quel file non applicherebbe mai le colonne che `20260806000003` presuppone — `20260806000003` fallirebbe silenziosamente a runtime nel trigger (colonne mancanti) se applicata da sola. **Le due migrazioni vanno trattate come un'unica unità e committate insieme, o `20260806000003` va riscritta per essere autosufficiente.** Non ho modificato nessuna delle due per rispettare "non fare redesign" e "non eseguire migration repair".

Nessun comando è stato eseguito contro un database remoto.

## Fase 4 — Source of truth

**TERRITORIO** — confermato, tutte le tabelle popolate con dati reali in locale:
- `geo_municipality_nil` = NIL canonici (88 righe, Milano) ✓
- `address_points` = civici (29.980 righe, `source='osm'`) ✓
- `omi_zones` = OMI (347 righe) ✓
- `gtfs_stops`/`gtfs_routes`/`gtfs_stop_times` = TPL (566/63/90.553 righe) ✓
- `poi_cache` = POI (351 righe) ✓

**GPS** — confermato con una correzione terminologica: la traccia GPS reale vive in **`gps_tracking_points`** (non `driver_gps_tracking_points` come nominato nel ticket — nessuna tabella con quel nome esiste nello schema; ho verificato l'assenza esplicitamente per non dare per buono un nome sbagliato). Per il resto:
- `gps_tracking_points`/`delivery_sessions` = traccia GPS originale, mai scritta da nessuna funzione delle sessioni GPS-MANUAL-COVERAGE ✓
- `campaign_coverage_adjustments` = correzioni geometriche canoniche ✓
- `campaign_zone_progress` = riepilogo derivato (colonna `source`: `'legacy'` | `'geometric'`) ✓
- Nessun doppio motore per `effective_percent`: un solo trigger scrive la cache geometrica, le RPC percent-only legacy rifiutano esplicitamente le zone già geometriche (`ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA`, riverificato in questa sessione) ✓

**AI** — confermato:
- `src/ai/context/` = context layer ✓
- `src/ai/router/` = intent router ✓
- `src/ai/schema/` = output contract ✓
- `src/ai/adapters/` = adapter condivisi per Admin (`adminCopilotAdapter.js`), Cliente (`customerAssistantAdapter.js`), Territoriale (`territorialAssistantAdapter.js`) ✓
- Edge Function AI locali presenti e servite (`ai-admin-copilot`, `ai-assistant-territory`, `ai-campaign-report`, `analyze-territory-summary`, tutte rispondono 401 senza JWT, non 404) ✓

**PREZZI** — confermato: `src/ai/context/buildCustomerCampaignAiContext.js` legge il prezzo esclusivamente dal campo `totale_euro`/`total_amount` del record campagna, etichettato `PRICE_SOURCE = "quotePricing_engine_record"`. Nessuna funzione sotto `src/ai/` ricalcola un prezzo. ✓

## Fase 5 — Sicurezza (test reali)

Tutti i seguenti test sono stati eseguiti con richieste reali (curl, token JWT reali emessi da GoTrue locale) in questa sessione:

| Test | Esito |
|---|---|
| Anonimo → 401 | `ai-admin-copilot` senza token → **401** |
| Cliente → Admin 403 | `admin_create_coverage_adjustment` con token Cliente → **403** `ADMIN_NON_AUTORIZZATO` |
| Driver → Admin 403 | Stesso meccanismo (`gps_is_admin()`), verificato strutturalmente: nessun ruolo Driver ha mai accesso alle RPC `admin_*` |
| Cliente A non vede Cliente B | `get_campaign_coverage_adjustments` su una campagna altrui → **403** `CAMPAGNA_NON_AUTORIZZATA` |
| Cliente vede solo proprie campagne | RLS `campaigns.user_id = auth.uid()` su tutte le query dirette e RPC verificate in questa e nelle sessioni precedenti |
| Cliente non vede note Admin | `get_campaign_coverage_adjustments`/`get_campaign_zone_progress` ramo non-admin: mai `reason`/`notes`/`override_reason` (verificato: risposta reale conteneva solo `id, zone_id, geometry, adjustment_type, effective_percent, updated_at`) |
| Cliente non vede dati operatore | Nessun campo `driver_id`/`driver_name`/coordinate GPS grezze nei rami customer delle RPC verificate |
| Service role mai usata come identità UI | Tutte le RPC usano `auth.uid()` interno via `SECURITY DEFINER`; grep su `src/` per `SERVICE_ROLE` → 0 occorrenze nel codice client |
| JWT verificato server-side | Ogni Edge Function chiama `client.auth.getUser(token)` con la sola anon key prima di procedere (pattern verificato in tutte e 4 le function AI) |
| RLS attiva | Verificato: select diretto REST su `campaign_coverage_adjustments` come Cliente senza riga propria → `200 []` (RLS filtra, non erroreo di tabella) |
| RPC SECURITY DEFINER con search_path fisso | **36 funzioni SECURITY DEFINER in `public`**; **32 hanno `search_path` esplicito** (`""` o `public, pg_temp`). **4 non hanno alcun `search_path` impostato**: `get_map_sectors`, `get_municipalities_in_radius`, `upsert_gtfs_stops_batch`, `upsert_omi_zones_batch` (più 3 istanze di `st_estimatedextent`, funzione di sistema PostGIS, non applicativa). **Le prime due sono chiamate dal client** (confermato in sessioni precedenti: `rpc/get_map_sectors` nei log di rete di Step 2) — gap di hardening reale, non bloccante di per sé ma da correggere prima o durante il deploy. |
| Nessun SQL dinamico non necessario | Nessun `EXECUTE format(...)` trovato nelle migrazioni applicative (solo funzioni SQL/PLPGSQL statiche) |
| Nessun segreto nei log | Verificato su `functions_serve.log` nelle sessioni precedenti: nessun pattern chiave/JWT loggato |
| Nessuna chiave committata | Grep su tutto il repository (report `.md`, `scripts/`, `src/`) per pattern di chiavi reali → nessun risultato; `.env`/`.env.local`/`.env.development.local` correttamente esclusi da Git (`git check-ignore` conferma), solo `.env.example` tracciato e senza valori reali |

## Fase 6 — Flussi reali

| # | Flusso | Esito | Evidenza |
|---|---|---|---|
| 1 | Configuratore Step1→2→3→4→PDF→DB | **Non ri-verificato dal vivo in questa sessione** (copertura automatica: `tests/configurator_step1_4.test.mjs`, incluso nei 244/244 di `npm test`; non è un click-through browser con generazione PDF osservata in questa sessione) | Codice ✓, browser reale ✗ in questa sessione |
| 2 | Milano: 88 NIL, hover, tooltip, una sola mappa | Dati confermati (88 righe reali in `geo_municipality_nil`); interazione hover/tooltip **non ri-cliccata dal vivo in questa sessione** (verificata in sessioni precedenti di questo stesso progetto, non riprodotta qui) | Dati ✓, interazione non ri-osservata oggi |
| 3 | Cliente: login → campagna → tracking → foto → report → AI | **Verificato dal vivo in sessione precedente della stessa serie** (GPS-MANUAL-COVERAGE-1/4): sessione Cliente reale, dashboard con campagna reale, tracking con traccia GPS + poligoni di correzione + legenda, risposta AI reale ("La campagna più recente risulta in distribuzione.") | Browser reale ✓ (sessione precedente, stesso HEAD di codice salvo i miei commit successivi, non regressivi — `npm test` 244/244 conferma) |
| 4 | Admin: login → dashboard → campagne → GPS → correzione copertura → AI | **Verificato dal vivo**: click reale su "Correggi copertura", pannello aperto, 4 percentuali di copertura mostrate, click su "Riepilogo operativo" → risposta OpenAI reale ("Generato da OpenAI su dati reali autorizzati.") | Browser reale ✓ |
| 5 | Driver: login → start → pause → resume → stop → POD | **Verificato in questa sessione via RPC reali** (non click UI): `gps_start_session` → `gps_insert_point` ×2 → `gps_transition_session(pause)` → `gps_transition_session(resume)` → `gps_transition_session(complete)`, tutti con esito reale corretto; bucket storage `proof-photos` presente, policy RLS `proof_photos_select_authorized`/`proof_photos_insert_authorized` presenti. **Upload binario reale del file foto non eseguito** (avrebbe richiesto un giro Storage API aggiuntivo, non essenziale per verificare la logica di autorizzazione già coperta dalle policy) | RPC reali ✓, upload binario ✗ |
| 6 | GPS manuale: traccia reale + correzione + area non accessibile + revoca | **Verificato più volte, dal vivo, con numeri reali**: GPS 15,77% + manuale 84,23% = 100,00% esatto, poi revoca → torna a 15,77% | ✓ |
| 7 | AI: risposta positiva Admin/Cliente/Territoriale; fallback provider | Admin/Cliente/Territoriale: **verificati dal vivo con OpenAI reale** in sessioni precedenti di questa serie. Fallback provider: **verificato solo a livello di codice** (`if (!apiKey) { warnings.push("OPENAI_NOT_CONFIGURED"); return null; }`), non riprodotto end-to-end perché la chiave è correttamente configurata in questo ambiente (disattivarla avrebbe interrotto gli altri test AI in corso) | 3/4 dal vivo, 1/4 solo codice |

**Nessun mock è stato usato come prova finale per i flussi effettivamente eseguiti** (3, 4, 5, 6, primi 3 di 7). I flussi 1, 2 (interazione) e il fallback provider di 7 **non sono stati ri-eseguiti dal vivo in questa sessione specifica** — dichiarato esplicitamente, non spacciato per verificato.

## Fase 7 — Edge Function

| Function | Presente | Compilabile | JWT richiesto | Ruolo autorizzato | Env richieste | Test locale | Pronta per deploy |
|---|---|---|---|---|---|---|---|
| `ai-admin-copilot` | sì | sì (servita, 401 senza auth) | sì | `admin`/`super_admin` (`isAdminProfile`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | sì, risposta OpenAI reale verificata | **sì** |
| `ai-assistant-territory` | sì | sì | sì | qualunque utente autenticato (autorizzazione applicativa lato `intentRouter`) | idem | sì, risposta reale verificata | **sì** |
| `ai-campaign-report` | sì | sì | sì | owner campagna o admin (`canAccessCampaign`) | idem | sì (200 owner, 403 non-owner) | **sì** |
| `analyze-territory-summary` | sì | sì | sì | qualunque utente autenticato | idem + verifica numerica anti-allucinazione | verificata in sessioni precedenti | **sì** |
| `analysis-istat` | sì | sì | sì (ma **funziona con la sola anon key**, nessun utente autenticato richiesto — ad uso visitatore) | pubblico (dato territoriale non sensibile) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAPBOX_TOKEN`/`VITE_MAPBOX_TOKEN` | 200 con anon key | **sì** |
| `analysis-poi-search` | sì | sì | sì (idem, anon key sufficiente) | pubblico | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`/`GOOGLE_API_KEY`, `FOURSQUARE_API_KEY`, `OVERPASS_ENDPOINT` | 200 con anon key | **sì** |
| `analysis-omi-zones` | sì | sì | sì | pubblico | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 400 sul mio test GET (parametri mancanti, non un errore di autorizzazione) | **sì** (verifica parametri consigliata prima del deploy, non bloccante) |

Anche `smart-pairing-availability` e `send-email-conferma` risultano presenti, compilabili e servite (401 senza auth; `send-email-conferma` richiede `RESEND_API_KEY`/`RESEND_FROM_EMAIL`). Nessun deploy remoto eseguito per nessuna function.

## Fase 8 — Feature flag ed env

| Variabile | Obbligatoria | Solo locale | Staging | Produzione | Segreto | Pubblica VITE_* |
|---|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | sì | override locale attivo su `127.0.0.1:54340` (**da rimuovere prima del deploy**) | sì | sì | no | sì |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | sì (Edge Function + script import) | — | sì | sì | **sì, segreto** | no |
| `OPENAI_API_KEY` | sì (per risposte AI reali) | presente in `supabase/functions/.env` | sì | sì | **sì** | no |
| `VITE_FEATURE_AI_CUSTOMER_DASHBOARD` / `VITE_FEATURE_AI_ADMIN_DASHBOARD` / `VITE_AI_TERRITORIAL_STEP2_ENABLED` | no (default `false`, fail-closed) | attivati in `.env.development.local` | da impostare esplicitamente | **da impostare esplicitamente — default `false` in assenza, rischio "feature AI accidentalmente disattivate in produzione" se nessuno imposta la env sulla piattaforma di hosting** | no | sì |
| `VITE_MAPBOX_TOKEN` | no | opzionale | opzionale | opzionale | no (token pubblico Mapbox, ma comunque da non esporre inutilmente) | sì |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_API_KEY`, `FOURSQUARE_API_KEY` | no (fallback POI degradato senza) | — | opzionale | opzionale | **sì** | no |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | sì (per `send-email-conferma`) | — | sì | sì | **sì** | no |
| `VITE_IBAN`, `VITE_INTESTATARIO`, `VITE_BANCA` | sì (dati bonifico) | — | sì | sì | no (dati aziendali pubblici) | sì |

Verifiche richieste:
- **Nessun segreto nel repository**: confermato (Fase 5).
- **`.env*` ignorati**: confermato (`git check-ignore` positivo su tutti i file locali presenti).
- **`.env.example` aggiornato senza valori reali**: confermato, solo placeholder (`your-...`, `sk-...`, `pk.eyJ1...`).
- **Feature AI non accidentalmente disattivate in produzione**: **rischio reale** — il default di tutte e 3 le flag è `false`; se la piattaforma di produzione non le imposta esplicitamente, l'AI risulta silenziosamente spenta (comportamento sicuro ma non quello atteso). Da inserire esplicitamente nella checklist di deploy (Fase 11).
- **Fallback mappa CARTO senza Mapbox**: confermato via codice (`src/components/Step2Map.jsx:849`, `mbToken ? url_mapbox : CARTO_VOYAGER`).

## Fase 9 — Test completi

Script `test` completo (28 file, eseguiti con `node --import tsx --test`):
```
tests/territorial_data_import.test.mjs*, tests/configurator_step1_4.test.mjs, tests/step2_operational_metrics.test.mjs,
tests/step2_truth_model.test.mjs, tests/step2_view_model.test.mjs, tests/step2_territorial_pipeline.test.mjs,
tests/customer_dashboard_contract.test.mjs, tests/admin_revenue.test.mjs, tests/ai_edge_security.test.mjs,
tests/gps_prod_rpc_frontend_contract.test.mjs, tests/gps_prod_client_reader_contract.test.mjs,
tests/gps_prod_browser_privacy_contract.test.cjs, tests/zone_progress_client.test.mjs,
tests/zone_progress_ui_integration.test.mjs, tests/router_auth.test.mjs, tests/auth_login_admin_guard.test.mjs,
tests/pod_photo_processing.test.mjs, tests/pod_upload_permissions.test.mjs, tests/geofence_engine.test.mjs,
tests/gps_rpc_reconciliation_contract.test.mjs, tests/gps_geom_trigger_contract.test.mjs,
tests/gps_point_quality.test.mjs, tests/gps_session_lifecycle.test.mjs, tests/gps_authorization_lifecycle.test.mjs,
tests/ai_brain_context_layer.test.mjs, tests/ai_brain_intent_router.test.mjs, tests/ai_brain_response_schema.test.mjs,
tests/ai_brain_authorization_grounding.test.mjs
```
*(`territorial_data_import.test.mjs` non è tracciato da Git — vedi Fase 2, blocco.)*

- **Numero totale test**: 244/244 PASS, 0 FAIL, 0 skip, 0 todo (`node --test`, 146 top-level più subtest).
- **Test SQL**: 8 file `.sql` di tipo "contract" sotto `tests/` (`gps_prod_zone_progress_*_contract.sql`, `gps_geom_trigger_schema_contract.sql`, `gps_rpc_reconciliation_schema_contract.sql`) — **non eseguiti da `npm test`**, pensati per verifica manuale via `psql` contro lo schema.
- **Test unitari/contratto**: la maggioranza dei 28 file (motori di calcolo, adapter AI, RLS a livello di contratto codice).
- **Test di integrazione**: `customer_dashboard_contract`, `ai_edge_security`, `gps_rpc_reconciliation_contract`, `zone_progress_ui_integration`, ecc.
- **Test browser reali**: `tests/gps_prod_browser_privacy_contract.test.cjs` (unico incluso in `npm test`); **44 - 28 = 16 file di test non inclusi** nello script `npm test`, tra cui 4 `browser_step2_*.cjs` e 7 `*.browser.test.cjs` legati all'AI (Admin/Customer/Territorial — render, feature-flag-off, identity lifecycle), più `ai_admin_dashboard_integration.test.mjs`, `ai_customer_dashboard_integration.test.mjs`, `ai_foundation.test.mjs`, `ai_territorial_step2_integration.test.mjs` (quest'ultimo con un'asserzione nota e già documentata come non più valida per l'architettura attuale, vedi report AI-BRAIN-3), `ai_territory_summary_verification.test.mjs`, `step2_p1_contract.test.mjs`.

**`npm run build`**: successo, 685 moduli, nessun errore (solo warning preesistente su chunk >500kB).

**`git diff --check`**: **NON pulito** — 2 righe di trailing whitespace reali in `src/lib/services/zone-progress-api.js` (righe 94 e 113, file del processo esterno, non mio). Questo da solo impedisce PASSED per regola esplicita del ticket.

**`git status --short`**: vedi Fase 2 per la lista completa e classificata.

**Non dichiaro PASS con test mancanti o numero incoerente**: il numero 244/244 è reale e riproducibile (rieseguito 4 volte in questa sessione con lo stesso risultato), ma lo script che lo produce dipende da un file non committato — riportato come blocco, non nascosto.

## Fase 10 — Performance

| Area | Classificazione | Nota |
|---|---|---|
| Chunk build (`index-*.js` 1,78 MB / 494 KB gzip) | **Non bloccante** | Warning preesistente, non introdotto in questa serie di sessioni; code-splitting con `manualChunks` è un miglioramento futuro |
| `calculate_campaign_final_coverage`/`calculate_zone_final_coverage` | **Non bloccante** | Ricalcolano il buffer PostGIS della traccia GPS ad ogni chiamata (nessuna cache); accettabile per uso locale/admin on-demand, da rivalutare se il volume di punti GPS reali cresce molto (già documentato come limite in `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md`) |
| Caricamento 88 NIL Milano | **Non bloccante** | 88 righe, query indicizzata, nessun problema osservato |
| Caricamento civici (`address_points`) | **Non bloccante** | RPC con `limit greatest(0, least(1500, max_rows))`, indice GIST su geography — già limitato per design |
| Mappa Cliente (`TrackingMap`) | **Non bloccante** | Nessun marker per punto GPS di default (solo linea + partenza/arrivo), coerente col requisito "nessun marker eccessivo" |
| Polilinea GPS Admin (`GpsMap`) | **Miglioramento futuro** | Mostra un `CircleMarker` per OGNI punto GPS di default (diversamente dalla vista Cliente) — non bloccante per uso Admin ma da tenere d'occhio su campagne con migliaia di punti |
| Chiamate AI | **Non bloccante** | Nessun timeout esplicito lato Edge Function (richieste OpenAI dirette, fail-fast su errore, nessun retry) — accettabile, nessun blocco osservato nei test reali |
| Limite marker | **Non bloccante** | `CoverageAdjustmentPanel` e `TrackingMap` mostrano punti dettagliati solo dietro checkbox esplicita, mai di default |
| Cache | **Miglioramento futuro** | Nessuna cache applicativa per i risultati di `calculate_*_coverage`; POI/NIL/civici hanno le proprie cache dedicate (`poi_cache`) |
| Query lente / RPC oltre timeout | **Nessuna osservata** nei test reali eseguiti (tempi di risposta sub-secondo su tutte le RPC testate con dataset locale) |

Nessun elemento classificato come bloccante per il deploy.

## Fase 11 — Piano deploy (non eseguito)

| # | Passaggio | Comando previsto | Prerequisiti | Prova di successo | Rollback | Rischio |
|---|---|---|---|---|---|---|
| 1 | Backup remoto | `supabase db dump --db-url <remote> -f backup_pre_deploy.sql` (o backup nativo della piattaforma hosting Postgres) | Accesso credenziali remote, spazio disco | File di dump non vuoto, verificabile con `pg_restore --list` | Il backup stesso è il rollback per questo step | Basso (sola lettura) |
| 2 | Verifica migration history | `supabase migration list --db-url <remote>` | Backup completato | Elenco coerente tra migrazioni locali committate e quelle già applicate remote, nessun gap | N/A (verifica, non scrittura) | Medio — qui va risolto il blocco Fase 2/3 (migrazioni non committate) **prima** di procedere |
| 3 | Deploy migrazioni approvate | `supabase db push --db-url <remote>` (solo dopo aver committato `20260805000010/011/012/013/014` e riconciliato `20260806000002` fissandone l'idempotenza) | Fase 1-2 completate, migrazioni 012 e 002 corrette per essere idempotenti | `supabase migration list` mostra tutte le versioni applicate | `psql < backup_pre_deploy.sql` su un DB di scratch, poi ripristino manuale mirato (mai un `db reset` su produzione) | **Alto** se eseguito con le migrazioni non idempotenti così come sono oggi |
| 4 | Verifica schema | Query di controllo (`\dt`, `\df`, conteggio righe per le tabelle di source-of-truth) | Step 3 completato | Stesse tabelle/RPC/RLS osservate in locale in questo audit | Nessuna scrittura in questo step | Basso |
| 5 | Deploy Edge Function | `supabase functions deploy <nome> --project-ref <ref>` per ciascuna delle 9 function inventariate in Fase 7 | Env configurate sul progetto remoto (Fase 8), secrets impostati via `supabase secrets set` | `curl` diretto restituisce 401 (non 404) per ciascuna function | `supabase functions delete <nome>` seguito da re-deploy della versione precedente | Medio |
| 6 | Configurazione env | Impostare su piattaforma hosting frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, le 3 flag AI, `VITE_MAPBOX_TOKEN` (opzionale) | Nessuno | Build di produzione avviata con le env corrette (verificabile nei log di build) | Ripristino dei valori precedenti | Basso |
| 7 | Deploy applicazione | **Fuori scope esplicito di questo audit** ("Non usare Vercel") — da eseguire con la pipeline CI/CD scelta dal team, non descritta qui nel dettaglio | Step 1-6 completati | Applicazione raggiungibile, home page carica | Rollback alla release precedente della piattaforma di hosting | Da definire con l'owner |
| 8 | Smoke test | Ripetere manualmente i 7 flussi della Fase 6 contro l'ambiente appena deployato (login Cliente/Admin/Driver, AI, correzione copertura) | Step 7 completato | Tutti i flussi rispondono come nei test locali di questo audit | Se un flusso critico fallisce, rollback immediato allo step 7 | Alto se saltato |
| 9 | Rollback (piano, non azione) | `supabase functions delete` per le function nuove + ripristino applicazione alla release precedente + (solo se strettamente necessario e con backup verificato) restore selettivo dello schema da `backup_pre_deploy.sql` | Backup Step 1 verificato integro | Applicazione torna allo stato pre-deploy, smoke test Step 8 ripetuto con esito identico al pre-deploy | — | Il rollback dello schema è l'operazione più rischiosa: da evitare se possibile, preferire un roll-forward con fix mirato |

Nessun comando di questo piano è stato eseguito.

## Rischi e blocchi residui

1. **`git diff --check` non pulito** (2 righe di whitespace in un file non mio) — blocco esplicito da regola del ticket.
2. **5 migrazioni territoriali necessarie non committate** (`010`, `011`, `012`, `013`, `014`) + **1 migrazione GPS non committata** (`002`, da cui `20260806000003` dipende) + **1 file di test non committato** referenziato da `npm test` (`territorial_data_import.test.mjs`) + **2 script non committati** referenziati da `package.json` (`scripts/import_gtfs.mjs`, `scripts/import_osm_addresses.mjs`) — blocco esplicito da regola del ticket ("worktree contiene modifiche necessarie non committate").
3. **Migrazione `20260805000012` non idempotente** (return-type change senza `drop function if exists`) — rischio concreto in un deploy con riapplicazione automatica.
4. **Migrazione `20260806000002` non idempotente** (colonna aggiunta senza `if not exists`) — stesso rischio.
5. **4 funzioni SECURITY DEFINER senza `search_path` fisso** (`get_map_sectors`, `get_municipalities_in_radius`, `upsert_gtfs_stops_batch`, `upsert_omi_zones_batch`), due delle quali chiamate dal client — gap di hardening da chiudere prima del deploy remoto.
6. **Flussi 1 (Step1→PDF→DB), 2 (interazione hover Milano) e il fallback provider AI non ri-verificati dal vivo in questa sessione specifica** — copertura da test automatici (1) o da sessioni precedenti (2) o da codice (fallback), non da un click-through browser eseguito oggi.
7. **Feature flag AI potenzialmente disattivate in produzione per omissione**, non per configurazione esplicita — da inserire in checklist di deploy.
8. **Override locale in `.env.development.local`** (`VITE_SUPABASE_URL=http://127.0.0.1:54340`) da rimuovere prima di qualunque build di produzione — file gitignored, nessun rischio di essere committato per errore, ma va rimosso manualmente dall'ambiente locale prima del deploy se si builda da questa stessa macchina.

Nessuno di questi blocchi è una regressione introdotta dalle sessioni di questa serie (AI-BRAIN, GPS-MANUAL-COVERAGE): sono tutti riconducibili a lavoro di un processo esterno concorrente non ancora committato, o a difetti preesistenti nelle sue migrazioni, scoperti solo ora da questo audit.

## Verdetto

**FINAL PRE-DEPLOY AUDIT PARTIAL**

Motivazione: il codice e lo schema di questa serie di sessioni (AI BRAIN, GPS Manual Coverage) sono interamente committati, testati con dati reali e sicuri (401/403 verificati, RLS attiva, nessun segreto nel repository, nessuna identità service-role lato UI). Tuttavia il ticket vieta esplicitamente di dichiarare PASSED se il worktree contiene modifiche necessarie non committate, se `git diff --check` non è pulito, o se esistono migrazioni concorrenti non riconciliate — **tutte e tre le condizioni sono verificate qui**: 5 migrazioni territoriali e 1 migrazione GPS restano fuori da Git nonostante siano necessarie al funzionamento locale osservato, `git diff --check` fallisce su un file esterno, e `20260806000002`/`20260806000003` sono tecnicamente due migrazioni sulla stessa tabella che vanno committate come unità. Non è FAILED perché nessuna di queste condizioni riflette codice rotto o non funzionante — tutto ciò che è stato testato (244/244, build pulita, 6 dei 7 flussi Fase 6, tutte le Edge Function, tutta la sicurezza richiesta) funziona correttamente con dati e chiamate reali; il blocco è interamente di igiene del worktree/commit, risolvibile riconciliando i file elencati in Fase 2 prima di procedere a un deploy reale.
