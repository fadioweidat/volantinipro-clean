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

import { classifyDeliverySession, GPS_SESSION_STATE } from "./gpsSessionLifecycle.js";

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

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

  // GPS — separazione netta (HARDENING P2):
  //  - "GPS Live" giudica SOLO se le sessioni operative ricevono dati adesso.
  //  - "Sessioni GPS stale/abbandonate" e' un WARNING operativo a se': una
  //    sessione lasciata aperta NON e' un guasto del backend GPS (quello e'
  //    la riga "Driver/GPS backend" in runPlatformHealthCheck) e non deve mai
  //    comparire come FAIL qui. Non si chiude MAI nulla: solo classificazione.
  const startedSessions = (Array.isArray(deliverySessions) ? deliverySessions : []).filter((s) => s.status === "started");
  const lastGpsBySessionId = {};
  for (const p of Array.isArray(gpsPoints) ? gpsPoints : []) {
    const sid = p?.session_id;
    if (!sid) continue;
    const ts = new Date(p.recorded_at).getTime();
    if (!Number.isFinite(ts)) continue;
    if (!(sid in lastGpsBySessionId) || ts > lastGpsBySessionId[sid]) lastGpsBySessionId[sid] = ts;
  }
  const classifiedStarted = startedSessions.map((s) => classifyDeliverySession(s, {
    now,
    lastGpsRecordedAt: (s.id in lastGpsBySessionId) ? new Date(lastGpsBySessionId[s.id]).toISOString() : null,
  }).state);
  const liveCount = classifiedStarted.filter((state) => state === GPS_SESSION_STATE.LIVE).length;
  const staleCount = classifiedStarted.filter((state) => state === GPS_SESSION_STATE.STALE || state === GPS_SESSION_STATE.ABANDONED).length;

  if (startedSessions.length === 0) {
    flows.push(flow("gps_live", "GPS Live", "warning", "Nessuna sessione di consegna attiva al momento", now));
  } else if (liveCount > 0) {
    flows.push(flow("gps_live", "GPS Live", "pass", `${liveCount} sessione/i operativa/e con GPS recente`, now));
  } else {
    flows.push(flow("gps_live", "GPS Live", "warning", `${startedSessions.length} sessione/i avviata/e ma nessun dato GPS recente — nessun guasto del backend GPS (vedi "Driver/GPS backend")`, now));
  }

  flows.push(staleCount > 0
    ? flow("gps_stale_sessions", "Sessioni GPS stale/abbandonate", "warning", `${staleCount} sessione/i avviata/e senza attivita' recente, mai chiuse automaticamente`, now)
    : flow("gps_stale_sessions", "Sessioni GPS stale/abbandonate", "pass", "Nessuna sessione avviata risulta abbandonata", now));

  return flows;
}
