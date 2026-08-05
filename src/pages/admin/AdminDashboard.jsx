import React, { useEffect, useState } from "react";
import { getRealCampaigns, getLiveOperatorsSummary, selectOptionalTable } from "../../lib/services/admin-api.js";
import { isAdminAiDashboardEnabled } from "../../lib/runtimeFlags.js";
import { AdminOperationalMap } from "../../components/admin/AdminOperationalMap.jsx";
import { AdminLayout } from "./AdminLayout.jsx";

const AdminCentralAiPanel = React.lazy(() => import("../../components/ai/admin/AdminCentralAiPanel.jsx"));

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
  serif: "'Playfair Display', Georgia, serif",
};

const EMPTY = "Dato non disponibile";
const STATUSES = {
  active: { label: "In distribuzione", color: C.green },
  pending: { label: "In attesa", color: C.yellow },
  done: { label: "Completata", color: "rgba(255,255,255,.58)" },
};
const SERVICES = {
  d2d: { label: "D2D", color: C.orange },
  h2h: { label: "H2H", color: C.blue },
  b2b: { label: "B2B", color: C.purple },
};
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

  const { campaigns, waitlist, activities, liveOperators, liveCount, warningCount, availability } = state.data;
  const visibleCampaigns = campaigns.filter((campaign) => showTestCampaigns || campaign.quality === "real");
  const filteredCampaigns = visibleCampaigns
    .filter((campaign) => statusFilter === "all" || campaign.status === statusFilter)
    .filter((campaign) => serviceFilter === "all" || campaign.service === serviceFilter);
  const validCampaigns = campaigns.filter((campaign) => campaign.quality === "real");
  const revenueValues = validCampaigns.map((campaign) => campaign.total).filter((val) => val != null);
  const totalRevenue = validCampaigns.every((campaign) => campaign.total != null) && validCampaigns.length > 0
    ? validCampaigns.reduce((sum, campaign) => sum + campaign.total, 0)
    : null;
  const totalQty = validCampaigns.reduce((sum, campaign) => sum + (campaign.qty || 0), 0);
  const avgCpm = totalRevenue != null && totalQty > 0 ? (totalRevenue / totalQty) * 1000 : null;

  const kpis = [
    { label: "Revenue totale", value: totalRevenue == null ? EMPTY : euro(totalRevenue), sub: totalRevenue != null ? "da campagne reali" : "dati importo parziali o mancanti", color: C.orange },
    { label: "In distribuzione", value: validCampaigns.filter((campaign) => campaign.status === "active").length, sub: `${liveCount + warningCount} sessioni GPS attive`, color: C.green },
    { label: "In attesa", value: validCampaigns.filter((campaign) => campaign.status === "pending").length, sub: "campagne valide", color: C.yellow },
    { label: "Completate", value: validCampaigns.filter((campaign) => campaign.status === "done").length, sub: "campagne valide", color: "rgba(255,255,255,.58)" },
    { label: "CPM medio", value: avgCpm == null ? EMPTY : euro(avgCpm), sub: totalQty > 0 ? "per 1.000 volantini" : "quantita mancante", color: C.blue },
  ];

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
    <AdminLayout onNav={onNav}>
      {state.loading && <Notice text="Caricamento dati admin reali..." />}
      {state.error && <Notice text={state.error} danger />}
      {notice && <Notice text={notice} />}

      <React.Suspense fallback={<div style={{ minHeight: 90, marginBottom: 16 }} aria-label="Caricamento Assistente Admin" />}>
        <AdminCentralAiPanel
          adminData={state.data}
          loading={state.loading}
          error={state.error}
        />
      </React.Suspense>

      <section style={kpiGridStyle}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={cardStyle}>
            <p style={eyebrowStyle}>{kpi.label}</p>
            <strong style={{ display: "block", fontFamily: F.serif, fontSize: 25, color: kpi.color, letterSpacing: "-.8px", marginBottom: 3 }}>{kpi.value}</strong>
            <span style={mutedTinyStyle}>{kpi.sub}</span>
          </div>
        ))}
      </section>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={eyebrowStyle}>Centrale operativa</p>
        <div style={opsNavStyle}>
          <a style={opsNavItemStyle} href="#campagne-attive"><strong>Campagne attive</strong><span>Stato, gruppi, operatori e problemi</span></a>
          <a style={opsNavItemStyle} href="#gruppi-operativi"><strong>Gruppi operativi</strong><span>Accesso per campagna e capogruppo</span></a>
          <a style={opsNavItemStyle} href="/admin/live"><strong>Monitor GPS Live</strong><span>Storico, online/offline e ping</span></a>
          <a style={opsNavItemStyle} href="#report-storico"><strong>Report e storico</strong><span>Operations, report finale, export</span></a>
          <a style={opsNavItemStyle} href="#link-operatori"><strong>Link operatori</strong><span>Tracking gruppo per ragazzi</span></a>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 16 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <section id="campagne-attive" style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <p style={eyebrowStyle}>Campagne operative valide</p>
                <span style={mutedTinyStyle}>{validCampaigns.length} valide · {campaigns.length - validCampaigns.length} escluse</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 100, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.58)", fontFamily: F.sans, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={showTestCampaigns} onChange={(event) => setShowTestCampaigns(event.target.checked)} />
                  Mostra campagne test
                </label>
                {filterButtons(["all", "active", "pending", "done"], statusFilter, setStatusFilter, { all: "Tutte", active: "In distribuzione", pending: "In attesa", done: "Completate" })}
                {filterButtons(["all", "d2d", "h2h", "b2b"], serviceFilter, setServiceFilter, { all: "Servizi", d2d: "D2D", h2h: "H2H", b2b: "B2B" }, C.blue)}
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

          <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
              <p style={eyebrowStyle}>Mappa operativa reale</p>
            </div>
            <AdminOperationalMap operators={liveOperators} />
          </section>
        </div>

        <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <SideCard title="Azioni rapide">
            <ActionButton label="Nuova campagna" onClick={() => { window.location.href = "/admin/campaigns/new"; }} />
            <ActionButton label="Monitor GPS Live" onClick={() => { window.location.href = "/admin/live"; }} />
            <ActionButton label="Gruppi prima campagna" onClick={() => { window.location.href = `/admin/campaigns/${filteredCampaigns[0]?.id}/groups`; }} disabledReason={filteredCampaigns[0]?.id ? "" : "Nessuna campagna selezionata."} />
            <ActionButton label="Operazioni prima campagna" onClick={() => { window.location.href = `/admin/campaigns/${filteredCampaigns[0]?.id}/operations`; }} disabledReason={filteredCampaigns[0]?.id ? "" : "Nessuna campagna selezionata."} />
            <ActionButton label="Report prima campagna" onClick={() => { window.location.href = `/admin/campaigns/${filteredCampaigns[0]?.id}/report`; }} disabledReason={filteredCampaigns[0]?.id ? "" : "Nessuna campagna selezionata."} />
            <ActionButton label="Trova Smart Pairing" onClick={() => go("step3")} />
            <ActionButton label="Apri analisi zona" onClick={() => go("step2")} />
            <ActionButton label="Genera PDF preventivi" onClick={() => go("step4")} disabledReason="Richiede una campagna configurata nello Step 4." />
            <ActionButton label="Esporta campagne operative" onClick={exportCsv} disabledReason={filteredCampaigns.length ? "" : "Nessuna campagna reale da esportare."} />
          </SideCard>

          <SideCard title="Smart Pairing Waitlist" meta={`${waitlist.length} richieste`}>
            {!availability.waitlist ? <EmptyState text="Tabella waitlist non disponibile." /> : waitlist.length === 0 ? <EmptyState text="Nessuna richiesta Smart Pairing reale." /> : waitlist.slice(0, 8).map((item) => <SimpleRow key={item.id || item.email || item.created_at} title={item.email || item.nome || "Richiesta"} subtitle={item.zone || item.zona || item.preferred_period || EMPTY} />)}
          </SideCard>

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

          <SideCard title="Ultime attivita">
            {!availability.activities ? <EmptyState text="Nessun log attivita reale disponibile." /> : activities.length === 0 ? <EmptyState text="Nessuna attivita registrata." /> : activities.slice(0, 8).map((activity) => <SimpleRow key={activity.id || activity.created_at} title={activity.message || activity.event || activity.action || EMPTY} subtitle={formatDate(activity.created_at || activity.recorded_at)} />)}
          </SideCard>
        </aside>
      </div>
    </AdminLayout>
  );
}

