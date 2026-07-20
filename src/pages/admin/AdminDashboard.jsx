import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { getRealCampaigns, selectOptionalTable, markWaitlistHandled } from "../../lib/services/admin-api.js";
import { buildAdminDashboardInsights } from "../../lib/ai/buildAdminInsights.js";
import { buildAdminDecisionItems } from "../../lib/ai/buildAdminDecisionItems.js";
import { buildAdminNotifications } from "../../lib/ai/buildAdminNotifications.js";
import { AdminOperationalBrief } from "../../components/ai/admin/AdminOperationalBrief.jsx";
import { AINotificationCenter } from "../../components/ai/AINotificationCenter.jsx";

const C = {
  orange: "#E8571A",
  green: "#2ECC8A",
  yellow: "#FBBF24",
  blue: "#60A5FA",
  purple: "#A78BFA",
  white: "#FFFFFF",
};

const F = {
  sans: "'DM Sans', Inter, system-ui, sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
};

const EMPTY = "Dato non disponibile";
const MODULE_STATES = {
  operative: { label: "Operativo", color: C.green },
  empty: { label: "Configurato ma senza dati", color: C.blue },
  notConfigured: { label: "Non configurato", color: C.yellow },
  preparing: { label: "In preparazione", color: "rgba(255,255,255,.58)" },
  attention: { label: "Da verificare", color: "#F87171" },
};
const STATUSES = {
  active: { label: "In distribuzione", color: C.green },
  pending: { label: "In attesa", color: C.yellow },
  done: { label: "Completata", color: "#94A3B8" },
};
const SERVICES = {
  d2d: { label: "D2D", color: C.orange },
  h2h: { label: "H2H", color: C.blue },
  b2b: { label: "B2B", color: C.purple },
};
const SERVICE_FULL_LABELS = { d2d: "Door to Door", h2h: "Hand to Hand", b2b: "Business Distribution" };
const QUALITY_BADGES = {
  real: { label: "reale", color: C.green },
  test: { label: "test", color: C.yellow },
  incomplete: { label: "incompleta", color: "rgba(255,255,255,.45)" },
};

