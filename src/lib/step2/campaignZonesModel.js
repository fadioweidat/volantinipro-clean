// FASE 1 — STEP 2 MULTI-ZONE DATA INTEGRITY.
//
// Step2 gestisce gia' data.campaignZones[] (uno "slot" per zona, con la zona
// attiva specchiata nei campi top-level di `data`). Fino a questa fase
// Step4 / pricing / submit leggevano SOLO i campi top-level (= zona attiva):
// con 2+ zone le zone non attive venivano scartate in silenzio (riprodotto a
// runtime in produzione su c41b442: Zona 1 Monza 3 km + Zona 2 Rho 2 km ->
// Step4 "Rho, 14.559 pz", Monza assente).
//
// Questo modulo e' PURO (nessun React, nessuna rete): legge le zone gia'
// persistite da Step2 e produce
//  - lo snapshot KPI/capacita' canonico di una zona (salvato da Step2 sulla
//    zona attiva, cosi' le zone non attive restano quotabili);
//  - il riepilogo multi-zona (quantita' totale, fabbisogno, famiglie);
//  - il rilevamento delle sovrapposizioni tra zone (NESSUN dedup: la
//    capacita' sommata di zone sovrapposte e' dichiarata NON deduplicata);
//  - le righe {territory, quantity} per il motore prezzi, zona per zona;
//  - il payload campaignZones per submit-campaign-request, con ogni riga
//    attribuibile alla propria zona padre.
//
// Con UNA sola zona nulla di tutto questo viene usato: Step4 resta sul
// contratto single-zone di produzione (isMultiZone === false).

import { resolveConfiguratorDistributionZones } from "../pricing/resolveConfiguratorDistributionZones.js";
import { calculateMultiZoneDistributionPrice, roundMoney } from "../pricing/distributionPricing.js";
import { normalizeCoverageDecision } from "./addressIntent.js";

const EARTH_RADIUS_KM = 6371;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function haversineKm(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Snapshot KPI/capacita' minimo e deterministico della zona attiva.
 * Solo scalari canonici: niente oggetti transitori (apiData, geometrie).
 */
export function buildZoneKpiSnapshot({ serviceKpis = {}, requiredFlyers = null, finalFlyers = null, areaMode = null, analysisLevel = null, radiusCenter = null, radiusKm = null } = {}) {
  const kpis = serviceKpis || {};
  const center = radiusCenter && finite(radiusCenter.lat) !== null && finite(radiusCenter.lng) !== null
    ? { lat: Number(radiusCenter.lat), lng: Number(radiusCenter.lng), label: radiusCenter.label || null }
    : null;
  return {
    families: finite(kpis.families),
    population: finite(kpis.population ?? kpis.pop),
    area: finite(kpis.area),
    coverage: finite(kpis.coverage),
    recommendedFlyers: finite(kpis.recommendedFlyers),
    requiredFlyers: finite(requiredFlyers),
    finalFlyers: finite(finalFlyers),
    comuniCount: finite(kpis.comuniCount),
    analysisLevel: analysisLevel || kpis.analysisLevel || null,
    areaMode: areaMode || null,
    center,
    radiusKm: finite(radiusKm),
  };
}

/**
 * Quantita' di partenza di una zona AGGIUNTA: la quantita' campagna di Step1
 * (data.campaignBaseQuantity, registrata alla creazione della prima zona),
 * mai la quantita' finale della zona attiva (data.qty la segue). Fallback a
 * data.qty solo per draft creati prima di questa fase.
 */
export function resolveNewZoneStartingQuantity(data) {
  const base = finite(data?.campaignBaseQuantity);
  if (base !== null && base > 0) return Math.round(base);
  const legacy = finite(data?.qty);
  return legacy !== null && legacy > 0 ? Math.round(legacy) : 10000;
}

export function getCampaignZoneQuantity(zone) {
  const q = finite(zone?.finalFlyers) ?? finite(zone?.assigned_flyers);
  return q !== null && q > 0 ? Math.round(q) : 0;
}

export function getCampaignZoneAllocation(zone) {
  if (Array.isArray(zone?.allocation)) return zone.allocation;
  if (Array.isArray(zone?.zonesAllocation)) return zone.zonesAllocation;
  return [];
}

// FASE 2 — PUNTI VENDITA. Ogni campaignZone e' un punto vendita (PV): nessun
// modello locations[] parallelo. Il nome e' opzionale (store_name, gia'
// presente sull'oggetto zona) e non serve mai per calcolare il territorio.
export const STORE_NAME_MAX_LENGTH = 60;

/** Nome PV normalizzato: trim, spazi compressi, max STORE_NAME_MAX_LENGTH. "" se vuoto. */
export function sanitizeStoreName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, STORE_NAME_MAX_LENGTH).trim();
}

