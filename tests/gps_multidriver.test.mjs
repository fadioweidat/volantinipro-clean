import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { groupGpsPointsBySession } from '../src/lib/services/gps-api.js';
import { filterValidGpsPoints } from '../src/lib/gps/pointQuality.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const gpsApi = read('src/lib/services/gps-api.js');
const customerApi = read('src/lib/services/customer-api.js');
const campaignTracking = read('src/pages/customer/CampaignTracking.jsx');
const gpsMonitor = read('src/pages/admin/GpsMonitor.jsx');
const trackingPage = read('src/pages/driver/TrackingPage.jsx');
const assignmentPage = read('src/pages/driver/DriverAssignmentPage.jsx');

// ---------------------------------------------------------------------------
// 1. Raggruppamento per sessione + filtro qualita' PER SESSIONE
// ---------------------------------------------------------------------------

// Due operatori, timestamp interlacciati, posizioni lontane fra loro.
const A = (n, t) => ({ id: `a${n}`, session_id: 'sess-A', driver_id: 'drv-A', lat: 45.10 + n * 0.0005, lng: 9.10, accuracy: 8, recorded_at: t });
const B = (n, t) => ({ id: `b${n}`, session_id: 'sess-B', driver_id: 'drv-B', lat: 45.40 + n * 0.0005, lng: 9.30, accuracy: 8, recorded_at: t });
const mixed = [
  A(1, '2026-08-29T09:00:00Z'),
  B(1, '2026-08-29T09:00:10Z'),
  A(2, '2026-08-29T09:00:20Z'),
  B(2, '2026-08-29T09:00:30Z'),
  A(3, '2026-08-29T09:00:40Z'),
  B(3, '2026-08-29T09:00:50Z'),
];

test('groupGpsPointsBySession: una lista per session_id, ordine preservato', () => {
  const groups = groupGpsPointsBySession(mixed);
  assert.equal(groups.size, 2);
  assert.deepEqual(groups.get('sess-A').map((p) => p.id), ['a1', 'a2', 'a3']);
  assert.deepEqual(groups.get('sess-B').map((p) => p.id), ['b1', 'b2', 'b3']);
});

test('filterValidGpsPoints PER SESSIONE non produce impossible_jump; sull\'unione si', () => {
  // Sull'array misto ordinato per tempo il salto A->B->A e' letto come salto
  // impossibile: almeno un punto viene escluso.
  const merged = filterValidGpsPoints(mixed);
  assert.ok(merged.excluded.length > 0, 'array misto: almeno un punto escluso per salto');

  // Per sessione: nessuna esclusione, ogni traccia e' coerente con se stessa.
  const groups = groupGpsPointsBySession(mixed);
  for (const groupPoints of groups.values()) {
    const { valid, excluded } = filterValidGpsPoints(groupPoints);
    assert.equal(excluded.length, 0);
    assert.equal(valid.length, groupPoints.length);
  }
});

test('nessun segmento cross-driver: le polilinee per sessione non condividono estremi', () => {
  const groups = groupGpsPointsBySession(mixed);
  const lineA = filterValidGpsPoints(groups.get('sess-A')).valid.map((p) => [p.lat, p.lng]);
  const lineB = filterValidGpsPoints(groups.get('sess-B')).valid.map((p) => [p.lat, p.lng]);
  // L'ultimo punto di A non e' mai il primo di B (nessun A3 -> B1).
  assert.notDeepEqual(lineA[lineA.length - 1], lineB[0]);
  assert.equal(lineA.length, 3);
  assert.equal(lineB.length, 3);
});

// ---------------------------------------------------------------------------
// 2. API customer-safe (privacy)
// ---------------------------------------------------------------------------

