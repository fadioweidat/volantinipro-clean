// BUG D phase D1 — temporary driver runtime diagnostics. No real Supabase,
// no network: fake storage, fake window/document, fake fetch, fake auth client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DIAG_BUFFER_KEY, DIAG_FLAG_KEY, FLAG_TTL_MS, MAX_BYTES, MAX_EVENTS, MAX_PENDING,
  classifyPath, classifyRequest, createBrowserDiagnostics, createDiagnostics, driverDiag, resolveEnabled, sanitizeMeta,
  urlWithoutDiagParam, DIAG_URL_PARAM, parseFlag,
} from '../src/lib/diagnostics/driverDiagnostics.js';

const SECRET = 'SECRETTOKEN0123456789abcdef';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl';
const UUID = '3f2b8c1e-9a4d-4b6e-8f10-1234567890ab';

function fakeStorage() {
  const map = new Map();
  const calls = { get: 0, set: 0, remove: 0 };
  return {
    map, calls,
    getItem: (k) => { calls.get += 1; return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { calls.set += 1; map.set(k, String(v)); },
    removeItem: (k) => { calls.remove += 1; map.delete(k); },
  };
}

function fakeWindow(pathname = '/driver/assignment/' + UUID) {
  const target = new EventTarget();
  const listeners = { added: 0 };
  const win = {
    location: { pathname, search: '?access=' + SECRET },
    addEventListener: (...a) => { listeners.added += 1; target.addEventListener(...a); },
    fire: (type, extra = {}) => { const e = new Event(type); Object.assign(e, extra); target.dispatchEvent(e); },
  };
  const docTarget = new EventTarget();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (...a) => { listeners.added += 1; docTarget.addEventListener(...a); },
    fire: (type) => docTarget.dispatchEvent(new Event(type)),
  };
  return { win, doc, listeners };
}

function make(overrides = {}) {
  const storage = overrides.storage || fakeStorage();
  const { win, doc, listeners } = overrides.env || fakeWindow();
  const clock = { t: 1_700_000_000_000 };
  const diag = createDiagnostics({
    enabled: true, storage, win, doc, now: () => clock.t, random: () => 0.5,
    schedule: () => {}, // persistence is explicit via flush() in tests
    perf: { getEntriesByType: () => [{ type: 'navigate' }] },
    ...overrides.deps,
  });
  return { diag, storage, win, doc, listeners, clock };
}

function dump(diag) { return diag.exportText(); }

// ── A / B ────────────────────────────────────────────────────────────────
test('A: ring buffer is bounded in events and bytes (memory and storage)', () => {
  const { diag, storage } = make();
  for (let i = 0; i < MAX_EVENTS * 3; i += 1) diag.record('REQUEST', 'end', { op: 'rpc', rid: i, dur: i, ok: true });
  assert.equal(diag.exportSnapshot().events.length, MAX_EVENTS);
  diag.flush();
  const stored = JSON.parse(storage.map.get(DIAG_BUFFER_KEY));
  assert.ok(stored.events.length <= MAX_EVENTS);
  assert.ok(storage.map.get(DIAG_BUFFER_KEY).length <= MAX_BYTES);
});

test('B: oldest entries are evicted first, newest kept, order preserved', () => {
  const { diag } = make();
  for (let i = 0; i < MAX_EVENTS + 50; i += 1) diag.record('REQUEST', 'end', { rid: i });
  const events = diag.exportSnapshot().events;
  const rids = events.map((e) => e.m.rid);
  assert.equal(rids[rids.length - 1], MAX_EVENTS + 49);
  assert.ok(!rids.includes(0), 'oldest evicted');
  assert.deepEqual(rids, [...rids].sort((a, b) => a - b));
});

test('A/B: byte ceiling really evicts when the event count is under the cap', () => {
  const { diag, storage } = make();
  const fat = { op: 'a'.repeat(39), cls: 'b'.repeat(39), stage: 'c'.repeat(39), state: 'd'.repeat(39), from: 'e'.repeat(39), to: 'f'.repeat(39), key: 'g'.repeat(39), reason: 'h'.repeat(39) };
  // ~450 bytes/event: 550 events (< MAX_EVENTS) serialize to ~250 KB > MAX_BYTES.
  for (let i = 0; i < 550; i += 1) diag.record('REQUEST', 'end', { ...fat, rid: i });
  const total = diag.exportSnapshot().events.length; // 550 + the initial page-load event
  assert.ok(total >= 550 && total < MAX_EVENTS, 'precondition: count cap not reached');
  assert.ok(JSON.stringify(diag.exportSnapshot().events).length > MAX_BYTES, 'precondition: payload exceeds the byte ceiling');
  diag.flush();
  const text = storage.map.get(DIAG_BUFFER_KEY);
  assert.ok(text.length <= MAX_BYTES, `stored ${text.length} bytes`);
  const kept = JSON.parse(text).events;
  assert.ok(kept.length < total, 'byte eviction removed events');
  assert.equal(kept[kept.length - 1].m.rid, 549, 'newest event kept');
  assert.ok(!kept.some((e) => e.m.rid === 0), 'oldest event evicted');
});

// ── C ────────────────────────────────────────────────────────────────────
test('C: tokens / Authorization / cookies cannot be recorded, even if passed', () => {
  const { diag } = make();
  diag.record('SESSION_BRIDGE', 'end', {
    access_token: JWT, refresh_token: JWT, accessToken: JWT, token: SECRET, authorization: `Bearer ${SECRET}`,
    Authorization: `Bearer ${SECRET}`, cookie: `sb=${SECRET}`, apikey: SECRET, secret: SECRET,
    op: JWT, state: `Bearer ${SECRET}`, errCode: JWT, errName: JWT, stage: UUID, key: SECRET,
  });
  const text = dump(diag);
  for (const forbidden of [SECRET, 'eyJ', 'Bearer', 'apikey', 'cookie', UUID]) {
    assert.ok(!text.includes(forbidden), `must not contain ${forbidden}`);
  }
});

test('C: error MESSAGES with secrets are never stored, only a coarse kind', () => {
  const { diag } = make();
  const h = diag.startOp('REQUEST', 'rpc_x', { cls: 'rpc' });
  h.end({ ok: false, err: Object.assign(new Error(`Failed to fetch https://x?access=${SECRET} Bearer ${JWT}`), { name: 'TypeError' }) });
  const text = dump(diag);
  assert.ok(!text.includes(SECRET) && !text.includes('eyJ') && !text.includes('Bearer'));
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'REQUEST');
  assert.equal(ev.m.errKind, 'network');
  assert.equal(ev.m.errName, 'TypeError');
  assert.equal(ev.m.ok, false);
});

