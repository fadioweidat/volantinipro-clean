// Modello dati "Fattibilità della mia attività" (Business Mode).
// Additivo e isolato dal modello Campaign Mode (feasibilitySchemas.js), che
// resta invariato. Nessuna quantità/costo campagna richiesta qui.
import { GEO_DATA } from '../../../../lib/geoData.js';
import { normalizeTerritoryName } from '../../../../lib/step2/addressIntent.js';
import { geocodeAddress } from '../../../../lib/geo/geocodeAddress.js';
import { resolveNilForPoint } from '../../../../lib/geo/resolveNilForPoint.js';

// ── Campi richiesti (minimi, per §3 del ticket) ─────────────────────────────
export const BUSINESS_STATUS_OPTIONS = [
  { value: 'new', label: 'Nuova apertura' },
  { value: 'existing', label: 'Attività già esistente' },
];

export const BUSINESS_GOAL_OPTIONS = [
  { value: 'zone_fit', label: 'Capire se la zona è adatta' },
  { value: 'more_customers', label: 'Trovare più clienti' },
  { value: 'competition', label: 'Valutare la concorrenza' },
  { value: 'new_zone', label: 'Scegliere una nuova zona' },
  { value: 'should_open', label: 'Capire se aprire' },
  { value: 'improve_existing', label: "Migliorare l'attività esistente" },
];

export const BUSINESS_REQUIRED_FIELDS = [
  'businessType', 'location', 'businessStatus', 'targetCustomer', 'averagePrice', 'businessGoal',
];

export function initialBusinessInputs() {
  return {
    businessType: '', location: '', businessStatus: '', targetCustomer: '',
    averagePrice: '', businessGoal: '',
    // opzionali (§3)
    radiusKm: '', knownCompetitors: '', priceRange: '', notes: '',
  };
}

export function businessValidationErrors(inputs) {
  const errors = {};
  if (!String(inputs.businessType || '').trim()) errors.businessType = 'Indica il tipo di attività.';
  if (!String(inputs.location || '').trim()) errors.location = 'Indica città, indirizzo o zona.';
  if (!BUSINESS_STATUS_OPTIONS.some(o => o.value === inputs.businessStatus)) errors.businessStatus = 'Seleziona lo stato dell’attività.';
  if (!String(inputs.targetCustomer || '').trim()) errors.targetCustomer = 'Indica il cliente target.';
  const price = Number(String(inputs.averagePrice || '').replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) errors.averagePrice = 'Inserisci un prezzo medio valido (numero > 0).';
  if (!BUSINESS_GOAL_OPTIONS.some(o => o.value === inputs.businessGoal)) errors.businessGoal = 'Seleziona l’obiettivo principale.';
  const radius = inputs.radiusKm === '' || inputs.radiusKm == null ? null : Number(inputs.radiusKm);
  if (radius != null && (!Number.isFinite(radius) || radius <= 0 || radius > 30)) errors.radiusKm = 'Il raggio deve essere tra 0 e 30 km.';
  return errors;
}

export function isBusinessInputsComplete(inputs) {
  return Object.keys(businessValidationErrors(inputs)).length === 0;
}

// ── Località → coordinate reali (riuso GEO_DATA, nessuna nuova fonte) ──────
// Match tollerante sul nome (stesso normalizzatore di Step2/Step1). Se non
// trova corrispondenza, ritorna null: il chiamante mostra "Dato non
// disponibile" per i dati territoriali, non inventa coordinate.
export function resolveBusinessLocation(rawLocation) {
  const text = String(rawLocation || '').trim();
  if (!text) return null;
  const normalized = normalizeTerritoryName(text);
  const exact = GEO_DATA.find(entry => normalizeTerritoryName(entry.name || entry.label || '') === normalized);
  if (exact) return { name: exact.name || exact.label, lat: exact.lat, lng: exact.lng, matchType: 'exact' };
  const partial = GEO_DATA.find(entry => {
    const n = normalizeTerritoryName(entry.name || entry.label || '');
    return n && (normalized.startsWith(`${n} `) || normalized.includes(` ${n} `) || normalized.includes(n));
  });
  if (partial) return { name: partial.name || partial.label, lat: partial.lat, lng: partial.lng, matchType: 'partial' };
  return null;
}