test('gps-api: fetch customer-safe con select esplicita, mai select(*)', () => {
  assert.match(gpsApi, /export async function getCustomerCampaignGpsPoints/);
  assert.match(gpsApi, /export async function getCustomerCampaignGpsSessions/);
  // Estrae SOLO l'argomento di .select(...) di ciascuna funzione customer-safe.
  const pointsSelect = gpsApi.match(/function getCustomerCampaignGpsPoints[\s\S]*?\.select\(([^)]*)\)/)[1];
  const sessionsSelect = gpsApi.match(/function getCustomerCampaignGpsSessions[\s\S]*?\.select\(([^)]*)\)/)[1];
  assert.doesNotMatch(pointsSelect, /['"]\s*\*\s*['"]/);
  assert.doesNotMatch(sessionsSelect, /['"]\s*\*\s*['"]/);
  // Nessun dato operatore nelle select customer-safe.
  for (const forbidden of ['driver_name', 'driver_phone', 'device_id', 'driver_id', 'assignment_id', 'metadata', 'group_id']) {
    assert.doesNotMatch(sessionsSelect, new RegExp(`\\b${forbidden}\\b`), `select sessioni cliente non deve contenere ${forbidden}`);
  }
  assert.doesNotMatch(pointsSelect, /\bdriver_id\b/);
  assert.match(pointsSelect, /\bsession_id\b/); // resta come chiave di raggruppamento
});

test('customer-api: getOwnedCustomerTracking usa i fetch customer-safe', () => {
  assert.match(customerApi, /getCustomerCampaignGpsPoints/);
  assert.match(customerApi, /getCustomerCampaignGpsSessions/);
  assert.doesNotMatch(customerApi, /getCampaignGpsPoints\b/);
  assert.doesNotMatch(customerApi, /getCampaignGpsSessions\b/);
});

// ---------------------------------------------------------------------------
// 3. Polilinee separate — Cliente
// ---------------------------------------------------------------------------

test('CampaignTracking: una Polyline per sessione, filtro qualita\' per gruppo', () => {
  assert.match(campaignTracking, /groupGpsPointsBySession/);
  assert.match(campaignTracking, /filterValidGpsPoints\(groupPoints\)\.valid/);
  assert.match(campaignTracking, /sessionPaths\.map\(/);
  // Nessuna singola polilinea da TUTTI i punti.
  assert.doesNotMatch(campaignTracking, /positions=\{path\}/);
});

// ---------------------------------------------------------------------------
// 4. Admin multi-sessione
// ---------------------------------------------------------------------------

test('GpsMonitor: carica TUTTE le sessioni trackabili, non solo la piu\' recente', () => {
  assert.match(gpsMonitor, /getCampaignSessionTracks/);
  assert.doesNotMatch(gpsMonitor, /getCampaignGpsPoints\(campaignId, \{ sessionId/);
  // Una Polyline per traccia (mai una sola da tutti i punti).
  assert.match(gpsMonitor, /trackLines\.filter\(\(track\) => track\.visible\)\.map/);
  assert.match(gpsMonitor, /<Polyline positions=\{track\.latlngs\}/);
  // Pannello operatori simultaneo + toggle mostra/nascondi.
  assert.match(gpsMonitor, /function GpsMonitorOperatorsPanel/);
  assert.match(gpsMonitor, /toggleTrack/);
  assert.match(gpsMonitor, /Nascondi traccia|Mostra traccia/);
});

test('GpsMonitor: geofence dalla geometria reale (mapZones), non da campaigns.metadata', () => {
  assert.match(gpsMonitor, /normalizeZonesFromCampaign\(\{ campaign_zones: \(mapZones/);
  assert.doesNotMatch(gpsMonitor, /normalizeZonesFromCampaign\(state\.campaign\)/);
  // Contratto esistente: nessuna fetch diretta di campaign_zones nell'Admin.
  assert.doesNotMatch(gpsMonitor, /\.from\(['"]campaign_zones['"]\)/);
});

// ---------------------------------------------------------------------------
// 5. Driver — pausa / riprendi / termina
// ---------------------------------------------------------------------------

for (const [name, src] of [['TrackingPage', trackingPage], ['DriverAssignmentPage', assignmentPage]]) {
  test(`${name}: controlli pausa/riprendi/termina con etichette e conferma`, () => {
    assert.match(src, /Metti in pausa/);
    assert.match(src, /Riprendi lavoro/);
    assert.match(src, /Termina lavoro/);
    assert.match(src, /Lavoro in pausa/);
    assert.match(src, /window\.confirm/);
    // Il completamento operatore chiama completeZone prima di end. Il testo
    // "Termina lavoro" compare anche in un commento: si ancora all'ULTIMA
    // occorrenza (il figlio del <button>).
    const btnAt = src.lastIndexOf('Termina lavoro');
    const stop = src.slice(btnAt - 900, btnAt);
    assert.ok(stop.includes('tracking.completeZone'));
    assert.ok(stop.includes('tracking.end'));
    assert.ok(stop.indexOf('tracking.completeZone') < stop.indexOf('tracking.end'));
  });
}
