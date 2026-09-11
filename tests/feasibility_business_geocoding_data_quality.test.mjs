// TICKET — "BUSINESS FEASIBILITY DATA QUALITY: GEOCODING + ISTAT + POI
// CONSISTENCY". Root cause (§1): resolveBusinessLocation matchava SOLO la
// piccola lista statica GEO_DATA (nessun geocoder reale, nessun indirizzo di
// via) — "milano via oroboni" non risolveva mai, e con `location: null` il
// bug in FeasibilityBusinessFlow.jsx (`poisAvailable: !poiError`, sempre
// true quando il POI non era MAI stato interrogato) trasformava un
// fallimento di geocoding in un finto "Concorrenza: BASSA / 0 attività
// rilevanti" invece di "Dato non disponibile" (§6). Questo file verifica:
// il nuovo resolver reale (§2/§3), che riusa Nominatim (stesso pattern già
// in produzione in geocodeAddress.js) invece di duplicare la geografia, e
// che il fix del bug di orchestrazione sia presente nel codice sorgente.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

import {
  resolveBusinessLocationAsync,
  resolveBusinessLocation,
} from '../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js';
import { buildBusinessAnalysis } from '../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js';
import { NOT_AVAILABLE } from '../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js';

function withMockedFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = original; });
}

// ── §2/§3: real geocoder as primary path, reusing the shared Nominatim helper ─
test('resolveBusinessLocationAsync resolves a real street address ("milano via oroboni") via the shared geocoder, not GEO_DATA', async () => {
  // Sanity: this input is NOT in the static GEO_DATA list (root cause proof).
  assert.equal(resolveBusinessLocation('milano via oroboni'), null);

  await withMockedFetch(async (url) => {
    assert.match(String(url), /nominatim\.openstreetmap\.org\/search/);
    return {
      ok: true,
      json: async () => ([{
        lat: '45.5121',
        lon: '9.1889',
        display_name: 'Via Antonio Oroboni, 20161 Milano, Lombardia, Italia',
        address: { road: 'Via Antonio Oroboni', city: 'Milano', postcode: '20161' },
      }]),
    };
  }, async () => {
    const location = await resolveBusinessLocationAsync('milano via oroboni');
    assert.ok(location, 'la località deve risolvere con il geocoder reale');
    assert.equal(location.city, 'Milano');
    assert.equal(typeof location.lat, 'number');
    assert.equal(typeof location.lng, 'number');
    assert.match(location.displayAddress, /Oroboni/);
    assert.equal(location.source, 'geocoder');
  });
});

test('resolveBusinessLocationAsync: known GEO_DATA comuni still resolve without any network call (fast path unchanged)', async () => {
  let fetchCalled = false;
  await withMockedFetch(async () => { fetchCalled = true; throw new Error('should not be called'); }, async () => {
    const location = await resolveBusinessLocationAsync('Cormano');
    assert.ok(location);
    assert.equal(location.city, 'Cormano');
    assert.equal(location.source, 'geo_data');
  });
  assert.equal(fetchCalled, false);
});

// ── §1/§4: genuine geocoder failure must NEVER be silently treated as success ─
test('resolveBusinessLocationAsync returns null (not invented coordinates) when the geocoder is unreachable', async () => {
  await withMockedFetch(async () => { throw new Error('NETWORK_DOWN'); }, async () => {
    const location = await resolveBusinessLocationAsync('via che non esiste 999, Milano');
    assert.equal(location, null);
  });
});

test('resolveBusinessLocationAsync returns null for empty input, never a guessed default', async () => {
  assert.equal(await resolveBusinessLocationAsync(''), null);
  assert.equal(await resolveBusinessLocationAsync(null), null);
});

// ── §6: the orchestration bug fix — poisAvailable must require a resolved location ─
test('FeasibilityBusinessFlow: poisAvailable requires a resolved location, never just "no error yet" (regression fix)', () => {
  const src = fs.readFileSync(new URL('../src/pages/customer/feasibility/business/FeasibilityBusinessFlow.jsx', import.meta.url), 'utf8');
  assert.match(src, /const poisAvailable = Boolean\(location\) && !poiError;/, 'poisAvailable deve richiedere una località risolta, non solo "nessun errore"');
  assert.doesNotMatch(src, /poisAvailable:\s*!poiError/, 'la vecchia formula buggata (sempre true quando la località non e\' mai stata risolta) non deve piu\' esistere');
});

test('regression contract: unresolved location + never-queried POI (poiError=null) must yield "Dato non disponibile", never BASSA/0', () => {
  // Simula esattamente lo scenario del bug: location non risolta (null),
  // usePoi non interrogato -> poiError resta null (comportamento di
  // usePoi.js, invariato). Il chiamante calcola ora poisAvailable così:
  const location = null;
  const poiError = null;
  const poisAvailable = Boolean(location) && !poiError; // stessa espressione del fix in FeasibilityBusinessFlow.jsx
  assert.equal(poisAvailable, false);

  const analysis = buildBusinessAnalysis({
    center: null,
    location: null,
    radiusKm: 3,
    pois: [],
    poisAvailable,
    targets: ['fitness'],
    territorial: { available: false, population: null, households: null },
  });
  assert.equal(analysis.competitionLevel, NOT_AVAILABLE, 'mai "BASSA" quando la concorrenza non è mai stata realmente interrogata');
  assert.equal(analysis.poisAvailable, false, 'il report/narrative si basano su questo flag per mostrare "Dato non disponibile" invece del conteggio grezzo');
});

// ── §8: report additive fields (Comune/NIL) surfaced without a redesign ──────
test('FeasibilityBusinessReport surfaces resolved Comune/NIL additively in the existing "Area analizzata" section', () => {
  const src = fs.readFileSync(new URL('../src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx', import.meta.url), 'utf8');
  assert.match(src, /Area analizzata/);
  assert.match(src, /Indirizzo geocodificato/);
  assert.match(src, /<dt>Comune<\/dt>/);
  assert.match(src, /<dt>NIL<\/dt>/);
});

// ── §10 firewall: campaign mode / Step2 / engines untouched ──────────────────
test('firewall: Step2.jsx and campaign feasibility engine/schemas are not imported or modified by the new resolver', () => {
  const schemas = fs.readFileSync(new URL('../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js', import.meta.url), 'utf8');
  assert.doesNotMatch(schemas, /from\s+['"][^'"]*Step2\.jsx['"]|from\s+['"][^'"]*\/feasibilityEngine\.js['"]/);
  const step2Src = fs.readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(step2Src, /feasibilityBusiness/i);
});
