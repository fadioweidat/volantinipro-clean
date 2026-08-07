# Bundle Optimization P0 Report — VolantiniPro Frontend

**Ticket**: BUNDLE-OPTIMIZE-1
**Data**: 2026-08-07
**Base**: BUNDLE-AUDIT-1
**Tipo**: Solo ottimizzazioni P0 a basso rischio. Nessuna modifica a logica commerciale, prezzi, DB, schema/RPC Supabase, Edge Functions, GPS, calcoli territoriali, comportamento mappe o UI approvata. Nessun deploy, nessun push, nessun commit automatico.

---

## Fase 1 — Baseline

`npm ci` pulito, `npm test` → **280/280 PASS**, `npm run build` pulito.

| Metrica baseline | Valore |
|---|---|
| Entry JS | `index-BQRmQ7LR.js` — 1.814,77 KB raw / 501,14 KB gzip |
| CSS eager | `index-CIGW-MKW.css` — 15,61 KB raw / 6,45 KB gzip (linkata in `index.html`) |
| **Bootstrap pubblico totale (JS+CSS eager)** | **1.830,38 KB raw / 507,59 KB gzip** |
| Chunk totali | 11 (1 entry + 6 JS lazy AI + 4 CSS) |
| Test | 280/280 PASS |

Confermato ~1,8MB come da contesto del ticket.

---

## Fase 2 — Asset orfano

Ricerca esaustiva ripetuta su tutto il repo (`grep -rl "hero-reference"`, esclusi `node_modules`/`dist`/`.git`) su `src/`, `public/`, HTML, CSS, `robots.txt`, `sitemap.xml`: **zero riferimenti** oltre al report di audit che lo documentava.

**Rimosso**: `public/references/hero-reference.png` (2.063 KB) e la cartella `public/references/` (rimasta vuota dopo la rimozione).

Nessun altro asset toccato.

---

## Fase 3-4 — Route-level lazy loading + isolamento mappe

### File modificati

| File | Cosa cambia |
|---|---|
| [`src/main.jsx`](src/main.jsx) | 4 import statici (`CampaignTracking`, `TrackingPage`, `DriverCoverageMap`, `DriverAssignmentPage`) → `lazy()` + `Suspense`. Questi 4 branch sono mutuamente esclusivi per costruzione (un solo match possibile su `window.location.pathname`) e non fanno mai parte del bootstrap pubblico (l'homepage/configuratore cade nel default `<AppRouter/>`, rimasto import statico, invariato). |
| [`src/app/AppRouter.jsx`](src/app/AppRouter.jsx) | 12 import statici → `lazy()`: 5 da `volantinipro-final.jsx` (`LoginPage`, `DashboardPage`, `CampaignDashboardPage`, `PagamentoBonificoPage`, `AdminDashboard` — stesso specifier, un solo chunk condiviso), 7 pagine Admin (`AdminLiveDashboard`, `GpsMonitor`, `CampaignOperations`, `CampaignGroups`, `CampaignReport`, `AssignWork`, `CampaignAssignments`), 2 pagine Cliente (`CampaignTracking`, `ClientCampaignReport`). Ogni blocco JSX corrispondente avvolto in `<Suspense>`. |
| [`src/layouts/public/RouteLoadingFallback.jsx`](src/layouts/public/RouteLoadingFallback.jsx) | **Nuovo file**: fallback minimale per i confini Suspense, stile ripreso identico dal placeholder già esistente in `AdminGuard.jsx` (`AdminRoleCheckingPlaceholder`) — nessun nuovo pattern visivo introdotto. |

**Non toccato, come richiesto**: `src/components/Step2Map.jsx` (nessuna riga modificata — il caricamento Leaflet via CDN runtime resta esattamente come prima), logica commerciale, RPC, GPS, calcoli territoriali.

### Scoperta rilevante durante l'implementazione

`volantinipro-final.jsx` (6.763 righe) è un modulo legacy che esporta insieme `LoginPage`, `DashboardPage` Cliente, `CampaignDashboardPage`, `PagamentoBonificoPage` **e** il wrapper `AdminDashboard` (che a sua volta importa staticamente `RealAdminDashboard` da `src/pages/admin/AdminDashboard.jsx`). Rendere lazy questi 5 export (tutti dallo stesso `import()`) è stato il singolo cambiamento con il maggior impatto: ha rimosso dal bootstrap l'intero modulo, inclusi i suoi import statici (mappa Admin, sezioni homepage duplicate al suo interno, utilità PDF/email). Vite raggruppa automaticamente i 5 `lazy()` nello stesso chunk fisico (`volantinipro-final-*.js`, confermato nell'output di build), poiché puntano tutti allo stesso specifier — non è stato necessario alcun intervento manuale per ottenere questo raggruppamento.