async function loadAdminData() {
  const [campaignsResult, liveSummary, waitlist, activities] = await Promise.all([
    getRealCampaigns({ includeTest: true }),
    // Stessa fonte/logica di AdminLiveDashboard (getLiveDrivers +
    // classifySessionLifecycle + dedupeSessionsByOperator): i due KPI
    // "sessioni GPS attive" coincidono sempre, nessuna seconda logica.
    getLiveOperatorsSummary().catch(() => ({ current: [], liveCount: 0, warningCount: 0 })),
    selectOptionalTable("smart_pairing_waitlist"),
    selectOptionalTable("activity_log"),
  ]);
  return {
    campaigns: campaignsResult.allRows,
    waitlist: waitlist.rows,
    // Solo operatori davvero live/warning: mai completed/cancelled o
    // sessioni 'started' abbandonate da giorni (gia' escluse da lifecycle
    // 'history' dentro getLiveOperatorsSummary), mai lo stesso operatore
    // due volte.
    liveOperators: liveSummary.current.filter((item) => item.lifecycle === "live" || item.lifecycle === "warning"),
    liveCount: liveSummary.liveCount,
    warningCount: liveSummary.warningCount,
    activities: activities.rows,
    availability: {
      campaigns: campaignsResult.availability.campaigns,
      waitlist: waitlist.available,
      photos: campaignsResult.availability.photos,
      activities: activities.available,
    },
  };
}

