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

test('poi-search/index.ts — budget totale, retry budget-aware, degrado SEMPRE 200 (mai 502 al browser)', () => {
  // due cache: fresca + stale a TTL lungo + cache negativa a TTL breve
  assert.match(edge, /const poiStaleCache = createTtlCache<any\[\]>\(STALE_TTL_MS/);
  assert.match(edge, /const STALE_TTL_MS = envInt\("POI_SEARCH_STALE_TTL_MS"/);
  assert.match(edge, /const poiNegativeCache = createTtlCache<\{ reason: string \}>\(NEGATIVE_TTL_MS/);
  assert.match(edge, /const NEGATIVE_TTL_MS = envInt\("POI_SEARCH_NEGATIVE_TTL_MS", 45000/);
  // BUDGET TOTALE dell'intera operazione (target 3-5s) + deadline passata al fallback
  assert.match(edge, /const TOTAL_BUDGET_MS = envInt\("POI_SEARCH_TOTAL_BUDGET_MS", 4000, 1500, 15000\)/);
  assert.match(edge, /const deadline = t0 \+ TOTAL_BUDGET_MS;/);
  assert.match(edge, /deadlineMs: deadline,/);
  // timeout per-provider ridotto (era 12000)
  assert.match(edge, /const PROVIDER_TIMEOUT_MS = envInt\("POI_SEARCH_TIMEOUT_MS", 3000/);
  // 1 retry, solo transitori, solo se NON deadline-exceeded e resta budget
  assert.match(edge, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(edge, /attempt === 0 && isTransientPoiFailure\(err\) && !err\?\.deadlineExceeded && budgetLeft > PROVIDER_TIMEOUT_MS \* 0\.6/);
  // successo scrive ENTRAMBE le cache
  assert.match(edge, /poiCache\.set\(cacheKey, result\.elements\);\s*\n\s*poiStaleCache\.set\(cacheKey, result\.elements\);/);
  // cache negativa: hit -> risposta immediata (stale o degraded), nessun Overpass
  assert.match(edge, /const negative = poiNegativeCache\.get\(cacheKey\);/);
  assert.match(edge, /return degradedResponse\(negative\.reason, staleForNeg \?\? \[\]\);/);
  // degrado finale: SEMPRE 200 strutturato (mai 502). bad_request -> 400 a parte.
  assert.match(edge, /if \(reason === "bad_request"\) \{[\s\S]{0,240}\}, 400\);/);
  assert.match(edge, /poiNegativeCache\.set\(cacheKey, \{ reason \}\);/);
  assert.match(edge, /return degradedResponse\(reason, stale \?\? \[\]\);/);
  // degradedResponse: 200, elements [], temporaryUnavailable quando vuoto
  assert.match(edge, /const degradedResponse = \(reason: string, elements: any\[\] = \[\]\) =>\s*\n\s*json\(\{/);
  assert.match(edge, /temporaryUnavailable: elements\.length === 0,/);
  // NESSUN 502 restituito (solo nei commenti che spiegano il perche')
  const code = edge.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /\b502\b/);
  assert.doesNotMatch(code, /const status = reason === "bad_request"/);
  // "0 risultati" resta un 200 (commento + ramo elements)
  assert.match(edge, /Lista vuota = esito valido[\s\S]{0,400}return json\(\{ elements: result\.elements, cached: false \}\)/);
  // log sicuro: nessun secret
  assert.match(edge, /const safeLog = \(payload/);
  assert.doesNotMatch(edge, /safeLog\([^)]*(SERVICE_ROLE|apikey|authorization|token|secret)/i);
});

test('Step2Map.jsx — UI fail-safe: messaggio POI degradato + Riprova, mappa/confine non toccati', () => {
  assert.match(step2map, /Attività commerciali temporaneamente non disponibili\. La configurazione può continuare\./);
  assert.doesNotMatch(step2map, /Impossibile verificare le attività in questa zona\./);
  assert.match(step2map, /onClick=\{onRetryPoi\}/);
  assert.match(step2map, /poiFetchFailed && \(/);
});
