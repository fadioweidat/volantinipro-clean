import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AUTOMATIC_MAINTENANCE_ALLOWLIST,
  buildMaintenanceDiagnosisPayload,
  buildMonthlyMaintenanceReport,
  decideMaintenanceRuns,
  evaluatePostFixVerification,
  isAutomaticMaintenanceAction,
  shouldEscalateWarning,
} from '../supabase/functions/platform-health-collector/maintenance.ts';
import { deriveMaintenanceStatus } from '../src/lib/monitoring/maintenanceHistory.js';

test('scheduler daily usa Europe/Rome ed è idempotente per data', () => {
  const now = new Date('2026-09-04T05:05:00.000Z');
  const first = decideMaintenanceRuns({ now });
  assert.equal(first.runDaily, true);
  assert.equal(first.window.dailyMarker, 'maintenance_daily_2026-09-04');
  assert.equal(decideMaintenanceRuns({ now, existingMarkers: [first.window.dailyMarker] }).runDaily, false);
});

test('scheduler monthly gira solo il primo lunedì dopo le 08:00 Rome', () => {
  assert.equal(decideMaintenanceRuns({ now: new Date('2026-09-07T05:55:00.000Z') }).runMonthly, false);
  const due = decideMaintenanceRuns({ now: new Date('2026-09-07T06:05:00.000Z') });
  assert.equal(due.runMonthly, true);
  assert.equal(due.window.monthlyMarker, 'maintenance_monthly_2026-09');
});

test('allowlist non autorizza mai azioni rosse', () => {
  assert.deepEqual([...AUTOMATIC_MAINTENANCE_ALLOWLIST], ['retry_health_check', 'observe_error_log_auto_resolve', 'run_existing_cleanup_job']);
  for (const action of ['deploy', 'migration', 'change_rls', 'change_auth', 'payment_write', 'delete_business_data']) assert.equal(isAutomaticMaintenanceAction(action), false);
});

test('verifica post-fix fallita ferma il ciclo senza retry aggressivo', () => {
  assert.deepEqual(evaluatePostFixVerification(2), { verified: false, stop: true, classification: 'yellow', retryAggressively: false });
  assert.equal(evaluatePostFixVerification(0).verified, true);
});

test('warning persistente viene promosso solo alla terza occorrenza consecutiva', () => {
  assert.equal(shouldEscalateWarning(['warning', 'warning']), false);
  assert.equal(shouldEscalateWarning(['warning', 'fail', 'warning']), true);
  assert.equal(shouldEscalateWarning(['warning', 'ok', 'warning']), false);
});

test('payload AI elimina secret, token e PII', () => {
  const payload = buildMaintenanceDiagnosisPayload({ checkName: 'api', group: 'provider', status: 'warning', message: 'Bearer abc.def.ghi user@example.com 192.168.1.1', checkedAt: '2026-09-04T05:05:00.000Z', occurrenceCount: 3 });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /user@example|192\.168|abc\.def\.ghi|password|service.?role/i);
  assert.match(serialized, /\[redacted\]/);
});

test('report mensile contiene conteggi, problemi e zero azioni rosse automatiche', () => {
  const report = buildMonthlyMaintenanceReport({ monthKey: '2026-09', checks: [{ checkName: 'frontend', status: 'ok' }, { checkName: 'auth', status: 'fail', severity: 'critical', errorMessage: 'HTTP 500' }], autoFixes: [{ action: 'retry' }], diagnoses: [] });
  assert.equal(report.counts.ok, 1);
  assert.equal(report.counts.critical, 1);
  assert.equal(report.counts.automaticRedActions, 0);
  assert.equal(report.problems[0].approvalRequired, true);
});

test('UI deriva storico manutenzione dai marker server esistenti', () => {
  const status = deriveMaintenanceStatus([{ check_name: 'maintenance_daily_2026-09-04', status: 'ok', checked_at: '2026-09-04T05:05:00.000Z', metadata: { summary: { autoFixes: 2, warning: 1, critical: 0 } } }], new Date('2026-09-04T10:00:00.000Z'));
  assert.equal(status.autoFixes, 2);
  assert.equal(status.warnings, 1);
  assert.equal(status.critical, 0);
});

