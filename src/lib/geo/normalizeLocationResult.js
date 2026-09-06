import { normalizeMunicipalityName, normalizeTerritoryName } from '../step2/addressIntent.js';

export const ITALIAN_PROVINCE_CODES = {
  agrigento: 'AG',
  alessandria: 'AL',
  ancona: 'AN',
  aosta: 'AO',
  arezzo: 'AR',
  'ascoli piceno': 'AP',
  asti: 'AT',
  avellino: 'AV',
  bari: 'BA',
  'barletta andria trani': 'BT',
  'barletta-andria-trani': 'BT',
  belluno: 'BL',
  benevento: 'BN',
  bergamo: 'BG',
  biella: 'BI',
  bologna: 'BO',
  bolzano: 'BZ',
  'bolzano bozen': 'BZ',
  bozen: 'BZ',
  brescia: 'BS',
  brindisi: 'BR',
  cagliari: 'CA',
  caltanissetta: 'CL',
  campobasso: 'CB',
  'carbonia iglesias': 'CI',
  'carbonia-iglesias': 'CI',
  caserta: 'CE',
  catania: 'CT',
  catanzaro: 'CZ',
  chieti: 'CH',
  como: 'CO',
  cosenza: 'CS',
  cremona: 'CR',
  crotone: 'KR',
  cuneo: 'CN',
  enna: 'EN',
  fermo: 'FM',
  ferrara: 'FE',
  firenze: 'FI',
  foggia: 'FG',
  'forli cesena': 'FC',
  'forlì cesena': 'FC',
  'forli-cesena': 'FC',
  'forlì-cesena': 'FC',
  frosinone: 'FR',
  genova: 'GE',
  gorizia: 'GO',
  grosseto: 'GR',
  imperia: 'IM',
  isernia: 'IS',
  'la spezia': 'SP',
  aquila: 'AQ',
  "l'aquila": 'AQ',
  latina: 'LT',
  lecce: 'LE',
  lecco: 'LC',
  livorno: 'LI',
  lodi: 'LO',
  lucca: 'LU',
  macerata: 'MC',
  mantova: 'MN',
  'massa carrara': 'MS',
  'massa-carrara': 'MS',
  matera: 'MT',
  'medio campidano': 'VS',
  messina: 'ME',
  milano: 'MI',
  modena: 'MO',
  'monza e brianza': 'MB',
  'monza e della brianza': 'MB',
  'monza-brianza': 'MB',
  monza: 'MB',
  napoli: 'NA',
  novara: 'NO',
  nuoro: 'NU',
  ogliastra: 'OG',
  'olbia tempio': 'OT',
  'olbia-tempio': 'OT',
  oristano: 'OR',
  padova: 'PD',
  palermo: 'PA',
  parma: 'PR',
  pavia: 'PV',
  perugia: 'PG',
  'pesaro e urbino': 'PU',
  'pesaro urbino': 'PU',
  'pesaro-urbino': 'PU',
  pescara: 'PE',
  piacenza: 'PC',
  pisa: 'PI',
  pistoia: 'PT',
  pordenone: 'PN',
  potenza: 'PZ',
  prato: 'PO',
  ragusa: 'RG',
  ravenna: 'RA',
  'reggio calabria': 'RC',
  'reggio emilia': 'RE',
  'reggio nell emilia': 'RE',
  'reggio nell\'emilia': 'RE',
  rieti: 'RI',
  rimini: 'RN',
  roma: 'RM',
  rovigo: 'RO',
  salerno: 'SA',
  sassari: 'SS',
  savona: 'SV',
  siena: 'SI',
  siracusa: 'SR',
  sondrio: 'SO',
  'sud sardegna': 'SU',
  taranto: 'TA',
  teramo: 'TE',
  terni: 'TR',
  torino: 'TO',
  trapani: 'TP',
  trento: 'TN',
  treviso: 'TV',
  trieste: 'TS',
  udine: 'UD',
  varese: 'VA',
  venezia: 'VE',
  'verbano cusio ossola': 'VB',
  'verbano-cusio-ossola': 'VB',
  vercelli: 'VC',
  verona: 'VR',
  'vibo valentia': 'VV',
  vicenza: 'VI',
  viterbo: 'VT',
};

