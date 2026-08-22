import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildFinalDistributionReport } from '../src/lib/reports/finalDistributionReport.js';
import { generateFinalDistributionPdfBytes } from '../src/lib/pdf/generateFinalDistributionPdf.js';

const campaign = { title: 'Campagna Operativa Certificata', client_name: 'Cliente Demo', start_date: '2026-08-10', end_date: '2026-08-12' };
const zones = [
  { id: 'zone-1', municipality_name: 'Milano Centro', quantity_assigned: 4000, status: 'Completata' },
  { id: 'zone-2', municipality_name: 'Sesto San Giovanni', quantity_assigned: 3000, status: 'Completata' },
  { id: 'zone-3', municipality_name: 'Monza', quantity_assigned: 5000, status: 'Parziale' },
];
const sessions = [
  { id: 'session-1', campaign_zone_id: 'zone-1', status: 'completed', started_at: '2026-08-10T08:00:00Z', ended_at: '2026-08-10T10:00:00Z', driver_id: 'private-driver-1' },
  { id: 'session-2', campaign_zone_id: 'zone-2', status: 'completed', started_at: '2026-08-11T08:00:00Z', ended_at: '2026-08-11T11:00:00Z', driver_id: 'private-driver-2' },
  { id: 'session-3', campaign_zone_id: 'zone-3', status: 'paused', started_at: '2026-08-12T08:00:00Z', paused_at: '2026-08-12T09:00:00Z', driver_id: 'private-driver-3' },
];
const telemetry = [
  { session_id: 'session-1', gps_count: 120, first_gps_at: '2026-08-10T08:01:00Z', last_gps_at: '2026-08-10T09:59:00Z' },
  { session_id: 'session-2', gps_count: 180, first_gps_at: '2026-08-11T08:01:00Z', last_gps_at: '2026-08-11T10:59:00Z' },
  { session_id: 'session-3', gps_count: 60, first_gps_at: '2026-08-12T08:01:00Z', last_gps_at: '2026-08-12T08:59:00Z' },
];
const photos = Array.from({ length: 6 }, (_, index) => ({
  session_id: `session-${(index % 3) + 1}`,
  approved_at: '2026-08-12T12:00:00Z', taken_at: `2026-08-${10 + (index % 3)}T09:00:00Z`,
  signedUrl: `https://example.invalid/photo-${index}.jpg`, lat: 45.46, lng: 9.19,
}));

test('scenario finale: 3 zone, quantità, stati, 6 foto e GPS coerenti', () => {
  const report = buildFinalDistributionReport({ campaign, zones, sessions, telemetry, photos, generatedAt: '2026-08-13T09:00:00Z' });
  assert.equal(report.totals.quantityAssigned, 12000);
  assert.equal(report.totals.zonesCompleted, 2);
  assert.equal(report.status, 'Parziale');
  assert.equal(report.provisional, true);
  assert.equal(report.totals.sessionCount, 3);
  assert.equal(report.totals.gpsCount, 360);
  assert.equal(report.totals.photoCount, 6);
  assert.deepEqual(report.zones.map((zone) => zone.quantityAssigned), [4000, 3000, 5000]);
  assert.deepEqual(report.zones.map((zone) => zone.status), ['Completata', 'Completata', 'Parziale']);
  assert.doesNotMatch(JSON.stringify(report), /private-driver|45\.46|9\.19|session-[123]|zone-[123]/);
});

test('PDF è A4 strutturato, incorpora foto e non espone dati tecnici', () => {
  const report = buildFinalDistributionReport({ campaign, zones, sessions, telemetry, photos, generatedAt: '2026-08-13T09:00:00Z' });
  const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x00,0x01,0x00,0x01,0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00,0xff,0xd9]);
  const bytes = generateFinalDistributionPdfBytes(report, { photos: [{ bytes: jpeg, zoneName: 'Milano Centro', takenAt: '2026-08-10T09:00:00Z' }] });
  const source = Buffer.from(bytes).toString('latin1');
  assert.match(source, /^%PDF-1\.4/);
  assert.match(source, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(source, /\/Subtype \/Image/);
  assert.match(source, /CERTIFICAZIONE FINALE DI DISTRIBUZIONE/);
  assert.match(source, /Quantita assegnata: 12\.000 volantini/);
  assert.doesNotMatch(source, /private-driver|session-[123]|zone-[123]|45\.46|9\.19|estimated_price|total_amount/);
});

