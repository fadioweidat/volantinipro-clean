import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';
import {
  createAdminRefreshLoop,
  createAdminResourceStore,
  createSingleFlightLoader,
  nextAdminRefreshDelay,
  summarizeAdminResourceStates,
  withAbortTimeout,
} from '../src/lib/admin/adminDashboardResilience.js';
import { latestGpsPoint, lastActivityAt } from '../src/lib/services/report-utils.js';

const dashboardSource = readFileSync(new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8');

test('successo con array realmente vuoto resta disponibile e non diventa errore', async () => {
  const store = createAdminResourceStore({ now: () => 100 });
  const result = await store.load('campaign-zones', async () => [], { fallback: ['fallback'] });
  assert.deepEqual(result.value, []);
  assert.equal(result.available, true);
  assert.equal(result.stale, false);
  assert.equal(result.error, null);
});

test('HTTP 500 campaign_zones conserva l’ultimo dato valido', async () => {
  let now = 100;
  const store = createAdminResourceStore({ now: () => now });
  await store.load('campaign-zones', async () => [{ id: 'zone-1' }], { fallback: [] });
  now = 200;
  const result = await store.load('campaign-zones', async () => { throw Object.assign(new Error('500'), { status: 500 }); }, { fallback: [] });
  assert.deepEqual(result.value, [{ id: 'zone-1' }]);
  assert.equal(result.available, true);
  assert.equal(result.stale, true);
  assert.equal(result.error.status, 500);
});

test('HTTP 500 GPS non azzera altre risorse e recupera al ciclo successivo', async () => {
  const store = createAdminResourceStore();
  await store.load('campaigns', async () => [{ id: 'campaign-1' }], { fallback: [] });
  await store.load('gps', async () => [{ session_id: 'session-1' }], { fallback: [] });
  const failedGps = await store.load('gps', async () => { throw Object.assign(new Error('GPS 500'), { status: 500 }); }, { fallback: [] });
  const campaigns = await store.load('campaigns', async () => [{ id: 'campaign-2' }], { fallback: [] });
  const recoveredGps = await store.load('gps', async () => [{ session_id: 'session-2' }], { fallback: [] });
  assert.deepEqual(failedGps.value, [{ session_id: 'session-1' }]);
  assert.deepEqual(campaigns.value, [{ id: 'campaign-2' }]);
  assert.deepEqual(recoveredGps.value, [{ session_id: 'session-2' }]);
  assert.equal(recoveredGps.stale, false);
});

test('senza ultimo dato valido un fallimento è non disponibile, non uno zero valido', async () => {
  const store = createAdminResourceStore();
  const result = await store.load('gps', async () => { throw new Error('timeout'); }, { fallback: [] });
  assert.deepEqual(result.value, []);
  assert.equal(result.available, false);
  assert.equal(result.lastSuccessAt, null);
});

test('single-flight con richiesta oltre 30 secondi avvia un solo caricamento', async () => {
  let calls = 0;
  let release;
  const loader = createSingleFlightLoader(() => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  });
  const first = loader();
  const tickAfterThirtySeconds = loader();
  assert.equal(calls, 0, 'il loader parte nella microtask successiva');
  await Promise.resolve();
  assert.equal(calls, 1);
  release('ok');
  assert.deepEqual(await Promise.all([first, tickAfterThirtySeconds]), ['ok', 'ok']);
});

test('timeout abortisce la richiesta pendente e il backoff cresce senza loop stretto', async () => {
  let aborted = false;
  await assert.rejects(
    withAbortTimeout((signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
    }), 10),
  );
  assert.equal(aborted, true);
  assert.equal(nextAdminRefreshDelay(0), 30_000);
  assert.equal(nextAdminRefreshDelay(1), 60_000);
  assert.equal(nextAdminRefreshDelay(5), 5 * 60_000);
});

test('timeout termina anche se il loader ignora AbortSignal', async () => {
  const startedAt = Date.now();
  await assert.rejects(withAbortTimeout(() => new Promise(() => {}), 10), {
    name: 'TimeoutError',
    message: 'ADMIN_HOME_REFRESH_TIMEOUT',
  });
  assert.ok(Date.now() - startedAt < 250, 'il timeout deve concludere la Promise chiamante');
});

test('cache rispetta TTL e aggiorna solo dopo la scadenza', async () => {
  let now = 1_000;
  let calls = 0;
  const store = createAdminResourceStore({ now: () => now });
  const loader = async () => ({ version: ++calls });
  assert.deepEqual((await store.load('commercial', loader, { fallback: {}, maxAgeMs: 300_000 })).value, { version: 1 });
  now += 299_999;
  const hit = await store.load('commercial', loader, { fallback: {}, maxAgeMs: 300_000 });
  assert.equal(hit.refreshed, false);
  assert.equal(calls, 1);
  now += 1;
  const expired = await store.load('commercial', loader, { fallback: {}, maxAgeMs: 300_000 });
  assert.equal(expired.refreshed, true);
  assert.equal(calls, 2);
});

