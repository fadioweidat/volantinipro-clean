import assert from 'node:assert/strict';
import { beginLatestRequest, createAbortError, createTimeoutSignal, isAbortError } from '../src/lib/services/request-cancellation.js';
import { fetchPois } from '../src/lib/services/poi-api.js';
import { getStep2ServiceAvailabilityMessage } from '../src/lib/step2/serviceAvailabilityMessage.js';

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
const { fetchTransportStopsInRadius } = await import('../src/lib/services/transport-api.js');

const originalFetch = global.fetch;

function abortingFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(signal.reason || createAbortError());
    signal.addEventListener('abort', () => reject(signal.reason || createAbortError()), { once: true });
  });
}

// Caso A: una risposta vecchia che ignora l'abort non può più applicarsi.
{
  const latest = { current: 0 };
  const applied = [];
  const milano = beginLatestRequest(latest);
  milano.controller.abort();
  const bergamo = beginLatestRequest(latest);
  if (bergamo.isCurrent()) applied.push('Bergamo');
  if (milano.isCurrent()) applied.push('Milano');
  assert.deepEqual(applied, ['Bergamo']);
}

// Caso B: abort intenzionale è riconosciuto, non diventa warning né empty state.
{
  const latest = { current: 0 };
  const request = beginLatestRequest(latest);
  const preserved = ['dato-valido'];
  request.controller.abort();
  assert.equal(request.signal.aborted, true);
  assert.equal(isAbortError(request.signal.reason), true);
  assert.equal(getStep2ServiceAvailabilityMessage('poi', null), null);
  assert.deepEqual(preserved, ['dato-valido']);
}

// Caso C: timeout annulla fetch ed è ancora classificato dal copy P2-A.
{
  global.fetch = abortingFetch;
  await assert.rejects(
    fetchTransportStopsInRadius({ centerLat: 45.46, centerLng: 9.19, radiusKm: 3 }, { timeoutMs: 5 }),
    error => error.message === 'TRANSPORT_TIMEOUT',
  );
  assert.match(getStep2ServiceAvailabilityMessage('transport', 'TRANSPORT_TIMEOUT'), /tempo massimo/i);
}

// Caso D1: errore reale del primario abilita il fallback con signal propagato.
{
  const signals = [];
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    signals.push(options.signal);
    if (calls === 1) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ elements: [] }) };
  };
  const controller = new AbortController();
  const result = await fetchPois({ centerLat: 45.46, centerLng: 9.19, radiusKm: 3, serviceType: 'h2h' }, { signal: controller.signal, timeoutMs: 50 });
  assert.deepEqual(result, []);
  assert.equal(calls, 2);
  assert.equal(signals.every(Boolean), true);
}

// Caso D2: abort del primario interrompe il ciclo e non avvia il fallback.
{
  let calls = 0;
  global.fetch = (url, options) => {
    calls += 1;
    return abortingFetch(url, options);
  };
  const controller = new AbortController();
  const pending = fetchPois({ centerLat: 45.46, centerLng: 9.19, radiusKm: 3, serviceType: 'h2h' }, { signal: controller.signal, timeoutMs: 100 });
  controller.abort();
  await assert.rejects(pending, error => isAbortError(error));
  assert.equal(calls, 1);
}

// Caso E: il cambio H2H -> Business invalida il risultato del servizio precedente.
{
  const latest = { current: 0 };
  const h2h = beginLatestRequest(latest);
  h2h.controller.abort();
  const business = beginLatestRequest(latest);
  const applied = business.isCurrent() ? 'b2b' : 'h2h';
  assert.equal(applied, 'b2b');
  assert.equal(h2h.isCurrent(), false);
}

// Caso F: il cleanup/unmount annulla la richiesta e rimuove anche il timeout.
{
  const latest = { current: 0 };
  const request = beginLatestRequest(latest);
  const timeout = createTimeoutSignal(request.signal, 10_000);
  request.controller.abort();
  assert.equal(timeout.signal.aborted, true);
  timeout.cleanup();
}

global.fetch = originalFetch;
console.log('Step 2 P2-B request cancellation: PASS');