function normalizeCampaign(row, source) {
  const rawStatus = String(row.status || row.stato || row.state || row.stato_pagamento || "").toLowerCase();
  const serviceSource = row.service_type || row.campaign_type || row.type || row.servizio || row.selected_service || row.service;
  const serviceRaw = String(serviceSource || "").toLowerCase();
  const rawTotal = row.total_budget ?? row.total_amount ?? row.amount ?? row.price ?? row.totale;
  let parsedTotal = null;
  if (rawTotal != null && String(rawTotal).trim() !== '') {
    const maybeNumber = Number(rawTotal);
    if (Number.isFinite(maybeNumber)) {
      parsedTotal = maybeNumber;
    }
  }
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
    total: parsedTotal,
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

function uniqueById(rows) {
  return Array.from(new Map(rows.filter((row) => row.id).map((row) => [String(row.id), row])).values());
}

function CampaignRow({ campaign }) {
  const service = SERVICES[campaign.service] || { label: "N/D", color: "rgba(255,255,255,.38)" };
  const status = STATUSES[campaign.status] || STATUSES.pending;
  const quality = QUALITY_BADGES[campaign.quality] || QUALITY_BADGES.incomplete;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px minmax(180px,1.4fr) 92px 96px 92px 96px 112px 220px", gap: 10, alignItems: "center", padding: 12, borderRadius: 11, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", overflowX: "auto" }}>
      <div style={{ fontFamily: F.sans, fontSize: 11, color: service.color, fontWeight: 900 }}>{service.label}<br /><span style={{ color: "rgba(255,255,255,.35)", fontWeight: 600 }}>{String(campaign.id).slice(0, 8)}</span></div>
      <div><strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{campaign.client}</strong><br /><span style={mutedTinyStyle}>{campaign.zone} · {campaign.qty ? `${campaign.qty.toLocaleString("it-IT")} volantini` : EMPTY}</span></div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: C.orange, fontWeight: 800 }}>{campaign.ops?.groups || 0} gruppi</div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: C.green, fontWeight: 800 }}>{campaign.ops?.online || 0} online<br /><span style={{ color: "#ef4444" }}>{campaign.ops?.offline || 0} offline</span></div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: C.blue, fontWeight: 800 }}>{campaign.ops?.progress || 0}%</div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: campaign.ops?.problems ? "#ef4444" : C.green, fontWeight: 800 }}>{campaign.ops?.problems || 0} problemi</div>
      <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.48)", fontWeight: 700 }}>{formatDate(campaign.ops?.lastPing)}</div>
      <div style={{ padding: "4px 8px", borderRadius: 100, background: `${status.color}18`, color: status.color, fontFamily: F.sans, fontSize: 10, fontWeight: 800, textAlign: "center" }}>{status.label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <a style={miniLinkButtonStyle} href={`/admin/campaigns/${campaign.id}/groups`}>Gruppi</a>
        <a style={miniLinkButtonStyle} href={`/admin/campaigns/${campaign.id}/operations`}>GPS</a>
        <a style={miniLinkButtonStyle} href={`/admin/campaigns/${campaign.id}/report`}>Report</a>
        <span title={campaign.qualityReason} style={{ padding: "4px 8px", borderRadius: 100, background: `${quality.color}18`, color: quality.color, fontFamily: F.sans, fontSize: 10, fontWeight: 900, textAlign: "center" }}>{quality.label}</span>
      </div>
    </div>
  );
}

