// TEMPORARY driver runtime diagnostics (BUG D, phase D1). OFF by default.
//
// Purpose: identify the FIRST failure of one real-phone reproduction
// (program -> report #1 + photo -> report #2 fails -> map/GPS -> back).
//
// Privacy contract (enforced structurally, not by convention):
//  - Only events from a fixed class list are stored.
//  - Only allowlisted metadata KEYS are stored, and every value must satisfy a
//    per-key strict pattern (numbers are rounded to integers, strings are
//    lowercase enums / class names). Anything else is dropped, so tokens,
//    Authorization values, cookies, URLs/query strings, coordinates, message
//    text, customer data and photo bytes cannot be stored even if a caller
//    passes them by mistake.
//  - Error MESSAGES are never stored: only a coarse kind (timeout/network/...),
//    the error class name and a short error code.
//  - URLs are never stored: only the pathname is inspected to derive a class
//    (auth/rpc/rest/storage) and an RPC/table name matching a strict pattern.
//  - Nothing is ever sent anywhere. Data lives in localStorage on this device
//    and is exported only by an explicit tap on the on-screen panel.
//
// Enabling: open a /driver/ URL with ?vpdiag=1. That stores an EXPIRING flag
// (8 hours) in localStorage, honoured ONLY on /driver/ paths: on any other
// path this module does not even touch storage. ?vpdiag=0 (on a /driver/
// path) or the panel's "Disattiva" disables and wipes everything. Enabling
// takes effect on the next page load (Supabase client options are decided
// once at module load).
//
// Several tabs: every page load has its own load id; flush() merges other
// loads' events/pending/counters from storage instead of overwriting them.
// A load's pending operations are reported as orphaned only after that load
// fired `pagehide` (reload/close); operations of a still-open tab, or of a
// page killed without pagehide, stay listed under `pending` with their age.

export const DIAG_FLAG_KEY = 'vp_diag_driver';
export const DIAG_BUFFER_KEY = 'vp_diag_driver_buf';
export const DIAG_URL_PARAM = 'vpdiag';
export const FLAG_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_EVENTS = 600;
export const MAX_PENDING = 60;
export const MAX_BYTES = 200000;
const MAX_TRACKED_LOADS = 6;
const PERSIST_DELAY_MS = 300;

const EVENT_CLASSES = new Set([
  'PAGE_LIFECYCLE', 'REQUEST', 'SESSION_BRIDGE', 'PHOTO_PIPELINE',
  'GPS_QUEUE', 'DRIVER_ASSIGNMENT', 'AUTH_LOCK', 'REALTIME', 'DIAG',
]);

const ENUM = /^[a-z][a-z0-9_:-]{0,39}$/;
const NUM = 'num';
const BOOL = 'bool';
// Allowlist of metadata keys and the ONLY shape each value may have.
const KEY_RULES = {
  cls: ENUM, op: ENUM, stage: ENUM, state: ENUM, from: ENUM, to: ENUM,
  navType: ENUM, vis: ENUM, key: ENUM, reason: ENUM, errKind: ENUM,
  errName: /^[A-Za-z]{1,40}$/,
  errCode: /^[A-Za-z][A-Za-z0-9_]{0,39}$/,
  rid: NUM, dur: NUM, status: NUM, inflight: NUM, attempt: NUM, queue: NUM,
  remaining: NUM, n: NUM, loads: NUM, bytes: NUM, sendingFor: NUM,
  pendingN: NUM, ageMs: NUM,
  ok: BOOL, exists: BOOL, expired: BOOL, sending: BOOL, online: BOOL,
  timeout: BOOL, bg: BOOL, persisted: BOOL,
};

function sanitizeValue(rule, value) {
  if (rule === NUM) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e12
      ? Math.round(value) // integers only: a stray decimal coordinate loses precision
      : undefined;
  }
  if (rule === BOOL) return typeof value === 'boolean' ? value : undefined;
  return typeof value === 'string' && rule.test(value) ? value : undefined;
}

