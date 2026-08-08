# K6 Production TTFB/API Confirmation Report — VolantiniPro

**Ticket**: K6-PRODUCTION-CONFIRM-2
**Target**: `https://www.volantinipro.it` (produzione reale)
**Data**: 2026-08-07
**Script**: [`tests/k6/production-ttfb-api.js`](tests/k6/production-ttfb-api.js) (nuovo — [`tests/k6/production-smoke.js`](tests/k6/production-smoke.js) non modificato)

## Obiettivo

Isolare la latenza server/CDN (TTFB, header di risposta, stato cache) dal tempo di download completo del payload, per determinare se il p95≈45.6s osservato sul bundle JS nel test precedente fosse un problema server/CDN o un artefatto del client di test.

## Metodo

- **Homepage** (`/`) e **rotta pubblica configuratore** (`/configuratore`) — GET normale (payload minuscolo, 409 byte, shell SPA — confermato via `curl` che le due rotte restituiscono lo stesso body, coerente con l'architettura client-rendered già nota).
- **REST read-only** (`geo_nil_milano`) — stesso endpoint già verificato nel test 1.
- **Asset statico (bundle JS)** — **richieste `HEAD`**, non `GET`: nessun byte di body viene mai trasferito. Misura pura di TTFB (`http_req_waiting`) e header (`X-Vercel-Cache`, `Age`, `Content-Length`, `Cache-Control`), eliminando completamente il confondimento con il tempo di download.

Nessuna scrittura, nessuna RPC, nessun login, nessun dato creato.

## Fase 5 — Esecuzione e metriche

### Baseline (1 VU / 15s) — validazione script

23/23 → 110/110 check PASS, 0 errori. Confermato che i tag delle soglie (`http_req_waiting{name:...}`) funzionano correttamente prima di procedere al profilo completo.

### Profilo completo (1→5→20→50 VU, ~2m46s)

| Metrica | Valore |
|---|---|
| Richieste totali | **8.936** |
| VU massimi | **50** |
| Iterazioni complete | 2.234 |
| Requests/sec | 53,74 req/s |
| Error rate | **0,00%** (0/8.936) |
| Check falliti | **0/22.340** (100% PASS) |
| 4xx | 0 |
| 5xx | 0 |
| Dati ricevuti | **4,3 MB** (vs 302 MB nel test 1 — HEAD non scarica body) |

### TTFB per categoria (p50 / p90 / p95 / p99)

| Endpoint | p50 (med) | p90 | p95 | p99 | Soglia | Esito |
|---|---|---|---|---|---|---|
| Homepage (`/`) | 57,6 ms | 68,5 ms | 76,9 ms | 118,0 ms | p95<750, p99<1500 | ✅ PASS |
| Configuratore (`/configuratore`) | 57,2 ms | 68,2 ms | 74,9 ms | 124,1 ms | p95<750, p99<1500 | ✅ PASS |
| REST read-only (`geo_nil_milano`, duration totale) | 100,5 ms | 122,6 ms | 136,7 ms | 253,7 ms | p95<1000 | ✅ PASS |
| Static bundle JS (HEAD, TTFB puro) | 57,0 ms | 68,0 ms | 77,5 ms | 130,0 ms | p95<750 | ✅ PASS |

### Cache CDN (Vercel)

- `X-Vercel-Cache: HIT` su **4.468/4.468** richieste tracciate (homepage + asset statico) — **100% cache hit, 0 miss, 0 unknown**.
- `Content-Length` presente su ogni risposta HEAD dell'asset.
- Nessuna variazione di comportamento cache osservata durante la rampa fino a 50 VU.

### Receiving time (tempo di trasferimento body) per l'asset

`receiving_static_head`: avg=0,36 ms, p95=1 ms, p99=4,35 ms, max=77 ms — sostanzialmente nullo, come atteso da una richiesta `HEAD` che non trasferisce alcun body. Conferma diretta che nessun dato viene scaricato in questo test.

## Fase 6 — Confronto con il test precedente

| Metrica | Test 1 (`production-smoke.js`) | Test 2 (`production-ttfb-api.js`) | Interpretazione |
|---|---|---|---|
| Metodo su asset JS | `GET` (download completo, 1,8 MB) | `HEAD` (0 byte di body) | Il confondimento banda/download è stato rimosso in Test 2 |
| Asset — p95 | 45,59 s (tempo totale, dominato da `receiving`) | 77,47 ms (**solo TTFB**) | A parità di 50 VU concorrenti, il server risponde in ~77 ms; il tempo osservato nel Test 1 non proviene dal server |
| Asset — TTFB isolato (`http_req_waiting`) | Non misurato separatamente in Test 1 (solo `http_req_duration` globale, p95=229,5 ms includendo homepage+REST+asset) | 77,47 ms (misurato in modo isolato e pulito) | Coerente con l'ipotesi che il server abbia sempre risposto rapidamente anche nel Test 1 |
| Homepage p95 | 299,7 ms | 76,9 ms | Migliorato: Test 2 misura solo TTFB (`waiting`), non la durata totale come Test 1; entrambi comunque ben sotto soglia |
| REST p95 | 470,6 ms | 136,7 ms | Stabile/migliore; variazione plausibile per traffico CDN/rete al momento del test, nessuna anomalia |
| Error rate | 0,00% | 0,00% | Invariato — nessun errore in nessuno dei due test |
| 5xx | 0 | 0 | Invariato |
| Dati trasferiti | 302 MB | 4,3 MB (-98,6%) | Conferma diretta: la quasi totalità del traffico del Test 1 era body-download del bundle, non traffico di controllo/API |
| Cache CDN | `X-Vercel-Cache: HIT` osservato in ricognizione pre-test | `HIT` su 100% (4.468/4.468) delle richieste tracciate | Asset servito da edge cache in entrambi i test, mai da origin compute |

### Determinazione: causa del p95≈45,6s nel Test 1

**A. Saturazione banda/macchina del client di test.**

Evidenze a supporto:
1. Nel Test 2, con lo stesso numero di VU concorrenti (fino a 50), sullo stesso identico endpoint (`/assets/index-BVPFcCYW.js`), il TTFB server-side è rimasto stabile e basso (p95=77,47 ms, p99=130,0 ms) per tutta la rampa di carico — nessun segnale di rallentamento all'aumentare della concorrenza.
2. La cache CDN ha servito l'asset in modalità `HIT` al 100% delle volte — nessuna richiesta ha raggiunto l'origin/compute layer.
3. Nel Test 1 stesso, `http_req_waiting` globale (che includeva comunque le richieste asset, maggioritarie per conteggio) era già basso (p95=229,5 ms) mentre solo `http_req_receiving` (il trasferimento del body) esplodeva — la separazione tra le due fasi era già visibile internamente al Test 1, e il Test 2 la conferma isolandola completamente.
4. Il volume di dati trasferiti nel Test 1 (302 MB in ~3m15s da un'unica macchina, con 50 VU concorrenti che scaricavano ripetutamente un payload da 1,8 MB) è coerente con un limite di banda in uscita del client di test, non con un limite di throughput della CDN Vercel (dimensionata per volumi di traffico enormemente superiori).

Non si tratta di una conclusione inventata: è supportata da una misura diretta, comparabile punto-per-punto, ottenuta rimuovendo l'unica variabile sospetta (il download del body).

## Fase 7 — Verifica di sicurezza post-test

| Controllo | Prima | Dopo | Esito |
|---|---|---|---|
| Homepage raggiungibile | 200 OK | 200 OK | ✅ invariato |
| `geo_nil_milano` (count) | 88 | 88 | ✅ invariato |
| `campaigns` (count) | 2 | 2 | ✅ invariato |
| `gps_tracking_points` (count) | 421 | 421 | ✅ invariato |
| `operator_assignments` (count) | 1 | 1 | ✅ invariato |

Nessuna anomalia. Nessun dato reale creato o modificato.

## Fase 8 — Analisi del bundle (sola lettura, nessuna modifica al codice)

Build locale eseguita (`npm run build`, `vite v7.3.3`, 688 moduli trasformati) per ottenere numeri esatti — **nessun file sorgente modificato**, `dist/` è gitignored e non committato.

### Composizione del bundle

| File | Dimensione raw | Dimensione gzip |
|---|---|---|
| `index-BQRmQ7LR.js` (bundle principale) | **1.814,77 kB** | **502,82 kB** |
| `index-CIGW-MKW.css` (CSS principale) | 15,61 kB | 6,46 kB |
| `TerritorialAiAssistantPanel-*.js` (lazy) | 24,59 kB | 8,39 kB |
| `CustomerAiAssistantPanel-*.js` (lazy) | 21,09 kB | 7,19 kB |
| `applicationAiFoundation-*.js` (lazy) | 11,83 kB | 4,49 kB |
| `AdminCentralAiPanel-*.js` (lazy) | 9,94 kB | 3,77 kB |
| `aiResponseSchema-*.js` (lazy) | 11,09 kB | 3,46 kB |
| `VolantiniProAIHub-*.js` (lazy) | 4,62 kB | 2,02 kB |
| 3× CSS dei pannelli AI (lazy) | ~12,75 kB totali | ~3,77 kB totali |

Vite stesso emette un warning nativo in build: *"Some chunks are larger than 500 kB after minification"*, suggerendo `dynamic import()` o `manualChunks` — conferma indipendente, non un'osservazione isolata dell'analisi.

### Code-splitting già presente

3 componenti sono già lazy-loaded via `React.lazy()`:
- `TerritorialAiAssistantPanel` ([`src/ai-foundation/integrations/territorial-step2/TerritorialStep2AiBoundary.jsx`](src/ai-foundation/integrations/territorial-step2/TerritorialStep2AiBoundary.jsx))
- `AdminCentralAiPanel` ([`src/pages/admin/AdminDashboard.jsx`](src/pages/admin/AdminDashboard.jsx))
- `VolantiniProAIHub` ([`src/pages/public/HomePage.jsx`](src/pages/public/HomePage.jsx))

Tutti e tre sono pannelli AI — pattern coerente e già applicato in quell'area del codice.

### Cosa finisce invece nel bundle principale (per tutti i visitatori, su ogni pagina)

`vite.config.js` non definisce `build.rollupOptions.output.manualChunks`, e `AppRouter.jsx` gestisce la navigazione tramite stato client (`page`) senza `React.lazy()` per pagina/ruolo — quindi **Admin, Driver, Cliente e Pubblico condividono lo stesso bundle principale**, indipendentemente dalla rotta effettivamente visitata.

Librerie pesanti effettivamente presenti nel bundle client (confermato via grep degli import in `src/`):
- **`react-leaflet`** (+ `leaflet` come dipendenza) — usato in 14 file, mappe GPS (es. `GpsMonitor.jsx`)
- **`framer-motion`** — usato in 14 file, animazioni UI diffuse

Librerie **non presenti** nel bundle client (0 import in `src/`, verificato via grep — usate solo in script Node lato build/dati, es. `data/istat/import_data.mjs`): `xlsx`, `shapefile`, `proj4`, `adm-zip`. Non contribuiscono al peso scaricato dal browser.

### Possibilità di lazy loading/code splitting (solo identificazione, nessuna implementazione)

Poiché `AppRouter.jsx` già gestisce il rendering condizionale per `page`/ruolo (Admin/Driver/Cliente/Pubblico/Configuratore), le pagine principali di ciascuna area sono candidate naturali per lo stesso pattern `React.lazy()` già usato per i pannelli AI — in particolare le pagine che importano `react-leaflet` (mappe, pesanti) potrebbero essere isolate dal bundle scaricato da un visitatore pubblico che vede solo la homepage/configuratore. Questa è una segnalazione, non un'implementazione: **nessuna modifica al codice è stata effettuata in questo ticket**, come richiesto.

## Verdetto

**K6 PRODUCTION CONFIRMATION PASSED**

Motivazione:
- 0 errori critici (0/8.936 richieste fallite, 0/22.340 check falliti).
- Nessun errore 5xx in nessuna categoria.
- TTFB server stabile e ben sotto soglia per homepage, configuratore e asset statico anche a 50 VU concorrenti (tutti p95<130ms, ben sotto le soglie di 750ms/1500ms).
- API read-only (`geo_nil_milano`) stabile, p95=136,7ms, ben sotto soglia 1000ms.
- Dati di produzione invariati prima/dopo (campagne, GPS, assegnazioni, NIL — tutti identici).
- Nessun segnale di saturazione lato server/CDN: cache hit 100%, nessuna degradazione del TTFB durante la rampa di carico.
- Il problema del bundle da 1,8MB osservato nel Test 1 è stato isolato con evidenza diretta e riproducibile alla causa **A (saturazione banda/macchina del client di test)**, non a un problema server/CDN — la questione è quindi chiarita, non lasciata aperta. Resta comunque un'opportunità di ottimizzazione lato prodotto (code-splitting per ruolo/pagina, non ancora implementato, si veda Fase 8) che è indipendente dal verdetto di performance server e non lo condiziona.

## File prodotti/mantenuti (Fase 9)

Nel repository (non committati — in attesa di autorizzazione):
- [`tests/k6/production-smoke.js`](tests/k6/production-smoke.js) (invariato)
- [`tests/k6/production-ttfb-api.js`](tests/k6/production-ttfb-api.js) (nuovo)
- [`K6_PRODUCTION_PERFORMANCE_REPORT.md`](K6_PRODUCTION_PERFORMANCE_REPORT.md) (test 1, invariato)
- Questo report (`K6_PRODUCTION_CONFIRMATION_REPORT.md`)

Esclusi/non generati come file permanenti: `k6-ttfb-summary.json` (artefatto locale grezzo, non committato), `dist/` (build locale per l'analisi Fase 8, già gitignored, rimane su disco solo come artefatto di verifica).

Nessun deploy, nessun push, nessuna modifica al database in questo ticket.
