export const FEASIBILITY_PATH = '/analisi-campagna';
// Future approved service pricing belongs here; no price or purchase is active.
export const FEASIBILITY_SERVICE = Object.freeze({ price: null, status: 'coming-soon' });

// `startDate` (ticket "CAMPAIGN FEASIBILITY PREFILL"): puramente descrittivo,
// mostrato in sola lettura tra i "Dati collegati alla campagna" — non entra
// mai negli input economici dell'engine (FIELDS in feasibilitySchemas.js non
// ha una chiave "startDate"), quindi non tocca calculateFeasibility.
export function feasibilityContext({ referenceId, municipalities, quantity, service, total, areas, startDate } = {}) {
  return {
    referenceId: referenceId || null,
    municipalities: Array.isArray(municipalities) ? municipalities.filter(value => typeof value === 'string') : [],
    quantity: Number.isFinite(quantity) ? quantity : null,
    service: typeof service === 'string' ? service : null,
    total: Number.isFinite(total) ? total : null,
    areas: Array.isArray(areas) ? areas.filter(value => typeof value === 'string') : [],
    startDate: typeof startDate === 'string' && startDate ? startDate : null,
  };
}

// `mode` (opzionale): 'business' | 'campaign' — quando presente, salta la
// schermata di scelta esplicita (FeasibilityModeChoice) e apre direttamente
// quel flusso, letto da feasibilityStorage.readFeasibility via
// history.state.feasibilityMode. Additivo: le chiamate esistenti senza
// `mode` (openFeasibility(), openFeasibility(draft, browser)) restano
// identiche — nessun campo feasibilityMode viene scritto.
//
// `source` (opzionale, ticket "CAMPAIGN FEASIBILITY PREFILL" §1): DICHIARA
// esplicitamente da dove arriva l'apertura — 'quote' (Step4, preventivo appena
// configurato), 'campaign' (dettaglio di una campagna esistente lato Cliente),
// 'dashboard', 'order'. MAI inferito da quali campi sono presenti nel
// `context` — è il chiamante (Step4FeasibilityCard, CampaignDashboardPage,
// ...) a dichiararlo, letto da feasibilityStorage via
// history.state.contextSource. Nessun valore = homepage/standalone (§1.A).
export function openFeasibility(context = null, browser = window, mode = null, source = null) {
  const state = { feasibility: context ? feasibilityContext(context) : null };
  if (mode === 'business' || mode === 'campaign') state.feasibilityMode = mode;
  if (['quote', 'campaign', 'dashboard', 'order'].includes(source)) state.contextSource = source;
  browser.history.pushState(state, '', FEASIBILITY_PATH);
  browser.dispatchEvent(new PopStateEvent('popstate', { state: browser.history.state }));
  browser.scrollTo({ top: 0 });
}
