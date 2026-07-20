# P2-F — Rifinitura UX Step 2 per servizio

Branch: `p2f-service-ux` (da `main`, allineato dopo il merge di `fix-ui-step2`).

## Stato precedente

- La tabella di dettaglio zone (Door to Door) mostrava solo una riga riassuntiva per zona, senza possibilità di espandere il dettaglio né un'indicazione visiva della distribuzione assegnata.
- La percentuale di copertura veniva calcolata due volte con arrotondamenti diversi (0 decimali in `serviceKpis.coverage`, 1 decimale in `step2TruthModel.coverage.operationalPct`), risultando in valori discordanti tra banner e riepilogo (es. "22%" vs "21,6%").
- I marker cluster della mappa POI non avevano etichetta accessibile (solo un numero visivo).
- La lista POI Hand to Hand e la lista attività Business non mostravano il Comune di appartenenza, non avevano un click-to-focus sulla mappa, e i filtri categoria Business mostravano sempre tutte le categorie anche quando vuote.
- Il riepilogo KPI per servizio non rifletteva in modo uniforme i concetti "quantità inserita" vs "quantità consigliata", né usava le etichette territoriali corrette (Comuni/NIL).

## Miglioramenti per servizio

### Door to Door (D2D)
- Ogni riga della tabella zone è ora espandibile (▶/▼, `aria-expanded`/`aria-controls`): mostra Comune, famiglie/cassette, quantità assegnata, copertura, priorità e stato. Quando non esistono dati di dettaglio strade/civici (mai presenti nel Truth/View Model), viene mostrato un testo statico "Dettaglio strade non disponibile per questa zona." — nessun dato inventato.
- Badge "Distribuzione assegnata" quando la zona ha una quantità assegnata > 0.
- Riepilogo KPI: `Comuni/NIL coinvolti`, `Famiglie/cassette stimate`, `Quantità inserita`, `Quantità consigliata`, `Copertura scenario corrente`, `Score D2D`.

### Hand to Hand (H2H)
- Colonna "Comune" aggiunta a ogni riga POI (risolta via point-in-polygon sui confini comunali disponibili, o etichetta del comune singolo in modalità Comune; se non determinabile: "Comune non determinato" — mai un valore inventato).
- Filtro categoria (Tutti, Scuole, Università, Palestre e sport, Stazioni e fermate, Commerciale, Altro) con conteggio per categoria; le categorie senza risultati non vengono mostrate.
- Click su una riga POI centra ed evidenzia (pulse animation) il marker corrispondente sulla mappa, senza modificare l'assegnazione al promoter.
- Riepilogo KPI: `POI rilevati`, `POI utilizzabili`, `POI selezionati`, `Quantità inserita`, `Fabbisogno operativo`, `Score H2H`.

### Business
- Colonna "Comune" aggiunta con la stessa logica di risoluzione territoriale di H2H.
- I filtri categoria esistenti ora nascondono le categorie senza attività corrispondenti e mostrano il conteggio per categoria.
- Click su una riga centra ed evidenzia il marker sulla mappa (stessa infrastruttura di H2H), senza toccare la selezione/assegnazione.
- Le attività selezionate restano visivamente distinte (tinta di sfondo verde, invariato).
- Riepilogo KPI: `Attività disponibili`, `Attività selezionate`, `Materiali necessari`, `Materiali residui`, `Materiali mancanti`, `Addetti consigliati`.

## Percentuali

Introdotta `sharedCoveragePctText`, un'unica stringa percentuale (già formattata con `formatPercentIT`) riletta da tutte le frasi/banner della Step 2 (banner raggio, banner comune, legenda mappa, box scenario), eliminando la duplicazione di calcolo. La formula sottostante (`quantità scenario corrente ÷ fabbisogno operativo consigliato × 100`) non è stata modificata.

## Cluster

I marker cluster della mappa POI hanno ora `role="img"` e `aria-label`/`title` con testo "N punti raggruppati" (o "1 punto raggruppato"), oltre al tooltip esistente.

## Liste

