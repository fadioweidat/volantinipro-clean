# Step 2 / Report territoriale — evidenza di accettazione

Data della prova browser: 2026-07-17. Route: `http://localhost:5173/` → Step 2 → comune Varedo (fixture API), servizio Door to Door, 10.000 volantini.

## Risultato reale

La suite automatica e la prova browser fixture passano. La matrice completa “10/10 required” non è ancora certificabile: non sono state eseguite tutte le 24 configurazioni live richieste (Milano, multi-comune, CAP, raggio da indirizzo e dataset reali in produzione). Stato: **NOT ACCEPTED come 10/10** fino a quella verifica.

## Evidenza eseguita

- `npm test`: 17 test pipeline + 11 metriche operative + 10 modello canonico = 38 PASS, 0 FAIL.
- `node tests/browser_step2_residual.cjs`: PASS; 0 page error; persistenza Step 2 → Step 3 → Step 2; cambio D2D/H2H/Business; PDF; tastiera; overflow verificato a 1440, 1366, 1024, 768 e 390 px.
- `npm run build`: PASS (`vite build`).
- Screenshot dopo la correzione: `artifacts/ux-step2-residual-2026-07-16/06-report-copertura-semantica.png`, `07-report-adatta-semantica.png`, `09-fonti-confidenza.png`, `12-desktop-1440.png`, `12b-desktop-1366.png`, `13-tablet-768.png`, `14-mobile-390.png`, `15-vista-cliente-mobile-390.png`.

## Correzioni principali

1. `src/lib/step2/buildStep2TruthModel.js` è la fonte canonica condivisa: territorio, servizio, quantità inserita/corrente, fabbisogno base, margine, raccomandata, mancante, surplus, zone disponibili/coinvolte/complete/parziali/escluse, ranking, allocazione, copertura, durata, score, fonti e confidenza.
2. Copertura operativa: `quantità scenario corrente ÷ fabbisogno operativo consigliato × 100`; non è mescolata con copertura famiglie o territoriale.
3. Durata: `quantità ÷ capacità giornaliera per operatore`; i giorni di calendario restano “Durata non calcolabile” senza numero operatori. Con operatori validi: `ceil(quantità ÷ capacità ÷ operatori)`.
4. L’allocazione riconcilia la quantità corrente; l’eccedenza è esplicita e non gonfia la percentuale oltre 100%.
5. Fonti: provider, livello geografico, periodo restituito, stato ufficiale/stima, metodo, affidabilità e limiti. GTFS è dichiarato programmato, non real-time; Google Places non viene citato quando non interrogato; edifici/DUSAF/ATECO restano non disponibili.
6. Report responsive: tabelle in schede su mobile, wrapping desktop, confidenza distinta per copertura, demografia, edifici, economia/OMI, mobilità/POI, business e raccomandazione.

## File modificati per questa correzione

- `volantinipro-final.jsx`
- `src/lib/step2/buildStep2TruthModel.js`
- `src/lib/step2/operationalMetrics.js`
- `src/pages/TerritorialReport.jsx`
- `src/lib/pdf/printTerritorialReportPdf.js`
- `tests/step2_truth_model.test.mjs`
- `tests/step2_operational_metrics.test.mjs`
- `tests/browser_step2_residual.cjs`
- `package.json`

## Limitazioni residue

- Il numero di operatori non è ancora un input cliente: per questo nessuna schermata dichiara giorni calendario.
- La fixture browser copre Varedo; la verifica live delle 10 configurazioni cliente e delle 14 sezioni report richieste dall’allegato resta da eseguire con dati backend reali.
- Dataset edifici/DUSAF, composizione nuclei, ATECO/aree produttive e punti di consegna non sono collegati e non alimentano raccomandazioni.
- Il warning di chunk >800 kB di Vite è non bloccante.
