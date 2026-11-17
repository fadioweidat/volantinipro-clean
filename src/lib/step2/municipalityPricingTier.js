// The commercial tier belongs to the municipality, NEVER to the NIL, radius,
// or PV currently being displayed. Derived from the existing ISTAT 1,502-comune
// dataset to prevent one municipality receiving two different tiers.
import { classifyTerritory } from '../pricing/distributionPricing.js';
import { municipalityDensityLombardia } from './municipalityDensityLombardia.generated.js';

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s*\([A-Z]{2}\)\s*$/i, '')
  .trim().toLowerCase();

const byCode = new Map(municipalityDensityLombardia.map(([code, name, density]) => [String(code), { name, density }]));
const byName = new Map(municipalityDensityLombardia.map(([code, name, density]) => [normalize(name), { code, name, density }]));

/**
 * Nome e densita' ISTAT del comune (stesso indice dello Step 4), oppure null.
 * Serve ai percorsi che conoscono solo il nome (Preventivo Rapido, esempio
 * homepage): senza densita' il motore ricadeva sulla fascia Hinterland di
 * riserva e dava un prezzo diverso dallo Step 4 e dalle pagine citta'.
 */
export function municipalityIstatDensity({ name, code } = {}) {
  const canonical = byCode.get(String(code || '')) || byName.get(normalize(name));
  return canonical ? { name: canonical.name, densita: canonical.density } : null;
}

/** Stesso comune con nome canonico e densita' ISTAT, per resolveConfiguratorDistributionZones. */
export function withIstatDensity(comune) {
  const istat = municipalityIstatDensity({ name: comune?.name, code: comune?.municipality_code || comune?.code });
  return istat ? { ...comune, name: istat.name, densita: istat.densita } : comune;
}

export function classifyMunicipalityForPrice({ name, code } = {}) {
  const canonical = byCode.get(String(code || '')) || byName.get(normalize(name));
  if (!canonical) return { tier: null, confidence: 'missing', reason: `Comune non presente nell'indice ISTAT Lombardia: ${name || code || '?'}` };
  const resolved = classifyTerritory({ name: canonical.name, densityPerKm2: canonical.density });
  return { tier: resolved.tier, confidence: 'istat', reason: `${canonical.name}, densita' comunale ISTAT: ${canonical.density} ab/km²` };
}
