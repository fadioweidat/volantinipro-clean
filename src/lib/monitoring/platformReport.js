// Report tecnico esportabile (Blocco 7) — compone solo dati gia' calcolati
// altrove (health, flows, traffic, provider, ultimi eventi). Nessun nuovo
// dato inventato qui: e' una vista testuale/JSON di cio' che la pagina gia'
// mostra.

export function buildPlatformStatusReport({ health, flows, traffic, providers, lastEvents, generatedAt = new Date() } = {}) {
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
  };
}
