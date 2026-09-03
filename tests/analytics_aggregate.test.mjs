// Analytics Visitatori — aggregazione dashboard (PURA).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAnalytics, FUNNEL_STAGES } from '../src/lib/analytics/analyticsAggregate.js';

const NOW = new Date('2026-08-31T18:00:00.000Z');
const T = (h = 12, dayOffset = 0) => new Date(NOW.getTime() - dayOffset * 86400000).toISOString().replace(/T\d\d/, `T${String(h).padStart(2, '0')}`);

function ev(event_name, o = {}) {
  return {
    event_name, created_at: o.at || T(12, 0),
    // session_id: se la chiave `s` e presente si usa il suo valore (anche null,
    // per simulare gli eventi storici pre-FASE 2); altrimenti default al visitor.
    anonymous_session_id: o.v || 'v1', session_id: 's' in o ? o.s : (o.v || 'v1'),
    path: o.path ?? null, referrer_host: o.rh ?? null, referrer_type: o.rt ?? null,
    utm_source: o.utm ?? null, utm_medium: o.utm_medium ?? null,
    country: o.country ?? null, region: o.region ?? null, city: o.city ?? null,
    device_type: o.device ?? null, browser: o.browser ?? null, os: o.os ?? null,
    metadata: o.meta || {},
  };
}

