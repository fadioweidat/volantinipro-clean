import { classifyDeliverySession, GPS_SESSION_STATE } from "./gpsSessionLifecycle.js";

export const CONTROL_RISK = Object.freeze({ GREEN: "green", YELLOW: "yellow", RED: "red" });
export const CONTROL_STATE = Object.freeze({ OK: "ok", WARNING: "warning", ERROR: "error" });
export const AUTO_REPAIR_ALLOWLIST = Object.freeze([
  "retry_health_check",
  "resolve_old_error",
  "recover_abandoned_gps",
]);

const AUTO_REPAIR_SET = new Set(AUTO_REPAIR_ALLOWLIST);
const RED_MODULE = /auth|login|security|rls|payment|billing|database|migration|secret|deploy/i;
const OLD_ERROR_MS = 72 * 60 * 60 * 1000;
const MAX_AUDIT_ROWS = 200;
export const CONTROL_CENTER_AUDIT_KEY = "vp_control_center_audit_v1";

const safeText = (value, max = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const timestamp = (value) => Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;

export function redactControlCenterText(value) {
  return safeText(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "[token rimosso]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token rimosso]")
    .replace(/\b(?:sk|sb_[a-z]+)-[A-Za-z0-9_-]{12,}\b/gi, "[secret rimosso]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email rimossa]")
    .replace(/(?:\+?\d[\s().-]*){9,}/g, "[telefono rimosso]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip rimosso]");
}

function probableCause({ module = "", message = "", status = "" } = {}) {
  const text = `${module} ${message}`.toLowerCase();
  if (/timeout|timed out|lenta|slow/.test(text)) return "La dipendenza ha superato la soglia di risposta o ha avuto un rallentamento temporaneo.";
  if (/gps|session/.test(text)) return "Una sessione operativa è rimasta aperta senza attività GPS verificabile entro la soglia prevista.";
  if (/edge|function/.test(text)) return "La funzione risponde in modo degradato o presenta errori ripetuti nelle richieste recenti.";
  if (/auth|login/.test(text)) return "Il controllo di autenticazione o il contratto di accesso non ha prodotto l'esito atteso.";
  if (/analytics|site_event/.test(text)) return "La telemetria recente è assente, incompleta o non raggiungibile.";
  if (status === "warning") return "Il segnale disponibile non è sufficiente per confermare un errore, ma richiede attenzione.";
  return "Il controllo reale del modulo ha restituito un errore o un segnale incoerente.";
}

function issue(input) {
  return Object.freeze({
    id: safeText(input.id, 180),
    state: input.state || CONTROL_STATE.WARNING,
    risk: input.risk || CONTROL_RISK.YELLOW,
    problem: safeText(input.problem),
    probableCause: safeText(input.probableCause),
    module: safeText(input.module, 120),
    message: safeText(input.message),
    checkedAt: timestamp(input.checkedAt) || new Date().toISOString(),
    actionId: input.actionId || "analyze_problem",
    actionLabel: input.actionLabel || "Analizza problema",
    technicalContext: Object.freeze(input.technicalContext || {}),
    targets: Object.freeze(input.targets || []),
  });
}

function groupErrors(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    if (row?.status && row.status !== "open") continue;
    const fingerprint = safeText(row?.fingerprint, 180);
    const key = fingerprint || [row?.category, row?.module, safeText(row?.message).toLowerCase()].join("|");
    const current = grouped.get(key);
    const occurrences = Math.max(1, Number(row?.occurrence_count) || 1);
    if (!current) grouped.set(key, { ...row, occurrence_count: occurrences, groupedIds: row?.id ? [row.id] : [] });
    else {
      current.occurrence_count += occurrences;
      if (row?.id) current.groupedIds.push(row.id);
      if (new Date(row?.last_seen_at || row?.created_at) > new Date(current.last_seen_at || current.created_at)) {
        current.last_seen_at = row.last_seen_at || row.created_at;
      }
    }
  }
  return [...grouped.values()];
}

