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
const heroMap = readFileSync(new URL('../src/components/home/VolantiniProHeroMap.jsx', import.meta.url), 'utf8');

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

test('hook: espone `pending` e settla sulla fetchKey stabile', () => {
  assert.match(hook, /return \{ data, loading, error, pending \}/);
  assert.match(hook, /const lastSettledKeyRef = useRef\(""\)/);
  assert.match(hook, /lastSettledKeyRef\.current = fetchKey/);
  assert.match(hook, /pending = Boolean\(\s*zoneValid &&\s*lastSettledKeyRef\.current !== fetchKey/);
  assert.match(hook, /const zoneValid = isAnalysisZoneValid\(\{ lat, lng, radius, municipality \}\)/);
});

test('hook: il debounce dipende SOLO da fetchKey (+ bfcache), non da lat/lng/quantity raw', () => {
  // dependency array dell'effect di fetch
  assert.match(hook, /\}, \[fetchKey, bfcacheResumeNonce\]\);/);
  // non deve piu' esistere il vecchio array con lat/lng/quantity/scope raw
  assert.doesNotMatch(hook, /\}, \[lat, lng, radius, service, municipality, quantity, scope, analysisLevel/);
});

test('DEBOUNCE NEVER SETTLES: fetchKey STABILE quando cambia solo quantity / scope / target / jitter coord', () => {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
  const base = { ...CORMANO, service: 'd2d', analysisLevel: 'comune', quantity: 10000, scope: 'zone', selectionScope: 'municipality', targetSelection: ['fitness'] };
  const k0 = buildServiceAnalysisRequest(base).fetchKey;

  assert.equal(buildServiceAnalysisRequest({ ...base, quantity: 24710 }).fetchKey, k0, 'quantity non deve muovere fetchKey');
  assert.equal(buildServiceAnalysisRequest({ ...base, quantity: 9999 }).fetchKey, k0, 'quantity (write-back) non deve muovere fetchKey');
  assert.equal(buildServiceAnalysisRequest({ ...base, scope: 'zone_2' }).fetchKey, k0, 'scope/activeZoneId non deve muovere fetchKey');
  assert.equal(buildServiceAnalysisRequest({ ...base, targetSelection: ['fitness', 'beauty'] }).fetchKey, k0, 'targetSelection non deve muovere fetchKey');
  assert.equal(buildServiceAnalysisRequest({ ...base, lat: 45.5437853333, lng: 9.1724314444 }).fetchKey, k0, 'jitter oltre il 6° decimale non deve muovere fetchKey');
});

test('DEBOUNCE NEVER SETTLES: fetchKey CAMBIA quando cambia un parametro territoriale reale', () => {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
  const base = { ...CORMANO, service: 'd2d', analysisLevel: 'comune', selectionScope: 'municipality' };
  const k0 = buildServiceAnalysisRequest(base).fetchKey;
  assert.notEqual(buildServiceAnalysisRequest({ ...base, radius: 8 }).fetchKey, k0, 'radius');
  assert.notEqual(buildServiceAnalysisRequest({ ...base, municipality: 'Milano' }).fetchKey, k0, 'municipality');
  assert.notEqual(buildServiceAnalysisRequest({ ...base, analysisLevel: 'nil' }).fetchKey, k0, 'analysisLevel');
  assert.notEqual(buildServiceAnalysisRequest({ ...base, lat: 45.55 }).fetchKey, k0, 'lat oltre il 6° decimale');
});

test('hook: diagnostica [STEP2_ANALYSIS_KEY] con requestKey / previousRequestKey / changedFields', () => {
  assert.match(hook, /\[STEP2_ANALYSIS_KEY\]/);
  assert.match(hook, /previousRequestKey:/);
  assert.match(hook, /changedFields,/);
  assert.match(hook, /fetchKeyChanged:/);
});

test('hook: [STEP2_ANALYSIS_KEY] NON parte per un\'istanza inattiva (zona non valida, mai attiva)', () => {
  // il log e' gated su (isActive || wasActive): un consumer montato con args
  // null (fetchKey "") e mai stato attivo non produce righe.
  assert.match(hook, /const wasActive = Boolean\(prev && prev\.__fetchKey\);/);
  assert.match(hook, /const isActive = Boolean\(fetchKey\);/);
  assert.match(hook, /prevRequestKeyRef\.current !== requestKey && \(isActive \|\| wasActive\)/);
  // il payload include `scope` per tracciare il consumer
  assert.match(hook, /console\.warn\("\[STEP2_ANALYSIS_KEY\]", \{\s*\n\s*scope: String\(scope \|\| ""\),/);
});

test('Hero preview: l\'analisi territoriale (scope hero_preview) parte SOLO se il preview e\' in viewport', () => {
  // scope literal presente
  assert.match(heroMap, /"hero_preview"/);
  // gate esplicito su previewVisible
  assert.match(heroMap, /const analysisActive = previewVisible;/);
  // gli argomenti di useServiceAnalysis sono null finche' non e' attivo
  assert.match(heroMap, /analysisActive \? previewCity\.lat : null/);
  assert.match(heroMap, /analysisActive \? previewCity\.lng : null/);
  assert.match(heroMap, /analysisActive \? previewCity\.name : null/);
  assert.match(heroMap, /analysisActive \? previewCity\.municipality_code : null/);
  // NON deve piu' passare le coord fisse incondizionatamente
  assert.doesNotMatch(heroMap, /useServiceAnalysis\(\s*\n?\s*previewCity\.lat,/);
});

test('Step2: queryCenterLat/Lng quantizzati a 6 decimali (jitter al source)', () => {
  assert.match(step2, /const round6 = v => \(Number\.isFinite\(Number\(v\)\) \? Math\.round\(Number\(v\) \* 1e6\) \/ 1e6 : null\);/);
  assert.match(step2, /const queryCenterLat = round6\(/);
  assert.match(step2, /const queryCenterLng = round6\(/);
});

test('Step2: [STEP2_ANALYSIS_GATE] non spamma (log solo al cambio di stato)', () => {
  assert.match(step2, /const analysisGateSigRef = useRef\(null\)/);
  assert.match(step2, /if \(analysisGateSigRef\.current === sig\) return;/);
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