test('C: instrumented fetch never records headers, body or full URL', async () => {
  const { diag } = make();
  const seen = [];
  const base = async (input, init) => { seen.push({ input, init }); return { ok: true, status: 200 }; };
  const f = diag.createInstrumentedFetch(base);
  const res = await f(`https://abc.supabase.co/rest/v1/rpc/get_public_driver_assignment?access=${SECRET}&apikey=${SECRET}`, {
    method: 'POST', headers: { Authorization: `Bearer ${SECRET}`, apikey: SECRET }, body: JSON.stringify({ p_access_token: SECRET, p_assignment_id: UUID }),
  });
  assert.equal(res.status, 200);
  assert.equal(seen.length, 1, 'request passed through exactly once');
  assert.equal(seen[0].init.headers.Authorization, `Bearer ${SECRET}`, 'request itself is untouched');
  const text = dump(diag);
  for (const forbidden of [SECRET, 'Bearer', 'apikey', UUID, 'supabase.co', 'abc.', 'p_access_token']) assert.ok(!text.includes(forbidden), forbidden);
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'REQUEST');
  assert.deepEqual([ev.m.cls, ev.m.op, ev.m.status, ev.m.ok], ['rpc', 'get_public_driver_assignment', 200, true]);
});

test('C: fetch failures and rejections are recorded and re-thrown unchanged', async () => {
  const { diag } = make();
  const boom = new TypeError('Failed to fetch');
  const f = diag.createInstrumentedFetch(async () => { throw boom; });
  await assert.rejects(() => f('https://x/storage/v1/object/proof-photos/p.jpg', { method: 'POST' }), (e) => e === boom);
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'REQUEST');
  assert.deepEqual([ev.m.cls, ev.m.op, ev.m.ok, ev.m.errKind], ['storage', 'write', false, 'network']);
  assert.equal(diag.exportSnapshot().pending.length, 0);
});

// ── D ────────────────────────────────────────────────────────────────────
test('D: query strings, hashes and ids in paths are sanitized away', () => {
  const r = classifyRequest(`https://h/storage/v1/object/proof-photos/campaign/${UUID}/issue/${UUID}/photo/${UUID}.jpg?token=${SECRET}#frag`, { method: 'POST' });
  assert.deepEqual(r, { cls: 'storage', op: 'write' });
  assert.deepEqual(classifyRequest(`/rest/v1/rpc/log_assignment_event?access=${SECRET}`), { cls: 'rpc', op: 'log_assignment_event' });
  assert.deepEqual(classifyRequest('/rest/v1/rpc/Weird-Name123'), { cls: 'rpc', op: 'other' });
  assert.deepEqual(classifyRequest('/auth/v1/token?grant_type=refresh_token'), { cls: 'auth', op: 'token' });
  assert.deepEqual(classifyRequest('not a url at all'), { cls: 'other', op: 'other' });
  assert.equal(classifyPath(`/driver/assignment/${UUID}?access=${SECRET}`), 'assignment_program');
  assert.equal(classifyPath(`/driver/assignment/${UUID}/map`), 'assignment_map');
  assert.equal(classifyPath('/customer/x'), 'other');
});

// ── E ────────────────────────────────────────────────────────────────────
test('E: GPS coordinates cannot be recorded (keys dropped, numbers rounded)', () => {
  const { diag } = make();
  diag.record('GPS_QUEUE', 'flush', { lat: 45.464211, lng: 9.191383, latitude: 45.464211, longitude: 9.191383, coords: { lat: 45.4, lng: 9.1 }, accuracy: 12.5, position: '45.4642,9.1913', queue: 3, n: 45.464211 });
  const text = dump(diag);
  for (const forbidden of ['45.4642', '9.1913', '45.464211', '9.191383', 'latitude', 'longitude', '"lat"', '"lng"', 'coords', 'accuracy', 'position']) {
    assert.ok(!text.includes(forbidden), forbidden);
  }
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'GPS_QUEUE');
  assert.equal(ev.m.queue, 3);
  assert.equal(ev.m.n, 45, 'decimals are rounded away');
});

// ── F ────────────────────────────────────────────────────────────────────
test('F: photo / message / customer contents cannot be recorded', () => {
  const { diag } = make();
  diag.record('PHOTO_PIPELINE', 'end', {
    blob: 'data:image/jpeg;base64,/9j/4AAQ', photo: 'BASE64PHOTO', text: 'Ciao mario', message: 'Il mio messaggio', body: { a: 1 },
    customer_name: 'Mario Rossi', email: 'mario@example.com', phone: '+39 333 1234567', street: 'Via Roma', house_number: '12',
    notes: 'nota privata', municipality: 'Milano', address_label: 'Via Roma 12', op: 'Via Roma 12', state: 'mario rossi', stage: 'mario@example.com', bytes: 48211, ok: true,
  });
  const text = dump(diag);
  for (const forbidden of ['data:image', 'BASE64PHOTO', 'mario', 'Mario', 'Via Roma', 'nota privata', 'Milano', '+39', 'example.com', 'Il mio messaggio']) {
    assert.ok(!text.includes(forbidden), forbidden);
  }
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'PHOTO_PIPELINE');
  assert.deepEqual(ev.m, { bytes: 48211, ok: true });
});

test('sanitizeMeta drops unknown classes/keys and non-primitive values', () => {
  assert.deepEqual(sanitizeMeta(null), {});
  assert.deepEqual(sanitizeMeta({ dur: NaN, n: Infinity, ok: 'yes', queue: '3', errCode: 'refresh_token_not_found' }), { errCode: 'refresh_token_not_found' });
  const { diag } = make();
  diag.record('NOT_A_CLASS', 'x', { n: 1 });
  diag.record('REQUEST', 'Bad Event Name', { n: 1 });
  assert.equal(diag.exportSnapshot().events.filter((e) => e.c === 'NOT_A_CLASS' || e.v === 'Bad Event Name').length, 0);
});

