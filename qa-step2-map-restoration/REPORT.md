# Step 2 Milano — ripristino capacità mappa

Commit implementazione: `24d7ec8`. Baseline: `1b98cf9`.
Confronto storico: `6cf46dd` (prima della semplificazione) → `ea8c373` (redesign).

## ROOT CAUSE
La semplificazione passava `[]` a `mapCoverageZones` e limitava `zonesWithCoords` ai NIL già selezionati. Una selezione vuota non aveva più poligoni cliccabili; in Raggio sparivano i territori. Inoltre `toggleNilZone` impediva di rimuovere l’ultimo NIL. Prima della scelta della modalità, `zonesInRadius` è volutamente vuoto: per il solo contesto iniziale la mappa ora legge gli stessi NIL canonici della ricerca, senza sbloccare i calcoli o selezionare BRUZZANO.

Riprodotto PRIMA delle modifiche: cliente anonimo, Via Antonio Oroboni Milano, Chrome 1440×900, `/configuratore?step=2&service=d2d&qty=10000`. Zero poligoni in stato iniziale, Quartieri e Raggio 3 km. Vedi `BASELINE.md`, `baseline.json` e screenshot baseline.

## FILES CHANGED
- `src/components/Step2Map.jsx`: rendering, colori contenente/selezionato, visibilità e click canonici; marker e confine principale.
- `src/pages/public/configurator/Step2.jsx`: ripristino props canoniche, contesto iniziale API, rimozione ultimo NIL, aggregazione presentazionale per Comune.
- `src/pages/public/configurator/step2/Step2MapPanel.jsx`: piccoli toggle Comuni/NIL con `activeMapLayers` esistente.
- `src/pages/public/configurator/step2/MilanoTerritorySummary.jsx`: raggio, Comuni, percentuali e NIL in dettaglio collassato.
- `src/pages/public/configurator/step2/milano-client.css`: stile locale toolbar e lista compatta.
- `tests/step2_map_restoration.test.mjs`: regressioni rendering/state, metrica e layer.
- `qa-step2-map-restoration/`: script riproducibili ed evidenze.

MAP LOGIC CHANGED: YES — rendering, visibilità, distinzione contenente/selezionato e click.
BUSINESS LOGIC CHANGED: NO — nessuna modifica a coverage, allocation, pricing, PostGIS, geocoder, Supabase, DB, payload Step 3, Step 4 o Smart Pairing.

## Percentuali: significato e riuso
Audit di `zonesWithCoords.weightPct`, `residentialRadiusRows`, `residentialRows`, `zonesInRadius`, `intersectedNils`, `intersectedExternalComuni`, `zonesAllocation` e `toggleZone`.
La percentuale precedente è `residentialRows.contribution`: quota arrotondata delle famiglie dei territori nel raggio. Non è superficie, copertura o allocazione; `strength` è invece uno score e non viene usato come percentuale.
I NIL di Milano sono raggruppati per Comune solo nella presentazione, riutilizzando `residentialRows` sui valori canonici, senza algoritmo GIS nuovo. La lista viene etichettata «Quota delle famiglie stimate nel raggio» e segnala gli arrotondamenti. Quote positive arrotondate a zero sono mostrate `<1%`.
Prova locale a 3 km: Milano 62%, Bresso 12%, Cormano 10%, Novate Milanese 9%, Cusano Milanino 5%, Paderno Dugnano <1%, Bollate 1%, Cinisello Balsamo <1%. I valori arrotondati numerici sommano 99%; la tolleranza prevista è verificata. Nessun numero è hardcoded nel prodotto.