export default function AdminDashboard({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, data: emptyData() });
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [showTestCampaigns, setShowTestCampaigns] = useState(false);
  const [notice, setNotice] = useState("");
  const [waitlistFilter, setWaitlistFilter] = useState("pending");
  const [waitlistBusyId, setWaitlistBusyId] = useState(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await loadAdminData();
        if (!cancelled) setState({ loading: false, error: null, data });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: error?.message || "Errore caricamento dashboard admin.", data: emptyData() });
      }
    }
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const { campaigns, waitlist, sessions, activities, latestGpsPoints, activeSessions, availability } = state.data;
  const filteredWaitlist = waitlist.filter((item) => {
    if (waitlistFilter === "pending") return !item.gestita;
    if (waitlistFilter === "handled") return Boolean(item.gestita);
    return true;
  });

  useEffect(() => {
    console.info("[ADMIN_WAITLIST_RENDER]", {
      total: waitlist.length,
      filter: waitlistFilter,
      visible: filteredWaitlist.length,
    });
  }, [waitlist, waitlistFilter]);

  const handleMarkWaitlistHandled = async (item) => {
    console.info("[ADMIN_WAITLIST_MARK_HANDLED_START]", { id: item.id });
    setWaitlistBusyId(item.id);
    try {
      await markWaitlistHandled(item.id);
      console.info("[ADMIN_WAITLIST_MARK_HANDLED_SUCCESS]", { id: item.id });
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          waitlist: prev.data.waitlist.map((row) => (row.id === item.id ? { ...row, gestita: true, gestita_at: new Date().toISOString() } : row)),
        },
      }));
    } catch (error) {
      console.error("[ADMIN_WAITLIST_MARK_HANDLED_ERROR]", { id: item.id, error: error?.message || String(error) });
      setNotice(`Impossibile segnare come gestita la richiesta di ${item.nome || item.email || item.id}: ${error?.message || "errore sconosciuto"}.`);
    } finally {
      setWaitlistBusyId(null);
    }
  };

  const handleWaitlistWhatsapp = (item) => {
    const digits = String(item.whatsapp || "").replace(/[^\d]/g, "");
    if (!digits) return;
    console.info("[ADMIN_WAITLIST_WHATSAPP_OPEN]", { id: item.id, whatsapp: digits });
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  const handleWaitlistCreateCampaign = (item) => {
    console.info("[ADMIN_WAITLIST_CREATE_CAMPAIGN_CLICK]", { id: item.id });
  };

  const visibleCampaigns = campaigns.filter((campaign) => showTestCampaigns || campaign.quality === "real");
  const searchText = globalSearch.trim().toLowerCase();
  const filteredCampaigns = visibleCampaigns
    .filter((campaign) => statusFilter === "all" || campaign.status === statusFilter)
    .filter((campaign) => serviceFilter === "all" || campaign.service === serviceFilter)
    .filter((campaign) => periodFilter === "all" || matchesPeriod(campaign.date, periodFilter))
    .filter((campaign) => !searchText || [
      campaign.client,
      campaign.zone,
      campaign.id,
      campaign.source,
      campaign.rawStatus,
      SERVICE_FULL_LABELS[campaign.service],
    ].filter(Boolean).join(" ").toLowerCase().includes(searchText));
  const validCampaigns = campaigns.filter((campaign) => campaign.quality === "real");
  const excludedCampaigns = campaigns.filter((campaign) => campaign.quality !== "real");
  const excludedReasonsMap = excludedCampaigns.reduce((acc, c) => {
    const r = c.qualityReason || "motivo non specificato";
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  const excludedBreakdownText = Object.entries(excludedReasonsMap)
    .map(([r, cnt]) => `${cnt} ${r}`)
    .join(", ");
  const revenueValues = validCampaigns.map((campaign) => campaign.total).filter(Number.isFinite);
  const totalRevenue = revenueValues.length ? revenueValues.reduce((sum, value) => sum + value, 0) : null;
  const totalQty = validCampaigns.reduce((sum, campaign) => sum + (campaign.qty || 0), 0);
  const avgCpm = totalRevenue != null && totalQty > 0 ? (totalRevenue / totalQty) * 1000 : null;
  const enterprise = buildEnterpriseSnapshot({
    campaigns: validCampaigns,
    waitlist,
    activeSessions,
    latestGpsPoints,
    activities,
    availability,
    totalRevenue,
    totalQty,
  });
  const observedAt = enterprise.lastUpdate?.toISOString() || null;
  const sourceState = (available, data, missingReason) => state.loading
    ? { status: "missing", reason: "Caricamento dati Admin in corso." }
    : state.error
      ? { status: "error", reason: state.error }
      : available
        ? { status: "ready", data, observedAt, staleAfterMs: 5 * 60 * 1000 }
        : { status: "missing", reason: missingReason };
  const adminAiDashboard = buildAdminDashboardInsights({
    sources: {
      campaigns: sourceState(availability.campaigns, validCampaigns, "Tabelle campagne non disponibili."),
      sessions: sourceState(availability.sessions, sessions, "Sessioni operative non disponibili."),
      gpsPoints: sourceState(availability.gps, latestGpsPoints, "Punti GPS non disponibili."),
      proofPhotos: sourceState(availability.photos, null, "Metadati foto non disponibili."),
      waitlist: sourceState(availability.waitlist, waitlist, "Waitlist non disponibile."),
      activities: sourceState(availability.activities, activities, "Registro attivita non disponibile."),
    },
    snapshot: {
      activeCampaigns: validCampaigns.filter((campaign) => campaign.status === "active").length,
      completedCampaigns: enterprise.completedCampaigns,
      lateCampaigns: enterprise.lateCampaigns,
      liveSessions: activeSessions.length,
      operatorStatus: availability.sessions ? `${enterprise.onlineOperators}/${enterprise.offlineOperators}` : null,
      onlineOperators: enterprise.onlineOperators,
      offlineOperators: enterprise.offlineOperators,
      pendingCampaigns: validCampaigns.filter((campaign) => campaign.status === "pending").length,
      activeClients: enterprise.activeClients,
      pendingRequests: Number.isFinite(enterprise.pendingRequests) ? enterprise.pendingRequests : null,
      totalRevenue,
      avgCpm,
      alarmCount: enterprise.alarmCount,
      opsProblems: enterprise.opsProblems,
      lastUpdate: observedAt,
    },
  });
  const adminDecisionCenter = buildAdminDecisionItems({
    insights: adminAiDashboard,
    context: { authorized: true, role: "admin" },
  });
  const adminNotificationCenter = buildAdminNotifications({
    decisionCenter: adminDecisionCenter,
    context: { authorized: true, role: "admin" },
  });
  const adminOperationalLinks = [
    { href: "/admin/live", label: "Monitor GPS Live", description: "Sessioni, tracker e ultimo ping" },
    { href: "/admin/anomalie", label: "Anomalie esistenti", description: "Dettagli prodotti dai controlli correnti" },
    { href: "/admin/finance", label: "Gestione economica", description: "Preventivi, pagamenti e fatture" },
  ];

  useEffect(() => {
    console.info("[ADMIN_DASHBOARD_KPI_LOAD]", {
      campaigns: validCampaigns.length,
      revenueAvailable: totalRevenue != null,
      cpmAvailable: avgCpm != null,
      alarms: enterprise.alarmCount,
    });
  }, [validCampaigns.length, totalRevenue, avgCpm, enterprise.alarmCount]);

  const exportCsv = () => {
    if (!filteredCampaigns.length) {
      setNotice("Nessuna campagna reale da esportare.");
      return;
    }
    const rows = [
      ["id", "cliente", "servizio", "zona", "quantita", "status", "data", "totale"],
      ...filteredCampaigns.map((campaign) => [campaign.id, campaign.client, campaign.service, campaign.zone, campaign.qty || "", campaign.status, campaign.date, campaign.total ?? ""]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "volantinipro-campagne-operative.csv";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`CSV esportato con ${filteredCampaigns.length} campagne reali.`);
  };

  const go = (page) => onNav?.(page);

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={adminBadgeStyle}>ADMIN</div>
          <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" }}>Dashboard Admin</h1>
          <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", margin: 0 }}>Dati reali Supabase. Nessun dato demo.</p>
        </div>
        <button onClick={() => go("home")} style={secondaryButtonStyle}>Home</button>
      </header>

      {state.loading && <Notice text="Caricamento dati admin reali..." />}
      {state.error && <Notice text={state.error} danger />}
      {notice && <Notice text={notice} />}

      <AdminOperationalBrief
        items={adminAiDashboard.items}
        attention={adminAiDashboard.attention}
        attentionState={adminAiDashboard.attentionState}
        decisionCenter={adminDecisionCenter}
        links={adminOperationalLinks}
        loading={state.loading}
        error={state.error}
      />

      <AINotificationCenter center={adminNotificationCenter} loading={state.loading} error={state.error} />

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={eyebrowStyle}>Centrale operativa</p>
        <div style={opsNavStyle}>
          <a style={opsNavItemStyle} href="#campagne-attive"><strong>Campagne attive</strong><span>Stato, gruppi, operatori e problemi</span></a>
          <a style={opsNavItemStyle} href="#gruppi-operativi"><strong>Gruppi operativi</strong><span>Accesso per campagna e capogruppo</span></a>
          <a style={opsNavItemStyle} href="/admin/live"><strong>Monitor GPS Live</strong><span>Storico, online/offline e ping</span></a>
          <a style={opsNavItemStyle} href="#report-storico"><strong>Report e storico</strong><span>Operations, report finale, export</span></a>
          <a style={opsNavItemStyle} href="#link-operatori"><strong>Link operatori</strong><span>Tracking gruppo per ragazzi</span></a>
          <a style={opsNavItemStyle} href="/admin/finance"><strong>Gestione economica</strong><span>Preventivi, pagamenti, fatture e analisi</span></a>
          <a style={opsNavItemStyle} href="/admin/automation"><strong>Motore automazioni</strong><span>Eventi, workflow, code e health check</span></a>
          <a style={opsNavItemStyle} href="/admin/crm"><strong>CRM Clienti</strong><span>Anagrafica estesa, referenti, ricerca e filtri</span></a>
          <a style={opsNavItemStyle} href="/admin/documenti"><strong>Archivio documenti</strong><span>Upload, categorie, metadati e download</span></a>
          <a style={opsNavItemStyle} href="/admin/config"><strong>Centro Configurazione</strong><span>Impostazioni generali della piattaforma</span></a>
          <a style={opsNavItemStyle} href="/admin/anomalie"><strong>AI Copilot · Anomalie</strong><span>Operatori offline, campagne ferme, insoluti, GPS</span></a>
        </div>
      </section>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <p style={eyebrowStyle}>Dashboard live</p>
            <span style={mutedTinyStyle}>Stato operativo calcolato da tabelle reali o segnato come non configurato.</span>
          </div>
          <input
            aria-label="Cerca nella Dashboard Admin"
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="Cerca cliente, zona, ID, servizio..."
            style={searchInputStyle}
          />
        </div>
        <div style={opsNavStyle}>
          {buildSystemStatusCards(availability, state.error).map((item) => <StatusTile key={item.label} item={item} />)}
        </div>
      </section>

      <div style={dashboardLayoutStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <section id="campagne-attive" style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <p style={eyebrowStyle}>Campagne operative valide</p>
                <span style={mutedTinyStyle} title={excludedBreakdownText ? `Dettaglio esclusioni reali: ${excludedBreakdownText}` : ""}>
                  {validCampaigns.length} valide · {excludedCampaigns.length} escluse{excludedBreakdownText ? ` (${excludedBreakdownText})` : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 100, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.58)", fontFamily: F.sans, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={showTestCampaigns} onChange={(event) => setShowTestCampaigns(event.target.checked)} />
                  Mostra campagne test
                </label>
                {statusFilterButtons(statusFilter, setStatusFilter)}
                {filterButtons(["all", "d2d", "h2h", "b2b"], serviceFilter, setServiceFilter, { all: "Servizi", d2d: "D2D", h2h: "H2H", b2b: "B2B" }, C.blue)}
                {filterButtons(["all", "today", "week", "month"], periodFilter, setPeriodFilter, { all: "Periodo", today: "Oggi", week: "7 giorni", month: "30 giorni" }, C.purple)}
              </div>
            </div>
            {!availability.campaigns ? (
              <EmptyState text="Tabelle campaigns / campagne / quote_requests non disponibili o non leggibili con RLS." />
            ) : filteredCampaigns.length === 0 ? (
              <EmptyState text="Nessuna campagna reale disponibile" />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {filteredCampaigns.map((campaign) => <CampaignRow key={`${campaign.source}-${campaign.id}`} campaign={campaign} />)}
              </div>
            )}
          </section>

          <section id="gruppi-operativi" style={cardStyle}>
            <p style={eyebrowStyle}>Gruppi operativi</p>
            {filteredCampaigns.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {filteredCampaigns.slice(0, 8).map((campaign) => (
                  <div key={`groups-${campaign.id}`} style={opsCampaignStyle}>
                    <div>
                      <strong style={{ color: C.white }}>{campaign.client}</strong>
                      <br />
                      <span style={mutedTinyStyle}>{campaign.zone} · {campaign.ops?.groups || 0} gruppi · {campaign.ops?.operators || 0} operatori</span>
                    </div>
                    <a style={inlineButtonStyle} href={`/admin/campaigns/${campaign.id}/groups`}>Apri gruppi</a>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="Nessuna campagna selezionata." />}
          </section>

          <section style={cardStyle}>
            <p style={eyebrowStyle}>Moduli enterprise</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 14 }}>
              {buildEnterpriseModules({ campaigns: validCampaigns, waitlist, activities, latestGpsPoints, activeSessions, availability, enterprise }).map((module) => (
                <ModuleTile key={module.title} module={module} />
              ))}
            </div>
          </section>

          <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
              <p style={eyebrowStyle}>Mappa operativa reale</p>
            </div>
            <div style={{ minHeight: 480, width: "100%", background: "#081610", display: "flex", alignItems: "center" }}>
              <DashboardRealMap campaigns={validCampaigns} gpsPoints={latestGpsPoints} />
            </div>
          </section>
        </div>

        <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <SideCard title="Azioni rapide">
            <ActionButton label="Nuova campagna" route="/admin/campaigns/new" onClick={() => { window.location.href = "/admin/campaigns/new"; }} />
            <ActionButton label="Monitor GPS Live" route="/admin/live" onClick={() => { window.location.href = "/admin/live"; }} />
            <ActionButton label={`Gruppi della campagna${filteredCampaigns[0] ? ` (${filteredCampaigns[0].client})` : ""}`} route={`/admin/campaigns/${filteredCampaigns[0]?.id}/groups`} onClick={() => { window.location.href = `/admin/campaigns/${filteredCampaigns[0]?.id}/groups`; }} disabledReason={filteredCampaigns[0]?.id ? "" : "Nessuna campagna selezionata."} />
            <ActionButton label={`Operazioni GPS della campagna${filteredCampaigns[0] ? ` (${filteredCampaigns[0].client})` : ""}`} route={`/admin/campaigns/${filteredCampaigns[0]?.id}/operations`} onClick={() => { window.location.href = `/admin/campaigns/${filteredCampaigns[0]?.id}/operations`; }} disabledReason={filteredCampaigns[0]?.id ? "" : "Nessuna campagna selezionata."} />
            <ActionButton label={`Report della campagna${filteredCampaigns[0] ? ` (${filteredCampaigns[0].client})` : ""}`} route={`/admin/campaigns/${filteredCampaigns[0]?.id}/report`} onClick={() => { window.location.href = `/admin/campaigns/${filteredCampaigns[0]?.id}/report`; }} disabledReason={filteredCampaigns[0]?.id ? "" : "Nessuna campagna selezionata."} />
            <ActionButton label="Trova Smart Pairing" route="step3" onClick={() => go("step3")} />
            <ActionButton label="Apri analisi zona" route="step2" onClick={() => go("step2")} />
            <ActionButton label="Genera PDF preventivi" route="step4" onClick={() => go("step4")} disabledReason="Richiede una campagna configurata nello Step 4." />
            <ActionButton label="Dashboard finanziaria" route="/admin/finance" onClick={() => { window.location.href = "/admin/finance"; }} />
            <ActionButton label="Motore automazioni" route="/admin/automation" onClick={() => { window.location.href = "/admin/automation"; }} />
            <ActionButton label="CRM Clienti" route="/admin/crm" onClick={() => { window.location.href = "/admin/crm"; }} />
            <ActionButton label="Archivio documenti" route="/admin/documenti" onClick={() => { window.location.href = "/admin/documenti"; }} />
            <ActionButton label="Centro Configurazione" route="/admin/config" onClick={() => { window.location.href = "/admin/config"; }} />
            <ActionButton label="AI Copilot · Anomalie" route="/admin/anomalie" onClick={() => { window.location.href = "/admin/anomalie"; }} />
            <ActionButton label="Esporta campagne operative" onClick={exportCsv} disabledReason={filteredCampaigns.length ? "" : "Nessuna campagna reale da esportare."} />
          </SideCard>

          {!availability.waitlist || waitlist.length === 0 ? (
            <details style={{ padding: "10px 14px", borderRadius: 11, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, opacity: 0.8 }}>Smart Pairing Waitlist (0)</summary>
              <div style={{ marginTop: 10 }}><EmptyState text="Nessuna richiesta Smart Pairing reale." /></div>
            </details>
          ) : (
            <SideCard title="Smart Pairing Waitlist" meta={`${filteredWaitlist.length} / ${waitlist.length}`}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {filterButtons(["pending", "handled", "all"], waitlistFilter, setWaitlistFilter, { pending: "Da gestire", handled: "Gestite", all: "Tutte" }, C.orange)}
              </div>
              {filteredWaitlist.length === 0 ? (
                <EmptyState text={waitlistFilter === "pending" ? "Nessuna richiesta da gestire." : "Nessuna richiesta in questa vista."} />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {filteredWaitlist.map((item) => (
                    <WaitlistCard
                      key={item.id}
                      item={item}
                      busy={waitlistBusyId === item.id}
                      onMarkHandled={handleMarkWaitlistHandled}
                      onWhatsapp={handleWaitlistWhatsapp}
                      onCreateCampaign={handleWaitlistCreateCampaign}
                    />
                  ))}
                </div>
              )}
            </SideCard>
          )}

          <SideCard title="Report e storico" meta={`${filteredCampaigns.length} campagne`}>
            {filteredCampaigns.slice(0, 5).map((campaign) => (
              <SimpleRow key={`report-${campaign.id}`} title={campaign.client} subtitle={
                <span>
                  <a style={linkStyle} href={`/admin/campaigns/${campaign.id}/operations`}>Operations</a>
                  {" · "}
                  <a style={linkStyle} href={`/admin/campaigns/${campaign.id}/report`}>Report</a>
                </span>
              } />
            ))}
          </SideCard>

          <SideCard title="Link operatori" meta="gruppi">
            {filteredCampaigns.slice(0, 5).map((campaign) => (
              <SimpleRow key={`links-${campaign.id}`} title={campaign.client} subtitle={<a style={linkStyle} href={`/admin/campaigns/${campaign.id}/groups`}>Copia link gruppo</a>} />
            ))}
          </SideCard>

          {!availability.activities || activities.length === 0 ? (
            <details style={{ padding: "10px 14px", borderRadius: 11, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, opacity: 0.8 }}>Ultime attività (0)</summary>
              <div style={{ marginTop: 10 }}><EmptyState text="Nessuna attività registrata." /></div>
            </details>
          ) : (
            <SideCard title="Ultime attività">
              {activities.slice(0, 8).map((activity) => <SimpleRow key={activity.id || activity.created_at} title={activity.message || activity.event || activity.action || EMPTY} subtitle={formatDate(activity.created_at || activity.recorded_at)} />)}
            </SideCard>
          )}
        </aside>
      </div>
    </main>
  );
}

async function loadAdminData() {
  try {
    const [campaignsResult, sessionsTable, gpsPoints, waitlist, activities] = await Promise.all([
      getRealCampaigns({ includeTest: true }),
      selectOptionalTable("delivery_sessions"),
      selectOptionalTable("gps_tracking_points", "recorded_at"),
      selectOptionalTable("smart_pairing_waitlist"),
      selectOptionalTable("activity_log"),
    ]);
    const activeSessions = sessionsTable.rows.filter((session) => ["started", "active", "paused"].includes(String(session.status || "").toLowerCase()));
    const latestGpsPoints = latestPointsBySession(gpsPoints.rows);
    const availability = {
      campaigns: campaignsResult.availability.campaigns,
      waitlist: waitlist.available,
      gps: gpsPoints.available,
      sessions: sessionsTable.available,
      photos: campaignsResult.availability.photos,
      activities: activities.available,
    };
    console.info("[ADMIN_DASHBOARD_SCHEMA_CHECK]", availability);
    console.info("[ADMIN_DASHBOARD_CAMPAIGNS_LOAD]", {
      total: campaignsResult.allRows.length,
      real: campaignsResult.allRows.filter((row) => row.quality === "real").length,
    });
    console.info("[ADMIN_DASHBOARD_GPS_LOAD]", {
      sessions: sessionsTable.rows.length,
      points: gpsPoints.rows.length,
      latest: latestGpsPoints.length,
    });
    console.info("[ADMIN_WAITLIST_LOAD]", {
      available: waitlist.available,
      count: waitlist.rows.length,
      pending: waitlist.rows.filter((row) => !row.gestita).length,
    });
    if (!campaignsResult.allRows.length || !latestGpsPoints.length || !activities.rows.length) {
      console.info("[ADMIN_DASHBOARD_EMPTY_STATE]", {
        campaigns: campaignsResult.allRows.length,
        gps: latestGpsPoints.length,
        activities: activities.rows.length,
      });
    }
    return {
      campaigns: campaignsResult.allRows,
      waitlist: waitlist.rows,
      sessions: sessionsTable.rows,
      activeSessions,
      latestGpsPoints,
      activities: activities.rows,
      availability,
    };
  } catch (error) {
    console.error("[ADMIN_DASHBOARD_ERROR]", { error: error?.message || String(error) });
    throw error;
  }
}

function normalizeCampaign(row, source) {
  const rawStatus = String(row.status || row.stato || row.state || row.stato_pagamento || "").toLowerCase();
  const serviceSource = row.service_type || row.campaign_type || row.type || row.servizio || row.selected_service || row.service;
  const serviceRaw = String(serviceSource || "").toLowerCase();
  const total = Number(row.total_budget ?? row.total_amount ?? row.amount ?? row.price ?? row.totale);
  const qty = Number(row.total_flyers ?? row.flyer_quantity ?? row.qty ?? row.quantita ?? row.quantity);
  const lat = Number(row.center_lat ?? row.lat ?? row.latitude ?? row.metadata?.center_lat ?? row.metadata?.lat);
  const lng = Number(row.center_lng ?? row.lng ?? row.longitude ?? row.metadata?.center_lng ?? row.metadata?.lng);
  const campaign = {
    id: row.id || row.campaign_id || row.request_id,
    client: row.client_name || row.customer_name || row.nome_cliente || row.nome || row.title || row.email || EMPTY,
    service: serviceRaw.includes("h2h") || serviceRaw.includes("hand") ? "h2h" : serviceRaw.includes("b2b") || serviceRaw.includes("business") ? "b2b" : serviceRaw ? "d2d" : null,
    zone: row.city_name || row.zone_label || row.zona || row.zone || row.municipality_name || row.title || EMPTY,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    status: normalizeStatus(rawStatus),
    date: String(row.start_date || row.created_at || row.updated_at || "").slice(0, 10) || EMPTY,
    endDate: String(row.end_date || row.delivery_end_date || row.completed_by || row.metadata?.end_date || "").slice(0, 10) || null,
    total: Number.isFinite(total) && total > 0 ? total : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    rawStatus,
    createdBy: row.created_by || row.createdBy || row.user_id || row.customer_id || row.metadata?.created_by || "",
    source,
  };
  const quality = classifyCampaign(campaign, row, serviceSource);
  return { ...campaign, quality: quality.kind, qualityReason: quality.reason };
}

function classifyCampaign(campaign, row, serviceSource) {
  const haystack = [
    campaign.id,
    campaign.client,
    campaign.zone,
    campaign.rawStatus,
    campaign.createdBy,
    row.email,
    row.title,
    row.note,
    row.metadata?.source,
  ].filter(Boolean).join(" ").toLowerCase();
  if (String(campaign.id || "").startsWith("11111111-1111-1111-1111")) return { kind: "test", reason: "campaign_id fake" };
  if (/\b(test|demo|placeholder|fake|sample)\b/.test(haystack)) return { kind: "test", reason: "record test/demo" };
  if (!cleanText(campaign.client) || campaign.client === EMPTY) return { kind: "incomplete", reason: "cliente mancante" };
  if (!cleanText(campaign.zone) || campaign.zone === EMPTY) return { kind: "incomplete", reason: "zona mancante" };
  if (!campaign.qty) return { kind: "incomplete", reason: "quantita mancante" };
  if (!hasCoordinates(campaign)) return { kind: "incomplete", reason: "coordinate mancanti" };
  if (!serviceSource || !campaign.service) return { kind: "incomplete", reason: "servizio mancante" };
  if (!campaign.total && !hasQuoteLikeData(row)) return { kind: "incomplete", reason: "importo/preventivo mancante" };
  if (["placeholder", "test", "demo"].some((token) => campaign.rawStatus.includes(token))) return { kind: "test", reason: "stato placeholder" };
  return { kind: "real", reason: "record operativo valido" };
}

function hasQuoteLikeData(row) {
  return Boolean(row.quote_id || row.preventivo_id || row.quote_pdf_url || row.total_budget || row.total_amount || row.amount || row.price || row.totale);
}

function cleanText(value) {
  const text = String(value || "").trim();
  if (!text || text === EMPTY) return "";
  if (["null", "undefined", "n/a", "-"].includes(text.toLowerCase())) return "";
  return text;
}

function normalizeStatus(value) {
  if (["active", "started", "in_corso", "confermata", "confirmed", "pagato"].some((token) => value.includes(token))) return "active";
  if (["completed", "done", "completata", "cancelled"].some((token) => value.includes(token))) return "done";
  return "pending";
}

function latestPointsBySession(points) {
  const bySession = new Map();
  points.forEach((point) => {
    if (!point.session_id) return;
    const previous = bySession.get(point.session_id);
    if (!previous || new Date(point.recorded_at || point.created_at || 0) > new Date(previous.recorded_at || previous.created_at || 0)) {
      bySession.set(point.session_id, point);
    }
  });
  return Array.from(bySession.values());
}

function uniqueById(rows) {
  return Array.from(new Map(rows.filter((row) => row.id).map((row) => [String(row.id), row])).values());
}

function CampaignRow({ campaign }) {
  const service = SERVICES[campaign.service] || { label: "N/D", color: "rgba(255,255,255,.38)" };
  const status = STATUSES[campaign.status] || STATUSES.pending;
  const quality = QUALITY_BADGES[campaign.quality] || QUALITY_BADGES.incomplete;
  return (
    <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ padding: "4px 8px", borderRadius: 8, background: `${service.color}18`, color: service.color, fontFamily: F.sans, fontSize: 11, fontWeight: 900, textAlign: "center" }}>
            {service.label}<br /><span style={{ fontSize: 9, opacity: 0.7 }}>{String(campaign.id).slice(0, 6)}</span>
          </div>
          <div>
            <strong style={{ fontFamily: F.sans, fontSize: 14, color: C.white }}>{campaign.client}</strong>
            <div style={mutedTinyStyle}>{campaign.zone} · {campaign.qty ? `${campaign.qty.toLocaleString("it-IT")} volantini` : EMPTY}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ padding: "4px 10px", borderRadius: 100, background: `${status.color}18`, color: status.color, fontFamily: F.sans, fontSize: 11, fontWeight: 800 }}>{status.label}</span>
          <span title={campaign.qualityReason} style={{ padding: "4px 8px", borderRadius: 100, background: `${quality.color}18`, color: quality.color, fontFamily: F.sans, fontSize: 10, fontWeight: 900 }}>{quality.label}</span>
          <a style={miniLinkButtonStyle} href={`/admin/campaigns/${campaign.id}/groups`}>Gruppi</a>
          <a style={miniLinkButtonStyle} href={`/admin/campaigns/${campaign.id}/operations`}>GPS</a>
          <a style={miniLinkButtonStyle} href={`/admin/campaigns/${campaign.id}/report`}>Report</a>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 12 }}>
        <div><span style={mutedTinyStyle}>Gruppi</span><br /><strong style={{ color: C.orange }}>{campaign.ops?.groups || 0}</strong></div>
        <div><span style={mutedTinyStyle}>Operatori</span><br /><strong style={{ color: C.green }}>{campaign.ops?.online || 0} online</strong> · <span style={{ color: "#ef4444" }}>{campaign.ops?.offline || 0} offline</span></div>
        <div>
          <span style={mutedTinyStyle}>Avanzamento</span><br />
          {campaign.ops?.progressAvailable ? (
            <strong style={{ color: C.blue }}>{campaign.ops.progress}%</strong>
          ) : (
            <strong title={campaign.ops?.progressReason || ""} style={{ color: "rgba(255,255,255,.45)" }}>Nessun gruppo operativo</strong>
          )}
        </div>
        <div>
          <span style={mutedTinyStyle}>Anomalie</span><br />
          {(campaign.ops?.problems || 0) > 0 ? (
            <a href={`/admin/campaigns/${campaign.id}/groups`} style={{ color: "#ef4444", fontWeight: 800, textDecoration: "underline" }}>
              {campaign.ops.problems === 1 ? "1 problema" : `${campaign.ops.problems} problemi`}
            </a>
          ) : (
            <strong style={{ color: C.green }}>0 problemi</strong>
          )}
        </div>
        <div><span style={mutedTinyStyle}>Ultimo ping</span><br /><strong style={{ color: "rgba(255,255,255,.65)" }}>{formatDate(campaign.ops?.lastPing)}</strong></div>
      </div>
    </div>
  );
}