export function extractItalianProvinceCode(rawCounty, isoCode, rawProvince) {
  if (isoCode) {
    const isoClean = String(isoCode).trim().toUpperCase();
    if (isoClean.startsWith('IT-')) {
      const code = isoClean.slice(3);
      if (/^[A-Z]{2}$/.test(code)) return code;
    }
    if (/^[A-Z]{2}$/.test(isoClean)) return isoClean;
  }

  if (rawProvince) {
    const provClean = String(rawProvince).trim().toUpperCase();
    if (provClean.startsWith('IT-')) {
      const code = provClean.slice(3);
      if (/^[A-Z]{2}$/.test(code)) return code;
    }
    if (/^[A-Z]{2}$/.test(provClean)) return provClean;
    const norm = normalizeTerritoryName(rawProvince).replace(/^provincia di\s+/i, '').replace(/^città metropolitana di\s+/i, '').replace(/^citta metropolitana di\s+/i, '').trim();
    if (ITALIAN_PROVINCE_CODES[norm]) return ITALIAN_PROVINCE_CODES[norm];
  }

  if (rawCounty) {
    const countyClean = String(rawCounty).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(countyClean)) return countyClean;
    const norm = normalizeTerritoryName(rawCounty).replace(/^provincia di\s+/i, '').replace(/^città metropolitana di\s+/i, '').replace(/^citta metropolitana di\s+/i, '').trim();
    if (ITALIAN_PROVINCE_CODES[norm]) return ITALIAN_PROVINCE_CODES[norm];
  }

  return null;
}

const FRAZIONE_TYPES = new Set([
  'hamlet',
  'village',
  'isolated_dwelling',
  'croft',
  'frazione',
]);

const QUARTIERE_TYPES = new Set([
  'suburb',
  'quarter',
  'neighbourhood',
  'neighborhood',
  'city_district',
  'district',
  'quartiere',
]);

const LOCALITA_TYPES = new Set([
  'locality',
  'localita',
  'place',
]);

const COMUNE_TYPES = new Set([
  'municipality',
  'city',
  'town',
  'administrative',
  'comune',
]);

function cleanText(val) {
  return String(val || '').trim().replace(/\s+/g, ' ');
}

export function classifyLocationType(placeType, hasParentComune = false) {
  const pt = String(placeType || '').toLowerCase().trim();
  if (FRAZIONE_TYPES.has(pt)) return 'frazione';
  if (QUARTIERE_TYPES.has(pt)) return 'quartiere';
  if (LOCALITA_TYPES.has(pt)) return hasParentComune ? 'localita' : 'comune';
  if (COMUNE_TYPES.has(pt)) return hasParentComune ? 'frazione' : 'comune';
  return hasParentComune ? 'frazione' : 'comune';
}

/**
 * Normalizza un risultato geografico (Nominatim, Mapbox o dataset interno)
 * nel modello di dati canonico richiesto dal ticket.
 */
