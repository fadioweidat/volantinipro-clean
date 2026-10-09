#!/usr/bin/env node
// Copies the pure pricing modules into the shadow Edge Function artefact
// (deploy/edge/submit-campaign-request-v11-shadow/_pricing), keeping the src/lib/pricing
// layout so relative imports stay valid, and writes MANIFEST.json (sha256 per file).
// `--check` verifies the vendored copy instead of writing (used by the tests).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'deploy/edge/submit-campaign-request-v11-shadow/_pricing');
export const VENDORED = [
  'engine/catalog.js', 'engine/cents.js', 'engine/distribution.js', 'engine/rounding.js', 'engine/priceQuote.js', 'engine/index.js',
  'printPricing.js',
  'server/payloadAdapter.js', 'server/territoryResolver.js', 'server/shadowPricing.js', 'server/index.js',
];
const sha = buf => createHash('sha256').update(buf).digest('hex');
const normalise = buf => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');

const check = process.argv.includes('--check');
const manifest = {};
const problems = [];
for (const rel of VENDORED) {
  const src = normalise(readFileSync(join(root, 'src/lib/pricing', rel)));
  manifest[rel] = sha(src);
  const dst = join(target, rel);
  if (check) {
    if (!existsSync(dst) || sha(normalise(readFileSync(dst))) !== manifest[rel]) problems.push(rel);
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, src);
  }
}
if (check) {
  const recorded = existsSync(join(target, 'MANIFEST.json')) ? JSON.parse(readFileSync(join(target, 'MANIFEST.json'), 'utf8')).files : {};
  for (const rel of VENDORED) if (recorded[rel] !== manifest[rel]) problems.push(`manifest:${rel}`);
  if (problems.length) { console.error('vendored pricing out of date:', problems.join(', ')); process.exit(1); }
  console.log('vendored pricing up to date');
} else {
  writeFileSync(join(target, 'MANIFEST.json'), `${JSON.stringify({ source: 'src/lib/pricing', files: manifest }, null, 2)}\n`);
  console.log(`vendored ${VENDORED.length} files into ${target}`);
}