// ── G ────────────────────────────────────────────────────────────────────
test('G: diagnostics OFF => no storage access, no listeners, no wrapping, identical return values', async () => {
  const storage = fakeStorage();
  const { win, doc, listeners } = fakeWindow();
  const diag = createDiagnostics({ enabled: false, storage, win, doc, perf: { getEntriesByType: () => [{ type: 'reload' }] } });
  diag.record('REQUEST', 'end', { n: 1 });
  diag.count('x');
  diag.recordThrottled('k', 1000, 'GPS_QUEUE', 'flush_skipped', { sending: true });
  diag.startOp('REQUEST', 'x').end({ ok: false });
  diag.flush();
  const p = Promise.resolve(42);
  assert.equal(diag.trace('PHOTO_PIPELINE', 'gps', () => p), p, 'trace returns the SAME promise');
  assert.equal(diag.trace('PHOTO_PIPELINE', 'x', () => 7), 7);
  assert.throws(() => diag.trace('PHOTO_PIPELINE', 'x', () => { throw new Error('same'); }), /same/);
  assert.equal(diag.clientOptions(() => {}), null, 'Supabase client gets no extra options');
  const auth = { getSession: async () => ({ data: {}, error: null }) };
  const original = auth.getSession;
  diag.instrumentAuthClient(auth);
  assert.equal(auth.getSession, original, 'auth client untouched');
  const fakeConsole = { warn() {} };
  const w = fakeConsole.warn;
  diag.watchLockWarnings(fakeConsole);
  assert.equal(fakeConsole.warn, w, 'console untouched');
  assert.equal(diag.tokenExpired(JWT), null);
  assert.deepEqual([storage.calls.get, storage.calls.set, storage.calls.remove], [0, 0, 0]);
  assert.equal(listeners.added, 0);
  assert.equal(diag.enabled, false);
});

