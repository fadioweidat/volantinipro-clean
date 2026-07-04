const EMPTY = "Dato non disponibile";

export const AUTOMATION_EVENTS = [
  "new_customer",
  "new_supplier",
  "new_campaign",
  "new_quote",
  "quote_accepted",
  "quote_refused",
  "payment_received",
  "payment_overdue",
  "new_operator",
  "operator_online",
  "operator_offline",
  "gps_lost",
  "gps_restored",
  "photo_uploaded",
  "photo_missing",
  "campaign_started",
  "campaign_completed",
  "campaign_suspended",
  "api_error",
  "database_error",
  "storage_error",
  "login_error",
  "new_ticket",
];

export const CHANNELS = ["dashboard", "log", "email", "sms", "whatsapp", "webhook", "report"];

export function buildAutomationCenter({
  campaigns = [],
  waitlist = [],
  sessions = [],
  gpsPoints = [],
  photos = [],
  payments = [],
  activityLog = [],
  auditLog = [],
  ticketRows = [],
  webhookRows = [],
  notificationRows = [],
  backupRows = [],
  availability = {},
  health = {},
} = {}) {
  const events = [
    ...campaigns.flatMap(campaignToEvents),
    ...waitlist.map(waitlistToEvent),
    ...sessions.flatMap((session) => sessionToEvents(session, gpsPoints)),
    ...photos.map(photoToEvent),
    ...payments.flatMap(paymentToEvents),
    ...ticketRows.map(ticketToEvent),
    ...activityLog.map((row) => logToEvent(row, "activity_log")),
    ...auditLog.map((row) => logToEvent(row, "audit_log")),
    ...healthToEvents(health, availability),
  ].filter(Boolean).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const workflowCatalog = buildWorkflowCatalog(availability);
  const queue = buildQueue(events, workflowCatalog, availability);
  const notificationStats = buildNotificationStats(notificationRows);
  const webhookStats = buildWebhookStats(webhookRows);
  const scheduler = buildScheduler(availability);
  const healthChecks = buildHealthChecks(availability, health);
  const backups = buildBackupStatus(availability);
  const technicalMonitor = buildTechnicalMonitor(health, events);
  const audit = buildAudit(auditLog, activityLog);
  const stats = buildStats(events, queue, notificationStats, webhookStats);

  return {
    events,
    queue,
    workflowCatalog,
    scheduler,
    reminders: buildReminders(events, campaigns, payments),
    healthChecks,
    backups,
    technicalMonitor,
    audit,
    notificationStats,
    webhookStats,
    stats,
    schema: buildSchemaSummary({ availability, campaigns, waitlist, sessions, gpsPoints, photos, payments, activityLog, auditLog, ticketRows, webhookRows, notificationRows, backupRows }),
  };
}

export function eventLabel(type) {
  return {
    new_customer: "Nuovo cliente",
    new_supplier: "Nuovo fornitore",
    new_campaign: "Nuova campagna",
    new_quote: "Nuovo preventivo",
    quote_accepted: "Preventivo accettato",
    quote_refused: "Preventivo rifiutato",
    payment_received: "Pagamento ricevuto",
    payment_overdue: "Pagamento scaduto",
    new_operator: "Nuovo operatore",
    operator_online: "Operatore online",
    operator_offline: "Operatore offline",
    gps_lost: "GPS perso",
    gps_restored: "GPS ripristinato",
    photo_uploaded: "Foto caricata",
    photo_missing: "Foto mancante",
    campaign_started: "Campagna iniziata",
    campaign_completed: "Campagna completata",
    campaign_suspended: "Campagna sospesa",
    api_error: "Errore API",
    database_error: "Errore Database",
    storage_error: "Errore Storage",
    login_error: "Errore Login",
    new_ticket: "Nuovo ticket",
  }[type] || type;
}

export function channelLabel(channel) {
  return {
    dashboard: "Dashboard",
    log: "Log",
    email: "Email",
    sms: "SMS",
    whatsapp: "WhatsApp",
    webhook: "Webhook",
    report: "Report",
  }[channel] || channel;
}

