# K6 Production Performance Report — VolantiniPro

**Ticket**: K6-PRODUCTION-SMOKE-1
**Target**: `https://www.volantinipro.it` (produzione reale)
**Data**: 2026-08-07
**Eseguito da**: agente, in locale, con `k6 v2.0.0-rc1` (Windows)
**Script**: [`tests/k6/production-smoke.js`](tests/k6/production-smoke.js)

## Ambito e regole rispettate

- Nessuna modifica a dati reali, nessuna campagna/assegnazione/sessione GPS creata, nessuna foto inviata, nessuna RPC di scrittura chiamata.
- Endpoint testati: homepage (`/`), asset statici JS/CSS del bundle, e un'unica chiamata REST read-only (`GET /rest/v1/geo_nil_milano?select=id&limit=1`) con l'`apikey` publishable (pubblica per design, già distribuita a ogni visitatore reale — non un segreto).
- Nessuna RPC chiamata nel test di carico (l'endpoint `get_nil_breakdown_in_radius` era stato sondato in fase di ricognizione con una singola chiamata, ma **escluso** dal test di carico per prudenza).
- Nessun deploy, nessun push, nessuna modifica DB in questo ticket.

## Fase 1 — k6 installato

`k6 v2.0.0-rc1` già presente (`C:\Program Files\k6\k6`). Nessuna installazione necessaria.

## Fase 5 — Esecuzione

### Test minimo (1 VU, 10s) — PASS

Eseguito prima del profilo completo, come richiesto. Primo run: 2 problemi rilevati e diagnosticati (non bug di produzione):
1. Check "homepage has content" con soglia troppo alta (>500 byte) — la shell reale della SPA è 409 byte (`<div id="root">` + tag script/link). Corretto a >200 byte + presenza di `id="root"`.
2. Soglia p95<1500ms superata a causa del bundle JS (1.8MB): confermato via `curl` seriale (zero concorrenza) che il download richiede 3-6s anche senza alcun carico k6 — è latenza dominata dalla dimensione del payload e dal percorso di rete del test-runner verso l'edge CDN, non un problema di performance server-side. Soglia riscoperta per applicarsi solo a homepage e chiamata REST ("pagine/API normali", come specificato dal ticket); la latenza degli asset statici resta misurata e riportata separatamente, senza condizionare il verdetto sulle soglie formali.

Rerun dopo le correzioni: **23/23 check PASS, 0 errori, 0 5xx**, soglie rispettate.

### Test completo (5→20→50 VU) — eseguito

Profilo: 5 VU/30s → 20 VU/1min → 50 VU/1min → rampa a 0/30s. Nessuna condizione di STOP (5xx, rate limiting anomalo, instabilità) è comparsa durante l'esecuzione.

## Fase 4 — Soglie e metriche

| Metrica | Valore | Soglia | Esito |
|---|---|---|---|
| `http_req_failed` | 0.00% (0/541) | < 1% | ✅ PASS |
| `http_req_duration{homepage}` p95 | 299.69 ms | < 1500 ms | ✅ PASS |
| `http_req_duration{rest_readonly}` p95 | 470.55 ms | < 1500 ms | ✅ PASS |
| Errori 5xx | 0 | 0 | ✅ PASS |
| Crash frontend/backend | Nessuno osservato | — | ✅ PASS |

### Dettaglio per categoria

| Endpoint | Richieste | avg | med (p50) | p90 | p95 | max |
|---|---|---|---|---|---|---|
| Homepage (`/`) | 165 | 131.8 ms | 97.5 ms | 199.6 ms | 299.7 ms | 655.0 ms |
| REST read-only (`geo_nil_milano`) | 60 | 237.0 ms | 190.9 ms | 363.2 ms | 470.6 ms | 1448.6 ms |
| Asset statici (JS/CSS) | 316 | 12.85 s | 1.08 s | 42.04 s | 45.59 s | 51.72 s |
| **Tutte le richieste** | **541** | 7.57 s | 233.4 ms | 36.26 s | 42.78 s | 51.72 s |

**p99**: non disponibile — il riepilogo predefinito di k6 calcola solo avg/med/p90/p95/max; calcolarlo avrebbe richiesto una configurazione diversa (`--summary-trend-stats`) e quindi una seconda esecuzione completa contro produzione, evitata deliberatamente per non generare carico aggiuntivo non necessario, in linea con la regola "non stressare in modo aggressivo".

### Throughput e volume

- Richieste totali: **541** (167 iterazioni complete, 8 interrotte dalla rampa finale a 0)
- VU massimi: **50**
- Durata totale: **~3m15s** (3m00s profilo + graceful ramp-down)
- Throughput: **2.77 req/s** medio
- Error rate: **0.00%**
- Dati ricevuti: 302 MB / Dati inviati: 951 kB

### Endpoint più lento

Gli **asset statici** (bundle JS da 1.8MB) sono, in valore assoluto, la categoria più lenta (p95=45.59s, max=51.72s sotto 50 VU concorrenti). Analisi della causa:

- `http_req_waiting` (tempo alla prima risposta del server, TTFB) è rimasto **basso e stabile per tutta la durata del test**: p95 = 229.5 ms anche a 50 VU concorrenti. Questo indica che il server/CDN ha continuato a rispondere rapidamente.
- `http_req_receiving` (tempo di trasferimento del corpo della risposta) è invece esploso: p95 = 42.57s. Questo è il sintomo classico di **saturazione di banda del client di test** (50 VU che scaricano ripetutamente un payload da 1.8MB dalla stessa macchina/connessione), non di un rallentamento lato server.
- L'asset è servito dalla CDN di Vercel già in cache (`X-Vercel-Cache: HIT` osservato in fase di ricognizione), quindi non richiede elaborazione origin-side.
- **Conclusione**: la degradazione osservata sugli asset statici è, con alta probabilità, un artefatto del test-runner a macchina singola (limite di banda in uscita), non un'evidenza di degrado reale della produzione. Non è però possibile escluderlo con certezza assoluta senza un'infrastruttura di carico distribuita, quindi va segnalato come limite della metodologia di test piuttosto che come fatto accertato.

## Fase 6 — Verifica post-test (sola lettura)

| Controllo | Prima del test | Dopo il test | Esito |
|---|---|---|---|
| Homepage raggiungibile | 200 OK | 200 OK | ✅ invariato |
| `geo_nil_milano` (count) | 88 | 88 | ✅ invariato |
| `campaigns` (count) | 2 | 2 | ✅ invariato |
| `gps_tracking_points` (count) | 421 | 421 | ✅ invariato |
| `operator_assignments` (count) | 1 | 1 | ✅ invariato |

Nessun nuovo dato creato. Nessuna modifica rilevata in nessuna tabella controllata.

## Verdetto

**K6 PRODUCTION SMOKE PARTIAL**

Motivazione:
- Tutte le soglie formali definite dal ticket (`http_req_failed<1%`, `p95<1500ms` per pagine/API normali, zero 5xx, zero crash) sono state rispettate al 100%.
- Zero errori, zero check falliti (1247/1247 PASS), zero dati reali modificati o creati.
- Non dichiarato **PASSED** perché è stata osservata una degradazione di latenza pesante e reale sui download degli asset statici (p95=45.6s) durante la fase a 50 VU — anche se l'analisi (TTFB stabile, CDN cache-hit, saturazione banda lato client) indica con alta probabilità un artefatto del test-runner a macchina singola piuttosto che un problema server-side, questo non è stato verificato con certezza assoluta (es. da una postazione di rete diversa o infrastruttura di carico distribuita), e il ticket chiede esplicitamente di segnalare come STOP/degrado ogni rallentamento marcato dei tempi di risposta.
- Non dichiarato **FAILED** perché nessuna soglia formale è stata violata, non ci sono stati errori 5xx, il sito è rimasto pienamente raggiungibile e funzionante durante e dopo il test, e i dati di produzione sono rimasti invariati.

## File prodotti

- [`tests/k6/production-smoke.js`](tests/k6/production-smoke.js) — script del test
- `k6-summary.json` — riepilogo grezzo dell'esecuzione completa (non committato, artefatto locale)
- Questo report

Nessun deploy, nessun push, nessuna modifica al database in questo ticket.
