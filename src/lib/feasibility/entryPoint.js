export const FEASIBILITY_PATH = '/analisi-campagna';
// Future approved service pricing belongs here; no price or purchase is active.
export const FEASIBILITY_SERVICE = Object.freeze({ price: null, status: 'coming-soon' });

export function feasibilityContext({ referenceId, municipalities, quantity, service, total, areas } = {}) {
  return {
    referenceId: referenceId || null,
    municipalities: Array.isArray(municipalities) ? municipalities.filter(value => typeof value === 'string') : [],
    quantity: Number.isFinite(quantity) ? quantity : null,
    service: typeof service === 'string' ? service : null,
    total: Number.isFinite(total) ? total : null,
    areas: Array.isArray(areas) ? areas.filter(value => typeof value === 'string') : [],
  };
}

// `mode` (opzionale): 'business' | 'campaign' — quando presente, salta la
// schermata di scelta esplicita (FeasibilityModeChoice) e apre direttamente
// quel flusso, letto da feasibilityStorage.readFeasibility via
// history.state.feasibilityMode. Additivo: le chiamate esistenti senza
// `mode` (openFeasibility(), openFeasibility(draft, browser)) restano
// identiche — nessun campo feasibilityMode viene scritto.
export function openFeasibility(context = null, browser = window, mode = null) {
  const state = { feasibility: context ? feasibilityContext(context) : null };
  if (mode === 'business' || mode === 'campaign') state.feasibilityMode = mode;
  browser.history.pushState(state, '', FEASIBILITY_PATH);
  browser.dispatchEvent(new PopStateEvent('popstate', { state: browser.history.state }));
  browser.scrollTo({ top: 0 });
}