test('loop applica backoff a errori parziali e torna a 30 secondi dopo il recupero', async () => {
  const scheduled = [];
  const results = [
    { refreshIssues: ['gps'] },
    { refreshIssues: ['gps'] },
    { refreshIssues: [] },
  ];
  const stop = createAdminRefreshLoop({
    run: async () => results.shift(),
    onResult: () => {},
    onError: assert.fail,
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
    cancel: () => {},
  });
  await new Promise(setImmediate);
  assert.equal(scheduled[0].delay, 60_000);
  scheduled[0].callback();
  await new Promise(setImmediate);
  assert.equal(scheduled[1].delay, 120_000);
  scheduled[1].callback();
  await new Promise(setImmediate);
  assert.equal(scheduled[2].delay, 30_000);
  stop();
});

test('composizione parziale conserva snapshot valido e segnala solo la risorsa fallita', () => {
  const summary = summarizeAdminResourceStates({
    campaigns: { value: [{ id: 'c1' }], error: null, lastSuccessAt: 100 },
    gps: { value: [{ id: 'p1' }], error: new Error('500'), lastSuccessAt: 90 },
    operators: { value: [], error: null, lastSuccessAt: 100 },
  });
  assert.deepEqual(summary.refreshIssues, ['gps']);
  assert.equal(summary.hasAnyData, true);
});

test('cleanup durante una richiesta impedisce aggiornamenti tardivi', async () => {
  let release;
  let updates = 0;
  const stop = createAdminRefreshLoop({
    run: () => new Promise((resolve) => { release = resolve; }),
    onResult: () => { updates += 1; },
    onError: () => { updates += 1; },
    schedule: () => 1,
    cancel: () => {},
  });
  await Promise.resolve();
  stop();
  release({ refreshIssues: [] });
  await Promise.resolve();
  assert.equal(updates, 0);
});

test('ultimo punto GPS è il più recente indipendentemente dall’ordinamento', () => {
  const descending = [
    { id: 'new', recorded_at: '2026-09-27T10:00:00Z' },
    { id: 'old', recorded_at: '2026-09-27T09:00:00Z' },
  ];
  assert.equal(latestGpsPoint(descending).id, 'new');
  assert.equal(lastActivityAt({}, descending), '2026-09-27T10:00:00Z');
  assert.equal(latestGpsPoint([...descending].reverse()).id, 'new');
});

test('home mantiene un solo coordinatore, niente setInterval e non richiede tracce GPS globali', () => {
  assert.match(dashboardSource, /createSingleFlightLoader/);
  assert.doesNotMatch(dashboardSource, /setInterval/);
  assert.match(dashboardSource, /includeGpsPoints:\s*false/);
  assert.match(dashboardSource, /createAdminRefreshLoop/);
});

function fakeSupabase(responses, calls = []) {
  const makeQuery = (key) => {
    const state = { signal: null };
    let proxy;
    proxy = new Proxy({}, {
      get(_target, property) {
        if (property === 'then') {
          return (resolve, reject) => Promise.resolve().then(() => {
            if (state.signal?.aborted) throw state.signal.reason || new Error('aborted');
            const response = typeof responses[key] === 'function' ? responses[key]() : responses[key];
            return response || { data: [], error: null };
          }).then(resolve, reject);
        }
        if (property === 'abortSignal') return (signal) => { state.signal = signal; return proxy; };
        return () => proxy;
      },
    });
    return proxy;
  };
  return {
    from(table) { calls.push(table); return makeQuery(table); },
    rpc(name) { calls.push(`rpc:${name}`); return makeQuery(`rpc:${name}`); },
  };
}

async function loadAdminApiWithFakeSupabase(responses) {
  const calls = [];
  globalThis.__vpAdminFakeSupabase = fakeSupabase(responses, calls);
  const vite = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    plugins: [{
      name: 'admin-dashboard-resilience-supabase-stub',
      enforce: 'pre',
      resolveId(source) {
        if (/(^|\/)supabaseClient\.js$/.test(source)) return '\0admin-resilience-supabase';
        return null;
      },
      load(id) {
        if (id === '\0admin-resilience-supabase') {
          return 'export const supabase = globalThis.__vpAdminFakeSupabase; export async function ensureSupabaseSessionBridge() {}';
        }
        return null;
      },
    }],
  });
  const api = await vite.ssrLoadModule('/src/lib/services/admin-api.js');
  return { api, calls, close: async () => { delete globalThis.__vpAdminFakeSupabase; await vite.close(); } };
}

