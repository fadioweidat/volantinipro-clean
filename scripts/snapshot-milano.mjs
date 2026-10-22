#!/usr/bin/env node
// Regenerates the "Milano intera" snapshot (src/lib/quote/milanoWholeCitySnapshot.json)
// from the live analysis-istat Edge Function: same request as the homepage
// calculator / Preventivo Rapido (buildHomeCalculatorAnalysisArgs), read-only GET
// with the public anon key, Milano centre from the same comune search RPC.
// The file is written ONLY if the answer passes the same validation the pages
// apply (88 distinct NILs, real figures); otherwise the old file stays and the
// script exits 1.
//
// Usage:  npm run snapshot:milano
// Env:    VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (read from .env.local if present).
// Re-run when ISTAT publishes new data or analysis-istat changes (see TODO.md).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildServiceAnalysisRequest } from '../src/lib/step2/buildServiceAnalysisRequest.js';
import { buildHomeCalculatorAnalysisArgs } from '../src/lib/quote/homeCalculatorAnalysis.js';
import { MILANO_SNAPSHOT_VERSION, pickMilanoSnapshotData, validateMilanoSnapshot } from '../src/lib/quote/milanoSnapshot.js';

const OUT = fileURLToPath(new URL('../src/lib/quote/milanoWholeCitySnapshot.json', import.meta.url));

async function main() {
  const base = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anonKey) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mancanti (usa .env.local).');
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

  const search = await fetch(`${base}/rest/v1/rpc/search_municipalities`, { method: 'POST', headers, body: JSON.stringify({ prefix: 'Milano' }) });
  const found = (await search.json()).find?.((r) => r.municipality_name === 'Milano');
  if (!found) throw new Error('Centro di Milano non trovato dalla ricerca comuni.');
  const comune = { name: 'Milano', lat: Number(found.centroid_lat), lng: Number(found.centroid_lng) };

  const [lat, lng, radius, service, municipality, quantity, scope, analysisLevel, selectionScope, selectedMunicipalityCodes] = buildHomeCalculatorAnalysisArgs(comune);
  const { url } = buildServiceAnalysisRequest({ lat, lng, radius, service, municipality, quantity, scope, analysisLevel, selectionScope, selectedMunicipalityCodes });
  if (!url) throw new Error('URL analysis-istat non costruibile.');
  const started = Date.now();
  const res = await fetch(url, { headers });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`analysis-istat ha risposto ${res.status}${body?.error ? ` (${body.error})` : ''}`);

  const snapshot = {
    version: MILANO_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'analysis-istat (Supabase Edge Function), stessa richiesta "Milano intera" del calcolatore',
    request: { lat, lng, radius, analysisLevel, selectionScope, selectedMunicipalityCodes },
    data: pickMilanoSnapshotData(body),
  };
  const valid = validateMilanoSnapshot(snapshot);
  if (!valid) throw new Error('Risposta non valida per lo snapshot (servono 88 NIL con dati): file NON aggiornato.');
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const a = valid.analysis;
  console.log(`Snapshot Milano aggiornato (${valid.dateLabel}) in ${Date.now() - started} ms: ${a.nilCount} NIL, ${a.families} famiglie, ${a.recommended} volantini consigliati.`);
}

main().catch((e) => { console.error(`snapshot:milano fallito: ${e.message}`); process.exit(1); });
