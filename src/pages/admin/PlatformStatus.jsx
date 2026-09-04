import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getConfigStatus, getPlatformStatusData, getSiteTraffic, resolveErrorLogEntry,
  getPlatformHealthHistory, getPlatformIncidents, insertPlatformHealthChecks,
  getRecentPlatformHealthChecks, getOpenPlatformIncident, insertPlatformIncident, updatePlatformIncident,
  autoResolveOldErrorLogEntry, recoverAbandonedGpsSession,
} from '../../lib/services/admin-api.js';
import { runPlatformHealthCheck } from '../../lib/monitoring/platformHealth.js';
import { computeFlowHealth } from '../../lib/monitoring/platformFlows.js';
import { computeAuthHealth } from '../../lib/monitoring/authHealth.js';
import { recordHealthAndIncidents } from '../../lib/monitoring/healthCollectorClient.js';
import { computeUptimeSummary, computeResponseTimePercentiles, estimateDowntimeMs } from '../../lib/monitoring/healthHistory.js';
import { computeSiteTrafficSummary } from '../../lib/analytics/siteTrafficSummary.js';
import { computeLastOperationalEvents } from '../../lib/monitoring/platformEvents.js';
import { buildPlatformStatusReport } from '../../lib/monitoring/platformReport.js';
import {
  buildControlCenterModel, createControlCenterAuditEntry, executeControlCenterRepair,
  loadControlCenterAudit, saveControlCenterAudit,
} from '../../lib/monitoring/controlCenterEngine.js';
import { deriveMaintenanceStatus } from '../../lib/monitoring/maintenanceHistory.js';
import { runControlCenterDiagnosis } from '../../ai/adapters/controlCenterAdapter.js';
import { downloadTextFile } from '../../lib/services/report-utils.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';
import './platform-status.css';

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const SLOW_THRESHOLD_MS = 1500;
const PROD_ORIGIN = 'www.volantinipro.it';

const STATUS_TONE = { ok: 'green', pass: 'green', warning: 'yellow', unknown: 'yellow', error: 'red', fail: 'red' };

function formatRelative(iso) {
  if (!iso) return 'Mai';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Mai';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return new Date(iso).toLocaleString('it-IT');
  if (diffMs < 60000) return 'Adesso';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)} min fa`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)} h fa`;
  return new Date(iso).toLocaleString('it-IT');
}

function StatusPill({ status, label }) {
  const tone = STATUS_TONE[status] || 'yellow';
  return <span className={`ccs-pill ccs-pill--${tone}`}>{label}</span>;
}

function emptyRawData() {
  return {
    errorLog: { rows: [], available: false },
    campaigns: { allRows: [], availability: {} },
    siteTraffic: { rows: [], available: false },
    assignmentEvents: { rows: [], available: false },
    operatorAssignments: { rows: [], available: false },
    deliverySessions: { rows: [], available: false },
    gpsPoints: { rows: [], available: false },
  };
}

