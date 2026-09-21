// BUG D D1 — with diagnostics OFF (no vpdiag) the instrumented app must behave
// exactly as before. No real Supabase/network: global fetch and localStorage
// are fakes, the Supabase URL is a non-routable placeholder.
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createClient } from '@supabase/supabase-js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';

const requests = [];
let respond = () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  requests.push({ url: String(input && input.url ? input.url : input), init });
  return respond(String(input && input.url ? input.url : input), init);
};

const storageCalls = { get: [], set: [], remove: [] };
const store = new Map();
const spy = {
  getItem: (k) => { storageCalls.get.push(k); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { storageCalls.set.push(k); store.set(k, String(v)); },
  removeItem: (k) => { storageCalls.remove.push(k); store.delete(k); },
};
globalThis.localStorage = spy; // read by the session bridge
// window.localStorage is what the diagnostics singleton reads: give it a /driver/ page with
// no flag so the REAL flag logic runs at import time and must stay off.
globalThis.window = { location: { pathname: '/driver/assignment/00000000-0000-4000-8000-000000000001', search: '' }, localStorage: spy };

const { supabase, ensureSupabaseSessionBridge } = await import('../src/supabaseClient.js');
const { driverDiag, DIAG_BUFFER_KEY } = await import('../src/lib/diagnostics/driverDiagnostics.js');

const normalise = (r) => ({
  url: r.url,
  method: (r.init && r.init.method) || 'GET',
  body: r.init && typeof r.init.body === 'string' ? r.init.body : null,
  headers: Object.fromEntries(new Headers((r.init && r.init.headers) || {}).entries()),
});
// Reading the expiring flag key is the only diagnostic storage access allowed while off.
const importTimeGets = [...storageCalls.get];
const noDiagStorage = () => storageCalls.set.every((k) => !String(k).startsWith('vp_diag'))
  && storageCalls.remove.every((k) => !String(k).startsWith('vp_diag'))
  && storageCalls.get.every((k) => !String(k).startsWith('vp_diag') || k === 'vp_diag_driver');

test('OFF: the diagnostics singleton is inert (driver page, no flag)', () => {
  assert.equal(driverDiag.enabled, false);
  assert.deepEqual(importTimeGets.filter((k) => String(k).startsWith('vp_diag')), ['vp_diag_driver'], 'the real flag logic ran at import: one flag read, nothing else');
  assert.equal(driverDiag.clientOptions(() => {}), null);
  assert.equal(driverDiag.exportSnapshot().events.length, 0);
  const p = Promise.resolve(1);
  assert.equal(driverDiag.trace('PHOTO_PIPELINE', 'x', () => p), p);
  driverDiag.record('REQUEST', 'end', { n: 1 });
  driverDiag.startOp('REQUEST', 'x').end({ ok: false });
  driverDiag.flush();
  assert.equal(driverDiag.exportSnapshot().events.length, 0, 'nothing recorded while off');
  assert.equal(store.has(DIAG_BUFFER_KEY), false, 'no diagnostic buffer written');
});

test('OFF: the app Supabase client issues byte-identical requests to a plain createClient', async () => {
  assert.ok(supabase, 'client configured from env');
  const plain = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  requests.length = 0;
  await supabase.rpc('probe_rpc', { a: 1 });
  await plain.rpc('probe_rpc', { a: 1 });
  await supabase.from('some_table').select('*').limit(1);
  await plain.from('some_table').select('*').limit(1);
  assert.equal(requests.length, 4, 'no extra requests');
  assert.deepEqual(normalise(requests[0]), normalise(requests[1]), 'rpc request identical');
  assert.deepEqual(normalise(requests[2]), normalise(requests[3]), 'table request identical');
});

test('OFF: auth client and console are not wrapped', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(supabase.auth, 'getSession'), false, 'getSession is still the SDK prototype method');
  assert.equal(supabase.auth.__vpDiag, undefined);
  assert.equal(console.__vpDiagWarn, undefined);
  assert.notEqual(console.warn.name, 'diagWarn');
});

