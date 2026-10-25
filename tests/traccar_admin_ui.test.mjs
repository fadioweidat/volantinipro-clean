import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { transform } from 'esbuild';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = (await readFile(new URL('../src/pages/admin/TraccarBackupPanel.jsx', import.meta.url), 'utf8'))
  .replace(/import \{ traccarAdminControl \} from [^;]+;/, 'const traccarAdminControl = () => { throw new Error("inject control"); };')
  .replace("'../../lib/traccar/backupUrl.js'", "'../src/lib/traccar/backupUrl.js'")
  .replace("'../../lib/gps/traccarIdle.js'", "'../src/lib/gps/traccarIdle.js'")
  .replace("import './traccar-backup.css';", '');
const output = new URL('./.traccar-panel-test.mjs', import.meta.url);
await writeFile(output, (await transform(source, { loader: 'jsx', format: 'esm' })).code);
const { default: Panel } = await import(output.href);
await unlink(output);
const assignment = { id: 'assignment', campaign_id: 'campaign', campaign_title: 'Pilot', operator_label: 'Operator' };
const row = { id: 'session', device_id: 'RAGAZZO01', status: 'started', enabled: true,
  enabled_until: '2099-01-01T00:00:00Z', campaign_title: 'Pilot', operator_label: 'Operator' };
const key = 'a'.repeat(64);
const tokenHash = 'b'.repeat(64);
function button(root, label) { return root.findAllByType('button').find(b => b.children.join('') === label); }
async function open(renderer) { await act(async () => renderer.root.findByType('details').props.onToggle({ currentTarget: { open: true } })); }
async function fill(renderer) {
  const root = renderer.root;
  await act(async () => root.findAllByType('select')[0].props.onChange({ target: { value: 'campaign' } }));
  await act(async () => root.findAllByType('select')[1].props.onChange({ target: { value: 'assignment' } }));
  await act(async () => root.findAllByType('input').find(i => i.props.placeholder === 'RAGAZZO01').props.onChange({ target: { value: 'RAGAZZO01' } }));
}

test('Admin starts without Driver, masks URL and requires explicit confirmation to close', async () => {
  const calls = []; let started = false; let closed = false;
  globalThis.window = { location: { hostname: 'www.volantinipro.it', origin: 'https://www.volantinipro.it' } };
  const control = async (action, args) => {
    calls.push([action, args]);
    if (action === 'list') return { assignments: [assignment], sessions: started && !closed ? [row] : [] };
    if (action === 'start') { started = true; return { session_id: 'session', enabled_until: row.enabled_until }; }
    if (action === 'close') { closed = true; return {}; }
    throw Error(action);
  };
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Panel, { control, credentials: async () => ({ key, tokenHash }) })); });
  assert.equal(calls.length, 0, 'no automatic RPC/start on mount');
  await open(renderer); await fill(renderer);
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(calls.find(c => c[0] === 'start')[1].p_assignment_id, 'assignment');
  const url = renderer.root.findAllByType('input').find(i => i.props.readOnly);
  assert.equal(url.props.type, 'password');
  assert.equal(new URL(url.props.value).searchParams.get('key'), key);
  await act(async () => button(renderer.root, 'Chiudi sessione GPS').props.onClick());
  assert.equal(closed, false);
  await act(async () => button(renderer.root, 'Conferma chiusura').props.onClick());
  assert.equal(closed, true);
  assert.equal(renderer.root.findAllByType('input').filter(i => i.props.readOnly).length, 0);
  await act(async () => renderer.unmount()); delete globalThis.window;
});

test('uncertain start retries same secret; preview copy requires bypass and correctly encodes it', async () => {
  let starts = []; let generated = 0;
  globalThis.window = { location: { hostname: 'volantinipro-git-test-fenicesp-gmailcoms-projects.vercel.app', origin: 'https://volantinipro-git-test-fenicesp-gmailcoms-projects.vercel.app' } };
  const control = async (action, args) => {
    if (action === 'list') return { assignments: [assignment], sessions: [] };
    starts.push(args);
    if (starts.length === 1) throw Error('network unavailable');
    return { session_id: 'session', enabled_until: row.enabled_until };
  };
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Panel, { control, credentials: async () => { generated++; return { key, tokenHash }; } })); });
  await open(renderer); await fill(renderer);
  const submit = () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
  await act(submit); assert.match(renderer.root.findByProps({ role: 'alert' }).children.join(''), /network unavailable/);
  await act(submit); assert.equal(generated, 1); assert.deepEqual(starts[0], starts[1]);
  assert.equal(button(renderer.root, 'Copia URL Server').props.disabled, true);
  await act(async () => renderer.root.findAllByType('input').find(i => i.props.type === 'password' && !i.props.readOnly).props.onChange({ target: { value: 'pilot+/=' } }));
  const url = new URL(renderer.root.findAllByType('input').find(i => i.props.readOnly).props.value);
  assert.equal(url.searchParams.get('x-vercel-protection-bypass'), 'pilot+/=');
  assert.equal(url.searchParams.has('x-vercel-set-bypass-cookie'), false);
  assert.equal(button(renderer.root, 'Copia URL Server').props.disabled, false);
  await act(async () => renderer.unmount()); delete globalThis.window;
});

test('missing migration displays error and permits retry without starting a session', async () => {
  let renderer; let calls = [];
  await act(async () => { renderer = TestRenderer.create(React.createElement(Panel, { control: async action => { calls.push(action); throw Error('Piano B non installato'); } })); });
  await open(renderer);
  assert.match(renderer.root.findByProps({ role: 'alert' }).children.join(''), /non installato/);
  assert.deepEqual(calls, ['list']);
  assert.equal(renderer.root.findAllByType('form').length, 0);
  await act(async () => button(renderer.root, 'Aggiorna Piano B').props.onClick());
  assert.deepEqual(calls, ['list','list']);
  await act(async () => renderer.unmount());
});