test('overview: visitatori unici, sessioni, page views, conversione', () => {
  const rows = [
    ev('session_started', { v: 'a' }), ev('page_view', { v: 'a', path: '/' }),
    ev('session_started', { v: 'b' }), ev('page_view', { v: 'b', path: '/preventivo' }),
    ev('quote_started', { v: 'a' }), ev('quote_started', { v: 'b' }),
    ev('quote_completed', { v: 'a' }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.equal(r.overview.uniqueVisitors, 2);
  assert.equal(r.overview.sessions, 2);
  assert.equal(r.overview.pageViews, 2);
  assert.equal(r.overview.quotesStarted, 2);
  assert.equal(r.overview.quotesCompleted, 1);
  assert.equal(r.overview.conversionRate, 50);
  assert.equal(r.overview.visitorsToday, 2);
});

test('sessioni = session_id distinti (NON conteggio session_started); visitor persistente su piu sessioni', () => {
  const rows = [
    ev('session_started', { v: 'A', s: 's1' }),
    ev('page_view', { v: 'A', s: 's1', path: '/' }),
    ev('session_started', { v: 'A', s: 's2' }),
    ev('page_view', { v: 'A', s: 's2', path: '/preventivo' }),
    ev('quote_started', { v: 'A', s: 's2' }),
    ev('municipality_selected', { v: 'A', s: 's2', meta: { municipality: 'Milano' } }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.equal(r.overview.uniqueVisitors, 1);
  assert.equal(r.overview.sessions, 2);
  assert.equal(r.daily.reduce((s, d) => s + d.sessions, 0), 2);
});

test('fallback storico: session_id NULL -> session_uid = anonymous_session_id', () => {
  const rows = [
    ev('page_view', { v: 'A', s: null, path: '/' }),
    ev('session_started', { v: 'A', s: null }),
    ev('page_view', { v: 'B', s: null, path: '/' }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.equal(r.overview.uniqueVisitors, 2);
  assert.equal(r.overview.sessions, 2); // A e B, via fallback al visitor id
});

test('una sola sessione con molti eventi resta 1', () => {
  const rows = [
    ev('session_started', { v: 'A', s: 's1' }),
    ev('page_view', { v: 'A', s: 's1', path: '/' }),
    ev('page_view', { v: 'A', s: 's1', path: '/preventivo' }),
    ev('quote_started', { v: 'A', s: 's1' }),
    ev('quantity_selected', { v: 'A', s: 's1', meta: { quantity_bucket: '10-20k' } }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.equal(r.overview.uniqueVisitors, 1);
  assert.equal(r.overview.sessions, 1);
});

test('VERIFICA DIVERGENZA: stessa definizione VISITOR/SESSION del rollup SQL', () => {
  // VISITOR  = distinct anonymous_session_id
  // SESSION  = distinct coalesce(session_id, anonymous_session_id)
  const rows = [
    ev('page_view', { v: 'A', s: 's1', path: '/' }),
    ev('page_view', { v: 'A', s: 's2', path: '/' }),
    ev('page_view', { v: 'B', s: null, path: '/' }),
    ev('page_view', { v: 'C', s: 's3', path: '/' }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  const visitorRef = new Set(rows.map((x) => x.anonymous_session_id)).size;
  const sessionRef = new Set(rows.map((x) => x.session_id || x.anonymous_session_id)).size;
  assert.equal(r.overview.uniqueVisitors, visitorRef); // 3
  assert.equal(r.overview.sessions, sessionRef); // s1,s2,B,s3 = 4
});

test('geografia: top cities per visitatori distinti, con %', () => {
  const rows = [
    ev('page_view', { v: 'a', path: '/', country: 'IT', region: 'Lombardia', city: 'Milano' }),
    ev('page_view', { v: 'a', path: '/', country: 'IT', region: 'Lombardia', city: 'Milano' }),
    ev('page_view', { v: 'b', path: '/', country: 'IT', region: 'Lombardia', city: 'Milano' }),
    ev('page_view', { v: 'c', path: '/', country: 'IT', region: 'Lombardia', city: 'Monza' }),
    ev('page_view', { v: 'd', path: '/', country: 'IT', region: 'Lazio', city: 'Roma' }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.deepEqual(r.geography.cities.map((c) => [c.key, c.count]), [['Milano', 2], ['Monza', 1], ['Roma', 1]]);
  assert.equal(r.geography.cities[0].pct, 50);
  assert.equal(r.geography.countries[0].key, 'IT');
  assert.equal(r.geography.countries[0].count, 4);
});

test('sorgenti: UTM prevale, referrer classificato, direct fallback', () => {
  const rows = [
    ev('page_view', { v: 'a', path: '/', utm: 'newsletter', utm_medium: 'email' }),
    ev('page_view', { v: 'b', path: '/', rh: 'google.com', rt: 'organic' }),
    ev('page_view', { v: 'c', path: '/', rh: 'l.instagram.com', rt: 'social' }),
    ev('page_view', { v: 'd', path: '/' }),
    ev('page_view', { v: 'e', path: '/' }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  const bySource = Object.fromEntries(r.sources.map((s) => [s.source, s.visitors]));
  assert.equal(bySource.newsletter, 1);
  assert.equal(bySource.google, 1);
  assert.equal(bySource.instagram, 1);
  assert.equal(bySource.direct, 2);
  assert.equal(r.sources.find((s) => s.source === 'direct').pct, 40);
});

test('pagine: conteggio page_view per path', () => {
  const rows = [
    ev('page_view', { v: 'a', path: '/' }), ev('page_view', { v: 'b', path: '/' }),
    ev('page_view', { v: 'a', path: '/preventivo' }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.deepEqual(r.pages.map((p) => [p.key, p.count]), [['/', 2], ['/preventivo', 1]]);
});

test('funnel: 7 stadi, sessioni distinte, drop-off per step', () => {
  const rows = [];
  // 10 sessioni homepage
  for (let i = 0; i < 10; i += 1) rows.push(ev('page_view', { v: `s${i}`, s: `s${i}`, path: '/' }));
  // 6 arrivano al preventivo
  for (let i = 0; i < 6; i += 1) rows.push(ev('quote_started', { v: `s${i}`, s: `s${i}` }));
  // 4 selezionano comune
  for (let i = 0; i < 4; i += 1) rows.push(ev('municipality_selected', { v: `s${i}`, s: `s${i}`, meta: { municipality: 'Milano', province: 'MI' } }));
  // 3 quantità
  for (let i = 0; i < 3; i += 1) rows.push(ev('quantity_selected', { v: `s${i}`, s: `s${i}`, meta: { quantity_bucket: '10-20k' } }));
  // 2 step3, 2 step4
  for (let i = 0; i < 2; i += 1) rows.push(ev('quote_step_reached', { v: `s${i}`, s: `s${i}`, meta: { step: 3 } }));
  for (let i = 0; i < 2; i += 1) rows.push(ev('quote_step_reached', { v: `s${i}`, s: `s${i}`, meta: { step: 4 } }));
  // 1 completa
  rows.push(ev('quote_completed', { v: 's0', s: 's0', meta: { municipality: 'Milano' } }));

  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.deepEqual(r.funnel.map((f) => f.key), FUNNEL_STAGES.map((s) => s.key));
  assert.deepEqual(r.funnel.map((f) => f.sessions), [10, 6, 4, 3, 2, 2, 1]);
  assert.equal(r.funnel[1].dropoffPct, 40); // 10 -> 6
  assert.equal(r.funnel[2].dropoffPct, 33.3); // 6 -> 4
  assert.equal(r.funnel[6].ofTotalPct, 10); // 1 / 10
});

test('domanda commerciale: comuni/province/bucket/servizi/extra + conversione per comune', () => {
  const rows = [
    ev('municipality_selected', { v: 'a', meta: { municipality: 'Milano', province: 'MI' } }),
    ev('municipality_selected', { v: 'b', meta: { municipality: 'Milano', province: 'MI' } }),
    ev('municipality_selected', { v: 'c', meta: { municipality: 'Monza', province: 'MB' } }),
    ev('quantity_selected', { v: 'a', meta: { quantity_bucket: '10-20k' } }),
    ev('quantity_selected', { v: 'b', meta: { quantity_bucket: '20-50k' } }),
    ev('service_selected', { v: 'a', meta: { service: 'Door to Door' } }),
    ev('service_selected', { v: 'b', meta: { service: 'Door to Door' } }),
    ev('extras_selected', { v: 'a', meta: { extras: ['grafica', 'consegna certificata'] } }),
    ev('quote_completed', { v: 'a', meta: { municipality: 'Milano', service: 'Door to Door', quantity_bucket: '10-20k' } }),
  ];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.equal(r.commercial.municipalities[0].key, 'Milano');
  assert.equal(r.commercial.municipalities[0].count, 2);
  assert.equal(r.commercial.provinces[0].key, 'MI');
  assert.equal(r.commercial.services[0].label, 'Door to Door');
  assert.ok(r.commercial.quantityMedianBucket);
  const milanoConv = r.commercial.conversionByMunicipality.find((m) => m.name === 'Milano');
  assert.equal(milanoConv.started, 2);
  assert.equal(milanoConv.completed, 1);
  assert.equal(milanoConv.rate, 50);
});

test('range: eventi fuori finestra esclusi; hasAnyData distingue vuoto', () => {
  const rows = [ev('page_view', { v: 'a', path: '/', at: T(12, 20) })]; // 20 giorni fa
  const r7 = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  assert.equal(r7.overview.pageViews, 0);
  assert.equal(r7.hasAnyData, true);
  const r30 = computeAnalytics(rows, { now: NOW, rangeDays: 30 });
  assert.equal(r30.overview.pageViews, 1);
  assert.equal(computeAnalytics([], { now: NOW }).hasAnyData, false);
});

test('no PII: l\'aggregatore non legge/espone email, telefono, IP (solo colonne schema)', () => {
  const rows = [ev('page_view', { v: 'a', path: '/', meta: { municipality: 'Milano' } })];
  const r = computeAnalytics(rows, { now: NOW, rangeDays: 7 });
  const dump = JSON.stringify(r);
  assert.doesNotMatch(dump, /email|telefono|phone|@[a-z]+\.[a-z]{2,}/i);
});