test('G/C4: singleton is OFF in a plain runtime; flag is driver-only, expiring and strict', () => {
  assert.equal(driverDiag.enabled, false);
  const s = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  const now = () => clock.t;
  const driver = '/driver/assignment/x';
  assert.equal(resolveEnabled({ storage: s, search: '', pathname: driver, now }), false);
  assert.equal(resolveEnabled({ storage: s, search: '?vpdiag=true', pathname: driver, now }), false, 'only literal 1');
  // outside /driver/: no enabling AND no storage access at all
  const calls = () => s.calls.get + s.calls.set + s.calls.remove;
  const before = calls();
  assert.equal(resolveEnabled({ storage: s, search: '?vpdiag=1', pathname: '/customer/dashboard', now }), false);
  assert.equal(resolveEnabled({ storage: s, search: '?vpdiag=0', pathname: '/admin', now }), false);
  assert.equal(calls(), before, 'non-driver paths never touch storage');
  // enabling on a driver path stores an EXPIRY timestamp, not a bare flag
  assert.equal(resolveEnabled({ storage: s, search: '?vpdiag=1', pathname: driver, now }), true);
  assert.equal(parseFlag(s.map.get(DIAG_FLAG_KEY)).expiresAt, clock.t + FLAG_TTL_MS);
  assert.match(s.map.get(DIAG_FLAG_KEY), /^\d+:[0-9a-z]{6}$/, 'expiry plus a generation id');
  assert.equal(resolveEnabled({ storage: s, search: '', pathname: driver, now }), true, 'persisted across driver page loads');
  assert.equal(resolveEnabled({ storage: s, search: '', pathname: '/customer/x', now }), false, 'never honoured on non-driver paths');
  s.map.set(DIAG_BUFFER_KEY, '{"v":2}');
  clock.t += FLAG_TTL_MS + 1;
  assert.equal(resolveEnabled({ storage: s, search: '', pathname: driver, now }), false, 'flag expires');
  assert.equal(s.map.has(DIAG_FLAG_KEY), false, 'expired flag removed');
  assert.equal(s.map.has(DIAG_BUFFER_KEY), false, 'expired flag also wipes the leftover buffer');
  s.map.set(DIAG_FLAG_KEY, '1');
  assert.equal(resolveEnabled({ storage: s, search: '', pathname: driver, now }), false, 'legacy bare "1" flag is not honoured');
  resolveEnabled({ storage: s, search: '?vpdiag=1', pathname: driver, now });
  s.map.set(DIAG_BUFFER_KEY, '{}');
  assert.equal(resolveEnabled({ storage: s, search: '?vpdiag=0', pathname: driver, now }), false);
  assert.equal(s.map.has(DIAG_FLAG_KEY) || s.map.has(DIAG_BUFFER_KEY), false, 'vpdiag=0 wipes flag and buffer');
  assert.equal(resolveEnabled({ storage: { getItem() { throw new Error('blocked'); } }, search: '', pathname: driver, now }), false);
});

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('G/C11: wiring contract — client options gated, nothing transmits, nothing global', () => {
  const client = src('src/supabaseClient.js');
  assert.match(client, /\.\.\.\(driverDiag\.clientOptions\(\(\.\.\.args\) => fetch\(\.\.\.args\)\) \|\| \{\}\),/, 'spread of null-or-empty when disabled');
  assert.match(client, /driverDiag\.instrumentAuthClient\(supabaseInstance\.auth\)/);
  const core = src('src/lib/diagnostics/driverDiagnostics.js');
  assert.doesNotMatch(core, /\bfetch\(\s*['"`]https?:/, 'no external endpoint');
  assert.doesNotMatch(core, /sendBeacon|XMLHttpRequest|new WebSocket/, 'nothing transmits data');
  assert.match(core, /enabled: false/, 'no-window runtime is disabled');
});

test('C11: instrumented call sites keep their original statements and are wired as designed', () => {
  const main = src('src/main.jsx');
  assert.equal((main.match(/<DriverDiagnosticsPanel \/>/g) || []).length, 2, 'panel mounted on the two driver routes only');
  const panel = src('src/components/driver/DriverDiagnosticsPanel.jsx');
  assert.match(panel, /if \(!driverDiag\.enabled\) return null;/);
  assert.match(panel, /driverDiag\.disable\(\);\n(?:\s*\/\/[^\n]*\n)?\s*const clean = urlWithoutDiagParam\(window\.location\.href\);\n\s*if \(clean !== window\.location\.href\) window\.location\.replace\(clean\);\n\s*else window\.location\.reload\(\);/);

  const gps = src('src/lib/services/gps-api.js');
  assert.match(gps, /await driverDiag\.trace\('PHOTO_PIPELINE', 'upload', \(\) => withRetry\(/);
  assert.match(gps, /return driverDiag\.trace\('PHOTO_PIPELINE', 'register', \(\) => callGpsRpc\('driver_register_issue_photo'/);
  assert.match(gps, /if \(!blob\) throw permanentGpsError\('gps_auth_required', new Error\('Nessun file da caricare\.'\)\);\n\s*if \(!Number\.isFinite\(Number\(lat\)\)/, 'blob guard precedes the eager { bytes: blob.size }');

  const assignment = src('src/hooks/useDriverAssignment.js');
  assert.match(assignment, /const loadOp = driverDiag\.startOp\('DRIVER_ASSIGNMENT', 'load'/);
  assert.match(assignment, /const attemptOp = driverDiag\.startOp\('DRIVER_ASSIGNMENT', 'rpc_attempt'/);
  assert.match(assignment, /return \(\) => \{ cancelled = true; loadOp\.end\(\{ state: 'cancelled' \}\); \};/);
  assert.match(assignment, /loadOp\.end\(\{ ok: true, state: 'ready' \}\)/);

  const gpsHook = src('src/hooks/useGpsTracking.js');
  assert.match(gpsHook, /const flushOp = driverDiag\.startOp\('GPS_QUEUE', 'flush'/);
  assert.match(gpsHook, /sendingRef\.current = false;\n\s*flushOp\.end\(/, 'flush op ended in finally, after sendingRef reset');

  const page = src('src/pages/driver/DriverAssignmentPage.jsx');
  for (const stage of ['gps', 'compress', 'watermark', 'encode']) assert.match(page, new RegExp(`beginStage\\('${stage}'\\)`));
  assert.match(page, /const \{ canvas \} = await compressPodImage\(file\);/, 'original photo statements untouched');
  assert.match(page, /const watermarkedBlob = await canvasToJpegBlob\(canvas\);\n\s*releaseCanvas\(canvas\);/);

  const realtime = src('src/lib/services/messaging-realtime.js');
  assert.match(realtime, /driverDiag\.record\('REALTIME', 'status'/);
  assert.match(src('src/pages/driver/DriverWorkMapPage.jsx'), /useDiagLifecycle\('map_page'\)/);
});

// ── Auth lock / bridge visibility ────────────────────────────────────────
test('AUTH_LOCK: a getSession that never resolves shows as pending with its age', async () => {
  const { diag, clock } = make();
  const auth = { getSession: () => new Promise(() => {}) };
  diag.instrumentAuthClient(auth);
  auth.getSession();
  clock.t += 12_000;
  const snap = diag.exportSnapshot();
  assert.equal(snap.pending.length, 1);
  assert.deepEqual([snap.pending[0].class, snap.pending[0].op], ['AUTH_LOCK', 'getsession']);
  assert.equal(snap.pending[0].ageMs, 12_000);
});

test('AUTH_LOCK: getSession result is passed through, duration recorded', async () => {
  const { diag, clock } = make();
  const result = { data: { session: { access_token: SECRET } }, error: null };
  const auth = { getSession: async () => { clock.t += 250; return result; } };
  diag.instrumentAuthClient(auth);
  assert.equal(await auth.getSession(), result, 'same object returned');
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'AUTH_LOCK');
  assert.deepEqual([ev.m.op, ev.m.dur, ev.m.ok], ['getsession', 250, true]);
  assert.ok(!dump(diag).includes(SECRET));
});

test('AUTH_LOCK: stolen-lock warning is counted and passed through untouched', () => {
  const { diag } = make();
  const received = [];
  const fakeConsole = { warn: (...a) => received.push(a) };
  diag.watchLockWarnings(fakeConsole);
  fakeConsole.warn('@supabase/gotrue-js: Lock "lock:sb-abc-auth-token" was not released within 5000ms.', 'extra');
  fakeConsole.warn('unrelated');
  assert.equal(received.length, 2);
  assert.deepEqual(received[0][1], 'extra');
  const events = diag.exportSnapshot().events.filter((e) => e.v === 'lock_stolen');
  assert.equal(events.length, 1);
  assert.ok(!dump(diag).includes('sb-abc'));
});

test('SESSION_BRIDGE: expiry is a boolean derived without recording the token', () => {
  const { diag, clock } = make();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = (exp) => `${b64({ alg: 'HS256' })}.${b64({ exp })}.sig`;
  assert.equal(diag.tokenExpired(tok(clock.t / 1000 - 10)), true);
  assert.equal(diag.tokenExpired(tok(clock.t / 1000 + 3600)), false);
  assert.equal(diag.tokenExpired('garbage'), null);
  const h = diag.startOp('SESSION_BRIDGE', 'setsession', { exists: true, expired: true });
  clock.t += 900;
  h.end({ ok: false, err: Object.assign(new Error('Invalid Refresh Token: Already Used'), { name: 'AuthApiError', code: 'refresh_token_already_used', status: 400 }) });
  const ev = diag.exportSnapshot().events.find((e) => e.c === 'SESSION_BRIDGE');
  assert.deepEqual(ev.m, { exists: true, expired: true, op: 'setsession', rid: 1, dur: 900, ok: false, status: 400, errKind: 'auth', errName: 'AuthApiError', errCode: 'refresh_token_already_used' });
  assert.ok(!dump(diag).includes('Already Used'));
});

// ── H ────────────────────────────────────────────────────────────────────
test('H: buffer survives the reproduction sequence (SPA nav + reload)', () => {
  const storage = fakeStorage();
  const env = fakeWindow();
  const first = make({ storage, env });
  const { diag, win, doc, clock } = first;

  // program page: report #1 + photo succeeds
  diag.record('PAGE_LIFECYCLE', 'mount', { key: 'assignment_page' });
  diag.trace('PHOTO_PIPELINE', 'gps', () => 1);
  diag.trace('PHOTO_PIPELINE', 'upload', () => 1, { bytes: 1000 });
  // report #2: upload hangs (never ends)
  diag.startOp('PHOTO_PIPELINE', 'upload', { bytes: 2000 });
  clock.t += 20_000;
  // go to the map via SPA navigation, then back
  win.location.pathname = `/driver/assignment/${UUID}/map`;
  win.fire('popstate');
  doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
  doc.visibilityState = 'visible'; doc.fire('visibilitychange');
  win.location.pathname = `/driver/assignment/${UUID}`;
  win.fire('popstate');
  diag.startOp('DRIVER_ASSIGNMENT', 'load', { bg: false }).end({ ok: false, timeout: true, state: 'error_slow' });
  diag.flush();

  let snap = diag.exportSnapshot();
  const nav = snap.events.filter((e) => e.v === 'navigate').map((e) => `${e.m.from}>${e.m.to}`);
  assert.deepEqual(nav, ['assignment_program>assignment_map', 'assignment_map>assignment_program']);
  assert.equal(snap.loads, 1);
  assert.equal(snap.pending.length, 1, 'the hung upload is visible as pending');
  assert.equal(snap.pending[0].ageMs, 20_000);
  assert.equal(snap.firstFailure.c, 'DRIVER_ASSIGNMENT');
  assert.equal(snap.firstFailure.m.state, 'error_slow');

  // hard reload: the browser fires pagehide on the old page, then a new module
  // instance reads the persisted buffer
  win.fire('pagehide');
  clock.t += 5_000;
  const second = make({ storage, env: fakeWindow(), deps: { now: () => clock.t } });
  snap = second.diag.exportSnapshot();
  assert.equal(snap.loads, 2, 'load counter survives reload');
  assert.ok(snap.events.some((e) => e.v === 'navigate'), 'earlier events survive');
  const orphan = snap.events.find((e) => e.v === 'orphaned_pending');
  assert.ok(orphan, 'request that never finished before the reload is flagged');
  assert.equal(orphan.m.op, 'upload');
  assert.equal(snap.pending.length, 0);
  const text = second.diag.exportText();
  for (const forbidden of [SECRET, UUID, 'access=']) assert.ok(!text.includes(forbidden), forbidden);
  assert.equal(snap.events.find((e) => e.v === 'load' && e.m.loads === 2).m.navType, 'navigate');
});

test('H: clear() empties the buffer and storage; disable() removes flag and buffer', () => {
  const { diag, storage } = make();
  diag.record('REQUEST', 'end', { n: 1 });
  diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  diag.clear();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false);
  assert.equal(diag.exportSnapshot().events.length, 0);
  storage.map.set(DIAG_FLAG_KEY, '1');
  diag.disable();
  assert.equal(storage.map.has(DIAG_FLAG_KEY), false);
});

test('storage failures never throw into the app', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  const { diag } = make({ storage: broken });
  assert.doesNotThrow(() => { diag.record('REQUEST', 'end', { n: 1 }); diag.flush(); diag.clear(); diag.disable(); });
});

// ── Review findings (C1, C2, C3) ─────────────────────────────────────────
test('C1: two tabs merge instead of overwriting; a live tab is never reported orphaned', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  let n = 0;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 10 } });
  const a = mk();
  a.diag.startOp('PHOTO_PIPELINE', 'upload'); // A: still running
  a.diag.record('REQUEST', 'end', { rid: 1, op: 'aaa' });
  a.diag.flush();
  clock.t += 1000;
  const b = mk(); // second tab opens while A is alive
  b.diag.record('REQUEST', 'end', { rid: 2, op: 'bbb' });
  b.diag.flush();
  a.diag.record('REQUEST', 'end', { rid: 3, op: 'aaa' });
  a.diag.flush(); // A flushes last: must not erase B
  const snap = a.diag.exportSnapshot();
  const rids = snap.events.filter((e) => e.c === 'REQUEST').map((e) => e.m.rid).sort();
  assert.deepEqual(rids, [1, 2, 3], 'events of both tabs survive');
  assert.equal(snap.events.filter((e) => e.v === 'orphaned_pending').length, 0, 'live tab not orphaned');
  assert.equal(snap.pending.length, 1);
  assert.equal(snap.pending[0].owner, 'this_page');
  const bSnap = b.diag.exportSnapshot();
  assert.equal(bSnap.pending.length, 1, 'B sees the pending operation of A');
  assert.equal(bSnap.pending[0].owner, 'other_page');
});

test('C1: pending of a page that fired pagehide is orphaned exactly once by the next load', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  let n = 0;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 10 } });
  const a = mk();
  a.diag.startOp('PHOTO_PIPELINE', 'upload');
  a.win.fire('pagehide');
  const b = mk();
  assert.equal(b.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 1);
  assert.equal(b.diag.exportSnapshot().pending.length, 0);
  const c = mk();
  assert.equal(c.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 1, 'not reported again');
});

test('C2: disable() is final — pagehide, visibility and scheduled flushes cannot re-create the buffer', () => {
  const { diag, storage, win, doc } = make();
  diag.record('REQUEST', 'end', { n: 1 });
  diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  storage.map.set(DIAG_FLAG_KEY, String(Date.now() + 1000));
  diag.disable();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY) || storage.map.has(DIAG_FLAG_KEY), false);
  win.fire('pagehide');
  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  diag.record('REQUEST', 'end', { n: 2 });
  diag.startOp('REQUEST', 'x').end({ ok: true });
  diag.flush();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'buffer stays gone after disable + reload events');
  assert.equal(storage.map.has(DIAG_FLAG_KEY), false);
});