Vedi sezioni H2H e Business sopra. Infrastruttura condivisa: `focusPoiId`/`focusPoiNonce` passati a `Step2Map`, con una mappa interna `poiMarkersByIdRef` per centrare/evidenziare il marker corrispondente.

## Riepiloghi

Vedi le liste KPI per servizio sopra. Nessuna metrica D2D compare nei riepiloghi H2H/Business e viceversa (verificato per costruzione: i tre rami `overviewKpis` sono mutuamente esclusivi).

## Test aggiunti

`tests/browser_step2_offline_contract.cjs` esteso con asserzioni reali (eseguite, non dichiarate) per:
- Espansione riga zona D2D e persistenza percentuali uniformi nella UI.
- Etichette accessibili dei cluster POI (quando presenti nello scenario).
- Filtro categoria H2H: nasconde le categorie vuote, mostra il conteggio, filtra correttamente.
- Click-to-focus su riga POI H2H (`aria-pressed` sulla riga).
- Filtro categoria Business: nasconde le categorie vuote, mostra il conteggio, filtra correttamente.
- Attività Business selezionata via "Seleziona automaticamente" resta visivamente distinta.
- Zero errori pagina, zero errori console applicativi (esclusi gli abort intenzionali di font/tile nel harness offline), zero richieste fixture non gestite.

Eseguito con `npm run test:browser:offline` (Playwright headless via Chrome locale) — risultato: PASS su tutti e 5 gli scenari (D2D Varedo, Step2→Step3→Step2, H2H offline, Business Bergamo).

## Risultati verifiche

- `npm test`: 17 PASS + 11 PASS + 9 PASS, 0 FAIL.
- `npm run build`: build Vite verde.
- `npm run test:browser:offline`: PASS (tutti gli scenari, incluse le nuove asserzioni UI).
- `git diff --check`: nessun conflitto/whitespace error nei file modificati da questa sessione.
- `git grep -n -E "school|scuola|university|università|rating|stars" -- src volantinipro-final.jsx`: 32 occorrenze (baseline pre-esistente 31 + 1 nuova, `scuole: ["scuola"]` nel bucket filtro categoria H2H — nessun nuovo riferimento a rating/stelle introdotto in quest'area).

## Limiti noti

- I marker cluster hanno un bug di encoding pre-esistente (mojibake `${n}Ã— ${esc(cat)}` nel tooltip, dovrebbe essere "×") non toccato in questo intervento: fuori scopo, segnalato per una futura correzione mirata.
- La risoluzione "Comune" per riga POI dipende dalla disponibilità di confini comunali (`municipalityBoundary`) con geometria; se assenti o in scenari multi-comune senza geometria disponibile, il campo mostra "Comune non determinato" invece di un valore stimato.
- Le liste POI restano filtrate a monte dal target di campagna scelto in Step 1 (`distributionTargetSelection`): il nuovo filtro categoria in Step 2 opera solo sul sottoinsieme già filtrato, non su tutti i POI rilevati nel raggio.

## File modificati

- `volantinipro-final.jsx`
- `src/components/Step2Map.jsx`
- `src/styles/app.css`
- `tests/browser_step2_offline_contract.cjs`
- `package.json` (script `test:browser:offline`)
- `docs/step2-p2f-service-ux.md` (nuovo)

## Archeologia branch pre-esistenti

Verificati (solo lettura, nessun merge) i branch `fix-step2-p2c-leaflet-runtime`, `fix-step2-p2d-error-boundary`, `fix-step2-p2e-service-consistency`: contengono 6 commit reali e non ancora mersi (accessibilità, cancellazione richieste, hardening ciclo di vita Leaflet, error boundary di produzione, coerenza H2H/Business) — `b2ac066`, `a0206fd`, `40d5c03`, `a47098e`, `f2eb6f5`, `0cfaa77`. Recuperabili ma non incorporati in questa sessione: valutazione futura.

## Dipendenze aggiunte

NO

## Formule modificate

NO (la formula di copertura e le formule di allocazione/materiali non sono state toccate; solo unificata la stringa di presentazione condivisa)

## Dati inventati

NO