test('integrazione Supabase: campaign_zones vuoto è valido, HTTP 500 è indisponibile', async () => {
  const normal = await loadAdminApiWithFakeSupabase({});
  try {
    const result = await normal.api.getRealCampaigns({ includeTest: true, includeGpsPoints: false, requireComplete: true });
    assert.equal(result.availability.zones, true);
    assert.deepEqual(result.allRows, []);
    assert.equal(normal.calls.includes('gps_tracking_points'), false);
  } finally { await normal.close(); }

  const failed = await loadAdminApiWithFakeSupabase({ campaign_zones: { data: null, error: { status: 500, message: 'campaign_zones failed' } } });
  try {
    await assert.rejects(
      failed.api.getRealCampaigns({ includeTest: true, includeGpsPoints: false, requireComplete: true }),
      /campaign_zones non disponibile/,
    );
  } finally { await failed.close(); }
});

test('integrazione Supabase: un errore in una fonte campagne additiva non produce conteggi parziali', async () => {
  const runtime = await loadAdminApiWithFakeSupabase({
    campagne: { data: null, error: { status: 500, message: 'legacy campaigns failed' } },
  });
  try {
    await assert.rejects(
      runtime.api.getRealCampaigns({ includeTest: true, includeGpsPoints: false, requireComplete: true }),
      /campagne non disponibile/,
    );
    await assert.rejects(
      runtime.api.getClientsQuotesOverview({ includeTest: true, requireComplete: true }),
      /campagne non disponibile/,
    );
  } finally { await runtime.close(); }
});

test('integrazione Supabase: HTTP 500 GPS rende indisponibile solo lo snapshot operativo', async () => {
  const assignment = {
    id: 'assignment-1', operator_id: 'operator-1', campaign_id: 'campaign-1', group_id: 'group-1', status: 'active',
    starts_at: '2026-09-27T08:00:00Z', ends_at: '2026-09-27T18:00:00Z', operator_assignment_zones: [],
  };
  const session = {
    id: 'session-1', assignment_id: 'assignment-1', driver_id: 'operator-1', campaign_id: 'campaign-1',
    group_id: 'group-1', status: 'started', created_at: '2026-09-27T09:00:00Z', started_at: '2026-09-27T09:00:00Z',
  };
  const fixture = {
    operator_assignments: { data: [assignment], error: null },
    delivery_sessions: { data: [session], error: null },
    'rpc:admin_daily_report_telemetry': { data: null, error: { status: 500, message: 'gps failed' } },
  };
  const runtime = await loadAdminApiWithFakeSupabase(fixture);
  try {
    await assert.rejects(runtime.api.getDailyOperations('2026-09-27', { requireComplete: true }), /gps failed/);
    fixture['rpc:admin_daily_report_telemetry'] = { data: [], error: null };
    const recovered = await runtime.api.getDailyOperations('2026-09-27', { requireComplete: true });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].lastPing, null);
    assert.equal(runtime.calls.includes('gps_tracking_points'), false);
    assert.equal(runtime.calls.includes('proof_photos'), false);
  } finally { await runtime.close(); }
});

test('integrazione Supabase: una sessione attiva iniziata prima di mezzanotte resta visibile', async () => {
  const runtime = await loadAdminApiWithFakeSupabase({
    operator_assignments: { data: [{
      id: 'assignment-night', operator_id: 'operator-1', campaign_id: 'campaign-1', group_id: 'group-1', status: 'active',
      starts_at: '2026-09-26T20:00:00Z', ends_at: '2026-09-26T23:00:00Z', operator_assignment_zones: [],
    }], error: null },
    delivery_sessions: { data: [{
      id: 'session-night', assignment_id: 'assignment-night', driver_id: 'operator-1', campaign_id: 'campaign-1',
      group_id: 'group-1', status: 'started', created_at: '2026-09-26T21:00:00Z', started_at: '2026-09-26T21:00:00Z',
    }], error: null },
    'rpc:admin_daily_report_telemetry': { data: [{
      session_id: 'session-night', gps_count: 3, first_gps_at: '2026-09-26T21:00:00Z',
      last_gps_at: '2026-09-27T08:00:00Z', photo_count: 2,
    }], error: null },
  });
  try {
    const result = await runtime.api.getDailyOperations('2026-09-27', { requireComplete: true });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'assignment-night');
    assert.equal(result[0].lastPing, '2026-09-27T08:00:00Z');
    assert.equal(result[0].photosCount, 2);
  } finally { await runtime.close(); }
});