function buildEnterpriseSnapshot({ campaigns, waitlist, activeSessions, latestGpsPoints, activities, availability }) {
  const completedCampaigns = campaigns.filter((campaign) => campaign.status === "done").length;
  const lateCampaigns = campaigns.filter((campaign) => {
    const date = new Date(campaign.endDate);
    return campaign.status !== "done" && Number.isFinite(date.getTime()) && date < startOfToday();
  }).length;
  const onlineOperators = campaigns.reduce((sum, campaign) => sum + (campaign.ops?.online || 0), 0);
  const offlineOperators = campaigns.reduce((sum, campaign) => sum + (campaign.ops?.offline || 0), 0);
  const activeClients = new Set(campaigns.map((campaign) => cleanText(campaign.client)).filter(Boolean)).size;
  const pendingRequests = availability.waitlist ? waitlist.filter((row) => !row.gestita).length : EMPTY;
  const opsProblems = campaigns.reduce((sum, campaign) => sum + (campaign.ops?.problems || 0), 0);
  const alarmCount = lateCampaigns + offlineOperators + opsProblems;
  const dates = [
    ...latestGpsPoints.map((point) => point.recorded_at || point.created_at),
    ...activities.map((activity) => activity.created_at || activity.recorded_at),
    ...campaigns.map((campaign) => campaign.date),
  ].map((value) => new Date(value)).filter((date) => Number.isFinite(date.getTime()));
  const lastUpdate = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
  return {
    completedCampaigns,
    lateCampaigns,
    onlineOperators,
    offlineOperators,
    activeClients,
    pendingRequests,
    alarmCount,
    opsProblems,
    liveUsers: activeSessions.length,
    lastUpdate,
    lastUpdateText: lastUpdate ? formatDate(lastUpdate) : EMPTY,
  };
}

