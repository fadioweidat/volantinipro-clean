/**
 * Patches all 12 provincial SQL files:
 *  1. Inserts UPDATE … ST_MakeValid() before the final COUNT verification
 *  2. Removes the DO $$ validation block from 014_MB_MonzaBrianza.sql
 *
 * Usage: node data/migrations/fix_province_makevalid.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../../supabase/migrations/014_province');

const files = [
  '014_VA_Varese.sql',
  '014_CO_Como.sql',
  '014_SO_Sondrio.sql',
  '014_MI_Milano.sql',
  '014_BG_Bergamo.sql',
  '014_BS_Brescia.sql',
  '014_PV_Pavia.sql',
  '014_CR_Cremona.sql',
  '014_MN_Mantova.sql',
  '014_LC_Lecco.sql',
  '014_LO_Lodi.sql',
  '014_MB_MonzaBrianza.sql',
];

for (const fname of files) {
  const fpath = path.join(dir, fname);
  let sql = readFileSync(fpath, 'utf8');

  // ── 1. Remove the DO $$ validation block if present ───────────────────────
  // Matches: "-- ── Validazione …\nDO $$\n…\n$$;\n"
  sql = sql.replace(
    /\n-- ── Validazione \(eseguita dopo tutti gli INSERT\) ──.*?\nDO \$\$[\s\S]*?\$\$;\n/,
    '\n'
  );

  // Also remove the stale summary comment block that follows the DO block
  // (lines starting with "-- ── Summary" through the blank line before "-- ── Verifica")
  sql = sql.replace(
    /\n-- ── Summary ─+\n(-- .*\n)*\n/,
    '\n'
  );

  // ── 2. Extract municipality codes from the DELETE statement ───────────────
  const deleteMatch = sql.match(/DELETE FROM public\.map_sectors\s+WHERE service_type = 'd2d'\s+AND municipality_code IN \(([^)]+)\);/);
  if (!deleteMatch) {
    console.error(`  ✗ Cannot find DELETE in ${fname}`);
    continue;
  }
  const codes = deleteMatch[1]; // already formatted, e.g. '012001', '012002', ...

  // ── 3. Build the ST_MakeValid UPDATE ──────────────────────────────────────
  const updateBlock = [
    `-- Correggi geometrie non valide prodotte dal clipping`,
    `UPDATE public.map_sectors`,
    `  SET geometry = ST_MakeValid(geometry)`,
    `  WHERE service_type = 'd2d'`,
    `    AND NOT ST_IsValid(geometry)`,
    `    AND municipality_code IN (${codes});`,
    ``,
  ].join('\n');

  // ── 4. Insert UPDATE before the "-- ── Verifica provincia" section ────────
  const verifMarker = /\n-- ── Verifica provincia /;
  if (!verifMarker.test(sql)) {
    console.error(`  ✗ Cannot find verification marker in ${fname}`);
    continue;
  }
  sql = sql.replace(verifMarker, '\n' + updateBlock + '\n-- ── Verifica provincia ');

  writeFileSync(fpath, sql, 'utf8');
  console.log(`  ✓ ${fname}`);
}

console.log('\nDone. Re-run each province file in the SQL Editor.\n');
