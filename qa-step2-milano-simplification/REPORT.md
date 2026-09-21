# Step 2 Milano — semplificazione UX

BASE HEAD: `6cf46dd59f0b396a903254f9bdea306e0ae7ea9d`

IMPLEMENTATION HEAD: `ea8c373c5e657153431ab01c9c5ed725a264467e`

Ramo: `integration/rc2-full-site`. I due commit iniziali sul workflow di review e il commit concorrente `c960718` sui settori sono stati preservati. Nessuna modifica ai settori appartiene a questo ticket. Il commit delle prove segue quello dell'implementazione; FINAL HEAD è riportato nella consegna.

## Risultato e perimetro

Una sola scelta Quartieri/Raggio segue ricerca e mappa. Milano completo è un'azione secondaria. Ricerca NIL, controlli raggio e decisioni quantità compaiono nel contesto pertinente. Un solo riepilogo cliente mostra zona, modalità, famiglie, quantità, copertura e area; i dettagli tecnici sono collassati.

Il punto Oroboni rimane un riferimento iniziale, con marker reale e intero confine di Milano. BRUZZANO è informativo fino alla scelta esplicita. Il confine è blu; i quartieri selezionati restano distinguibili. Il fallback cartografico della sola vista Milano usa OpenStreetMap quando Mapbox non è disponibile, evitando la filigrana del precedente fallback CARTO.

BUSINESS LOGIC CHANGED: NO — nessuna modifica a formule, pricing, quantità, allocazione, API, geocoding, DB o payload.

STEP2 CORE FORMULAS CHANGED: NO.

La transizione UI al NIL manuale ora parte senza selezione automatica: due guardie riusano `selected` e `toggleNilZone`. Non è stato creato uno stato alternativo. `apiZones`, `selZones`, motore di allocazione e handler delle quantità restano le fonti canoniche. Le stime interne di anteprima continuano a esistere: non vengono mostrate come scelta cliente né consentono di proseguire senza selezione esplicita. `canonicalSelectedIds` è stato aggiunto soltanto alla diagnostica per distinguere selezione e anteprima durante le prove.

Il diff dei percorsi protetti `src/lib/step2`, `src/lib/pricing`, `api`, `supabase`, Step3 e Step4 rispetto al BASE HEAD è vuoto. La geometria dei territori non è stata modificata: cambiano solo stile e inquadratura della mappa.

## File dell'implementazione

FILES MODIFIED:

- `src/components/Step2Map.jsx`
- `src/pages/public/configurator/Step2.jsx`
- `src/pages/public/configurator/step2/Step2ComunePanel.jsx`
- `src/pages/public/configurator/step2/Step2MapPanel.jsx`
- `src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx`
- `tests/step2_milano_ux.test.mjs`
- `tests/step2_nil_autocomplete_search.test.mjs`
- `tests/step2_nil_residual_map_click.test.mjs`

FILES CREATED:

- `src/pages/public/configurator/step2/MilanoCoverageModeChooser.jsx`
- `src/pages/public/configurator/step2/MilanoTerritorySummary.jsx`
- `src/pages/public/configurator/step2/milano-client.css`
- Prove, script e report nella cartella `qa-step2-milano-simplification`.

Le assertion aggiornate riguardano esclusivamente disposizione, visibilità e composizione dei controlli. Nessuna assertion di business è stata indebolita. È stata aggiunta una verifica che ricerca NIL e controlli raggio siano reciprocamente esclusivi.

## Accettazione locale con API reali

Cliente anonimo, `/configuratore?step=2&service=d2d&qty=10000`. Nessun mock API. Script ripetibile: `node qa-step2-milano-simplification/acceptance.mjs` con Vite sulla porta 5176. Le prove usano Chrome headless con viewport desktop e mobile, non dispositivi fisici.

I seguenti casi sono PASS su 1440×900, 412×915 e 390×844:

| Verifica | Esito |
| --- | --- |
| MILANO ADDRESS INITIAL STATE | PASS: Oroboni, BRUZZANO informativo, metriche da scegliere, CTA disabilitata |
| MILANO BOUNDARY INITIAL MAP | PASS: geometria interamente nel viewport; indirizzo centrato entro l'arrotondamento grafico di Leaflet |
| AUTO NIL SELECTION REMOVED | PASS: selezione canonica vuota; zero poligoni NIL/copertura iniziali |
| NIL FLOW | PASS: ricerca sul pool di 88 NIL, aggiunta BRUZZANO e COMASINA, metriche reali |
| RADIUS FLOW | PASS: cerchio Leaflet di 500 m sulle coordinate dell'indirizzo, ricerca NIL nascosta |
| NIL → Raggio → NIL | PASS: dataset completo ricaricato, nessuna selezione ereditata dal raggio, nuova selezione funzionante |
| Decisione quantità | PASS: Adatta aggiorna quantità e abilita Continua allo Step 3 |
| DUPLICATE CARDS REMOVED | PASS: due card primarie, Milano completo secondario, riepilogo unico |
| OTHER COMUNI REGRESSION | PASS: ricerca e analisi Varedo, vista ordinaria e fabbisogno disponibile |
| DESKTOP VISUAL | PASS |
| SAMSUNG 412x915 | PASS: card impilate, riepilogo non fisso, nessun overflow |
| IPHONE 390x844 | PASS: card impilate, riepilogo non fisso, nessun overflow |