/** "Negozio Duomo" se impostato, altrimenti "Punto vendita N" (N = ordine mostrato). */
export function getPointOfSaleName(zone, index) {
  return sanitizeStoreName(zone?.store_name) || `Punto vendita ${index + 1}`;
}

function municipalityNames(zone) {
  const munis = Array.isArray(zone?.selectedMunicipalities) && zone.selectedMunicipalities.length
    ? zone.selectedMunicipalities
    : Array.isArray(zone?.selectedComuni) ? zone.selectedComuni : [];
  return munis.map(m => (typeof m === "string" ? m : m?.label || m?.name || "")).filter(Boolean);
}

function compactList(names, max = 2) {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

/**
 * Posizione leggibile del PV, solo da dati gia' presenti (mai un indirizzo
 * inventato): Raggio -> indirizzo/punto cercato o comune centro; Comune ->
 * comune/i; Milano NIL -> "Milano · NIL scelte"; CAP -> CAP. "" se ignota.
 */
export function getPointOfSaleLocation(zone) {
  if (!zone) return "";
  if (zone.searchMode === "cap") {
    const caps = Array.isArray(zone.selectedCaps) ? zone.selectedCaps : [];
    return caps.length ? (caps.length === 1 ? `CAP ${caps[0]}` : `${caps.length} CAP`) : "";
  }
  const city = zone.cityName || zone.city?.label || zone.city?.name || "";
  if (zone.searchMode === "address") {
    const point = zone.selectedSearchPoint?.label || zone.addressLabel || "";
    return String(point || city).split(",").slice(0, 2).join(",").trim();
  }
  const isNil = Boolean(zone.nilManualMode) || zone.kpiSnapshot?.areaMode === "custom_zone";
  if (isNil) {
    const nils = getCampaignZoneAllocation(zone).map(r => r?.name).filter(Boolean);
    return nils.length ? `${city || "Milano"} · ${compactList(nils)}` : city;
  }
  const names = municipalityNames(zone);
  if (names.length > 1) return compactList(names);
  return city || names[0] || "";
}

/** Modalita' territoriale leggibile: "Raggio 2 km" | "NIL / quartieri" | "Comune" | "CAP". */
export function getPointOfSaleModeLabel(zone) {
  if (zone?.searchMode === "address") {
    const r = finite(zone.radiusKm) ?? finite(zone.radius);
    return r ? `Raggio ${String(r).replace(".", ",")} km` : "Raggio";
  }
  if (zone?.searchMode === "cap") return "CAP";
  if (zone?.nilManualMode || zone?.kpiSnapshot?.areaMode === "custom_zone") return "NIL / quartieri";
  return municipalityNames(zone).length > 1 ? "Comuni" : "Comune";
}

/** Etichetta completa: "Negozio Duomo · Milano · BRUZZANO" / "Punto vendita 2 · Monza (MB)". */
export function getCampaignZoneLabel(zone, index) {
  const name = getPointOfSaleName(zone, index);
  const location = getPointOfSaleLocation(zone);
  return location ? `${name} · ${location}` : name;
}

/**
 * Zona attiva da selezionare dopo l'eliminazione di zoneId: deterministica.
 * Se si elimina un PV non attivo, l'attivo non cambia; se si elimina l'attivo
 * si passa al precedente (o al nuovo primo). null se l'operazione e' vietata
 * (ultimo PV o id inesistente).
 */
export function resolveDeletePointOfSale(campaignZones, activeZoneId, zoneId) {
  const zones = Array.isArray(campaignZones) ? campaignZones : [];
  const idx = zones.findIndex(z => z?.id === zoneId);
  if (idx === -1 || zones.length <= 1) return null;
  const remaining = zones.filter(z => z.id !== zoneId);
  const nextActiveId = activeZoneId === zoneId
    ? remaining[Math.max(0, idx - 1)].id
    : (remaining.some(z => z.id === activeZoneId) ? activeZoneId : remaining[0].id);
  return { campaignZones: remaining, activeZoneId: nextActiveId };
}

// ISOLAMENTO PV. Ogni campaignZone e' l'unica fonte del proprio territorio,
// indirizzo, modalita' e quantita'. Lo stato "di lavoro" top-level di Step2
// (city, raggio, punto, quantita', coverage.address...) rispecchia SEMPRE la
// zona attiva: attivarne una lo ricostruisce solo dai suoi dati, mai dal
// valore precedente (che apparteneva a un altro PV).

/** Campi top-level di lavoro per la zona attivata. `resolvedCity` = city risolta da Step2. */
export function buildActivePointOfSaleState(zone, { resolvedCity = null, fallbackQuantity = 10000 } = {}) {
  const qty = finite(zone?.assigned_flyers) ?? finite(zone?.finalFlyers) ?? fallbackQuantity;
  const radius = finite(zone?.radiusKm) ?? finite(zone?.radius) ?? 3;
  const svc = zone?.service_type || "d2d";
  const city = zone?.city || resolvedCity || null;
  return {
    activeZoneId: zone?.id || null,
    selectedService: svc,
    activeService: svc,
    type: svc,
    flyerFormat: zone?.service_variant || "a5",
    qty,
    flyerQuantity: qty,
    flyerQuantityFromStep1: qty,
    cityName: zone?.cityName || city?.label || city?.name || "",
    city,
    selectedComuni: zone?.selectedComuni || (city ? [city] : []),
    radius,
    radiusKm: radius,
    selectedRadius: radius,
    zones: zone?.selected || [],
    selectedSearchPoint: zone?.selectedSearchPoint || null,
    selectedCaps: zone?.selectedCaps || [],
    capDataMap: zone?.capDataMap || {},
    manualAssignments: zone?.manualAssignments || {},
    allocationMode: zone?.allocationMode || "auto",
    coverageDecision: normalizeCoverageDecision(zone?.coverageDecision),
    coverageStrategy: zone?.coverageStrategy || null,
    availableFlyers: finite(zone?.availableFlyers) ?? qty,
    manualFlyers: finite(zone?.manualFlyers) || null,
    finalFlyers: finite(zone?.finalFlyers) ?? qty,
    searchMode: zone?.searchMode || "municipality",
    nilManualMode: Boolean(zone?.nilManualMode),
    addressFullCoverageConfirmed: Boolean(zone?.addressFullCoverageConfirmed),
    startDate: zone?.startDate || "",
    endDate: zone?.endDate || "",
  };
}

/**
 * Attiva zoneId su `prev` (switch / aggiunta / elimina / idratazione):
 * stato top-level solo dalla zona, coverage.address compreso.
 * options.resolveCity(zone) -> city per zone salvate senza oggetto city.
 */
export function activatePointOfSale(prev, zoneId, { resolveCity } = {}) {
  const zones = Array.isArray(prev?.campaignZones) ? prev.campaignZones : [];
  const zone = zones.find(z => z?.id === zoneId);
  if (!zone) return prev;
  return {
    ...prev,
    ...buildActivePointOfSaleState(zone, {
      resolvedCity: zone.city ? null : (resolveCity ? resolveCity(zone) : null),
      fallbackQuantity: resolveNewZoneStartingQuantity(prev),
    }),
    coverage: { ...(prev.coverage || {}), address: resolvePointOfSaleCoverageAddress(zone, zones, prev.coverage) },
  };
}

/** Elimina zoneId e attiva atomicamente il PV superstite. null se vietato (ultimo PV / id inesistente). */
export function deleteAndActivatePointOfSale(prev, zoneId, options = {}) {
  const result = resolveDeletePointOfSale(prev?.campaignZones, prev?.activeZoneId, zoneId);
  if (!result) return null;
  return activatePointOfSale({ ...prev, campaignZones: result.campaignZones }, result.activeZoneId, options);
}

/**
 * Indirizzo di copertura del PV attivo: SOLO il suo. Il valore top-level e'
 * ammesso come fallback esclusivamente con un solo PV (bozze legacy senza
 * coverage per zona), mai con piu' PV.
 */
export function resolvePointOfSaleCoverageAddress(activeZone, campaignZones, topLevelCoverage) {
  if (activeZone?.coverage?.address) return activeZone.coverage.address;
  const zoneCount = Array.isArray(campaignZones) ? campaignZones.length : 0;
  if (zoneCount <= 1) return topLevelCoverage?.address || null;
  return null;
}

/**
 * L'analisi territoriale (useServiceAnalysis) non porta l'identita' del PV:
 * dopo switch / elimina / aggiungi / rimontaggio `data` e' ancora quella del
 * territorio precedente. Il PV attivo la "adotta" solo quando e' idratato
 * (localZoneId), e' passato almeno un ciclo dopo l'idratazione (armedZoneId)
 * e la risposta corrisponde alla sua richiesta corrente (dataKey === fetchKey).
 * Senza richiesta valida (fetchKey vuoto, es. PV vuoto o CAP) non c'e' dato
 * da attendere: si adotta subito, ma il dato non va usato (vedi Step2).
 */
export function shouldAdoptZoneAnalysis({ localZoneId, activeZoneId, armedZoneId, fetchKey, dataKey, loading }) {
  if (!activeZoneId || localZoneId !== activeZoneId || armedZoneId !== activeZoneId) return false;
  if (!fetchKey) return true;
  return !loading && dataKey === fetchKey;
}

/**
 * Prossimo proprietario dell'analisi { zoneId, dataKey }. La proprieta' e'
 * legata anche all'IDENTITA' del dato: un PV adottato senza richiesta
 * (fetchKey vuoto, es. PV appena aggiunto) non possiede il dato residuo di un
 * altro PV quando poi riceve un territorio. Ritorna `owner` invariato se non
 * cambia nulla.
 */
export function nextZoneAnalysisOwner(owner, { localZoneId, activeZoneId, armedZoneId, fetchKey, dataKey, loading }) {
  const current = owner || { zoneId: null, dataKey: null };
  if (current.zoneId !== activeZoneId) {
    if (!shouldAdoptZoneAnalysis({ localZoneId, activeZoneId, armedZoneId, fetchKey, dataKey, loading })) return current;
    return { zoneId: activeZoneId, dataKey: fetchKey ? dataKey : null };
  }
  // Stesso PV: registra la nuova risposta della SUA richiesta corrente.
  if (localZoneId === activeZoneId && fetchKey && !loading && dataKey === fetchKey && current.dataKey !== dataKey) {
    return { zoneId: activeZoneId, dataKey };
  }
  return current;
}

/**
 * Il dato dell'analisi e' utilizzabile per il PV attivo solo se: il PV ne e'
 * proprietario ed e' idratato, esiste una richiesta valida, e il dato e'
 * quello adottato (stale-while-revalidate dello STESSO PV) oppure e'
 * esattamente la risposta alla richiesta corrente del PV (dopo l'armamento).
 */
export function isZoneAnalysisDataUsable({ owner, localZoneId, activeZoneId, armedZoneId, fetchKey, dataKey }) {
  if (!owner || !activeZoneId || owner.zoneId !== activeZoneId || localZoneId !== activeZoneId) return false;
  if (!fetchKey || !dataKey) return false;
  if (owner.dataKey && dataKey === owner.dataKey) return true;
  return armedZoneId === activeZoneId && dataKey === fetchKey;
}

function hasTerritory(zone) {
  if (zone?.searchMode === "cap") return Array.isArray(zone?.selectedCaps) && zone.selectedCaps.length > 0;
  return Boolean(zone?.city) || (Array.isArray(zone?.selectedComuni) && zone.selectedComuni.length > 0);
}

/**
 * Una zona e' quotabile solo se e' stata validata in Step2 mentre era attiva
 * (readyForQuote === true, scritto da Step2 con lo stesso gate di
 * canContinueCalendar) e porta territorio + quantita' reali.
 */
export function getCampaignZoneIssues(zone) {
  const issues = [];
  if (!hasTerritory(zone)) issues.push("territorio_mancante");
  if (getCampaignZoneQuantity(zone) <= 0) issues.push("quantita_mancante");
  if (zone?.readyForQuote !== true) issues.push("configurazione_non_confermata");
  return issues;
}

function zoneCenter(zone) {
  const snap = zone?.kpiSnapshot?.center;
  if (snap && finite(snap.lat) !== null && finite(snap.lng) !== null) return { lat: Number(snap.lat), lng: Number(snap.lng) };
  const sp = zone?.selectedSearchPoint;
  if (zone?.searchMode === "address" && sp && finite(sp.lat) !== null && finite(sp.lng) !== null) return { lat: Number(sp.lat), lng: Number(sp.lng) };
  const c = zone?.city;
  if (c && finite(c.lat) !== null && finite(c.lng) !== null) return { lat: Number(c.lat), lng: Number(c.lng) };
  return null;
}

function isRadiusZone(zone) {
  return zone?.searchMode === "address" && (finite(zone?.radiusKm) ?? finite(zone?.radius) ?? 0) > 0;
}

function territorialUnitKeys(zone) {
  const keys = new Set();
  for (const row of getCampaignZoneAllocation(zone)) {
    const code = row?.nil_code ?? row?.nilCode ?? null;
    if (code !== null && code !== undefined && code !== "") keys.add(`nil:${normalizeKey(code)}`);
    else if (row?.name) keys.add(`name:${normalizeKey(row.name)}`);
  }
  if (zone?.searchMode === "cap") for (const cap of zone?.selectedCaps || []) keys.add(`cap:${cap}`);
  return keys;
}

/**
 * Sovrapposizioni tra zone. NON calcola un'unione: segnala soltanto.
 *  - Raggio vs Raggio: geometrico (distanza centri < r1 + r2) -> "certain".
 *  - Altri casi: unita' territoriali condivise (NIL / comune / CAP) nelle
 *    righe di allocazione -> "possible" (la parte condivisa puo' essere
 *    parziale, es. un raggio che tocca un comune selezionato per intero).
 */
export function detectCampaignZoneOverlaps(zones) {
  const list = Array.isArray(zones) ? zones : [];
  const overlaps = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (isRadiusZone(a) && isRadiusZone(b)) {
        const ca = zoneCenter(a);
        const cb = zoneCenter(b);
        if (ca && cb) {
          const ra = finite(a.radiusKm) ?? finite(a.radius);
          const rb = finite(b.radiusKm) ?? finite(b.radius);
          const distanceKm = haversineKm(ca, cb);
          if (distanceKm < ra + rb) {
            overlaps.push({ zoneAId: a.id, zoneBId: b.id, kind: "radius_geometry", certainty: "certain", distanceKm: Math.round(distanceKm * 100) / 100, sharedUnits: [] });
          }
          continue;
        }
      }
      const ka = territorialUnitKeys(a);
      const shared = [...territorialUnitKeys(b)].filter(k => ka.has(k));
      if (shared.length) {
        overlaps.push({ zoneAId: a.id, zoneBId: b.id, kind: "shared_territory", certainty: "possible", distanceKm: null, sharedUnits: shared.map(k => k.split(":").slice(1).join(":")) });
      }
    }
  }
  return overlaps;
}

