// TICKET — STEP 2 POI SEARCH RETURNS 502.
// Il proxy poi-search deve: classificare la causa del fallimento, ritentare
// UNA sola volta i transitori, degradare a cache stale (200) quando Overpass
// e' down, e restituire 502 SOLO se non c'e' nulla da servire. "0 risultati"
// resta un 200. Nessuna modifica a boundary / Mapbox / pricing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  classifyPoiFailure,
  isTransientPoiFailure,
} from '../supabase/functions/_shared/poiSearchProxy.ts';

const edge = readFileSync(new URL('../supabase/functions/poi-search/index.ts', import.meta.url), 'utf8');
const step2map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');

test('classifyPoiFailure — distingue timeout / unavailable / rate limit / bad request / internal', () => {
  assert.equal(classifyPoiFailure(Object.assign(new Error('x'), { name: 'AbortError' })), 'upstream_timeout');
  assert.equal(classifyPoiFailure(new Error('OVERPASS_TIMEOUT')), 'upstream_timeout');
  assert.equal(classifyPoiFailure(new Error('OVERPASS_HTTP_502')), 'upstream_unavailable');
  assert.equal(classifyPoiFailure(new Error('OVERPASS_HTTP_503')), 'upstream_unavailable');
  assert.equal(classifyPoiFailure(new Error('ROAD_NETWORK_UNAVAILABLE')), 'upstream_unavailable');
  assert.equal(classifyPoiFailure(new Error('fetch failed')), 'upstream_unavailable');
  assert.equal(classifyPoiFailure(new Error('OVERPASS_HTTP_429')), 'rate_limited');
  assert.equal(classifyPoiFailure(Object.assign(new Error('OVERPASS_HTTP_400'), { fatal: true })), 'bad_request');
  assert.equal(classifyPoiFailure(new Error('OVERPASS_HTTP_422')), 'bad_request');
  assert.equal(classifyPoiFailure(new Error('Unexpected token < in JSON')), 'internal');
});

test('isTransientPoiFailure — retry solo per transitori', () => {
  assert.equal(isTransientPoiFailure(new Error('OVERPASS_TIMEOUT')), true);
  assert.equal(isTransientPoiFailure(new Error('OVERPASS_HTTP_503')), true);
  assert.equal(isTransientPoiFailure(new Error('OVERPASS_HTTP_429')), true);
  assert.equal(isTransientPoiFailure(Object.assign(new Error('OVERPASS_HTTP_400'), { fatal: true })), false);
  assert.equal(isTransientPoiFailure(new Error('bad JSON parse')), false);
});

test('poi-search/index.ts — retry unico, cache stale, degrado 200, 502 solo senza stale', () => {
  // due cache: fresca + stale a TTL lungo
  assert.match(edge, /const poiStaleCache = createTtlCache<any\[\]>\(STALE_TTL_MS/);
  assert.match(edge, /const STALE_TTL_MS = envInt\("POI_SEARCH_STALE_TTL_MS"/);
  // 1 retry, solo transitori, con backoff
  assert.match(edge, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(edge, /if \(attempt === 0 && isTransientPoiFailure\(err\)\)/);
  assert.match(edge, /RETRY_BACKOFF_MS/);
  // successo scrive ENTRAMBE le cache
  assert.match(edge, /poiCache\.set\(cacheKey, result\.elements\);\s*\n\s*poiStaleCache\.set\(cacheKey, result\.elements\);/);
  // degrado: stale -> 200 con degraded/stale/reason, mai per bad_request
  assert.match(edge, /const stale = reason !== "bad_request" \? poiStaleCache\.get\(cacheKey\) : null;/);
  assert.match(edge, /return json\(\{ elements: stale, cached: true, stale: true, degraded: true, reason \}\);/);
  // 502 solo se NON c'e' stale; bad_request -> 400, rate_limited -> 429
  assert.match(edge, /const status = reason === "bad_request" \? 400 : reason === "rate_limited" \? 429 : 502;/);
  // "0 risultati" resta un 200 (commento + ramo elements)
  assert.match(edge, /Lista vuota = esito valido[\s\S]{0,400}return json\(\{ elements: result\.elements, cached: false \}\)/);
  // log sicuro: nessun secret, solo center/raggio/servizio/reason/elapsed
  assert.match(edge, /const safeLog = \(payload/);
  assert.doesNotMatch(edge, /safeLog\([^)]*(SERVICE_ROLE|apikey|authorization|token|secret)/i);
});

test('Step2Map.jsx — UI fail-safe: messaggio POI degradato + Riprova, mappa/confine non toccati', () => {
  assert.match(step2map, /Attività commerciali temporaneamente non disponibili\. La configurazione può continuare\./);
  assert.doesNotMatch(step2map, /Impossibile verificare le attività in questa zona\./);
  assert.match(step2map, /onClick=\{onRetryPoi\}/);
  assert.match(step2map, /poiFetchFailed && \(/);
});