test('OFF: session bridge keeps its exact semantics and writes nothing diagnostic', async () => {
  const setCalls = [];
  const original = supabase.auth.setSession;
  try {
    // no stored session: returns without touching auth
    supabase.auth.setSession = async (s) => { setCalls.push(s); return { error: null }; };
    await ensureSupabaseSessionBridge();
    assert.equal(setCalls.length, 0);

    // stored session: bridged once, second call skipped (same token)
    store.set('vp_supabase_session', JSON.stringify({ accessToken: 'tok-a', refreshToken: 'ref-a' }));
    await ensureSupabaseSessionBridge();
    await ensureSupabaseSessionBridge();
    assert.deepEqual(setCalls, [{ access_token: 'tok-a', refresh_token: 'ref-a' }]);

    // failed bridge (error result): retried on the next call, never throws
    store.set('vp_supabase_session', JSON.stringify({ accessToken: 'tok-b', refreshToken: 'ref-b' }));
    supabase.auth.setSession = async (s) => { setCalls.push(s); return { error: new Error('nope') }; };
    await ensureSupabaseSessionBridge();
    await ensureSupabaseSessionBridge();
    assert.equal(setCalls.filter((c) => c.access_token === 'tok-b').length, 2);

    // rejecting setSession is swallowed exactly as before
    store.set('vp_supabase_session', JSON.stringify({ accessToken: 'tok-c', refreshToken: 'ref-c' }));
    supabase.auth.setSession = async () => { throw new Error('boom'); };
    await assert.doesNotReject(() => ensureSupabaseSessionBridge());
  } finally {
    supabase.auth.setSession = original;
    store.delete('vp_supabase_session');
  }
  assert.ok(noDiagStorage(), 'no vp_diag key was read, written or removed by the bridge');
});

test('OFF: no diagnostic UI renders and lifecycle hook writes nothing', async () => {
  const { DriverDiagnosticsPanel } = await import('../src/components/driver/DriverDiagnosticsPanel.jsx');
  const { useDiagLifecycle } = await import('../src/lib/diagnostics/useDiagLifecycle.js');
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(DriverDiagnosticsPanel)); });
  assert.equal(renderer.toJSON(), null, 'panel renders nothing');
  const Probe = () => { useDiagLifecycle('assignment_page'); return null; };
  await act(async () => { TestRenderer.create(React.createElement(Probe)).unmount(); });
  assert.ok(noDiagStorage());
  assert.equal(store.has(DIAG_BUFFER_KEY), false);
});

test('OFF: realtime status callback still receives every status unchanged', async () => {
  const { subscribeToDriverMessages } = await import('../src/lib/services/messaging-realtime.js');
  let captured = null;
  const channel = { on() { return channel; }, subscribe(cb) { captured = cb; return channel; }, send: async () => 'ok' };
  const originalChannel = supabase.channel;
  const originalRemove = supabase.removeChannel;
  const removed = [];
  supabase.channel = () => channel;
  supabase.removeChannel = (c) => { removed.push(c); };
  try {
    const seen = [];
    const sub = subscribeToDriverMessages('assignment-x', { onStatusChange: (s) => seen.push(s) });
    for (const status of ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) captured(status);
    assert.deepEqual(seen, ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);
    sub.unsubscribe();
    assert.deepEqual(removed, [channel]);
  } finally {
    supabase.channel = originalChannel;
    supabase.removeChannel = originalRemove;
  }
  assert.ok(noDiagStorage());
});

test('OFF: issue photo upload keeps its request sequence, result and rejection behavior', async () => {
  const { uploadIssueVerificationPhoto, isPermanentGpsWriteError } = await import('../src/lib/services/gps-api.js');
  const uuid = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const args = {
    campaignId: uuid(1), issueId: uuid(2), blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }),
    lat: 45.1, lng: 9.1, accuracy: 5, assignmentId: uuid(3), accessToken: 'link-token',
  };
  const kinds = () => requests.map((r) => (r.url.includes('/storage/v1/') ? 'storage' : r.url.split('/rest/v1/rpc/')[1]));

  requests.length = 0;
  respond = (url) => (url.includes('/storage/v1/')
    ? new Response(JSON.stringify({ Key: 'proof-photos/x' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response(JSON.stringify({ id: 'photo-1' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const result = await uploadIssueVerificationPhoto(args);
  assert.deepEqual(result, { id: 'photo-1' }, 'RPC result returned unchanged');
  assert.deepEqual(kinds(), ['storage', 'driver_register_issue_photo'], 'storage upload then register RPC, nothing else');

  // permanent RPC error (42501) rejects immediately with the mapped error, no retries
  requests.length = 0;
  respond = (url) => (url.includes('/storage/v1/')
    ? new Response(JSON.stringify({ Key: 'proof-photos/x' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response(JSON.stringify({ code: '42501', message: 'permission denied', details: null, hint: null }), { status: 403, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(() => uploadIssueVerificationPhoto(args), (e) => isPermanentGpsWriteError(e) && /permission denied/i.test(e.message));
  assert.deepEqual(kinds(), ['storage', 'driver_register_issue_photo']);

  // the input guards still throw first, with no request at all
  requests.length = 0;
  await assert.rejects(() => uploadIssueVerificationPhoto({ ...args, blob: null }), (e) => e.permanent === true);
  assert.equal(requests.length, 0);
  respond = () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  assert.ok(noDiagStorage());
});
