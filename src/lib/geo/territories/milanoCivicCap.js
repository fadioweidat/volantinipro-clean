const ASSET = '/data/territories/milano-civic-cap-index.json';
const STREET_TYPES = new Set([
  'ALZAIA', 'AUTOSTRADA', 'BASTIONI', 'BORGO', 'CAVALCAVIA', 'CORSO', 'FORO',
  'GALLERIA', 'LARGO', 'PIAZZA', 'PIAZZALE', 'RIPA', 'RONDO', 'ROTONDA',
  'STRADA', 'TERRAGGIO', 'VIA', 'VIALE', 'VICOLO',
]);

function streetTokens(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .match(/[A-Z0-9]+/g)?.filter(token => !STREET_TYPES.has(token)) || [];
}

export function normalizeMilanoStreet(value) {
  return streetTokens(value).sort().join(' ');
}

export function normalizeMilanoStreetExact(value) {
  return streetTokens(value).join(' ');
}

export function normalizeMilanoCivic(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = compact.match(/^(\d+)(.*)$/);
  return match ? `${Number(match[1])}${match[2]}` : compact;
}

let cached;
export async function loadMilanoCivicCapIndex({ signal, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (cached) return cached;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(ASSET, { signal: controller.signal, cache: 'force-cache' });
    if (!response.ok) throw new Error('Indice civici CAP non disponibile');
    const document = await response.json();
    if (document?.schemaVersion !== 1 || !document.exactLookup || !document.normalizedLookup) throw new Error('Indice civici CAP non valido');
    cached = { ...document, validCaps: new Set(Object.values(document.normalizedLookup).filter(value => /^201\d{2}$/.test(value))) };
    return cached;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function resolveMilanoCivicCap({ street, houseNumber, postcode, signal, fetchImpl } = {}) {
  const index = await loadMilanoCivicCapIndex({ signal, fetchImpl });
  const exactStreetKey = normalizeMilanoStreetExact(street);
  const streetKey = normalizeMilanoStreet(street);
  const civicKey = normalizeMilanoCivic(houseNumber);
  const exact = exactStreetKey && civicKey ? index.exactLookup[`${exactStreetKey}|${civicKey}`] : null;
  if (exact) return { cap: exact, source: 'civic_exact', label: 'CAP rilevato dall’indirizzo' };
  const normalized = streetKey && civicKey ? index.normalizedLookup[`${streetKey}|${civicKey}`] : null;
  if (normalized) return { cap: normalized, source: 'civic_normalized', label: 'CAP rilevato dall’indirizzo' };
  const geocoderCap = String(postcode || '').trim();
  if (index.validCaps.has(geocoderCap)) return { cap: geocoderCap, source: 'geocoder', label: 'CAP rilevato dall’indirizzo' };
  return { cap: null, source: 'unavailable', label: 'CAP non disponibile' };
}

export { ASSET as MILANO_CIVIC_CAP_ASSET };
