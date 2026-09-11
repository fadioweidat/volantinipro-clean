export const FEASIBILITY_PATH = '/analisi-campagna';
// Future approved service pricing belongs here; no price or purchase is active.
export const FEASIBILITY_SERVICE = Object.freeze({ price: null, status: 'coming-soon' });

export function formatServiceLabel(serviceKey) {
  if (!serviceKey) return 'Servizio non indicato';
  const map = {
    d2d: 'Door to Door',
    'door to door': 'Door to Door',
    'Door to Door': 'Door to Door',
    h2h: 'Hand to Hand',
    'hand to hand': 'Hand to Hand',
    'Hand to Hand': 'Hand to Hand',
    b2b: 'Distribuzione presso attività e aziende',
    'business': 'Distribuzione presso attività e aziende',
    'Distribuzione Business': 'Distribuzione presso attività e aziende',
    'Distribuzione presso attività e aziende': 'Distribuzione presso attività e aziende',
    'Negozi / B2B': 'Distribuzione presso attività e aziende'
  };
  return map[serviceKey] || map[String(serviceKey).toLowerCase()] || serviceKey;
}

export function buildCampaignTerritoryContext(data) {
  if (!data) {
    return {
      operationalCity: null,
      campaignAreas: null,
      municipalities: [],
      areas: [],
      areaMode: null,
      radiusKm: null,
      addressLabel: null,
      nilName: null,
      zonesCount: 0
    };
  }

  const truthModel = data.truthModel || null;
  const userSelections = truthModel?.userSelections || {};

  const areaMode = data.areaMode || userSelections.areaMode || (data.radiusKm || data.radius ? 'radius' : 'municipality');
  const radiusKm = Number(data.radiusKm || data.radius || userSelections.radiusKm || 0) || null;

  const searchPoint = data.selectedSearchPoint || userSelections.selectedSearchPoint || null;
  const addressLabel = searchPoint?.label || data.addressLabel || data.searchedLocation || (typeof data.search === 'string' && data.search.trim().length > 3 ? data.search.trim() : null);

  const nilName = searchPoint?.nilName
    || (searchPoint?.type === 'nil' ? searchPoint.label : null)
    || data.containingNil?.name
    || (typeof data.containingNil === 'string' ? data.containingNil : null)
    || (Array.isArray(data.selectedNils) && data.selectedNils[0]?.name ? data.selectedNils[0].name : null)
    || (Array.isArray(truthModel?.territory?.nils) && truthModel.territory.nils[0]?.name ? truthModel.territory.nils[0].name : null)
    || null;

  const cityName = data.cityName
    || data.city?.name
    || data.city?.label
    || (Array.isArray(data.selectedComuni) && data.selectedComuni[0]?.name ? data.selectedComuni[0].name : null)
    || searchPoint?.comune
    || 'Milano';

  let operationalCity = '';
  if (areaMode === 'radius') {
    const targetAddress = addressLabel || cityName;
    const nilSuffix = nilName ? ` — NIL ${nilName}` : '';
    const radiusPrefix = radiusKm ? `Raggio ${radiusKm} km da ` : 'Raggio da ';
    operationalCity = `${radiusPrefix}${targetAddress}${nilSuffix}`;
  } else if (areaMode === 'custom_zone') {
    operationalCity = nilName ? `${cityName} — NIL ${nilName}` : `${cityName} — Zone specifiche`;
  } else if (areaMode === 'cap') {
    const caps = Array.isArray(data.selectedCaps) ? data.selectedCaps : (Array.isArray(userSelections.selectedCaps) ? userSelections.selectedCaps : []);
    operationalCity = caps.length ? `${cityName} — CAP ${caps.join(', ')}` : `${cityName} — Selezione CAP`;
  } else {
    const comuniList = Array.isArray(data.selectedComuni) && data.selectedComuni.length
      ? data.selectedComuni.map(c => c.name || c.label).filter(Boolean)
      : (Array.isArray(data.municipalities) ? data.municipalities : [cityName]);
    operationalCity = comuniList.join(', ');
  }

  const rows = Array.isArray(data.zonesAllocation) && data.zonesAllocation.length
    ? data.zonesAllocation
    : (Array.isArray(truthModel?.allocation?.rows) && truthModel.allocation.rows.length
      ? truthModel.allocation.rows
      : (Array.isArray(truthModel?.zones?.rows) && truthModel.zones.rows.length
        ? truthModel.zones.rows
        : (Array.isArray(data.selZones) && data.selZones.length
          ? data.selZones
          : [])));

  const zoneNames = rows.map(r => r.name || r.label).filter(Boolean);

  const isRadius = areaMode === 'radius';
  const nilRows = rows.filter(r => r.isNil || r.territoryLevel === 'nil' || Boolean(r.nilCode) || Boolean(r.nil_code));
  const externalComuniRows = isRadius
    ? rows.filter(r => (!r.isNil && r.territoryLevel !== 'nil' && !r.nilCode && !r.nil_code) && (r.isComune || r.territoryLevel === 'comune' || r.type === 'comune' || (r.name && r.name !== cityName && nilRows.length > 0)))
    : [];

  let campaignAreas = '';
  if (isRadius && nilRows.length > 0 && externalComuniRows.length > 0) {
    campaignAreas = `${nilRows.length} NIL Milano + ${externalComuniRows.length} comuni limitrofi`;
  } else if (isRadius && nilRows.length > 0) {
    campaignAreas = `${nilRows.length} NIL Milano`;
  } else if (isRadius && externalComuniRows.length > 0) {
    campaignAreas = `${externalComuniRows.length} comuni limitrofi`;
  } else if (zoneNames.length > 0) {
    if (zoneNames.length <= 5) {
      campaignAreas = zoneNames.join(', ');
    } else {
      campaignAreas = `${zoneNames.slice(0, 5).join(', ')} (+ altri ${zoneNames.length - 5})`;
    }
  } else {
    campaignAreas = operationalCity;
  }

  const municipalities = Array.isArray(data.selectedComuni) && data.selectedComuni.length
    ? data.selectedComuni.map(c => c.name || c.label).filter(Boolean)
    : [cityName].filter(Boolean);

  return {
    operationalCity,
    campaignAreas,
    municipalities,
    areas: zoneNames.length ? zoneNames : [operationalCity],
    areaMode,
    radiusKm,
    addressLabel,
    nilName,
    zonesCount: zoneNames.length
  };
}