// ── Località → canonica reale (ticket "BUSINESS FEASIBILITY DATA QUALITY:
// GEOCODING + ISTAT + POI CONSISTENCY") ────────────────────────────────────
// resolveBusinessLocation (sopra) copre SOLO i pochi comuni satellite in
// GEO_DATA (nessun indirizzo, nessuna via, niente "Milano" vero e proprio).
// Per un indirizzo reale ("milano via oroboni", "Via Antonio Oroboni,
// 20161 Milano", ...) serve un geocoder reale: qui si riusa lo STESSO
// provider/pattern già in produzione (geocodeAddress.js, Nominatim,
// riesportato da src/lib/geo/geocodeAddress.js — usato da ZoneCoverageMap
// in Admin), MAI una seconda implementazione geografica parallela (§3).
// Ordine di risoluzione, dal più preciso al più generico, nessun dato
// inventato in nessun passo:
//   1. GEO_DATA (match esatto/parziale) — comuni satellite noti, nessuna
//      chiamata di rete, già copriva questo caso prima del ticket.
//   2. Geocoder reale (Nominatim) — indirizzi/via reali, incluso "Milano".
//   3. Se il comune risolto è Milano: NIL contenente il punto (stesso
//      breakdown analysis-istat già usato da Step2/resolveMunicipalityBoundary,
//      via resolveNilForPoint.js), altrimenti nilName resta null.
// Ritorna null se NESSUna fonte risolve l'indirizzo — mai coordinate finte.
export async function resolveBusinessLocationAsync(rawLocation, { signal } = {}) {
  const text = String(rawLocation || '').trim();
  if (!text) return null;

  const geoDataMatch = resolveBusinessLocation(text);
  if (geoDataMatch) {
    return {
      displayAddress: geoDataMatch.name,
      city: geoDataMatch.name,
      lat: geoDataMatch.lat,
      lng: geoDataMatch.lng,
      nilName: null,
      matchType: geoDataMatch.matchType,
      source: 'geo_data',
    };
  }

  let geocoded = null;
  try {
    geocoded = await geocodeAddress(`${text}, Italia`, { signal });
  } catch {
    // Rete/provider non disponibile: nessun fallback inventato, si prova
    // solo il ramo GEO_DATA già tentato sopra — location resta non risolta.
    return null;
  }
  if (!geocoded) return null;

  const city = geocoded.city || null;
  let nilName = null;
  if (city && normalizeTerritoryName(city) === normalizeTerritoryName('Milano')) {
    const nil = await resolveNilForPoint(geocoded.lat, geocoded.lng, { municipalityName: 'Milano', signal }).catch(() => null);
    nilName = nil?.name || null;
  }

  return {
    displayAddress: geocoded.label,
    city,
    lat: geocoded.lat,
    lng: geocoded.lng,
    nilName,
    matchType: 'geocoded',
    source: 'geocoder',
  };
}

