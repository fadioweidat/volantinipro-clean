// Analytics Visitatori — classificazione del traffico (bot/test/preview/
// admin/internal/public/unknown) + filtro dashboard.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyTrafficRow, classesForFilter, originKindFromHost, isBotUserAgent,
  hostFromOrigin, TRAFFIC_FILTERS, TRAFFIC_CLASS_ORDER, ORIGIN_KINDS,
} from '../src/lib/analytics/trafficClass.js';
import { computeAnalytics } from '../src/lib/analytics/analyticsAggregate.js';
import { sanitizeMetadata, METADATA_ALLOWED_KEYS } from '../src/lib/analytics/eventSchema.js';

const V = '11111111-1111-4111-8111-111111111111';
const row = (over = {}) => ({
  event_name: 'page_view', created_at: new Date().toISOString(),
  anonymous_session_id: V, session_id: V, path: '/', device_type: 'desktop',
  metadata: {}, ...over,
});

// ── ordine / costanti ──────────────────────────────────────────────────────
test('ordine di precedenza esplicito bot>test>preview>admin>internal>public>unknown', () => {
  assert.deepEqual([...TRAFFIC_CLASS_ORDER], ['bot', 'test', 'preview', 'admin', 'internal', 'public', 'unknown']);
  assert.deepEqual([...ORIGIN_KINDS], ['public', 'test', 'preview', 'unknown']);
});

// ── classifyTrafficRow ─────────────────────────────────────────────────────
test('HeadlessChrome / device_type=bot -> bot (anche su path admin, anche con origin_kind)', () => {
  assert.equal(classifyTrafficRow(row({ device_type: 'bot' })), 'bot');
  assert.equal(classifyTrafficRow(row({ device_type: 'bot', path: '/admin/status' })), 'bot');
  assert.equal(classifyTrafficRow(row({ device_type: 'bot', metadata: { origin_kind: 'public' } })), 'bot');
});

test('localhost / 127.0.0.1 (origin_kind=test) -> test, prima di admin', () => {
  assert.equal(classifyTrafficRow(row({ metadata: { origin_kind: 'test' } })), 'test');
  assert.equal(classifyTrafficRow(row({ path: '/admin/live', metadata: { origin_kind: 'test' } })), 'test');
});

test('preview Vercel (origin_kind=preview) -> preview, prima di admin', () => {
  assert.equal(classifyTrafficRow(row({ metadata: { origin_kind: 'preview' } })), 'preview');
  assert.equal(classifyTrafficRow(row({ path: '/admin', metadata: { origin_kind: 'preview' } })), 'preview');
});

test('/admin/* -> admin', () => {
  assert.equal(classifyTrafficRow(row({ path: '/admin' })), 'admin');
  assert.equal(classifyTrafficRow(row({ path: '/admin/campaigns/abc/gps' })), 'admin');
  assert.equal(classifyTrafficRow(row({ path: '/admin', metadata: { origin_kind: 'public' } })), 'admin');
});

test('/driver/* e /office/* -> internal', () => {
  assert.equal(classifyTrafficRow(row({ path: '/driver' })), 'internal');
  assert.equal(classifyTrafficRow(row({ path: '/driver/assignment/xyz' })), 'internal');
  assert.equal(classifyTrafficRow(row({ path: '/office' })), 'internal');
  assert.equal(classifyTrafficRow(row({ path: '/office/tools' })), 'internal');
});

test('percorsi NON internal: /login /auth/callback /dashboard /supplier -> public (se production)', () => {
  for (const p of ['/login', '/auth/callback', '/dashboard', '/supplier', '/supplier/quotes', '/preventivo', '/configuratore', '/']) {
    assert.equal(classifyTrafficRow(row({ path: p, metadata: { origin_kind: 'public' } })), 'public', p);
  }
});

test('www.volantinipro.it production (origin_kind=public) -> public', () => {
  assert.equal(classifyTrafficRow(row({ path: '/', metadata: { origin_kind: 'public' } })), 'public');
});

test('legacy: nessun origin_kind + path pubblico normale -> public', () => {
  assert.equal(classifyTrafficRow(row({ path: '/', metadata: {} })), 'public');
  assert.equal(classifyTrafficRow(row({ path: '/preventivo', metadata: undefined })), 'public');
  assert.equal(classifyTrafficRow(row({ path: '/', metadata: null })), 'public');
});

test('legacy: nessun origin_kind + device bot -> bot; + /admin -> admin; + /driver -> internal', () => {
  assert.equal(classifyTrafficRow(row({ path: '/x', device_type: 'bot', metadata: {} })), 'bot');
  assert.equal(classifyTrafficRow(row({ path: '/admin/x', metadata: {} })), 'admin');
  assert.equal(classifyTrafficRow(row({ path: '/driver/x', metadata: {} })), 'internal');
});

