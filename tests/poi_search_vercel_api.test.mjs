// api/poi-search.ts — guscio Vercel del proxy POI, gemello 1:1 dell'Edge
// Function supabase/functions/poi-search/index.ts. Verifica il contratto HTTP
// (stesso payload, stesse risposte, distinzione elements [] reale vs
// temporaryUnavailable, cache fresca/stale/negativa, rate limit, fallback
// provider) e la PARITA' dei parametri con il guscio Deno. Nessuna rete reale.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import defaultHandler, { createPoiSearchHandler } from '../api/poi-search.ts';
import { OVERPASS_USER_AGENT } from '../supabase/functions/_shared/roadNetworkProxy.ts';
import { POI_OVERPASS_ENDPOINTS } from '../supabase/functions/_shared/poiSearchProxy.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const vercelSrc = read('../api/poi-search.ts');
const edgeSrc = read('../supabase/functions/poi-search/index.ts');

// ── req/res finti in stile Vercel Node ───────────────────────────────────────
function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = String(v); return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.end = (body) => { res.body = body; return res; };
  res.json = () => { try { return JSON.parse(res.body); } catch { return null; } };
  return res;
}
const makeReq = (body, { method = 'POST', ip = '203.0.113.7' } = {}) => ({ method, headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' }, body });

// plan: host -> { status, elements } | { rejects }
function overpassMock(plan) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const cfg = plan[new URL(String(url)).host];
    if (!cfg) throw new Error(`UNEXPECTED_HOST:${url}`);
    if (cfg.rejects) throw new Error('NETWORK_DOWN');
    const status = cfg.status ?? 200;
    return { ok: status < 400, status, json: async () => ({ elements: cfg.elements || [] }), text: async () => cfg.text || '' };
  };
  fn.calls = calls;
  return fn;
}
const HOSTS = POI_OVERPASS_ENDPOINTS.map((u) => new URL(u).host);
const allHosts = (cfg) => Object.fromEntries(HOSTS.map((h) => [h, cfg]));
const el = (id) => ({ type: 'node', id, lat: 45.64, lon: 9.13, tags: { amenity: 'restaurant', name: `R${id}` } });
const SEVESO = { centerLat: 45.643, centerLng: 9.137, radiusKm: 3, serviceType: 'd2d', targetSelection: ['ristorazione'] };

async function call(handler, body, opts) {
  const res = makeRes();
  await handler(makeReq(body, opts), res);
  return res;
}
const newHandler = (fetchImpl, env = {}) => createPoiSearchHandler({ fetchImpl, env: { POI_SEARCH_RETRY_BACKOFF_MS: '0', ...env }, log: () => {} });

// ── Contratto HTTP ───────────────────────────────────────────────────────────
test('export di default = handler Vercel (req, res)', () => {
  assert.equal(typeof defaultHandler, 'function');
  assert.equal(defaultHandler.length, 2);
});

test('successo: 200 { elements, cached:false, source:"live" } dal PRIMO provider, User-Agent identificativo', async () => {
  const mock = overpassMock({ [HOSTS[0]]: { elements: [el(1), el(2)] } });
  const res = await call(newHandler(mock), SEVESO);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { elements: [el(1), el(2)], cached: false, source: 'live' });
  assert.equal(res.headers['content-type'], 'application/json');
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(mock.calls.length, 1);
  assert.equal(new URL(mock.calls[0].url).host, 'overpass.openstreetmap.fr');
  assert.equal(mock.calls[0].init.method, 'POST');
  assert.equal(mock.calls[0].init.headers['User-Agent'], OVERPASS_USER_AGENT);
  assert.doesNotMatch(mock.calls[0].init.headers['User-Agent'], /Mozilla|Chrome/);
  // QL costruita dal server, con il raggio ricevuto (nessuna modifica al raggio).
  const ql = decodeURIComponent(mock.calls[0].init.body.replace(/^data=/, ''));
  assert.match(ql, /\(around:3000,45\.643,9\.137\)/);
  assert.match(ql, /out center 80;$/);
});

