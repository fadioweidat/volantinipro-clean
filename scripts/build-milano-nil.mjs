// Crea public/data/territories/milano-nil.json dalla lettura di
// public.geo_nil_milano (nil_code c, nil_name n, ST_AsGeoJSON(geom, 6)::json g),
// salvata come JSON, con in `rest` la parte del comune ISTAT che nessun NIL
// copre (ST_Difference, pezzi da 2.000 m² in su). Solo contesto visivo dello
// Step 2: KPI e quantita' continuano a usare le geometrie dell'analisi.
// Uso: node scripts/build-milano-nil.mjs <lettura.json>
import { readFileSync, writeFileSync } from "node:fs";
import { simplifyGeometry } from "./build-lombardia-comuni.mjs";

const OUTPUT = new URL("../public/data/territories/milano-nil.json", import.meta.url);
const SOURCE = "Comune di Milano - DS964 NIL VIGENTI PGT 2030";

const raw = readFileSync(process.argv[2], "utf8");
const { rows, rest } = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const nil = rows.map((row) => ({ c: row.c, n: row.n, g: simplifyGeometry(row.g) }));
writeFileSync(OUTPUT, JSON.stringify({ source: SOURCE, nil, rest: simplifyGeometry(rest) }));
console.log(`${nil.length} NIL`);
