// Coerenza GPS Admin / Cliente (diagnosi 2026-10-01, sessione su PARCO NORD,
// GPS reale in BRUZZANO): geofence, presenza operatore e copertura devono
// derivare dalle STESSE funzioni e dagli STESSI dati in Admin header, Admin
// mappa/riga operatore e Cliente.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  evaluateSessionGeofence,
  resolveOperationalZones,
  resolveSelectedZoneId,
} from '../src/lib/geofence/sessionZoneGeofence.js';
import {
  classifyDriverPresence,
  classifyPresenceFromActivity,
  getLatestTrackableSession,
  latestPointForSession,
  resolveLastActivityIso,
  DRIVER_PRESENCE_LABELS,
} from '../src/lib/gps/driverPresence.js';
import { formatCoveragePercent } from '../src/lib/gps/coverageDisplay.js';
import { aggregateOperationalMetrics, classifyDriverStatus } from '../src/lib/services/gps-api.js';
import { ZoneProgressPanel } from '../src/components/zone-progress/ZoneProgressPanel.jsx';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const GM = read('src/pages/admin/GpsMonitor.jsx');
const PANEL = read('src/pages/admin/gps-monitor/GpsMonitorMetricsPanel.jsx');
const CUSTOMER = read('src/pages/customer/CampaignTracking.jsx');
const GPS_API = read('src/lib/services/gps-api.js');

// ── Fixture: due NIL confinanti di una campagna Milano ──────────────────────
// PARCO NORD: lng 9.150-9.160; BRUZZANO: lng 9.163-9.180 (stessa fascia lat).
// Il punto GPS a lng 9.1664 e' dentro BRUZZANO e a ~0,5 km dal bordo est di
// PARCO NORD (0.0064° di longitudine a 45,525° N ≈ 499 m), come nei dati reali
// (ultimo punto a 497 m da PARCO NORD).
const square = (minLng, minLat, maxLng, maxLat) => ({
  type: 'Polygon',
  coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
});
const PARCO_NORD = 'zone-parco-nord';
const BRUZZANO = 'zone-bruzzano';
const AFFORI = 'zone-affori';
const BOUNDARIES = {
  [PARCO_NORD]: square(9.150, 45.520, 9.160, 45.530),
  [BRUZZANO]: square(9.163, 45.520, 9.180, 45.535),
  [AFFORI]: square(9.181, 45.520, 9.195, 45.535),
};
const ZONE_ROWS = [
  { id: AFFORI, zone_name: 'AFFORI' },
  { id: BRUZZANO, zone_name: 'BRUZZANO' },
  { id: PARCO_NORD, zone_name: 'PARCO NORD' },
];
const ZONE_IDS = ZONE_ROWS.map((z) => z.id);
const SESSION = {
  id: 'sess-1',
  status: 'started',
  campaign_zone_id: PARCO_NORD,
  started_at: '2026-09-30T13:41:54Z',
  updated_at: '2026-09-30T13:58:58Z',
};
// 26 punti in BRUZZANO ogni ~40 s (come la sessione reale: tutti fuori dalla
// zona assegnata), ultimo a lng 9.1664.
const POINTS = Array.from({ length: 26 }, (_, i) => ({
  session_id: SESSION.id,
  lat: 45.525,
  lng: i === 25 ? 9.1664 : 9.170 + (i % 5) * 0.001,
  accuracy: 3,
  recorded_at: new Date(Date.parse('2026-09-30T13:41:55Z') + i * 40_000).toISOString(),
}));

// Admin: activeSession = getLatestTrackableSession(sessions), punti = tutti
// quelli della campagna; header e mappa leggono lo STESSO oggetto.
function adminGeofence(points = POINTS, sessions = [SESSION]) {
  const activeSession = getLatestTrackableSession(sessions);
  const g = evaluateSessionGeofence({ activeSession, points, zoneIds: ZONE_IDS, boundaries: BOUNDARIES });
  return {
    header: { status: g.liveStatus, distanceKm: g.distanceKm },
    map: { status: g.liveStatus, distanceKm: g.distanceKm },
    history: g.history.status,
  };
}
// Cliente: select customer-safe (punti con session_id, sessioni con
// campaign_zone_id, senza driver/assignment), stessa scelta di sessione.
function customerGeofence(points = POINTS, sessions = [SESSION]) {
  const safeSessions = sessions.map(({ id, status, campaign_zone_id, started_at, updated_at }) => ({ id, status, campaign_zone_id, started_at, updated_at }));
  const activeSession = getLatestTrackableSession(safeSessions);
  const g = evaluateSessionGeofence({ activeSession, points, zoneIds: ZONE_IDS, boundaries: BOUNDARIES });
  return { status: g.liveStatus, distanceKm: g.distanceKm };
}