test('C2: clear() empties the buffer; later pagehide only writes fresh data', () => {
  const { diag, storage, win } = make();
  for (let i = 0; i < 20; i += 1) diag.record('REQUEST', 'end', { rid: i });
  diag.flush();
  diag.clear();
  win.fire('pagehide');
  const stored = JSON.parse(storage.map.get(DIAG_BUFFER_KEY));
  assert.ok(!stored.events.some((e) => e.v === 'end'), 'cleared events did not come back');
});

test('C3: at the pending cap the OLDEST (stuck) operation is kept, new ones are not tracked', () => {
  const { diag, clock } = make();
  const auth = { getSession: () => new Promise(() => {}) };
  diag.instrumentAuthClient(auth);
  auth.getSession(); // the stuck holder, oldest entry
  clock.t += 30_000;
  for (let i = 0; i < MAX_PENDING + 20; i += 1) auth.getSession(); // queued callers pile up behind it
  const snap = diag.exportSnapshot();
  assert.equal(snap.pending.length, MAX_PENDING);
  const oldest = snap.pending.reduce((x, y) => (x.ageMs > y.ageMs ? x : y));
  assert.equal(oldest.ageMs, 30_000, 'the original stuck getSession is still listed with its true age');
  assert.ok(snap.counters.pending_overflow >= 20, 'overflow is counted, not silent');
});

// ── Final review findings (D2, D3, D4, D5, D7, D8, D9) ───────────────────
const liveFlag = (storage, clock) => storage.map.set(DIAG_FLAG_KEY, String(clock.t + FLAG_TTL_MS));

