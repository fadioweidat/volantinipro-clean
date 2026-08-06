# AI-BRAIN-3 — Local AI End-to-End Activation — Report

Base: `AI_BRAIN_V2_IMPLEMENTATION_REPORT.md` (verdetto PARTIAL). Repository: `D:\cloaude volantini\volantinipro-full-site-final`, branch `feat/full-site-final`. Nessun deploy remoto, nessun push, nessuna modifica al database remoto, nessun uso di Vercel. Tutto quanto descritto sotto è stato eseguito e verificato **in locale** (Docker + Supabase CLI + dev server Vite + browser reale) in questa sessione.

## 1. Runtime Edge Function (Fase 1)

Le 4 directory richieste esistono tutte in `supabase/functions/`:

| Function | Import principali | Env richieste | JWT verify |
|---|---|---|---|
| `ai-admin-copilot` | `@supabase/supabase-js`, `_shared/aiAuthorization.ts` (`isAdminProfile`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | sì (default CLI, nessun override in `config.toml`) |
| `ai-assistant-territory` | idem (no `_shared`) | idem | sì |
| `ai-campaign-report` | idem, `_shared/aiAuthorization.ts` (`canAccessCampaign`) | idem | sì |
| `analyze-territory-summary` | idem, `numericVerification.js` locale | idem | sì |

Avviate **solo in locale** con `supabase start` (stack Docker già presente in `supabase/config.toml`, porte dedicate 543xx, nessun project ref remoto) + `supabase functions serve --env-file supabase/functions/.env`. URL locale: `http://127.0.0.1:54340/functions/v1/<nome>`.

Verifica via curl (token reali emessi dal GoTrue locale, non simulati):

- Funzione esistente / non più 404: **confermato per tutte e 4** (`200`/`400`/`401`/`403` a seconda del caso, mai `404`).
- Anonimo respinto: **401** `{"error":"UNAUTHENTICATED"}` su tutte e 4 (con e senza anon key, senza JWT utente).
- Utente autorizzato accettato: **200** con risposta AI reale (vedi §5-6).
- Ruolo/ownership errati: **403** `FORBIDDEN` (Cliente → Admin Copilot; Cliente A → campagna di Cliente B).
- Payload non valido: **400** `INVALID_PAYLOAD` (fallback controllato, nessun crash).
- Output conforme allo schema AI condiviso: verificato (`{alerts:[...]}`, `{answer:...}`, `{summary,suggestions}`, `{summary,scoreExplanation}` come da contratto Fase 5 del V2).

## 2. Provider OpenAI (Fase 2)

- `OPENAI_API_KEY`: **presente** in `supabase/functions/.env` (164 caratteri, valore mai stampato).
- Modello: `gpt-4o-mini` (hardcoded nelle 4 function, invariato dal V2).
- Timeout: nessuno esplicito lato function (affidato al runtime Deno/fetch); retry: nessuno (fail-fast → fallback controllato via `warnings`).
- Budget: nessun limite/contatore applicativo presente (gap preesistente, non introdotto qui — vedi §11).
- Feature flag: separati dal provider, vedi §7.
- Richiesta minima reale eseguita (Admin Copilot, vedi §5): **200 OK**, risposta `status:"ai"` con alert generati realmente da OpenAI. Nessun segreto loggato (verificato su `functions_serve.log`).

## 3. Identità Territoriale (Fase 3) — 3 bug reali trovati e corretti

`normalizeTerritorialIdentity` (in [TerritorialAiAssistantPanel.jsx](src/components/ai/territory/TerritorialAiAssistantPanel.jsx)) era già corretta come funzione pura. Il problema reale era **a monte**: nessun chiamante la alimentava mai con dati veri.

1. **`aiIdentity`/`aiContextId` mai passate**: `PublicRoutes.jsx` monta `<Step2 data={...} setData={...} onNext={...} onBack={...}/>` senza `aiIdentity`/`aiContextId`; `Step2.jsx` li inoltra a `TerritorialStep2AiBoundary` sempre `undefined`. Risultato: `normalizeTerritorialIdentity(undefined, undefined)` → sempre `enabled:false` → "Sessione AI territoriale non disponibile" per **chiunque**, anche con sessione Admin/Cliente reale e verificata. **Fix**: il pannello ora risolve l'identità da solo, dalla sessione Supabase reale già usata dal resto dell'app (`getStoredSupabaseSession()` + `getCurrentSupabaseUser(session)` — stessa verifica server-side di AdminGuard/CustomerGuard/CustomerAiAssistantPanel — poi lettura del proprio `profiles.role` via RLS). Se un chiamante passa esplicitamente una prop `identity` (test), quella ha priorità e la risoluzione automatica viene saltata.
2. **`contextId` mai passato**: `buildTerritorialSessionContextKey` richiede sempre `campaignRef` **o** `quoteRef` **o** `contextId`; nessuno dei tre arrivava mai per una sessione Step 2 senza campagna/preventivo salvato → `sessionId` sempre `null` → ogni invio veniva scartato in silenzio, nessuna chiamata di rete, nessun errore visibile. **Fix**: fallback locale stabile per tab (`sessionStorage`), stesso pattern già usato per `baseSessionId`.
3. **Sessione mai "bridgata" verso l'SDK usato da `functions.invoke`**: `territorialAssistantAdapter.js` chiamava `supabase.functions.invoke("ai-assistant-territory", ...)` sul client SDK ufficiale (`src/supabaseClient.js`), che resta senza sessione finché non si chiama `ensureSupabaseSessionBridge()` (pattern già documentato e usato da `useCliente`, `useCampagne`, `customer-api.js`, `gps-api.js` — **ma dimenticato in questo adapter**). Risultato: anche con identità riconosciuta, la chiamata reale arrivava con la sola anon key → `401 UNAUTHENTICATED` dalla Edge Function. **Fix**: `await ensureSupabaseSessionBridge()` prima di `functions.invoke`. Stesso identico bug trovato e corretto anche in `adminCopilotAdapter.js` (bloccava anche l'Admin Copilot).

