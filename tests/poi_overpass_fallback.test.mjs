// Verifica deterministica del fallback multi-endpoint Overpass in
// src/lib/services/poi-api.js (fetchPois). A differenza di
// tests/step2_poi_error_state.test.mjs (che mocka fetch in modo identico
// per qualsiasi URL), qui il mock e' DIFFERENZIATO per endpoint, cosi' da
// poter dimostrare che dopo un fallimento (504/timeout) sul primo endpoint
// configurato, fetchPois tenta automaticamente il successivo, e che
// un errore finale viene lanciato solo se TUTTI gli endpoint falliscono.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchPois } from '../src/lib/services/poi-api.js';

function schoolElement(id, name, lat, lon) {
  return { type: 'node', id, lat, lon, tags: { amenity: 'school', name } };
}

// plan: Map<urlSubstring, { status?, ok?, elements?, rejects? }>
// Il timeout reale (AbortController a 18s in fetchPois) non e' simulabile
// qui senza fake timer sull'intero modulo; la logica di fallback su 504 e
// su rifiuto di rete attraversa comunque lo stesso ramo catch generico,
// quindi i test sotto coprono anche il percorso di timeout.
function trackedFetchMock(plan) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const key = [...plan.keys()].find((k) => String(url).includes(k));
    const cfg = key ? plan.get(key) : null;
    if (!cfg) throw new Error(`UNEXPECTED_URL:${url}`);
    if (cfg.rejects) throw new Error(cfg.rejectMessage || 'NETWORK_ERROR');
    return {
      ok: cfg.ok !== false,
      status: cfg.status ?? (cfg.ok !== false ? 200 : 500),
      json: async () => ({ elements: cfg.elements || [] }),
    };
  };
  fn.calls = calls;
  return fn;
}

// =================================================================
// TEST A — primary 200 -> POI renderizzati, un solo endpoint chiamato
// =================================================================
test('TEST A: endpoint primario 200 restituisce risultati senza toccare il fallback', async () => {
  const plan = new Map([
    ['kumi.systems', { ok: true, elements: [schoolElement(1, 'Scuola Kumi', 45.6, 9.1)] }],
    ['overpass-api.de', { ok: true, elements: [schoolElement(2, 'Scuola De', 45.6, 9.1)] }],
  ]);
  const mock = trackedFetchMock(plan);
  globalThis.fetch = mock;

  const result = await fetchPois({ centerLat: 45.6, centerLng: 9.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] });

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Scuola Kumi');
  assert.equal(mock.calls.length, 1, 'con il primario disponibile non deve essere contattato il fallback');
  assert.match(mock.calls[0], /kumi\.systems/);
});

// =================================================================
// TEST B — primary 504, fallback 200 -> POI renderizzati, nessun error-state
// =================================================================
test('TEST B: 504 sul primario passa automaticamente al fallback e restituisce i risultati', async () => {
  const plan = new Map([
    ['kumi.systems', { ok: false, status: 504 }],
    ['overpass-api.de', { ok: true, elements: [schoolElement(3, 'Scuola Fallback', 45.6, 9.1)] }],
  ]);
  const mock = trackedFetchMock(plan);
  globalThis.fetch = mock;

  const result = await fetchPois({ centerLat: 45.6, centerLng: 9.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] });

  assert.equal(result.length, 1, 'il fallback deve restituire i risultati senza propagare l\'errore del primario');
  assert.equal(result[0].name, 'Scuola Fallback');
  assert.equal(mock.calls.length, 2, 'devono essere tentati entrambi gli endpoint, in ordine');
  assert.match(mock.calls[0], /kumi\.systems/);
  assert.match(mock.calls[1], /overpass-api\.de/);
});

// =================================================================
// TEST C — primary e fallback entrambi falliscono -> errore finale
// =================================================================
test('TEST C: fallimento di entrambi gli endpoint propaga un errore (error-state)', async () => {
  const plan = new Map([
    ['kumi.systems', { ok: false, status: 504 }],
    ['overpass-api.de', { ok: false, status: 504 }],
  ]);
  const mock = trackedFetchMock(plan);
  globalThis.fetch = mock;

  await assert.rejects(
    () => fetchPois({ centerLat: 45.6, centerLng: 9.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] }),
    /OVERPASS_TIMEOUT|OVERPASS_HTTP_504/,
    'con entrambi gli endpoint in 504 deve essere lanciato un errore solo dopo averli tentati entrambi'
  );
  assert.equal(mock.calls.length, 2, 'entrambi gli endpoint devono essere stati tentati prima di arrendersi');
});

// =================================================================
// TEST C bis — rifiuto di rete (non solo HTTP non-ok) attraversa lo stesso fallback
// =================================================================
test('TEST C bis: un rifiuto di rete (non solo status HTTP) sul primario passa comunque al fallback', async () => {
  const plan = new Map([
    ['kumi.systems', { rejects: true, rejectMessage: 'NETWORK_DOWN' }],
    ['overpass-api.de', { ok: true, elements: [schoolElement(4, 'Scuola Dopo Rete Giu', 45.6, 9.1)] }],
  ]);
  const mock = trackedFetchMock(plan);
  globalThis.fetch = mock;

  const result = await fetchPois({ centerLat: 45.6, centerLng: 9.1, radiusKm: 3, serviceType: 'd2d', targetSelection: ['scuole'] });

  assert.equal(result.length, 1);
  assert.equal(mock.calls.length, 2);
});