test('legacy path NULL: eventi di funnel -> public; ogni altro evento -> unknown', () => {
  // origin_kind esplicito / riga malformata
  assert.equal(classifyTrafficRow(row({ path: '/', metadata: { origin_kind: 'unknown' } })), 'unknown');
  assert.equal(classifyTrafficRow(null), 'unknown');
  assert.equal(classifyTrafficRow('nope'), 'unknown');
  // eventi di funnel/business con path NULL -> public legacy
  for (const en of ['quote_started', 'quote_completed', 'municipality_selected', 'quantity_selected',
    'service_selected', 'extras_selected', 'quote_step_reached', 'quote_abandoned']) {
    assert.equal(classifyTrafficRow(row({ event_name: en, path: null, metadata: {} })), 'public', en);
  }
  // ogni altro evento senza path -> unknown
  for (const en of ['page_view', 'session_started', 'consultation_requested']) {
    assert.equal(classifyTrafficRow(row({ event_name: en, path: null, metadata: {} })), 'unknown', en);
  }
  // con path presente resta public; bot resta bot; /admin resta admin
  assert.equal(classifyTrafficRow(row({ event_name: 'page_view', path: '/', metadata: {} })), 'public');
  assert.equal(classifyTrafficRow(row({ path: null, device_type: 'bot', metadata: {} })), 'bot');
  assert.equal(classifyTrafficRow(row({ event_name: 'page_view', path: '/admin', metadata: {} })), 'admin');
});

// ── originKindFromHost (usato da /api/track) ───────────────────────────────
test('originKindFromHost: production/localhost/preview/unknown', () => {
  assert.equal(originKindFromHost('https://www.volantinipro.it'), 'public');
  assert.equal(originKindFromHost('https://volantinipro.it/preventivo'), 'public');
  assert.equal(originKindFromHost('http://localhost:5173'), 'test');
  assert.equal(originKindFromHost('http://127.0.0.1:4173/'), 'test');
  assert.equal(originKindFromHost('http://[::1]:3000'), 'test');
  assert.equal(originKindFromHost('https://volantinipro-git-feature-team.vercel.app'), 'preview');
  assert.equal(originKindFromHost('https://some-random-domain.example'), 'unknown');
  assert.equal(originKindFromHost(null), 'unknown');
  assert.equal(originKindFromHost(''), 'unknown');
});

test('hostFromOrigin: URL o host nudo', () => {
  assert.equal(hostFromOrigin('https://www.volantinipro.it/x?y=1'), 'volantinipro.it');
  assert.equal(hostFromOrigin('localhost:5173'), 'localhost');
  assert.equal(hostFromOrigin('WWW.Volantinipro.IT'), 'volantinipro.it');
});

