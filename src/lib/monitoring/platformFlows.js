// Health dei flussi critici (Blocco 3) — aggregazione pura (nessuna
// chiamata di rete qui) da dati gia' reali: error_log (errori davvero
// registrati), site_events (funnel gia' costruito), campaigns,
// assignment_event_log, operator_assignments, delivery_sessions,
// gps_tracking_points. Nessun test sintetico "clicca e verifica": lo stato
// e' sempre derivato da cio' che e' realmente successo nelle ultime 24h.
//
// Dove non esiste un segnale reale (es. nessun errore auth mai registrato
// per "login cliente"), lo stato e' WARNING con un motivo esplicito — MAI
// PASS finto, come richiesto.

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const GPS_FRESHNESS_MS = 15 * 60 * 1000;

function withinWindow(timestampValue, windowMs, now) {
  if (!timestampValue) return false;
  const ts = new Date(timestampValue).getTime();
  return Number.isFinite(ts) && now.getTime() - ts <= windowMs;
}

function recentRows(rows, windowMs, now, timestampField = "created_at") {
  return (Array.isArray(rows) ? rows : []).filter((row) => withinWindow(row?.[timestampField], windowMs, now));
}

function flow(key, label, status, reason, now) {
  return { key, label, status, reason, lastChecked: now.toISOString() };
}

export function computeFlowHealth({
  errorLogRows = [],
  siteEvents = [],
  campaigns = [],
  assignmentEvents = [],
  operatorAssignments = [],
  deliverySessions = [],
  gpsPoints = [],
  now = new Date(),
} = {}) {
  const recentErrors = recentRows(errorLogRows, WINDOW_24H_MS, now);
  const frontendErrorsFor = (stepParam) => recentErrors.filter((e) => e.category === "frontend" && String(e.module || "").includes(stepParam));

  const flows = [];

  for (const [key, label, stepParam] of [
    ["step1", "Step 1", "step=1"],
    ["step2", "Step 2", "step=2"],
    ["step3", "Step 3", "step=3"],
    ["step4", "Step 4", "step=4"],
  ]) {
    const errs = frontendErrorsFor(stepParam);
    flows.push(errs.length > 0
      ? flow(key, label, "fail", `${errs.length} errore/i frontend registrati nelle ultime 24h`, now)
      : flow(key, label, "pass", "Nessun errore frontend registrato nelle ultime 24h", now));
  }

  const authErrors = recentErrors.filter((e) => e.category === "auth");
  for (const [key, label, moduleHint] of [
    ["login_customer", "Login cliente", "customer"],
    ["login_admin", "Login admin", "admin"],
  ]) {
    const errs = authErrors.filter((e) => String(e.module || "").toLowerCase().includes(moduleHint));
    flows.push(errs.length > 0
      ? flow(key, label, "fail", `${errs.length} errore/i di autenticazione registrati nelle ultime 24h`, now)
      : flow(key, label, "warning", "Nessun controllo automatico dedicato al login: nessun errore registrato, ma il flusso non è verificato attivamente", now));
  }

  const submitErrors = recentErrors.filter((e) => e.category === "submit_campaign");
  const recentCampaigns = recentRows(campaigns, WINDOW_24H_MS, now);
  flows.push(submitErrors.length > 0
    ? flow("submit_campaign", "Submit campagna", "fail", `${submitErrors.length} errore/i registrati nelle ultime 24h`, now)
    : recentCampaigns.length > 0
      ? flow("submit_campaign", "Submit campagna", "pass", `${recentCampaigns.length} campagna/e creata/e nelle ultime 24h, nessun errore`, now)
      : flow("submit_campaign", "Submit campagna", "warning", "Nessun tentativo recente: nessuna campagna creata nelle ultime 24h", now));

  const recentQuotesCompleted = recentRows(siteEvents, WINDOW_24H_MS, now).filter((e) => e.event_name === "quote_completed");
  flows.push(submitErrors.length > 0
    ? flow("quote_creation", "Creazione preventivo", "fail", `${submitErrors.length} errore/i di submit registrati nelle ultime 24h`, now)
    : recentQuotesCompleted.length > 0
      ? flow("quote_creation", "Creazione preventivo", "pass", `${recentQuotesCompleted.length} preventivo/i completato/i nelle ultime 24h`, now)
      : flow("quote_creation", "Creazione preventivo", "warning", "Nessun preventivo completato nelle ultime 24h", now));

  const recentPrograms = recentRows(assignmentEvents, WINDOW_24H_MS, now).filter((e) => e.event_type === "assignment_program_sent");
  flows.push(recentPrograms.length > 0
    ? flow("program_creation", "Creazione programma", "pass", `${recentPrograms.length} programma/i inviato/i nelle ultime 24h`, now)
    : flow("program_creation", "Creazione programma", "warning", "Nessun programma inviato nelle ultime 24h", now));

  const recentAssignments = recentRows(operatorAssignments, WINDOW_24H_MS, now);
  flows.push(recentAssignments.length > 0
    ? flow("driver_assignment", "Assegnazione Driver", "pass", `${recentAssignments.length} assegnazione/i nelle ultime 24h`, now)
    : flow("driver_assignment", "Assegnazione Driver", "warning", "Nessuna assegnazione operatore nelle ultime 24h", now));

  const activeSessions = (Array.isArray(deliverySessions) ? deliverySessions : []).filter((s) => s.status === "started");
  if (activeSessions.length === 0) {
    flows.push(flow("gps_live", "GPS Live", "warning", "Nessuna sessione di consegna attiva al momento", now));
  } else {
    const freshSessionIds = new Set(recentRows(gpsPoints, GPS_FRESHNESS_MS, now, "recorded_at").map((p) => p.session_id));
    const stale = activeSessions.filter((s) => !freshSessionIds.has(s.id));
    flows.push(stale.length > 0
      ? flow("gps_live", "GPS Live", "fail", `${stale.length} sessione/i attiva/e senza dati GPS negli ultimi 15 minuti`, now)
      : flow("gps_live", "GPS Live", "pass", `${activeSessions.length} sessione/i attiva/e, tutte con GPS recente`, now));
  }

  return flows;
}
