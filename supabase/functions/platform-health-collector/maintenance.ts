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

// Le 12 sezioni richieste dal ticket "MANUTENZIONE MENSILE + REPORT
// AUTOMATICO" — un solo check puo' appartenere a una sola sezione modulo
// (mappatura per checkName, con fallback per checkGroup). "statoGenerale",
// "azioniEseguite", "problemiAperti" e "raccomandazioni" sono trasversali
// (derivate dall'insieme dei check, non da una singola sezione modulo).
export const MONTHLY_REPORT_MODULE_SECTIONS = Object.freeze([
  "frontend", "preventivatore", "gps", "marketplace", "analytics", "databaseSupabase", "sicurezza", "performance",
]);
export const MONTHLY_REPORT_SECTIONS = Object.freeze([
  "statoGenerale", ...MONTHLY_REPORT_MODULE_SECTIONS, "azioniEseguite", "problemiAperti", "raccomandazioni",
]);

const CHECK_NAME_SECTION: Record<string, string> = {
  frontend_reachable: "frontend",
  edge_functions: "frontend",
  preventivatore_smoke: "preventivatore",
  gps_backend: "gps",
  gps_stale_sessions: "gps",
  analytics: "analytics",
  supabase: "databaseSupabase",
  auth_infrastructure: "databaseSupabase",
  database: "databaseSupabase",
  auth_admin_role_probe: "sicurezza",
  marketplace_base: "marketplace",
  quote_api: "marketplace",
};
const CHECK_GROUP_SECTION: Record<string, string> = {
  frontend: "frontend",
  edge_function: "frontend",
  gps: "gps",
  analytics: "analytics",
  supabase: "databaseSupabase",
  auth: "databaseSupabase",
  database: "databaseSupabase",
  provider: "marketplace",
};

export function resolveMonthlyReportSection(checkName: string, checkGroup?: string): string {
  return CHECK_NAME_SECTION[checkName] || CHECK_GROUP_SECTION[checkGroup || ""] || "databaseSupabase";
}

// Soglia di lentezza per la sezione Performance — stessa soglia gia' usata
// lato Admin UI (SLOW_THRESHOLD_MS in PlatformStatus.jsx) per coerenza.
export const MONTHLY_PERFORMANCE_SLOW_MS = 1500;