// ── 1. GEOFENCE ─────────────────────────────────────────────────────────────
test('geofence: sessione PARCO NORD + GPS BRUZZANO -> fuori dalla zona assegnata in TUTTE le viste', () => {
  const admin = adminGeofence();
  const customer = customerGeofence();
  assert.equal(admin.header.status, 'outside');
  assert.equal(admin.map.status, 'outside');
  assert.equal(customer.status, 'outside');
  // Storico debounced (stessa zona): anche lui fuori.
  assert.equal(admin.history, 'outside');
});

test('geofence: Admin header = Admin mappa = Cliente, distanza coerente ~0,5 km', () => {
  const admin = adminGeofence();
  const customer = customerGeofence();
  assert.deepEqual(admin.header, admin.map);
  assert.deepEqual(admin.map, customer);
  assert.ok(customer.distanceKm > 0.45 && customer.distanceKm < 0.55, `distanza ${customer.distanceKm} km`);
  assert.equal(customer.distanceKm.toFixed(1), '0.5');
});

test("geofence: la zona di riferimento e' quella della sessione, non l'unione delle zone campagna", () => {
  const session = resolveOperationalZones({ sessionZoneId: PARCO_NORD, zoneIds: ZONE_IDS, boundaries: BOUNDARIES });
  assert.equal(session.mode, 'session');
  assert.equal(session.referenceZoneId, PARCO_NORD);
  assert.equal(session.zones.length, 1);
  // Vecchio comportamento (unione): avrebbe detto "dentro" perche' il punto e'
  // in BRUZZANO — il ripiego resta SOLO per sessioni senza campaign_zone_id.
  const legacy = evaluateSessionGeofence({ activeSession: { ...SESSION, campaign_zone_id: null }, points: POINTS, zoneIds: ZONE_IDS, boundaries: BOUNDARIES });
  assert.equal(legacy.mode, 'campaign');
  assert.equal(legacy.liveStatus, 'inside');
});

test('geofence: confine della zona di sessione non ancora risolto -> zona non disponibile (mai "dentro" per ripiego)', () => {
  const { [PARCO_NORD]: _omit, ...withoutParco } = BOUNDARIES;
  const g = evaluateSessionGeofence({ activeSession: SESSION, points: POINTS, zoneIds: ZONE_IDS, boundaries: withoutParco });
  assert.equal(g.liveStatus, 'zone_unavailable');
  assert.equal(g.distanceKm, null);
});

test('geofence: si valuta il punto della SESSIONE ATTIVA, non l\'ultimo di un altro operatore', () => {
  const other = { session_id: 'sess-old', lat: 45.525, lng: 9.155, accuracy: 3, recorded_at: '2026-09-30T15:00:00Z' }; // dentro PARCO NORD, piu' recente
  const sessions = [SESSION, { id: 'sess-old', status: 'completed', campaign_zone_id: PARCO_NORD, started_at: '2026-09-29T08:00:00Z', updated_at: '2026-09-29T09:00:00Z' }];
  assert.equal(adminGeofence([...POINTS, other], sessions).map.status, 'outside');
  assert.equal(customerGeofence([...POINTS, other], sessions).status, 'outside');
});

test('selezione zona Admin: sessione caricata DOPO le zone -> passa comunque alla zona della sessione', () => {
  // 1) arrivano solo le zone: nessuna sessione ancora -> prima zona stabile
  let current = resolveSelectedZoneId({ currentId: null, userPicked: false, sessionZoneId: null, zoneRows: ZONE_ROWS });
  assert.equal(current, AFFORI);
  // 2) arriva la sessione (PARCO NORD) -> la selezione si sincronizza
  current = resolveSelectedZoneId({ currentId: current, userPicked: false, sessionZoneId: PARCO_NORD, zoneRows: ZONE_ROWS });
  assert.equal(current, PARCO_NORD);
  // 3) la sessione passa a un'altra zona -> la segue
  current = resolveSelectedZoneId({ currentId: current, userPicked: false, sessionZoneId: BRUZZANO, zoneRows: ZONE_ROWS });
  assert.equal(current, BRUZZANO);
  // 4) scelta manuale dell'Admin: resta (anche "Tutti" = null)
  assert.equal(resolveSelectedZoneId({ currentId: AFFORI, userPicked: true, sessionZoneId: PARCO_NORD, zoneRows: ZONE_ROWS }), AFFORI);
  assert.equal(resolveSelectedZoneId({ currentId: null, userPicked: true, sessionZoneId: PARCO_NORD, zoneRows: ZONE_ROWS }), null);
  // 5) zona della sessione non fra le zone caricate -> nessun id inventato
  assert.equal(resolveSelectedZoneId({ currentId: null, userPicked: false, sessionZoneId: 'altra', zoneRows: ZONE_ROWS }), AFFORI);
});

