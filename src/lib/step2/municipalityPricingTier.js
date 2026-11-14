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

export function classifyMunicipalityForPrice({ name, code } = {}) {
  const canonical = byCode.get(String(code || '')) || byName.get(normalize(name));
  if (!canonical) return { tier: null, confidence: 'missing', reason: `Comune non presente nell'indice ISTAT Lombardia: ${name || code || '?'}` };
  const resolved = classifyTerritory({ name: canonical.name, densityPerKm2: canonical.density });
  return { tier: resolved.tier, confidence: 'istat', reason: `${canonical.name}, densita' comunale ISTAT: ${canonical.density} ab/km²` };
}
