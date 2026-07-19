# Step 2 — fix mirato canonicalizzazione Nominatim

Data verifica: 2026-07-19 (Europe/Rome)

## Esito

- Fix mirato: PASS.
- Scenario A — D2D Varedo: PASS.
- Scenario B — D2D Milano/NIL: PASS.
- Scenari C–F: non eseguiti, come richiesto.
- P2: non iniziato.

## Causa e correzione

La normalizzazione inline dei risultati Nominatim copiava direttamente `display_name` e `address.city` nello stato di Step 2. Quando Nominatim restituiva `Milan`, lo stesso valore non canonico arrivava quindi a UI, `analysis-istat`, richieste NIL, payload e persistenza.

Il punto unico ora è `src/lib/geocoding/canonicalizeItalianMunicipalityName.js`. La funzione `canonicalizeItalianMunicipalityName(name, context)`:

1. preferisce i campi amministrativi Nominatim `city`, `town`, `municipality`, `village`, `city_district`;
2. applica alias soltanto con `country_code=it`;
3. contiene un solo alias confermato e documentato: `Milan` → `Milano`;
4. lascia invariato `Milan` fuori dall’Italia;
5. alimenta con un unico valore canonico `name`, `label` e `city`.

Le due diramazioni Nominatim in `volantinipro-final.jsx` usano ora `normalizeNominatimGeocodeResult`. Coordinate e calcoli territoriali non sono stati modificati.

## Prima / dopo

Prima del fix, richiesta osservata:

`analysis-istat?lat=45.4641943&lng=9.1896346&radius=3&service=d2d&municipality=Milan&quantity=10000&analysisLevel=comune&selectionScope=municipality`

Payload/stato prima:

`territory.label = "Milan · comune completo"`

`userSelections.selectedMunicipalities[0].name = "Milan"`

Dopo il fix, richiesta reale osservata (HTTP 200, 1583 ms nella prima chiamata):

`analysis-istat?lat=45.4641943&lng=9.1896346&radius=15&service=d2d&municipality=Milano&quantity=10000&analysisLevel=nil&selectionScope=municipality&selectedMunicipalityCodes=015146`

Payload/stato dopo:

`territory.label = "Milano · comune completo"`

`userSelections.selectedMunicipalities[0].name = "Milano"`

Il ritorno Step 3 → Step 2 ha conservato nome canonico, quantità e disponibilità NIL.

## Test automatici

Il nuovo test `tests/nominatim_municipality_canonicalization.test.mjs` copre:

- `Milan` italiano → `Milano`;
- `Milano` invariato;
- `Milan` non italiano invariato;
- parametro `municipality=Milano` per `analysis-istat` e NIL;
- valore UI e payload canonico;
- round-trip Step 3 → Step 2;
- regressione Varedo;
- coordinate territoriali invariate.

Comandi:

- `npm test`: PASS (tutte le suite, incluse le 10 verifiche richieste).
- `npm run build`: PASS (608 moduli; solo warning preesistente sulla dimensione chunk).
- `git diff --check`: PASS (solo avvisi di conversione LF/CRLF).

## Verifica online reale

Scenario A — Varedo:

- Nominatim: HTTP 200.
- `analysis-istat`: HTTP 200, `municipality=Varedo`.
- Overpass primario: HTTP 200.
- Confine presente; famiglie 6176; fabbisogno base 6176; consigliato 6794; copertura 100%.
- Passaggio Step 2 → Step 3 e ritorno: persistenza PASS.

Scenario B — Milano/NIL:

- Mapbox geocoding: HTTP 403; fallback Nominatim usato con HTTP 200.
- UI: `Milano · comune completo`.
- `analysis-istat`: HTTP 200 con `municipality=Milano` e `analysisLevel=nil`.
- NIL reali restituiti: 88; 88 con geometria.
- Overpass primario: HTTP 200 (3218 ms).
- Passaggio Step 2 → Step 3 e ritorno: nome Milano, quantità e disponibilità NIL persistiti.

## Problemi esterni separati

- Mapbox continua a rispondere HTTP 403; la credenziale e il codice Mapbox non sono stati modificati.
- Alcune tile Mapbox sono state bloccate dal browser con `ERR_BLOCKED_BY_ORB`.
- Richieste speculative o annullate durante cambi di stato risultano `ERR_ABORTED`; non hanno impedito gli assert degli scenari.
- Il fallback secondario `overpass.kumi.systems` può risultare annullato quando il primario ha già concluso. Nell’ultima esecuzione entrambi gli scenari hanno ricevuto HTTP 200 dal primario `overpass-api.de`; nessuna correzione Overpass è stata apportata.
- Errori pagina: 0 in entrambi gli scenari.

## Evidenze

Il dettaglio integrale di richieste, status, durate, console, errori pagina, payload e stato di ritorno è in `artifacts/step2-online-2026-07-19/online-verification.json`. Gli screenshot A e B sono nella stessa directory.

Non sono stati modificati Truth Model, View Model, TerritorialReport, GIS, API, database, Supabase, Mapbox, Overpass, Step 1, Step 3 o Step 4. Nessun merge è stato eseguito.