test('geofence: contratti sorgente — header, mappa e Cliente leggono lo stesso risultato', () => {
  // Admin: un solo evaluateSessionGeofence; header e badge mappa ricevono le stesse variabili.
  assert.equal((GM.match(/evaluateSessionGeofence\(\{/g) || []).length, 1);
  assert.match(GM, /const liveZoneStatus = sessionGeofence\.liveStatus;/);
  assert.match(GM, /const outsideDistanceKm = sessionGeofence\.distanceKm;/);
  assert.match(GM, /liveZoneStatus=\{liveZoneStatus\}\s*\n\s*outsideDistanceKm=\{outsideDistanceKm\}/);
  assert.match(GM, /<LiveZoneStatusBadge status=\{liveZoneStatus\} distanceKm=\{outsideDistanceKm\} \/>/);
  assert.match(PANEL, /<LiveZoneStatusBadge status=\{liveZoneStatus\} distanceKm=\{outsideDistanceKm\} \/>/);
  assert.doesNotMatch(GM, /summarizeGeofencePoints\(state\.points/);
  assert.doesNotMatch(GM, /zoneRows\[0\]\?\.id \|\| null;\s*\n\s*if \(fallbackId\)/);
  assert.match(GM, /resolveSelectedZoneId\(\{/);
  // Cliente: stessa funzione, stessa sessione attiva.
  assert.match(CUSTOMER, /getLatestTrackableSession\(state\.sessions\)/);
  assert.match(CUSTOMER, /evaluateSessionGeofence\(\{/);
  assert.match(CUSTOMER, /<LiveZoneStatusBadge status=\{liveZoneStatus\} distanceKm=\{outsideDistanceKm\} \/>/);
});

// ── 2. ONLINE / SEGNALE DEBOLE / OFFLINE ────────────────────────────────────
const NOW = Date.parse('2026-10-01T10:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

// Le tre UI, ciascuna con la propria forma di input reale:
//  - header Admin: sessione attiva + ultimo punto della sessione fra tutti i punti campagna;
//  - riga operatore: track.presence da getCampaignSessionTracks (ultimo punto grezzo della sessione);
//  - Cliente: sessioni/punti customer-safe, stessa sessione attiva.
function threeViews({ updatedAt, lastGpsAt }) {
  const session = { id: 's', status: 'started', started_at: ago(3_600_000), updated_at: updatedAt };
  const points = lastGpsAt ? [{ session_id: 's', recorded_at: ago(3_000_000) }, { session_id: 's', recorded_at: lastGpsAt }] : [];
  const header = classifyDriverPresence({ session: getLatestTrackableSession([session]), lastPoint: latestPointForSession(points, 's'), nowMs: NOW });
  const row = classifyDriverPresence({ session, lastPoint: points[points.length - 1] || null, nowMs: NOW });
  const customerSession = getLatestTrackableSession([{ id: 's', status: 'started', started_at: session.started_at, updated_at: updatedAt }]);
  const customer = classifyDriverPresence({ session: customerSession, lastPoint: latestPointForSession(points, customerSession.id), nowMs: NOW });
  return { header: header.status, row: row.status, customer: customer.status, label: row.label };
}

for (const [name, ms, expected] of [
  ['0 s', 0, 'online'],
  ['44 s', 44_000, 'online'],
  ['46 s', 46_000, 'online'],
  ['2 min esatti', 120_000, 'online'],
  ['4 min', 240_000, 'weak'],
  ['5 min esatti', 300_000, 'weak'],
  ['oltre 5 min', 301_000, 'offline'],
  ['19 ore (sessione mai chiusa)', 19 * 3_600_000, 'offline'],
]) {
  test(`presenza: ultima attivita' ${name} -> ${expected} identico nelle tre UI`, () => {
    const v = threeViews({ updatedAt: ago(ms), lastGpsAt: ago(ms) });
    assert.equal(v.header, expected);
    assert.equal(v.row, expected);
    assert.equal(v.customer, expected);
    assert.equal(v.label, DRIVER_PRESENCE_LABELS[expected]);
  });
}

test('presenza: heartbeat piu\' recente del GPS -> vince l\'heartbeat', () => {
  const v = threeViews({ updatedAt: ago(30_000), lastGpsAt: ago(400_000) });
  assert.deepEqual([v.header, v.row, v.customer], ['online', 'online', 'online']);
  assert.equal(resolveLastActivityIso({ updated_at: ago(30_000) }, { recorded_at: ago(400_000) }), ago(30_000));
});

test('presenza: GPS piu\' recente dell\'heartbeat -> vince il GPS (mai il primo campo con ||)', () => {
  const v = threeViews({ updatedAt: ago(400_000), lastGpsAt: ago(30_000) });
  assert.deepEqual([v.header, v.row, v.customer], ['online', 'online', 'online']);
  assert.equal(resolveLastActivityIso({ updated_at: ago(400_000) }, { recorded_at: ago(30_000) }), ago(30_000));
});

test('presenza: segnale debole NON e\' mai ONLINE; nessuna attivita\' = OFFLINE', () => {
  assert.equal(DRIVER_PRESENCE_LABELS.weak, 'SEGNALE DEBOLE');
  assert.equal(classifyPresenceFromActivity(null, NOW), 'offline');
  assert.equal(classifyDriverPresence({ session: null, lastPoint: null, nowMs: NOW }).label, 'OFFLINE');
  // classifyDriverStatus (lifecycle esistente) usa le stesse soglie.
  assert.equal(classifyDriverStatus(ago(240_000), NOW), 'warning');
  assert.equal(classifyDriverStatus(ago(119_000), NOW), 'online');
  assert.equal(classifyDriverStatus(ago(301_000), NOW), 'offline');
});

test('presenza: contratti sorgente — un solo helper, nessuna soglia duplicata nei componenti', () => {
  for (const [name, src] of [['GpsMonitor', GM], ['GpsMonitorMetricsPanel', PANEL], ['CampaignTracking', CUSTOMER]]) {
    assert.doesNotMatch(src, /45000|45_000/, `${name}: soglia 45 s duplicata`);
    assert.doesNotMatch(src, /5 \* 60 \* 1000|5 \* 60000|300000/, `${name}: soglia 5 min duplicata`);
  }
  assert.match(GM, /const driverPresence = classifyDriverPresence\(\{/);
  assert.match(GM, /return track\.presence\?\.label \|\| DRIVER_PRESENCE_LABELS\.offline;/);
  assert.doesNotMatch(GM, /warning: 'ONLINE'/);
  assert.match(PANEL, /<Metric label="Driver" value=\{driverPresence\?\.label\} \/>/);
  assert.match(GPS_API, /const presence = classifyDriverPresence\(\{\s*\n\s*session,/);
  assert.match(GPS_API, /lifecycleStatus: classifySessionLifecycle\(session, presence\.lastActivityIso\)/);
  assert.match(CUSTOMER, /const presence = classifyDriverPresence\(\{/);
});

// ── 3. COPERTURA ────────────────────────────────────────────────────────────
const FINAL = { calculation_status: 'ready', final_operational_coverage_pct: 0.09 };
const ZONES_WITHOUT_OWN_PERCENT = [
  { campaign_zone_id: BRUZZANO, zone_name: 'BRUZZANO', effective_percent: null },
  { campaign_zone_id: PARCO_NORD, zone_name: 'PARCO NORD', effective_percent: null },
];

test('copertura: globale 0,09% + zone senza effective_percent -> le zone NON mostrano 0,09% (ne\' 0%)', () => {
  // Il Cliente passa le zone COSI' COME SONO al pannello (nessun riuso del globale).
  assert.match(CUSTOMER, /zones=\{zoneProgress\.zones \|\| \[\]\}/);
  assert.doesNotMatch(CUSTOMER, /effective_percent > 0 \? z\.effective_percent : finalCoverage/);
  const html = renderToStaticMarkup(React.createElement(ZoneProgressPanel, { zones: ZONES_WITHOUT_OWN_PERCENT, theme: 'dark' }));
  assert.doesNotMatch(html, /0,09\s*%|0\.09\s*%/);
  assert.doesNotMatch(html, />0\s*%</);
  assert.equal((html.match(/Dato non disponibile/g) || []).length >= 2, true);
});

test('copertura: zona senza dato -> n/d (mai falso zero) nei chip Admin e nel popup Cliente', () => {
  assert.equal(formatCoveragePercent(null), 'n/d');
  assert.equal(formatCoveragePercent(undefined), 'n/d');
  assert.equal(formatCoveragePercent(''), 'n/d');
  assert.equal(formatCoveragePercent(0.09), '0,09%');
  assert.equal(formatCoveragePercent(0), '0%');
  assert.match(GM, /\{zone\.zone_name\} \{formatCoveragePercent\(pct\)\}/);
  assert.doesNotMatch(GM, /toFixed\(0\)\}%/);
  assert.match(CUSTOMER, /\{formatCoveragePercent\(zone\.effective_percent\)\}/);
  assert.doesNotMatch(CUSTOMER, /: '0%'\}/);
});

test('copertura: KPI Admin e Cliente derivano dalla stessa coverage finale', () => {
  const common = { gpsPoints: POINTS, sessions: [SESSION], manualMetrics: null, finalCoverage: FINAL, zoneProgress: { zones: ZONES_WITHOUT_OWN_PERCENT } };
  const admin = aggregateOperationalMetrics(common);
  const customer = aggregateOperationalMetrics({ ...common, photos: [], selectedZoneId: null });
  assert.equal(admin.coverageDisplay, '0.09%');
  assert.equal(customer.coverageDisplay, admin.coverageDisplay);
  // Sorgente: Admin legge getFinalCoverage e usa aggregateOperationalMetrics come il Cliente.
  assert.match(GM, /getFinalCoverage\(campaignId\)\.catch\(\(\) => null\)/);
  assert.match(GM, /const campaignCoverageDisplay = aggregateOperationalMetrics\(\{[\s\S]*?finalCoverage: state\.finalCoverage,/);
  assert.match(PANEL, /<Metric label="Copertura campagna" value=\{campaignCoverageDisplay\} \/>/);
  assert.match(CUSTOMER, /finalCoverage: state\.finalCoverage,/);
});

// KPI campagna: 0 e' un valore reale; mai la prima zona come sostituto.
// Admin e Cliente chiamano la stessa funzione con la loro forma di input.
function campaignKpi(finalCoverage, { points = POINTS, zones } = {}) {
  const zoneProgress = { zones: zones ?? [{ campaign_zone_id: BRUZZANO, zone_name: 'BRUZZANO', effective_percent: 12.5 }] };
  const admin = aggregateOperationalMetrics({ gpsPoints: points, sessions: [SESSION], manualMetrics: null, finalCoverage, zoneProgress });
  const customer = aggregateOperationalMetrics({ gpsPoints: points, sessions: [SESSION], photos: [], manualMetrics: null, finalCoverage, zoneProgress, selectedZoneId: null });
  assert.equal(customer.coverageDisplay, admin.coverageDisplay, 'Admin e Cliente devono coincidere');
  assert.equal(customer.coveragePercent, admin.coveragePercent);
  return admin;
}

test('copertura: final_operational_coverage_pct = 0 con prima zona 12,5% -> KPI campagna 0% (0 non e\' "mancante")', () => {
  const kpi = campaignKpi({ calculation_status: 'ready', final_operational_coverage_pct: 0 });
  assert.equal(kpi.coveragePercent, 0);
  assert.equal(kpi.coverageDisplay, '0%');
  assert.doesNotMatch(kpi.coverageDisplay, /12[.,]5/);
});

test('copertura: final_operational_coverage_pct = 0.09 -> KPI 0,09 (prima zona ignorata)', () => {
  const kpi = campaignKpi({ calculation_status: 'ready', final_operational_coverage_pct: 0.09 });
  assert.equal(kpi.coveragePercent, 0.09);
  assert.equal(kpi.coverageDisplay, '0.09%');
});

test('copertura: finale assente/null -> dato non disponibile, MAI la percentuale di una zona', () => {
  for (const finalCoverage of [null, undefined, {}, { final_operational_coverage_pct: null }, { calculation_status: 'zone_geometry_missing', final_operational_coverage_pct: null }]) {
    // con punti GPS: stato "In calcolo..." (comportamento previsto), senza punti: "Dato non disponibile"
    const withGps = campaignKpi(finalCoverage);
    assert.equal(withGps.coveragePercent, null);
    assert.equal(withGps.coverageDisplay, 'In calcolo...');
    const noGps = campaignKpi(finalCoverage, { points: [] });
    assert.equal(noGps.coveragePercent, null);
    assert.equal(noGps.coverageDisplay, 'Dato non disponibile');
  }
  assert.doesNotMatch(GPS_API, /zoneProgress\?\.zones\?\.\[0\]\?\.effective_percent/);
});

test('copertura: la copertura della sola sessione/zona resta distinta ("Copertura zona sessione")', () => {
  assert.match(PANEL, /label="Copertura zona sessione"/);
  assert.match(GM, /<MiniStat label="Copertura zona sessione"/);
  assert.doesNotMatch(PANEL, /Copertura calcolata/);
  assert.doesNotMatch(GM, /Copertura operatore \(stimata\)/);
});
