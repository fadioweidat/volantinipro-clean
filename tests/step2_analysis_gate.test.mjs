// TICKET — CRITICAL STEP 2: "analysis-istat REQUEST NOT FIRING".
// La diagnostica [STEP2_TERRITORIAL_STATE] segnalava apiRequestFired:false per
// Cormano con parametri validi. Causa: il log veniva emesso nello STESSO commit
// React in cui i parametri diventano validi, prima che il fetch debounced del
// hook si riflettesse in `loading`. Fix: il hook espone `pending` (zona valida
// ma nessun esito ancora per il requestKey corrente) e Step2 non dichiara
// "Dato non disponibile" / non logga come bloccato finche' !pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAnalysisZoneValid } from '../src/hooks/useServiceAnalysis.js';
import { buildServiceAnalysisRequest } from '../src/lib/step2/buildServiceAnalysisRequest.js';

const hook = readFileSync(new URL('../src/hooks/useServiceAnalysis.js', import.meta.url), 'utf8');
const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');

const CORMANO = { lat: 45.543785, lng: 9.172431, radius: 3, municipality: 'Cormano' };

test('isAnalysisZoneValid: Cormano (comune, parametri validi) supera il guard', () => {
  assert.equal(isAnalysisZoneValid(CORMANO), true);
});

test('isAnalysisZoneValid: casi invalidi NON fanno partire la richiesta', () => {
  assert.equal(isAnalysisZoneValid({ ...CORMANO, lat: undefined }), false, 'no lat');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, lat: NaN }), false, 'lat NaN');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, lat: 0 }), false, 'lat 0');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, lng: undefined }), false, 'no lng');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, lng: 0 }), false, 'lng 0');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, radius: 0 }), false, 'radius 0');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, radius: -1 }), false, 'radius negativo');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, municipality: null }), false, 'no municipality');
  assert.equal(isAnalysisZoneValid({ ...CORMANO, municipality: '' }), false, 'municipality vuoto');
  assert.equal(isAnalysisZoneValid(), false, 'nessun argomento');
});

test('buildServiceAnalysisRequest: Cormano d2d comune -> URL analysis-istat completo', () => {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
  const { url, requestKey } = buildServiceAnalysisRequest({
    ...CORMANO, service: 'd2d', analysisLevel: 'comune'
  });
  assert.ok(url, 'url non deve essere null quando il backend e configurato');
  assert.match(url, /analysis-istat/);
  assert.match(url, /municipality=Cormano/);
  assert.match(url, /analysisLevel=comune/);
  assert.match(url, /lat=45\.543785/);
  assert.match(url, /lng=9\.172431/);
  assert.match(url, /radius=3/);
  assert.match(requestKey, /Cormano/);
});

test('hook: espone `pending` e traccia lastSettledKeyRef dopo l esito', () => {
  assert.match(hook, /return \{ data, loading, error, pending \}/);
  assert.match(hook, /const lastSettledKeyRef = useRef\(""\)/);
  assert.match(hook, /lastSettledKeyRef\.current = requestKey/);
  // pending vero solo se zona valida e requestKey corrente non ancora concluso
  assert.match(hook, /pending =\s*lastSettledKeyRef\.current !== currentRequestKey/);
  // il guard resta identico e centralizzato
  assert.match(hook, /const hasValidZone = isAnalysisZoneValid\(\{ lat, lng, radius, municipality \}\)/);
});

test('Step2: log [STEP2_ANALYSIS_GATE] con tutti i campi richiesti dal ticket', () => {
  assert.match(step2, /\[STEP2_ANALYSIS_GATE\]/);
  for (const k of [
    'shouldFetch', 'municipalityOk', 'latOk', 'lngOk', 'radiusOk',
    'serviceOk', 'analysisLevelOk', 'zoneActive', 'coverageMode', 'reasonBlocked',
  ]) {
    assert.match(step2, new RegExp(`\\b${k}\\b`), `[STEP2_ANALYSIS_GATE] deve includere ${k}`);
  }
  // reasonBlocked deve poter distinguere i guard
  for (const r of [
    'missing-municipality', 'invalid-lat', 'invalid-lng', 'invalid-radius',
    'missing-service', 'pending-debounce', 'no-request-after-settle',
  ]) {
    assert.match(step2, new RegExp(r.replace(/-/g, '\\-')), `reasonBlocked deve prevedere "${r}"`);
  }
  // nessun secret nel log
  assert.doesNotMatch(step2, /\[STEP2_ANALYSIS_GATE\][\s\S]{0,600}(apikey|authorization|Bearer|SERVICE_ROLE|anonKey)/i);
});

test('Step2: "Dato non disponibile" attende il settle della richiesta (no falso negativo)', () => {
  assert.match(step2, /const apiRequestSettled = !apiLoading && !apiPending/);
  assert.match(step2, /const territorialDataUnavailable = Boolean\(city && apiRequestSettled && !hasUsefulApiZones && !apiHasAggregateValues\)/);
  assert.match(step2, /if \(!city \|\| !apiRequestSettled\) return;/);
});

test('Step2: pending propagato dal hook (non si rompono le altre modalita)', () => {
  assert.match(step2, /pending: apiPending\s*\}\s*=\s*useServiceAnalysis\(/);
  // la query NON e resa always-on: il gate resta condizionale su zoneActive
  assert.match(step2, /const shouldFetch = zoneActive && serviceOk;/);
});
