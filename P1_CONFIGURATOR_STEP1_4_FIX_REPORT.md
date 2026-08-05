# P1 Configuratore Step 1–4 — rapporto locale

Data verifica: 5 agosto 2026  
Branch: `feat/full-site-final`  
Ambiente: esclusivamente locale; nessun uso di Vercel e nessun push.

## Stato iniziale

- Worktree iniziale: tre report P0/audit non tracciati, lasciati invariati.
- Git HEAD iniziale P1: `14c4f07`.
- Supabase, database ed Edge runtime locali: attivi.
- Migrazioni allineate iniziali: 48.
- Pipeline iniziale: 177 test PASS; build PASS (669 moduli).
- Dataset iniziali: `map_sectors` 6.100 righe; OMI, POI, GTFS, civici e geometrie comunali non popolati.
- Import locale ISTAT eseguito senza persistere credenziali: 1.502 comuni, 1.502 record demografici e 1.502 economici. I file dati tracciati riscritti dall'import sono stati ripristinati byte-for-byte.

## Bug applicativi dimostrati e corretti

1. Lo stato Step 1 viveva soltanto nello state React: reload e popstate potevano perdere selezioni. Aggiunta persistenza versionata in localStorage e snapshot in `history.state`; la query string resta la sorgente prioritaria quando presente.
2. Il cambio servizio poteva lasciare territorio/calendario del servizio precedente. Ora conserva i campi Step 1 e invalida soltanto lo stato incompatibile.
3. Step 2 fabbricava una zona generica quando il backend non restituiva breakdown. Ora espone lista vuota/dato non disponibile.
4. Le Edge Functions territoriali ricevevano `permission denied` sulle tabelle locali. Aggiunti esclusivamente i grant `service_role` necessari alle letture territoriali.
5. Step 3 interrogava tabelle inesistenti per la disponibilità. La nuova funzione locale calcola capacità reale da `campaigns`, senza identità cliente nell'output.
6. Date calendario non ISO, selezione normale persa e pairing non coerente. Normalizzati ISO, offset, capacità e selezionabilità.
7. Step 1 dichiarava urgenza +20% mentre il preventivo applicava +30%. Etichetta corretta a +30%.
8. UI, payload DB e PDF potevano divergere nei calcoli. Ora usano lo stesso modello prezzo; il mese PDF è corretto e null resta distinto dallo zero.
9. Browser Step 4 riproduceva `Cannot read properties of null (reading 'toLocaleString')`. Il riepilogo ora tratta copertura/fabbisogno mancanti come non disponibili e non come zero.
10. `saveCampaign` eseguiva upsert su `profiles`, ma JWT cliente riceveva HTTP 403: mancavano policy INSERT e grant. Aggiunte policy per-owner e grant minimo, sempre sotto RLS.
11. Lo script browser online puntava a un percorso Playwright non più esistente e a route/selettori precedenti. Allineato al runtime e alle route SPA correnti.

## File modificati nella fase

- Stato/routing: `src/lib/configuratorState.js`, `src/lib/configuratorServiceTransition.js`, `src/app/AppRouter.jsx`.
- Step 1/2: `src/pages/public/configurator/Step1.jsx`, `src/lib/step2/zoneGeoHelpers.js`.
- Step 3: `src/lib/smartPairingAvailability.js`, `supabase/functions/smart-pairing-availability/index.ts`.
- Step 4/PDF: `src/lib/quotePricing.js`, `src/lib/utils/format.js`, `src/pages/public/configurator/Step4.jsx`, `src/lib/pdf/printQuotePdf.js`, `src/lib/pdf/generateQuotePdf.js`.
- DB: migrazioni `20260805000007`, `20260805000008`, `20260805000009`.
- Test/pipeline: `tests/configurator_step1_4.test.mjs`, `tests/browser_step2_online_verification.cjs`, `package.json`.

## Matrice dello stato

| Campo | Origine | Persistenza/route | Step successivo e DB/PDF | Reload/back-forward | Esito |
|---|---|---|---|---|---|
| servizio | Step 1 / query `service` | draft + history + query | Step 2–4, `campaigns.service_type`, PDF | preservato; cambio servizio invalida solo dati incompatibili | PASS |
| quantità | Step 1 / query `qty` | draft + history + query | copertura, prezzo, DB e PDF condivisi | preservata, inclusi zero e limiti testati | PASS |
| formato/stampa | Step 1 | draft + history | riepilogo, metadata DB, PDF | preservati | PASS |
| urgenza | Step 1 / query | draft + history | +30% una sola volta in prezzo/DB/PDF | preservata | PASS |
| frequenza | Step 1 | draft + history | piano e sconto Step 4 | preservata | PASS |
| zona/raggio | Step 2 | draft + history | Step 3–4 e metadata | preservati nel flusso Varedo | PASS applicativo; dati parziali |
| date/pairing | Step 3 | draft + history | riepilogo, DB, PDF | ISO e selezione persistente | PASS applicativo |
| extra | Step 4 | stato configuratore | prezzo, DB, PDF | persistiti nel draft | PASS |
| totale | calcolo canonico Step 4 | derivato, non duplicato | UI = payload DB = modello PDF | zero distinto da null | PASS |