function sumOrNull(values) {
  const nums = values.map(finite);
  if (nums.some(v => v === null)) return null;
  return nums.reduce((a, v) => a + v, 0);
}

/**
 * Riepilogo campagna multi-zona. isMultiZone e' true SOLO con 2+ zone:
 * con una zona Step4 deve restare sul contratto single-zone.
 */
export function summarizeCampaignZones(campaignZones) {
  const raw = Array.isArray(campaignZones) ? campaignZones.filter(Boolean) : [];
  const zones = raw.map((zone, index) => {
    const snap = zone.kpiSnapshot || {};
    const allocation = getCampaignZoneAllocation(zone);
    const allocatedRequired = allocation.length ? allocation.reduce((a, r) => a + (finite(r?.requiredFlyers) ?? 0), 0) : null;
    return {
      id: zone.id,
      index,
      label: getCampaignZoneLabel(zone, index),
      name: getPointOfSaleName(zone, index),
      location: getPointOfSaleLocation(zone),
      modeLabel: getPointOfSaleModeLabel(zone),
      searchMode: zone.searchMode || "municipality",
      radiusKm: isRadiusZone(zone) ? finite(zone.radiusKm) ?? finite(zone.radius) : null,
      center: zoneCenter(zone),
      quantity: getCampaignZoneQuantity(zone),
      requiredFlyers: finite(snap.requiredFlyers) ?? finite(zone.recommendedFlyers) ?? finite(zone.recommended_flyers) ?? allocatedRequired,
      families: finite(snap.families),
      population: finite(snap.population),
      allocation,
      issues: getCampaignZoneIssues(zone),
      source: zone,
    };
  });
  const overlaps = detectCampaignZoneOverlaps(raw);
  const incompleteZones = zones.filter(z => z.issues.length > 0);
  const hasOverlap = overlaps.length > 0;
  return {
    isMultiZone: zones.length > 1,
    zoneCount: zones.length,
    zones,
    incompleteZones,
    allZonesReady: zones.length > 0 && incompleteZones.length === 0,
    totalQuantity: zones.reduce((a, z) => a + z.quantity, 0),
    totalRequiredFlyers: sumOrNull(zones.map(z => z.requiredFlyers)),
    totalFamilies: sumOrNull(zones.map(z => z.families)),
    totalPopulation: sumOrNull(zones.map(z => z.population)),
    overlaps,
    hasOverlap,
    // Mai dedup in Fase 1: la somma e' esatta solo se le zone sono disgiunte.
    capacityDeduplicated: false,
    capacityStatus: hasOverlap ? "overlap_not_deduplicated" : "disjoint_sum",
  };
}

