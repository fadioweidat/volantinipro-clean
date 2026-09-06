import { GEO_DATA } from "../geoData.js";

export function apiToZones(apiData, city) {
  if (import.meta.env?.DEV) {
    console.debug('[DBG apiToZones normalized]', apiData ? {
      error: apiData.error,
      hasValues: !!apiData.values,
      breakdownLen: apiData.comuni_breakdown?.length,
      firstKeys: apiData.comuni_breakdown?.[0] ? Object.keys(apiData.comuni_breakdown[0]) : []
    } : null);
  }
  if (!apiData || apiData.error || !apiData.values) return null;
  const v = apiData.values;
  const analysisLevel = apiData.metadata?.analysis_level || apiData.values?.analysis_level || "comune";
  const breakdown = analysisLevel === "nil" && Array.isArray(apiData.nil_breakdown) && apiData.nil_breakdown.length ? apiData.nil_breakdown : apiData.comuni_breakdown || [];
  const totF = v.famiglie_stimate || v.families || v.households || 0;
  const totP = v.popolazione_stimata || v.population || 0;
  const totV = v.volantini_consigliati || v.volantini_stimati || v.recommended_flyers || 0;
  // Without a territorial breakdown there is no real geometry or territorial
  // row to put on the map. Returning an empty result makes the UI expose
  // "Dato non disponibile" instead of manufacturing a generic area.
  if (breakdown.length === 0) return [];
  const nC = breakdown.length;
  const items = breakdown;
  // Alias tolleranti sui nomi di campo delle righe breakdown: analysis-istat e
  // frontend possono divergere ("comune" vs "comune_name", "istat_code" vs
  // "comune_code", "famiglie_stimate" vs "households_*", ...). Se il nome del
  // comune non viene letto la riga diventa "Zona N" e il match single-comune in
  // zonesInRadius fallisce -> zone vuote. `firstNum` = primo valore numerico
  // finito > 0 tra piu' alias.
  const firstStr = (...vals) => {
    for (const val of vals) {
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return null;
  };
  const firstNum = (...vals) => {
    for (const val of vals) {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };
  return items.map((c, idx) => {
    const territoryLevel = c.territory_level || analysisLevel;
    const isNil = territoryLevel === "nil";
    const territoryName = firstStr(
      c.nil_name, c.comune_name, c.municipality_name, c.comune, c.municipality,
      c.name, c.nome, c.nome_comune, c.denominazione, c.denominazione_comune,
      c.label, c.city
    ) || `Zona ${idx + 1}`;
    const territoryCode = firstStr(
      c.nil_code, c.comune_code, c.municipality_code, c.istat_code, c.codice_istat,
      c.cod_istat, c.pro_com, c.pro_com_t, c.comuneCode, c.municipalityCode, c.code
    );
    const pct = firstNum(
      c.pct_copertura, c.percentuale, c.pct, c.percentuale_copertura,
      c.coverage_pct, c.copertura, c.share, c.weight
    ) || Math.round(100 / nC);
    const ratio = pct / 100;
    // Use per-municipality values when available (more accurate than total * ratio)
    const vol = firstNum(
      c.volantini_nel_raggio, c.volantini_stimati, c.recommended_flyers,
      c.volantini_consigliati, c.volantini, c.flyers, c.flyers_recommended
    ) || Math.round(totV * ratio);
    const famRaw = firstNum(
      c.households_in_radius, c.famiglie_nel_raggio,
      c.households_total, c.households, c.families, c.famiglie, c.famiglie_stimate,
      c.nuclei_familiari, c.households_estimated
    );
    const fam = c.households_in_radius > 0 ? Math.round(c.households_in_radius)
      : c.households_total > 0 ? Math.round(c.households_total * ratio)
      : famRaw > 0 ? Math.round(famRaw)
      : Math.round(vol / 1.1);
    const popRaw = firstNum(
      c.population_in_radius, c.popolazione_nel_raggio,
      c.population_total, c.population, c.popolazione, c.popolazione_stimata,
      c.residenti, c.abitanti, c.population_estimated
    );
    const pop = c.population_in_radius > 0 ? Math.round(c.population_in_radius)
      : c.population_total > 0 ? Math.round(c.population_total * ratio)
      : popRaw > 0 ? Math.round(popRaw)
      : Math.round(totP * ratio);
    const ri = v.reach_score || 70,
      ro = v.roi_score || 70,
      co = v.confidence_score || 75,
      fi = v.family_index || 70;
    const area = c.area_km2 > 0 ? Math.round(c.area_km2 * ratio * 10) / 10 : Math.round((v.area_km2 || 0) * ratio * 10) / 10;
    return {
      id: `${isNil ? "nil" : "api"}_${idx}_${String(territoryCode || territoryName).toLowerCase().replace(/\s+/g, '_')}`,
      name: territoryName,
      territoryLevel,
      isNil,
      nilCode: c.nil_code || null,
      municipality_code: (isNil ? null : territoryCode) || c.comune_code || c.municipality_code || null,
      area,
      pop,
      families: fam,
      mailboxes: Math.round(fam * 0.93),
      coverage: pct,
      volantiniNelRaggio: Math.round(vol),
      familiesInRadius: fam,
      flyersMin: Math.round(vol),
      flyersMax: Math.round(vol * 1.1),
      operDays: Math.max(1, Math.ceil(vol / 4000)),
      familyIdx: fi,
      reachD2D: ri,
      roiD2D: ro,
      confD2D: co,
      eta14: null,
      eta34: null,
      eta64: null,
      eta65: null,
      genderM: 49,
      genderF: 51,
      stranieri: null,
      indVec: c.old_age_index ?? null,
      densita: c.density_per_km2 > 0 ? Math.round(c.density_per_km2) : Math.round(pop / Math.max(0.1, area || 1)),
      reddito: c.average_income ?? null,
      occup: null,
      imprese: c.businesses_total ?? null,
      areaType: isNil ? 'NIL Milano' : 'Territoriale',
      poi: 0,
      nearbyBiz: 0,
      commDens: Math.min(100, Math.round(fi * 0.72)),
      flowScore: Math.min(100, Math.round(ri * 0.82)),
      transitStops: Math.max(2, Math.round((v.area_km2 || 5) * ratio * 2)),
      trainStations: 0,
      operDaysH2H: Math.max(1, Math.ceil(vol / 8000)),
      reachH2H: Math.round(ri * 0.85),
      roiH2H: Math.round(ro * 0.8),
      confH2H: Math.round(co * 0.85),
      hotspots: territoryName,
      timeSlots: null,
      strongPts: 0,
      bizTotal: 0,
      competitors: 0,
      commDensB2B: Math.min(100, Math.round(fi * 0.65)),
      operDaysB2B: Math.max(1, Math.ceil(vol / 10000)),
      cdIdx: Math.min(100, Math.round(fi * 0.65)),
      reachB2B: Math.round(ri * 0.8),
      roiB2B: Math.round(ro * 0.75),
      confB2B: Math.round(co * 0.8),
      clusters: Math.max(1, Math.round((area || 0) / 3)),
      topCats: null,
      targetBiz: 0,
      strongZone: territoryName,
      dist: {},
      geometry_geojson: pickRealComuneGeometry(c),
      geometry: pickRealComuneGeometry(c),
      source_flags: isNil ? ['NIL ufficiale Comune di Milano', 'ISTAT ripartito su geometria'] : []
    };
  });
}

export function capToZone(capData, idx) {
  const fam = Math.round(Number(capData.households_estimated) || 0);
  const pop = Math.round(Number(capData.population_estimated) || 0);
  const area = Math.round((Number(capData.area_km2) || 0) * 10) / 10;
  const vol = Math.round(Number(capData.recommended_flyers) || fam * 1.05);
  return {
    id: `cap_${capData.postal_code}`,
    name: `CAP ${capData.postal_code}`,
    isCap: true,
    postalCode: capData.postal_code,
    municipalityName: capData.municipality_name,
    area,
    pop,
    families: fam,
    mailboxes: Math.round(fam * 0.93),
    coverage: 100,
    volantiniNelRaggio: Math.round(vol),
    familiesInRadius: fam,
    flyersMin: Math.round(vol),
    flyersMax: Math.round(vol * 1.05),
    operDays: Math.max(1, Math.ceil(vol / 4000)),
    familyIdx: 75,
    reachD2D: 80,
    roiD2D: 75,
    confD2D: 85,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 49,
    genderF: 51,
    stranieri: 10,
    indVec: 170,
    densita: area > 0 ? Math.round(pop / area) : 0,
    reddito: 25000,
    occup: 65,
    imprese: Math.round(fam * 0.06),
    areaType: 'Residenziale (CAP)',
    poi: Math.round(fam / 70),
    nearbyBiz: Math.round(fam / 150),
    commDens: 70,
    flowScore: 75,
    transitStops: Math.max(2, Math.round(area * 3)),
    trainStations: 0,
    operDaysH2H: Math.max(1, Math.ceil(vol / 8000)),
    reachH2H: 82,
    roiH2H: 78,
    confH2H: 80,
    hotspots: 'Centro CAP',
    timeSlots: '08-12  14-18',
    strongPts: 4,
    bizTotal: Math.round(fam * 0.05),
    competitors: Math.max(1, Math.round(fam * 0.003)),
    commDensB2B: 72,
    operDaysB2B: Math.max(1, Math.ceil(vol / 10000)),
    cdIdx: 72,
    reachB2B: 78,
    roiB2B: 75,
    confB2B: 82,
    clusters: Math.max(1, Math.round(area / 2)),
    topCats: 'Retail  Food  Servizi',
    targetBiz: Math.round(fam * 0.03),
    strongZone: 'Centro CAP',
    dist: {},
    geometry_geojson: pickRealComuneGeometry(capData),
    source_flags: capData.source_flags || ['Stima territoriale']
  };
}

export function getZoneCoords(z, city, idx, total) {
  const geo = GEO_DATA.find(c => c.id === z.id);
  if (geo) return geo;
  if (!city) return null;
  const angle = idx / Math.max(1, total) * 2 * Math.PI - Math.PI / 2;
  const d = 0.012 + idx % 3 * 0.007;
  return {
    lat: city.lat + Math.sin(angle) * d,
    lng: city.lng + Math.cos(angle) * d * 1.4
  };
}

export function pickRealComuneGeometry(z) {
  const geomRaw = z?.geometry_geojson || z?.geometry || z?.geojson || z?.geom || z?.feature?.geometry || null;
  if (!geomRaw) return null;
  if (typeof geomRaw === 'object') return geomRaw;
  try {
    const first = JSON.parse(geomRaw);
    if (typeof first === 'string') {
      const s = first.trim();
      if (s.startsWith('{') && s.endsWith('}') || s.startsWith('[') && s.endsWith(']')) {
        return JSON.parse(s);
      }
    }
    return first;
  } catch {
    return null;
  }
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