Verifica live (browser reale, sessione Supabase reale minata localmente, non simulata):
- Sessione autenticata (Cliente `client`) → pannello disponibile, stato "Dati completi", suggerimenti attivi. ✅
- Anonimo (nessuna sessione in `localStorage`) → pannello non disponibile ("Sessione AI territoriale non disponibile."), **nessuna chiamata di rete** verso l'Edge Function (verificato via network log). ✅
- Identità errata (token non verificabile) → stesso comportamento fail-closed (`status:"invalid"` → `enabled:false`). ✅

## 4. Percorso Cliente (Fase 4) — PASS reale

Dati minimi locali creati e poi rimossi:
- Utente Cliente reale via GoTrue admin API (`customera.test.local@example.com`), `profiles.role='client'`.
- 1 riga `campaigns` (`user_id` = utente, `client_email` combaciante, servizio D2D, Varedo, 10.000 volantini, €1250, stato `in_progress`), `is_test=true`.

Verifica browser reale (Dashboard Cliente, sessione Supabase reale):
- Cliente vede **esclusivamente** la propria campagna (1 attiva, €1250,00 totale speso). ✅
- Domanda "A che punto è la mia campagna?" → risposta **positiva reale**: *"La campagna più recente risulta in distribuzione."* con evidence `Stato campagna: in_distribuzione (real, high)`, `Servizio: d2d (real, high)`, `Zona: Varedo (real, high)`, fonte "interna verificata" (percorso deterministico `CentralAiAgent`, nessun LLM nel browser per design — invariato dal V2). ✅
- Nessun dato operatore/GPS esposto (per costruzione, invariato). ✅
- Cliente B (nessuna campagna propria) → dashboard vuota, **0 campagne**, nessuna fuga della campagna di Cliente A. ✅

Dati di test rimossi (`DELETE FROM campaigns WHERE is_test = true`) subito dopo la verifica.

## 5. Percorso Admin (Fase 5) — PASS reale

Sessione Admin reale locale (`profiles.role='admin'`, verificata da `jwt_is_admin()` via `AdminGuard`). Aperta la Admin Dashboard reale (`/admin`), cliccato "Genera Analisi AI" → "Riepilogo operativo":
- Chiamata reale a `ai-admin-copilot` (prima **403** per il bug §3.3, poi **200** dopo il fix).
- Risposta OpenAI reale: *"Non ci sono campagne attive al momento. Si consiglia di pianificare nuove campagne..."*, etichettata **"Generato da OpenAI su dati reali autorizzati."**
- Evidence popolata: campagne attive/in ritardo/da attenzionare/preventivi aperti/operatori live, tutte `real`/`derived` con provenienza (`admin_dashboard_snapshot`, `gps_live_operators_summary`, `openai_gpt4o_mini_admin_copilot`).
- Link navigazionale `/admin/live` presente (invariato dal V2).
- Nessun dato non autorizzato: KPI senza dati mostrano esplicitamente "Dato non disponibile", mai un valore inventato.