test('configurazione non introduce Vercel Cron né un secondo pg_cron', () => {
  const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  const collector = fs.readFileSync(new URL('../supabase/functions/platform-health-collector/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(vercel, /"crons"/);
  assert.doesNotMatch(collector, /(?:select|perform)\s+cron\.schedule\s*\(/i);
});

test('report mensile: 12 sezioni richieste dal ticket, con schema problema completo', () => {
  const checks = [
    { checkName: 'frontend_reachable', checkGroup: 'frontend', status: 'ok', responseTimeMs: 200 },
    { checkName: 'auth_admin_role_probe', checkGroup: 'auth', status: 'fail', severity: 'critical', errorMessage: 'HTTP 500', checkedAt: '2026-09-07T06:05:00.000Z', persistedForChecks: 4 },
    { checkName: 'gps_stale_sessions', checkGroup: 'gps', status: 'warning', severity: 'warning', errorMessage: '2 sessioni inattive', checkedAt: '2026-09-07T06:05:00.000Z', persistedForChecks: 1 },
  ];
  const report = buildMonthlyMaintenanceReport({ monthKey: '2026-09', checks, autoFixes: [{ action: 'observe_error_log_auto_resolve', result: 'verified', affected: 2, postFixVerification: 'ok' }], diagnoses: [] });

  const expectedSections = ['statoGenerale', 'frontend', 'preventivatore', 'gps', 'marketplace', 'analytics', 'databaseSupabase', 'sicurezza', 'performance', 'azioniEseguite', 'problemiAperti', 'raccomandazioni'];
  assert.deepEqual(Object.keys(report.sections).sort(), [...expectedSections].sort());

  const criticalProblem = report.problems.find((p) => p.module === 'auth_admin_role_probe');
  assert.equal(criticalProblem.severity, 'critical');
  assert.equal(criticalProblem.section, 'sicurezza');
  assert.equal(criticalProblem.detectedAt, '2026-09-07T06:05:00.000Z');
  assert.equal(criticalProblem.cause, 'HTTP 500');
  assert.ok(criticalProblem.proposedAction.length > 0);
  assert.equal(typeof criticalProblem.actionExecuted, 'boolean');
  assert.equal(criticalProblem.finalState, 'in_attesa_approvazione');
  assert.equal(criticalProblem.persistedForChecks, 4);
  assert.equal(criticalProblem.persistent, true);

  assert.equal(report.sections.gps.problems.length, 1);
  assert.equal(report.sections.gps.problems[0].module, 'gps_stale_sessions');
  assert.equal(report.sections.sicurezza.problems.length, 1);
  assert.ok(report.sections.raccomandazioni.items.length > 0);
  assert.match(report.sections.raccomandazioni.items.join(' '), /auth_admin_role_probe.*4 controlli consecutivi/);
});

test('report mensile: sezione performance confronta col mese precedente e non genera azioni rosse', () => {
  const previousReport = { performance: { checks: [{ checkName: 'database', responseTimeMs: 100 }] } };
  const report = buildMonthlyMaintenanceReport({
    monthKey: '2026-09',
    checks: [{ checkName: 'database', checkGroup: 'database', status: 'ok', responseTimeMs: 900 }],
    autoFixes: [],
    diagnoses: [],
    previousReport,
  });
  assert.equal(report.sections.performance.comparedToPreviousMonth, true);
  assert.equal(report.sections.performance.degradedChecks[0].checkName, 'database');
  assert.equal(report.counts.automaticRedActions, 0);
  assert.equal(report.sections.azioniEseguite.automaticRedActions, 0);
});

test('submit-campaign-request: 500 su GET classificato esplicitamente come method_not_supported, mai un falso critical', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/platform-health-collector/index.ts', import.meta.url), 'utf8');
  assert.match(src, /submit-campaign-request.*method_not_supported/s);
  const browserSrc = fs.readFileSync(new URL('../src/lib/monitoring/platformHealth.js', import.meta.url), 'utf8');
  assert.match(browserSrc, /submit-campaign-request.*method_not_supported/s);
});

test('UI: riepilogo manutenzione mensile deriva prossima data, stato ultimo report e warning persistenti', () => {
  const monthlyReport = { counts: { autoFixes: 3, warning: 1, critical: 0 }, problems: [{ module: 'gps_stale_sessions', severity: 'warning', persistedForChecks: 3, persistent: true }] };
  const status = deriveMaintenanceStatus([
    { check_name: 'maintenance_monthly_2026-09', status: 'warning', checked_at: '2026-09-07T06:05:00.000Z', metadata: { report: monthlyReport } },
  ], new Date('2026-09-10T10:00:00.000Z'));
  assert.equal(status.lastMonthlyStatus, 'warning');
  assert.equal(status.monthlyAutoFixes, 3);
  assert.ok(new Date(status.nextMonthlyAt) > new Date('2026-09-10T10:00:00.000Z'));
  assert.equal(status.persistentProblems.length, 1);
  assert.equal(status.persistentProblems[0].module, 'gps_stale_sessions');
});

test('UI: PlatformStatus mostra CTA "Visualizza ultimo report" e la vista leggibile del report mensile', () => {
  const src = fs.readFileSync(new URL('../src/pages/admin/PlatformStatus.jsx', import.meta.url), 'utf8');
  assert.match(src, /Visualizza ultimo report/);
  assert.match(src, /MonthlyReportView/);
  assert.match(src, /Prossima manutenzione mensile/);
  assert.match(src, /persistentProblems/);
});
