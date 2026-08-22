import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAssignmentTimeline,
  buildDailyOperationsReport,
  dailyOperationsReportCsv,
  deriveDailyDriverStatus,
  sessionDurationMs,
} from '../src/lib/operations/dailyOperationsReport.js';
import { resolveAppRoute } from '../src/app/routeResolution.js';

const zone = (status, name = 'Cormano', quantity = 4000, id = name) => ({
  id, zone_id: id, municipality_name: name, quantity,
  campaign_zones: { id, status, priority: 1, quantity_assigned: quantity },
});

test('route Admin giornaliera dedicata e alias', () => {
  assert.equal(resolveAppRoute('/admin/operations/report'), 'admin-daily-report');
  assert.equal(resolveAppRoute('/admin/daily-report'), 'admin-daily-report');
});

test('telemetria usa una RPC batch read-only senza nuove tabelle o payload GPS completo', async () => {
  const api = await readFile(new URL('../src/lib/services/admin-api.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations_legacy_pre_rebaseline_20260821/20260813000100_admin_daily_report_telemetry.sql', import.meta.url), 'utf8');
  const telemetrySource = api.slice(api.indexOf('async function getDailyTelemetryBySession'), api.indexOf('export async function getDailyOperationsReport'));
  assert.match(api, /rpc\('admin_daily_report_telemetry'/);
  assert.match(migration, /count\(\*\).*min\(point\.recorded_at\).*max\(point\.recorded_at\)/s);
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.doesNotMatch(telemetrySource, /select\(['"]\*['"]\)/);
  assert.doesNotMatch(telemetrySource, /\b(lat|lng|geom|accuracy|speed|heading)\b/);
  assert.match(migration, /revoke all on function public\.admin_daily_report_telemetry\(uuid\[\]\) from anon/i);
});

test('la lista distingue i programmi visualizzati dai driver unici del KPI', async () => {
  const page = await readFile(new URL('../src/pages/admin/AdminDailyReport.jsx', import.meta.url), 'utf8');
  assert.match(page, /programmi visualizzati/);
  assert.doesNotMatch(page, /driver visualizzati/);
});

test('driver con tutte le zone completate -> COMPLETATO', () => {
  assert.equal(deriveDailyDriverStatus([zone('Completata'), zone('Completata', 'Varedo')]), 'COMPLETATO');
});

test('una zona bloccata -> PROBLEMA', () => {
  assert.equal(deriveDailyDriverStatus([zone('Completata'), zone('Bloccata', 'Varedo')]), 'PROBLEMA');
});

test('mix completata e da iniziare a giornata conclusa -> PARZIALE', () => {
  assert.equal(deriveDailyDriverStatus([zone('Completata'), zone('Da iniziare', 'Varedo')], { dayClosed: true }), 'PARZIALE');
});

test('nessuna zona iniziata -> NON INIZIATO', () => {
  assert.equal(deriveDailyDriverStatus([zone('Da iniziare'), zone('Da iniziare', 'Varedo')]), 'NON INIZIATO');
});

test('durata sessione usa paused_at/ended_at e non l intervallo globale', () => {
  const first = { status: 'paused', started_at: '2026-08-12T08:00:00Z', paused_at: '2026-08-12T09:15:00Z' };
  const second = { status: 'completed', started_at: '2026-08-12T10:00:00Z', ended_at: '2026-08-12T12:30:00Z' };
  assert.equal(sessionDurationMs(first) + sessionDurationMs(second), (75 + 150) * 60000);
});

test('timeline usa timestamp reali ed e ordinata', () => {
  const timeline = buildAssignmentTimeline({
    logs: [
      { event_type: 'assignment_program_opened', created_at: '2026-08-12T08:01:00Z' },
      { event_type: 'assignment_program_sent', created_at: '2026-08-12T07:55:00Z' },
      { event_type: 'assignment_program_confirmed', created_at: '2026-08-12T08:04:00Z' },
    ],
    sessions: [{ status: 'completed', started_at: '2026-08-12T08:11:00Z', ended_at: '2026-08-12T15:42:00Z' }],
  });
  assert.deepEqual(timeline.map(item => item.label), [
    'Programma inviato', 'Programma aperto', 'Presa in carico confermata', 'Lavoro iniziato', 'Ultima sessione completata',
  ]);
});

test('scenario E2E aggrega KPI, sessioni, GPS, foto e CSV senza quantita completata inventata', () => {
  const assignments = [{
    id: 'assignment-a', operator_id: 'driver-a', campaign_id: 'campaign-a',
    operator_profiles: { display_name: 'Mario Rossi' }, campaigns: { title: 'Campagna A' },
    operator_assignment_zones: [
      zone('Completata', 'Cormano', 4000, 'zone-1'),
      zone('Completata', 'Varedo', 3000, 'zone-2'),
      zone('Parziale', 'Saronno', 5000, 'zone-3'),
    ],
    sessions: [
      { id: 's1', campaign_zone_id: 'zone-1', status: 'completed', started_at: '2026-08-12T08:11:00Z', ended_at: '2026-08-12T09:11:00Z' },
      { id: 's2', campaign_zone_id: 'zone-2', status: 'completed', started_at: '2026-08-12T10:00:00Z', ended_at: '2026-08-12T11:00:00Z' },
      { id: 's3', campaign_zone_id: 'zone-3', status: 'cancelled', started_at: '2026-08-12T12:00:00Z', ended_at: '2026-08-12T12:10:00Z' },
    ],
    logs: [
      { event_type: 'assignment_program_sent', created_at: '2026-08-12T07:55:00Z' },
      { event_type: 'assignment_program_opened', created_at: '2026-08-12T08:01:00Z' },
      { event_type: 'assignment_program_confirmed', created_at: '2026-08-12T08:04:00Z' },
    ],
    alerts: [{ id: 'a1', severity: 'WARNING', message: 'Test alert' }],
  }];
  const telemetryBySession = {
    s1: { gps_count: 2, first_gps_at: '2026-08-12T08:12:00Z', last_gps_at: '2026-08-12T09:10:00Z', photo_count: 2 },
    s2: { gps_count: 2, first_gps_at: '2026-08-12T10:01:00Z', last_gps_at: '2026-08-12T10:59:00Z', photo_count: 1 },
    s3: { gps_count: 1, first_gps_at: '2026-08-12T12:01:00Z', last_gps_at: '2026-08-12T12:01:00Z', photo_count: 1 },
  };
  const report = buildDailyOperationsReport(assignments, { date: '2026-08-12', telemetryBySession, dayClosed: true });
  assert.equal(report.drivers[0].status, 'PARZIALE');
  assert.equal(report.drivers[0].sessionCounts.total, 3);
  assert.equal(report.drivers[0].sessionCounts.completed, 2);
  assert.equal(report.drivers[0].sessionCounts.cancelled, 1);
  assert.equal(report.drivers[0].gpsPointCount, 5);
  assert.equal(report.drivers[0].photoCount, 4);
  assert.equal(report.drivers[0].zones.find(item => item.name === 'Cormano').photoCount, 2);
  assert.equal(report.kpis.quantityAssigned, 12000);
  assert.equal(report.kpis.municipalitiesCompleted, 2);
  assert.equal(report.kpis.municipalitiesPartial, 1);
  assert.equal(report.kpis.alerts, 1);
  assert.equal(Object.hasOwn(report.kpis, 'quantityCompleted'), false);
  const csv = dailyOperationsReportCsv(report);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"quantity_assigned"/);
  assert.match(csv, /"Cormano"/);
  assert.match(csv, /"2"/);
  assert.doesNotMatch(csv, /quantity_completed|distributed_quantity/);
});