export function normalizeLocationResult(item = {}, source = 'nominatim') {
  if (!item) return null;

  // 1. Nominatim response format
  if (source === 'nominatim' || item.place_id || item.osm_id || item.display_name) {
    const address = item.address || {};
    const displayNameRaw = cleanText(item.display_name || item.name || '');
    const firstPart = cleanText(displayNameRaw.split(',')[0]);

    // Trova il comune ufficiale
    // Se c'è address.city o address.town, quello è il comune
    // Se è un comune autonomo, il nome principale è il comune
    const officialComune = cleanText(
      address.city
      || address.town
      || address.municipality
      || (COMUNE_TYPES.has(item.addresstype || item.type) ? firstPart : null)
      || address.village
      || address.city_district
      || firstPart
    );

    // Identifica se c'è una sotto-località/frazione/quartiere
    const subNameCandidate = cleanText(
      address.suburb
      || address.hamlet
      || address.quarter
      || address.neighbourhood
      || address.neighborhood
      || address.village
      || (firstPart && normalizeMunicipalityName(firstPart) !== normalizeMunicipalityName(officialComune) ? firstPart : null)
    );

    const isSubLocality = Boolean(
      subNameCandidate
      && normalizeMunicipalityName(subNameCandidate) !== normalizeMunicipalityName(officialComune)
    );

    const localita = isSubLocality ? (subNameCandidate || firstPart) : null;
    const comune = officialComune;
    const provincia = extractItalianProvinceCode(
      address.county,
      address['ISO3166-2-lvl6'] || address['ISO3166-2-lvl4'],
      address.state_district || address.state
    );
    const regione = cleanText(address.state || 'Lombardia');
    const cap = cleanText(address.postcode || null);
    const rawPlaceType = item.addresstype || item.type || item.class || 'place';
    const type = isSubLocality ? classifyLocationType(rawPlaceType, true) : 'comune';

    const provSuffix = provincia ? ` (${provincia})` : '';
    const displayName = isSubLocality
      ? `${localita} — ${comune}${provSuffix}`
      : `${comune}${provSuffix}`;

    return {
      id: item.place_id || `nom_${item.osm_id || `${normalizeMunicipalityName(comune)}_${normalizeMunicipalityName(localita || '')}`}`,
      displayName,
      comune,
      provincia,
      regione,
      localita,
      cap,
      lat: Number.parseFloat(item.lat),
      lng: Number.parseFloat(item.lon || item.lng),
      type,
      placeType: rawPlaceType,
      source: 'nominatim',
      // backward compatibility properties
      name: isSubLocality ? displayName : comune,
      label: isSubLocality ? displayName : comune,
      fullName: displayNameRaw,
    };
  }

  // 2. Mapbox format
  if (source === 'mapbox' || Array.isArray(item.context) || Array.isArray(item.center)) {
    const context = Array.isArray(item.context) ? item.context : [];
    const placeContext = context.find(x => String(x.id || '').startsWith('place'))?.text;
    const regionContext = context.find(x => String(x.id || '').startsWith('region'));
    const postcode = context.find(x => String(x.id || '').startsWith('postcode'))?.text || null;
    const primaryText = cleanText(item.text || '');
    const officialComune = cleanText(placeContext || primaryText);

    const isSubLocality = Boolean(
      placeContext && normalizeMunicipalityName(primaryText) !== normalizeMunicipalityName(placeContext)
    );

    const localita = isSubLocality ? primaryText : null;
    const comune = officialComune;
    const provincia = extractItalianProvinceCode(
      null,
      regionContext?.short_code,
      regionContext?.text
    );
    const cap = cleanText(postcode || null);
    const rawPlaceType = item.place_type?.[0] || 'place';
    const type = isSubLocality ? classifyLocationType(rawPlaceType, true) : 'comune';

    const provSuffix = provincia ? ` (${provincia})` : '';
    const displayName = isSubLocality
      ? `${localita} — ${comune}${provSuffix}`
      : `${comune}${provSuffix}`;

    return {
      id: item.id || `mb_${normalizeMunicipalityName(comune)}_${normalizeMunicipalityName(localita || '')}`,
      displayName,
      comune,
      provincia,
      regione: regionContext?.text || 'Lombardia',
      localita,
      cap,
      lat: Array.isArray(item.center) ? item.center[1] : Number.parseFloat(item.lat),
      lng: Array.isArray(item.center) ? item.center[0] : Number.parseFloat(item.lng),
      type,
      placeType: rawPlaceType,
      source: 'mapbox',
      name: isSubLocality ? displayName : comune,
      label: isSubLocality ? displayName : comune,
      fullName: item.place_name || displayName,
    };
  }

  // 3. Local dataset / object format
  const comune = cleanText(item.comune || item.name || item.label || '');
  const localita = cleanText(item.localita || item.frazione || item.suburb || null);
  const isSub = Boolean(localita && normalizeMunicipalityName(localita) !== normalizeMunicipalityName(comune));
  const provincia = extractItalianProvinceCode(item.county || item.provincia || item.prov || item.province);
  const provSuffix = provincia ? ` (${provincia})` : '';
  const displayName = item.displayName || (isSub
    ? `${localita} — ${comune}${provSuffix}`
    : `${comune}${provSuffix}`);

  return {
    id: item.id || `loc_${normalizeMunicipalityName(comune)}_${normalizeMunicipalityName(localita || '')}`,
    displayName,
    comune,
    provincia,
    regione: item.regione || item.region || 'Lombardia',
    localita: isSub ? localita : null,
    cap: cleanText(item.cap || item.postcode || null),
    lat: Number.parseFloat(item.lat),
    lng: Number.parseFloat(item.lng),
    type: item.type || (isSub ? 'frazione' : 'comune'),
    placeType: item.placeType || (isSub ? 'hamlet' : 'city'),
    source: item.source || 'local',
    name: displayName,
    label: displayName,
    fullName: item.fullName || displayName,
  };
}