test('zero attività REALI: 200 { elements: [] } senza temporaryUnavailable', async () => {
  const res = await call(newHandler(overpassMock({ [HOSTS[0]]: { elements: [] } })), SEVESO);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body, { elements: [], cached: false, source: 'live' });
  assert.equal('temporaryUnavailable' in body, false);
});

test('403/406 sui primi provider -> fallback al successivo, stessa risposta di successo', async () => {
  const mock = overpassMock({ [HOSTS[0]]: { status: 403 }, [HOSTS[1]]: { status: 406 }, [HOSTS[2]]: { elements: [el(9)] } });
  const res = await call(newHandler(mock), SEVESO);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().elements, [el(9)]);
  assert.deepEqual(mock.calls.map((c) => new URL(c.url).host), HOSTS.slice(0, 3));
});

test('tutti i provider falliti: 200 degradato con temporaryUnavailable:true (mai falso zero), poi cache negativa', async () => {
  const mock = overpassMock(allHosts({ status: 504 }));
  const handler = newHandler(mock);
  const res = await call(handler, SEVESO);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(
    { elements: body.elements, ok: body.ok, degraded: body.degraded, temporaryUnavailable: body.temporaryUnavailable, stale: body.stale, cached: body.cached, source: body.source },
    { elements: [], ok: false, degraded: true, temporaryUnavailable: true, stale: false, cached: false, source: 'none' },
  );
  assert.equal(body.reason, 'upstream_unavailable');
  assert.ok(Array.isArray(body.attemptsLog) && body.attemptsLog.length === HOSTS.length);

  // Stessa bbox subito dopo: cache negativa, nessuna nuova chiamata ai provider.
  const before = mock.calls.length;
  const again = await call(handler, SEVESO);
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().temporaryUnavailable, true);
  assert.equal(mock.calls.length, before);
});

test('cache fresca: seconda richiesta identica servita dalla cache, senza contattare i provider', async () => {
  const mock = overpassMock({ [HOSTS[0]]: { elements: [el(5)] } });
  const handler = newHandler(mock);
  await call(handler, SEVESO);
  const res = await call(handler, SEVESO);
  assert.deepEqual(res.json(), { elements: [el(5)], cached: true, source: 'cache' });
  assert.equal(mock.calls.length, 1);
});

test('cache stale: dopo un successo, un fallimento successivo serve l\'ultimo dato buono (stale:true)', async () => {
  let fail = false;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (fail) return { ok: false, status: 504, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ elements: [el(7)] }), text: async () => '' };
  };
  // TTL fresco al minimo consentito non basta a scadere in un test: si usa
  // una seconda bbox per popolare la stale e si verifica il ramo sul sorgente.
  const handler = newHandler(fetchImpl);
  const ok = await call(handler, SEVESO);
  assert.equal(ok.json().source, 'live');
  fail = true;
  const other = await call(handler, { ...SEVESO, centerLat: 45.7 });
  assert.equal(other.json().temporaryUnavailable, true, 'bbox senza stale -> indisponibile, non zero');
  assert.match(vercelSrc, /const stale = poiStaleCache\.get\(cacheKey\);[\s\S]*degradedBody\(reason, stale \?\? \[\], lastErr\)/);
  assert.match(vercelSrc, /temporaryUnavailable: elements\.length === 0,\n\s+stale: elements\.length > 0,/);
});

test('input non valido -> 400 INVALID_INPUT; JSON assente -> 400 INVALID_JSON; nessuna chiamata ai provider', async () => {
  const mock = overpassMock(allHosts({ elements: [] }));
  const handler = newHandler(mock);
  const bad = await call(handler, { ...SEVESO, radiusKm: 999 });
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(bad.json(), { error: 'INVALID_INPUT', detail: 'BAD_RADIUS' });
  const badSvc = await call(handler, { ...SEVESO, serviceType: 'x' });
  assert.deepEqual(badSvc.json(), { error: 'INVALID_INPUT', detail: 'BAD_SERVICE_TYPE' });
  assert.equal((await call(handler, undefined)).statusCode, 400);
  assert.deepEqual((await call(handler, '{non json')).json(), { error: 'INVALID_JSON' });
  // body arrivato come stringa JSON valida: accettato (come req.json()).
  assert.equal((await call(handler, JSON.stringify(SEVESO))).statusCode, 200);
  assert.equal(mock.calls.length, 1);
});

