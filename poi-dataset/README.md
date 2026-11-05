# poi-dataset/

Cartella letta da `api/poi-search.ts` (vercel.json → `functions."api/poi-search.ts".includeFiles`).

Nel repository contiene solo questo file. I dati (`manifest.json`, `poi-lombardia.json.gz`,
`LICENSE-ODbL.txt`) vengono prodotti da `scripts/poi-dataset/` e non vanno mai committati:

- se la cartella contiene un dataset valido, la funzione usa quello;
- altrimenti usa `POI_DATASET_BASE_URL` (env server), se impostata;
- senza dataset valido la funzione usa Overpass come prima.

Dati © OpenStreetMap contributors, Open Database License 1.0
(https://www.openstreetmap.org/copyright).
