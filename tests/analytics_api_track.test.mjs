// Analytics Visitatori — endpoint /api/track (Vercel function).
import assert from 'node:assert/strict';
import test from 'node:test';

const V = '11111111-1111-4111-8111-111111111111';

function mockRes() {
  const r = { statusCode: null, headers: {}, ended: false, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.end = (b) => { r.ended = true; r.body = b; return r; };
  return r;
}
const fresh = () => import(`../api/track.js?t=${Date.now()}-${Math.random()}`);

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}

test('method gating: GET → 405, OPTIONS → 204', async () => {
  const { default: handler } = await fresh();
  let res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  res = mockRes();
  await handler({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.statusCode, 204);
});

test('payload invalido → 400 / 422, mai eccezione', async () => {
  const { default: handler } = await fresh();
  let res = mockRes();
  await handler({ method: 'POST', headers: {}, body: 'not-json' }, res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { event_name: 'nope', anonymous_session_id: V } }, res);
  assert.equal(res.statusCode, 422);
});

test('non configurato (nessun service role) → 503 (il client farà fallback)', async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: null, SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_URL: null }, async () => {
    const { default: handler } = await fresh();
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { event_name: 'page_view', anonymous_session_id: V } }, res);
    assert.equal(res.statusCode, 503);
  });
});

test('inserisce con service role + geo dagli header Vercel, MAI l\'IP', async () => {
  const savedFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 204 }; };
  try {
    await withEnv({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_service_role_key_xyz', SUPABASE_URL: 'https://proj.supabase.co' }, async () => {
      const { default: handler } = await fresh();
      const res = mockRes();
      await handler({
        method: 'POST',
        headers: {
          'x-vercel-ip-country': 'it',
          'x-vercel-ip-country-region': '25',
          'x-vercel-ip-city': 'Cinisello%20Balsamo',
          'x-forwarded-for': '203.0.113.55',
          'user-agent': 'Mozilla/5.0 Chrome/120',
        },
        body: { event_name: 'municipality_selected', anonymous_session_id: V, session_id: V, path: '/preventivo', metadata: { municipality: 'Milano', email: 'x@y.it' } },
      }, res);
      assert.equal(res.statusCode, 204);
      assert.ok(captured, 'insert eseguito');
      assert.match(captured.url, /\/rest\/v1\/site_events$/);
      assert.equal(captured.opts.headers.apikey, 'sb_secret_service_role_key_xyz');
      const inserted = JSON.parse(captured.opts.body);
      assert.equal(inserted.country, 'IT');
      assert.equal(inserted.region, 'Lombardia'); // prettyRegion(25)
      assert.equal(inserted.city, 'Cinisello Balsamo');
      assert.equal(inserted.metadata.municipality, 'Milano');
      assert.equal(inserted.metadata.email, undefined);
      // MAI l'IP nella riga inserita
      assert.doesNotMatch(captured.opts.body, /203\.0\.113\.55/);
    });
  } finally {
    global.fetch = savedFetch;
  }
});

test('rate limit: oltre soglia → 429', async () => {
  const savedFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 204 });
  try {
    await withEnv({ SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL: 'https://x.supabase.co' }, async () => {
      const { default: handler } = await fresh();
      const headers = { 'x-forwarded-for': '9.9.9.9', 'user-agent': 'ua' };
      let last = 0;
      for (let i = 0; i < 65; i += 1) {
        const res = mockRes();
        await handler({ method: 'POST', headers, body: { event_name: 'page_view', anonymous_session_id: V } }, res);
        last = res.statusCode;
      }
      assert.equal(last, 429, 'dopo 60/min → 429');
    });
  } finally {
    global.fetch = savedFetch;
  }
});