test('isBotUserAgent: headless/automation/crawler', () => {
  assert.equal(isBotUserAgent('Mozilla/5.0 (X11) HeadlessChrome/120.0'), true);
  assert.equal(isBotUserAgent('Playwright/1.4'), true);
  assert.equal(isBotUserAgent('puppeteer'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 Chrome-Lighthouse'), true);
  assert.equal(isBotUserAgent('curl/8.1'), true);
  assert.equal(isBotUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Safari/605'), false);
});

// ── metadata allowlist ────────────────────────────────────────────────────
test('sanitizeMetadata: origin_kind ammesso solo se enum valido', () => {
  assert.ok(METADATA_ALLOWED_KEYS.includes('origin_kind'));
  assert.deepEqual(sanitizeMetadata({ origin_kind: 'preview' }), { origin_kind: 'preview' });
  assert.deepEqual(sanitizeMetadata({ origin_kind: 'PUBLIC' }), { origin_kind: 'public' });
  assert.deepEqual(sanitizeMetadata({ origin_kind: 'garbage' }), {});
  assert.deepEqual(sanitizeMetadata({ origin_kind: 'https://evil.example/leak' }), {});
});

// ── classesForFilter ──────────────────────────────────────────────────────
test('classesForFilter: Pubblico=solo public, Tutto=null, Bot/Test={bot,test,preview}, Admin/Internal={admin,internal}', () => {
  assert.deepEqual([...classesForFilter(TRAFFIC_FILTERS.PUBLIC)], ['public']);
  assert.equal(classesForFilter(TRAFFIC_FILTERS.ALL), null);
  assert.deepEqual([...classesForFilter(TRAFFIC_FILTERS.BOT_TEST)].sort(), ['bot', 'preview', 'test']);
  assert.deepEqual([...classesForFilter(TRAFFIC_FILTERS.ADMIN_INTERNAL)].sort(), ['admin', 'internal']);
  // default = public
  assert.deepEqual([...classesForFilter(undefined)], ['public']);
});

// ── computeAnalytics: il filtro agisce PRIMA dell'aggregazione ─────────────
function mixedRows(now) {
  const at = (minAgo, over) => row({ created_at: new Date(now.getTime() - minAgo * 60000).toISOString(), ...over });
  return [
    // 2 visitatori pubblici reali, 1 con quote completata
    at(10, { anonymous_session_id: 'p1', session_id: 'p1', path: '/', metadata: { origin_kind: 'public' } }),
    at(9, { anonymous_session_id: 'p1', session_id: 'p1', event_name: 'quote_started', path: '/configuratore', metadata: { origin_kind: 'public' } }),
    at(8, { anonymous_session_id: 'p1', session_id: 'p1', event_name: 'quote_completed', path: '/configuratore', metadata: { origin_kind: 'public', step: 4 } }),
    at(7, { anonymous_session_id: 'p2', session_id: 'p2', path: '/preventivo', metadata: { origin_kind: 'public' } }),
    // admin
    at(6, { anonymous_session_id: 'a1', session_id: 'a1', path: '/admin', metadata: { origin_kind: 'public' } }),
    at(5, { anonymous_session_id: 'a1', session_id: 'a1', path: '/admin/status', metadata: { origin_kind: 'public' } }),
    // bot
    at(4, { anonymous_session_id: 'b1', session_id: 'b1', device_type: 'bot', path: '/' }),
    // test (localhost)
    at(3, { anonymous_session_id: 't1', session_id: 't1', path: '/configuratore', event_name: 'quote_started', metadata: { origin_kind: 'test' } }),
    // internal
    at(2, { anonymous_session_id: 'i1', session_id: 'i1', path: '/driver/assignment/x', metadata: { origin_kind: 'public' } }),
    // unknown (ingestion senza header host determinabile)
    at(1, { anonymous_session_id: 'u1', session_id: 'u1', path: '/', metadata: { origin_kind: 'unknown' } }),
  ];
}

test('default (Pubblico): KPI contano SOLO le righe public', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const d = computeAnalytics(mixedRows(now), { now, rangeDays: 7 });
  assert.equal(d.trafficClass, 'public');
  assert.equal(d.overview.uniqueVisitors, 2);      // p1, p2
  assert.equal(d.overview.quotesStarted, 1);       // solo p1 (t1 è test)
  assert.equal(d.overview.quotesCompleted, 1);     // p1
  assert.equal(d.overview.pageViews, 2);           // p1 '/', p2 '/preventivo'
  // indicatore "traffico escluso" calcolato su TUTTA la finestra
  assert.equal(d.excluded.botTest, 2);             // b1 + t1
  assert.equal(d.excluded.adminInternal, 3);       // a1 x2 + i1
  assert.equal(d.excluded.unclassified, 1);        // u1
});

test('funnel PUBLIC esclude eventi non-public', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const d = computeAnalytics(mixedRows(now), { now, rangeDays: 7 });
  const stage = (k) => d.funnel.find((s) => s.key === k).sessions;
  // p1 (quote_started) + p2 (/preventivo page_view). t1 ha quote_started ma è
  // 'test' → escluso PRIMA dell'aggregazione, non entra nel funnel.
  assert.equal(stage('quote'), 2);
  assert.equal(stage('completed'), 1);   // solo p1

});

test('filtro "Tutto" include ogni evento', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const all = computeAnalytics(mixedRows(now), { now, rangeDays: 7, trafficClass: 'all' });
  // 7 visitor id distinti: p1, p2, a1, b1, t1, i1, u1
  assert.equal(all.overview.uniqueVisitors, 7);
  assert.equal(all.overview.quotesStarted, 2);     // p1 + t1
  assert.equal(all.overview.pageViews, 7);         // p1, p2, a1x2, b1, i1, u1
});

test('filtro Bot/Test isola bot+test+preview; Admin/Internal isola admin+internal', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const bt = computeAnalytics(mixedRows(now), { now, rangeDays: 7, trafficClass: 'bot_test' });
  assert.equal(bt.overview.uniqueVisitors, 2);     // b1, t1
  const ai = computeAnalytics(mixedRows(now), { now, rangeDays: 7, trafficClass: 'admin_internal' });
  assert.equal(ai.overview.uniqueVisitors, 2);     // a1, i1
});