test('D3: disabling in ANOTHER tab is final everywhere (flag re-checked at every flush)', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  liveFlag(storage, clock);
  const mk = (r) => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => r, requireFlag: true } });
  const a = mk(0.1);
  const b = mk(0.2);
  a.diag.record('REQUEST', 'end', { rid: 1 });
  a.diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  b.diag.disable(); // "Disattiva" / ?vpdiag=0 in tab B: removes flag + buffer
  assert.equal(storage.map.has(DIAG_BUFFER_KEY) || storage.map.has(DIAG_FLAG_KEY), false);
  a.diag.record('REQUEST', 'end', { rid: 2 });
  a.diag.flush();
  a.win.fire('pagehide');
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'tab A must not re-create the buffer');
  a.diag.record('REQUEST', 'end', { rid: 3 });
  a.diag.flush();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'and stays silent afterwards');
});

test('D3: an expired flag also stops a running tab', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  liveFlag(storage, clock);
  const { diag } = make({ storage, deps: { now: () => clock.t, requireFlag: true } });
  diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  storage.map.delete(DIAG_BUFFER_KEY);
  clock.t += FLAG_TTL_MS + 1;
  diag.record('REQUEST', 'end', { rid: 1 });
  diag.flush();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false);
});

test('D4: "Disattiva" reload URL drops vpdiag so it cannot re-enable diagnostics', () => {
  assert.equal(urlWithoutDiagParam(`https://h.example/driver/assignment/x?access=abc&${DIAG_URL_PARAM}=1`), 'https://h.example/driver/assignment/x?access=abc');
  assert.equal(urlWithoutDiagParam(`https://h.example/driver/assignment/x?${DIAG_URL_PARAM}=1`), 'https://h.example/driver/assignment/x');
  assert.equal(urlWithoutDiagParam('https://h.example/driver/assignment/x?access=abc'), 'https://h.example/driver/assignment/x?access=abc', 'no param: unchanged');
  assert.equal(urlWithoutDiagParam('not a url'), 'not a url', 'never throws');
  // and the cleaned URL really does not re-enable
  const s = fakeStorage();
  const clean = new URL(urlWithoutDiagParam(`https://h.example/driver/assignment/x?access=abc&${DIAG_URL_PARAM}=1`));
  assert.equal(resolveEnabled({ storage: s, search: clean.search, pathname: clean.pathname }), false);
  assert.equal(s.map.has(DIAG_FLAG_KEY), false);
});

test('D2: a page restored from bfcache does not resurrect operations another load already orphaned', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  let n = 0;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 10 } });
  const a = mk();
  a.diag.startOp('PHOTO_PIPELINE', 'upload');
  a.win.fire('pagehide');                 // A enters bfcache
  const b = mk();                         // navigation: B orphans A's pending op
  assert.equal(b.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 1);
  a.win.fire('pageshow', { persisted: true }); // Back: A restored
  a.diag.flush();
  assert.equal(a.diag.exportSnapshot().pending.length, 0, 'orphaned op not listed as live again');
  assert.equal(JSON.parse(storage.map.get(DIAG_BUFFER_KEY)).pending && Object.keys(JSON.parse(storage.map.get(DIAG_BUFFER_KEY)).pending).length, 0);
  // an operation started after the restore is tracked normally
  a.diag.startOp('PHOTO_PIPELINE', 'register');
  a.diag.flush();
  assert.equal(a.diag.exportSnapshot().pending.length, 1);
});

test('D7: pageshow(persisted) marks a restored tab alive at once, so a new load does not orphan its live ops', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  let n = 0;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 10 } });
  const a = mk();
  a.diag.startOp('PHOTO_PIPELINE', 'upload');
  a.win.fire('pagehide');
  a.win.fire('pageshow', { persisted: true });   // restored, still running
  const b = mk();                                // another load starts right after
  assert.equal(b.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 0, 'live op not orphaned');
  assert.equal(b.diag.exportSnapshot().pending.length, 1);
});

test('D7: counters of different tabs are summed, not overwritten; only the last 6 loads are kept', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  let n = 0;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 100 } });
  const a = mk();
  a.diag.count('bridge_skip'); a.diag.count('bridge_skip');
  a.diag.flush();
  const b = mk();
  b.diag.count('bridge_skip'); b.diag.count('pending_overflow');
  b.diag.flush();
  a.diag.count('bridge_skip'); // A flushes last
  a.diag.flush();
  assert.deepEqual(a.diag.exportSnapshot().counters, { bridge_skip: 4, pending_overflow: 1 });
  for (let i = 0; i < 25; i += 1) { const t = mk(); t.diag.count('bridge_skip'); t.win.fire('pagehide'); }
  const stored = JSON.parse(storage.map.get(DIAG_BUFFER_KEY));
  assert.ok(Object.keys(stored.counters).length <= 6, 'per-load counters bounded');
  assert.equal(Object.keys(stored.loadState).length, 20, 'loadState is trimmed to exactly the last 20 loads (27 were created)');
});

test('D8: recordThrottled suppresses inside the window, counts suppressed, re-emits after the window', () => {
  const { diag, clock } = make();
  const emit = () => diag.recordThrottled('gps_flush_skip', 30_000, 'GPS_QUEUE', 'flush_skipped', { sending: true, online: true });
  emit(); clock.t += 1_000; emit(); clock.t += 1_000; emit();
  let snap = diag.exportSnapshot();
  assert.equal(snap.events.filter((e) => e.v === 'flush_skipped').length, 1, 'one event inside the window');
  assert.equal(snap.counters.gps_flush_skip_suppressed, 2);
  clock.t += 30_000; emit();
  snap = diag.exportSnapshot();
  assert.equal(snap.events.filter((e) => e.v === 'flush_skipped').length, 2, 're-emitted after the window');
  diag.count('x_counter'); diag.count('x_counter');
  assert.equal(diag.exportSnapshot().counters.x_counter, 2);
  diag.count('Bad Name'); // invalid counter names are ignored
  assert.equal(diag.exportSnapshot().counters['Bad Name'], undefined);
});

