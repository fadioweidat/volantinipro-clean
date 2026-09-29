import React, { useEffect, useMemo, useState } from 'react';
import {
  buildDriverWhatsAppMessage,
  generateDriverAssignmentLink,
  getClientsQuotesOverview,
  getDailyOperations,
  getRealCampaigns,
  listAssignableOperators,
  selectOptionalTable,
  summarizeLiveOperations,
} from '../../lib/services/admin-api.js';
import { buildOperationalGroups, buildTodayGroupCards } from '../../lib/admin/adminHomeModel.js';
import { buildCommercialSnapshot } from '../../lib/admin/adminCommercialModel.js';
import {
  AdminResourceUnavailableError,
  createAdminRefreshLoop,
  createAdminResourceStore,
  createSingleFlightLoader,
  summarizeAdminResourceStates,
  withAbortTimeout,
} from '../../lib/admin/adminDashboardResilience.js';
import { getCurrentSupabaseUser } from '../../lib/supabaseClient.js';
import { ensureSupabaseSessionBridge } from '../../supabaseClient.js';
import { AdminLayout } from './AdminLayout.jsx';
import { AdminDashboardMetricsPanel } from './admin-dashboard/AdminDashboardMetricsPanel.jsx';
import { AdminDashboardModulesPanel } from './admin-dashboard/AdminDashboardModulesPanel.jsx';
import './admin-dashboard.css';

const AdminCentralAiPanel = React.lazy(() => import('../../components/ai/admin/AdminCentralAiPanel.jsx'));

export { normalizeCampaign } from '../../lib/services/admin-api.js';