export function buildMonthlyMaintenanceReport({
  monthKey,
  checks = [],
  autoFixes = [],
  diagnoses = [],
  generatedAt = new Date().toISOString(),
  previousReport = null,
}: any) {
  const counts = { ok: 0, warning: 0, critical: 0 };
  for (const check of checks) {
    if (check.status === "ok") counts.ok += 1;
    else if (check.severity === "critical" || check.status === "fail") counts.critical += 1;
    else counts.warning += 1;
  }

  const previousByCheck = new Map<string, number>(
    (previousReport?.performance?.checks || []).map((row: any) => [row.checkName, row.responseTimeMs]).filter(([, ms]: any) => Number.isFinite(ms)),
  );

  const problems = checks
    .filter((check: any) => check.status !== "ok")
    .map((check: any) => {
      const severity = check.severity === "critical" || check.status === "fail" ? "critical" : "warning";
      const persistedForChecks = Number(check.persistedForChecks) || 0;
      const autoFix = autoFixes.find((fix: any) => fix.checkName === check.checkName || fix.action === "observe_error_log_auto_resolve");
      const actionExecuted = Boolean(autoFix && autoFix.result === "verified");
      return {
        module: check.checkName,
        section: resolveMonthlyReportSection(check.checkName, check.checkGroup),
        severity,
        detectedAt: check.checkedAt || generatedAt,
        cause: check.errorMessage || null,
        proposedAction: severity === "critical" ? "Richiede approvazione Admin: nessuna azione rossa automatica." : "Diagnosi AI + revisione manuale se persistente.",
        actionExecuted,
        postFixVerification: autoFix ? (autoFix.postFixVerification ?? (autoFix.result === "verified" ? "Verificato" : "Non verificato")) : null,
        finalState: severity === "critical" ? "in_attesa_approvazione" : actionExecuted ? "risolto" : "da_monitorare",
        persistedForChecks,
        persistent: persistedForChecks >= WARNING_ESCALATION_THRESHOLD,
        // Compat: campo storico consumato da report/consumer esistenti.
        action: "review",
        result: actionExecuted ? "verified" : "recorded",
        approvalRequired: severity === "critical",
      };
    });

  const sections: Record<string, any> = {};
  for (const key of MONTHLY_REPORT_MODULE_SECTIONS) {
    const sectionChecks = checks.filter((check: any) => resolveMonthlyReportSection(check.checkName, check.checkGroup) === key);
    sections[key] = {
      checks: sectionChecks.map((check: any) => ({ checkName: check.checkName, status: check.status, responseTimeMs: check.responseTimeMs ?? null })),
      problems: problems.filter((problem: any) => problem.section === key),
    };
  }

  const slowChecks = checks
    .filter((check: any) => Number(check.responseTimeMs) >= MONTHLY_PERFORMANCE_SLOW_MS)
    .map((check: any) => ({ checkName: check.checkName, responseTimeMs: check.responseTimeMs }));
  const degradedChecks = checks
    .filter((check: any) => previousByCheck.has(check.checkName) && Number.isFinite(check.responseTimeMs))
    .map((check: any) => ({ checkName: check.checkName, responseTimeMs: check.responseTimeMs, previousResponseTimeMs: previousByCheck.get(check.checkName), deltaMs: check.responseTimeMs - (previousByCheck.get(check.checkName) as number) }))
    .filter((row: any) => row.deltaMs > 500 && row.previousResponseTimeMs > 0 && row.deltaMs / row.previousResponseTimeMs > 0.5);
  sections.performance = {
    checks: checks.map((check: any) => ({ checkName: check.checkName, responseTimeMs: check.responseTimeMs ?? null })),
    slowChecks,
    degradedChecks,
    comparedToPreviousMonth: Boolean(previousReport),
  };

  const persistentProblems = problems.filter((problem: any) => problem.persistent);
  const recommendations: string[] = [];
  for (const problem of persistentProblems) {
    recommendations.push(`Il controllo "${problem.module}" e' in stato ${problem.severity} da ${problem.persistedForChecks} controlli consecutivi: valutare un intervento manuale.`);
  }
  if (counts.critical > 0) recommendations.push(`Sono presenti ${counts.critical} problemi critici che richiedono approvazione Admin prima di qualunque azione.`);
  if (degradedChecks.length > 0) recommendations.push(`${degradedChecks.length} controlli mostrano un degrado dei tempi di risposta rispetto al mese precedente.`);
  if (recommendations.length === 0) recommendations.push("Nessuna raccomandazione: tutti i controlli mensili sono OK.");

  sections.statoGenerale = {
    summaryText: counts.critical > 0
      ? `${counts.critical} problemi critici richiedono approvazione.`
      : counts.warning > 0
        ? `${counts.warning} warning aperti, nessun critical.`
        : "Tutti i controlli mensili sono OK.",
    counts,
  };
  sections.azioniEseguite = { autoFixes, diagnoses, automaticRedActions: 0 };
  sections.problemiAperti = { problems: problems.filter((problem: any) => problem.finalState !== "risolto") };
  sections.raccomandazioni = { items: recommendations };

  return sanitizeMaintenanceData({
    title: `MANUTENZIONE VOLANTINIPRO — ${monthKey}`,
    monthKey,
    generatedAt,
    counts: { ...counts, autoFixes: autoFixes.length, aiDiagnoses: diagnoses.length, automaticRedActions: 0 },
    sections,
    problems,
    autoFixes,
    diagnoses,
  });
}
