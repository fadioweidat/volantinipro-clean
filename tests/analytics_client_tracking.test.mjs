// Analytics Visitatori — client tracking: dedup, opt-out, fallback, nuovi
// eventi, percorso /api/track. Ambiente browser fittizio + fetch spia.
import assert from 'node:assert/strict';
import test from 'node:test';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
  };
}

function setNavigator(value) {
  try { Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true }); }
  catch { /* alcune versioni Node: navigator non ridefinibile — device parse userà il fallback */ }
}

function install({ origin = null, fetchImpl } = {}) {
  const saved = { window: global.window, fetch: global.fetch,
    navDesc: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY };
  const calls = [];
  global.window = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    location: origin ? { origin, pathname: '/', search: '', hostname: 'x.test' } : { pathname: '/', search: '' },
  };
  setNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36' });
  global.fetch = fetchImpl || (async (u, o) => { calls.push({ url: u, options: o }); return { ok: true, status: 204 }; });
  process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_test_key_000';
  return {
    calls,
    restore() {
      global.window = saved.window; global.fetch = saved.fetch;
      if (saved.navDesc) { try { Object.defineProperty(globalThis, 'navigator', saved.navDesc); } catch { /* ignore */ } }
      if (saved.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = saved.url;
      if (saved.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = saved.key;
    },
  };
}
const fresh = () => import(`../src/lib/analytics/siteEvents.js?t=${Date.now()}-${Math.random()}`);
const wait = () => new Promise((r) => setImmediate(r));
const body = (c) => JSON.parse(c.options.body);

test('page_view: dedup — due chiamate ravvicinate = 1 solo page_view', async () => {
  const env = install();
  try {
    const { trackPageView } = await fresh();
    trackPageView('/');
    trackPageView('/');
    await wait();
    const pv = env.calls.filter((c) => body(c).event_name === 'page_view');
    assert.equal(pv.length, 1, 'StrictMode/SPA non deve doppiare il page_view');
    const ss = env.calls.filter((c) => body(c).event_name === 'session_started');
    assert.equal(ss.length, 1);
  } finally { env.restore(); }
});

test('opt-out: con vp_analytics_optout nessuna richiesta parte', async () => {
  const env = install();
  try {
    const mod = await fresh();
    mod.setAnalyticsOptOut(true);
    assert.equal(mod.isAnalyticsOptedOut(), true);
    mod.trackPageView('/');
    mod.trackQuoteStarted();
    mod.trackMunicipalitySelected({ municipality: 'Milano' });
    await wait();
    assert.equal(env.calls.length, 0, 'opt-out = zero tracking');
    mod.setAnalyticsOptOut(false);
    mod.trackPageView('/x');
    await wait();
    assert.ok(env.calls.length >= 1, 'riattivato dopo opt-out=false');
  } finally { env.restore(); }
});

test('primary /api/track quando c\'è origin; nessun fallback se risponde ok', async () => {
  const env = install({ origin: 'https://www.volantinipro.it' });
  try {
    const { trackPageView } = await fresh();
    trackPageView('/');
    await wait();
    assert.ok(env.calls.every((c) => String(c.url).includes('/api/track')), 'tutte via /api/track');
    assert.ok(!env.calls.some((c) => String(c.url).includes('/rest/v1/site_events')), 'nessun fallback');
  } finally { env.restore(); }
});

test('fallback anon /rest/v1/site_events quando /api/track fallisce; header solo pubblici', async () => {
  const env = install({
    origin: 'https://www.volantinipro.it',
    fetchImpl: async (u, o) => {
      env.calls.push({ url: u, options: o });
      if (String(u).includes('/api/track')) return { ok: false, status: 503 };
      return { ok: true, status: 204 };
    },
  });
  try {
    const { trackPageView } = await fresh();
    trackPageView('/');
    await wait();
    const rest = env.calls.filter((c) => String(c.url).includes('/rest/v1/site_events'));
    assert.ok(rest.length >= 1, 'fallback eseguito');
    for (const c of rest) {
      const h = c.options.headers;
      assert.equal(h.apikey, 'sb_publishable_test_key_000');
      assert.equal(h.Authorization, 'Bearer sb_publishable_test_key_000');
      assert.deepEqual(Object.keys(h).map((x) => x.toLowerCase()).sort(), ['apikey', 'authorization', 'content-type', 'prefer']);
      // il body del fallback non porta geo
      const b = JSON.parse(c.options.body);
      assert.equal(b.country, undefined);
      assert.equal(b.city, undefined);
    }
  } finally { env.restore(); }
});

test('fire-and-forget: fetch che lancia non propaga', async () => {
  const env = install({ fetchImpl: async () => { throw new Error('down'); } });
  try {
    const m = await fresh();
    assert.doesNotThrow(() => m.trackPageView('/'));
    assert.doesNotThrow(() => m.trackQuoteStarted());
    assert.doesNotThrow(() => m.trackMunicipalitySelected({ municipality: 'x' }));
    assert.doesNotThrow(() => m.trackQuoteAbandoned(2));
    await wait();
  } finally { env.restore(); }
});

test('nuovi eventi: municipality/quantity/service/extras/step con metadata allowlist', async () => {
  const env = install();
  try {
    const m = await fresh();
    m.trackMunicipalitySelected({ municipality: 'Milano', province: 'MI', region: 'Lombardia' });
    m.trackQuantitySelected(20000);
    m.trackServiceSelected('Door to Door');
    m.trackExtrasSelected(['grafica', 'consegna certificata']);
    m.trackQuoteStepReached(3);
    await wait();
    const byName = Object.fromEntries(env.calls.map((c) => [body(c).event_name, body(c)]));
    assert.deepEqual(byName.municipality_selected.metadata, { municipality: 'Milano', province: 'MI', region: 'Lombardia' });
    assert.equal(byName.quantity_selected.metadata.quantity_bucket, '20-50k');
    assert.equal(byName.service_selected.metadata.service, 'Door to Door');
    assert.deepEqual(byName.extras_selected.metadata.extras, ['grafica', 'consegna certificata']);
    assert.equal(byName.quote_step_reached.metadata.step, 3);
    // device parse presente
    assert.equal(byName.quote_step_reached.device_type, 'desktop');
    assert.equal(byName.quote_step_reached.browser, 'Chrome');
  } finally { env.restore(); }
});

test('quote_step_reached: dedup per step; step fuori range ignorato', async () => {
  const env = install();
  try {
    const { trackQuoteStepReached } = await fresh();
    trackQuoteStepReached(2);
    trackQuoteStepReached(2);
    trackQuoteStepReached(7);
    await wait();
    const steps = env.calls.filter((c) => body(c).event_name === 'quote_step_reached');
    assert.equal(steps.length, 1);
    assert.equal(body(steps[0]).metadata.step, 2);
  } finally { env.restore(); }
});

test('visitor id: TTL 90 giorni — scaduto ⇒ rigenerato', async () => {
  const env = install();
  try {
    const m = await fresh();
    const id1 = m.getAnonymousVisitorId();
    assert.match(id1, /^[0-9a-f-]{36}$/);
    // forza scadenza
    global.window.localStorage.setItem('vp_anon_visitor', JSON.stringify({ id: id1, exp: Date.now() - 1000 }));
    const id2 = m.getAnonymousVisitorId();
    assert.notEqual(id2, id1, 'id scaduto ⇒ nuovo id');
    assert.equal(m.getAnonymousSessionId(), id2, 'alias di compatibilità');
  } finally { env.restore(); }
});