## Step 1

- D2D, H2H e Business, preset/quantità, materiale, stampa, frequenza, urgenza e CTA coperti dalla suite di stato/transizione.
- Reload e history back/forward: PASS sia nella suite sia in Chrome headless.
- Browser: render PASS, route `step=1`, CTA presente, 4.251 ms nella misurazione completa (include avvio/caricamento locale).
- Nessun page error. Un warning/errore console non bloccante legato a risorsa locale.

## Step 2 Door to Door

### Varedo reale locale

- Scenario browser online senza interception/mock: PASS.
- Calcolo `ready`, confine presente, 6.176 famiglie, fabbisogno base 6.176, raccomandato 6.794, copertura 100%.
- Step 2 → Step 3 → back Step 2: territorio, quantità, fabbisogno, copertura e selezioni tutti persistenti.
- 19 richieste rilevanti osservate, 29 request failure complessive dovute soprattutto a tile Mapbox senza chiave, Overpass esterno e retry/endpoint non disponibili; nessun page error.

### Milano/NIL

- Comune Milano e richiesta `analysis_level=nil`: raggiunti correttamente.
- NIL restituiti: 0; NIL con geometria: 0.
- Pertanto non sono dimostrabili 88 NIL totali, circa 37 a 3 km, 88 a 15 km, hover/tooltip singolo e card fuori poligono.
- La deduplica per `nil_code` conserva 88 record in test ufficiale; non viene usato `municipality_code` come identità NIL.
- Nessun fallback Duomo e nessuna zona generica fabbricata; assenza dati resa come indisponibilità.
- OMI/civici: dataset locale assente o import OMI fornito senza righe utilizzabili; indicati come non disponibili.

## Step 2 Hand to Hand

- Stato e metriche restano isolati da D2D/B2B nelle suite ufficiali.
- Chiamata Edge reale: `POI_DATA_NOT_AVAILABLE`.
- POI, TPL, competitor e densità commerciale non sono dimostrabili end-to-end perché provider/dataset locali non sono configurati o popolati. Nessun dato D2D viene presentato come prova H2H.

## Step 2 Business

- Cambio servizio, categorie/materiali, metriche e isolamento da D2D/H2H coperti dalle suite ufficiali.
- Chiamata Edge reale: `POI_DATA_NOT_AVAILABLE`.
- Cluster/POI/breakdown reali non sono dimostrabili nell'ambiente locale; nessun fallback è stato promosso a prova.

## AI territoriale

- Auth locale con utente temporaneo reale: PASS.
- JWT utente valido; nessun service role usato come identità UI.
- Prima chiamata `ai-assistant-territory`: HTTP 200, status `ai`, latenza 8.326 ms.
- Risposta sintetica: suggerisce di segmentare l'area milanese e distribuire in base alla densità delle famiglie verificate nello snapshot.
- Seconda chiamata identica: HTTP 200, status `ai_cached`, 1.980 ms; risposta identica.
- Warning funzione: nessuno. Cache vincolata a `user_id + payload_hash`; account/cache temporanei eliminati.

## Step 3 — calendario e Smart Pairing

- Funzione reale locale: HTTP 200, source `campaign_capacity`, 77 date prenotabili, capacità giornaliera 4; DB vuoto quindi zero pairing iniziali; 1.668 ms.
- Fixture DB isolata e poi eliminata: stessa zona -40%/2 posti, zona vicina -20%/3 posti, data esaurita esclusa.
- Offset ammessi: +5/+6/+7/+12/+13/+14; nessuna data passata e nessun doppio sconto.
- Browser senza sessione completa segnala `SMART_PAIRING_BACKEND_NOT_CONFIGURED`: limite di quella navigazione anonima, non usato come prova positiva.

## Step 4, salvataggio e PDF

- Browser post-fix: render PASS, zero page error, 5.931 ms; dato territoriale mancante visualizzato come “—/dato non disponibile”.
- Prezzo: null, zero, valore positivo, urgenza +30%, sconto pairing e piano coperti; nessun doppio sconto.
- UI, payload `total_amount` e modello PDF condividono lo stesso totale.
- PDF generato dalla suite: firma/struttura valida.
- Salvataggio reale con Cliente A: profilo PASS, HTTP 201, owner e importo corretti.
- Cliente A legge la campagna; Cliente B riceve zero righe. Inserimento B con owner A: HTTP 403. Fixture eliminate.