## Runtime locale con endpoint reali
`node qa-step2-map-restoration/acceptance.mjs`: PASS desktop 1440×900, Samsung 412×915, iPhone 390×844. Contesti browser puliti, nessun mock o modifica della selezione via API. Click con `page.mouse` all’interno dei poligoni Leaflet reali, conteggio dei path effettivamente montati e screenshot.
- A / NIL LAYER TOGGLE: PASS. 88 NIL iniziali, confine Milano presente; OFF nasconde NIL e conserva selezione/confine, ON ripristina.
- B / NIL CLICK ADD: PASS. BRUZZANO aggiunto tramite mappa e riconosciuto dalla ricerca.
- B / NIL CLICK REMOVE: PASS. Secondo click rimuove anche l’ultimo NIL; riepilogo torna da scegliere, CTA disabilitata.
- C / MULTI NIL: PASS. BRUZZANO + COMASINA, due selezioni canoniche, quantità/copertura coerenti. Ricerca e mappa sincronizzate in entrambe le direzioni.
- D / RADIUS MUNICIPALITY BOUNDARIES: PASS. Cerchi reali 500/1000/2000/3000 metri sul punto cercato. Confine principale e Comuni esterni renderizzati; toggle indipendente.
- D / RADIUS NIL BOUNDARIES: PASS. NIL reali intersecati, toggle indipendente. A 3 km 19 poligoni: 12 NIL e 7 Comuni esterni.
- E / RADIUS MUNICIPALITY PERCENTAGES: PASS. Otto Comuni con quote canoniche, lista e totale arrotondato verificati.
- F / NIL → RADIUS → NIL: PASS. Rientro con selezione vuota, 88 NIL, nuova selezione funzionante.
- G / ADDRESS CONTAINING NIL != SELECTED NIL: PASS. BRUZZANO blu tratteggiato come riferimento, zero selezioni automatiche; verde solo dopo click.
- DESKTOP / SAMSUNG / IPHONE: PASS locale, nessun overflow orizzontale o page error; sidebar nel flusso su mobile. Una scelta di modalità, un riepilogo, dettagli avanzati collassati.

## Test e build
BUILD: PASS (`npm run build`).
TARGETED TESTS: PASS 56/56; ulteriori 9/9 per contratto hero-map/dipendenze e ripristino.
NPM TEST: PASS 1922/1922 con `node --test-concurrency=4` sulla stessa lista dello script `npm test`, senza cambiare test o soglie. Il primo giro aveva un errore statico sull’ordine delle dipendenze, corretto; il giro `npm test` successivo ha registrato 1921/1922 per un benchmark temporale Map Studio sotto carico (500 feature 6,6 ms; 2500 feature 120,1 ms). La riesecuzione a concorrenza limitata passa interamente.
TEST:ALL: FAIL ambientale — 2856 pass, 12 fail, 1 skip, 2869 totali. Quattro errori migration AI, uno messaggistica admin, sei supplier workflow, uno RPC territory sectors: accesso a rete/servizi esterni negato (`fetch failed`, `EACCES`). I test Step 2 passano. Non sono stati modificati DB, credenziali o test esterni per forzare verde.

## Deployment e produzione
VERCEL: SUCCESS — https://vercel.com/fenicesp-gmailcoms-projects/volantinipro/DYWuW1Y4wM117n9NNBDXJ7Edcsn5
PRODUCTION: PASS desktop 1440×900, Samsung 412×915 e iPhone 390×844. Script `production.mjs` con mouse reale sul canvas Leaflet e contesti browser distinti. Tutti e tre completano nove scenari: 88 NIL iniziali, confine Milano, add/remove BRUZZANO, multi-NIL, 500 m/1/2/3 km, confini comunali/NIL, toggle e ritorno NIL. A 3 km: 12 NIL e 8 Comuni esterni renderizzati, confine principale e cerchio geodesico di 3000 m. Gli indicatori pubblici a 3 km elencano Milano 63%, Bresso 13%, Cormano 10%, Novate Milanese 8%, Cusano Milanino 5% e gli altri `<1%`; differiscono dalla prova locale perché il risultato geocoder pubblico restituisce un punto Oroboni differente. Nessun valore hardcoded.
La verifica pubblica legge il ref Leaflet esistente per localizzare i poligoni e usa click reali; non abilita diagnostica nel prodotto e non modifica stato/dati applicativi via codice.

## Stato finale
CODE: PASS
TESTS: PARTIAL — test mirati e suite npm a concorrenza limitata verdi; `test:all` con 12 errori di accesso ai servizi esterni.
BUILD: PASS
RUNTIME: PASS locale
PRODUCTION: PASS — nove scenari in ciascuno dei tre viewport pubblici, con poligoni realmente montati e cliccati.
ORIGINAL USER SCENARIO: PASS locale e pubblico
REGRESSION: PARTIAL — contratti locali verdi; integrazioni esterne non verificabili nell’ambiente ristretto.
PERFORMANCE: NOT APPLICABLE
OVERALL: PARTIALLY VERIFIED: tutti i requisiti A–G sono confermati nel browser locale e pubblico; la suite estesa mantiene 12 test esterni non verificabili per EACCES.
