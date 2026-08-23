import React, { useEffect, useMemo, useState } from 'react';
import {
  buildDriverWhatsAppMessage,
  generateDriverAssignmentLink,
  getClientsQuotesOverview,
  getDailyOperations,
  getLiveOperatorsSummary,
  getRealCampaigns,
  listAssignableOperators,
  selectOptionalTable,
} from '../../lib/services/admin-api.js';
import { buildOperationalGroups, buildTodayGroupCards } from '../../lib/admin/adminHomeModel.js';
import { buildCommercialSnapshot } from '../../lib/admin/adminCommercialModel.js';
import { getCurrentSupabaseUser } from '../../lib/supabaseClient.js';
import { AdminLayout } from './AdminLayout.jsx';
import { AdminDashboardMetricsPanel } from './admin-dashboard/AdminDashboardMetricsPanel.jsx';
import './admin-dashboard.css';

const AdminCentralAiPanel = React.lazy(() => import('../../components/ai/admin/AdminCentralAiPanel.jsx'));

export { normalizeCampaign } from '../../lib/services/admin-api.js';

export default function AdminDashboard({ onNav, adminSession = null }) {
  const [state, setState] = useState({ loading: true, error: null, data: emptyData() });
  const [notice, setNotice] = useState('');
  const [adminIdentity, setAdminIdentity] = useState(null);
  // Redesign compattezza (P1): "Strumenti avanzati" era un accordion enorme
  // in fondo pagina. Le stesse 3 route (nessuna nuova, nessuna rimossa)
  // vivono ora in un piccolo popover header "Altri strumenti"; l'Assistente
  // Admin (non una route, un pannello embedded) si attiva/disattiva dallo
  // stesso popover invece di un <details> nested in fondo.
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showAllToday, setShowAllToday] = useState(false);

  async function load() {
    try {
      const data = await loadAdminHomeData();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, error: error?.message || 'Errore caricamento dashboard admin.', data: emptyData() });
    }
  }

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => { if (!cancelled) await load(); };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
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
  const metrics = useMemo(() => ({
    groups: todayGroups.length,
    online: todayGroups.filter((group) => group.presence.key === 'online').length,
    pending: todayGroups.filter((group) => ['sent', 'opened'].includes(group.program.key)).length,
    problems: todayGroups.filter((group) => group.work.key === 'problem').length,
  }), [todayGroups]);
  const commercial = useMemo(() => buildCommercialSnapshot({ campaigns, today: localDateKey(new Date()) }), [campaigns]);
  const groupsOnline = groups.filter((group) => group.presence?.key === 'online').length;
  const clientsStats = useMemo(() => ({
    pagati: clientsQuotes.filter((row) => row.paymentStatus === 'pagato').length,
    daPagare: clientsQuotes.filter((row) => row.paymentStatus === 'da_pagare').length,
    // "Da assegnare" = campagne reali E pagate senza gruppo/programma: una
    // campagna non ancora pagata o di test non e' operativamente "da
    // assegnare" (nessuno deve mandarci un gruppo finche' non e' pagata).
    daAssegnare: clientsQuotes.filter((row) => row.paymentStatus === 'pagato' && !row.assignment).length,
  }), [clientsQuotes]);
  const programsStats = useMemo(() => ({
    pronti: clientsQuotes.filter((row) => row.programStatus !== 'nessun_programma').length,
    daConfermare: clientsQuotes.filter((row) => ['inviato', 'aperto'].includes(row.programStatus)).length,
  }), [clientsQuotes]);
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
            <button type="button" role="menuitem" onClick={() => { setShowAiPanel((v) => !v); setToolsMenuOpen(false); }}>
              {showAiPanel ? 'Nascondi Assistente Admin' : 'Assistente Admin'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AdminLayout onNav={onNav} title="Oggi" subtitle="Chi lavora, dove deve andare e cosa richiede attenzione." actions={headerActions}>
      {state.loading && <DashboardSkeleton />}
      {state.error && <Notice danger>{state.error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <AdminDashboardMetricsPanel metrics={metrics} Metric={Metric} />

      <section className="admin-home__section" aria-labelledby="today-title">
        <SectionHeading
          id="today-title"
          eyebrow="Operatività"
          title="Chi lavora oggi"
          meta={`${todayGroups.length} gruppi programmati`}
          action={todayGroups.length > 3 ? (showAllToday ? 'Mostra meno' : 'Vedi tutti') : null}
          onAction={() => setShowAllToday((v) => !v)}
        />
        {!availability.today ? <EmptyState text="Programmi di oggi non disponibili." /> : todayGroups.length === 0 ? (
          <EmptyState text="Nessun gruppo programmato per oggi." action="Nuovo programma" onAction={() => onNav('admin-groups-manager')} />
        ) : (
          <div className={showAllToday ? 'admin-home__today-grid admin-home__today-grid--scroll' : 'admin-home__today-grid'}>
            {(showAllToday ? todayGroups : todayGroups.slice(0, 3)).map((group) => <TodayGroupCard key={group.id} group={group} onWhatsApp={() => openProgramWhatsApp(group)} />)}
          </div>
        )}
      </section>

      {/* Moduli principali (ticket: griglia compatta 2x2, Registro Ordini
          come modulo principale — non piu' nascosto in Strumenti avanzati).
          Stessa route esistente /admin/orders, nessuna nuova query: i dati
          vengono dallo stesso clientsQuotes gia' caricato da loadAdminHomeData. */}
      <section className="admin-home__module-grid" aria-label="Moduli principali">
        <ModuleCard
          title="Registro Ordini"
          stats={[
            { label: 'Totali', value: clientsQuotes.length },
            { label: 'Pagati', value: clientsStats.pagati },
            { label: 'Da pagare', value: clientsStats.daPagare },
            { label: 'Da assegnare', value: clientsStats.daAssegnare },
          ]}
          cta="Apri registro"
          onOpen={() => onNav('admin-orders')}
        />
        <ModuleCard
          title="Gruppi"
          stats={[
            { label: 'Gruppi', value: groups.length },
            { label: 'Online', value: groupsOnline },
          ]}
          cta="Apri gruppi"
          onOpen={() => onNav('admin-groups-manager')}
        />
        <ModuleCard
          title="GPS & Programmi"
          stats={[
            { label: 'Programmi pronti', value: programsStats.pronti },
            { label: 'Live', value: liveSummary.liveCount || 0 },
            { label: 'Da confermare', value: programsStats.daConfermare },
          ]}
          cta="Apri GPS & Programmi"
          onOpen={() => onNav('admin-live')}
        />
        <ModuleCard
          title="Clienti & Preventivi"
          stats={[
            { label: 'Pagati', value: clientsStats.pagati },
            { label: 'Da pagare', value: clientsStats.daPagare },
            { label: 'Da assegnare', value: clientsStats.daAssegnare },
          ]}
          cta="Apri Clienti & Preventivi"
          onOpen={() => onNav('admin-clients-quotes')}
        />
      </section>

      {/* Secondari: due card compatte affiancate, non piu' un modulo a
          larghezza piena da solo. */}
      <section className="admin-home__module-grid admin-home__module-grid--secondary" aria-label="Moduli secondari">
        <ModuleCard
          title="Smart Pairing"
          stats={[
            { label: 'Richieste', value: smartPairing.available ? smartPairingStats.richieste : 'Non disponibile' },
            { label: 'Match disponibili', value: smartPairing.available ? smartPairingStats.match : 'Non disponibile' },
          ]}
          cta="Apri Smart Pairing"
          onOpen={() => onNav('admin-smart-pairing')}
        />
        <ModuleCard
          title="Commerciale"
          stats={[
            { label: 'Preventivi rapidi nuovi', value: commercial.metrics.newToday },
            { label: 'Da contattare', value: commercial.metrics.toContact },
            { label: 'Consulenze', value: 'Non configurato' },
            { label: 'Traffico', value: 'Non configurato' },
          ]}
          cta="Apri Commerciale"
          onOpen={() => onNav('admin-commercial')}
        />
      </section>

      {showAiPanel && (
        <section className="admin-home__section" aria-labelledby="ai-panel-title">
          <SectionHeading id="ai-panel-title" eyebrow="Assistente" title="Assistente Admin" />
          <React.Suspense fallback={<p>Caricamento Assistente Admin…</p>}>
            <AdminCentralAiPanel adminIdentity={adminIdentity} campaigns={campaigns} availability={availability} operators={liveOperators} operatorsSummary={liveSummary} dataLoading={state.loading} dataError={state.error} />
          </React.Suspense>
        </section>
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
let __loadAdminHomeDataInFlight = null;

export async function loadAdminHomeData() {
  if (__loadAdminHomeDataInFlight) return __loadAdminHomeDataInFlight;
  __loadAdminHomeDataInFlight = loadAdminHomeDataUncached();
  try {
    return await __loadAdminHomeDataInFlight;
  } finally {
    __loadAdminHomeDataInFlight = null;
  }
}

async function loadAdminHomeDataUncached() {
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
  const campaignResult = await getRealCampaigns({ includeTest: true });

  const [operations, liveSummary, operators, smartPairingResult] = await Promise.all([
    getDailyOperations(today).then((rows) => ({ rows, available: true })).catch(() => ({ rows: [], available: false })),
    getLiveOperatorsSummary({ prefetched: { sessions: campaignResult.sessions, points: campaignResult.points } })
      .catch(() => ({ current: [], liveCount: 0, warningCount: 0 })),
    listAssignableOperators().catch(() => []),
    selectOptionalTable('smart_pairing_waitlist'),
  ]);
  const liveOperators = liveSummary.current || [];
  const realCampaignIds = new Set(campaignResult.allRows.filter((campaign) => campaign.quality === 'real').map((campaign) => campaign.id));
  const realOperations = operations.rows.filter((assignment) => realCampaignIds.has(assignment.campaign_id));
  const realGroups = campaignResult.groups.filter((group) => realCampaignIds.has(group.campaign_id));
  // Stesso identico risultato di prima (nessun override includeTest: solo
  // campagne reali, cosi' Pagati/Da pagare/Da assegnare in Home restano
  // identici a ClientsQuotes.jsx), ma senza rifare da zero campaigns/groups/
  // assignments/operators/sessions gia' recuperati sopra.
  const clientsQuotesResult = await getClientsQuotesOverview({
    prefetched: {
      campaigns: campaignResult.allRows,
      groups: campaignResult.groups,
      assignments: campaignResult.assignments,
      sessions: campaignResult.sessions,
      operators,
    },
  }).catch(() => []);
  return {
    campaigns: campaignResult.allRows,
    todayGroups: buildTodayGroupCards({ operations: realOperations, liveOperators, operators }),
    groups: buildOperationalGroups({ groups: realGroups, assignments: campaignResult.assignments, operators, liveOperators, campaigns: campaignResult.allRows }),
    operators,
    liveOperators,
    liveSummary,
    clientsQuotes: clientsQuotesResult,
    smartPairing: { rows: smartPairingResult.rows, available: smartPairingResult.available },
    availability: { ...campaignResult.availability, today: operations.available },
  };
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
function Notice({ children, danger = false }) { return <div className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`} role={danger ? 'alert' : 'status'}>{children}</div>; }
function DashboardSkeleton() { return <div className="admin-home__skeleton" aria-label="Caricamento dashboard"><span /><span /><span /><span /></div>; }

function localDateKey(date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function emptyData() {
  return {
    campaigns: [], todayGroups: [], groups: [], operators: [], liveOperators: [],
    liveSummary: { liveCount: 0, warningCount: 0 }, clientsQuotes: [], smartPairing: { rows: [], available: false },
    availability: { campaigns: false, today: false, groups: false },
  };
}