export function automationCsv(center) {
  const rows = [
    ["id", "evento", "titolo", "severita", "stato", "canali", "data"],
    ...center.events.map((event) => [
      event.id,
      eventLabel(event.type),
      event.title,
      event.severity,
      event.status,
      event.channels.map(channelLabel).join(", "),
      event.createdAt || "",
    ]),
  ];
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function campaignToEvents(campaign) {
  const base = {
    entityId: campaign.id,
    entityType: "campaign",
    title: `${campaign.client || "Cliente"} - ${campaign.zone || EMPTY}`,
    createdAt: campaign.date,
    source: campaign.source || "campaigns",
  };
  const events = [];
  if (campaign.id) {
    events.push(makeEvent({ ...base, type: "new_campaign", severity: "info", channels: ["dashboard", "log"], status: "detected" }));
  }
  if (campaign.status === "active") {
    events.push(makeEvent({ ...base, type: "campaign_started", severity: "success", channels: ["dashboard", "log", "report"], status: "detected" }));
  }
  if (campaign.status === "done") {
    events.push(makeEvent({ ...base, type: "campaign_completed", severity: "success", channels: ["dashboard", "log", "report"], status: "detected" }));
  }
  if (String(campaign.rawStatus || "").includes("sosp") || String(campaign.rawStatus || "").includes("suspend")) {
    events.push(makeEvent({ ...base, type: "campaign_suspended", severity: "warning", channels: ["dashboard", "log", "email"], status: "requires_provider" }));
  }
  if ((campaign.ops?.groups || 0) > 0 && (campaign.ops?.photos || 0) === 0) {
    events.push(makeEvent({ ...base, type: "photo_missing", severity: "warning", channels: ["dashboard", "log", "whatsapp"], status: "requires_provider" }));
  }
  return events;
}

function waitlistToEvent(row) {
  return makeEvent({
    type: "new_customer",
    entityId: row.id,
    entityType: "waitlist",
    title: row.nome || row.email || "Nuova richiesta cliente",
    createdAt: row.created_at,
    severity: row.gestita ? "info" : "warning",
    channels: ["dashboard", "log", "email", "whatsapp"],
    status: row.gestita ? "handled" : "requires_provider",
    source: "smart_pairing_waitlist",
  });
}

function sessionToEvents(session, gpsPoints) {
  const sessionId = session.id || session.session_id;
  const points = gpsPoints.filter((point) => String(point.session_id || point.delivery_session_id || "") === String(sessionId));
  const last = latestByDate(points, "recorded_at") || latestByDate(points, "created_at");
  const lastAt = last?.recorded_at || last?.created_at || session.updated_at || session.last_ping_at;
  const status = classifyPing(lastAt);
  const title = session.operator_name || session.driver_name || session.user_email || sessionId || "Operatore";
  const events = [];
  if (sessionId) {
    events.push(makeEvent({
      type: "new_operator",
      entityId: sessionId,
      entityType: "operator_session",
      title,
      createdAt: session.created_at || lastAt,
      severity: "info",
      channels: ["dashboard", "log"],
      status: "detected",
      source: "delivery_sessions",
    }));
  }
  if (status === "online") {
    events.push(makeEvent({ type: "operator_online", entityId: sessionId, entityType: "operator_session", title, createdAt: lastAt, severity: "success", channels: ["dashboard", "log"], status: "detected", source: "gps_tracking_points" }));
    events.push(makeEvent({ type: "gps_restored", entityId: sessionId, entityType: "operator_session", title: `GPS attivo - ${title}`, createdAt: lastAt, severity: "success", channels: ["dashboard", "log"], status: "detected", source: "gps_tracking_points" }));
  } else if (status === "offline") {
    events.push(makeEvent({ type: "operator_offline", entityId: sessionId, entityType: "operator_session", title, createdAt: lastAt, severity: "critical", channels: ["dashboard", "log", "whatsapp"], status: "requires_provider", source: "gps_tracking_points" }));
    events.push(makeEvent({ type: "gps_lost", entityId: sessionId, entityType: "operator_session", title: `GPS assente - ${title}`, createdAt: lastAt, severity: "critical", channels: ["dashboard", "log", "whatsapp"], status: "requires_provider", source: "gps_tracking_points" }));
  }
  if (Number(session.battery_level || session.battery) > 0 && Number(session.battery_level || session.battery) <= 20) {
    events.push(makeEvent({ type: "operator_offline", entityId: sessionId, entityType: "operator_session", title: `Batteria bassa - ${title}`, createdAt: lastAt, severity: "warning", channels: ["dashboard", "log", "whatsapp"], status: "requires_provider", source: "delivery_sessions" }));
  }
  return events;
}

function photoToEvent(photo) {
  return makeEvent({
    type: "photo_uploaded",
    entityId: photo.id || photo.photo_id,
    entityType: "photo",
    title: photo.filename || photo.storage_path || "Foto proof caricata",
    createdAt: photo.created_at || photo.taken_at,
    severity: "success",
    channels: ["dashboard", "log", "report"],
    status: "detected",
    source: "proof_photos",
  });
}

function paymentToEvents(payment) {
  const status = String(payment.status || payment.stato || payment.payment_status || "").toLowerCase();
  const title = payment.client_name || payment.customer_name || payment.email || payment.id || "Pagamento";
  const amount = readNumber(payment.amount, payment.importo, payment.total, payment.totale);
  const events = [];
  if (status.includes("paid") || status.includes("incass") || status.includes("pagato")) {
    events.push(makeEvent({ type: "payment_received", entityId: payment.id, entityType: "payment", title: `${title} ${Number.isFinite(amount) ? euro(amount) : ""}`.trim(), createdAt: payment.paid_at || payment.created_at, severity: "success", channels: ["dashboard", "log", "email"], status: "requires_provider", source: "payments" }));
  }
  if (status.includes("overdue") || status.includes("scad")) {
    events.push(makeEvent({ type: "payment_overdue", entityId: payment.id, entityType: "payment", title, createdAt: payment.due_date || payment.created_at, severity: "critical", channels: ["dashboard", "log", "email", "whatsapp"], status: "requires_provider", source: "payments" }));
  }
  return events;
}

function ticketToEvent(ticket) {
  return makeEvent({
    type: "new_ticket",
    entityId: ticket.id || ticket.ticket_id,
    entityType: "ticket",
    title: ticket.title || ticket.subject || ticket.message || "Nuovo ticket",
    createdAt: ticket.created_at,
    severity: "warning",
    channels: ["dashboard", "log", "email"],
    status: "requires_provider",
    source: "tickets",
  });
}

function logToEvent(row, source) {
  const action = String(row.action || row.event_type || row.type || row.message || "").toLowerCase();
  const type = action.includes("login") && action.includes("error") ? "login_error"
    : action.includes("storage") && action.includes("error") ? "storage_error"
    : action.includes("database") && action.includes("error") ? "database_error"
    : action.includes("api") && action.includes("error") ? "api_error"
    : null;
  if (!type) return null;
  return makeEvent({
    type,
    entityId: row.id,
    entityType: "log",
    title: row.message || row.action || eventLabel(type),
    createdAt: row.created_at || row.timestamp,
    severity: "critical",
    channels: ["dashboard", "log", "email"],
    status: "requires_provider",
    source,
  });
}

function healthToEvents(health, availability) {
  const events = [];
  if (health.database === false || availability.database === false) {
    events.push(makeEvent({ type: "database_error", title: "Database non accessibile", createdAt: new Date().toISOString(), severity: "critical", channels: ["dashboard", "log", "email", "webhook"], status: "requires_provider", source: "health_check" }));
  }
  if (health.api === false) {
    events.push(makeEvent({ type: "api_error", title: "API non accessibile", createdAt: new Date().toISOString(), severity: "critical", channels: ["dashboard", "log", "email", "webhook"], status: "requires_provider", source: "health_check" }));
  }
  if (health.storage === false || availability.photos === false) {
    events.push(makeEvent({ type: "storage_error", title: "Storage/foto non configurato o non accessibile", createdAt: new Date().toISOString(), severity: "warning", channels: ["dashboard", "log", "email"], status: "requires_provider", source: "health_check" }));
  }
  return events;
}

function makeEvent({ type, entityId = "", entityType = "system", title, createdAt, severity = "info", channels = ["dashboard", "log"], status = "detected", source = "runtime" }) {
  const id = `${type}:${entityType}:${entityId || title || source}:${createdAt || ""}`;
  return {
    id,
    type,
    entityId,
    entityType,
    title: title || eventLabel(type),
    createdAt: createdAt || "",
    severity,
    channels,
    status,
    source,
  };
}

function buildWorkflowCatalog(availability) {
  return [
    workflow("Admin critical alert", ["api_error", "database_error", "storage_error", "gps_lost", "operator_offline"], ["dashboard", "log", "email", "whatsapp", "webhook"], availability),
    workflow("Cliente campagna", ["new_quote", "quote_accepted", "campaign_started", "photo_uploaded", "campaign_completed"], ["dashboard", "log", "email", "whatsapp", "report"], availability),
    workflow("Operatore", ["new_operator", "operator_online", "operator_offline", "gps_lost", "gps_restored"], ["dashboard", "log", "whatsapp"], availability),
    workflow("Pagamenti", ["payment_received", "payment_overdue"], ["dashboard", "log", "email", "whatsapp"], availability),
    workflow("Audit e webhook", AUTOMATION_EVENTS, ["dashboard", "log", "webhook"], availability),
  ];
}

function workflow(name, events, channels, availability) {
  const configuredChannels = channels.filter((channel) => isChannelConfigured(channel, availability));
  return {
    name,
    events,
    channels,
    configuredChannels,
    enabled: configuredChannels.includes("dashboard") && configuredChannels.includes("log"),
    blockedChannels: channels.filter((channel) => !configuredChannels.includes(channel)),
  };
}

function buildQueue(events, workflows, availability) {
  return events.flatMap((event) => {
    const workflowMatches = workflows.filter((item) => item.events.includes(event.type));
    return event.channels.map((channel) => ({
      id: `${event.id}:${channel}`,
      eventId: event.id,
      eventType: event.type,
      title: event.title,
      channel,
      status: isChannelConfigured(channel, availability) ? "ready" : "not_configured",
      reason: isChannelConfigured(channel, availability) ? "Canale disponibile" : `${channelLabel(channel)} non configurato`,
      workflows: workflowMatches.map((item) => item.name),
      createdAt: event.createdAt,
      severity: event.severity,
    }));
  });
}

function buildScheduler(availability) {
  return [
    { name: "Ogni minuto", purpose: "GPS, code e health check critici", status: availability.scheduler ? "configured" : "not_configured" },
    { name: "Ogni ora", purpose: "Pagamenti, notifiche e retry", status: availability.scheduler ? "configured" : "not_configured" },
    { name: "Ogni giorno", purpose: "Promemoria, report e backup", status: availability.scheduler ? "configured" : "not_configured" },
    { name: "Ogni settimana", purpose: "Analisi clienti, fornitori e performance", status: availability.scheduler ? "configured" : "not_configured" },
    { name: "Ogni mese", purpose: "Report finanziari e audit", status: availability.scheduler ? "configured" : "not_configured" },
    { name: "Ogni anno", purpose: "Storico, compliance e archiviazione", status: availability.scheduler ? "configured" : "not_configured" },
  ];
}

function buildReminders(events, campaigns, payments) {
  const paymentReminders = payments.filter((row) => String(row.status || row.stato || "").toLowerCase().includes("scad")).map((row) => ({
    title: row.client_name || row.email || "Pagamento scaduto",
    type: "payment_overdue",
    dueAt: row.due_date || row.scadenza || row.created_at,
  }));
  const campaignReminders = campaigns.filter((campaign) => campaign.endDate).map((campaign) => ({
    title: `Scadenza campagna - ${campaign.zone || campaign.client}`,
    type: "campaign_deadline",
    dueAt: campaign.endDate,
  }));
  return [...paymentReminders, ...campaignReminders, ...events.filter((event) => event.severity === "critical").slice(0, 10).map((event) => ({ title: event.title, type: event.type, dueAt: event.createdAt }))];
}

function buildHealthChecks(availability, health) {
  return [
    healthItem("Frontend", true, "App caricata nel browser"),
    healthItem("Backend/API", health.api !== false, health.api === false ? "API non raggiungibile" : "Nessun errore API rilevato dal client"),
    healthItem("Database", availability.campaigns !== false && health.database !== false, availability.campaigns ? "Tabelle campagne leggibili" : "Database o RLS non accessibile"),
    healthItem("Storage", availability.photos !== false && health.storage !== false, availability.photos ? "Metadati proof_photos leggibili" : "Storage/foto non configurato"),
    healthItem("Realtime", availability.realtime === true, availability.realtime ? "Realtime configurato" : "Realtime non verificabile dal client"),
    healthItem("Edge Functions", availability.edgeFunctions === true, availability.edgeFunctions ? "Edge functions configurate" : "Edge functions non verificabili dal client"),
    healthItem("Servizi esterni", availability.externalServices === true, availability.externalServices ? "Provider esterni configurati" : "Email/SMS/WhatsApp/Webhook non configurati"),
  ];
}

function healthItem(name, ok, detail) {
  return { name, ok: Boolean(ok), status: ok ? "online" : "not_configured", detail };
}

function buildBackupStatus(availability) {
  return [
    { name: "Backup Database", status: availability.backups ? "configured" : "not_configured", detail: availability.backups ? "Job backup rilevato" : "Nessuna tabella/job backup rilevato" },
    { name: "Backup Storage", status: availability.backups ? "configured" : "not_configured", detail: "Verifica storage disponibile solo con provider configurato" },
    { name: "Backup Configurazioni", status: availability.backups ? "configured" : "not_configured", detail: "Storico backup non rilevato nel database corrente" },
    { name: "Verifica integrita", status: availability.backups ? "configured" : "not_configured", detail: "Integrity check non configurato" },
  ];
}

function buildTechnicalMonitor(health, events) {
  const critical = events.filter((event) => event.severity === "critical").length;
  return [
    { name: "CPU", value: EMPTY, detail: "Non disponibile dal frontend senza agente server" },
    { name: "RAM", value: EMPTY, detail: "Non disponibile dal frontend senza agente server" },
    { name: "Storage", value: health.storage === false ? "Errore" : EMPTY, detail: "Metriche storage non esposte dalle API correnti" },
    { name: "Traffico", value: EMPTY, detail: "Metriche traffico non configurate" },
    { name: "Errori", value: critical, detail: "Eventi critici rilevati dal motore" },
    { name: "Latenza API", value: Number.isFinite(health.apiLatencyMs) ? `${Math.round(health.apiLatencyMs)} ms` : EMPTY, detail: "Misurata dal caricamento dashboard se disponibile" },
    { name: "Disponibilita servizi", value: health.database === false ? "Degradata" : "Parziale", detail: "Calcolata da tabelle realmente accessibili" },
  ];
}

function buildAudit(auditLog, activityLog) {
  const rows = [...auditLog, ...activityLog].slice(0, 60);
  return rows.map((row) => ({
    id: row.id || `${row.action || row.event_type}:${row.created_at}`,
    user: row.user_email || row.actor_email || row.email || row.admin_email || row.user_id || EMPTY,
    event: row.action || row.event_type || row.type || row.message || "Evento",
    ip: row.ip || row.ip_address || EMPTY,
    device: row.device || row.user_agent || row.browser || EMPTY,
    outcome: row.outcome || row.esito || row.status || (typeof row.success === "boolean" ? (row.success ? "OK" : "Errore") : EMPTY),
    createdAt: row.created_at || row.timestamp || row.date,
  }));
}

function buildNotificationStats(rows) {
  const stats = { total: rows.length, sent: 0, failed: 0, email: 0, sms: 0, whatsapp: 0 };
  for (const row of rows) {
    const status = String(row.status || row.stato || "").toLowerCase();
    const channel = String(row.channel || row.canale || "").toLowerCase();
    if (status.includes("sent") || status.includes("invi")) stats.sent += 1;
    if (status.includes("fail") || status.includes("erro")) stats.failed += 1;
    if (channel.includes("email")) stats.email += 1;
    if (channel.includes("sms")) stats.sms += 1;
    if (channel.includes("whatsapp")) stats.whatsapp += 1;
  }
  return stats;
}

function buildWebhookStats(rows) {
  return {
    total: rows.length,
    success: rows.filter((row) => String(row.status || "").toLowerCase().includes("success")).length,
    failed: rows.filter((row) => String(row.status || "").toLowerCase().includes("fail")).length,
  };
}

function buildStats(events, queue, notifications, webhooks) {
  return {
    activeAutomations: queue.filter((item) => item.status === "ready").length,
    failedAutomations: queue.filter((item) => item.status === "failed").length,
    notConfigured: queue.filter((item) => item.status === "not_configured").length,
    notificationsSent: notifications.sent,
    notificationFailures: notifications.failed,
    webhooks: webhooks.total,
    email: notifications.email,
    sms: notifications.sms,
    whatsapp: notifications.whatsapp,
    queue: queue.length,
    criticalErrors: events.filter((event) => event.severity === "critical").length,
  };
}

function buildSchemaSummary({ availability, campaigns, waitlist, sessions, gpsPoints, photos, payments, activityLog, auditLog, ticketRows, webhookRows, notificationRows, backupRows }) {
  return [
    schema("campaigns/campagne/quote_requests", availability.campaigns, campaigns),
    schema("smart_pairing_waitlist", availability.waitlist, waitlist),
    schema("delivery_sessions", availability.sessions, sessions),
    schema("gps_tracking_points", availability.gps, gpsPoints),
    schema("proof_photos", availability.photos, photos),
    schema("payments/pagamenti", availability.payments, payments),
    schema("activity_log", availability.activityLog, activityLog),
    schema("audit_log", availability.auditLog, auditLog),
    schema("tickets", availability.tickets, ticketRows),
    schema("webhook_logs", availability.webhooks, webhookRows),
    schema("notification_logs", availability.notifications, notificationRows),
    schema("backup_jobs", availability.backups, backupRows),
  ];
}

function schema(name, available, rows) {
  return { name, available: Boolean(available), rows: rows.length, columns: rows[0] ? Object.keys(rows[0]).slice(0, 14) : [] };
}

function isChannelConfigured(channel, availability) {
  if (channel === "dashboard" || channel === "log" || channel === "report") return true;
  if (channel === "email") return Boolean(availability.emailProvider || availability.notifications);
  if (channel === "sms") return Boolean(availability.smsProvider || availability.notifications);
  if (channel === "whatsapp") return Boolean(availability.whatsappProvider || availability.notifications);
  if (channel === "webhook") return Boolean(availability.webhooks);
  return false;
}

function classifyPing(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "offline";
  const age = Date.now() - date.getTime();
  if (age <= 5 * 60 * 1000) return "online";
  if (age <= 30 * 60 * 1000) return "inactive";
  return "offline";
}

function latestByDate(rows, field) {
  return rows.filter((row) => row[field]).sort((a, b) => new Date(b[field]) - new Date(a[field]))[0] || null;
}

function readNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = typeof value === "number" ? value : Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function euro(value) {
  return Number.isFinite(value) ? `€${Number(value).toLocaleString("it-IT", { maximumFractionDigits: 2 })}` : "";
}