## 6. Percorso Territoriale Step 2 (Fase 6) — PASS reale

Con la stessa sessione Cliente, su Step 2 reale (Door to Door, Varedo, 10.000 volantini): aperto l'Assistente, cliccato "Spiegami questa analisi." → risposta OpenAI reale, grounded sui dati dello snapshot (Varedo, D2D, 10.000 inseriti, fabbisogno 3.960, surplus 6.040, popolazione 8.112, 3.601 famiglie, copertura 100%), con evidence:
`Servizio · key: d2d (real, high, 07:34:24)`, `Territorio · label: Varedo · comune completo (real, high, 07:34:24)`, `Territorio · radiusKm: 3 (real, high, 07:34:24)` — fonte, tipo (`real`), confidenza e timestamp tutti presenti come richiesto. Nessun dato inventato (verifica numerica lato Edge Function per `analyze-territory-summary`; per `ai-assistant-territory` la risposta usa solo numeri già presenti nello snapshot, confermato a vista).

## 7. Feature flag (Fase 7)

Definiti in [src/lib/runtimeFlags.js](src/lib/runtimeFlags.js): `VITE_FEATURE_AI_CUSTOMER_DASHBOARD`, `VITE_FEATURE_AI_ADMIN_DASHBOARD`, `VITE_AI_TERRITORIAL_STEP2_ENABLED`, tutti letti come stringa esatta `"true"` (qualunque altro valore o assenza → **off**, fail-closed di default).

| Ambiente | Dove si imposta | Default in assenza |
|---|---|---|
| Sviluppo locale | `.env.development.local` (gitignored, mai committato) — impostati a `true` in questa sessione insieme a `VITE_SUPABASE_URL=http://127.0.0.1:54340` e `VITE_SUPABASE_ANON_KEY` locale, per puntare il dev server allo stack Docker locale invece che al progetto remoto | off |
| Staging | da impostare come env var della piattaforma di staging (nessuna piattaforma staging configurata in questo repo: gap preesistente) | off |
| Produzione | da impostare come env var del progetto (Vercel/hosting) — **non toccato in questa sessione** (esplicitamente fuori scope: "non usare Vercel") | off |

Nessun segreto committato: `.env.development.local`, `.env.local` risultano in `.gitignore`.

## 8. Sicurezza — Test end-to-end (Fase 8)

| # | Test | Metodo | Esito |
|---|---|---|---|
| 1 | Admin risposta positiva | Browser reale, sessione Admin reale | ✅ 200, risposta OpenAI reale |
| 2 | Cliente risposta positiva | Browser reale, sessione Cliente reale + dati locali | ✅ risposta deterministica reale |
| 3 | Territoriale risposta positiva | Browser reale, Step 2 reale | ✅ 200, risposta OpenAI reale |
| 4 | Anonimo → 401 | curl, 4 function | ✅ tutte 401 `UNAUTHENTICATED` |
| 5 | Cliente → Admin 403 | curl, token Cliente reale su `ai-admin-copilot` | ✅ 403 `FORBIDDEN` |
| 6 | Cliente A → campagna B 403 | curl, campagna reale di test intestata a Cliente B | ✅ 403 `FORBIDDEN`; Cliente B sulla propria campagna → 200 reale |
| 7 | Provider non disponibile → fallback | Analisi codice: `callOpenAi` senza `OPENAI_API_KEY` → `warnings:["OPENAI_NOT_CONFIGURED"]`, risposta `status:"error"/"fallback"`, mai crash | ✅ (verificato a codice; chiave presente in questo ambiente quindi non riproducibile end-to-end senza disattivarla) |
| 8 | JSON invalido → fallback | curl, body non-JSON su `ai-assistant-territory` | ✅ 400 `INVALID_PAYLOAD` |
| 9 | Dato mancante → UNAVAILABLE | Browser reale, KPI Admin senza dati → "Dato non disponibile"; schema AI (`fieldTypes.js`) forza `UNAVAILABLE` se `value` è `null`/`undefined` | ✅ |
| 10 | Nessun segreto nei log | Ispezione `functions_serve.log` (grep su pattern chiave/JWT) | ✅ nessun match |

