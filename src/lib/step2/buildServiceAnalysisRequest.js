import { normalizeMunicipalityCodes } from "./normalizeMunicipalityCodes.js";

export function buildServiceAnalysisRequest({
  lat,
  lng,
  radius,
  service,
  municipality = null,
  quantity = null,
  scope = null,
  analysisLevel = null,
  selectionScope = null,
  selectedMunicipalityCodes = null,
  targetSelection = null
}) {
  const centerLat = Number(lat);
  const centerLng = Number(lng);
  const radiusKm = Number(radius);

  const normalized = normalizeMunicipalityCodes(selectedMunicipalityCodes);
  const canonicalCodes = normalized.canonical;

  const targetKey = Array.isArray(targetSelection)
    ? [...targetSelection].filter(Boolean).sort().join('|')
    : String(targetSelection || '');

  const latKey = Number.isFinite(centerLat) ? centerLat.toFixed(6) : "NaN";
  const lngKey = Number.isFinite(centerLng) ? centerLng.toFixed(6) : "NaN";

  const requestKey = [
    service || "",
    municipality || "",
    latKey,
    lngKey,
    radiusKm,
    quantity || "",
    scope || "",
    analysisLevel || "",
    selectionScope || "",
    canonicalCodes,
    targetKey
  ].join("|");

  // `fetchKey` — identita' della RICHIESTA territoriale vera e propria: solo i
  // campi che cambiano la risposta di analysis-istat / analysis-poi-search
  // (quelli effettivamente messi nell'URL sotto), coordinate gia' quantizzate
  // a 6 decimali (~0.1 m). Esclude di proposito:
  //  - `quantity`: non cambia famiglie/popolazione/breakdown, riscala solo una
  //    stima di volantini che il client ricalcola comunque. Era in `requestKey`
  //    e creava un loop: fetch -> scrittura recommended flyers nella zona ->
  //    quantityForAnalysis cambia -> refetch -> ... (debounce che non si
  //    stabilizza mai, apiPending perennemente true).
  //  - `scope` (data.activeZoneId) e `targetKey`: non finiscono nell'URL, quindi
  //    generavano refetch a parita' di richiesta reale.
  // Il debounce/dedup/settle del hook si basa su QUESTA chiave: parametri
  // Cormano stabili => fetchKey stabile => una sola richiesta.
  const fetchKey = [
    service || "",
    municipality || "",
    latKey,
    lngKey,
    radiusKm,
    analysisLevel || "",
    selectionScope || "",
    canonicalCodes
  ].join("|");

  let baseUrl = null;
  let explicitUrl = null;
  try {
    baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SUPABASE_URL;
    explicitUrl = service === 'd2d' ? import.meta.env.VITE_ANALYSIS_ISTAT_URL : import.meta.env.VITE_ANALYSIS_POI_URL;
  } catch (e) {
    if (typeof process !== "undefined" && process.env) {
      baseUrl = process.env.VITE_API_BASE_URL || process.env.VITE_SUPABASE_URL;
      explicitUrl = service === 'd2d' ? process.env.VITE_ANALYSIS_ISTAT_URL : process.env.VITE_ANALYSIS_POI_URL;
    }
  }

  const endpoint = service === 'd2d' ? 'analysis-istat' : 'analysis-poi-search';
  const functionUrl = baseUrl ? `${baseUrl}/functions/v1/${endpoint}` : null;
  const apiUrl = explicitUrl || functionUrl;

  const municipalityParam = municipality ? `&municipality=${encodeURIComponent(municipality)}` : '';
  const quantityParam = quantity ? `&quantity=${encodeURIComponent(quantity)}` : '';
  const analysisLevelParam = analysisLevel ? `&analysisLevel=${encodeURIComponent(analysisLevel)}` : '';
  const selectionScopeParam = selectionScope ? `&selectionScope=${encodeURIComponent(selectionScope)}` : '';
  const selectedCodesParam = canonicalCodes ? `&selectedMunicipalityCodes=${encodeURIComponent(canonicalCodes)}` : '';
  
  const url = apiUrl
    ? `${apiUrl}?lat=${encodeURIComponent(centerLat)}&lng=${encodeURIComponent(centerLng)}&radius=${encodeURIComponent(radiusKm)}&service=${encodeURIComponent(service || "d2d")}${municipalityParam}${quantityParam}${analysisLevelParam}${selectionScopeParam}${selectedCodesParam}`
    : null;

  return {
    requestKey,
    fetchKey,
    url,
    canonicalCodes,
    apiUrl
  };
}