// `startDate` (ticket "CAMPAIGN FEASIBILITY PREFILL"): puramente descrittivo,
// mostrato in sola lettura tra i "Dati collegati alla campagna" — non entra
// mai negli input economici dell'engine (FIELDS in feasibilitySchemas.js non
// ha una chiave "startDate"), quindi non tocca calculateFeasibility.
export function feasibilityContext({
  referenceId,
  municipalities,
  quantity,
  service,
  serviceLabel,
  total,
  areas,
  startDate,
  operationalCity,
  campaignAreas,
  territoryDetails,
  areaMode,
  radiusKm,
  addressLabel,
  nilName,
  zonesCount,
} = {}) {
  const normMunicipalities = Array.isArray(municipalities) ? municipalities.filter(value => typeof value === 'string') : [];
  const normAreas = Array.isArray(areas) ? areas.filter(value => typeof value === 'string') : [];
  const humanService = serviceLabel || formatServiceLabel(service);

  return {
    referenceId: referenceId || null,
    municipalities: normMunicipalities,
    quantity: Number.isFinite(quantity) ? quantity : null,
    service: typeof service === 'string' ? service : null,
    serviceLabel: humanService || (typeof service === 'string' ? service : null),
    total: Number.isFinite(total) ? total : null,
    areas: normAreas,
    startDate: typeof startDate === 'string' && startDate ? startDate : null,
    operationalCity: typeof operationalCity === 'string' && operationalCity ? operationalCity : null,
    campaignAreas: typeof campaignAreas === 'string' && campaignAreas ? campaignAreas : null,
    territoryDetails: territoryDetails && typeof territoryDetails === 'object' ? territoryDetails : null,
    areaMode: typeof areaMode === 'string' ? areaMode : null,
    radiusKm: Number.isFinite(radiusKm) ? radiusKm : null,
    addressLabel: typeof addressLabel === 'string' ? addressLabel : null,
    nilName: typeof nilName === 'string' ? nilName : null,
    zonesCount: Number.isFinite(zonesCount) ? zonesCount : null,
  };
}

// `mode` (opzionale): 'business' | 'campaign' — quando presente, salta la
// schermata di scelta esplicita (FeasibilityModeChoice) e apre direttamente
// quel flusso, letto da feasibilityStorage.readFeasibility via
// history.state.feasibilityMode. Additivo: le chiamate esistenti senza
// `mode` (openFeasibility(), openFeasibility(draft, browser)) restano
// identiche — nessun campo feasibilityMode viene scritto.
//
// `source` (opzionale, ticket "CAMPAIGN FEASIBILITY PREFILL" §1): DICHIARA
// esplicitamente da dove arriva l'apertura — 'quote' (Step4, preventivo appena
// configurato), 'campaign' (dettaglio di una campagna esistente lato Cliente),
// 'dashboard', 'order'. MAI inferito da quali campi sono presenti nel
// `context` — è il chiamante (Step4FeasibilityCard, CampaignDashboardPage,
// ...) a dichiararlo, letto da feasibilityStorage via
// history.state.contextSource. Nessun valore = homepage/standalone (§1.A).
export function openFeasibility(context = null, browser = window, mode = null, source = null) {
  const state = { feasibility: context ? feasibilityContext(context) : null };
  if (mode === 'business' || mode === 'campaign') state.feasibilityMode = mode;
  if (['quote', 'campaign', 'dashboard', 'order'].includes(source)) state.contextSource = source;
  browser.history.pushState(state, '', FEASIBILITY_PATH);
  browser.dispatchEvent(new PopStateEvent('popstate', { state: browser.history.state }));
  browser.scrollTo({ top: 0 });
}
