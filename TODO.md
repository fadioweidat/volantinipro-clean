# TODO

- Smart Pairing: aggiungere esclusione abbinamento tra campagne dello stesso settore merceologico

- Copertura "media semplice" (da affrontare in un branch separato DOPO il merge della homepage; NON in feat/homepage-real-data-polish).
  Correzione prevista: copertura pesata sulle famiglie direttamente in analysis-istat
  (somma famiglie nel raggio / somma famiglie totali delle zone coinvolte), poi ridistribuire la Edge Function.
  Origine:
  - supabase/functions/analysis-istat/index.ts:363 — avgCoverage = media semplice di pct_copertura per zona;
    restituita come values.copertura_stimata (riga 416).
  Punti in cui arriva al cliente:
  1. Punteggi "Potenziale copertura" / "Efficienza campagna":
     - supabase/functions/analysis-istat/index.ts:365-366 — reach_score = avgCoverage*0.74 + …; roi_score usa avgCoverage/12
     - src/pages/public/configurator/Step2.jsx:4008-4009 (reachScore/roiScore = media di z.reachD2D/z.roiD2D), card a 4655-4679
     - src/pages/public/configurator/Step4.jsx:229-230, card "Potenziale copertura" a 707 e 867
  2. PDF preventivo: src/lib/pdf/generateQuotePdf.js:184 (score "Reach") -> testo "potenziale residenziale" a 202-206.
  3. Step 2, KPI copertura (solo fallback quando requiredFlyers = 0):
     - src/pages/public/configurator/Step2.jsx:3982 — media semplice di z.coverage.
  4. Step 4 riepilogo + righe PDF (solo fallback senza volantini/fabbisogno):
     - src/pages/public/configurator/Step4.jsx:126 avgCov -> usato a 669 (coverageForSummary) e 224 (realCoverage)
     - realCoverage -> coveragePct per comune: src/lib/pdf/generateQuotePdf.js:477, src/lib/pdf/printQuotePdf.js:387;
       stato "Copertura parziale".
  Collegati (somme, non medie, stesso problema di pesatura):
  - src/pages/public/configurator/Step2.jsx:4141 zoneCoveragePctForBox (somma % zone NIL)
  - src/pages/public/configurator/Step2.jsx:4247 marginalZoneCoverage (somma % con tetto 100)
  Già corretti / non coinvolti: hero homepage (b9dc5fe, quota pesata), Preventivo Rapido, assistente AI
  (buildQuoteAssistantContext.js:123/322), report territoriale (buildTerritorialReportSnapshot.js:77), dashboard cliente.
