// Aggregazione pura (nessuna chiamata Supabase qui) delle righe di
// public.site_events per la sezione Admin "Traffico sito"
// (src/pages/admin/CommercialCenter.jsx). Stesso pattern client-side gia'
// usato da getRealCampaigns/getClientsQuotesOverview in admin-api.js:
// fetch grezzo altrove, aggregazione qui, cosi' e' testabile senza DB.

// Stessa convenzione "giorno locale" gia' usata altrove nell'admin (es.
// AdminDashboard.jsx/CommercialCenter.jsx localDateKey).
function localDateKey(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function computeSiteTrafficSummary(rows, { now = new Date() } = {}) {
  const allRows = Array.isArray(rows) ? rows : [];
  const todayKey = localDateKey(now);
  const todayRows = allRows.filter((row) => {
    const createdAt = row?.created_at ? new Date(row.created_at) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && localDateKey(createdAt) === todayKey;
  });

  const countByEvent = (eventName) => todayRows.filter((row) => row.event_name === eventName).length;

  const visitorIds = new Set(todayRows.map((row) => row.anonymous_session_id).filter(Boolean));
  // Sessioni = session_id distinti, fallback ad anonymous_session_id per gli
  // eventi storici senza session_id. Stessa definizione di analyticsAggregate /
  // rollup SQL (session_uid). NON e piu il conteggio di session_started.
  const sessionIds = new Set(todayRows.map((row) => row.session_id || row.anonymous_session_id).filter(Boolean));
  const sessionsToday = sessionIds.size;
  const quotesStartedToday = countByEvent("quote_started");
  const quotesCompletedToday = countByEvent("quote_completed");
  const consultationRequestsToday = countByEvent("consultation_requested");

  // Nessun numero stimato: se non ci sono preventivi iniziati oggi il tasso
  // di conversione non e' calcolabile (non 0%, non un fallback finto).
  const conversionRate = quotesStartedToday > 0 ? quotesCompletedToday / quotesStartedToday : null;

  return {
    // Distingue "mai configurato" (nessuna riga mai registrata, in nessun
    // giorno) da "configurato ma zero traffico oggi" — la UI mostra un
    // messaggio diverso nei due casi, mai un numero inventato.
    hasAnyData: allRows.length > 0,
    visitorsToday: visitorIds.size,
    sessionsToday,
    quotesStartedToday,
    quotesCompletedToday,
    consultationRequestsToday,
    conversionRate,
  };
}