/**
 * Algoritmo di Ranking dell'autocomplete:
 * 1. Match esatto località (es. 'Palazzolo')
 * 2. Località nel comune/provincia corretti (es. 'Palazzolo Paderno', 'Palazzolo MI')
 * 3. Comune (match esatto o prefisso)
 * 4. Altri risultati fuzzy
 */
export function rankLocationResults(results = [], query = '') {
  if (!Array.isArray(results) || results.length === 0) return [];
  const rawQ = String(query || '').trim();
  if (!rawQ) return results;

  const normQ = normalizeTerritoryName(rawQ);
  const tokens = normQ.split(/\s+/).filter(Boolean);

  const scored = results.map((item) => {
    let score = 0;
    const normLoc = normalizeTerritoryName(item.localita || '');
    const normCom = normalizeTerritoryName(item.comune || '');
    const normProv = normalizeTerritoryName(item.provincia || '');
    const normDisplay = normalizeTerritoryName(item.displayName || '');
    const fullText = `${normLoc} ${normCom} ${normProv} ${normDisplay}`;

    if (tokens.length > 1) {
      // Check how many tokens match
      const matchingTokens = tokens.filter((t) => t.length > 0 && fullText.includes(t));
      const allTokensMatch = matchingTokens.length === tokens.length;

      if (allTokensMatch) {
        score += 150;
      } else {
        score += matchingTokens.length * 30;
      }

      // If query has locality and comune tokens
      const hasLocMatch = Boolean(normLoc && tokens.some((t) => t.length >= 2 && normLoc.includes(t)));
      const hasComMatch = Boolean(normCom && tokens.some((t) => t.length >= 2 && normCom.includes(t)));
      const hasProvMatch = Boolean(normProv && tokens.some((t) => t === normProv));

      if (hasLocMatch && (hasComMatch || hasProvMatch)) {
        score += 80;
      }
    } else {
      // Single token query
      // 1. Match esatto località
      if (normLoc && normLoc === normQ) {
        score += 100;
      } else if (normLoc && normLoc.startsWith(normQ)) {
        score += 85;
      } else if (normLoc && normLoc.includes(normQ)) {
        score += 50;
      }

      // 2. Match comune
      if (normCom === normQ) {
        score += (item.type === 'comune' ? 80 : 70);
      } else if (normCom.startsWith(normQ)) {
        score += (item.type === 'comune' ? 65 : 55);
      } else if (normCom.includes(normQ)) {
        score += 35;
      }
    }

    // Bonus per provincia corrispondente se presente nella query
    if (normProv && tokens.includes(normProv)) {
      score += 30;
    }

    return { item, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