## Flussi end-to-end richiesti

| Flusso | Esito | Evidenza/limite |
|---|---|---|
| D2D Varedo comune → Step 3 → back | PASS | dati ISTAT/PostGIS locali, KPI e persistenza reali |
| D2D Milano → NIL → preventivo/PDF/save | PARTIAL | percorso raggiunto, ma dataset 88 NIL assente |
| D2D indirizzo/raggio → preventivo | PARTIAL | pipeline/raggio coperti; civici/provider esterni assenti |
| H2H → POI/TPL → preventivo | PARTIAL | logica isolata; fonti POI/GTFS assenti |
| Business → cluster → preventivo | PARTIAL | logica isolata; fonti POI/cluster assenti |
| Step 4 → PDF → DB | PASS | PDF valido e salvataggio/RLS reale verificati separatamente |

## Browser e performance

| Step | Render | Route/CTA | Reload/back-forward | Tempo misurato | Console/network |
|---|---|---|---|---:|---|
| 1 | PASS | `step=1`, CTA presente | PASS | 4.251 ms | 1 warning/errore, 0 page error |
| 2 | PASS | `step=2`, CTA presente | PASS Varedo | 6.649 ms | 2 console, 5 failure nella misura compatta; Mapbox/servizi esterni |
| 3 | PASS | `step=3`, CTA presente | PASS state machine | 2.741 ms | 1 console, 1 failure; backend anonimo non configurato |
| 4 | PASS dopo fix | `step=4`, CTA presenti | draft preservato | 5.931 ms | 0 page error post-fix |

Questi tempi includono caricamento pagina, attese deliberate e dipendenze locali; non sono metriche Web Vitals. INP percepito: nessun blocco osservato nei click dello scenario, ma non dichiarato PASS strumentale perché non è stata raccolta una metrica Event Timing completa. La mappa renderizza il confine Varedo; i tile Mapbox falliscono senza chiave locale. Nessun errore Leaflet fatale.

## Sicurezza e dati

- RLS Cliente A/B: PASS reale.
- Owner campagna: PASS reale.
- Nessun service role nel frontend e nessun bypass aggiunto.
- Nessun segreto, JWT, password o chiave inseriti nel report o nei file tracciati.
- Account e campagne di test eliminati.
- Nessuna query Step 3 verso le vecchie tabelle inesistenti.
- Le fixture isolate non sono state usate come prova dei provider territoriali reali.

## Test, build e migrazioni

- `npm test`: PASS, 191/191 test, 93 test top-level, 0 failure.
- La pipeline ufficiale include ora il test P1 e le suite permanenti Step 2 (operational metrics, truth model, view model, territorial pipeline).
- `npm run build`: PASS, 673 moduli; warning non bloccante sul chunk principale >500 kB.
- `git diff --check`: PASS.
- Migrazioni finali allineate local/remote-local: 51. Le tre aggiunte P1 sono grant territoriali, policy INSERT profile per-owner e relativo grant autenticato minimo.

## Commit P1

1. `f8ffd65 fix(configurator): persist Step 1 state across navigation`
2. `8096a67 fix(step2): restore D2D H2H and Business territorial flows`
3. `e00c348 fix(step3): restore calendar and Smart Pairing logic`
4. `a3f94a7 fix(step4): align quote summary pricing and PDF`
5. `test(configurator): add Step 1-4 end-to-end coverage` — report, test e ultimi difetti dimostrati dal browser/DB.

## Problemi aperti

- Dataset ufficiale completo dei 88 NIL Milano e relativa risposta RPC/Edge assenti localmente.
- OMI locale fornito non ha prodotto righe importabili.
- POI, GTFS, competitor, cluster commerciali e civici non popolati/configurati.
- Mapbox non configurato nel server browser P1; Overpass esterno non affidabile nell'ambiente.
- Lo scenario browser completo Milano/H2H/B2B non può essere dichiarato PASS senza tali fonti reali.
- Bundle principale oltre 500 kB: warning build non bloccante, fuori dallo scope correttivo P1-A.

## Verdetto

**P1 CONFIGURATOR STEP1-4 PARTIAL**

I difetti applicativi riproducibili su stato, transizioni, calendario, prezzo/PDF, null/zero e salvataggio RLS sono corretti e testati. Il verdetto resta PARTIAL esclusivamente perché i flussi territoriali richiesti non possono essere provati senza i dataset/provider reali mancanti.