/**
 * Righe {territory, quantity} per calculateQuotePricing: ogni zona viene
 * risolta con lo stesso resolver single-zone di produzione e poi concatenata
 * (prezzo = somma dei prezzi di zona, mai la tariffa di una zona sola).
 */
export function buildMultiZoneDistributionZones(summary) {
  const zones = summary?.zones || [];
  return zones.flatMap(z => {
    const zone = z.source || {};
    return resolveConfiguratorDistributionZones({
      selectedComuni: zone.selectedComuni || zone.selectedMunicipalities || [],
      zonesAllocation: z.allocation,
      cityName: zone.cityName,
      searchedLocation: zone.addressLabel || null,
    }, z.quantity).zones;
  });
}

function rowName(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.label || value.name || value.comune_name || "";
}

/**
 * Payload campaignZones per submit-campaign-request: tutte le righe di
 * allocazione di tutte le zone, ognuna con la zona padre
 * (campaign_zone_id / campaign_zone_label / campaign_zone_index). Stesse
 * regole di mappatura del ramo single-zone di Step4.
 */
export function buildMultiZoneCampaignZonesPayload(summary) {
  const out = [];
  let priority = 1;
  for (const z of summary?.zones || []) {
    const zone = z.source || {};
    const isRadius = z.searchMode === "address";
    const radiusMeters = isRadius && z.radiusKm ? Math.round(z.radiusKm * 1000) : null;
    const center = z.center;
    const sp = zone.selectedSearchPoint;
    const addressLabel = sp?.label || zone.addressLabel || null;
    const parent = zone.cityName || rowName(zone.city) || null;
    const isNilLevel = zone.kpiSnapshot?.analysisLevel === "nil";
    const owner = { campaign_zone_id: z.id, campaign_zone_label: z.label, campaign_zone_index: z.index, campaign_zone_mode: z.searchMode, campaign_zone_name: z.name, campaign_zone_location: z.location || null, store_name: sanitizeStoreName(zone.store_name) || null };
    const rows = z.allocation.length ? z.allocation : null;
    if (rows) {
      for (const r of rows) {
        const lat = finite(r.lat ?? r.centerLat) ?? (center ? center.lat : null);
        const lng = finite(r.lng ?? r.centerLng) ?? (center ? center.lng : null);
        out.push({
          municipality: rowName(r.name) || z.label,
          quantity: finite(r.assignedFlyers ?? r.requiredFlyers) || 0,
          priority: priority++,
          lat,
          lng,
          radius_m: finite(r.radius_m) ?? radiusMeters,
          territory_type: r.territory_type || (isRadius ? "radius" : (isNilLevel || r.isNil ? "nil" : "comune")),
          parent_municipality: r.parent_municipality || parent,
          address_label: r.address_label || addressLabel,
          polygon_geojson: r.polygon_geojson || r.geometry || r.geometry_geojson || null,
          ...owner,
        });
      }
    } else {
      out.push({
        municipality: parent || z.label,
        quantity: z.quantity,
        priority: priority++,
        lat: center ? center.lat : null,
        lng: center ? center.lng : null,
        radius_m: radiusMeters,
        territory_type: isRadius ? "radius" : (isNilLevel ? "nil" : "comune"),
        parent_municipality: parent,
        address_label: addressLabel,
        polygon_geojson: null,
        ...owner,
      });
    }
  }
  return out;
}