export function PlatformStatus({ onNav }) {
  const [rawData, setRawData] = useState(emptyRawData());
  const [health, setHealth] = useState(null);
  const [authHealth, setAuthHealth] = useState(null);
  const [configStatus, setConfigStatus] = useState(null);
  const [healthHistory, setHealthHistory] = useState({ rows: [], available: false });
  const [incidents, setIncidents] = useState({ rows: [], available: false });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState('');
  const [resolvingId, setResolvingId] = useState(null);
  const [showAllOrigins, setShowAllOrigins] = useState(false);
  const [showResolvedErrors, setShowResolvedErrors] = useState(false);
  const mountStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [dashboardLoadMs, setDashboardLoadMs] = useState(null);
  const [auditLog, setAuditLog] = useState(() => loadControlCenterAudit());
  const [repairingIssueId, setRepairingIssueId] = useState(null);
  const [diagnosingIssueId, setDiagnosingIssueId] = useState(null);
  const [diagnoses, setDiagnoses] = useState({});
  const [approvalIssueId, setApprovalIssueId] = useState(null);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      const [data, cfg] = await Promise.all([getPlatformStatusData(), getConfigStatus()]);
      setRawData(data);
      setConfigStatus(cfg);
      setLoadError(null);
      return { data, cfg };
    } catch (err) {
      setLoadError(err?.message || 'Errore caricamento dati piattaforma.');
      return { data: null, cfg: null };
    }
  }, []);

  const runFullCheck = useCallback(async () => {
    setChecking(true);
    try {
      // HARDENING P3 — parallelizzazione. Prima: refreshData() (dati DB +
      // config) veniva atteso INTERAMENTE prima di lanciare l'health check,
      // e getSiteTraffic() girava due volte (una in getPlatformStatusData,
      // una in runPlatformHealthCheck). Ora: una sola lettura getSiteTraffic
      // condivisa, e le tre operazioni indipendenti (dati DB, config, health
      // check) partono insieme. computeAuthHealth resta dopo perche' dipende
      // da errorLog.rows + cfg.
      const siteTrafficPromise = getSiteTraffic();
      const [data, cfg, healthResult] = await Promise.all([
        getPlatformStatusData({ siteTrafficPromise }).catch(() => null),
        getConfigStatus().catch(() => null),
        runPlatformHealthCheck({ getSiteTrafficFn: () => siteTrafficPromise }),
      ]);
      if (data) { setRawData(data); setLoadError(null); }
      else setLoadError('Errore caricamento dati piattaforma.');
      setConfigStatus(cfg);

      const authHealthResult = await computeAuthHealth({
        lastAdminSignIn: cfg?.lastAdminSignIn,
        lastCustomerSignIn: cfg?.lastCustomerSignIn,
        errorLogRows: data?.errorLog?.rows || [],
      });
      setHealth(healthResult);
      setAuthHealth(authHealthResult);
      if (!data) setNotice('Controllo completato con dati parziali: alcune tabelle non erano raggiungibili.');

      // FASE storico uptime/incidenti: registra questa esecuzione
      // (source='manual', e' l'Admin che ha premuto il pulsante) e
      // aggiorna gli incidenti aperti/risolti di conseguenza. Fire-and-forget
      // fail-soft (vedi admin-api.js): un errore qui non deve mai impedire
      // di vedere lo stato corrente, gia' mostrato sopra.
      try {
        await recordHealthAndIncidents({
          health: healthResult,
          authHealth: authHealthResult,
          configStatus: cfg,
          insertHealthChecks: insertPlatformHealthChecks,
          getRecentChecks: getRecentPlatformHealthChecks,
          getOpenIncident: getOpenPlatformIncident,
          insertIncident: insertPlatformIncident,
          updateIncident: updatePlatformIncident,
        });
      } catch {
        // Non fatale: lo stato corrente resta corretto, solo lo storico
        // di questa singola esecuzione non viene registrato.
      }
      const [historyResult, incidentsResult] = await Promise.all([getPlatformHealthHistory(), getPlatformIncidents()]);
      setHealthHistory(historyResult);
      setIncidents(incidentsResult);
      return { data, cfg, healthResult, authHealthResult };
    } finally {
      setChecking(false);
      setLoading(false);
      setDashboardLoadMs(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - mountStartRef.current));
    }
  }, []);

  useEffect(() => { runFullCheck(); }, [runFullCheck]);

  const flows = useMemo(() => computeFlowHealth({
    errorLogRows: rawData.errorLog.rows,
    siteEvents: rawData.siteTraffic.rows,
    campaigns: rawData.campaigns.allRows,
    assignmentEvents: rawData.assignmentEvents.rows,
    operatorAssignments: rawData.operatorAssignments.rows,
    deliverySessions: rawData.deliverySessions.rows,
    gpsPoints: rawData.gpsPoints.rows,
  }), [rawData]);

  const controlCenter = useMemo(() => buildControlCenterModel({
    health,
    flows,
    errorLogRows: rawData.errorLog.rows,
    deliverySessions: rawData.deliverySessions.rows,
    gpsPoints: rawData.gpsPoints.rows,
    auditLog,
  }), [health, flows, rawData.errorLog.rows, rawData.deliverySessions.rows, rawData.gpsPoints.rows, auditLog]);
  const maintenance = useMemo(() => deriveMaintenanceStatus(healthHistory.rows), [healthHistory.rows]);

  const rememberAudit = useCallback((entry) => {
    setAuditLog((current) => saveControlCenterAudit([entry, ...current]));
  }, []);

  const handleAutoRepair = useCallback(async (problem) => {
    setRepairingIssueId(problem.id);
    setNotice('');
    try {
      const outcome = await executeControlCenterRepair(problem, {
        retryHealth: runFullCheck,
        resolveOldError: autoResolveOldErrorLogEntry,
        recoverAbandonedGps: recoverAbandonedGpsSession,
      });
      rememberAudit(createControlCenterAuditEntry({ problem, action: problem.actionId, mode: 'auto', result: outcome.result, verification: outcome.verification }));
      if (problem.actionId !== 'retry_health_check') await runFullCheck();
      setNotice(`Azione sicura completata. ${outcome.verification}`);
    } catch (err) {
      const verification = err?.message || 'Azione non completata.';
      rememberAudit(createControlCenterAuditEntry({ problem, action: problem.actionId, mode: 'auto', result: 'failed', verification }));
      setNotice(`Auto-repair non eseguito: ${verification}`);
    } finally {
      setRepairingIssueId(null);
    }
  }, [rememberAudit, runFullCheck]);

  const handleDiagnosis = useCallback(async (problem) => {
    setDiagnosingIssueId(problem.id);
    setNotice('');
    try {
      const diagnosis = await runControlCenterDiagnosis(problem);
      setDiagnoses((current) => ({ ...current, [problem.id]: diagnosis }));
      rememberAudit(createControlCenterAuditEntry({ problem, action: 'ai_diagnosis', mode: 'ai', result: 'success', verification: 'Output AI validato e mostrato; nessuna modifica eseguita.' }));
    } catch (err) {
      setNotice(`Analisi AI non disponibile: ${err?.message || 'errore sconosciuto'}`);
    } finally {
      setDiagnosingIssueId(null);
    }
  }, [rememberAudit]);

  const handleApprovalRecord = useCallback((problem) => {
    rememberAudit(createControlCenterAuditEntry({
      problem,
      action: 'approval_requested',
      mode: 'approval',
      result: 'recorded',
      authorizedBy: 'Admin autenticato',
      verification: 'Richiesta registrata; nessuna azione rossa è stata eseguita automaticamente.',
    }));
    setApprovalIssueId(null);
    setNotice('Richiesta di approvazione registrata. Nessuna modifica è stata eseguita.');
  }, [rememberAudit]);

  const uptimeSummary = useMemo(() => computeUptimeSummary(healthHistory.rows), [healthHistory.rows]);
  const perf24h = useMemo(() => {
    const cutoff = Date.now() - WINDOW_24H_MS;
    return computeResponseTimePercentiles(healthHistory.rows.filter((r) => new Date(r.checked_at).getTime() >= cutoff));
  }, [healthHistory.rows]);
  const downtimeEstimateMs = useMemo(() => estimateDowntimeMs(healthHistory.rows.filter((r) => Date.now() - new Date(r.checked_at).getTime() <= WINDOW_24H_MS)), [healthHistory.rows]);
  const openIncidents = useMemo(() => (incidents.rows || []).filter((i) => i.status === 'open').sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at)), [incidents.rows]);
  const resolvedIncidents = useMemo(() => (incidents.rows || [])
    .filter((i) => i.status === 'resolved')
    .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))
    .slice(0, 10), [incidents.rows]);

  const traffic = useMemo(() => computeSiteTrafficSummary(rawData.siteTraffic.rows), [rawData.siteTraffic.rows]);
  const trafficConfigured = rawData.siteTraffic.available && traffic.hasAnyData;

  const lastEvents = useMemo(() => computeLastOperationalEvents({
    campaigns: rawData.campaigns.allRows,
    siteEvents: rawData.siteTraffic.rows,
    assignmentEvents: rawData.assignmentEvents.rows,
    gpsPoints: rawData.gpsPoints.rows,
    errorLogRows: rawData.errorLog.rows,
    lastAdminSignIn: configStatus?.lastAdminSignIn,
    lastCustomerSignIn: configStatus?.lastCustomerSignIn,
  }), [rawData, configStatus]);

  // HARDENING P1 — di default il Centro Controllo mostra SOLO gli errori
  // realmente attivi in produzione: status='open', origin=www.volantinipro.it
  // (localhost/preview esclusi finche' non si spunta il toggle), visti negli
  // ultimi 7 giorni. Le righe storiche senza `origin` restano visibili.
  const errorFilteredRows = useMemo(() => {
    const cutoff = Date.now() - 7 * WINDOW_24H_MS;
    return (rawData.errorLog.rows || []).filter((row) => {
      if (!showResolvedErrors && row.status !== 'open') return false;
      if (!showAllOrigins && row.origin && row.origin !== PROD_ORIGIN) return false;
      const seen = new Date(row.last_seen_at || row.created_at).getTime();
      if (row.status !== 'open' && Number.isFinite(seen) && seen < cutoff) return false;
      return true;
    });
  }, [rawData.errorLog.rows, showAllOrigins, showResolvedErrors]);

  const recentErrors = useMemo(() => [...errorFilteredRows]
    .sort((a, b) => new Date(b.last_seen_at || b.created_at) - new Date(a.last_seen_at || a.created_at))
    .slice(0, 50), [errorFilteredRows]);

  const errorsLast24h = useMemo(() => (rawData.errorLog.rows || []).filter((row) => Date.now() - new Date(row.last_seen_at || row.created_at).getTime() <= WINDOW_24H_MS), [rawData.errorLog.rows]);
  const timeoutsLast24h = useMemo(() => errorsLast24h.filter((row) => /timeout/i.test(row.message || '')), [errorsLast24h]);
  const slowChecks = useMemo(() => (health?.rows || []).filter((row) => Number.isFinite(row.responseTimeMs) && row.responseTimeMs > SLOW_THRESHOLD_MS), [health]);

  async function handleResolve(errorId) {
    setResolvingId(errorId);
    try {
      await resolveErrorLogEntry(errorId);
      setRawData((prev) => ({ ...prev, errorLog: { ...prev.errorLog, rows: prev.errorLog.rows.map((r) => (r.id === errorId ? { ...r, status: 'resolved', resolved_note: 'manual', resolved_at: new Date().toISOString() } : r)) } }));
    } catch (err) {
      setNotice(err?.message || 'Impossibile aggiornare lo stato dell\'errore.');
    } finally {
      setResolvingId(null);
    }
  }

  function handleDownloadReport() {
    const report = buildPlatformStatusReport({ health, flows, traffic: trafficConfigured ? traffic : null, providers: configStatus?.providers || null, lastEvents, authHealth, controlCenter, auditLog, maintenance });
    downloadTextFile(`centro-controllo-sito-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(report, null, 2), 'application/json');
  }

  const commitSha = typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : '';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Centro Controllo Sito' }];

  return (
    <AdminLayout onNav={onNav} title="Centro Controllo Sito" subtitle="Stato reale della piattaforma: nessun dato simulato." breadcrumbs={breadcrumbs}>
      {loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Esecuzione controllo completo...</p>}
      {loadError && <div className="admin-home__notice admin-home__notice--danger" role="alert">{loadError}</div>}
      {notice && <div className="admin-home__notice" role="status">{notice}</div>}

      <div className="ccs-actions">
        <button type="button" onClick={runFullCheck} disabled={checking}>{checking ? 'Controllo in corso...' : 'Esegui controllo completo'}</button>
        <button type="button" onClick={refreshData} disabled={checking}>Aggiorna stato</button>
        <button type="button" onClick={handleDownloadReport} disabled={!health}>Scarica report tecnico (JSON)</button>
      </div>

      <section className="ccs-command" aria-labelledby="ccs-command-title">
        <header className="ccs-command__header">
          <div><p>Centro Controllo 2.0</p><h2 id="ccs-command-title">Stato sito oggi</h2><span>Rilevamento, rischio, diagnosi e verifica post-fix nello stesso flusso operativo.</span></div>
          <StatusPill status={controlCenter.summary.errors > 0 ? 'error' : controlCenter.summary.warnings > 0 ? 'warning' : 'ok'} label={controlCenter.summary.errors > 0 ? 'INTERVENTO' : controlCenter.summary.warnings > 0 ? 'ATTENZIONE' : 'OPERATIVO'} />
        </header>
        <div className="ccs-command__summary">
          <article><strong>{controlCenter.summary.ok}</strong><span>controlli OK</span></article>
          <article><strong>{controlCenter.summary.warnings}</strong><span>warning</span></article>
          <article><strong>{controlCenter.summary.errors}</strong><span>errori</span></article>
          <article><strong>{controlCenter.summary.autoFixed}</strong><span>risolti automaticamente oggi</span></article>
          <article><strong>{controlCenter.summary.suggested}</strong><span>interventi suggeriti</span></article>
        </div>
      </section>

      <section className="admin-home__section" aria-labelledby="ccs-issues-title">
        <SectionHeading id="ccs-issues-title" eyebrow="Triage operativo" title="Problemi rilevati" meta={`${controlCenter.issues.length} segnali raggruppati · auto-fix solo allowlist`} />
        {controlCenter.issues.length === 0 ? <div className="admin-home__empty"><p>Nessun problema operativo rilevato.</p></div> : (
          <div className="ccs-issue-list">
            {controlCenter.issues.map((problem) => <ControlIssueCard
              key={problem.id}
              problem={problem}
              diagnosis={diagnoses[problem.id]}
              lastFix={auditLog.find((row) => row.module === problem.module && row.mode === 'auto')}
              repairing={repairingIssueId === problem.id}
              diagnosing={diagnosingIssueId === problem.id}
              approvalOpen={approvalIssueId === problem.id}
              onRepair={() => handleAutoRepair(problem)}
              onDiagnose={() => handleDiagnosis(problem)}
              onApproval={() => setApprovalIssueId(problem.id)}
              onApprovalConfirm={() => handleApprovalRecord(problem)}
              onApprovalCancel={() => setApprovalIssueId(null)}
            />)}
          </div>
        )}
      </section>

      <section className="admin-home__section" aria-labelledby="ccs-audit-title">
        <SectionHeading id="ccs-audit-title" eyebrow="Report" title="Storico interventi" meta="Audit locale amministrativo; gli auto-fix DB mantengono anche il proprio audit server-side" />
        {auditLog.length === 0 ? <div className="admin-home__empty"><p>Nessun intervento registrato da questo browser.</p></div> : <div className="ccs-audit-list">{auditLog.slice(0, 30).map((row) => <AuditRow key={row.id} row={row} />)}</div>}
      </section>

      <section className="admin-home__section" aria-labelledby="ccs-maintenance-title">
        <SectionHeading id="ccs-maintenance-title" eyebrow="Manutenzione" title="Manutenzione automatica" meta={`${maintenance.scheduler} · ${maintenance.timeZone}`} />
        <div className="ccs-maintenance-grid">
          <article><span>Ultimo controllo giornaliero</span><strong>{formatRelative(maintenance.lastDailyAt)}</strong><StatusPill status={maintenance.lastDailyStatus} label={maintenance.lastDailyStatus === 'ok' ? 'VERIFICATO' : maintenance.lastDailyStatus === 'warning' ? 'DA REVISIONARE' : 'IN ATTESA'} /></article>
          <article><span>Prossimo controllo giornaliero</span><strong>{new Date(maintenance.nextDailyAt).toLocaleString('it-IT')}</strong><small>Ogni giorno alle 07:00</small></article>
          <article><span>Ultima manutenzione mensile</span><strong>{formatRelative(maintenance.lastMonthlyAt)}</strong><StatusPill status={maintenance.lastMonthlyStatus} label={maintenance.lastMonthlyStatus === 'ok' ? 'VERIFICATO' : maintenance.lastMonthlyStatus === 'warning' ? 'DA REVISIONARE' : 'IN ATTESA'} /></article>
          <article><span>Prossima manutenzione mensile</span><strong>{new Date(maintenance.nextMonthlyAt).toLocaleString('it-IT')}</strong><small>Primo lunedì del mese alle 08:00</small></article>
          <article><span>Auto-fix eseguiti</span><strong>{maintenance.autoFixes ?? '—'}</strong><small>Ultimo ciclo giornaliero</small></article>
          <article><span>Auto-fix ultimo mese</span><strong>{maintenance.monthlyAutoFixes ?? '—'}</strong><small>Ultimo report mensile</small></article>
          <article><span>Warning aperti</span><strong>{maintenance.warnings ?? '—'}</strong><StatusPill status={maintenance.warnings == null ? 'unknown' : maintenance.warnings ? 'warning' : 'ok'} label={maintenance.warnings == null ? 'IN ATTESA' : maintenance.warnings ? 'ATTENZIONE' : 'NESSUNO'} /></article>
          <article><span>Critical aperti</span><strong>{maintenance.critical ?? '—'}</strong><StatusPill status={maintenance.critical == null ? 'unknown' : maintenance.critical ? 'error' : 'ok'} label={maintenance.critical == null ? 'IN ATTESA' : maintenance.critical ? 'APPROVAZIONE' : 'NESSUNO'} /></article>
        </div>
        {maintenance.persistentProblems?.length > 0 && (
          <div className="admin-home__notice admin-home__notice--danger" role="alert">
            <strong>Warning persistenti — solo segnalazione, nessuna correzione automatica</strong>
            <ul>
              {maintenance.persistentProblems.map((problem) => (
                <li key={problem.module}>{problem.module}: stato {problem.severity} da {problem.persistedForChecks} controlli consecutivi.</li>
              ))}
            </ul>
          </div>
        )}
        <div className="ccs-actions">
          <button type="button" onClick={() => setShowMonthlyReport((v) => !v)} disabled={!maintenance.monthlyReport}>
            {showMonthlyReport ? 'Nascondi ultimo report' : 'Visualizza ultimo report'}
          </button>
        </div>
        {showMonthlyReport && maintenance.monthlyReport && <MonthlyReportView report={maintenance.monthlyReport} />}
        <div className="admin-home__source-note"><strong>Politica automatica</strong><span>Solo retry, osservazione dell’auto-resolve ≥72h e cleanup non distruttivi già previsti. Codice, deploy, DB, RLS, Auth, pagamenti e cancellazioni richiedono sempre approvazione.</span></div>
      </section>

      {/* BLOCCO 1 — Stato generale piattaforma */}
      <section className="admin-home__section" aria-labelledby="ccs-health-title">
        <SectionHeading id="ccs-health-title" eyebrow="Stato generale" title="Stato piattaforma" meta={health ? `Ultimo controllo: ${formatRelative(health.checkedAt)}` : 'In attesa del primo controllo'} />
        <div className="ccs-health-grid">
          {(health?.rows || []).map((row) => (
            <article key={row.key} className={`ccs-health-card ccs-health-card--${STATUS_TONE[row.status] || 'yellow'}`}>
              <div className="ccs-health-card__top"><span>{row.label}</span><StatusPill status={row.status} label={row.statusLabel} /></div>
              {Number.isFinite(row.responseTimeMs) && <span className="ccs-health-card__timing">{row.responseTimeMs} ms</span>}
              {row.error && <span className="ccs-health-card__error">{row.error}</span>}
            </article>
          ))}
        </div>
        <div className="admin-home__source-note">
          <strong>Versione</strong>
          <span>Commit: {commitSha ? commitSha.slice(0, 10) : 'non disponibile (build locale)'} {buildTime ? `· Build: ${new Date(buildTime).toLocaleString('it-IT')}` : ''}</span>
        </div>
      </section>

      {/* BLOCCO 2 — Errori recenti */}
      <section className="admin-home__section" aria-labelledby="ccs-errors-title">
        <SectionHeading id="ccs-errors-title" eyebrow="Errori" title="Errori realmente attivi" meta={rawData.errorLog.available ? `${recentErrors.length} mostrati${showAllOrigins ? '' : ` · solo ${PROD_ORIGIN}`}${showResolvedErrors ? '' : ' · solo aperti'}` : 'error_log non disponibile'} />
        {rawData.errorLog.available && (
          <div className="ccs-error-filters">
            <label><input type="checkbox" checked={showAllOrigins} onChange={(e) => setShowAllOrigins(e.target.checked)} /> Mostra anche localhost / anteprime</label>
            <label><input type="checkbox" checked={showResolvedErrors} onChange={(e) => setShowResolvedErrors(e.target.checked)} /> Mostra anche risolti (ultimi 7 giorni)</label>
          </div>
        )}
        {!rawData.errorLog.available ? (
          <div className="admin-home__empty"><p>Nessun sistema di log errori disponibile (tabella error_log non raggiungibile).</p></div>
        ) : recentErrors.length === 0 ? (
          <div className="admin-home__empty"><p>Nessun errore registrato.</p></div>
        ) : (
          <div className="ccs-error-list">
            {recentErrors.map((row) => (
              <article key={row.id} className={`ccs-error-row ccs-error-row--${row.severity}`}>
                <div className="ccs-error-row__main">
                  <div>
                    <strong>{row.category}{row.module ? ` · ${row.module}` : ''}{Number(row.occurrence_count) > 1 ? ` · ${row.occurrence_count}×` : ''}</strong>
                    <span>{row.message}</span>
                  </div>
                  <span className="ccs-error-row__meta">
                    primo: {formatRelative(row.created_at)} · ultimo: {formatRelative(row.last_seen_at || row.created_at)} · {row.severity}
                    {row.release ? ` · rel: ${String(row.release).slice(0, 7)}` : ''}
                    {row.origin ? ` · ${row.origin}` : ''}
                    {row.request_id ? ` · req: ${row.request_id}` : ''}{row.campaign_id ? ` · campagna: ${String(row.campaign_id).slice(0, 8)}` : ''}
                  </span>
                </div>
                <div className="ccs-error-row__actions">
                  <span className={`ccs-pill ccs-pill--${row.status === 'open' ? 'yellow' : 'green'}`}>{row.status === 'open' ? 'Aperto' : (row.resolved_note === 'auto' ? 'Auto-risolto' : 'Risolto')}</span>
                  {row.status === 'open' && <button type="button" onClick={() => handleResolve(row.id)} disabled={resolvingId === row.id}>{resolvingId === row.id ? 'Attendi...' : 'Segna risolto'}</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* BLOCCO 3 — Flussi critici */}
      <section className="admin-home__section" aria-labelledby="ccs-flows-title">
        <SectionHeading id="ccs-flows-title" eyebrow="Health" title="Health dei flussi critici" meta="Basato su dati reali delle ultime 24h" />
        <div className="ccs-flow-list">
          {flows.map((f) => (
            <article key={f.key} className="ccs-flow-row">
              <span className="ccs-flow-row__label">{f.label}</span>
              <StatusPill status={f.status} label={f.status === 'pass' ? 'PASS' : f.status === 'warning' ? 'WARNING' : 'FAIL'} />
              <span className="ccs-flow-row__reason">{f.reason}</span>
              <span className="ccs-flow-row__checked">{formatRelative(f.lastChecked)}</span>
            </article>
          ))}
        </div>
      </section>

      {/* BLOCCO 3b — Login system (FASE login health check reale) */}
      <section className="admin-home__section" aria-labelledby="ccs-auth-title">
        <SectionHeading id="ccs-auth-title" eyebrow="Login" title="Sistema di login" meta={authHealth ? `Ultimo controllo: ${formatRelative(authHealth.checkedAt)}` : 'In attesa del primo controllo'} />
        {authHealth ? (
          <div className="ccs-flow-list">
            <article className="ccs-flow-row">
              <span className="ccs-flow-row__label">Supabase Auth (infrastruttura)</span>
              <StatusPill status={authHealth.infrastructure.status === 'OK' ? 'ok' : 'error'} label={authHealth.infrastructure.status} />
              <span className="ccs-flow-row__reason">{authHealth.infrastructure.error || `Endpoint raggiungibile${Number.isFinite(authHealth.infrastructure.responseTimeMs) ? ` (${authHealth.infrastructure.responseTimeMs} ms)` : ''}`}</span>
            </article>
            <article className="ccs-flow-row">
              <span className="ccs-flow-row__label">Login Cliente — contratto</span>
              <StatusPill status={authHealth.clientContract.status === 'PASS' ? 'pass' : 'fail'} label={authHealth.clientContract.status} />
              <span className="ccs-flow-row__reason">Instradamento/sessione: {authHealth.clientContract.checks.filter((c) => c.pass).length}/{authHealth.clientContract.checks.length} verifiche superate</span>
            </article>
            <article className="ccs-flow-row">
              <span className="ccs-flow-row__label">Login Admin — contratto</span>
              <StatusPill status={authHealth.adminContract.status === 'PASS' ? 'pass' : 'fail'} label={authHealth.adminContract.status} />
              <span className="ccs-flow-row__reason">Instradamento/ruolo fail-closed: {authHealth.adminContract.checks.filter((c) => c.pass).length}/{authHealth.adminContract.checks.length} verifiche superate{authHealth.adminContract.liveProbe.status === 'error' ? ' — sonda live jwt_is_admin fallita' : ''}</span>
            </article>
            <article className="ccs-flow-row">
              <span className="ccs-flow-row__label">Login Cliente — evidenza reale</span>
              <StatusPill status={authHealth.clientRealLogin.status === 'OK_RECENT' ? 'pass' : authHealth.clientRealLogin.status === 'ERROR_RECENT' ? 'fail' : 'warning'} label={authHealth.clientRealLogin.status === 'NO_RECENT_EVIDENCE' ? 'NESSUNA EVIDENZA RECENTE' : authHealth.clientRealLogin.status} />
              <span className="ccs-flow-row__reason">{authHealth.clientRealLogin.reason}</span>
            </article>
            <article className="ccs-flow-row">
              <span className="ccs-flow-row__label">Login Admin — evidenza reale</span>
              <StatusPill status={authHealth.adminRealLogin.status === 'OK_RECENT' ? 'pass' : authHealth.adminRealLogin.status === 'ERROR_RECENT' ? 'fail' : 'warning'} label={authHealth.adminRealLogin.status === 'NO_RECENT_EVIDENCE' ? 'NESSUNA EVIDENZA RECENTE' : authHealth.adminRealLogin.status} />
              <span className="ccs-flow-row__reason">{authHealth.adminRealLogin.reason}</span>
            </article>
          </div>
        ) : (
          <div className="admin-home__empty"><p>In attesa del primo controllo.</p></div>
        )}
      </section>

      {/* BLOCCO 4 — Traffico e funnel */}
      <section className="admin-home__section" aria-labelledby="ccs-traffic-title">
        <SectionHeading id="ccs-traffic-title" eyebrow="Traffico" title="Traffico e funnel" meta={trafficConfigured ? 'Fonte: site_events' : 'Analytics non configurata'} />
        {trafficConfigured ? (
          <div className="admin-home__traffic-grid">
            <article><strong>{traffic.visitorsToday}</strong><span>Visitatori oggi</span></article>
            <article><strong>{traffic.sessionsToday}</strong><span>Sessioni oggi</span></article>
            <article><strong>{traffic.quotesStartedToday}</strong><span>Preventivi iniziati</span></article>
            <article><strong>{traffic.quotesCompletedToday}</strong><span>Preventivi completati</span></article>
            <article><strong>{traffic.consultationRequestsToday}</strong><span>Richieste consulenza</span></article>
            <article><strong>{traffic.conversionRate == null ? '—' : `${Math.round(traffic.conversionRate * 100)}%`}</strong><span>Conversioni</span></article>
          </div>
        ) : (
          <div className="admin-home__empty"><p>Analytics non configurata. Nessun valore stimato.</p></div>
        )}
      </section>

      {/* BLOCCO 5 — Performance */}
      <section className="admin-home__section" aria-labelledby="ccs-perf-title">
        <SectionHeading id="ccs-perf-title" eyebrow="Performance" title="Performance" meta="Misurata dal vivo durante questo controllo" />
        <div className="admin-home__traffic-grid">
          <article><strong>{health?.rows?.find((r) => r.key === 'api')?.responseTimeMs ?? '—'} ms</strong><span>Tempo risposta API</span></article>
          <article><strong>{health?.rows?.find((r) => r.key === 'supabase')?.responseTimeMs ?? '—'} ms</strong><span>Tempo risposta Supabase</span></article>
          <article><strong>{dashboardLoadMs != null ? `${dashboardLoadMs} ms` : '—'}</strong><span>Caricamento dashboard</span></article>
          <article><strong>{rawData.errorLog.available ? errorsLast24h.length : '—'}</strong><span>Richieste fallite (24h)</span></article>
          <article><strong>{slowChecks.length}</strong><span>Servizi lenti (&gt;{SLOW_THRESHOLD_MS}ms)</span></article>
          <article><strong>{rawData.errorLog.available ? timeoutsLast24h.length : '—'}</strong><span>Timeout recenti (24h)</span></article>
        </div>
        {slowChecks.length > 0 && <div className="admin-home__source-note"><strong>Servizi lenti</strong><span>{slowChecks.map((s) => `${s.label} (${s.responseTimeMs}ms)`).join(', ')}</span></div>}
      </section>

      {/* BLOCCO 5b — Storico uptime (FASE alert automatici + storico) */}
      <section className="admin-home__section" aria-labelledby="ccs-uptime-title">
        <SectionHeading id="ccs-uptime-title" eyebrow="Storico" title="Storico uptime" meta={healthHistory.available ? `${healthHistory.rows.length} campioni (ultimi 30 giorni)` : 'Storico non disponibile'} />
        {!healthHistory.available ? (
          <div className="admin-home__empty"><p>Storico non ancora disponibile (tabella platform_health_checks non raggiungibile).</p></div>
        ) : (
          <div className="admin-home__traffic-grid">
            {['24h', '7d', '30d'].map((label) => {
              const u = uptimeSummary[label];
              return (
                <article key={label}>
                  <strong>{u.status === 'INSUFFICIENT_DATA' ? 'Storico non ancora sufficiente' : `${u.uptimePercent}%`}</strong>
                  <span>Uptime {label}{u.status === 'OK' ? ` · ${u.sampleCount} check, ${u.failCount} falliti` : ''}</span>
                </article>
              );
            })}
            <article><strong>{openIncidents.length}</strong><span>Incidenti aperti</span></article>
            <article><strong>{incidents.rows.length}</strong><span>Incidenti totali registrati</span></article>
            <article><strong>{Math.round(downtimeEstimateMs / 60000)} min</strong><span>Downtime stimato (24h)</span></article>
          </div>
        )}
      </section>

      {/* BLOCCO 5c — Incidenti */}
      <section className="admin-home__section" aria-labelledby="ccs-incidents-title">
        <SectionHeading id="ccs-incidents-title" eyebrow="Alert" title="Incidenti" meta="Aperti automaticamente solo dopo soglia deterministica, mai su un singolo jitter" />
        <div className="admin-home__source-note"><strong>Incidenti aperti</strong></div>
        {openIncidents.length === 0 ? (
          <div className="admin-home__empty"><p>Nessun incidente aperto.</p></div>
        ) : (
          <div className="ccs-error-list">
            {openIncidents.map((inc) => (
              <article key={inc.id} className={`ccs-error-row ccs-error-row--${inc.severity}`}>
                <div className="ccs-error-row__main">
                  <div><strong>{inc.check_name}</strong><span>{inc.summary}</span></div>
                  <span className="ccs-error-row__meta">Iniziato {formatRelative(inc.started_at)} · ultimo rilevamento {formatRelative(inc.last_seen_at)} · {inc.occurrence_count} occorrenze</span>
                </div>
                <StatusPill status={inc.severity === 'critical' ? 'error' : 'warning'} label={inc.severity.toUpperCase()} />
              </article>
            ))}
          </div>
        )}
        <div className="admin-home__source-note" style={{ marginTop: 16 }}><strong>Incidenti risolti recenti</strong></div>
        {resolvedIncidents.length === 0 ? (
          <div className="admin-home__empty"><p>Nessun incidente risolto di recente.</p></div>
        ) : (
          <div className="ccs-error-list">
            {resolvedIncidents.map((inc) => (
              <article key={inc.id} className="ccs-error-row">
                <div className="ccs-error-row__main">
                  <div><strong>{inc.check_name}</strong><span>Durata: {Math.round((new Date(inc.resolved_at) - new Date(inc.started_at)) / 60000)} min</span></div>
                  <span className="ccs-error-row__meta">Risolto {formatRelative(inc.resolved_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* BLOCCO 5d — Performance storica */}
      <section className="admin-home__section" aria-labelledby="ccs-perf-history-title">
        <SectionHeading id="ccs-perf-history-title" eyebrow="Performance" title="Performance (storico)" meta="p50/p95 sui campioni delle ultime 24h" />
        {perf24h.status === 'INSUFFICIENT_DATA' ? (
          <div className="admin-home__empty"><p>Storico non ancora sufficiente ({perf24h.sampleCount} campioni).</p></div>
        ) : (
          <div className="admin-home__traffic-grid">
            <article><strong>{perf24h.p50} ms</strong><span>p50 (24h)</span></article>
            <article><strong>{perf24h.p95} ms</strong><span>p95 (24h)</span></article>
            <article><strong>{perf24h.sampleCount}</strong><span>Campioni (24h)</span></article>
          </div>
        )}
      </section>

      {/* BLOCCO 6 — Stato servizi esterni */}
      <section className="admin-home__section" aria-labelledby="ccs-providers-title">
        <SectionHeading id="ccs-providers-title" eyebrow="Provider" title="Stato servizi esterni" meta={configStatus?.available ? 'Fonte: config-status' : 'Solo Mapbox verificabile lato client'} />
        <div className="ccs-provider-grid">
          <ProviderRow label="Supabase" configured={Boolean(import.meta.env.VITE_SUPABASE_URL)} />
          <ProviderRow label="Mapbox" configured={Boolean(import.meta.env.VITE_MAPBOX_TOKEN)} />
          <ProviderRow label="Google Places" configured={configStatus?.providers?.googlePlaces} unknown={!configStatus?.available} />
          <ProviderRow label="Foursquare" configured={configStatus?.providers?.foursquare} unknown={!configStatus?.available} />
          <ProviderRow label="Resend" configured={configStatus?.providers?.resend} unknown={!configStatus?.available} />
          <ProviderRow label="OpenAI" configured={configStatus?.providers?.openai} unknown={!configStatus?.available} />
        </div>
      </section>

      {/* BLOCCO 8 — Ultimi eventi operativi */}
      <section className="admin-home__section" aria-labelledby="ccs-events-title">
        <SectionHeading id="ccs-events-title" eyebrow="Eventi" title="Ultimi eventi operativi" />
        <div className="ccs-event-list">
          <EventRow label="Ultima campagna creata" event={lastEvents.lastCampaignCreated} />
          <EventRow label="Ultimo preventivo completato" event={lastEvents.lastQuoteCompleted} />
          <EventRow label="Ultimo login admin" event={lastEvents.lastAdminLogin} unknown={!configStatus?.available} />
          <EventRow label="Ultimo login cliente" event={lastEvents.lastCustomerLogin} unknown={!configStatus?.available} />
          <EventRow label="Ultimo programma creato" event={lastEvents.lastProgramCreated} />
          <EventRow label="Ultimo GPS ricevuto" event={lastEvents.lastGpsReceived} />
          <EventRow label="Ultima Edge Function con errore" event={lastEvents.lastEdgeFunctionError} detail={lastEvents.lastEdgeFunctionError?.message} />
        </div>
      </section>
    </AdminLayout>
  );
}

function ProviderRow({ label, configured, unknown }) {
  const state = unknown ? 'unknown' : configured ? 'ok' : 'error';
  const text = unknown ? 'NON VERIFICABILE' : configured ? 'CONFIGURATO' : 'NON CONFIGURATO';
  return <article className="ccs-provider-row"><span>{label}</span><StatusPill status={state} label={text} /></article>;
}

function EventRow({ label, event, unknown, detail }) {
  return (
    <article className="ccs-event-row">
      <span className="ccs-event-row__label">{label}</span>
      <span className="ccs-event-row__value">{unknown ? 'Non disponibile' : event ? formatRelative(event.at) : 'Nessun evento registrato'}</span>
      {detail && <span className="ccs-event-row__detail">{detail}</span>}
    </article>
  );
}

function ControlIssueCard({ problem, diagnosis, lastFix, repairing, diagnosing, approvalOpen, onRepair, onDiagnose, onApproval, onApprovalConfirm, onApprovalCancel }) {
  const statusLabel = problem.state === 'error' ? '🔴 Errore' : problem.state === 'warning' ? '⚠️ Warning' : '✅ OK';
  const riskLabel = problem.risk === 'green' ? 'VERDE · azione sicura' : problem.risk === 'red' ? 'ROSSO · approvazione' : 'GIALLO · diagnosi AI';
  return <article className={`ccs-issue ccs-issue--${problem.risk}`}>
    <div className="ccs-issue__rail"><span className={`ccs-issue__state ccs-issue__state--${problem.state}`}>{statusLabel}</span><span className={`ccs-issue__risk ccs-issue__risk--${problem.risk}`}>{riskLabel}</span></div>
    <div className="ccs-issue__content">
      <div className="ccs-issue__field"><span>Problema</span><strong>{problem.problem}</strong></div>
      <div className="ccs-issue__field"><span>Causa probabile</span><p>{problem.probableCause}</p></div>
      <div className="ccs-issue__meta"><span>Modulo: {problem.module}</span><span>Ultimo controllo: {formatRelative(problem.checkedAt)}</span><span>Ultimo fix: {lastFix ? formatRelative(lastFix.at) : 'Mai'}</span></div>
      {diagnosis && <div className="ccs-diagnosis" aria-live="polite">
        <div><span>Causa AI</span><p>{diagnosis.probableCause}</p></div>
        <div><span>Impatto</span><p>{diagnosis.impact}</p></div>
        <div><span>Urgenza</span><strong>{diagnosis.urgency.toUpperCase()}</strong></div>
        <div><span>Fix suggerito</span><p>{diagnosis.suggestedFix}</p></div>
        <small>{diagnosis.autoResolvable ? 'L’AI lo considera compatibile con una riparazione sicura; decide comunque l’allowlist locale.' : 'Intervento non autorizzato all’esecuzione automatica.'}</small>
      </div>}
      {approvalOpen && <div className="ccs-approval" role="group" aria-label="Conferma richiesta di approvazione">
        <strong>Nessuna azione verrà eseguita.</strong><p>Conferma soltanto la registrazione della richiesta per revisione umana.</p>
        <div><button type="button" onClick={onApprovalConfirm}>Registra richiesta</button><button type="button" onClick={onApprovalCancel}>Annulla</button></div>
      </div>}
    </div>
    <div className="ccs-issue__actions">
      {problem.risk === 'green' && <button type="button" onClick={onRepair} disabled={repairing}>{repairing ? 'Verifica in corso…' : problem.actionLabel}</button>}
      {problem.risk === 'yellow' && <button type="button" onClick={onDiagnose} disabled={diagnosing}>{diagnosing ? 'Analisi in corso…' : 'Analizza problema'}</button>}
      {problem.risk === 'red' && <><button type="button" className="ccs-button--danger" onClick={onApproval}>Richiede approvazione</button><button type="button" className="ccs-button--quiet" onClick={onDiagnose} disabled={diagnosing}>{diagnosing ? 'Analisi…' : 'Analizza problema'}</button></>}
    </div>
  </article>;
}

function AuditRow({ row }) {
  return <article className="ccs-audit-row">
    <div><strong>{row.problem}</strong><span>{row.action} · {row.actor}{row.authorizedBy ? ` · autorizzato da ${row.authorizedBy}` : ''}</span></div>
    <div><StatusPill status={row.result === 'failed' ? 'error' : 'ok'} label={row.result === 'success' ? 'VERIFICATO' : row.result === 'failed' ? 'FALLITO' : 'REGISTRATO'} /><time dateTime={row.at}>{formatRelative(row.at)}</time></div>
    <p>{row.verification}</p>
  </article>;
}

function SectionHeading({ id, eyebrow, title, meta }) { return <header className="admin-home__heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div></header>; }

// Versione leggibile (Admin UI) del report mensile JSON strutturato — le
// stesse 12 sezioni richieste dal ticket, nessun dato ricalcolato qui: solo
// presentazione di cio' che buildMonthlyMaintenanceReport() ha gia' prodotto.
const MONTHLY_SECTION_LABELS = {
  statoGenerale: '1. Stato generale', frontend: '2. Frontend', preventivatore: '3. Preventivatore', gps: '4. GPS',
  marketplace: '5. Marketplace', analytics: '6. Analytics', databaseSupabase: '7. Database/Supabase', sicurezza: '8. Sicurezza',
  performance: '9. Performance', azioniEseguite: '10. Azioni eseguite', problemiAperti: '11. Problemi aperti', raccomandazioni: '12. Raccomandazioni',
};
const MONTHLY_SECTION_ORDER = ['statoGenerale', 'frontend', 'preventivatore', 'gps', 'marketplace', 'analytics', 'databaseSupabase', 'sicurezza', 'performance', 'azioniEseguite', 'problemiAperti', 'raccomandazioni'];

function MonthlyProblemRow({ problem }) {
  return (
    <article className="ccs-audit-row">
      <div><strong>{problem.module}</strong><StatusPill status={problem.severity === 'critical' ? 'error' : 'warning'} label={problem.severity === 'critical' ? 'CRITICAL' : 'WARNING'} /></div>
      <p>Rilevato il {new Date(problem.detectedAt).toLocaleString('it-IT')} · Causa: {problem.cause || 'n/d'}</p>
      <p>Azione proposta: {problem.proposedAction}</p>
      <p>Azione eseguita: {problem.actionExecuted ? 'sì' : 'no'} · Verifica post-fix: {problem.postFixVerification || 'n/d'} · Stato finale: {problem.finalState}</p>
      {problem.persistent && <p>Persiste da {problem.persistedForChecks} controlli consecutivi.</p>}
    </article>
  );
}

function MonthlyReportView({ report }) {
  const sections = report.sections || {};
  return (
    <div className="ccs-monthly-report">
      <h3>{report.title}</h3>
      <p>Generato il {new Date(report.generatedAt).toLocaleString('it-IT')} — {report.counts.ok} OK, {report.counts.warning} warning, {report.counts.critical} critical, {report.counts.autoFixes} auto-fix, {report.counts.aiDiagnoses} diagnosi AI, {report.counts.automaticRedActions} azioni rosse eseguite.</p>
      {MONTHLY_SECTION_ORDER.map((key) => {
        const section = sections[key];
        if (!section) return null;
        return (
          <section key={key} className="ccs-monthly-report__section">
            <h4>{MONTHLY_SECTION_LABELS[key]}</h4>
            {key === 'statoGenerale' && <p>{section.summaryText}</p>}
            {key === 'raccomandazioni' && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            {key === 'azioniEseguite' && (
              section.autoFixes.length === 0 ? <p>Nessun auto-fix eseguito.</p> : <ul>{section.autoFixes.map((fix, i) => <li key={i}>{fix.action}: {fix.result} ({fix.affected ?? 0} interessati)</li>)}</ul>
            )}
            {(key === 'frontend' || key === 'preventivatore' || key === 'gps' || key === 'marketplace' || key === 'analytics' || key === 'databaseSupabase' || key === 'sicurezza') && (
              section.problems.length === 0 ? <p>Nessun problema in questa sezione.</p> : section.problems.map((problem) => <MonthlyProblemRow key={problem.module} problem={problem} />)
            )}
            {key === 'performance' && (
              section.slowChecks.length === 0 ? <p>Nessun controllo lento (soglia 1500 ms).</p> : <ul>{section.slowChecks.map((c) => <li key={c.checkName}>{c.checkName}: {c.responseTimeMs} ms</li>)}</ul>
            )}
            {key === 'problemiAperti' && (
              section.problems.length === 0 ? <p>Nessun problema aperto.</p> : section.problems.map((problem) => <MonthlyProblemRow key={problem.module} problem={problem} />)
            )}
          </section>
        );
      })}
    </div>
  );
}
