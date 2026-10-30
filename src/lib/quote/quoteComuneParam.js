// Carries a comune chosen in the homepage calculator through the
// "Richiedi un Preventivo" page (/preventivo) to Preventivo Guidato
// (configurator, comune preselected) and Preventivo Rapido (comune pre-filled).
// Only a validated comune name travels in the URL: no coordinates, no data.

const MAX_COMUNE_LENGTH = 80;
// Letters (accented included), spaces, apostrophes, hyphens, dots: real Italian
// comune names ("Sant'Angelo Lodigiano", "Cassano d'Adda", "Reggio nell'Emilia").
const COMUNE_PATTERN = /^[\p{L}][\p{L}\s'’.-]*$/u;

/** Returns a clean comune name or null (invalid, empty or too long). */
export function sanitizeComuneParam(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > MAX_COMUNE_LENGTH || !COMUNE_PATTERN.test(name)) return null;
  return name;
}

/** Reads ?comune= from a location.search string. */
export function readComuneParam(search) {
  try {
    return sanitizeComuneParam(new URLSearchParams(search || '').get('comune'));
  } catch {
    return null;
  }
}

/** Reads ?service= from a location.search string: only real services. */
export function readServiceParam(search) {
  try {
    const service = new URLSearchParams(search || '').get('service');
    return ['d2d', 'h2h', 'b2b'].includes(service) ? service : null;
  } catch {
    return null;
  }
}

const withParams = (path, comuneName, service) => {
  const comune = sanitizeComuneParam(comuneName);
  const params = new URLSearchParams({ ...(service ? { service } : {}), ...(comune ? { comune } : {}) }).toString();
  return params ? `${path}?${params}` : path;
};

/** "Richiedi un Preventivo" page, with the comune and the service when there are. */
export function buildQuoteSelectionHref(comuneName, service = null) {
  return withParams('/preventivo', comuneName, service);
}

/** Preventivo Guidato: same configurator prefill the homepage calculator used before. */
export function buildConfiguratorHref(comuneName, service = 'd2d') {
  const params = new URLSearchParams({ service, ...(comuneName ? { comune: comuneName, source: 'homepage_calculator' } : {}) });
  return `/configuratore?${params.toString()}`;
}

/** Preventivo Rapido with the comune to pre-fill. */
export function buildQuickQuoteHref(comuneName, service = null) {
  return withParams('/preventivo-rapido', comuneName, service);
}