test('telemetry finale è read-only, owner/admin-scoped e senza coordinate', async () => {
  const sql = await readFile(new URL('../supabase/migrations_legacy_pre_rebaseline_20260821/20260813000200_final_distribution_report_telemetry.sql', import.meta.url), 'utf8');
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path to ''/i);
  assert.match(sql, /public\.gps_is_admin\(\)/);
  assert.match(sql, /campaign\.user_id = auth\.uid\(\)/);
  assert.match(sql, /count\(\*\).*min\(point\.recorded_at\).*max\(point\.recorded_at\)/is);
  assert.doesNotMatch(sql, /\b(lat|lng|geom|driver_id)\b/i);
  assert.doesNotMatch(sql, /execute\s+(?:format|select|with|insert|update|delete)|format\s*\(/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate)\b/i);
  assert.match(sql, /revoke all .* from anon/i);
});

test('il link Admin usa la route Cliente canonica', async () => {
  const source = await readFile(new URL('../src/pages/admin/CampaignReport.jsx', import.meta.url), 'utf8');
  assert.match(source, /\/customer\/campaigns\/\$\{campaignId\}\/report/);
  assert.doesNotMatch(source, /\/client\/campaigns\/\$\{campaignId\}\/report/);
});

// Sezione "Tracciamento GPS e Copertura": la scomposizione GPS/manuale/finale
// deve venire SOLO da calculate_zone_final_coverage (via zoneExtras), mai un
// 100% mostrato quando in realta' e' 65% GPS + 35% manuale, e mai un dato
// fake quando il calcolo non e' 'ready'.
test('zoneExtras: GPS/manuale/finale restano distinti, mai un 100% muto', () => {
  const zoneExtras = new Map([
    ['zone-1', { calculationStatus: 'ready', gpsCoveragePercent: 65, manualCoveragePercent: 35, finalCoveragePercent: 100, gpsDistanceKm: 4.2, validGpsPoints: 210, excludedGpsPoints: 3, boundaryAvailable: true, traceAvailable: true, boundaryGeometry: { type: 'Polygon', coordinates: [[[9, 45], [9.01, 45], [9.01, 45.01], [9, 45]]] }, tracePoints: [{ lat: 45, lng: 9 }] }],
    ['zone-2', { calculationStatus: 'zone_geometry_missing' }],
  ]);
  const report = buildFinalDistributionReport({ campaign, zones: zones.slice(0, 2), sessions, telemetry, photos: [], generatedAt: '2026-08-13T09:00:00Z', zoneExtras });

  const [zoneA, zoneB] = report.zones;
  assert.equal(zoneA.gpsCoveragePercent, 65);
  assert.equal(zoneA.manualCoveragePercent, 35);
  assert.equal(zoneA.finalCoveragePercent, 100);
  assert.equal(zoneA.finalStatus, 'Completata con integrazione manuale', 'un 100% con quota manuale non deve mai sembrare un 100% GPS puro');
  assert.equal(zoneA.boundaryAvailable, true);
  assert.equal(zoneA.traceAvailable, true);

  // Zona senza calcolo pronto: nessun dato fake, tutto null/false, mai 0 finto.
  assert.equal(zoneB.gpsCoveragePercent, null);
  assert.equal(zoneB.manualCoveragePercent, null);
  assert.equal(zoneB.finalCoveragePercent, null);
  assert.equal(zoneB.finalStatus, 'Non disponibile');
  assert.equal(zoneB.boundaryAvailable, false);
  assert.equal(zoneB.traceAvailable, false);
});

test('PDF: sezione GPS separa esplicitamente copertura GPS/manuale/finale e non inventa una mappa senza screenshot', () => {
  const zoneExtras = new Map([
    ['zone-1', { calculationStatus: 'ready', gpsCoveragePercent: 65, manualCoveragePercent: 35, finalCoveragePercent: 100, gpsDistanceKm: 4.2, validGpsPoints: 210, boundaryAvailable: true, traceAvailable: true, tracePoints: [] }],
    ['zone-3', { calculationStatus: 'not_available' }],
  ]);
  const report = buildFinalDistributionReport({ campaign, zones, sessions, telemetry, photos: [], generatedAt: '2026-08-13T09:00:00Z', zoneExtras });
  const bytes = generateFinalDistributionPdfBytes(report, { photos: [], zoneSnapshots: [] });
  const source = Buffer.from(bytes).toString('latin1');
  assert.match(source, /TRACCIAMENTO GPS E COPERTURA/);
  assert.match(source, /Copertura GPS reale: 65%/);
  assert.match(source, /Integrazione manuale Admin: 35%/);
  assert.match(source, /Copertura finale certificata: 100%/);
  // Nessuno screenshot passato (zoneSnapshots: []): deve comparire il
  // placeholder onesto, mai un'immagine finta o rotta.
  assert.match(source, /Mappa non disponibile per questa zona\.|Nessun tracciamento GPS disponibile per questa zona\./);
  // Zona senza calcolo: percentuali esplicitamente "Non disponibile", mai 0%.
  assert.match(source, /Copertura GPS reale: Non disponibile/);
  assert.doesNotMatch(source, /Copertura GPS reale: 0%/);
});