function errorIssue(row, now) {
  const module = safeText(row.module || row.category || "error_log", 120);
  const message = safeText(row.message);
  const seenAt = timestamp(row.last_seen_at || row.created_at) || now.toISOString();
  const ageMs = now.getTime() - new Date(seenAt).getTime();
  const occurrences = Math.max(1, Number(row.occurrence_count) || 1);
  const red = RED_MODULE.test(`${row.category || ""} ${module}`) || row.severity === "critical";
  const oldAndSafe = !red && ageMs >= OLD_ERROR_MS;
  const temporary = !red && /timeout|temporar|network|fetch/i.test(message) && occurrences <= 2;
  const risk = red ? CONTROL_RISK.RED : oldAndSafe || temporary ? CONTROL_RISK.GREEN : CONTROL_RISK.YELLOW;
  const actionId = red ? "approval_required" : oldAndSafe ? "resolve_old_error" : temporary ? "retry_health_check" : "analyze_problem";
  return issue({
    id: `error:${row.fingerprint || row.id || module}`,
    state: row.severity === "warning" || row.severity === "info" ? CONTROL_STATE.WARNING : CONTROL_STATE.ERROR,
    risk,
    problem: `${occurrences} occorrenza${occurrences === 1 ? "" : "e"}: ${message || module}`,
    probableCause: probableCause({ module, message }),
    module,
    message,
    checkedAt: seenAt,
    actionId,
    actionLabel: risk === CONTROL_RISK.RED ? "Richiede approvazione" : risk === CONTROL_RISK.GREEN ? (oldAndSafe ? "Risolvi automaticamente" : "Riprova controllo") : "Analizza problema",
    technicalContext: { category: row.category || null, severity: row.severity || null, occurrenceCount: occurrences, ageHours: Math.max(0, Math.round(ageMs / 3600000)) },
    targets: (row.groupedIds?.length ? row.groupedIds : [row.id]).filter(Boolean).map((id) => ({ id })),
  });
}

function gpsIssues(deliverySessions, gpsPoints, now) {
  const lastGps = {};
  for (const point of gpsPoints || []) {
    if (!point?.session_id || !point?.recorded_at) continue;
    if (!lastGps[point.session_id] || new Date(point.recorded_at) > new Date(lastGps[point.session_id])) lastGps[point.session_id] = point.recorded_at;
  }
  const classified = (deliverySessions || []).filter((session) => ["started", "paused"].includes(session?.status)).map((session) => ({
    session,
    classification: classifyDeliverySession(session, { now, lastGpsRecordedAt: lastGps[session.id] || null }),
    lastGpsRecordedAt: lastGps[session.id] || null,
  }));
  const abandoned = classified.filter((row) => row.classification.state === GPS_SESSION_STATE.ABANDONED);
  const stale = classified.filter((row) => row.classification.state === GPS_SESSION_STATE.STALE);
  const rows = [];
  if (abandoned.length) rows.push(issue({
    id: "gps:abandoned_sessions",
    state: CONTROL_STATE.WARNING,
    risk: CONTROL_RISK.GREEN,
    problem: `${abandoned.length} session${abandoned.length === 1 ? "e GPS abbandonata" : "i GPS abbandonate"}`,
    probableCause: "Sessioni started non chiuse e senza attività reale da oltre quattro ore.",
    module: "gps.delivery_sessions",
    message: "Sessioni GPS realmente abbandonate secondo la gerarchia ultimo punto GPS → data di avvio.",
    checkedAt: now,
    actionId: "recover_abandoned_gps",
    actionLabel: "Risolvi automaticamente",
    technicalContext: { abandonedCount: abandoned.length, thresholdHours: 4 },
    targets: abandoned.map(({ session, lastGpsRecordedAt }) => ({ id: session.id, status: session.status, startedAt: session.started_at || null, lastGpsRecordedAt })),
  }));
  if (stale.length) rows.push(issue({
    id: "gps:stale_sessions",
    state: CONTROL_STATE.WARNING,
    risk: CONTROL_RISK.YELLOW,
    problem: `${stale.length} session${stale.length === 1 ? "e GPS stale" : "i GPS stale"}`,
    probableCause: "Assenza temporanea di attività GPS compresa tra dieci minuti e quattro ore; può trattarsi di perdita di rete o pausa operativa.",
    module: "gps.delivery_sessions",
    message: "Sessioni stale non eleggibili alla chiusura automatica.",
    checkedAt: now,
    actionId: "analyze_problem",
    actionLabel: "Analizza problema",
    technicalContext: { staleCount: stale.length, autoRepairAllowed: false },
  }));
  return rows;
}

