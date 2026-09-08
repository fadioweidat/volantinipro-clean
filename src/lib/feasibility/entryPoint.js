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

export function openFeasibility(context = null, browser = window) {
  browser.history.pushState({ feasibility: context ? feasibilityContext(context) : null }, '', FEASIBILITY_PATH);
  browser.dispatchEvent(new PopStateEvent('popstate', { state: browser.history.state }));
  browser.scrollTo({ top: 0 });
}
