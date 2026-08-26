// Ultimi eventi operativi reali (Blocco 8) — aggregazione pura da dati gia'
// recuperati altrove (getPlatformStatusData in admin-api.js). Nessuna
// chiamata di rete qui, nessun valore stimato: se un evento non e' mai
// avvenuto (o la sua fonte dati non e' disponibile) il campo resta null e
// la UI mostra esplicitamente "Nessun evento registrato" / "Non disponibile".

function latestByField(rows, field) {
  const valid = (Array.isArray(rows) ? rows : []).filter((row) => row && row[field]);
  if (valid.length === 0) return null;
  return valid.reduce((latest, row) => (new Date(row[field]).getTime() > new Date(latest[field]).getTime() ? row : latest));
}

export function computeLastOperationalEvents({
  campaigns = [],
  siteEvents = [],
  assignmentEvents = [],
  gpsPoints = [],
  errorLogRows = [],
  lastAdminSignIn = null,
  lastCustomerSignIn = null,
} = {}) {
  // Le righe campaigns arrivano gia' normalizzate da normalizeCampaign
  // (admin-api.js): il campo data e' createdAt, non created_at.
  const lastCampaign = latestByField(campaigns, "createdAt");
  const lastQuoteCompleted = latestByField(siteEvents.filter((e) => e.event_name === "quote_completed"), "created_at");
  const lastProgram = latestByField(assignmentEvents.filter((e) => e.event_type === "assignment_program_sent"), "created_at");
  const lastGps = latestByField(gpsPoints, "recorded_at");
  const lastEdgeFunctionError = latestByField(errorLogRows.filter((e) => e.category === "edge_function"), "created_at");

  return {
    lastCampaignCreated: lastCampaign ? { at: lastCampaign.createdAt, label: lastCampaign.name || lastCampaign.client || lastCampaign.zone || null } : null,
    lastQuoteCompleted: lastQuoteCompleted ? { at: lastQuoteCompleted.created_at, campaignId: lastQuoteCompleted.campaign_id || null } : null,
    lastAdminLogin: lastAdminSignIn ? { at: lastAdminSignIn } : null,
    lastCustomerLogin: lastCustomerSignIn ? { at: lastCustomerSignIn } : null,
    lastProgramCreated: lastProgram ? { at: lastProgram.created_at } : null,
    lastGpsReceived: lastGps ? { at: lastGps.recorded_at } : null,
    lastEdgeFunctionError: lastEdgeFunctionError ? { at: lastEdgeFunctionError.created_at, module: lastEdgeFunctionError.module || null, message: lastEdgeFunctionError.message || null } : null,
  };
}