/** Righe di allocazione appiattite per Step4 (breakdown/PDF), con zona padre. */
export function flattenMultiZoneAllocation(summary) {
  return (summary?.zones || []).flatMap(z => z.allocation.map(r => ({
    ...r,
    id: `${z.id}::${r.id ?? rowName(r.name)}`,
    campaignZoneId: z.id,
    campaignZoneLabel: z.label,
  })));
}

/** Metadata leggibile per il payload campagna (nessuna colonna DB nuova). */
export function buildMultiZoneMetadata(summary) {
  return {
    zone_count: summary.zoneCount,
    total_quantity: summary.totalQuantity,
    total_required_flyers: summary.totalRequiredFlyers,
    total_families: summary.totalFamilies,
    capacity_deduplicated: false,
    capacity_status: summary.capacityStatus,
    overlaps: summary.overlaps,
    zones: summary.zones.map(z => ({
      id: z.id,
      label: z.label,
      name: z.name,
      store_name: sanitizeStoreName(z.source?.store_name) || null,
      location_label: z.location || null,
      mode_label: z.modeLabel,
      search_mode: z.searchMode,
      radius_km: z.radiusKm,
      center: z.center,
      quantity: z.quantity,
      required_flyers: z.requiredFlyers,
      families: z.families,
      population: z.population,
    })),
  };
}

/**
 * Prezzo distribuzione per PV con lo STESSO motore della campagna
 * (resolveConfiguratorDistributionZones + calculateMultiZoneDistributionPrice):
 * la somma dei PV coincide per costruzione con il baseCost di Step4. La UI
 * mostra questi valori, non li ricalcola.
 */
export function buildPointOfSalePricing(summary) {
  const zones = summary?.zones || [];
  const rows = zones.map(z => {
    const single = { zones: [z] };
    const price = calculateMultiZoneDistributionPrice(buildMultiZoneDistributionZones(single)).distributionSubtotal;
    return { id: z.id, distributionPrice: price };
  });
  return { rows, distributionTotal: roundMoney(rows.reduce((a, r) => a + (r.distributionPrice || 0), 0)) };
}