export default function AdminDashboard({ onNav, adminSession = null }) {
  const [state, setState] = useState({ loading: true, refreshing: false, error: null, refreshNotice: '', data: emptyData() });
  const [notice, setNotice] = useState('');
  const [adminIdentity, setAdminIdentity] = useState(null);
  // Redesign compattezza (P1): "Strumenti avanzati" era un accordion enorme
  // in fondo pagina. Le stesse 3 route (nessuna nuova, nessuna rimossa)
  // vivono ora in un piccolo popover header "Altri strumenti"; l'Assistente
  // Admin (non una route, un pannello embedded) si attiva/disattiva dallo
  // stesso popover invece di un <details> nested in fondo.
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [showAllToday, setShowAllToday] = useState(false);

  useEffect(() => {
    return createAdminRefreshLoop({
      run: async () => {
        setState((previous) => ({ ...previous, refreshing: !previous.loading }));
        return loadAdminHomeData();
      },
      onResult: (result) => {
        setState({
          loading: false,
          refreshing: false,
          error: null,
          refreshNotice: result.refreshIssues.length
            ? `Aggiornamento parziale: alcuni dati non sono disponibili. Ultimi dati validi mantenuti (${result.refreshIssues.join(', ')}).`
            : '',
          data: result,
        });
      },
      onError: (error) => {
        setState((previous) => ({
          ...previous,
          loading: false,
          refreshing: false,
          error: previous.data.hasAnyData ? null : (error?.message || 'Errore caricamento dashboard admin.'),
          refreshNotice: previous.data.hasAnyData ? 'Aggiornamento non riuscito. Sono mostrati gli ultimi dati validi.' : '',
        }));
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!adminSession) { setAdminIdentity(null); return undefined; }
    getCurrentSupabaseUser(adminSession).then((user) => {
      if (!cancelled && user?.id) setAdminIdentity({ user: { id: String(user.id), email: user.email || null }, role: "admin" });
      else if (!cancelled) setAdminIdentity(null);
    }).catch(() => { if (!cancelled) setAdminIdentity(null); });
    return () => { cancelled = true; };
  }, [adminSession]);

  const { campaigns, todayGroups, groups, liveOperators, liveSummary, availability, clientsQuotes, smartPairing } = state.data;
  const metrics = useMemo(() => state.data.availability.today ? ({
    groups: todayGroups.length,
    online: todayGroups.filter((group) => group.presence.key === 'online').length,
    pending: todayGroups.filter((group) => ['sent', 'opened'].includes(group.program.key)).length,
    problems: todayGroups.filter((group) => group.work.key === 'problem').length,
  }) : ({ groups: '—', online: '—', pending: '—', problems: '—' }), [todayGroups, state.data.availability.today]);
  const commercial = useMemo(() => buildCommercialSnapshot({ campaigns, today: localDateKey(new Date()) }), [campaigns]);
  const groupsOnline = groups.filter((group) => group.presence?.key === 'online').length;
  const clientsStats = useMemo(() => state.data.availability.clientsQuotes ? ({
    pagati: clientsQuotes.filter((row) => row.paymentStatus === 'pagato').length,
    daPagare: clientsQuotes.filter((row) => row.paymentStatus === 'da_pagare').length,
    // "Da assegnare" = campagne reali E pagate senza gruppo/programma: una
    // campagna non ancora pagata o di test non e' operativamente "da
    // assegnare" (nessuno deve mandarci un gruppo finche' non e' pagata).
    daAssegnare: clientsQuotes.filter((row) => row.paymentStatus === 'pagato' && !row.assignment).length,
  }) : ({ pagati: 'Non disponibile', daPagare: 'Non disponibile', daAssegnare: 'Non disponibile' }), [clientsQuotes, state.data.availability.clientsQuotes]);
  const programsStats = useMemo(() => state.data.availability.clientsQuotes ? ({
    pronti: clientsQuotes.filter((row) => row.programStatus !== 'nessun_programma').length,
    daConfermare: clientsQuotes.filter((row) => ['inviato', 'aperto'].includes(row.programStatus)).length,
  }) : ({ pronti: 'Non disponibile', daConfermare: 'Non disponibile' }), [clientsQuotes, state.data.availability.clientsQuotes]);
  const commercialDisplay = useMemo(() => state.data.availability.campaigns ? commercial : ({
    ...commercial,
    metrics: { newToday: 'Non disponibile', toContact: 'Non disponibile', converted: 'Non disponibile', closed: 'Non disponibile' },
  }), [commercial, state.data.availability.campaigns]);
  const smartPairingStats = useMemo(() => ({
    richieste: smartPairing.rows.filter((row) => (row.status || 'open') === 'open').length,
    match: Math.max(smartPairing.rows.length - smartPairing.rows.filter((row) => (row.status || 'open') === 'open').length, 0),
  }), [smartPairing.rows]);

  function openProgramWhatsApp(group) {
    if (!group.phone) { setNotice('Numero WhatsApp non disponibile per il referente di questo programma.'); return; }
    const link = generateDriverAssignmentLink(group.primaryAssignmentId, group.primaryAssignmentAccessToken);
    const text = buildDriverWhatsAppMessage({
      operatorName: group.operatorNames[0],
      groupName: group.name,
      campaignTitle: group.campaign,
      date: group.assignments[0]?.starts_at ? new Date(group.assignments[0].starts_at).toLocaleDateString('it-IT') : null,
      startTime: group.assignments[0]?.starts_at ? new Date(group.assignments[0].starts_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null,
      programRows: group.zones,
      qty: group.quantity,
      link,
    });
    window.open(`https://wa.me/${group.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setNotice('Programma preparato in WhatsApp. Non viene registrato come inviato finché non esiste un evento reale.');
  }

  const headerActions = (
    <div className="admin-home__header-actions">
      <button className="admin-home__primary" type="button" onClick={() => onNav('admin-groups-manager')}>+ Nuovo programma</button>
      <div className="admin-home__tools-menu">
        <button
          type="button"
          className="admin-home__tools-trigger"
          onClick={() => setToolsMenuOpen((v) => !v)}
          aria-expanded={toolsMenuOpen}
          aria-haspopup="true"
        >
          Altri strumenti {toolsMenuOpen ? '▾' : '▸'}
        </button>
        {toolsMenuOpen && (
          <div className="admin-home__tools-popover" role="menu">
            <a href="/admin/operations" role="menuitem" onClick={() => setToolsMenuOpen(false)}>Centrale Operativa</a>
            <a href="/admin/live" role="menuitem" onClick={() => setToolsMenuOpen(false)}>Monitor GPS</a>
            <a href="/admin/operations/report" role="menuitem" onClick={() => setToolsMenuOpen(false)}>Report giornaliero</a>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AdminLayout onNav={onNav} title="Oggi" subtitle="Chi lavora, dove deve andare e cosa richiede attenzione." actions={headerActions}>
      {state.loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {state.error && <Notice danger>{state.error}</Notice>}
          {state.refreshNotice && <Notice warning>{state.refreshNotice}</Notice>}
          {state.refreshing && <div role="status" style={{ margin: '-8px 0 14px', color: 'rgba(255,255,255,.5)', fontSize: 11, fontWeight: 700 }}>Aggiornamento dati…</div>}
          {notice && <Notice>{notice}</Notice>}

          <AdminDashboardMetricsPanel metrics={metrics} Metric={Metric} />

          <section className="admin-home__section" aria-labelledby="today-title">
            <SectionHeading
              id="today-title"
              eyebrow="Operatività"
              title="Chi lavora oggi"
              meta={availability.today ? `${todayGroups.length} gruppi programmati` : 'Dato non disponibile'}
              action={todayGroups.length > 4 ? (showAllToday ? 'Mostra meno' : 'Vedi tutti') : null}
              onAction={() => setShowAllToday((v) => !v)}
            />
            {!availability.today ? <EmptyState text="Programmi di oggi non disponibili." /> : todayGroups.length === 0 ? (
              <EmptyState text="Nessun gruppo programmato per oggi." action="Nuovo programma" onAction={() => onNav('admin-groups-manager')} />
            ) : (
              <div className={showAllToday ? 'admin-home__today-grid admin-home__today-grid--scroll' : 'admin-home__today-grid'}>
                {(showAllToday || todayGroups.length <= 4 ? todayGroups : todayGroups.slice(0, 4)).map((group) => <TodayGroupCard key={group.id} group={group} onWhatsApp={() => openProgramWhatsApp(group)} />)}
              </div>
            )}
          </section>

          <AdminDashboardModulesPanel
            clientsQuotesCount={state.data.availability.clientsQuotes ? clientsQuotes.length : 'Non disponibile'}
            clientsStats={clientsStats}
            groupsCount={state.data.availability.groups ? groups.length : 'Non disponibile'}
            groupsOnline={state.data.availability.groups ? groupsOnline : 'Non disponibile'}
            programsStats={programsStats}
            liveCount={state.data.availability.gps ? (liveSummary.liveCount || 0) : 'Non disponibile'}
            smartPairingAvailable={smartPairing.available}
            smartPairingStats={smartPairingStats}
            commercial={commercialDisplay}
            onNav={onNav}
            ModuleCard={ModuleCard}
          />
        </>
      )}
    </AdminLayout>
  );
}

// PERF (Admin Dashboard lento — audit): questa funzione lanciava
// getRealCampaigns() E getClientsQuotesOverview() nello STESSO Promise.all —
// getClientsQuotesOverview pero' chiama internamente la sua PROPRIA
// getRealCampaigns() (9 query select('*') su campaigns/campagne/
// quote_requests/delivery_sessions/gps_tracking_points/proof_photos/
// operational_groups/operator_assignments/campaign_zones), quindi quelle 9
// query giravano DUE VOLTE in parallelo con se stesse. In piu',
// operational_groups/operator_assignments venivano ri-fetchate qui sotto una
// TERZA volta (groupsResult/assignmentsResult) e listAssignableOperators()
// due volte. getRealCampaigns ora espone anche i suoi sotto-fetch
// (groups/assignments/sessions) e getClientsQuotesOverview accetta un bundle
// "prefetched" per riusarli invece di ri-interrogare le stesse tabelle — vedi
// admin-api.js. Il resto della logica (filtri "solo campagne reali",
// forma del valore ritornato) e' invariato.
// P0 (audit performance Admin autenticato): sotto React.StrictMode (dev)
// l'effect di mount in AdminDashboard gira due volte quasi simultaneamente —
// la guardia `cancelled` esistente blocca solo la SECONDA chiamata a load()
// DOPO che la prima e' gia' partita, ma il fetch della prima invocazione e'
// gia' in volo e non si ferma: risultato, due catene complete di query reali
// in parallelo (confermato dal vivo con misurazione reale Admin autenticato).
// In-flight dedup qui, non un cambio a React.StrictMode: due mount dev
// consumano ora la STESSA Promise/risultato, un solo fetch reale.
const ADMIN_HOME_REQUEST_TIMEOUT_MS = 25_000;
const ADMIN_HOME_COMMERCIAL_TTL_MS = 5 * 60_000;
const ADMIN_HOME_OPERATIONAL_REFERENCE_TTL_MS = 60_000;
const adminHomeResources = createAdminResourceStore();
export const loadAdminHomeData = createSingleFlightLoader(() => (
  withAbortTimeout((signal) => loadAdminHomeDataUncached({ signal }), ADMIN_HOME_REQUEST_TIMEOUT_MS)
));

async function loadAdminHomeDataUncached({ signal }) {
  await ensureSupabaseSessionBridge?.();
  const today = localDateKey(new Date());

  // P0 ROOT CAUSE (misurato dal vivo, Admin autenticato): getLiveOperatorsSummary
  // aveva un N+1 reale (una query gps_tracking_points PER SESSIONE dentro
  // getLiveDrivers) e ri-scaricava delivery_sessions gia' preso da
  // getRealCampaigns — root cause dei suoi 2.7-5.5s cold. getRealCampaigns
  // viene ora atteso PRIMA (non piu' nello stesso Promise.all degli altri 4)
  // cosi' i suoi sessions/points gia' scaricati possono essere passati come
  // prefetched a getLiveOperatorsSummary, eliminando sia l'N+1 sia il doppio
  // fetch — al prezzo di rendere getRealCampaigns non piu' in parallelo con
  // gli altri 4 (che restano paralleli tra loro). AdminLiveDashboard.jsx
  // continua a chiamare getLiveDrivers()/getLiveOperatorsSummary() senza
  // prefetched, comportamento invariato per quella pagina.
  // Phase 1 (parallel): getRealCampaigns runs concurrently with independent operations, operators, and smart_pairing
  const [campaignState, operationsState, operationalReferenceState, operatorsState, smartPairingState] = await Promise.all([
    adminHomeResources.load('commercial-campaigns', () => getRealCampaigns({
      includeTest: true,
      includeGpsPoints: false,
      requireComplete: true,
      signal,
    }), { fallback: emptyCampaignResult(), maxAgeMs: ADMIN_HOME_COMMERCIAL_TTL_MS }),
    adminHomeResources.load(`daily-operations:${today}`, () => getDailyOperations(today, { signal, requireComplete: true }), { fallback: [] }),
    adminHomeResources.load('operational-reference', async () => {
      const [groups, assignments] = await Promise.all([
        selectOptionalTable('operational_groups', 'created_at', '*', null, { signal }),
        selectOptionalTable('operator_assignments', 'created_at', 'id,campaign_id,group_id,operator_id,status,starts_at,ends_at,revoked_at,created_at,access_token', null, { signal }),
      ]);
      const unavailable = [
        ...(!groups.available ? ['operational_groups'] : []),
        ...(!assignments.available ? ['operator_assignments'] : []),
      ];
      if (unavailable.length) throw new AdminResourceUnavailableError(unavailable.join(', '));
      return { groups: groups.rows, assignments: assignments.rows };
    }, { fallback: { groups: [], assignments: [] }, maxAgeMs: ADMIN_HOME_OPERATIONAL_REFERENCE_TTL_MS }),
    adminHomeResources.load('operators', () => listAssignableOperators({ signal }), { fallback: [] }),
    adminHomeResources.load('smart-pairing', async () => {
      const result = await selectOptionalTable('smart_pairing_waitlist', 'created_at', '*', null, { signal });
      if (!result.available) throw new AdminResourceUnavailableError('smart_pairing_waitlist', result.error);
      return result.rows;
    }, { fallback: [], maxAgeMs: ADMIN_HOME_COMMERCIAL_TTL_MS }),
  ]);
  const campaignResult = campaignState.value;
  const operations = { rows: operationsState.value, available: operationsState.available };
  const operationalReference = operationalReferenceState.value;
  const operators = operatorsState.value;

  const realCampaignIds = new Set(campaignResult.allRows.filter((campaign) => campaign.quality === 'real').map((campaign) => campaign.id));
  const realOperations = operations.rows.filter((assignment) => realCampaignIds.has(assignment.campaign_id));
  const realGroups = operationalReference.groups.filter((group) => realCampaignIds.has(group.campaign_id));

  // Il riepilogo live riusa le operazioni giornaliere gia' caricate: la home
  // non esegue una seconda lettura globale delle tracce GPS.
  const liveSummary = summarizeLiveOperations(operations.rows);
  const clientsQuotesState = await adminHomeResources.load('clients-quotes', async () => {
    if (!campaignState.available || !operatorsState.available) {
      throw new AdminResourceUnavailableError('clients-quotes-dependencies');
    }
    return getClientsQuotesOverview({
      prefetched: {
        campaigns: campaignResult.allRows,
        groups: operationalReference.groups,
        assignments: operationalReference.assignments,
        sessions: campaignResult.sessions,
        operators,
      },
      requireComplete: true,
      signal,
    });
  }, { fallback: [], maxAgeMs: ADMIN_HOME_COMMERCIAL_TTL_MS });
  const clientsQuotesResult = clientsQuotesState.value;
  const liveOperators = liveSummary.current || [];
  const states = { campaignState, operationsState, operationalReferenceState, operatorsState, smartPairingState, clientsQuotesState };
  const { refreshIssues, hasAnyData } = summarizeAdminResourceStates(states);
  const availability = {
    ...campaignResult.availability,
    campaigns: campaignState.available,
    today: operationsState.available && campaignState.available,
    groups: operationalReferenceState.available,
    assignments: operationalReferenceState.available,
    gps: operationsState.available,
    operators: operatorsState.available,
    clientsQuotes: clientsQuotesState.available,
  };
  const result = {
    campaigns: campaignResult.allRows,
    todayGroups: buildTodayGroupCards({ operations: realOperations, liveOperators, operators }),
    groups: buildOperationalGroups({ groups: realGroups, assignments: operationalReference.assignments, operators, liveOperators, campaigns: campaignResult.allRows }),
    operators,
    liveOperators,
    liveSummary,
    clientsQuotes: clientsQuotesResult,
    smartPairing: { rows: smartPairingState.value, available: smartPairingState.available },
    availability,
    refreshIssues,
    hasAnyData,
  };
  return result;
}

function TodayGroupCard({ group, onWhatsApp }) {
  const tone = group.work.key === 'problem' ? 'red' : group.work.key === 'started' ? 'blue' : ['sent', 'opened'].includes(group.program.key) ? 'yellow' : group.presence.key === 'online' ? 'green' : 'gray';
  return <article className={`admin-home__today-card admin-home__today-card--${tone}`}><header><div><h3>{group.name}</h3><StatusDot status={group.presence} /></div><span className={`admin-home__work admin-home__work--${tone}`}>{group.work.label}</span></header><dl><div><dt>Campagna</dt><dd>{group.campaign}</dd></div><div><dt>Zona corrente</dt><dd>{group.zoneLabel}</dd></div><div><dt>Quantità assegnata</dt><dd>{group.quantity ? `${group.quantity.toLocaleString('it-IT')} volantini` : 'Dato non disponibile'}</dd></div><div><dt>Programma</dt><dd>{group.program.label}</dd></div></dl>{group.problem && <p className="admin-home__problem">{group.problem}</p>}<footer><a href={generateDriverAssignmentLink(group.primaryAssignmentId, group.primaryAssignmentAccessToken)}>Apri</a><a href="/admin/live">GPS</a><button type="button" onClick={onWhatsApp}>{['sent', 'opened'].includes(group.program.key) ? 'Reinvia WhatsApp' : 'WhatsApp'}</button></footer></article>;
}

function ModuleCard({ title, stats, cta, onOpen }) {
  return (
    <article className="admin-home__module-card">
      <p className="admin-home__module-title">{title}</p>
      <div className="admin-home__module-stats">
        {stats.map((stat) => (
          <div key={stat.label} className={stat.value === 'Non configurato' ? 'admin-home__module-stats--muted' : ''}><span>{stat.label}</span><strong>{stat.value}</strong></div>
        ))}
      </div>
      <button type="button" className="admin-home__module-cta" onClick={onOpen}>{cta}</button>
    </article>
  );
}

function StatusDot({ status }) { return <span className={`admin-home__presence admin-home__presence--${status.key}`}><i />{status.label}</span>; }
function Metric({ label, value, tone }) { return <article className={`admin-home__metric admin-home__metric--${tone}`}><strong>{value}</strong><span>{label}</span></article>; }
function SectionHeading({ id, eyebrow, title, meta, action, onAction }) { return <header className="admin-home__heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div>{action && <button type="button" onClick={onAction}>{action}</button>}</header>; }
function EmptyState({ text, action, onAction }) { return <div className="admin-home__empty"><p>{text}</p>{action && <button type="button" onClick={onAction}>{action}</button>}</div>; }
function Notice({ children, danger = false, warning = false }) {
  const style = warning ? { background: 'rgba(251,191,36,.07)', borderColor: 'rgba(251,191,36,.22)', color: '#fde68a' } : undefined;
  return <div className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`} style={style} role={danger ? 'alert' : 'status'}>{children}</div>;
}
function DashboardSkeleton() {
  return (
    <div className="admin-home__skeleton-wrap" aria-label="Caricamento dashboard">
      <div className="admin-home__skeleton">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="admin-home__section admin-home__skeleton-section">
        <div className="admin-home__skeleton-bar" style={{ width: '130px', height: '12px', marginBottom: '8px' }} />
        <div className="admin-home__skeleton-bar" style={{ width: '210px', height: '22px', marginBottom: '16px' }} />
        <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '76px' }} />
      </div>
      <div className="admin-home__module-grid">
        <div className="admin-home__module-card admin-home__skeleton-card">
          <div className="admin-home__skeleton-bar" style={{ width: '90px', height: '12px', marginBottom: '16px' }} />
          <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '16px', marginBottom: '8px' }} />
          <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '16px', marginBottom: '8px' }} />
          <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '38px', marginTop: '14px' }} />
        </div>
        <div className="admin-home__module-card admin-home__skeleton-card">
          <div className="admin-home__skeleton-bar" style={{ width: '90px', height: '12px', marginBottom: '16px' }} />
          <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '16px', marginBottom: '8px' }} />
          <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '16px', marginBottom: '8px' }} />
          <div className="admin-home__skeleton-bar" style={{ width: '100%', height: '38px', marginTop: '14px' }} />
        </div>
      </div>
    </div>
  );
}

function localDateKey(date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function emptyData() {
  return {
    campaigns: [], todayGroups: [], groups: [], operators: [], liveOperators: [],
    liveSummary: { liveCount: 0, warningCount: 0 }, clientsQuotes: [], smartPairing: { rows: [], available: false },
    availability: { campaigns: false, today: false, groups: false, gps: false, operators: false, clientsQuotes: false },
    refreshIssues: [], hasAnyData: false,
  };
}

function emptyCampaignResult() {
  return {
    rows: [], allRows: [], groups: [], assignments: [], sessions: [], points: [],
    availability: { campaigns: false, sessions: false, gps: false, photos: false, groups: false, assignments: false, zones: false },
  };
}