Nessun mock usato come prova finale per i test 1-3: tutti eseguiti con sessione Supabase reale, Edge Function reale, chiamata OpenAI reale.

## 9. Pipeline (Fase 9)

- `npm test`: **244/244 PASS, 0 FAIL** (stesso totale del V2 — nessuna regressione dai fix di questa sessione).
- `npm run build`: **successo**, 683 moduli, nessun errore (solo il warning preesistente su chunk >500kB).
- `git diff --check`: nessun errore (solo warning benigni `LF will be replaced by CRLF`, coerenti con `core.autocrlf` su Windows).
- `git status --short`: pulito rispetto al mio lavoro; i file esterni preesistenti elencati nel V2 restano intoccati.

## 10. Commit locali (Fase 10)

Nessun push. Messaggi adattati ai diff reali di questa sessione (non è stato scritto nuovo codice di test automatico: la verifica dei percorsi positivi è stata eseguita dal vivo — browser + curl — non con nuovi file `*.test.mjs`, per rispettare "no mock come prova finale"):

1. `fix(ai-territory): resolve authenticated territorial identity` — identità, contextId, session bridge, rimozione import morto
2. `fix(ai-admin): bridge Supabase session before invoking ai-admin-copilot`
3. `chore(ai): add local dev launch config for full-site-final`
4. `docs(ai): add AI BRAIN V3 end-to-end report`

## 11. Limiti residui

1. Nessun budget/rate-limit applicativo lato Edge Function per le chiamate OpenAI (gap preesistente, non introdotto qui).
2. Ambiente di staging non configurato in questo repo: i flag per staging restano da definire quando esisterà una pipeline di staging.
3. Il test orfano `tests/ai_territorial_step2_integration.test.mjs` (non incluso nello script `npm test`) contiene un'asserzione (`entrypoint carica Phase 4 esclusivamente tramite boundary lazy`) che presuppone `TerritorialStep2AiBoundary` montato dentro `volantinipro-final.jsx` con gate su `isTerritorialStep2AiEnabled` — wiring che non esiste nell'architettura attuale (Step 2 reale vive in `src/pages/public/configurator/Step2.jsx` via `PublicRoutes`, non nel monolite). Ho rimosso solo l'import morto e diretto di `TerritorialAiAssistantPanel` (che quel test correttamente segnalava come da eliminare); non ho riscritto il resto dell'asserzione perché presuppone un'architettura diversa da quella reale — fuori scope ("non fare redesign"). Non influisce su `npm test` (file non incluso) né su nessun percorso in produzione.
4. Test browser Playwright orfani (`tests/ai_territorial_step2.browser.test.cjs`, `tests/ai_territorial_feature_flag_off.browser.test.cjs`) richiedono un path Playwright locale non presente in questo ambiente (`C:/Users/fady/.cache/codex-runtimes/...`) e assumono che gli utenti anonimi abbiano accesso all'assistente territoriale in modalità "visitatore" — comportamento in conflitto con l'istruzione esplicita di questa sessione ("anonimo → pannello non disponibile"). Non eseguiti, non modificati.
5. Provider non disponibile (test 7 di Fase 8) verificato solo a livello di codice, non riprodotto end-to-end in questo ambiente perché `OPENAI_API_KEY` è correttamente configurata (disattivarla avrebbe richiesto riavviare `supabase functions serve` e avrebbe interrotto la verifica dei percorsi positivi già in corso).

## Verdetto

**AI BRAIN V3 PASSED**

Motivazione: tutte le 4 Edge Function AI risultano attive in locale (mai più 404), con provider OpenAI reale configurato e verificato con una chiamata minima reale. I tre bug reali della catena di identità/sessione territoriale (identità mai propagata, contextId mai propagato, sessione mai bridgata verso l'SDK — quest'ultimo trovato anche nell'Admin Copilot) sono stati individuati e corretti alla radice. I tre percorsi positivi richiesti (Admin, Cliente, Territoriale) sono stati dimostrati **dal vivo**, con sessioni Supabase reali, dati locali reali e risposte OpenAI reali (non fallback, non mock), inclusa l'evidenza con fonte/tipo/confidenza/timestamp per il Territoriale. Tutti i 10 test di sicurezza richiesti sono verificati (9 end-to-end reali, 1 verificato a codice per assenza di un ambiente senza chiave). `npm test` resta a 244/244 senza regressioni e `npm run build` completa senza errori.