// ── Attività → categorie POI rilevanti (riuso motore POI esistente) ────────
// Le chiavi di target coincidono con TARGET_POI_CATEGORIES già presente in
// src/lib/services/poi-api.js: nessuna nuova mappatura POI lato backend,
// solo la scelta di quali target passare a usePoi/fetchPois (client-side).
// Fallback generico (nessuna categoria nota) = nessun target -> l'intero set
// di POI del servizio più ampio (d2d), MAI "nascondi tutto" (§5).
const ACTIVITY_TARGET_RULES = [
  { match: /palestr|fitness|gym|sportiv/i, targets: ['fitness'] },
  { match: /supermercat|grocery|discount|alimentar/i, targets: ['retail'] },
  { match: /ristorant|pizzeria|trattoria|osteria|food/i, targets: ['ristorazione'] },
  { match: /bar\b|caff|pub/i, targets: ['ristorazione'] },
  { match: /negozio|abbigliamento|retail|boutique/i, targets: ['retail'] },
  { match: /studio professionale|commercialista|avvocato|legale|consulen/i, targets: ['professional_services'] },
  { match: /centro estetic|parrucchier|beauty|estetista/i, targets: ['beauty'] },
  { match: /scuola|formazione|corsi|asilo/i, targets: ['scuole', 'universita'] },
  { match: /università|universita/i, targets: ['universita'] },
  { match: /farmaci|clinic|studio medic|dentist|sanitari/i, targets: ['sanitario'] },
  { match: /hotel|b&b|bnb|ricettiv|ospitalit/i, targets: ['hospitality'] },
  { match: /immobiliar/i, targets: ['immobiliare'] },
  { match: /officina|concessionaria|auto/i, targets: ['automotive'] },
  { match: /ufficio|azienda|business/i, targets: ['business'] },
];

export function activityToPoiTargets(businessType) {
  const text = String(businessType || '').trim();
  if (!text) return { targets: [], serviceType: 'd2d', matched: false };
  const rule = ACTIVITY_TARGET_RULES.find(r => r.match.test(text));
  // 'd2d' ha il set di tag POI più ampio (vedi POI_TAGS in poi-api.js): base
  // sicura sia per il match noto sia per il fallback generico.
  return { targets: rule ? rule.targets : [], serviceType: 'd2d', matched: Boolean(rule) };
}

// ── Attività → categorie POI considerate concorrenza diretta ───────────────
// Sottoinsieme (di solito lo stesso) delle categorie usate per il target:
// serve a distinguere "concorrenti diretti" da "attività complementari" nel
// report (§6). Fallback: nessuna categoria nota -> nessun concorrente diretto
// riconosciuto (mostrato come "Dato non disponibile" per la classificazione,
// mai 0 finto).
const ACTIVITY_COMPETITOR_CATEGORIES = {
  palestra: ['Palestra', 'Centro sportivo'],
  fitness: ['Palestra', 'Centro sportivo'],
  gym: ['Palestra', 'Centro sportivo'],
  sport: ['Palestra', 'Centro sportivo'],
  retail: ['Negozio', 'Supermercato', 'Centro comm.', 'Abbigliamento'],
  ristorazione: ['Ristorante', 'Bar/Caffè', 'Bar'],
  professional_services: ['Studio professionale', 'Studio legale', 'Commercialista', 'Studio finanz.'],
  beauty: ['Parrucchiere', 'Centro estetico'],
  scuole: ['Scuola'],
  universita: ['Università'],
  sanitario: ['Farmacia', 'Clinica', 'Ospedale', 'Studio medico'],
  hospitality: ['Hotel', 'Struttura ricettiva'],
  immobiliare: ['Immobiliare'],
  automotive: ['Officina', 'Concessionaria'],
  business: ['Ufficio'],
};

export function competitorCategoriesForTargets(targets) {
  const categories = new Set();
  for (const target of targets) (ACTIVITY_COMPETITOR_CATEGORIES[target] || []).forEach(cat => categories.add(cat));
  return [...categories];
}

export const NOT_AVAILABLE = 'Dato non disponibile';
// Usato SOLO per il punteggio finale (mai per un singolo campo) quando
// NESSUNA delle fonti maggiori (ISTAT, POI) è disponibile — ticket "PREMIUM
// FEASIBILITY REPORTS" §5: un verdetto ALTA/MEDIA/BASSA "normale" sarebbe
// fuorviante con zero fattori reali. "Dato non disponibile" resta il valore
// per i singoli campi (concorrenza, bacino); solo il giudizio complessivo
// diventa "preliminare".
export const PRELIMINARY = 'Valutazione preliminare';