function buildSystemStatusCards(availability, error) {
  return [
    { label: "Frontend", value: "Operativo", detail: "app caricata", status: "ok" },
    { label: "Database", value: availability.campaigns ? "Accessibile" : EMPTY, detail: availability.campaigns ? "campagne leggibili" : "tabelle campagne non disponibili o RLS", status: availability.campaigns ? "ok" : "warn" },
    { label: "GPS realtime", value: availability.gps ? "Dati leggibili" : EMPTY, detail: availability.gps ? "gps_tracking_points accessibile" : "tabella GPS non disponibile", status: availability.gps ? "ok" : "warn" },
    { label: "Sessioni operatori", value: availability.sessions ? "Dati leggibili" : EMPTY, detail: availability.sessions ? "delivery_sessions accessibile" : "tabella sessioni non disponibile", status: availability.sessions ? "ok" : "warn" },
    { label: "Storage foto", value: availability.photos ? "Metadati leggibili" : EMPTY, detail: availability.photos ? "proof_photos accessibile" : "proof_photos non configurata", status: availability.photos ? "ok" : "warn" },
    { label: "Error center", value: error ? "Errore attivo" : "Nessun errore UI", detail: error || "ultimo load senza eccezioni", status: error ? "danger" : "ok" },
  ];
}

