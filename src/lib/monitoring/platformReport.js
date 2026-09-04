// Report tecnico esportabile (Blocco 7) — compone solo dati gia' calcolati
// altrove (health, flows, traffic, provider, ultimi eventi). Nessun nuovo
// dato inventato qui: e' una vista testuale/JSON di cio' che la pagina gia'
// mostra.

export function buildPlatformStatusReport({ health, flows, traffic, providers, lastEvents, authHealth, controlCenter, auditLog = [], maintenance = null, generatedAt = new Date() } = {}) {
  const healthRows = health?.rows || [];
  const hasError = healthRows.some((row) => row.status === "error");
  const hasWarning = healthRows.some((row) => row.status === "warning");
  const generalStatus = hasError ? "ERRORE" : hasWarning ? "ATTENZIONE" : "OK";

  return {
    generatedAt: generatedAt.toISOString(),
    generalStatus,
    health: healthRows.map((row) => ({ label: row.label, status: row.statusLabel, responseTimeMs: row.responseTimeMs, error: row.error })),
    flows: (flows || []).map((f) => ({ label: f.label, status: f.status.toUpperCase(), reason: f.reason, lastChecked: f.lastChecked })),
    flowsWithIssues: (flows || []).filter((f) => f.status !== "pass").map((f) => ({ label: f.label, status: f.status.toUpperCase(), reason: f.reason })),
    providersNotConfigured: providers ? Object.entries(providers).filter(([, configured]) => !configured).map(([name]) => name) : null,
    traffic: traffic || null,
    lastEvents: lastEvents || null,
    // FASE login health check: stessi 3 livelli mostrati nel Blocco 3b, mai
    // ricalcolati qui — solo serializzati per il report esportabile.
    authHealth: authHealth ? {
      infrastructure: authHealth.infrastructure.status,
      clientContract: authHealth.clientContract.status,
      adminContract: authHealth.adminContract.status,
      clientRealLogin: authHealth.clientRealLogin.status,
      adminRealLogin: authHealth.adminRealLogin.status,
    } : null,
    controlCenter: controlCenter ? {
      summary: controlCenter.summary,
      issues: controlCenter.issues.map((problem) => ({
        state: problem.state,
        risk: problem.risk,
        problem: problem.problem,
        probableCause: problem.probableCause,
        module: problem.module,
        action: problem.actionLabel,
        lastChecked: problem.checkedAt,
      })),
    } : null,
    interventionHistory: auditLog.map((row) => ({
      problem: row.problem,
      date: row.at,
      action: row.action,
      actor: row.actor,
      authorizedBy: row.authorizedBy,
      result: row.result,
      postFixVerification: row.verification,
    })),
    maintenance,
  };
}
