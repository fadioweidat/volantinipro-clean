// Analytics must never leave a local development session: neither the
// /api/track call nor the anon site_events fallback.
import assert from 'node:assert/strict';
import test from 'node:test';

function makeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), clear: () => map.clear() };
}

function install(hostname) {
  const saved = { window: global.window, fetch: global.fetch, url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY };
  const calls = [];
  global.window = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    location: { origin: `http://${hostname}:5173`, hostname, pathname: '/', search: '' },
  };
  // Both paths fail/404 so a non-blocked dispatch would reach the site_events fallback too.
  global.fetch = async (u, o) => { calls.push({ url: String(u), method: o?.method }); return { ok: false, status: 404 }; };
  process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_test_key_000';
  return {
    calls,
    restore() {
      global.window = saved.window; global.fetch = saved.fetch;
      if (saved.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = saved.url;
      if (saved.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = saved.key;
    },
  };
}
const fresh = () => import(`../src/lib/analytics/siteEvents.js?t=${Date.now()}-${Math.random()}`);
const wait = () => new Promise((r) => setTimeout(r, 10));

test('isLocalAnalyticsContext: DEV build or local hostnames are local', async () => {
  const { isLocalAnalyticsContext } = await fresh();
  assert.equal(isLocalAnalyticsContext({ dev: true, hostname: 'www.volantinipro.it' }), true);
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'LOCALHOST']) {
    assert.equal(isLocalAnalyticsContext({ dev: false, hostname }), true, hostname);
  }
  for (const hostname of ['www.volantinipro.it', 'volantinipro.vercel.app', '']) {
    assert.equal(isLocalAnalyticsContext({ dev: false, hostname }), false, hostname || '(empty)');
  }
});

for (const hostname of ['localhost', '127.0.0.1']) {
  test(`${hostname}: no /api/track and no site_events fallback`, async () => {
    const env = install(hostname);
    try {
      const mod = await fresh();
      mod.trackPageView('/');
      mod.trackQuoteStarted();
      mod.trackMunicipalitySelected({ municipality: 'Cormano' });
      mod.trackQuoteCompleted({ municipality: 'Cormano', quantity: 5000, service: 'd2d' });
      await wait();
      assert.deepEqual(env.calls, [], 'zero network calls from a local host');
    } finally { env.restore(); }
  });
}

test('public host still sends (guard does not disable production tracking)', async () => {
  const env = install('www.volantinipro.it');
  try {
    const mod = await fresh();
    mod.trackPageView('/');
    await wait();
    assert.ok(env.calls.some((c) => c.url.endsWith('/api/track')), 'primary /api/track attempted');
    assert.ok(env.calls.some((c) => c.url.includes('/rest/v1/site_events')), 'fallback still available in production');
  } finally { env.restore(); }
});