export function buildControlCenterModel({ health, flows = [], errorLogRows = [], deliverySessions = [], gpsPoints = [], auditLog = [], now = new Date() } = {}) {
  const issues = [];
  for (const row of health?.rows || []) {
    if (row.status === "ok") continue;
    const red = RED_MODULE.test(row.key || "");
    const slow = Number.isFinite(row.responseTimeMs) && row.responseTimeMs > 1500;
    const risk = red ? CONTROL_RISK.RED : slow ? CONTROL_RISK.YELLOW : CONTROL_RISK.GREEN;
    issues.push(issue({
      id: `health:${row.key}`,
      state: row.status === "error" ? CONTROL_STATE.ERROR : CONTROL_STATE.WARNING,
      risk,
      problem: row.error || `${row.label} non è in stato OK`,
      probableCause: probableCause({ module: row.key, message: row.error, status: row.status }),
      module: `health.${row.key}`,
      message: row.error || row.statusLabel,
      checkedAt: health.checkedAt || now,
      actionId: red ? "approval_required" : slow ? "analyze_problem" : "retry_health_check",
      actionLabel: red ? "Richiede approvazione" : slow ? "Analizza problema" : "Riprova controllo",
      technicalContext: { status: row.status, responseTimeMs: row.responseTimeMs ?? null },
    }));
  }
  for (const flow of flows) {
    if (flow.status === "pass" || flow.key === "gps_stale_sessions") continue;
    const red = RED_MODULE.test(flow.key || "");
    issues.push(issue({
      id: `flow:${flow.key}`,
      state: flow.status === "fail" ? CONTROL_STATE.ERROR : CONTROL_STATE.WARNING,
      risk: red ? CONTROL_RISK.RED : CONTROL_RISK.YELLOW,
      problem: flow.reason,
      probableCause: probableCause({ module: flow.key, message: flow.reason, status: flow.status }),
      module: `flow.${flow.key}`,
      message: flow.reason,
      checkedAt: flow.lastChecked || now,
      actionId: red ? "approval_required" : "analyze_problem",
      actionLabel: red ? "Richiede approvazione" : "Analizza problema",
      technicalContext: { status: flow.status },
    }));
  }
  issues.push(...gpsIssues(deliverySessions, gpsPoints, now));
  issues.push(...groupErrors(errorLogRows).map((row) => errorIssue(row, now)));

  const unique = [...new Map(issues.map((row) => [row.id, row])).values()];
  const okCount = (health?.rows || []).filter((row) => row.status === "ok").length + flows.filter((row) => row.status === "pass").length;
  const today = now.toISOString().slice(0, 10);
  const todayAudit = auditLog.filter((row) => String(row.at || "").startsWith(today));
  return Object.freeze({
    issues: Object.freeze(unique),
    summary: Object.freeze({
      ok: okCount,
      warnings: unique.filter((row) => row.state === CONTROL_STATE.WARNING).length,
      errors: unique.filter((row) => row.state === CONTROL_STATE.ERROR).length,
      autoFixed: todayAudit.filter((row) => row.mode === "auto" && row.result === "success").length,
      suggested: todayAudit.filter((row) => ["ai", "approval"].includes(row.mode)).length,
    }),
  });
}

