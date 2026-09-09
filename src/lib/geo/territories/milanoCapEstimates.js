export const CAP_ESTIMATES_ASSET = '/data/territories/milano-cap-estimates.json';

export const CAP_ESTIMATE_DISCLAIMER = 'Stima VolantiniPro ottenuta dalla distribuzione dei civici CAP all\'interno dei NIL e dai dati territoriali disponibili. Il CAP è utilizzato come area operativa stimata. Non rappresenta un confine postale ufficiale.';

export const CAP_ESTIMATE_SHORT_DISCLAIMER = 'Il CAP è utilizzato come area operativa stimata. Non rappresenta un confine postale ufficiale.';

let cachedEstimates = null;

export async function loadMilanoCapEstimates({ signal, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (cachedEstimates) return cachedEstimates;

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);

  try {
    const response = await fetchImpl(CAP_ESTIMATES_ASSET, { signal: controller.signal, cache: 'force-cache' });
    if (!response.ok) throw new Error('Dataset stime CAP non disponibile');
    const data = await response.json();
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    cachedEstimates = data;
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function resolveMilanoCapEstimate(dataset, cap) {
  if (!cap) return null;
  const cleanCap = String(cap).trim();
  const estimates = dataset?.estimates || dataset;
  if (!estimates || typeof estimates !== 'object') return null;
  const estimate = estimates[cleanCap] || null;
  if (!estimate) {
    return {
      available: false,
      cap: cleanCap,
      label: 'Stima CAP non disponibile',
      isEstimated: true,
      confidence: 'unknown',
      confidenceLabel: 'Non disponibile',
      estimatedFamilies: null,
      recommendedQuantity: null,
      disclaimer: CAP_ESTIMATE_DISCLAIMER,
    };
  }
  return {
    available: true,
    cap: cleanCap,
    label: `Stima territoriale CAP ${cleanCap}`,
    isEstimated: true,
    confidence: estimate.confidence || 'medium',
    confidenceLabel: estimate.confidenceLabel || 'Media',
    estimatedFamilies: Number(estimate.estimatedFamilies) || 0,
    recommendedQuantity: Number(estimate.recommendedQuantity) || 0,
    civicSampleCount: Number(estimate.civicSampleCount) || 0,
    joinedCivicRate: Number(estimate.joinedCivicRate) || 0,
    municipi: Array.isArray(estimate.municipi) ? estimate.municipi : [],
    nilCount: Number(estimate.nilCount) || 0,
    primaryNilName: estimate.primaryNilName || null,
    primaryNilShare: Number(estimate.primaryNilShare) || 0,
    nilContributions: Array.isArray(estimate.nilContributions) ? estimate.nilContributions : [],
    disclaimer: CAP_ESTIMATE_DISCLAIMER,
    shortDisclaimer: CAP_ESTIMATE_SHORT_DISCLAIMER,
    source: 'VolantiniPro (modello di ripartizione civica DS2973 + DS634 + DS1440)',
    sourceLabel: 'Stima VolantiniPro basata su civici e NIL',
  };
}
