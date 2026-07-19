# Step 2 P2-C — Leaflet runtime reliability

## Problema iniziale

`Step2Map` caricava a runtime da `unpkg.com` il JavaScript Leaflet, il CSS e i tre asset dei marker standard. La mappa dipendeva quindi dalla rete esterna anche se `leaflet` era già una dipendenza del progetto e il build produceva già un chunk vendor.

Il lifecycle lasciava inoltre possibili callback asincroni dopo la distruzione della mappa: il `requestAnimationFrame` del `ResizeObserver`, transizioni Leaflet e redraw Canvas. In navigazioni/mount ravvicinati questo poteva produrre errori `_leaflet_pos` o `clearRect` su risorse già rimosse.

## Riferimenti CDN trovati e caricamento precedente

In `src/components/Step2Map.jsx` erano presenti:

- creazione dinamica di `<link>` per `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`;
- creazione dinamica di `<script>` per `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`;
- `window.L` come sorgente runtime;
- URL `unpkg` per `marker-icon.png`, `marker-icon-2x.png` e `marker-shadow.png`.

Non sono stati trovati altri loader Leaflet remoti in `main.jsx`, `index.html`, stili o librerie Step 2.

## Caricamento nuovo, CSS e icone

`Step2Map` importa direttamente:

- `leaflet`;
- `leaflet/dist/leaflet.css`;
- i tre PNG marker da `leaflet/dist/images`.

Gli URL degli asset sono risolti da Vite e assegnati tramite `L.Icon.Default.mergeOptions`. Le icone personalizzate, dimensioni, anchor, colori e stili esistenti non sono stati modificati. Non esistono più script/link Leaflet dinamici né `window.L`.

Il build produce `vendor-leaflet-*.js` e `vendor-leaflet-*.css`; in sviluppo il browser ha osservato CSS, JS e PNG esclusivamente sotto `http://localhost:5173/node_modules/...`.

## Lifecycle della mappa

L'inizializzazione è unica per container e compatibile con React Strict Mode. Il cleanup:

- annulla frame di ready e resize;
- disconnette il `ResizeObserver`;
- rimuove listener `zoomend` e `click`;
- ferma animazioni;
- cancella redraw Canvas pendenti prima di rimuovere i layer;
- rimuove la mappa;
- azzera `mapRef` e `layersRef`.

Una guardia su `L.Canvas._redraw` ignora esclusivamente frame già partiti dopo la distruzione di container/contesto. Quando la mappa è attiva delega senza modifiche all'implementazione Leaflet originale.

## Stato di caricamento ed errore

Prima del completamento dell'inizializzazione viene mostrato `Caricamento mappa...` con `role="status"` e `aria-live="polite"`.

Un errore reale durante l'inizializzazione viene catturato, la risorsa parziale viene ripulita e viene mostrato un `role="alert"`:

> La mappa non è temporaneamente disponibile. I dati della zona restano disponibili.

Non sono mostrati stack o codici tecnici. Non è stato aggiunto un pulsante “Riprova”, perché senza una nuova causa/risorsa disponibile sarebbe un retry fittizio e rischierebbe una seconda istanza.

## Tile remote rimaste

I provider CARTO Voyager e Mapbox già configurati restano invariati. Sono tile cartografiche, non la libreria Leaflet. Un singolo `tileerror` non modifica `mapInitError`, non smonta la mappa e non rimuove i layer territoriali.

## File modificati

- `src/components/Step2Map.jsx`
- `tests/step2_leaflet_runtime.test.mjs`
- `tests/browser_step2_offline_contract.cjs`
- `package.json`
- `docs/step2-p2c-leaflet-runtime.md`

## Test aggiunti

Il contratto Node verifica assenza CDN Leaflet, import locali, asset marker, cleanup idempotente, guardia Canvas, semantica loading/error e separazione tileerror.

Il contratto browser verifica import locali osservati dalla rete, mappa e layer visibili, tileerror sintetico non bloccante, Step 2 → Step 3 → Step 2, errore controllato del `ResizeObserver`, dati territoriali preservati, regressioni P2-A/P2-B, POI/TPL e Business.

## Comandi e risultati

- `npm run test:browser:offline`: PASS; errori pagina `0`, errori console `0`, fixture non gestite `0`, richieste CDN Leaflet `0`.
- `npm test`: PASS, incluse P2-A, P2-B e la nuova suite P2-C.
- `npm run build`: PASS, 613 moduli; `vendor-leaflet-*.js` e `vendor-leaflet-*.css` presenti localmente.
- `git grep -n -E "unpkg|jsdelivr|cdnjs" -- "*.js" "*.jsx" "*.html" "*.css"`: nessun risultato runtime.
- `git diff --check`: PASS; soltanto warning informativi sulla futura conversione LF/CRLF.
- `git status --short`: esclusivamente i cinque file P2-C elencati sopra.

Restano warning ambientali preesistenti di PowerShell/npm, package ESM senza `type: module` e chunk principale oltre 800 kB. Non incidono sugli exit code e sono fuori perimetro P2-C.

## Limiti rimasti

Le tile restano remote come previsto dal perimetro. Non è presente un retry automatico per un errore di inizializzazione. Nessuna modifica è stata apportata a GeoJSON, coordinate, layer GIS, provider tile o logica Step 2.