function SideCard({ title, meta, children }) {
  return <section style={cardStyle}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><p style={eyebrowStyle}>{title}</p>{meta && <span style={{ fontFamily: F.sans, fontSize: 10, color: C.orange }}>{meta}</span>}</div>{children}</section>;
}

function ActionButton({ label, onClick, disabledReason }) {
  const disabled = Boolean(disabledReason);
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} title={disabledReason || ""} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: disabled ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.68)", fontFamily: F.sans, fontSize: 12, fontWeight: 700, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer", marginBottom: 6 }}>{label}{disabled ? ` · ${disabledReason}` : ""}</button>;
}

function SimpleRow({ title, subtitle }) {
  return <div style={{ padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.62)" }}>{title}<br /><span style={mutedTinyStyle}>{subtitle}</span></div>;
}

function EmptyState({ text }) {
  return <div style={{ padding: 16, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12 }}>{text}</div>;
}

function Notice({ text, danger = false }) {
  return <div style={{ ...cardStyle, padding: 13, marginBottom: 14, borderColor: danger ? "rgba(248,113,113,.28)" : "rgba(46,204,138,.24)", color: danger ? "#F87171" : C.green, fontFamily: F.sans, fontSize: 12 }}>{text}</div>;
}

function filterButtons(ids, active, setActive, labels, color = C.orange) {
  return ids.map((id) => <button key={id} onClick={() => setActive(id)} style={{ padding: "5px 11px", borderRadius: 100, border: `1px solid ${active === id ? color : "rgba(255,255,255,.1)"}`, background: active === id ? `${color}18` : "rgba(255,255,255,.04)", color: active === id ? color : "rgba(255,255,255,.48)", fontFamily: F.sans, fontSize: 11, cursor: "pointer" }}>{labels[id]}</button>);
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

const emptyData = () => ({ campaigns: [], waitlist: [], liveOperators: [], liveCount: 0, warningCount: 0, activities: [], availability: {} });

const cardStyle = { background: "rgba(255,255,255,.04)", borderRadius: 13, border: "1px solid rgba(255,255,255,.08)", padding: 16 };
const eyebrowStyle = { margin: 0, fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.36)", letterSpacing: ".1em", textTransform: "uppercase" };
const mutedTinyStyle = { fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.34)" };
const kpiGridStyle = { display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 10, marginBottom: 18 };
const opsNavStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 };
const opsNavItemStyle = { display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.035)", color: "rgba(255,255,255,.72)", textDecoration: "none", fontFamily: F.sans, fontSize: 12 };
const opsCampaignStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)" };
const inlineButtonStyle = { border: "1px solid rgba(255,255,255,.1)", borderRadius: 9, padding: "8px 10px", color: C.white, background: "rgba(255,255,255,.04)", textDecoration: "none", fontFamily: F.sans, fontSize: 12, fontWeight: 800 };
const miniLinkButtonStyle = { ...inlineButtonStyle, padding: "4px 7px", fontSize: 10 };
const linkStyle = { color: C.orange, textDecoration: "none", fontWeight: 900 };
