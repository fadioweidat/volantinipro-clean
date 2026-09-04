export const MAINTENANCE_TIME_ZONE = "Europe/Rome";
export const DAILY_HOUR = 7;
export const MONTHLY_HOUR = 8;
export const WARNING_ESCALATION_THRESHOLD = 3;

export const AUTOMATIC_MAINTENANCE_ALLOWLIST = Object.freeze([
  "retry_health_check",
  "observe_error_log_auto_resolve",
  "run_existing_cleanup_job",
]);

const SENSITIVE_KEY = /password|token|secret|authorization|service.?role|api.?key|email|phone|telefono|customer|client|user.?id|(^|_)ip$/i;
const SENSITIVE_VALUE = /\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b(?:sk|sb_[a-z]+)-[A-Za-z0-9_-]{12,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\s().-]*){9,}|\b(?:\d{1,3}\.){3}\d{1,3}\b/i;

function parts(date: Date) {
  const values: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", {
    timeZone: MAINTENANCE_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date)) values[part.type] = part.value;
  return { dateKey: `${values.year}-${values.month}-${values.day}`, monthKey: `${values.year}-${values.month}`, weekday: values.weekday, hour: Number(values.hour) };
}

export function maintenanceWindow(now = new Date()) {
  const local = parts(now);
  return {
    ...local,
    dailyMarker: `maintenance_daily_${local.dateKey}`,
    monthlyMarker: `maintenance_monthly_${local.monthKey}`,
    dailyEligible: local.hour >= DAILY_HOUR,
    monthlyEligible: local.weekday === "Mon" && Number(local.dateKey.slice(-2)) <= 7 && local.hour >= MONTHLY_HOUR,
  };
}

export function decideMaintenanceRuns({ now = new Date(), existingMarkers = [] as string[] } = {}) {
  const window = maintenanceWindow(now);
  const markers = new Set(existingMarkers);
  return {
    window,
    runDaily: window.dailyEligible && !markers.has(window.dailyMarker),
    runMonthly: window.monthlyEligible && !markers.has(window.monthlyMarker),
  };
}

export function isAutomaticMaintenanceAction(action: string) {
  return AUTOMATIC_MAINTENANCE_ALLOWLIST.includes(action);
}

export function evaluatePostFixVerification(remainingProblems: number) {
  const verified = Number(remainingProblems) === 0;
  return Object.freeze({ verified, stop: !verified, classification: verified ? "green" : "yellow", retryAggressively: false });
}

export function sanitizeMaintenanceData(value: unknown): unknown {
  if (typeof value === "string") return SENSITIVE_VALUE.test(value) ? "[redacted]" : value.slice(0, 500);
  if (Array.isArray(value)) return value.map(sanitizeMaintenanceData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, item]) => [key, sanitizeMaintenanceData(item)]));
}

export function buildMaintenanceDiagnosisPayload(input: { checkName: string; group: string; status: string; message?: string | null; checkedAt: string; responseTimeMs?: number | null; occurrenceCount: number }) {
  return sanitizeMaintenanceData({
    contextType: "control_center_diagnosis",
    snapshot: {
      issueType: `health:${input.checkName}`,
      module: `health.${input.group}`,
      message: input.message || `Controllo ${input.checkName} persistente in stato ${input.status}`,
      timestamp: input.checkedAt,
      riskLevel: "yellow",
      technicalContext: { status: input.status, responseTimeMs: input.responseTimeMs ?? null, occurrenceCount: input.occurrenceCount },
      health: { state: input.status === "fail" ? "error" : "warning" },
    },
  });
}

export function shouldEscalateWarning(recentStatuses: string[], threshold = WARNING_ESCALATION_THRESHOLD) {
  return recentStatuses.slice(0, threshold).length === threshold && recentStatuses.slice(0, threshold).every((status) => status === "warning" || status === "fail");
}

export function buildMonthlyMaintenanceReport({ monthKey, checks = [], autoFixes = [], diagnoses = [], generatedAt = new Date().toISOString() }: any) {
  const counts = { ok: 0, warning: 0, critical: 0 };
  for (const check of checks) {
    if (check.status === "ok") counts.ok += 1;
    else if (check.severity === "critical" || check.status === "fail") counts.critical += 1;
    else counts.warning += 1;
  }
  return sanitizeMaintenanceData({
    title: `MANUTENZIONE VOLANTINIPRO — ${monthKey}`,
    generatedAt,
    counts: { ...counts, autoFixes: autoFixes.length, aiDiagnoses: diagnoses.length, automaticRedActions: 0 },
    problems: checks.filter((check: any) => check.status !== "ok").map((check: any) => ({ module: check.checkName, severity: check.severity || check.status, cause: check.errorMessage || null, action: "review", result: "recorded", postFixVerification: null, approvalRequired: check.severity === "critical" || check.status === "fail" })),
    autoFixes,
    diagnoses,
  });
}
