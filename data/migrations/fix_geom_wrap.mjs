/**
 * Fixes all 12 provincial SQL files and the main seed SQL:
 *  - Wraps every ST_GeomFromText INSERT value with
 *    ST_Multi(ST_CollectionExtract(ST_MakeValid(...), 3))
 *  - Updates the UPDATE ... ST_MakeValid to use the same wrapper
 *
 * Usage: node data/migrations/fix_geom_wrap.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const provDir = path.resolve(__dirname, '../../supabase/migrations/014_province');

const targets = [
  // 12 provincial files
  ...['014_VA_Varese','014_CO_Como','014_SO_Sondrio','014_MI_Milano',
      '014_BG_Bergamo','014_BS_Brescia','014_PV_Pavia','014_CR_Cremona',
      '014_MN_Mantova','014_LC_Lecco','014_LO_Lodi','014_MB_MonzaBrianza']
    .map(f => path.join(provDir, f + '.sql')),
  // Main seed file
  path.resolve(__dirname, '../../supabase/migrations/014_seed_map_sectors_all_lombardia.sql'),
];

const WRAP_OPEN  = 'ST_Multi(ST_CollectionExtract(ST_MakeValid(';
const WRAP_CLOSE = '), 3))';

for (const fpath of targets) {
  let sql = readFileSync(fpath, 'utf8');
  const before = sql.length;

  // ── 1. Wrap ST_GeomFromText in INSERT rows ─────────────────────────────────
  // Pattern: ST_GeomFromText('MULTIPOLYGON(...)', 4326)
  // Only wrap if NOT already wrapped (idempotency guard)
  sql = sql.replace(
    /(?<!ST_MakeValid\()ST_GeomFromText\('(MULTIPOLYGON[^']*)', 4326\)/g,
    (_, wkt) => `${WRAP_OPEN}ST_GeomFromText('${wkt}', 4326)${WRAP_CLOSE}`
  );

  // ── 2. Fix UPDATE … ST_MakeValid(geometry) → wrapped version ──────────────
  sql = sql.replace(
    /SET geometry = ST_MakeValid\(geometry\)/g,
    `SET geometry = ${WRAP_OPEN}geometry${WRAP_CLOSE}`
  );

  // ── 3. Fix DO block query (in main seed file) ──────────────────────────────
  // round((ST_Area(geometry::geography) / 1e6)::numeric, 6) — no geom wrapping needed there

  writeFileSync(fpath, sql, 'utf8');
  const after = sql.length;
  const fname = path.basename(fpath);
  const changed = after !== before;
  console.log(`  ${changed ? '✓' : '─'} ${fname}  (${(after/1024).toFixed(0)} KB)`);
}

console.log('\nDone.\n');