test('D9: createBrowserDiagnostics glue — enabled only on /driver/ with a live flag, never elsewhere', () => {
  const build = (pathname, search, storage) => {
    const { win, doc } = fakeWindow(pathname);
    win.location.search = search;
    win.localStorage = storage;
    win.document = doc;
    win.performance = { getEntriesByType: () => [{ type: 'navigate' }] };
    return createBrowserDiagnostics(win);
  };
  // ?vpdiag=1 on a driver path enables (and stores an expiring flag)
  let s = fakeStorage();
  assert.equal(build('/driver/assignment/x', '?access=t&vpdiag=1', s).enabled, true);
  assert.ok(parseFlag(s.map.get(DIAG_FLAG_KEY)).expiresAt > Date.now());
  // same URL parameter on any other path: disabled, storage untouched
  s = fakeStorage();
  assert.equal(build('/customer/dashboard', '?vpdiag=1', s).enabled, false);
  assert.deepEqual([s.calls.get, s.calls.set, s.calls.remove], [0, 0, 0]);
  // no flag, driver path: disabled
  assert.equal(build('/driver/assignment/x', '', fakeStorage()).enabled, false);
  // persisted live flag + driver path: enabled; same device on a non-driver path: disabled
  s = fakeStorage();
  s.map.set(DIAG_FLAG_KEY, String(Date.now() + 60_000));
  assert.equal(build('/driver/assignment/x', '', s).enabled, true);
  assert.equal(build('/admin', '', s).enabled, false);
  // partial / missing / hostile globals never throw and stay off
  assert.equal(createBrowserDiagnostics(undefined).enabled, false);
  assert.equal(createBrowserDiagnostics({}).enabled, false);
  assert.equal(createBrowserDiagnostics({ location: { pathname: '/driver/x', search: '' }, get localStorage() { throw new Error('blocked'); } }).enabled, false);
});

// ── Second final-review round (E1, E2, E4, E6) ───────────────────────────
test('E2: a restored tab stays "alive" even if another tab still holds its old closed marker', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  let n = 0;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 10 } });
  const x = mk();
  const y = mk();                               // Y is already open next to X
  x.diag.startOp('PHOTO_PIPELINE', 'upload');
  x.diag.flush();
  x.win.fire('pagehide');                       // X -> bfcache: storage marks X closed
  y.diag.record('REQUEST', 'end', { rid: 1 });
  y.diag.flush();                               // Y merges (and caches) X's closed marker
  const closedLoads = Object.values(JSON.parse(storage.map.get(DIAG_BUFFER_KEY)).loadState).filter((e) => e.c);
  assert.equal(closedLoads.length, 1, "precondition: X is stored as closed (and Y now holds that marker too)");
  x.win.fire('pageshow', { persisted: true });  // X restored: publishes "alive"
  y.diag.record('REQUEST', 'end', { rid: 2 });
  y.diag.flush();                               // Y flushes with its stale copy
  y.win.fire('pagehide');
  const z = mk();                               // a brand-new load
  assert.equal(z.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 0, "X's live op is not orphaned");
  assert.equal(z.diag.exportSnapshot().pending.some((p) => p.op === 'upload'), true);
});

test('E2: a load that really closed (pagehide, never restored) is still orphaned once', () => {
  const storage = fakeStorage();
  let n = 0;
  const clock = { t: 1_700_000_000_000 };
  const mk = () => make({ storage, env: fakeWindow(), deps: { now: () => clock.t, random: () => (++n) / 10 } });
  const a = mk();
  a.diag.startOp('PHOTO_PIPELINE', 'upload');
  a.win.fire('pagehide');
  const b = mk();
  b.diag.flush();
  const c = mk();
  assert.equal(b.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 1);
  assert.equal(c.diag.exportSnapshot().events.filter((e) => e.v === 'orphaned_pending').length, 1, 'reported once, not again');
});

test('E1: a flag that expires inside an open tab stops it AND wipes the leftover buffer', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  storage.map.set(DIAG_FLAG_KEY, String(clock.t + FLAG_TTL_MS));
  const { diag } = make({ storage, deps: { now: () => clock.t, requireFlag: true } });
  diag.record('REQUEST', 'end', { rid: 1 });
  diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  clock.t += FLAG_TTL_MS + 1;
  diag.record('REQUEST', 'end', { rid: 2 });
  diag.flush();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'buffer removed when the flag expired');
  diag.record('REQUEST', 'end', { rid: 3 });
  diag.flush();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'and nothing is written afterwards');
});

test('E4: a disable that lands between the flag check and the buffer write leaves no buffer behind', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  storage.map.set(DIAG_FLAG_KEY, String(clock.t + FLAG_TTL_MS));
  const realSet = storage.setItem;
  let armed = false;
  let raced = false;
  storage.setItem = (k, v) => {
    if (armed && k === DIAG_BUFFER_KEY && !raced) { raced = true; storage.map.delete(DIAG_FLAG_KEY); storage.map.delete(DIAG_BUFFER_KEY); } // tab A: "Disattiva"
    realSet(k, v); // ...then this tab's write lands after the wipe
  };
  const { diag } = make({ storage, deps: { now: () => clock.t, requireFlag: true } });
  armed = true; // the race happens on a LATER flush (after the constructor's own first flush)
  diag.record('REQUEST', 'end', { rid: 1 });
  diag.flush();
  assert.equal(raced, true);
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'the stray buffer was removed by the post-write re-check');
  assert.equal(storage.map.has(DIAG_FLAG_KEY), false);
});

test('E6: the production factory wires requireFlag — an instance it builds stops when the flag disappears', () => {
  const build = (storage) => {
    const { win, doc } = fakeWindow('/driver/assignment/x');
    win.location.search = '';
    win.localStorage = storage;
    win.document = doc;
    win.performance = { getEntriesByType: () => [{ type: 'navigate' }] };
    return { win, diag: createBrowserDiagnostics(win) };
  };
  const storage = fakeStorage();
  storage.map.set(DIAG_FLAG_KEY, String(Date.now() + 3_600_000));
  const { diag } = build(storage);
  assert.equal(diag.enabled, true);
  diag.record('REQUEST', 'end', { rid: 1 });
  diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  storage.map.delete(DIAG_FLAG_KEY);          // another tab disabled diagnostics
  storage.map.delete(DIAG_BUFFER_KEY);
  diag.record('REQUEST', 'end', { rid: 2 });
  diag.flush();
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'the factory-built instance must not re-create the buffer');
  // and an expired flag stops it as well (no wall-clock race: the flag has an hour of margin, then is expired by hand)
  const s2 = fakeStorage();
  s2.map.set(DIAG_FLAG_KEY, `${Date.now() + 3_600_000}:g`);
  const b = build(s2).diag;
  assert.equal(b.enabled, true, 'precondition: the instance really runs under a live flag');
  b.record('REQUEST', 'end', { rid: 1 });
  b.flush();
  assert.ok(s2.map.has(DIAG_BUFFER_KEY), 'precondition: it wrote its buffer');
  s2.map.set(DIAG_FLAG_KEY, `${Date.now() - 1}:g`);        // the flag expires while the tab is open
  b.record('REQUEST', 'end', { rid: 2 });
  b.flush();
  assert.equal(s2.map.has(DIAG_BUFFER_KEY), false, 'expired flag: the buffer is wiped and nothing is re-created');
});