### Risultato Fase 4 (isolamento Leaflet) — verificato empiricamente

```
grep -c "Leaflet" dist/assets/index-*.js   →  0   (era 2 nella baseline)
grep -c "Leaflet" dist/assets/TileLayer-*.js →  1  (nuovo chunk vendor, isolato)
```

`react-leaflet`/`leaflet` **non è più necessario per caricare la homepage** — obiettivo della Fase 4 raggiunto, confermato con ricerca diretta nel bundle compilato, non per deduzione.

Il code-splitting **naturale** di Vite/Rollup (nessun `manualChunks` scritto) ha automaticamente isolato Leaflet in un chunk vendor dedicato (`TileLayer-*.js`, 153,71 KB / 44,61 KB gzip) più alcuni micro-chunk condivisi tra i componenti mappa (`Circle`, `Polygon`, `Tooltip`, `Popup`, `hooks`, tutti <1KB), e ha correttamente riassociato il CSS di Leaflet (15,61 KB — la stessa identica hash `CIGW-MKW` della baseline, confermando che è **byte-per-byte lo stesso contenuto**, semplicemente non più caricato eager) al chunk mappa invece che all'entry.

---

## Fase 5 — Suspense UX

`RouteLoadingFallback` riusa lo stile esistente (`PANEL_STYLE` di `AdminGuard.jsx`: centrato, `minHeight: 60vh`, stessa font-family/colore dell'app). Nessun redesign. Verificato nel browser (vedi Fase 10) che nessuna transizione produce una schermata bianca — sempre visibile "Caricamento in corso..." durante il download del chunk.

---

## Fase 6 — Chunking

**Nessun `manualChunks` aggiunto.** Il code-splitting naturale di Vite, innescato semplicemente dai `React.lazy()` introdotti in Fase 3-4, ha già prodotto una separazione pulita per pagina/ruolo (vedi elenco chunk in Fase 9) senza bisogno di configurazione manuale — coerente con l'indicazione del ticket di "lasciare prima lavorare il code splitting naturale di Vite" e di non forzare nulla se non necessario. Nessun micro-chunk eccessivo: 41 file totali (JS+CSS) contro gli 11 della baseline, tutti con una ragione chiara (una pagina, un pannello AI, o codice condiviso tra più pagine).

---

## Fase 7 — Framer Motion

Nessuna animazione rimossa, nessun import rimosso (non è stato trovato, né cercato in modo da poterlo affermare con certezza, alcun import "dimostrabilmente inutilizzato" — nessuna rimozione eseguita per prudenza). Il route splitting **non ha spostato `framer-motion` fuori dal bootstrap**, ed è il comportamento corretto: come identificato in BUNDLE-AUDIT-1, 12 dei suoi 14 importer sono componenti Pubblico/Configuratore (homepage, Step1/3/4), quindi restano legittimamente nel path eager. Nessuna azione necessaria o presa in questo ticket.

---

## Fase 8 — Anomalia `@supabase/ssr`

Investigazione (solo analisi, nessuna rimozione):

- `npm ls @supabase/ssr` → dipendenza **diretta** del progetto (non transitiva): `\`-- @supabase/ssr@0.10.3` a livello radice.
- `npm why @supabase/ssr` → `"@supabase/ssr@"^0.10.3" from the root project"`, confermando che è dichiarata direttamente in `package.json`, non richiesta da nessun altro pacchetto.
- **Zero import** del pacchetto in `src/` (confermato di nuovo con `grep -rn "@supabase/ssr" src/`).
- La stringa `"@supabase/ssr"` nel bundle compilato **non è un import reale**: è un frammento di testo dentro un messaggio di warning che `@supabase/supabase-js` stesso emette (nel proprio modulo di autenticazione PKCE), letteralmente: *"...if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies."* — confermato leggendo il contesto esatto della stringa sia nel sorgente di `@supabase/supabase-js` sia nel chunk compilato.

**Conclusione**: nessun codice del pacchetto `@supabase/ssr` è incluso nel bundle — solo il suo nome appare per caso dentro una stringa di un pacchetto diverso. La dipendenza `@supabase/ssr` in `package.json` risulta genuinamente inutilizzata dal codice client (`src/`), ma **non è stata rimossa** in questo ticket, come richiesto ("non rimuovere dipendenze senza prova che siano inutilizzate" — la prova di non-uso in `src/` esiste, ma verificarne l'innocuità della rimozione da `package.json`/eventuali script è fuori dallo scope "solo analisi" di questa fase).

---

## Fase 9 — Build dopo ottimizzazione

`npm test` → **280/280 PASS** (invariato). `npm run build` → pulito, nessun errore. `git diff --check` → nessun problema (whitespace/conflitti) sui file modificati.

### Tabella di confronto

| Metrica | Prima | Dopo | Delta |
|---|---|---|---|
| Entry JS raw | 1.814,77 KB | 1.388,38 KB | **-426,39 KB (-23,5%)** |
| Entry JS gzip | 501,14 KB | 383,67 KB | **-117,47 KB (-23,4%)** |
| Entry JS brotli | 398,54 KB | 309,14 KB | **-89,40 KB (-22,4%)** |
| CSS eager (linkata in `index.html`) | 15,61 KB / 6,45 KB gzip | **0 KB (nessuna CSS eager)** | -15,61 KB / -6,45 KB gzip |
| **Bootstrap pubblico totale (JS+CSS)** | **1.830,38 KB raw / 507,59 KB gzip** | **1.388,38 KB raw / 383,67 KB gzip** | **-442,00 KB raw (-24,2%) / -123,92 KB gzip (-24,4%)** |
| Numero chunk totali (JS+CSS) | 11 | 41 | +30 (splitting per pagina/ruolo) |
| Leaflet nel bootstrap pubblico | Sì (confermato, 2 occorrenze stringa) | **No (0 occorrenze, isolato in chunk dedicato)** | Rimosso dal path pubblico |
| Chunk mappa dedicato (`TileLayer-*`) | Non esisteva (incluso nell'entry) | 153,71 KB raw / 44,61 KB gzip (+ CSS 15,61/6,45 KB) | Nuovo, caricato solo on-demand |
| Admin initial (index.js + `volantinipro-final` + `AdminLayout` + `admin-api` + chunk mappa JS+CSS) | 1.830,38 KB (tutto nell'entry, nessuna differenza per ruolo) | **1.630,29 KB raw / 455,71 KB gzip** | -200,09 KB raw rispetto al vecchio "tutto in uno" (ma ancora include il bootstrap pubblico completo, vedi rischi) |
| Customer initial minimo (`/dashboard` → `DashboardPage`, senza mappa) | 1.830,38 KB | **1.446,70 KB raw / 399,24 KB gzip** (index.js + chunk `volantinipro-final`) | -383,68 KB raw |
| Driver initial (`/driver/assignment/:id` → `DriverAssignmentPage` + mappa) | 1.830,38 KB | **1.564,42 KB raw / 440,66 KB gzip** (index.js + `DriverAssignmentPage` 16,75KB + chunk mappa JS+CSS 169,32KB) | -265,96 KB raw |

**Nota metodologica sui valori "initial" per ruolo**: calcolati sommando esattamente i chunk che quel percorso di codice richiede (verificato dal grafo di import, non da cattura di rete simulata) — non includono eventuali chunk aggiuntivi caricati da azioni successive dell'utente all'interno della pagina (es. apertura pannello AI).

### Target del ticket

| Target | Raggiunto? |
|---|---|
| Bootstrap pubblico < 700 KB raw | **No** — 1.388,38 KB raw (quasi il doppio del target) |
| Bootstrap pubblico < 250 KB gzip | **No** — 383,67 KB gzip |

**Risultato reale riportato senza hack**: il target non è stato raggiunto. È stato ottenuto un miglioramento reale e misurato (-24% raw, -24% gzip sul bootstrap pubblico; Leaflet completamente rimosso dal path pubblico), ma il grosso del peso residuo nel bootstrap pubblico (1.388 KB) è codice che **serve davvero** al bootstrap pubblico stesso: React/ReactDOM, `@supabase/supabase-js`, `HomePage.jsx` con le sue 10 sezioni, `Step2Map.jsx` (2.133 righe, usato sia da Step2 che dalla hero-map homepage), le 4 pagine del configuratore, `framer-motion`. Nessuno di questi è stato toccato in questo ticket per restare entro lo scope P0 (basso rischio, nessuna modifica a UI/mappe/logica). Ridurre ulteriormente richiederebbe interventi P1 (es. isolare/differire `Step2Map` dalla hero homepage, valutare `framer-motion` in modo più mirato) esplicitamente fuori scope qui.

---

## Fase 10 — Regression test (browser, build di sviluppo locale)

Server dev avviato su worktree RC2 (`npm run dev`, porta 5175, nuova configurazione aggiunta a `.claude/launch.json` — nessuna configurazione esistente modificata). Verificato per ciascuna rotta: nessun errore console, nessuna schermata bianca, nessun 404 di chunk.

| Rotta | Esito |
|---|---|
| `/` (Homepage) | PASS — nessun errore console, contenuto renderizzato |
| `/configuratore` (Step1) | PASS — form Step1 renderizzato correttamente |
| `/admin` (Dashboard Admin) | PASS — dashboard completa renderizzata (revenue, campagne, mappa operativa), nessun errore, chunk lazy risolto correttamente |
| `/admin/live` (GPS Monitor live) | PASS — pagina con mappa live renderizzata, nessun errore |
| `/login` | PASS — pagina login renderizzata |
| `/driver/assignment/:token` | PASS — nessun errore/schermata bianca; mostra il messaggio applicativo esistente "Supabase non configurato" (comportamento pre-esistente dell'ambiente locale, non una regressione introdotta) |
| `/customer/campaigns/:id/tracking` | PASS — nessun errore console |

**Non testate in questo giro** (richiederebbero sessioni Supabase reali/dati di test non disponibili in locale, coerente con le limitazioni già note da E2E precedenti): navigazione autenticata completa Admin tra tutte le sotto-sezioni con campagne reali, Cliente con sessione reale, Driver con assignment reale. Il meccanismo di lazy-loading stesso (il punto a rischio di questo ticket) è stato verificato positivamente su tutte le rotte raggiungibili senza dati reali.

**Nessuna regressione trovata.**

---

## Fase 11 — k6 locale/staging

Non eseguito in questo ticket per decisione esplicita del ticket stesso ("Non stressare nuovamente produzione... I test k6 production verranno rieseguiti soltanto dopo eventuale deploy autorizzato"). La verifica di correttezza è stata fatta tramite il browser (Fase 10) e l'analisi statica dei chunk (Fase 9), non tramite k6 contro build locale — il ticket richiedeva "solo correttezza", non benchmark TTFB locali (esplicitamente dichiarati "non rilevanti come benchmark").

---

## Fase 12 — Rischi rimasti

| Rischio | Dettaglio | Severità |
|---|---|---|
| Target dimensionale non raggiunto | Bootstrap pubblico resta a 1.388 KB raw / 384 KB gzip, sopra i target dichiarati (700KB/250KB) | Informativo, non un difetto — riportato onestamente come da istruzione |
| Driver/Cliente via URL diretto scaricano comunque tutto il bootstrap pubblico | `main.jsx` importa staticamente `AppRouter` (non reso lazy, correttamente, perché serve al bootstrap pubblico reale) — un Driver che apre `/driver/assignment/:id` scarica comunque l'intero `index.js` da 1.388KB anche se non visiterà mai Home/Configuratore. Non risolvibile senza rendere lazy anche `AppRouter` stesso nel branch di default di `main.jsx`, scelta scartata in questo ticket per restare a rischio minimo (introdurrebbe un flash di caricamento anche per le visite homepage reali) | Medio — opportunità reale per un ticket P1 dedicato |
| `volantinipro-final.jsx` resta un chunk unico condiviso da 5 componenti eterogenei (Login/Cliente/Admin-wrapper) | Non è stato scisso (richiederebbe refactoring del file da 6.763 righe, esplicitamente fuori scope P0) | Basso — è comunque interamente fuori dal bootstrap pubblico, il beneficio principale è già ottenuto |
| `@supabase/ssr` dichiarato ma non usato in `src/` | Non rimosso in questo ticket (fase di sola analisi) | Basso — nessun impatto sul bundle, solo pulizia `package.json` potenziale per un ticket futuro |
| Copertura E2E parziale | Solo rotte raggiungibili senza sessione Supabase reale testate in questo giro (vedi Fase 10) | Basso — il meccanismo di lazy-loading è verificato; la logica applicativa sottostante non è stata toccata |

---

## Verdetto

**BUNDLE P0 OPTIMIZATION PASSED**

Motivazione:
- Tutte le ottimizzazioni applicate erano effettivamente a basso rischio: nessuna logica commerciale, prezzi, DB, RPC, Edge Function, GPS, calcolo territoriale o comportamento mappe toccato.
- `Step2Map.jsx` non modificato, come esplicitamente richiesto.
- Test automatici: 280/280 PASS sia prima che dopo, nessuna regressione.
- Regression test browser: nessuna schermata bianca, nessun chunk 404, nessun errore Suspense/console su tutte le rotte pubbliche/Admin/Login/Driver/Cliente raggiungibili in locale.
- Obiettivo esplicito della Fase 4 (Leaflet non più necessario per la homepage) **raggiunto e verificato empiricamente**.
- Miglioramento reale e misurato: bootstrap pubblico -24,2% raw / -24,4% gzip.
- Asset orfano da 2MB rimosso dopo verifica esaustiva di non-uso.
- Anomalia `@supabase/ssr` chiarita definitivamente (non è codice incluso, solo una stringa in un messaggio di libreria terza).

Non dichiarato "FAILED" perché nessun target è stato mancato per un errore o una regressione — il target dimensionale (700KB/250KB) era esplicitamente etichettato dal ticket precedente come "plausibile ma non garantito", e qui si conferma che serve lavoro P1 aggiuntivo (fuori scope) per raggiungerlo. Non dichiarato "PARTIAL" perché tutti gli obiettivi *in-scope* del ticket P0 (asset orfano, lazy loading Admin/Cliente/Driver, isolamento Leaflet dal bootstrap, Suspense UX senza schermate bianche, nessuna regressione) sono stati raggiunti e verificati con evidenza diretta.

## File modificati/aggiunti/rimossi (riepilogo)

- **Modificati**: `src/main.jsx`, `src/app/AppRouter.jsx`
- **Aggiunti**: `src/layouts/public/RouteLoadingFallback.jsx`, questo report
- **Rimossi**: `public/references/hero-reference.png`
- **Non toccati**: `src/components/Step2Map.jsx`, `vite.config.js` (nessun `manualChunks`), qualunque logica di business/RPC/DB/Edge Function

Nessun commit, nessun push, nessun deploy eseguito.
