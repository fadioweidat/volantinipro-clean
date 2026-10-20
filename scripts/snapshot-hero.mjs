#!/usr/bin/env node
// Regenerates the hero scenario snapshot (src/components/home/heroScenarioSnapshot.json)
// from the live analysis-istat Edge Function: same request the hero makes, read-only GET
// with the public anon key. Only the fields the hero reads are saved (no OMI).
// The file is written ONLY if the response passes the same validation the hero applies;
// on any error the previous snapshot is left untouched and the script exits 1.
//
// Usage:  npm run snapshot:hero
// Env:    VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (read from .env.local if present).
// Re-run when ISTAT publishes new data (see TODO.md).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildServiceAnalysisRequest } from '../src/lib/step2/buildServiceAnalysisRequest.js';
import { HERO_SCENARIO, normalizeHomepageAnalysis } from '../src/components/home/homepageHeroData.js';
import { HERO_SNAPSHOT_VERSION, pickHeroSnapshotData, validateHeroSnapshot } from '../src/components/home/heroSnapshot.js';

const OUT = fileURLToPath(new URL('../src/components/home/heroScenarioSnapshot.json', import.meta.url));

async function main() {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!process.env.VITE_SUPABASE_URL || !anonKey) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mancanti (usa .env.local).');
  // Identical to the hero's useServiceAnalysis call in VolantiniProHeroMap.jsx.
  const { url } = buildServiceAnalysisRequest({
    lat: HERO_SCENARIO.lat, lng: HERO_SCENARIO.lng, radius: HERO_SCENARIO.radiusKm, service: 'd2d',
    municipality: HERO_SCENARIO.name, scope: 'hero_preview', analysisLevel: 'comune', selectionScope: 'radius',
  });
  if (!url) throw new Error('URL analysis-istat non costruibile.');
  const started = Date.now();
  const res = await fetch(url, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`analysis-istat ha risposto ${res.status}${body?.error ? ` (${body.error})` : ''}`);

  const snapshot = {
    version: HERO_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'analysis-istat (Supabase Edge Function), stessa richiesta dell\'hero',
    scenario: { name: HERO_SCENARIO.name, lat: HERO_SCENARIO.lat, lng: HERO_SCENARIO.lng, radiusKm: HERO_SCENARIO.radiusKm },
    data: pickHeroSnapshotData(body),
  };
  const valid = validateHeroSnapshot(snapshot, HERO_SCENARIO);
  if (!valid) throw new Error('Risposta non valida per lo snapshot: file NON aggiornato.');
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const a = normalizeHomepageAnalysis(snapshot.data);
  console.log(`Snapshot hero aggiornato (${valid.dateLabel}) in ${Date.now() - started} ms: ${a.families} famiglie, ${a.municipalityCount} comuni, ${a.familiesShare}% delle famiglie dei comuni coinvolti, ${snapshot.data.comuni_breakdown.length} zone.`);
}

main().catch((e) => { console.error(`snapshot:hero fallito: ${e.message}`); process.exit(1); });