// ── Third final-review round (G2) ────────────────────────────────────────
test('G2: a tab left over from an earlier enablement stops without wiping the NEW session', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  const now = () => clock.t;
  // enablement #1 (generation from a fixed random)
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.111 });
  const gen1 = parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen;
  const mk = () => make({ storage, env: fakeWindow(), deps: { now, requireFlag: true } });
  const a = mk();
  const b = mk();
  b.diag.record('REQUEST', 'end', { rid: 1 });
  b.diag.flush();
  a.diag.disable();                                                  // "Disattiva" in tab A: flag + buffer removed
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.777 }); // tab C re-enables
  const gen2 = parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen;
  assert.notEqual(gen1, gen2, 'a re-enablement gets a new generation');
  storage.map.set(DIAG_BUFFER_KEY, JSON.stringify({ v: 2, loads: 9, lastWrite: 1, events: [], pending: {}, counters: {}, loadState: {} })); // C's fresh buffer
  const before = storage.map.get(DIAG_BUFFER_KEY);
  b.diag.record('REQUEST', 'end', { rid: 2 });
  b.diag.flush();                                                    // stale tab B flushes
  assert.equal(storage.map.get(DIAG_BUFFER_KEY), before, "B did not write into (or wipe) the new session's buffer");
  b.diag.record('REQUEST', 'end', { rid: 3 });
  b.diag.flush();
  assert.equal(storage.map.get(DIAG_BUFFER_KEY), before, 'and B stays stopped');
});

test('G2: a second tab opened with ?vpdiag=1 while diagnostics are on keeps the SAME enablement (first tab keeps running)', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  const now = () => clock.t;
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.25 });
  const gen1 = parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen;
  const a = make({ storage, env: fakeWindow(), deps: { now, requireFlag: true } });
  clock.t += 60_000;
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.9 }); // tab B, still valid
  const flag2 = parseFlag(storage.map.get(DIAG_FLAG_KEY));
  assert.equal(flag2.gen, gen1, 'generation preserved while the flag is valid');
  assert.equal(flag2.expiresAt, clock.t + FLAG_TTL_MS, 'expiry refreshed');
  a.diag.record('REQUEST', 'end', { rid: 1 });
  a.diag.flush();
  assert.ok(storage.map.has(DIAG_BUFFER_KEY), 'tab A keeps writing');
});

test('G2: legacy numeric flag (no generation) still works and parseFlag is strict', () => {
  assert.deepEqual(parseFlag('123'), { expiresAt: 123, gen: '' });
  assert.deepEqual(parseFlag('123:abc'), { expiresAt: 123, gen: 'abc' });
  assert.equal(parseFlag(null), null);
  assert.equal(parseFlag(''), null);
  assert.equal(parseFlag('abc:x'), null);
});

// ── Fourth final-review round (H2, H3, H1) ───────────────────────────────
test('H2/H3: re-enabling after EXPIRY starts a new enablement: new generation, old buffer wiped', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  const now = () => clock.t;
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.111 });
  const gen1 = parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen;
  storage.map.set(DIAG_BUFFER_KEY, JSON.stringify({ v: 2, loads: 5, lastWrite: 1, events: [{ l: 5001, i: 1, t: 1, c: 'REQUEST', v: 'end', m: { ok: false } }], pending: {}, counters: {}, loadState: {} }));
  clock.t += FLAG_TTL_MS + 1;                    // 8 h pass, nobody flushes: the flag is expired, the buffer remains
  assert.ok(storage.map.has(DIAG_BUFFER_KEY));
  assert.equal(resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.777 }), true);
  assert.notEqual(parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen, gen1, 'expired flag: the generation is NOT reused');
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, "the old enablement's buffer is gone");
  // the new page therefore starts clean: the old failure is not reported as firstFailure
  const { diag } = make({ storage, deps: { now, requireFlag: true } });
  assert.equal(diag.exportSnapshot().firstFailure, null);
  assert.equal(diag.exportSnapshot().loads, 1);
});

test('H2: enabling while NO flag exists but an old buffer does also starts clean; a still-valid flag keeps its buffer', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  const now = () => clock.t;
  storage.map.set(DIAG_BUFFER_KEY, '{"v":2,"events":[]}');
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.5 });
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), false, 'no flag + old buffer: wiped on a new enablement');
  storage.map.set(DIAG_BUFFER_KEY, '{"v":2,"events":[]}');
  clock.t += 60_000;
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.9 }); // second tab, same enablement
  assert.equal(storage.map.has(DIAG_BUFFER_KEY), true, 'refreshing a valid enablement must keep its buffer');
});

test('H1: the flag is read and written back-to-back so simultaneous enables converge on one generation', () => {
  const storage = fakeStorage();
  const clock = { t: 1_700_000_000_000 };
  const now = () => clock.t;
  // tab A and tab B both call resolveEnabled at the same instant; B's call happens after A's write
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.2 });
  const genA = parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen;
  resolveEnabled({ storage, search: '?vpdiag=1', pathname: '/driver/x', now, random: () => 0.8 });
  assert.equal(parseFlag(storage.map.get(DIAG_FLAG_KEY)).gen, genA, 'the second enabler adopts the first one\'s generation');
  const src = readFileSync(new URL('../src/lib/diagnostics/driverDiagnostics.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /const fresh = newGeneration\(random\);\n(?:\s*\/\/[^\n]*\n)+\s*const current = parseFlag\(storage\.getItem\(DIAG_FLAG_KEY\)\);/, 'random generation happens BEFORE the read');
  assert.match(src, /if \(!stillValid\) storage\.removeItem\(DIAG_BUFFER_KEY\);\n\s*storage\.setItem\(DIAG_FLAG_KEY,/, 'nothing but the buffer wipe sits between the read and the write');
});
