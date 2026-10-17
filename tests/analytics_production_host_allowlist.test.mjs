// Analytics leave ONLY the production site (allowlist). Every other host —
// localhost, IPs, *.vercel.app previews, unknown domains — sends nothing:
// neither /api/track nor the anon site_events fallback.
import assert from 'node:assert/strict';
import test from 'node:test';

function makeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), clear: () => map.clear() };
}

function install(hostname, protocol = 'https') {
  const saved = { window: global.window, fetch: global.fetch, url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY };
  const calls = [];
  global.window = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    location: { origin: `${protocol}://${hostname}`, hostname, pathname: '/', search: '' },
  };
  // /api/track fails so a permitted dispatch also exercises the site_events fallback.
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
const fireAll = (mod) => {
  mod.trackPageView('/');
  mod.trackQuoteStarted();
  mod.trackMunicipalitySelected({ municipality: 'Cormano' });
  mod.trackQuoteCompleted({ municipality: 'Cormano', quantity: 5000, service: 'd2d' });
};

test('isAnalyticsAllowed: only the production hosts, never a DEV build', async () => {
  const { isAnalyticsAllowed, ANALYTICS_PRODUCTION_HOSTS } = await fresh();
  assert.deepEqual([...ANALYTICS_PRODUCTION_HOSTS], ['www.volantinipro.it', 'volantinipro.it']);
  for (const hostname of ['www.volantinipro.it', 'volantinipro.it', 'WWW.VolantiniPro.IT', 'www.volantinipro.it.']) {
    assert.equal(isAnalyticsAllowed({ dev: false, hostname }), true, hostname);
  }
  assert.equal(isAnalyticsAllowed({ dev: true, hostname: 'www.volantinipro.it' }), false, 'DEV build never sends');
  for (const hostname of [
    'localhost', '127.0.0.1', '[::1]', 'app.localhost', '192.168.1.20',
    'volantinipro-git-feat-homepa-994a3b-fenicesp-gmailcoms-projects.vercel.app',
    'volantinipro-n4utccksr-fenicesp-gmailcoms-projects.vercel.app',
    'volantinipro.vercel.app', 'staging.volantinipro.it', 'volantinipro.it.evil.com', 'evilvolantinipro.it', '',
  ]) {
    assert.equal(isAnalyticsAllowed({ dev: false, hostname }), false, hostname || '(empty)');
  }
});

for (const host of ['www.volantinipro.it', 'volantinipro.it']) {
  test(`${host}: events are sent (/api/track, then site_events fallback)`, async () => {
    const env = install(host);
    try {
      const mod = await fresh();
      mod.trackPageView('/');
      await wait();
      assert.ok(env.calls.some((c) => c.url === `https://${host}/api/track` && c.method === 'POST'), 'primary /api/track');
      assert.ok(env.calls.some((c) => c.url === 'https://proj.supabase.co/rest/v1/site_events' && c.method === 'POST'), 'site_events fallback');
    } finally { env.restore(); }
  });
}

for (const [host, protocol] of [
  ['localhost', 'http'],
  ['127.0.0.1', 'http'],
  ['volantinipro-git-feat-homepa-994a3b-fenicesp-gmailcoms-projects.vercel.app', 'https'],
  ['volantinipro-n4utccksr-fenicesp-gmailcoms-projects.vercel.app', 'https'],
  ['192.168.1.20', 'http'],
]) {
  test(`${host}: zero network calls (no /api/track, no site_events)`, async () => {
    const env = install(host, protocol);
    try {
      const mod = await fresh();
      fireAll(mod);
      await wait();
      assert.deepEqual(env.calls, []);
    } finally { env.restore(); }
  });
}
