import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getConfigStatus, getPlatformStatusData, getSiteTraffic, resolveErrorLogEntry } from '../../lib/services/admin-api.js';
import { runPlatformHealthCheck } from '../../lib/monitoring/platformHealth.js';
import { computeFlowHealth } from '../../lib/monitoring/platformFlows.js';
import { computeSiteTrafficSummary } from '../../lib/analytics/siteTrafficSummary.js';
import { computeLastOperationalEvents } from '../../lib/monitoring/platformEvents.js';
import { buildPlatformStatusReport } from '../../lib/monitoring/platformReport.js';
import { downloadTextFile } from '../../lib/services/report-utils.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';
import './platform-status.css';

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const SLOW_THRESHOLD_MS = 1500;

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
  const [configStatus, setConfigStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState('');
  const [resolvingId, setResolvingId] = useState(null);
  const mountStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [dashboardLoadMs, setDashboardLoadMs] = useState(null);

  const refreshData = useCallback(async () => {
    try {
      const [data, cfg] = await Promise.all([getPlatformStatusData(), getConfigStatus()]);
      setRawData(data);
      setConfigStatus(cfg);
      setLoadError(null);
      return data;
    } catch (err) {
      setLoadError(err?.message || 'Errore caricamento dati piattaforma.');
      return null;
    }
  }, []);

  const runFullCheck = useCallback(async () => {
    setChecking(true);
    try {
      const data = await refreshData();
      const healthResult = await runPlatformHealthCheck({ getSiteTrafficFn: getSiteTraffic });
      setHealth(healthResult);
      if (!data) setNotice('Controllo completato con dati parziali: alcune tabelle non erano raggiungibili.');
    } finally {
      setChecking(false);
      setLoading(false);
      setDashboardLoadMs(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - mountStartRef.current));
    }
  }, [refreshData]);

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

  const recentErrors = useMemo(() => [...(rawData.errorLog.rows || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 25), [rawData.errorLog.rows]);

  const errorsLast24h = useMemo(() => (rawData.errorLog.rows || []).filter((row) => Date.now() - new Date(row.created_at).getTime() <= WINDOW_24H_MS), [rawData.errorLog.rows]);
  const timeoutsLast24h = useMemo(() => errorsLast24h.filter((row) => /timeout/i.test(row.message || '')), [errorsLast24h]);
  const slowChecks = useMemo(() => (health?.rows || []).filter((row) => Number.isFinite(row.responseTimeMs) && row.responseTimeMs > SLOW_THRESHOLD_MS), [health]);

  async function handleResolve(errorId) {
    setResolvingId(errorId);
    try {
      await resolveErrorLogEntry(errorId);
      setRawData((prev) => ({ ...prev, errorLog: { ...prev.errorLog, rows: prev.errorLog.rows.map((r) => (r.id === errorId ? { ...r, status: 'resolved' } : r)) } }));
    } catch (err) {
      setNotice(err?.message || 'Impossibile aggiornare lo stato dell\'errore.');
    } finally {
      setResolvingId(null);
    }
  }

  function handleDownloadReport() {
    const report = buildPlatformStatusReport({ health, flows, traffic: trafficConfigured ? traffic : null, providers: configStatus?.providers || null, lastEvents });
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
        <SectionHeading id="ccs-errors-title" eyebrow="Errori" title="Errori recenti" meta={rawData.errorLog.available ? `${recentErrors.length} mostrati` : 'error_log non disponibile'} />
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
                    <strong>{row.category}{row.module ? ` · ${row.module}` : ''}</strong>
                    <span>{row.message}</span>
                  </div>
                  <span className="ccs-error-row__meta">{formatRelative(row.created_at)} · {row.severity}{row.request_id ? ` · req: ${row.request_id}` : ''}{row.campaign_id ? ` · campagna: ${String(row.campaign_id).slice(0, 8)}` : ''}</span>
                </div>
                <div className="ccs-error-row__actions">
                  <span className={`ccs-pill ccs-pill--${row.status === 'open' ? 'yellow' : 'green'}`}>{row.status === 'open' ? 'Aperto' : 'Risolto'}</span>
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

function SectionHeading({ id, eyebrow, title, meta }) { return <header className="admin-home__heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div></header>; }
