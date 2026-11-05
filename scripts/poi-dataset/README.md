# Dataset POI OpenStreetMap (Step 2, Lombardia)

`/api/poi-search` risponde con i POI di questo dataset quando il cerchio cade interamente su
celle interne alla Lombardia. Altrove, o senza un dataset valido, usa Overpass come prima.

## File

| File | Ruolo |
|---|---|
| `build_poi_dataset.py` | Estrazione da un `.osm.pbf` Geofabrik (pyosmium + shapely), celle di 0,05°, validazione |
| `poi-tags.json` | Coppie key=val interrogate (unione dei tre servizi), allineate a `supabase/functions/_shared/poiSearchProxy.ts` da un test |
| `export-poi-tags.mjs` | Rigenera `poi-tags.json` dal modulo server |
| `../../.github/workflows/poi-dataset.yml` | Aggiornamento settimanale; il file attivo è quello sul branch predefinito `master` |
| `../../api/_lib/poiDatasetLoader.ts` | Caricamento nella funzione: puntatore, sha256, conteggi, ultima versione valida |
| `../../src/lib/poi/poiDataset.js` | Interrogazione: stessa semantica della query Overpass |

## Pubblicazione

1. **Esecuzione:** il workflow `poi-dataset` su `master` gira ogni lunedì alle 04:30 UTC, con `source_ref = integration/rc2-full-site`. Si può avviare anche a mano, con `source_ref` e `mode`: `verify` (non pubblica) oppure `publish`.
2. **Controlli prima della pubblicazione:** MD5 dell'estratto, poi build e confronto con la versione corrente (totale, cali per coppia di tag, celle interne).
3. **Release:** release `poi-dataset-<data>`, prima bozza, poi upload degli asset, poi pubblicazione. Mai marcata "latest", perché `releases/latest` serve l'APK del driver.
4. **Puntatore:** gli asset pubblici vengono riscaricati e se ne verifica lo sha256. Solo dopo si aggiorna `current.json` nella release `poi-dataset-index`.

La funzione legge `POI_DATASET_POINTER_URL`
(`https://github.com/fadioweidat/volantinipro-clean/releases/download/poi-dataset-index/current.json`).
Una versione nuova non valida non sostituisce quella caricata.

## Ripristino

- **Tornare alla versione precedente:** ricaricare in `poi-dataset-index` un `current.json` che punti alla release di quella versione.
- **Disattivare il dataset:** togliere `POI_DATASET_POINTER_URL` su Vercel. I POI tornano da Overpass.

## Prima versione (2026-11-02)

| Voce | Valore |
|---|---|
| Estratto | `nord-ovest-261102.osm.pbf`, md5 `9b20c2d28fb0daba8391e4fad8e0217f` |
| POI | 85.612 (55.467 nodi, 30.145 way) |
| Celle | 943 interne, 326 di confine |
| Dimensione | 11,0 MB JSON, 2,7 MB gzip |
| Elaborazione | 49 s su GitHub Actions |

Il JSON prodotto in CI è identico byte per byte a quello costruito in locale dallo stesso estratto; cambia solo la compressione gzip.

Dati © OpenStreetMap contributors, Open Database License 1.0 (https://www.openstreetmap.org/copyright).