function buildEnterpriseModules({ campaigns, waitlist, activities, latestGpsPoints, activeSessions, availability, enterprise }) {
  return [
    { title: "Campagne", value: campaigns.length, detail: availability.campaigns ? "monitor operativo reale" : "tabelle campagne non disponibili", status: availability.campaigns ? "ok" : "warn" },
    { title: "Operatori", value: availability.sessions ? `${enterprise.onlineOperators} online · ${enterprise.offlineOperators} offline` : EMPTY, detail: availability.sessions ? "da delivery_sessions" : "tabella operatori/sessioni non disponibile", status: availability.sessions ? "ok" : "warn" },
    { title: "GPS", value: latestGpsPoints.length, detail: availability.gps ? "ultimi punti per sessione" : "nessun dato GPS recente", status: availability.gps && latestGpsPoints.length ? "ok" : "warn" },
    { title: "Photo control", value: availability.photos ? "Configurato" : EMPTY, detail: availability.photos ? "proof_photos leggibile" : "foto proof non configurate", status: availability.photos ? "ok" : "warn" },
    { title: "Clienti", value: enterprise.activeClients, detail: "deduplicati da campagne reali", status: campaigns.length ? "ok" : "warn" },
    { title: "Fornitori", value: EMPTY, detail: "tabella fornitori non configurata", status: "warn" },
    { title: "Preventivi", value: availability.waitlist ? waitlist.length : EMPTY, detail: availability.waitlist ? "richieste Smart Pairing disponibili" : "tabella richieste non disponibile", status: availability.waitlist ? "ok" : "warn" },
    { title: "Pagamenti", value: EMPTY, detail: "nessuna tabella pagamenti rilevata", status: "warn" },
    { title: "DMS documenti", value: "Operativo", detail: "modulo documentale dedicato con empty state controllati", status: "ok" },
    { title: "Report", value: campaigns.length, detail: "report disponibili per campagne selezionabili", status: campaigns.length ? "ok" : "warn" },
    { title: "Business intelligence", value: campaigns.length ? "Base dati pronta" : EMPTY, detail: campaigns.length ? "KPI da campagne reali" : "nessuna campagna reale", status: campaigns.length ? "ok" : "warn" },
    { title: "AI anomalie", value: "Operativo", detail: "analisi anomalie su dati reali disponibili", status: "ok" },
    { title: "Health check", value: availability.campaigns ? "OK parziale" : EMPTY, detail: "controlla tabelle operative disponibili", status: availability.campaigns ? "ok" : "warn" },
    { title: "Error center", value: enterprise.alarmCount, detail: enterprise.alarmCount ? "allarmi operativi dai dati" : "nessun allarme dai dati disponibili", status: enterprise.alarmCount ? "danger" : "ok" },
    { title: "Notifiche", value: EMPTY, detail: "centro notifiche non configurato", status: "warn" },
    { title: "Audit log", value: availability.activities ? activities.length : EMPTY, detail: availability.activities ? "activity_log leggibile" : "activity_log non disponibile", status: availability.activities ? "ok" : "warn" },
    { title: "Sicurezza", value: "AdminGuard", detail: "/admin/dashboard resta protetta dal guard esistente", status: "ok" },
    { title: "Backup", value: EMPTY, detail: "nessun job backup esposto all'app", status: "warn" },
  ];
}

