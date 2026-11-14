// Derived, small pricing index from the ISTAT Lombardy municipality dataset
// already tracked in the repository. No network/database access.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('data/istat/processed/geo_municipalities_lombardia.json', root);
const output = new URL('src/lib/step2/municipalityDensityLombardia.generated.js', root);
const rows = JSON.parse(readFileSync(fileURLToPath(source), 'utf8'));
if (rows.length !== 1502 || rows.some(row => !/^\d{6}$/.test(String(row.municipality_code)) || !Number.isFinite(row.density_per_km2))) {
  throw new Error('ISTAT Lombardia: incomplete municipality codes/densities; aborting derived index');
}
const values = rows.map(row => [row.municipality_code, row.municipality_name, Math.round(row.density_per_km2 * 100) / 100]);
const content = '// Generated from data/istat/processed/geo_municipalities_lombardia.json (1,502 comuni ISTAT).\n'
  + '// Run: node scripts/generate-municipality-tier-index.mjs\n'
  + `export const municipalityDensityLombardia = ${JSON.stringify(values)};\n`;
writeFileSync(fileURLToPath(output), content, 'utf8');
