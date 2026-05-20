/**
 * Splits 014_seed_map_sectors_all_lombardia.sql into 12 provincial files.
 * Each file fits within Supabase SQL Editor limits (~250-400 KB).
 *
 * Usage: node data/migrations/split_014_by_province.mjs
 * Output: supabase/migrations/014_province/014_XX_<province>.sql
 *
 * Run order in SQL Editor: any order (each file scopes its own DELETE+INSERT).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROVINCE_NAMES = {
  '012': 'VA_Varese',
  '013': 'CO_Como',
  '014': 'SO_Sondrio',
  '015': 'MI_Milano',
  '016': 'BG_Bergamo',
  '017': 'BS_Brescia',
  '018': 'PV_Pavia',
  '019': 'CR_Cremona',
  '020': 'MN_Mantova',
  '097': 'LC_Lecco',
  '098': 'LO_Lodi',
  '108': 'MB_MonzaBrianza',
};

// ── Parse the big SQL into per-municipality blocks ────────────────────────────
const srcPath = path.resolve(__dirname,
  '../../supabase/migrations/014_seed_map_sectors_all_lombardia.sql');
const sql = readFileSync(srcPath, 'utf8');
const lines = sql.split('\n');

// Each block: { code, province, lines[] }
const blocks = [];
let current = null;

for (const line of lines) {
  // Comment like: -- Agra (012001) 3.2km²
  const m = line.match(/^-- .+\((\d{6})\)/);
  if (m) {
    if (current) blocks.push(current);
    const code = m[1];
    current = { code, province: code.slice(0, 3), lines: [line] };
    continue;
  }
  if (current) {
    current.lines.push(line);
  }
}
if (current) blocks.push(current);

// Group by province
const byProvince = {};
for (const b of blocks) {
  if (!byProvince[b.province]) byProvince[b.province] = [];
  byProvince[b.province].push(b);
}

// ── Write provincial files ────────────────────────────────────────────────────
const outDir = path.resolve(__dirname, '../../supabase/migrations/014_province');
mkdirSync(outDir, { recursive: true });

const manifest = [];

for (const [prov, mblocks] of Object.entries(byProvince).sort()) {
  const provName = PROVINCE_NAMES[prov] ?? `XX_${prov}`;
  const outName  = `014_${provName}.sql`;
  const outPath  = path.join(outDir, outName);

  const codes = mblocks.map(b => `'${b.code}'`).join(', ');

  const parts = [
    `-- ── Provincia ${prov} (${provName}) ────────────────────────────────────────`,
    `-- Comuni: ${mblocks.length}`,
    `-- Parte della migration 014: Lombardia completa`,
    `-- Sicuro da rieseguire: cancella e reinserisce solo questa provincia.`,
    ``,
    `-- Cancella settori esistenti per questa provincia`,
    `DELETE FROM public.map_sectors`,
    `  WHERE service_type = 'd2d'`,
    `  AND municipality_code IN (${codes});`,
    ``,
  ];

  for (const b of mblocks) {
    parts.push(...b.lines);
    // Ensure trailing blank line
    if (parts[parts.length - 1] !== '') parts.push('');
  }

  // Validation for this province
  parts.push(`-- ── Verifica provincia ${prov} ────────────────────────────────────────────`);
  parts.push(`SELECT`);
  parts.push(`  COUNT(DISTINCT municipality_code) AS comuni,`);
  parts.push(`  COUNT(*)                          AS settori`);
  parts.push(`FROM public.map_sectors`);
  parts.push(`WHERE service_type = 'd2d'`);
  parts.push(`  AND municipality_code IN (${codes});`);

  writeFileSync(outPath, parts.join('\n') + '\n', 'utf8');

  const sizeKB = Math.round(
    Buffer.byteLength(parts.join('\n'), 'utf8') / 1024
  );
  manifest.push({ prov, provName, comuni: mblocks.length, sizeKB, outName });
  process.stdout.write(`  ${outName.padEnd(40)} ${String(mblocks.length).padStart(4)} comuni  ${sizeKB} KB\n`);
}

// ── Index file ────────────────────────────────────────────────────────────────
const indexLines = [
  `-- ── 014 Lombardia: indice province ────────────────────────────────────────`,
  `-- Eseguire i file in qualsiasi ordine nel Supabase SQL Editor.`,
  `-- Ogni file è autonomo e safe da rieseguire.`,
  ``,
];
for (const m of manifest) {
  indexLines.push(`-- ${m.outName.padEnd(40)} ${String(m.comuni).padStart(4)} comuni  ${m.sizeKB} KB`);
}
indexLines.push(``, `-- Verifica globale dopo tutti i file:`);
indexLines.push(`-- SELECT COUNT(DISTINCT municipality_code) as comuni, COUNT(*) as settori`);
indexLines.push(`-- FROM public.map_sectors WHERE service_type = 'd2d';`);
writeFileSync(path.join(outDir, '000_INDEX.txt'), indexLines.join('\n') + '\n', 'utf8');

const totalComuni   = manifest.reduce((s, m) => s + m.comuni,   0);
const totalSizeKB   = manifest.reduce((s, m) => s + m.sizeKB,   0);
console.log(`\n  File generati : ${manifest.length}`);
console.log(`  Comuni totali : ${totalComuni}`);
console.log(`  Dimensione tot: ${totalSizeKB} KB`);
console.log(`  Cartella      : ${outDir}\n`);