function StatusTile({ item }) {
  const color = item.status === "danger" ? "#F87171" : item.status === "ok" ? C.green : C.yellow;
  return (
    <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${color}33`, background: `${color}0F`, fontFamily: F.sans }}>
      <p style={{ margin: "0 0 7px", fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.55)", textTransform: "uppercase", letterSpacing: ".08em" }}>{item.label}</p>
      <strong style={{ display: "block", color, fontSize: 15 }}>{item.value}</strong>
      <span style={mutedTinyStyle}>{item.detail}</span>
    </div>
  );
}

function ModuleTile({ module }) {
  const color = module.status === "danger" ? "#F87171" : module.status === "ok" ? C.green : "rgba(255,255,255,.52)";
  const state = getModuleState(module);
  return (
    <div style={{ padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.032)", fontFamily: F.sans, minHeight: 112 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
        <p style={{ margin: 0, color: C.white, fontSize: 13, fontWeight: 900 }}>{module.title}</p>
        <span style={{ flexShrink: 0, color: state.color, border: `1px solid ${state.color}55`, background: `${state.color}12`, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}>{state.label}</span>
      </div>
      <strong style={{ display: "block", color, fontSize: 18, marginBottom: 6 }}>{module.value}</strong>
      <span style={mutedTinyStyle}>{module.detail}</span>
    </div>
  );
}

function getModuleState(module) {
  if (module.status === "danger") return MODULE_STATES.attention;
  if (["Fornitori", "Pagamenti", "Notifiche", "Backup"].includes(module.title)) return MODULE_STATES.notConfigured;
  if (module.title === "DMS documenti" || module.title === "AI anomalie") return MODULE_STATES.operative;
  if (/non configurat|non disponibile/i.test(module.detail || "")) return MODULE_STATES.notConfigured;
  if (["Campagne", "Operatori", "GPS", "Photo control", "Clienti", "Preventivi", "Report", "Business intelligence", "Audit log", "Error center"].includes(module.title) && module.status === "warn") {
    return MODULE_STATES.empty;
  }
  if (!module.value || module.value === EMPTY) {
    if (module.status === "ok") return MODULE_STATES.empty;
    return MODULE_STATES.notConfigured;
  }
  if (module.status === "warn") return MODULE_STATES.empty;
  return MODULE_STATES.operative;
}

function matchesPeriod(value, period) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const now = new Date();
  const elapsed = now.getTime() - date.getTime();
  if (period === "today") return date >= startOfToday();
  if (period === "week") return elapsed <= 7 * 24 * 60 * 60 * 1000;
  if (period === "month") return elapsed <= 30 * 24 * 60 * 60 * 1000;
  return true;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function DashboardMapLifecycle({ pointsCount }) {
  const map = useMap();
  useEffect(() => {
    if (import.meta.env.DEV) console.log("[GPS_MAP_INIT]");
    if (pointsCount > 0) {
      if (import.meta.env.DEV) console.log("[GPS_MAP_POINTS_LOADED]");
    } else {
      if (import.meta.env.DEV) console.log("[GPS_MAP_EMPTY]");
    }
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (import.meta.env.DEV) console.log("[GPS_MAP_INVALIDATE_SIZE]");
    }, 250);
    return () => clearTimeout(timer);
  }, [map, pointsCount]);
  return null;
}

function DashboardRealMap({ campaigns, gpsPoints }) {
  const validCamps = campaigns.filter(hasCoordinates);
  const validGps = gpsPoints.filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  const totalPoints = validCamps.length + validGps.length;
  const firstGps = validGps[0];
  const firstCamp = validCamps[0];
  const center = firstGps ? [Number(firstGps.lat), Number(firstGps.lng)] : firstCamp ? [Number(firstCamp.lat), Number(firstCamp.lng)] : [45.4642, 9.19];

  if (totalPoints === 0) {
    return (
      <div style={{ padding: 16, width: "100%" }}>
        <EmptyState text="Nessun punto GPS disponibile" />
      </div>
    );
  }

  return (
    <div style={{ height: "480px", width: "100%", position: "relative", zIndex: 1 }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <DashboardMapLifecycle pointsCount={totalPoints} />
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            load: () => { if (import.meta.env.DEV) console.log("[GPS_TILE_LAYER_LOADED]"); },
            tileerror: () => { if (import.meta.env.DEV) console.log("[GPS_TILE_LAYER_ERROR]"); },
          }}
        />
        {validCamps.map((campaign) => {
          const service = SERVICES[campaign.service] || { color: C.orange };
          return (
            <CircleMarker key={`camp-${campaign.id}`} center={[Number(campaign.lat), Number(campaign.lng)]} radius={8} pathOptions={{ color: service.color, fillColor: service.color, fillOpacity: 0.85, weight: 2 }}>
              <Popup>
                <strong>{campaign.client}</strong>
                <br />
                {campaign.zone}
              </Popup>
            </CircleMarker>
          );
        })}
        {validGps.map((point, idx) => (
          <CircleMarker key={`gps-${point.id || idx}`} center={[Number(point.lat), Number(point.lng)]} radius={6} pathOptions={{ color: C.green, fillColor: C.green, fillOpacity: 0.9, weight: 2 }}>
            <Popup>
              <strong>GPS Live</strong>
              <br />
              {formatDate(point.recorded_at || point.created_at)}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function SideCard({ title, meta, children }) {
  return <section style={cardStyle}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><p style={eyebrowStyle}>{title}</p>{meta && <span style={{ fontFamily: F.sans, fontSize: 10, color: C.orange }}>{meta}</span>}</div>{children}</section>;
}

function ActionButton({ label, onClick, disabledReason, route }) {
  const disabled = Boolean(disabledReason);
  const handleClick = () => {
    console.info("[ADMIN_DASHBOARD_ROUTE_ACTION]", { label, route: route || null });
    onClick?.();
  };
  return <button onClick={disabled ? undefined : handleClick} disabled={disabled} title={disabledReason || ""} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: disabled ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.68)", fontFamily: F.sans, fontSize: 12, fontWeight: 700, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer", marginBottom: 6 }}>{label}{disabled ? ` · ${disabledReason}` : ""}</button>;
}

function SimpleRow({ title, subtitle }) {
  return <div style={{ padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.62)" }}>{title}<br /><span style={mutedTinyStyle}>{subtitle}</span></div>;
}

function WaitlistCard({ item, busy, onMarkHandled, onWhatsapp, onCreateCampaign }) {
  const [expanded, setExpanded] = useState(false);
  const handled = Boolean(item.gestita);
  const nome = item.nome || "Nome non disponibile";
  const email = item.email || "Email non disponibile";
  const whatsapp = item.whatsapp || "WhatsApp non disponibile";
  const comune = item.comune || "Comune non disponibile";
  const servizio = SERVICE_FULL_LABELS[item.servizio] || item.servizio || "Servizio non disponibile";
  const periodo = item.date_preferite || "Periodo non disponibile";
  const note = item.note || "—";
  const richiesta = formatDate(item.created_at);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{nome}</strong>
        <span style={{ padding: "3px 9px", borderRadius: 100, background: handled ? `${C.green}18` : `${C.yellow}18`, color: handled ? C.green : C.yellow, fontFamily: F.sans, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
          {handled ? "Gestita" : "Da gestire"}
        </span>
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.65)", lineHeight: 1.7 }}>
        <div>Email: {email}</div>
        <div>WhatsApp: {whatsapp}</div>
        <div>Comune: {comune}</div>
        <div>Servizio: {servizio}</div>
        <div>Periodo: {periodo}</div>
        <div>Note: {note}</div>
        <div style={mutedTinyStyle}>Richiesta: {richiesta}</div>
      </div>
      {expanded && (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,.25)", fontFamily: F.sans, fontSize: 10.5, color: "rgba(255,255,255,.5)", lineHeight: 1.6 }}>
          <div>ID: {item.id}</div>
          <div>Cliente ID: {item.cliente_id || "—"}</div>
          <div>Gestita il: {item.gestita_at ? formatDate(item.gestita_at) : "—"}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        <button onClick={() => setExpanded((v) => !v)} style={miniActionButtonStyle}>{expanded ? "Chiudi dettagli" : "Apri dettagli"}</button>
        {item.whatsapp && <button onClick={() => onWhatsapp(item)} style={{ ...miniActionButtonStyle, color: C.green, borderColor: "rgba(46,204,138,.35)" }}>WhatsApp</button>}
        <button onClick={() => onMarkHandled(item)} disabled={handled || busy} style={{ ...miniActionButtonStyle, opacity: handled || busy ? 0.45 : 1, cursor: handled || busy ? "not-allowed" : "pointer" }}>
          {busy ? "Salvataggio…" : handled ? "Già gestita" : "Segna gestita"}
        </button>
        <button onClick={() => onCreateCampaign(item)} disabled title="Conversione campagna non ancora configurata" style={{ ...miniActionButtonStyle, opacity: 0.4, cursor: "not-allowed" }}>
          Crea campagna
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: 16, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12 }}>{text}</div>;
}

function Notice({ text, danger = false }) {
  return <div style={{ ...cardStyle, padding: 13, marginBottom: 14, border: `1px solid ${danger ? "rgba(248,113,113,.28)" : "rgba(46,204,138,.24)"}`, color: danger ? "#F87171" : C.green, fontFamily: F.sans, fontSize: 12 }}>{text}</div>;
}

function filterButtons(ids, active, setActive, labels, color = C.orange) {
  return ids.map((id) => <button key={id} onClick={() => setActive(id)} style={{ padding: "5px 11px", borderRadius: 100, border: `1px solid ${active === id ? color : "rgba(255,255,255,.1)"}`, background: active === id ? `${color}18` : "rgba(255,255,255,.04)", color: active === id ? color : "rgba(255,255,255,.48)", fontFamily: F.sans, fontSize: 11, cursor: "pointer" }}>{labels[id]}</button>);
}

function statusFilterButtons(active, setActive) {
  const cfg = {
    all: { label: "Tutte", color: C.white },
    active: { label: "In distribuzione", color: C.green },
    pending: { label: "In attesa", color: C.yellow },
    done: { label: "Completate", color: "#94A3B8" },
  };
  return Object.keys(cfg).map((id) => {
    const item = cfg[id];
    const isSel = active === id;
    return (
      <button key={id} onClick={() => setActive(id)} style={{ padding: "5px 12px", borderRadius: 100, border: `1px solid ${isSel ? item.color : "rgba(255,255,255,.14)"}`, background: isSel ? `${item.color}22` : "rgba(255,255,255,.04)", color: isSel ? item.color : "rgba(255,255,255,.68)", fontFamily: F.sans, fontSize: 11, fontWeight: isSel ? 800 : 600, cursor: "pointer" }}>
        {item.label}
      </button>
    );
  });
}

function projectPoint(lat, lng) {
  return {
    x: Math.max(20, Math.min(560, 580 / 2 + (Number(lng) - 9.19) * 2600)),
    y: Math.max(20, Math.min(260, 280 / 2 - (Number(lat) - 45.46) * 3300)),
  };
}

function hasCoordinates(campaign) {
  return Number.isFinite(campaign.lat) && Number.isFinite(campaign.lng);
}

function euro(value) {
  return `€${Number(value).toLocaleString("it-IT", { maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("it-IT") : EMPTY;
}

function emptyData() {
  return { campaigns: [], waitlist: [], sessions: [], activeSessions: [], latestGpsPoints: [], activities: [], availability: {} };
}

const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 20, transition: "all 0.2s ease" };
const adminBadgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const secondaryButtonStyle = { height: 40, padding: "0 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s ease" };
const eyebrowStyle = { margin: 0, fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.45)", letterSpacing: ".12em", textTransform: "uppercase" };
const mutedTinyStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)" };
const dashboardLayoutStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16 };
const opsNavStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 16 };
const opsNavItemStyle = { display: "grid", gap: 6, padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.85)", textDecoration: "none", fontFamily: F.sans, fontSize: 13, transition: "all 0.2s ease" };
const opsCampaignStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" };
const inlineButtonStyle = { border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 14px", color: C.white, background: "rgba(255,255,255,.06)", textDecoration: "none", fontFamily: F.sans, fontSize: 12, fontWeight: 700 };
const miniLinkButtonStyle = { ...inlineButtonStyle, padding: "4px 8px", fontSize: 11 };
const linkStyle = { color: C.orange, textDecoration: "none", fontWeight: 700 };
const miniActionButtonStyle = { border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, padding: "6px 10px", color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.04)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" };
const searchInputStyle = { minWidth: 260, flex: "1 1 280px", maxWidth: 420, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.045)", color: C.white, padding: "0 13px", fontFamily: F.sans, fontSize: 13, outline: "none" };