Anche l'apertura dei dettagli avanzati è stata provata nei tre viewport. Nessun errore JavaScript nei percorsi verificati. `runtime.json` contiene 30 snapshot con selezione, coordinate, layer Leaflet, metriche, confine e overflow.

BRUZZANO: 6.840 famiglie, 7.524 volantini consigliati; valori del motore esistente, non costanti introdotte nella UI. L'azione Adatta li riusa. Le attività commerciali/POI possono mostrare il loro stato asincrono non bloccante: il relativo servizio non è stato modificato.

## Suite e build

| Comando | Esito finale |
| --- | --- |
| `npm run build` | PASS |
| Test mirati Step2 | PASS: 51/51 |
| Test Map Studio performance ricontrollati | PASS: 2/2 |
| `npm test` | PASS: 1.838/1.838 nell'esecuzione finale senza `test:all` in parallelo |
| `npm run test:all` | FAIL: 2.769 passati, 12 falliti, 1 saltato su 2.782; eseguiti tutti i 7 batch |

La precedente esecuzione parallela di `npm test` aveva fallito una soglia temporale di Map Studio; sia il ricontrollo mirato sia la nuova esecuzione completa sono passati senza modificare quel codice o i relativi test.

I 12 fallimenti rimasti in `test:all` sono esterni a questo ticket e appartengono alle stesse integrazioni già segnalate nella precedente consegna Step 1:

- 4 in `ai_action_executions_migration.test.mjs`: connessione/fetch di integrazione.
- 1 in `ai_admin_send_message_phase5b.test.mjs`: sessione/fetch di integrazione.
- 6 in `full_supplier_workflow_acceptance.test.mjs`: creazione/lettura fixture Supabase non riuscita, seguita da fixture nulle.
- 1 in `territory_map_sectors_contract.test.mjs`: RPC Milano Bruzzano senza risposta utilizzabile (`fetch failed`).

Questi test non sono stati modificati. Non sono state eseguite modifiche privilegiate al database per forzarne il risultato. Non si dichiara verde la regressione esterna completa. Conteggi sintetici in `results.json`; log integrali conservati localmente nella stessa cartella.

## Deploy e verifica pubblica

VERCEL: PASS sul commit dell'implementazione, stato GitHub `Vercel: success`.

Deploy: https://vercel.com/fenicesp-gmailcoms-projects/volantinipro/2FSdWb1vkqiSBgE33GMbCjPrWKtv

Sito verificato: https://www.volantinipro.it/configuratore?step=2&service=d2d&qty=10000

PRODUCTION CHECK: PASS desktop e Samsung; NOT VERIFIED iPhone pubblico dopo due timeout territoriali.

Lo script `production.mjs` utilizza una sessione anonima nuova per viewport, geocoder e dati pubblici reali. Verifica stato iniziale non confermato, selezione BRUZZANO, controlli raggio, dettagli collassati, assenza di overflow ed errori JavaScript. Non invia ordini, messaggi né richieste di preventivo. `production.json` registra i risultati. Sul formato iPhone pubblico il caricamento territoriale ha superato 90 secondi e mostrato «Servizio temporaneamente non disponibile. Riprova», anche al ricontrollo. La traccia registra `get_map_sectors` abortita senza una risposta HTTP utile; non è stata dimostrata la causa backend. Screenshot `production-iphone-data-timeout.png`, testo e traccia di rete conservano il blocco. Il codice delle API non è stato modificato. Il caricamento e i flussi dello stesso viewport sono PASS localmente con endpoint reali.

## Stato di accettazione

ROOT CAUSE: Controlli duplicati mostravano più volte la stessa decisione; l'anteprima interna dell'indirizzo appariva come una selezione cliente e il flag della mappa impediva di mostrare il confine nello stato non confermato.

FILES CHANGED: gli 11 file dell'implementazione elencati sopra e le prove di questa cartella.

CODE: PASS

TESTS: FAIL nella suite esterna completa; test mirati e npm test PASS.

BUILD: PASS

RUNTIME: PASS nei tre viewport locali con API reali.

PRODUCTION: NOT VERIFIED completamente — desktop e Samsung PASS; iPhone pubblico bloccato dal servizio territoriale non disponibile.

ORIGINAL USER SCENARIO: PASS nei tre viewport locali.

REGRESSION: PARTIAL — Varedo e flussi Step2 PASS; integrazioni esterne non tutte verdi.

PERFORMANCE: NOT APPLICABLE — nessuna promessa di miglioramento prestazionale.

OVERALL: PARTIALLY VERIFIED — UX richiesta verificata; regressione esterna completa non verde.