export function isAutoRepairAllowed(actionId) {
  return AUTO_REPAIR_SET.has(actionId);
}

export async function executeControlCenterRepair(problem, dependencies = {}) {
  if (!problem || !isAutoRepairAllowed(problem.actionId)) throw new Error("ACTION_NOT_ALLOWLISTED");
  if (problem.risk !== CONTROL_RISK.GREEN) throw new Error("RISK_REQUIRES_APPROVAL");
  if (problem.actionId === "retry_health_check") {
    const result = await dependencies.retryHealth?.();
    return { result: "success", verification: result?.healthResult ? "Controllo rieseguito e stato aggiornato." : "Controllo rieseguito." };
  }
  if (problem.actionId === "resolve_old_error") {
    if (Number(problem.technicalContext?.ageHours) < 72) throw new Error("ERROR_NOT_OLD_ENOUGH");
    const results = [];
    for (const target of problem.targets) results.push(await dependencies.resolveOldError?.(target.id));
    if (!results.length || results.some((row) => row?.status !== "resolved")) throw new Error("POST_FIX_VERIFICATION_FAILED");
    return { result: "success", verification: `${results.length} errori storici verificati come risolti.` };
  }
  if (problem.actionId === "recover_abandoned_gps") {
    const results = [];
    for (const target of problem.targets) results.push(await dependencies.recoverAbandonedGps?.(target));
    if (!results.length || results.some((row) => row?.status !== "cancelled")) throw new Error("POST_FIX_VERIFICATION_FAILED");
    return { result: "success", verification: `${results.length} sessioni verificate come chiuse in stato cancelled.` };
  }
  throw new Error("ACTION_NOT_IMPLEMENTED");
}

export function buildControlCenterAiSnapshot(problem) {
  if (!problem) return null;
  return Object.freeze({
    issueType: redactControlCenterText(problem.id).slice(0, 180),
    module: redactControlCenterText(problem.module).slice(0, 120),
    message: redactControlCenterText(problem.message),
    timestamp: timestamp(problem.checkedAt),
    riskLevel: problem.risk,
    technicalContext: Object.freeze({
      status: safeText(problem.technicalContext?.status, 40) || null,
      responseTimeMs: Number.isFinite(problem.technicalContext?.responseTimeMs) ? problem.technicalContext.responseTimeMs : null,
      occurrenceCount: Number.isFinite(problem.technicalContext?.occurrenceCount) ? problem.technicalContext.occurrenceCount : null,
    }),
    health: Object.freeze({ state: problem.state }),
  });
}

export function createControlCenterAuditEntry({ problem, action, mode, actor = "Admin autenticato", result, verification, authorizedBy = null, at = new Date() }) {
  return Object.freeze({
    id: `${at.getTime()}-${safeText(problem?.id || action, 80)}`,
    problem: safeText(problem?.problem || problem?.message || "Problema non specificato"),
    module: safeText(problem?.module || "control_center", 120),
    at: at.toISOString(),
    action: safeText(action, 120),
    mode: ["auto", "ai", "approval"].includes(mode) ? mode : "manual",
    actor: safeText(actor, 120),
    authorizedBy: authorizedBy ? safeText(authorizedBy, 120) : null,
    result: result === "success" ? "success" : result === "failed" ? "failed" : "recorded",
    verification: safeText(verification || "Nessuna verifica disponibile"),
  });
}

export function loadControlCenterAudit(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(CONTROL_CENTER_AUDIT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_AUDIT_ROWS) : [];
  } catch { return []; }
}

export function saveControlCenterAudit(rows, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, MAX_AUDIT_ROWS);
  try { storage?.setItem(CONTROL_CENTER_AUDIT_KEY, JSON.stringify(safeRows)); } catch { /* audit locale fail-soft */ }
  return safeRows;
}

export const CONTROL_CENTER_MAINTENANCE_PLAN = Object.freeze({
  dailyChecks: "ready",
  monthlyMaintenance: "approval_required",
  monthlyReport: "ready",
});
