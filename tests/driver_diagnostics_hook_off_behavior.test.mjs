// BUG D D1 — useDriverAssignment must behave exactly as before with diagnostics
// OFF. The hook is executed for real (react-test-renderer) against a fake
// fetch, and its observable results/requests are compared with the SAME hook
// taken from git before D1 (differential test). Fakes only: no network/Supabase.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const srcUrl = new URL('../src/', import.meta.url).href; // ends with /src/
const PRE_D1_REF = '10ee7f12b20fb4cc586c50506afb34237b1d3a80'; // upstream base: hook before D1

// window shim (the hook reads window.location.search and window.setTimeout)
globalThis.window = {
  location: { search: '?access=link-token-1', pathname: '/driver/assignment/00000000-0000-4000-8000-000000000001' },
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
  clearTimeout,
};

const requests = [];
let scenario = 'success';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const url = String(input && input.url ? input.url : input);
  const rpc = url.split('/rest/v1/rpc/')[1] || 'other';
  requests.push(rpc);
  if (rpc === 'get_public_driver_assignment') {
    if (scenario === 'success') {
      return json(200, {
        campaign_id: 'camp-1', status: 'active', starts_at: null, ends_at: null, confirmed_at: null,
        zones: [{ id: 'z-1', zone_name: 'Zona A', priority: 1, quantity: 100, status: 'Da iniziare', center_lat: 45.1, center_lng: 9.1, radius_m: 500 }],
      });
    }
    if (scenario === 'transient') return json(503, { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' });
    if (scenario === 'not_found') return json(200, { error: 'not_found' });
  }
  return json(200, null); // log_assignment_event and anything else
};

const store = new Map();
const touched = [];
globalThis.localStorage = {
  getItem: (k) => { touched.push(k); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { touched.push(k); store.set(k, String(v)); },
  removeItem: (k) => { touched.push(k); store.delete(k); },
};

await import('../src/supabaseClient.js'); // same module instance the hook loads dynamically

const tmpDir = new URL('../node_modules/.vp-hook-test/', import.meta.url);
mkdirSync(tmpDir, { recursive: true });
after(() => rmSync(tmpDir, { recursive: true, force: true }));

// The hook uses import.meta.env (Vite only): neutralise it and make the
// relative imports absolute so the module can live outside src/.
function materialise(name, source) {
  const transformed = source
    .replace(/Boolean\(import\.meta\.env\.DEV\)/g, 'false')
    .replace(/(from\s+|import\()(['"])\.\.\//g, `$1$2${srcUrl}`);
  const code = transformed.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!code.includes('import.meta.env'), 'no Vite-only construct left in executable code');
  const file = new URL(`${name}.mjs`, tmpDir);
  writeFileSync(file, transformed);
  return import(pathToFileURL(fileURLToPath(file)).href + `?v=${Date.now()}`);
}

const headSource = readFileSync(new URL('../src/hooks/useDriverAssignment.js', import.meta.url), 'utf8');
let baseSource = null;
try {
  baseSource = execFileSync('git', ['show', `${PRE_D1_REF}:src/hooks/useDriverAssignment.js`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch { /* no git/history available: differential part is skipped, absolute assertions still run */ }

async function run(mod, name) {
  requests.length = 0;
  touched.length = 0;
  let latest = null;
  const Probe = () => { latest = mod.useDriverAssignment('00000000-0000-4000-8000-000000000001'); return null; };
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  const t0 = Date.now();
  const done = () => latest && !latest.loadingAssignment && !latest.loadingProgramDetails;
  while (!done()) {
    if (Date.now() - t0 > 6000) throw new Error(`${name}: hook did not settle`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
  const snapshot = {
    assignmentData: latest.assignmentData,
    zones: latest.assignmentZones,
    error: latest.assignmentError,
    isTransientError: latest.isTransientError,
    campaignId: latest.campaignId,
    confirmedAt: latest.confirmedAt,
    openEventStatus: latest.openEventStatus,
    openEventError: latest.openEventError,
    programDetailsError: latest.programDetailsError,
    accessToken: latest.accessToken,
    requests: [...requests],
    diagStorageKeys: touched.filter((k) => String(k).startsWith('vp_diag')),
  };
  await act(async () => { renderer.unmount(); });
  return snapshot;
}

const SCENARIOS = ['success', 'transient', 'not_found'];

for (const name of SCENARIOS) {
  test(`OFF: useDriverAssignment "${name}" — expected outcome, no diagnostic storage`, async () => {
    scenario = name;
    const mod = await materialise(`head-${name}`, headSource);
    const s = await run(mod, `head-${name}`);
    assert.deepEqual(s.diagStorageKeys, [], 'no vp_diag key touched');
    assert.equal(s.accessToken, 'link-token-1');
    if (name === 'success') {
      assert.equal(s.error, null);
      assert.equal(s.campaignId, 'camp-1');
      assert.deepEqual(s.zones.map((z) => z.zone_name), ['Zona A']);
      assert.equal(s.openEventStatus, 'success');
      assert.deepEqual(s.requests, ['get_public_driver_assignment', 'log_assignment_event']);
    } else if (name === 'transient') {
      assert.match(s.error, /Servizio temporaneamente non disponibile/);
      assert.equal(s.isTransientError, true);
      assert.deepEqual(s.requests, ['get_public_driver_assignment', 'get_public_driver_assignment'], 'two attempts, then error');
    } else {
      assert.match(s.error, /Assegnazione non trovata/);
      assert.deepEqual(s.requests, ['get_public_driver_assignment']);
    }
  });

  test(`OFF: useDriverAssignment "${name}" — identical to the pre-D1 hook (differential)`, { skip: baseSource ? false : 'git history unavailable' }, async () => {
    scenario = name;
    const head = await run(await materialise(`head2-${name}`, headSource), `head2-${name}`);
    const base = await run(await materialise(`base-${name}`, baseSource), `base-${name}`);
    assert.deepEqual(head, base, 'same state, same requests in the same order');
  });
}
