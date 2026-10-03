import test from 'node:test';
import assert from 'node:assert/strict';
import React, { useCallback } from 'react';
import { create, act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { createSingleFlightRefresh } from '../src/lib/services/singleFlightRefresh.js';
import { useSingleFlightRefresh } from '../src/hooks/useSingleFlightRefresh.js';
import { subscribeToMessageInvalidations } from '../src/lib/services/messaging-realtime.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('slow polling, focus and realtime share one flight; no queued retry storm', async () => {
  let time = 0, calls = 0;
  const gate = createSingleFlightRefresh({ now: () => time });
  gate.activate();
  const wait = deferred();
  const task = async () => { calls++; await wait.promise; };
  const first = gate.run(task);
  await Promise.resolve();
  time = 60000;
  for (let n = 0; n < 100; n++) assert.equal(gate.run(task), first);
  assert.equal(calls, 1);
  wait.resolve(); await first;
  assert.equal(calls, 1);
  await gate.run(async () => { calls++; });
  assert.equal(calls, 2);
  await gate.run(async () => { calls++; });
  assert.equal(calls, 2, 'fast invalidation bursts are throttled');
});

test('cleanup discards late results and does not start work after unmount', async () => {
  const gate = createSingleFlightRefresh(); const cleanup = gate.activate();
  const wait = deferred(); let applied = false;
  const p = gate.run(async (current) => { await wait.promise; if (current()) applied = true; });
  await Promise.resolve(); cleanup(); wait.resolve(); await p;
  await gate.run(() => { throw Error('unmounted'); });
  assert.equal(applied, false);
});

test('React StrictMode and identity change: old request drains before new authorized scope', async () => {
  const requests = [], values = []; let refresh;
  function Probe({ id }) {
    const load = useCallback(async (current) => {
      const wait = deferred(); requests.push({ id, wait });
      await wait.promise; if (current()) values.push(id);
    }, [id]);
    refresh = useSingleFlightRefresh(load);
    React.useEffect(() => { refresh(); }, [refresh]);
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(React.StrictMode, null, React.createElement(Probe, { id: 'a' }))); });
  assert.equal(requests.length, 1);
  await act(async () => { renderer.update(React.createElement(React.StrictMode, null, React.createElement(Probe, { id: 'b' }))); });
  assert.equal(requests.length, 1);
  await act(async () => { requests[0].wait.resolve(); });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].id, 'b');
  assert.deepEqual(values, []);
  await act(async () => { requests[1].wait.resolve(); });
  assert.deepEqual(values, ['b']);
  await act(async () => { renderer.unmount(); });
  await refresh(); assert.equal(requests.length, 2);
});

test('messages_changed discards forged content and triggers authorized reload only', async () => {
  let receive, status, removed = false, reads = 0, displayed;
  const channel = { on(type, filter, cb) { assert.equal(type, 'broadcast'); assert.equal(filter.event, 'messages_changed'); receive = cb; return this; }, subscribe(cb) { status = cb; return this; } };
  const client = { channel() { return channel; }, removeChannel(c) { assert.equal(c, channel); removed = true; } };
  const rpc = async (name, args) => { assert.equal(name, 'driver_list_messages'); assert.deepEqual(args, { p_assignment_id: 'owned', p_access_token: 'fixture' }); reads++; return [{ text: 'authorized' }]; };
  const sub = subscribeToMessageInvalidations('assignment:owned', { onChanged: async (...args) => {
    assert.deepEqual(args, []);
    displayed = await rpc('driver_list_messages', { p_assignment_id: 'owned', p_access_token: 'fixture' });
  } }, client);
  receive({ payload: { text: 'forged', sender_role: 'admin', conversation_id: 'foreign' } });
  await Promise.resolve(); assert.deepEqual(displayed, [{ text: 'authorized' }]);
  status('SUBSCRIBED'); await Promise.resolve(); assert.equal(reads, 2);
  sub.unsubscribe(); receive({}); status('SUBSCRIBED'); assert.equal(reads, 2); assert.ok(removed);
});

test('all chat screens wire invalidations to their authorized RPC; GPS remains outside the gate', () => {
  for (const [file, rpc] of [
    ['src/pages/driver/DriverAssignmentPage.jsx', 'driverListMessages'],
    ['src/pages/admin/communications/AdminCommunicationsPage.jsx', 'adminListMessages'],
    ['src/components/customer/CampaignHubPanels.jsx', 'customerListMessages'],
  ]) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.ok(source.includes('onChanged: reload'));
    assert.ok(source.includes('useSingleFlightRefresh(load)'));
    assert.ok(source.includes('await ' + rpc + '('));
    assert.ok(!source.includes('broadcasterRef'));
  }
});