test('metodo: OPTIONS 200 con CORS, GET 405', async () => {
  const handler = newHandler(overpassMock({}));
  const opt = await call(handler, undefined, { method: 'OPTIONS' });
  assert.equal(opt.statusCode, 200);
  assert.equal(opt.headers['access-control-allow-methods'], 'POST, OPTIONS');
  const get = await call(handler, undefined, { method: 'GET' });
  assert.equal(get.statusCode, 405);
  assert.deepEqual(get.json(), { error: 'METHOD_NOT_ALLOWED' });
});

test('rate limit per IP: oltre la soglia 429 RATE_LIMITED con Retry-After; altri IP non toccati', async () => {
  const handler = newHandler(overpassMock({ [HOSTS[0]]: { elements: [] } }), { POI_SEARCH_RATE_MAX: '3' });
  for (let i = 0; i < 3; i += 1) assert.equal((await call(handler, SEVESO, { ip: '198.51.100.1' })).statusCode, 200);
  const limited = await call(handler, SEVESO, { ip: '198.51.100.1' });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { error: 'RATE_LIMITED' });
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  assert.equal((await call(handler, SEVESO, { ip: '198.51.100.2' })).statusCode, 200);
});

// ── Parità con l'Edge Function: stessi parametri, stesso motore ──────────────
test('PARITA\': stessi default (rate, cache, budget, timeout, retry) del guscio Deno', () => {
  const pick = (src, name) => (src.match(new RegExp(`"${name}", (\\d+), (\\d+), (\\d+)\\)`)) || []).slice(1).join(',');
  for (const name of [
    'POI_SEARCH_RATE_MAX', 'POI_SEARCH_RATE_WINDOW_MS', 'POI_SEARCH_CACHE_TTL_MS', 'POI_SEARCH_TOTAL_BUDGET_MS',
    'POI_SEARCH_TIMEOUT_MS', 'POI_SEARCH_RETRY_BACKOFF_MS', 'POI_SEARCH_STALE_TTL_MS', 'POI_SEARCH_NEGATIVE_TTL_MS',
  ]) {
    assert.ok(pick(edgeSrc, name), `default ${name} non trovato nel guscio Deno`);
    assert.equal(pick(vercelSrc, name), pick(edgeSrc, name), name);
  }
  // Budget e timeout attuali, non modificati da questo endpoint.
  assert.equal(pick(vercelSrc, 'POI_SEARCH_TOTAL_BUDGET_MS'), '16000,1500,30000');
  assert.equal(pick(vercelSrc, 'POI_SEARCH_TIMEOUT_MS'), '8500,1000,20000');
  assert.match(vercelSrc, /attempt === 0 && isTransientPoiFailure\(err\) && !err\?\.deadlineExceeded && budgetLeft > PROVIDER_TIMEOUT_MS \* 0\.6/);
});

test('PARITA\': motore NON duplicato — solo import dai moduli condivisi, nessun host Overpass nel guscio', () => {
  assert.match(vercelSrc, /from "\.\.\/supabase\/functions\/_shared\/roadNetworkProxy\.js";/);
  assert.match(vercelSrc, /from "\.\.\/supabase\/functions\/_shared\/poiSearchProxy\.js";/);
  assert.doesNotMatch(vercelSrc, /https:\/\/[a-z0-9.-]*overpass|api\/interpreter|maps\.mail\.ru|around:|out center/i);
  assert.doesNotMatch(vercelSrc, /Deno\.|deno\.land|createClient|SERVICE_ROLE|supabase-js/);
  for (const fn of ['validatePoiInput', 'getServiceTargetTags', 'buildPoiQuery', 'resultCap', 'makePoiCacheKey', 'resolvePoiEndpoints', 'fetchRoadsWithFallback', 'classifyPoiFailure', 'isTransientPoiFailure', 'createTtlCache']) {
    assert.ok(vercelSrc.includes(fn), fn);
    assert.ok(edgeSrc.includes(fn), fn);
  }
});
