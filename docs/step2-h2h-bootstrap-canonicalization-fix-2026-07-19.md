# Step 2 — fix canonicalizzazione bootstrap H2H

Data: 2026-07-19, Europe/Rome

## Causa

Il ramo effettivo non era il normale geocoding dello Step 2. Durante il passaggio Step 1 → Step 2, Step 1 forniva già `selectedSearchPoint`, `operationalPoints`, `city` e `selectedComuni` con coordinate valide e `source=step1_promoter_assignment`. Lo Step 2 considerava quindi il punto già salvato e idratava direttamente:

```text
selectedSearchPoint.parentComune = "Milan"
selectedSearchPoint.city = "Milan"
selectedComuni[0].name = "Milan"
```

Il risultato originale proveniva da una query Nominatim vincolata con `countrycodes=it`, ma `country_code` non era più presente nel punto serializzato.

## Correzione

`normalizeNominatimH2HBootstrapPoint` vive nello stesso helper `src/lib/geocoding/canonicalizeItalianMunicipalityName.js` e delega sempre a `canonicalizeItalianMunicipalityName`; non introduce una seconda tabella o funzione di canonicalizzazione.

Il ramo di idratazione Step 2 riconosce la provenienza `step1_promoter_assignment` come risultato del geocoder italiano di Step 1, normalizza il punto una volta e usa lo stesso nome per:

- `selectedSearchPoint.parentComune`;
- `selectedSearchPoint.city` e `municipality`;
- città e comune selezionato iniziali;
- UI;
- Truth Model;
- payload Step 2 → Step 3;
- stato ripristinato dopo il ritorno.

Il ramo asincrono usato quando Step 1 non ha già coordinate usa lo stesso adattatore direttamente sulla risposta Nominatim completa. Coordinate, label del punto, POI, TPL e formule non vengono trasformati.

## Prima / dopo

Prima:

```text
parentComune = "Milan"
city = "Milan"
selectedMunicipalities[0].name = "Milan"
```

Dopo:

```text
parentComune = "Milano"
city = "Milano"
municipality = "Milano"
selectedMunicipalities[0].name = "Milano"
```

Coordinate prima e dopo: `45.4637225, 9.189263`.

## Test automatici

Il nuovo `tests/h2h_bootstrap_canonicalization.test.mjs` verifica i 14 requisiti: bootstrap italiano, punto, comune selezionato, UI, payload, round-trip, 58 POI, 906 fermate, 2 promoter, capacità 4.000, fabbisogno 1.600, Milan extra-Italia, D2D Milano e Varedo.

- `npm test`: PASS, tutte le suite.
- `npm run build`: PASS, 608 moduli. Rimane il warning preesistente sul chunk principale oltre 800 kB.
- `git diff --check`: PASS; soli avvisi LF/CRLF.

Un tentativo intermedio di build ha ricevuto `EPERM` durante la pulizia di un file in `dist`; la ripetizione dello stesso comando, senza modifiche o cancellazioni manuali, è terminata PASS.

## Scenario E online finale

Esito: PASS, servizi reali, nessuna fixture.

- UI comune: Milano.
- `selectedSearchPoint.parentComune`: Milano.
- `selectedMunicipalities[0].name`: Milano.
- POI reali disponibili e selezionati: 58.
- Fermate TPL: 906.
- Fonti TPL: `atm_milano`, `trenord_lombardia`.
- Promoter: 2.
- Capacità: 4.000.
- Fabbisogno: 1.600.
- Raggio: 3 km.
- Step 2 → Step 3: PASS.
- Step 3 → Step 2: PASS.
- Persistenza punto, comune, quantità, POI, promoter, capacità e fabbisogno: PASS.
- Errori pagina: 0.

Richieste principali:

- Nominatim: HTTP 200, 7–17 ms.
- Supabase RPC TPL: HTTP 200, 1.678–2.561 ms.
- Overpass primario: HTTP 200, 1.262 ms.
- Mapbox geocoding: HTTP 403, problema esterno già noto.

Sono registrate 32 richieste browser fallite: 28 Mapbox, una `analysis-istat` annullata, una Overpass fallback annullata e due altre richieste annullate durante navigazione/ricalcolo. Le richieste reali necessarie allo scenario hanno restituito dati utilizzabili.

Console: 20 warning/error, riconducibili a Mapbox 403, layer civici non disponibile, avvisi `STEP2_RADIUS_POLYGON_MISSING` e diagnostica del ritorno da Step 3. Nessun errore pagina.

## Ambito

Non sono stati modificati formule H2H, promoter, capacità, fabbisogno, POI, TPL, Overpass, Mapbox, Supabase, GIS, Truth Model, View Model, TerritorialReport, Step 1, Step 3 o Step 4. P2 non è stato iniziato e non è stato eseguito alcun merge.

Raccomandazione: il fix mirato e lo Scenario E sono tecnicamente pronti per un merge controllato, mantenendo separati i problemi esterni Mapbox e gli avvisi GIS non bloccanti.
