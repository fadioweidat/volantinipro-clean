import { useEffect, useMemo, useState } from "react";
import { getRealCampaigns, selectOptionalTable } from "../../lib/services/admin-api.js";
import {
  AUTOMATION_EVENTS,
  automationCsv,
  buildAutomationCenter,
  channelLabel,
  eventLabel,
} from "../../lib/services/automation-engine.js";

const C = {
  orange: "#E8571A",
  green: "#2ECC8A",
  yellow: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  purple: "#A78BFA",
  white: "#FFFFFF",
};

const F = {
  sans: "'DM Sans', Inter, system-ui, sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
};

const EMPTY = "Dato non disponibile";

export function AutomationCenter() {
  const [state, setState] = useState({ loading: true, error: "", center: buildAutomationCenter(), notice: "" });
  const [eventFilter, setEventFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        console.info("[AUTOMATION_ENGINE_LOAD]", { scope: "admin_automation" });
        const loaded = await loadAutomationData();
        console.info("[AUTOMATION_SCHEMA_CHECK]", loaded.center.schema);
        console.info("[AUTOMATION_EVENTS_LOAD]", { events: loaded.center.events.length, queue: loaded.center.queue.length });
        console.info("[AUTOMATION_HEALTH_CHECK]", loaded.center.healthChecks);
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: "", center: loaded.center }));
      } catch (error) {
        console.error("[AUTOMATION_ERROR]", { error: error?.message || String(error) });
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: error?.message || "Errore caricamento automazioni." }));
      }
    }
    load();
    const timer = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const { center } = state;
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return center.events
      .filter((event) => eventFilter === "all" || event.type === eventFilter)
      .filter((event) => channelFilter === "all" || event.channels.includes(channelFilter))
      .filter((event) => !q || [event.title, eventLabel(event.type), event.source, event.entityType].join(" ").toLowerCase().includes(q));
  }, [center.events, eventFilter, channelFilter, search]);

  const filteredQueue = useMemo(() => {
    const visibleEventIds = new Set(filteredEvents.map((event) => event.id));
    return center.queue.filter((item) => visibleEventIds.has(item.eventId));
  }, [center.queue, filteredEvents]);
  const automationState = classifyAutomationModule(center);
  const externalNotificationConfigured = schemaAvailable(center, "notification_logs");
  const externalWebhookConfigured = schemaAvailable(center, "webhook_logs");
  const visibleChannels = [
    "all",
    "dashboard",
    "log",
    "report",
    ...(externalNotificationConfigured ? ["email", "sms", "whatsapp"] : []),
    ...(externalWebhookConfigured ? ["webhook"] : []),
  ];

  const exportCsv = () => {
    if (!filteredEvents.length) {
      setState((prev) => ({ ...prev, notice: "Nessun evento esportabile con i filtri attuali." }));
      console.info("[AUTOMATION_EMPTY_STATE]", { area: "csv_export" });
      return;
    }
    downloadBlob(automationCsv({ ...center, events: filteredEvents }), "volantinipro-automation-events.csv", "text/csv;charset=utf-8");
    console.info("[AUTOMATION_EXPORT]", { type: "csv", events: filteredEvents.length });
    setState((prev) => ({ ...prev, notice: `CSV esportato con ${filteredEvents.length} eventi reali.` }));
  };

  const kpis = [
    { label: "Azioni interne pronte", value: center.stats.activeAutomations, sub: "solo dashboard/log/report senza provider esterni", color: C.green },
    { label: "Automazioni fallite", value: center.stats.failedAutomations, sub: "solo da log reali se presenti", color: center.stats.failedAutomations ? C.red : C.green },
    { label: "Canali non configurati", value: center.stats.notConfigured, sub: "email, SMS, WhatsApp o webhook senza provider", color: center.stats.notConfigured ? C.yellow : C.green },
    { label: "Notifiche inviate", value: schemaAvailable(center, "notification_logs") ? center.stats.notificationsSent : EMPTY, sub: schemaAvailable(center, "notification_logs") ? "da notification_logs" : "notification_logs non configurata", color: C.blue },
    { label: "Webhook", value: schemaAvailable(center, "webhook_logs") ? center.stats.webhooks : EMPTY, sub: schemaAvailable(center, "webhook_logs") ? "da webhook_logs" : "webhook_logs non configurata", color: C.purple },
    { label: "Code", value: center.stats.queue, sub: "azioni generate dagli eventi rilevati", color: C.orange },
    { label: "Email / SMS / WhatsApp", value: schemaAvailable(center, "notification_logs") ? `${center.stats.email}/${center.stats.sms}/${center.stats.whatsapp}` : EMPTY, sub: schemaAvailable(center, "notification_logs") ? "conteggi da log notifiche" : "provider/log notifiche non configurati", color: C.blue },
    { label: "Errori critici", value: center.stats.criticalErrors, sub: "API, database, storage, GPS o operatori", color: center.stats.criticalErrors ? C.red : C.green },
  ];

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={adminBadgeStyle}>ADMIN AUTOMATION</div>
          <h1 style={titleStyle}>Motore automazioni</h1>
          <p style={subtitleStyle}>Event driven center per notifiche, workflow, health check, code, webhook e audit. Solo fonti reali, nessun invio simulato.</p>
        </div>
        <div style={headerActionsStyle}>
          <a href="/admin/dashboard" style={secondaryButtonStyle}>Dashboard</a>
          <a href="/admin/finance" style={secondaryButtonStyle}>Finanza</a>
          <button onClick={() => window.print()} style={secondaryButtonStyle}>Stampa / PDF</button>
          <button onClick={exportCsv} style={primaryButtonStyle}>CSV eventi</button>
        </div>
      </header>

      {state.loading && <Notice text="Caricamento motore automazioni..." />}
      {state.error && <Notice text={state.error} danger />}
      {state.notice && <Notice text={state.notice} />}
      <Notice text={`${automationState.label}: ${automationState.detail}`} danger={automationState.tone === "danger"} />

      <section style={gridStyle}>
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Event router</p>
            <span style={mutedStyle}>Eventi monitorati: {AUTOMATION_EVENTS.length}. I canali esterni restano bloccati finche non esiste un provider reale.</span>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca evento, fonte, entita..." style={inputStyle} />
        </div>
        <div style={filterRowStyle}>
          {filterButton("all", eventFilter, setEventFilter, "Tutti")}
          {AUTOMATION_EVENTS.map((type) => filterButton(type, eventFilter, setEventFilter, eventLabel(type)))}
        </div>
        <div style={filterRowStyle}>
          {visibleChannels.map((channel) => filterButton(channel, channelFilter, setChannelFilter, channel === "all" ? "Tutti i canali" : channelLabel(channel), C.green))}
        </div>
      </section>

      <div style={layoutStyle}>
        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Eventi reali rilevati</p>
              <span style={mutedStyle}>{filteredEvents.length} eventi visibili. Nessun evento viene inventato se la fonte non esiste.</span>
            </div>
          </div>
          {filteredEvents.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredEvents.slice(0, 80).map((event) => <EventCard key={event.id} event={event} />)}
            </div>
          ) : <EmptyState text="Nessun evento reale rilevato con i filtri attuali." />}
        </section>

        <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Panel title="Code automazioni" meta={`${filteredQueue.length} azioni`}>
            {filteredQueue.length ? filteredQueue.slice(0, 18).map((item) => (
              <MiniRow
                key={item.id}
                title={`${channelLabel(item.channel)} - ${eventLabel(item.eventType)}`}
                subtitle={`${item.status === "ready" ? "Pronto" : "Non configurato"} - ${item.reason}`}
                tone={item.status === "ready" ? C.green : C.yellow}
              />
            )) : <EmptyState text="Nessuna azione in coda per gli eventi filtrati." />}
          </Panel>

          <Panel title="Workflow" meta={`${center.workflowCatalog.length} flussi`}>
            {center.workflowCatalog.map((flow) => (
              <MiniRow
                key={flow.name}
                title={flow.name}
                subtitle={`${flow.enabled ? "Base attiva" : "Parziale"} - canali mancanti: ${flow.blockedChannels.map(channelLabel).join(", ") || "nessuno"}`}
                tone={flow.enabled ? C.green : C.yellow}
              />
            ))}
          </Panel>

          <Panel title="Scheduler" meta="pianificazioni">
            {center.scheduler.map((item) => <MiniRow key={item.name} title={item.name} subtitle={`${item.purpose} - ${item.status === "configured" ? "configurato" : "non configurato"}`} tone={item.status === "configured" ? C.green : C.yellow} />)}
          </Panel>
        </aside>
      </div>

      <section style={gridTwoStyle}>
        <Panel title="Health check" meta="runtime">
          {center.healthChecks.map((item) => <MiniRow key={item.name} title={item.name} subtitle={`${item.status} - ${item.detail}`} tone={item.ok ? C.green : C.yellow} />)}
        </Panel>

        <Panel title="Backup" meta="controllo">
          {center.backups.map((item) => <MiniRow key={item.name} title={item.name} subtitle={`${item.status === "configured" ? "Configurato" : "Non configurato"} - ${item.detail}`} tone={item.status === "configured" ? C.green : C.yellow} />)}
        </Panel>

        <Panel title="Monitor tecnico" meta="client-safe">
          {center.technicalMonitor.map((item) => <MiniRow key={item.name} title={`${item.name}: ${item.value}`} subtitle={item.detail} tone={item.value === "Errore" ? C.red : C.blue} />)}
        </Panel>

        <Panel title="Promemoria" meta={`${center.reminders.length} voci`}>
          {center.reminders.length ? center.reminders.slice(0, 12).map((item) => <MiniRow key={`${item.type}-${item.title}-${item.dueAt}`} title={item.title} subtitle={`${eventLabel(item.type)} - ${item.dueAt || "data non disponibile"}`} tone={C.yellow} />) : <EmptyState text="Nessun promemoria reale generabile dai dati correnti." />}
        </Panel>
      </section>

      <section style={gridTwoStyle}>
        <Panel title="Audit log" meta={`${center.audit.length} record`}>
          {center.audit.length ? center.audit.slice(0, 20).map((item) => (
            <MiniRow key={item.id} title={item.event} subtitle={`${item.user} - ${item.createdAt || EMPTY} - IP ${item.ip}`} tone={C.blue} />
          )) : <EmptyState text="Audit log non configurato o nessun evento audit registrato." />}
        </Panel>

        <Panel title="Provider canali" meta="stato">
          {["dashboard", "log", "email", "sms", "whatsapp", "webhook", "report"].map((channel) => {
            const configured = displayChannelConfigured(center, channel);
            const ready = configured && filteredQueue.some((item) => item.channel === channel && item.status === "ready");
            const missing = !configured || filteredQueue.some((item) => item.channel === channel && item.status === "not_configured");
            return <MiniRow key={channel} title={channelLabel(channel)} subtitle={ready ? "Canale operativo per eventi rilevati" : missing ? "Provider non configurato" : "Nessun evento usa questo canale ora"} tone={ready ? C.green : missing ? C.yellow : C.blue} />;
          })}
        </Panel>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Fonti dati automazione</p>
        <div style={schemaGridStyle}>
          {center.schema.map((item) => (
            <div key={item.name} style={schemaCardStyle}>
              <strong style={{ color: item.available ? C.green : "rgba(255,255,255,.45)", fontFamily: F.sans, fontSize: 12 }}>{item.name}</strong>
              <span style={mutedStyle}>{item.available ? `${item.rows} righe lette` : "non disponibile o non configurata"}</span>
              {item.columns.length > 0 && <span style={mutedStyle}>Colonne: {item.columns.join(", ")}</span>}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

async function loadAutomationData() {
  const started = performance.now();
  const [
    campaignsResult,
    waitlist,
    sessions,
    gpsPoints,
    photos,
    payments,
    pagamenti,
    activityLog,
    auditLog,
    tickets,
    webhookLogs,
    notificationLogs,
    backupJobs,
  ] = await Promise.all([
    getRealCampaigns({ includeTest: true }),
    selectOptionalTable("smart_pairing_waitlist", null),
    selectOptionalTable("delivery_sessions", null),
    selectOptionalTable("gps_tracking_points", "recorded_at"),
    selectOptionalTable("proof_photos", null),
    selectOptionalTable("payments", null),
    selectOptionalTable("pagamenti", null),
    selectOptionalTable("activity_log", null),
    selectOptionalTable("audit_log", null),
    selectOptionalTable("tickets", null),
    selectOptionalTable("webhook_logs", null),
    selectOptionalTable("notification_logs", null),
    selectOptionalTable("backup_jobs", null),
  ]);

  const paymentRows = [...payments.rows, ...pagamenti.rows];
  const health = {
    api: true,
    database: campaignsResult.availability.campaigns || waitlist.available || sessions.available,
    storage: photos.available,
    apiLatencyMs: performance.now() - started,
  };
  const availability = {
    campaigns: campaignsResult.availability.campaigns,
    waitlist: waitlist.available,
    sessions: sessions.available,
    gps: gpsPoints.available,
    photos: photos.available,
    payments: payments.available || pagamenti.available,
    activityLog: activityLog.available,
    auditLog: auditLog.available,
    tickets: tickets.available,
    webhooks: webhookLogs.available,
    notifications: notificationLogs.available,
    backups: backupJobs.available,
    database: health.database,
    scheduler: backupJobs.available,
    emailProvider: notificationLogs.available && notificationLogs.rows.some((row) => String(row.channel || row.canale || "").toLowerCase().includes("email")),
    smsProvider: notificationLogs.available && notificationLogs.rows.some((row) => String(row.channel || row.canale || "").toLowerCase().includes("sms")),
    whatsappProvider: notificationLogs.available && notificationLogs.rows.some((row) => String(row.channel || row.canale || "").toLowerCase().includes("whatsapp")),
    realtime: false,
    edgeFunctions: false,
    externalServices: webhookLogs.available || notificationLogs.available,
  };

  return {
    center: buildAutomationCenter({
      campaigns: campaignsResult.allRows,
      waitlist: waitlist.rows,
      sessions: sessions.rows,
      gpsPoints: gpsPoints.rows,
      photos: photos.rows,
      payments: paymentRows,
      activityLog: activityLog.rows,
      auditLog: auditLog.rows,
      ticketRows: tickets.rows,
      webhookRows: webhookLogs.rows,
      notificationRows: notificationLogs.rows,
      backupRows: backupJobs.rows,
      availability,
      health,
    }),
  };
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function schemaAvailable(center, name) {
  return center.schema.some((item) => item.name === name && item.available);
}

function displayChannelConfigured(center, channel) {
  if (["dashboard", "log", "report"].includes(channel)) return true;
  if (["email", "sms", "whatsapp"].includes(channel)) return schemaAvailable(center, "notification_logs");
  if (channel === "webhook") return schemaAvailable(center, "webhook_logs");
  return false;
}

function classifyAutomationModule(center) {
  const coreConfigured = ["tickets", "webhook_logs", "notification_logs", "backup_jobs"].some((name) => schemaAvailable(center, name));
  if (!coreConfigured) {
    return {
      label: "Non configurato",
      detail: "tickets, webhook_logs, notification_logs e backup_jobs non risultano disponibili; restano visibili solo eventi locali da fonti reali",
      tone: "danger",
    };
  }
  if (!center.events.length && !center.queue.length) {
    return {
      label: "Configurato ma senza dati",
      detail: "le sorgenti automazione sono leggibili ma non ci sono eventi operativi",
      tone: "warn",
    };
  }
  return {
    label: "Operativo",
    detail: "eventi e code sono calcolati da fonti reali configurate",
    tone: "ok",
  };
}

function EventCard({ event }) {
  const tone = severityColor(event.severity);
  return (
    <div style={{ padding: 14, borderRadius: 13, border: `1px solid ${tone}33`, background: "rgba(255,255,255,.035)", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <strong style={{ display: "block", color: C.white, fontFamily: F.sans, fontSize: 14 }}>{event.title}</strong>
          <span style={mutedStyle}>{eventLabel(event.type)} - {event.source} - {event.createdAt || EMPTY}</span>
        </div>
        <Badge label={event.severity} tone={tone} />
      </div>
      <div style={filterRowStyle}>
        {event.channels.map((channel) => <Badge key={channel} label={channelLabel(channel)} tone={channel === "dashboard" || channel === "log" || channel === "report" ? C.green : C.yellow} />)}
      </div>
      <span style={mutedStyle}>Stato: {event.status === "detected" ? "rilevato" : event.status === "handled" ? "gestito" : "richiede provider reale"}</span>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{label}</p>
      <strong style={{ display: "block", marginTop: 8, color, fontFamily: F.serif, fontSize: 27, letterSpacing: "-.7px" }}>{value}</strong>
      <span style={mutedStyle}>{sub}</span>
    </div>
  );
}

function Panel({ title, meta, children }) {
  return (
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <p style={eyebrowStyle}>{title}</p>
        {meta && <span style={{ ...mutedStyle, color: C.orange }}>{meta}</span>}
      </div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </section>
  );
}

function MiniRow({ title, subtitle, tone = C.blue }) {
  return (
    <div style={miniRowStyle}>
      <strong style={{ color: tone, fontFamily: F.sans, fontSize: 12 }}>{title}</strong>
      <span style={mutedStyle}>{subtitle}</span>
    </div>
  );
}

function Badge({ label, tone }) {
  return <span style={{ display: "inline-flex", padding: "4px 9px", borderRadius: 100, background: `${tone}18`, border: `1px solid ${tone}45`, color: tone, fontFamily: F.sans, fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>{label}</span>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

function Notice({ text, danger = false }) {
  return <div style={{ ...cardStyle, padding: 13, marginBottom: 14, border: `1px solid ${danger ? "rgba(248,113,113,.28)" : "rgba(46,204,138,.24)"}`, color: danger ? C.red : C.green, fontFamily: F.sans, fontSize: 12 }}>{text}</div>;
}

function filterButton(id, active, setActive, label, color = C.orange) {
  const selected = id === active;
  return (
    <button key={id} onClick={() => setActive(id)} style={{ padding: "6px 11px", borderRadius: 100, border: `1px solid ${selected ? color : "rgba(255,255,255,.13)"}`, background: selected ? `${color}1F` : "rgba(255,255,255,.04)", color: selected ? color : "rgba(255,255,255,.66)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
      {label}
    </button>
  );
}

function severityColor(severity) {
  if (severity === "critical") return C.red;
  if (severity === "warning") return C.yellow;
  if (severity === "success") return C.green;
  return C.blue;
}

const pageStyle = { maxWidth: 1380, margin: "0 auto", padding: "24px 24px 70px", minHeight: "100vh" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 22 };
const headerActionsStyle = { display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" };
const titleStyle = { fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" };
const subtitleStyle = { margin: 0, fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.52)" };
const adminBadgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 18, boxShadow: "0 18px 70px rgba(0,0,0,.18)" };
const primaryButtonStyle = { minHeight: 40, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(232,87,26,.42)", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle = { minHeight: 40, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.055)", color: C.white, textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 16 };
const gridTwoStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))", gap: 14, margin: "16px 0" };
const layoutStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16, marginTop: 16 };
const sectionHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 };
const eyebrowStyle = { margin: 0, fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.46)", letterSpacing: ".12em", textTransform: "uppercase" };
const mutedStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.48)", lineHeight: 1.45 };
const inputStyle = { flex: "1 1 280px", maxWidth: 440, minWidth: 220, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.13)", background: "rgba(255,255,255,.045)", color: C.white, padding: "0 13px", fontFamily: F.sans, fontSize: 13, outline: "none" };
const filterRowStyle = { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 };
const miniRowStyle = { display: "grid", gap: 3, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.055)" };
const emptyStyle = { padding: 14, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.45)", fontFamily: F.sans, fontSize: 12, lineHeight: 1.5 };
const schemaGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 12 };
const schemaCardStyle = { display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.035)" };
