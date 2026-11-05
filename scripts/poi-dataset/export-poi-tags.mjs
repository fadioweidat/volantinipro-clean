// Esporta le coppie key=val interrogate dai POI di Step 2 (unione dei tre
// servizi) dal modulo server, unica fonte: il dataset offline estrae
// esattamente cio' che la query Overpass chiede. Uso:
//   node --import tsx scripts/poi-dataset/export-poi-tags.mjs > tags.json
import { POI_TAGS } from '../../supabase/functions/_shared/poiSearchProxy.ts';

const pairs = new Map();
for (const tags of Object.values(POI_TAGS)) {
  for (const { key, val } of tags) pairs.set(`${key}=${val}`, { key, val });
}
const sorted = [...pairs.values()].sort((a, b) => `${a.key}=${a.val}`.localeCompare(`${b.key}=${b.val}`));
process.stdout.write(`${JSON.stringify({ pairs: sorted }, null, 2)}\n`);
