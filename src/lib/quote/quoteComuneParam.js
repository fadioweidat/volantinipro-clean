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

/** "Richiedi un Preventivo" page, with the comune when there is one. */
export function buildQuoteSelectionHref(comuneName) {
  const comune = sanitizeComuneParam(comuneName);
  return comune ? `/preventivo?${new URLSearchParams({ comune }).toString()}` : '/preventivo';
}

/** Preventivo Guidato: same configurator prefill the homepage calculator used before. */
export function buildConfiguratorHref(comuneName) {
  const params = new URLSearchParams({ service: 'd2d', comune: comuneName, source: 'homepage_calculator' });
  return `/configuratore?${params.toString()}`;
}

/** Preventivo Rapido with the comune to pre-fill. */
export function buildQuickQuoteHref(comuneName) {
  const comune = sanitizeComuneParam(comuneName);
  return comune ? `/preventivo-rapido?${new URLSearchParams({ comune }).toString()}` : '/preventivo-rapido';
}