export function sanitizeMeta(meta) {
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const key of Object.keys(meta)) {
    const rule = KEY_RULES[key];
    if (!rule) continue;
    const value = sanitizeValue(rule, meta[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// Coarse error description WITHOUT the message text.
export function describeError(err) {
  if (!err) return {};
  const raw = `${err.name || ''} ${err.message || ''} ${err.code || ''}`.toLowerCase();
  let errKind = 'other';
  if (/timeout|timed out/.test(raw)) errKind = 'timeout';
  else if (/abort/.test(raw)) errKind = 'abort';
  else if (/lock/.test(raw)) errKind = 'lock';
  else if (/failed to fetch|network|load failed|retryable|econnreset/.test(raw)) errKind = 'network';
  else if (/row-level|permission|42501|forbidden/.test(raw)) errKind = 'permission';
  else if (/jwt|refresh_token|invalid_grant|session|unauthor|auth/.test(raw)) errKind = 'auth';
  else if (Number(err.status) >= 500) errKind = 'server';
  return {
    errKind,
    errName: typeof err.name === 'string' ? err.name : undefined,
    errCode: typeof err.code === 'string' ? err.code : undefined,
    status: Number.isFinite(Number(err.status)) && err.status !== null ? Number(err.status) : undefined,
  };
}

// Path class only: never any id, query or hash.
export function classifyPath(pathname) {
  const p = String(pathname || '');
  if (/^\/driver\/assignment\/[^/]+\/map\/?$/.test(p)) return 'assignment_map';
  if (/^\/driver\/assignment\/[^/]+\/?$/.test(p)) return 'assignment_program';
  if (/^\/driver\/tracking\//.test(p)) return 'tracking';
  if (/^\/driver\//.test(p)) return 'driver_other';
  return 'other';
}

// Class + operation name from a request. Uses ONLY the pathname; ids in the
// path and everything in the query/hash are discarded.
export function classifyRequest(input, init) {
  let path = '';
  try {
    const raw = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    path = new URL(raw, 'http://local.invalid').pathname;
  } catch { /* unparseable: falls to 'other' */ }
  const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  const nameOf = (segment) => (ENUM.test(String(segment || '')) ? segment : 'other');
  let m = path.match(/^\/rest\/v1\/rpc\/([^/]+)/);
  if (m) return { cls: 'rpc', op: nameOf(m[1]) };
  m = path.match(/^\/rest\/v1\/([^/]+)/);
  if (m) return { cls: 'rest', op: nameOf(m[1]) };
  m = path.match(/^\/auth\/v1\/([^/]+)/);
  if (m) return { cls: 'auth', op: nameOf(m[1]) };
  if (/^\/storage\/v1\//.test(path)) return { cls: 'storage', op: method === 'GET' ? 'read' : 'write' };
  return { cls: 'other', op: 'other' };
}

function decodeBase64Url(segment) {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
}

function emptyStored() {
  return { v: 2, loads: 0, lastWrite: 0, events: [], pending: {}, counters: {}, loadState: {} };
}

// loadState[loadId] = { c: closed?, v: version }. Only the OWNER load bumps its
// own version, and merges keep the highest version per load, so a stale copy
// held by another tab can never undo the owner's "alive again" (bfcache restore).
function parseLoadState(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, e] of Object.entries(raw)) {
    if (e && typeof e === 'object' && typeof e.c === 'boolean' && Number.isFinite(e.v)) out[k] = { c: e.c, v: e.v };
  }
  return out;
}

function parseStored(storage) {
  try {
    const raw = storage && storage.getItem(DIAG_BUFFER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== 2 || !Array.isArray(p.events)) return null;
    return {
      v: 2,
      loads: Number(p.loads) || 0,
      lastWrite: Number(p.lastWrite) || 0,
      events: p.events.filter((e) => e && typeof e === 'object').slice(-MAX_EVENTS),
      pending: p.pending && typeof p.pending === 'object' ? p.pending : {},
      counters: p.counters && typeof p.counters === 'object' ? p.counters : {},
      loadState: parseLoadState(p.loadState),
    };
  } catch { return null; /* corrupt buffer: start empty */ }
}

const NOOP_OP = Object.freeze({ end() {} });

/**
 * @param {object} deps injectable for tests: storage, win, doc, now, perf,
 *   random, enabled (boolean), schedule (fn) — no globals are read when injected.
 */
export function createDiagnostics(deps = {}) {
  const storage = deps.storage || null;
  const win = deps.win || null;
  const doc = deps.doc || null;
  const now = deps.now || (() => Date.now());
  const random = deps.random || Math.random;
  const schedule = deps.schedule || ((fn) => setTimeout(fn, PERSIST_DELAY_MS));
  const enabled = Boolean(deps.enabled);
  const requireFlag = Boolean(deps.requireFlag); // browser instance: the expiring flag must still exist

  let state = emptyStored();
  let myLoad = 0;
  let myVersion = 0; // version of this load's entry in loadState
  let dead = false; // set by disable(): nothing may ever be written again
  const droppedPending = new Set(); // orphans already reported: never merged back from storage
  let ridSeq = 0;
  let seq = 0;
  let persistScheduled = false;
  let lastPathClass = 'other';
  const throttle = new Map();
  const inflight = { REQUEST: 0 };

  const isLive = () => enabled && !dead;

  // disable()/?vpdiag=0/expiry in ANY tab removes the flag: every other tab
  // notices at its next flush, stops for good and writes nothing more.
  function flagStillValid() {
    try {
      const raw = storage && storage.getItem(DIAG_FLAG_KEY);
      const expiresAt = Number(raw);
      return raw !== null && Number.isFinite(expiresAt) && expiresAt > now();
    } catch { return false; }
  }

  function serialize() {
    let text = JSON.stringify(state);
    // Hard byte ceiling in addition to the event-count ceiling.
    while (text.length > MAX_BYTES && state.events.length > 10) {
      state.events.splice(0, Math.ceil(state.events.length * 0.2));
      text = JSON.stringify(state);
    }
    return text;
  }

  // Merge with whatever other tabs/loads wrote since we last looked, so a
  // second tab never overwrites this tab's evidence (and vice versa).
  function mergeFromStorage() {
    const stored = parseStored(storage);
    if (!stored) return;
    const events = new Map();
    for (const e of [...stored.events, ...state.events]) events.set(`${e.l}.${e.i}`, e);
    state.events = [...events.values()].sort((a, b) => (a.t - b.t) || (a.l - b.l) || (a.i - b.i)).slice(-MAX_EVENTS);
    const pending = {};
    for (const [k, p] of Object.entries(stored.pending)) if (p && p.l !== myLoad && !droppedPending.has(k)) pending[k] = p;
    for (const [k, p] of Object.entries(state.pending)) if (p && p.l === myLoad) pending[k] = p;
    state.pending = pending;
    const counters = { ...stored.counters };
    if (state.counters[myLoad]) counters[myLoad] = state.counters[myLoad];
    const keep = Object.keys(counters).map(Number).sort((a, b) => a - b).slice(-MAX_TRACKED_LOADS);
    state.counters = Object.fromEntries(keep.map((k) => [k, counters[k]]));
    const loadState = { ...stored.loadState };
    for (const [k, e] of Object.entries(state.loadState)) {
      const other = loadState[k];
      if (!other || e.v > other.v) loadState[k] = e;
    }
    if (state.loadState[myLoad]) loadState[myLoad] = state.loadState[myLoad]; // the owner is authoritative
    const keepLoads = Object.keys(loadState).map(Number).sort((a, b) => a - b).slice(-20);
    state.loadState = Object.fromEntries(keepLoads.map((k) => [k, loadState[k]]));
    state.loads = Math.max(state.loads, stored.loads);
  }

  // The flag is gone or expired (disable in any tab, ?vpdiag=0, 8 h TTL): this
  // page stops for good and removes whatever buffer exists.
  function stopAndWipe() {
    dead = true;
    try { storage && storage.removeItem(DIAG_BUFFER_KEY); } catch { /* ignore */ }
  }

  function flush() {
    persistScheduled = false;
    if (!isLive() || !storage) return;
    if (requireFlag && !flagStillValid()) { stopAndWipe(); return; }
    try {
      mergeFromStorage();
      state.lastWrite = now();
      storage.setItem(DIAG_BUFFER_KEY, serialize());
      // Another tab may have disabled diagnostics between the check above and
      // the write: never leave a buffer behind once the flag is gone.
      if (requireFlag && !flagStillValid()) stopAndWipe();
    } catch { /* quota/private mode: diagnostics must never throw */ }
  }

  function schedulePersist() {
    if (persistScheduled || !isLive()) return;
    persistScheduled = true;
    try { schedule(flush); } catch { persistScheduled = false; }
  }

  function record(cls, ev, meta) {
    if (!isLive()) return;
    if (!EVENT_CLASSES.has(cls) || !ENUM.test(String(ev))) return;
    seq += 1;
    state.events.push({ l: myLoad, i: seq, t: now(), c: cls, v: ev, m: sanitizeMeta(meta) });
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    schedulePersist();
  }

  function count(name) {
    if (!isLive() || !ENUM.test(String(name))) return;
    const mine = state.counters[myLoad] || (state.counters[myLoad] = {});
    mine[name] = (mine[name] || 0) + 1;
    schedulePersist();
  }

  function recordThrottled(key, ms, cls, ev, meta) {
    if (!isLive()) return;
    const t = now();
    const last = throttle.get(key);
    if (last !== undefined && t - last < ms) { count(`${key}_suppressed`); return; }
    throttle.set(key, t);
    record(cls, ev, meta);
  }

  // A tracked operation: appears in `pending` (persisted) until end(), so an
  // operation that NEVER finishes is visible in the export with its age.
  // When MAX_PENDING is reached the NEW operation is simply not registered
  // (its end event is still recorded): the oldest pending entries are the
  // stuck ones and must never be evicted.
  function startOp(cls, op, meta) {
    if (!isLive()) return NOOP_OP;
    if (!EVENT_CLASSES.has(cls)) cls = 'DIAG';
    if (!ENUM.test(String(op))) op = 'other';
    ridSeq += 1;
    const rid = ridSeq;
    const t0 = now();
    const isRequest = cls === 'REQUEST';
    if (isRequest) inflight.REQUEST += 1;
    const key = `${myLoad}.${rid}`;
    if (Object.keys(state.pending).length < MAX_PENDING) {
      state.pending[key] = { l: myLoad, c: cls, op, t0 };
      schedulePersist();
    } else {
      count('pending_overflow');
    }
    let ended = false;
    return {
      end(result = {}) {
        if (ended) return;
        ended = true;
        if (isRequest) inflight.REQUEST = Math.max(0, inflight.REQUEST - 1);
        delete state.pending[key];
        const err = result.err ? describeError(result.err) : {};
        record(cls, 'end', {
          ...meta, ...result.extra, ...err, op, rid,
          dur: now() - t0,
          ok: result.ok,
          status: result.status !== undefined ? result.status : err.status,
          inflight: isRequest ? inflight.REQUEST : undefined,
          state: result.state,
          timeout: result.timeout,
        });
      },
    };
  }

  // Wraps fn: identical behavior/return value when disabled.
  function trace(cls, op, fn, meta) {
    if (!isLive()) return fn();
    const h = startOp(cls, op, meta);
    let result;
    try { result = fn(); } catch (e) { h.end({ ok: false, err: e }); throw e; }
    if (result && typeof result.then === 'function') {
      return result.then((v) => { h.end({ ok: true }); return v; }, (e) => { h.end({ ok: false, err: e }); throw e; });
    }
    h.end({ ok: true });
    return result;
  }

  function tokenExpired(accessToken) {
    if (!isLive()) return null;
    try {
      const payload = JSON.parse(decodeBase64Url(String(accessToken).split('.')[1] || ''));
      return typeof payload.exp === 'number' ? payload.exp * 1000 <= now() : null;
    } catch { return null; }
  }

  function createInstrumentedFetch(baseFetch) {
    return function diagFetch(input, init) {
      const { cls, op } = classifyRequest(input, init);
      const h = startOp('REQUEST', op, { cls });
      let promise;
      try { promise = baseFetch(input, init); } catch (e) { h.end({ ok: false, err: e }); throw e; }
      return promise.then(
        (res) => { h.end({ ok: Boolean(res && res.ok), status: res && res.status }); return res; },
        (e) => { h.end({ ok: false, err: e }); throw e; },
      );
    };
  }

  // Times supabase.auth.getSession(), which every request awaits through
  // fetchWithAuth. Inside one tab auth-js queues callers behind the current
  // lock holder WITHOUT a timeout, so a stuck holder shows up here as a
  // getSession that never ends (pending) or a very long one.
  function instrumentAuthClient(auth) {
    if (!isLive() || !auth || typeof auth.getSession !== 'function' || auth.__vpDiag) return;
    const original = auth.getSession.bind(auth);
    auth.__vpDiag = true;
    auth.getSession = function diagGetSession(...args) {
      const h = startOp('AUTH_LOCK', 'getsession');
      return original(...args).then(
        (res) => { h.end({ ok: !(res && res.error), err: res && res.error }); return res; },
        (e) => { h.end({ ok: false, err: e }); throw e; },
      );
    };
  }

  // auth-js warns (fixed text, no secrets) when it steals an orphaned lock.
  // Only the occurrence is recorded; the call is passed through untouched.
  function watchLockWarnings(consoleObj) {
    if (!isLive() || !consoleObj || consoleObj.__vpDiagWarn) return;
    const originalWarn = consoleObj.warn;
    consoleObj.__vpDiagWarn = true;
    consoleObj.warn = function diagWarn(...args) {
      try {
        if (typeof args[0] === 'string' && args[0].startsWith('@supabase/gotrue-js: Lock ')) {
          record('AUTH_LOCK', 'lock_stolen', { reason: 'not_released' });
        }
      } catch { /* never interfere */ }
      return originalWarn.apply(this, args);
    };
  }

  function clientOptions(baseFetch) {
    if (!enabled) return null;
    return { global: { fetch: createInstrumentedFetch(baseFetch) } };
  }

  function navigationType() {
    try {
      const entry = deps.perf && deps.perf.getEntriesByType && deps.perf.getEntriesByType('navigation')[0];
      return entry && ENUM.test(String(entry.type)) ? String(entry.type) : 'unknown';
    } catch { return 'unknown'; }
  }

  function visibility() {
    return doc && ENUM.test(String(doc.visibilityState)) ? doc.visibilityState : 'unknown';
  }

  // Pending operations of loads that fired `pagehide` (reload/close) can never
  // finish: report them once and drop them. Live tabs are left alone.
  function orphanPendingOfClosedLoads() {
    const closed = new Set(Object.entries(state.loadState).filter(([, e]) => e.c).map(([k]) => Number(k)));
    if (!closed.size) return;
    const lastSeen = state.lastWrite || now();
    for (const [k, p] of Object.entries(state.pending)) {
      if (!p || !closed.has(p.l)) continue;
      record('DIAG', 'orphaned_pending', { op: p.op, stage: String(p.c).toLowerCase(), ageMs: lastSeen - p.t0 });
      delete state.pending[k];
      droppedPending.add(k);
    }
  }

  function installListeners() {
    if (!win || typeof win.addEventListener !== 'function') return;
    win.addEventListener('pageshow', (e) => {
      if (e && e.persisted) {
        // Restored from bfcache: alive again. Operations another load already
        // reported as orphaned (they are gone from storage) must not come back.
        const stored = parseStored(storage);
        if (stored) {
          for (const [k, p] of Object.entries(state.pending)) {
            if (p && p.l === myLoad && !stored.pending[k]) delete state.pending[k];
          }
        }
        myVersion += 1;
        state.loadState[myLoad] = { c: false, v: myVersion };
        flush(); // publish "not closed" immediately so a new load cannot orphan live ops
      }
      record('PAGE_LIFECYCLE', 'pageshow', { persisted: Boolean(e && e.persisted) });
    });
    win.addEventListener('pagehide', () => {
      record('PAGE_LIFECYCLE', 'pagehide', { vis: visibility() });
      myVersion += 1;
      state.loadState[myLoad] = { c: true, v: myVersion };
      flush();
    });
    win.addEventListener('online', () => record('PAGE_LIFECYCLE', 'network_online', { online: true }));
    win.addEventListener('offline', () => record('PAGE_LIFECYCLE', 'network_offline', { online: false }));
    win.addEventListener('popstate', () => {
      const to = classifyPath(win.location && win.location.pathname);
      record('PAGE_LIFECYCLE', 'navigate', { from: lastPathClass, to });
      lastPathClass = to;
    });
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', () => {
        record('PAGE_LIFECYCLE', 'visibility', { vis: visibility() });
        if (visibility() === 'hidden') flush();
      });
    }
  }

  function exportSnapshot() {
    const t = now();
    const pending = Object.entries(state.pending).map(([id, p]) => ({
      id, class: p.c, op: p.op, ageMs: Math.max(0, t - p.t0), owner: p.l === myLoad ? 'this_page' : 'other_page',
    }));
    const counters = {};
    for (const perLoad of Object.values(state.counters)) {
      for (const [name, n] of Object.entries(perLoad || {})) counters[name] = (counters[name] || 0) + n;
    }
    const firstFailure = state.events.find((e) => e.m && (e.m.ok === false || e.m.timeout === true)) || null;
    return {
      app: 'vp-driver-diag', v: 2, exportedAt: new Date(t).toISOString(),
      loads: state.loads, eventCount: state.events.length, maxEvents: MAX_EVENTS,
      counters, pending, firstFailure, events: state.events,
    };
  }

  function exportText() {
    return JSON.stringify(exportSnapshot(), null, 1);
  }

  function clear() {
    state = { ...emptyStored(), loads: state.loads };
    try { storage && storage.removeItem(DIAG_BUFFER_KEY); } catch { /* ignore */ }
  }

  // After disable() this instance can never write again (pagehide/timers too).
  function disable() {
    dead = true;
    try { storage && storage.removeItem(DIAG_FLAG_KEY); storage && storage.removeItem(DIAG_BUFFER_KEY); } catch { /* ignore */ }
  }

  if (enabled) {
    const stored = parseStored(storage);
    if (stored) state = stored;
    state.loads += 1;
    myLoad = state.loads * 1000 + Math.floor(random() * 1000);
    orphanPendingOfClosedLoads();
    lastPathClass = classifyPath(win && win.location && win.location.pathname);
    record('PAGE_LIFECYCLE', 'load', { navType: navigationType(), loads: state.loads, to: lastPathClass, vis: visibility() });
    installListeners();
    flush();
  }

  return {
    enabled, record, count, recordThrottled, startOp, trace, tokenExpired,
    createInstrumentedFetch, instrumentAuthClient, watchLockWarnings, clientOptions,
    exportSnapshot, exportText, clear, disable, flush,
  };
}

// URL of the current page without the enabling parameter, so that turning
// diagnostics off (then reloading) is not undone by ?vpdiag=1 still in the URL.
export function urlWithoutDiagParam(href) {
  try {
    const u = new URL(href);
    u.searchParams.delete(DIAG_URL_PARAM);
    return u.toString();
  } catch { return href; }
}

// Reads the enable flag. Diagnostics exist ONLY on /driver/ paths: elsewhere
// this returns false without touching storage. ?vpdiag=1 stores an expiring
// flag (its literal value is never recorded); ?vpdiag=0 disables and wipes.
export function resolveEnabled({ storage, search, pathname, now = () => Date.now() }) {
  try {
    if (!/^\/driver\//.test(String(pathname || ''))) return false;
    const value = new URLSearchParams(search || '').get(DIAG_URL_PARAM);
    if (value === '0') {
      storage.removeItem(DIAG_FLAG_KEY);
      storage.removeItem(DIAG_BUFFER_KEY);
      return false;
    }
    if (value === '1') storage.setItem(DIAG_FLAG_KEY, String(now() + FLAG_TTL_MS));
    const raw = storage.getItem(DIAG_FLAG_KEY);
    if (raw === null) return false;
    const expiresAt = Number(raw);
    if (Number.isFinite(expiresAt) && expiresAt > now()) return true;
    storage.removeItem(DIAG_FLAG_KEY); // expired or legacy/invalid flag: wipe the leftovers too
    storage.removeItem(DIAG_BUFFER_KEY);
    return false;
  } catch { return false; }
}

// Must never throw at import time (partial/mocked windows, blocked storage).
// `g` is the window-like global (injectable for tests).
export function createBrowserDiagnostics(g) {
  try {
    if (!g || !g.location) return createDiagnostics({ enabled: false });
    let storage = null;
    try { storage = g.localStorage; } catch { /* blocked storage */ }
    const enabled = storage
      ? resolveEnabled({ storage, search: g.location.search, pathname: g.location.pathname })
      : false;
    return createDiagnostics({ enabled, requireFlag: true, storage, win: g, doc: g.document, perf: g.performance });
  } catch {
    return createDiagnostics({ enabled: false });
  }
}

export const driverDiag = createBrowserDiagnostics(typeof window === 'undefined' ? undefined : window);
