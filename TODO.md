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

- Rigenerare snapshot hero quando ISTAT pubblica nuovi dati (npm run snapshot:hero, poi commit di src/components/home/heroScenarioSnapshot.json; la data visibile si aggiorna da sola).

- Rigenerare snapshot Milano ("Milano intera", calcolatore homepage e Preventivo Rapido) quando ISTAT pubblica nuovi dati o cambia analysis-istat: npm run snapshot:milano, poi commit di src/lib/quote/milanoWholeCitySnapshot.json (la data visibile si aggiorna da sola). Lo Step 2 resta live.

- Regola: le Edge Functions si distribuiscono solo da integration/rc2-full-site, mai da branch di lavoro.

- Piano B tessere: chiave CARTO commerciale (la crea Fadi), config tessere centralizzata, CARTO come fallback dello Step 2 al posto di quello senza chiave.

- Job pianificato della chat (pg_cron) troppo frequente — da affrontare dopo, nessuna modifica senza OK.
  Analisi 2026-10-22 (supabase inspect db, statistiche degli ultimi 36 giorni, piano Free):
  - call public.dispatch_chat_realtime_outbox(): 319.100 esecuzioni (circa ogni 10 s), 1 h 36 min di tempo database = 64,6% del totale.
  - select public.chat_realtime_outbox_housekeeping(): 2.697 esecuzioni, 39 min = 26,1% (circa 0,9 s ciascuna).
  - ogni esecuzione scrive anche 4-5 righe/aggiornamenti in cron.job_run_details (333.000 insert + update): storico che cresce senza pulizia.
  - net.http_post (con secret dal vault): 10.147 chiamate, 9,6 min.
  - in totale circa 2,5 h in 36 giorni: carico costante e scritture continue, non da solo la causa dei picchi (query banali fino a 6,4 s il 2026-10-22).
  Proposte: eseguire il dispatch solo quando l'outbox ha righe (o a ogni 30-60 s), housekeeping 1 volta all'ora/giorno,
  pulizia periodica di cron.job_run_details (es. tenere 7 giorni). Verificare prima con chi ha sviluppato la chat se 10 s è un requisito.

- Step 4, possibile doppione se il cliente riprova mentre la prima richiesta e' ancora in lavorazione (da valutare dopo).
  Oggi: dopo 60 s il sito smette di aspettare e invita a premere di nuovo "Conferma" (src/lib/campaignSaveTimeout.js).
  submit-campaign-request riconosce la stessa richiesta (impronta: email, comune, quantita', importo, zone) solo se la prima
  e' gia' stata salvata (ricerca su campaigns.metadata.submission_fingerprint negli ultimi 10 minuti, poi insert): due richieste
  in contemporanea possono passare entrambe il controllo e creare due campagne.
  Possibili soluzioni: vincolo unico sull'impronta (indice univoco) o chiave di idempotenza generata dal sito e riusata nel nuovo
  tentativo (tabella edge_idempotency_keys gia' esistente); la funzione in produzione (v12) va prima riallineata al repo.
