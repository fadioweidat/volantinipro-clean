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
  selectedMunicipalityCodes = null
}) {
  const centerLat = Number(lat);
  const centerLng = Number(lng);
  const radiusKm = Number(radius);

  const normalized = normalizeMunicipalityCodes(selectedMunicipalityCodes);
  const canonicalCodes = normalized.canonical;

  const requestKey = [
    service || "",
    municipality || "",
    Number.isFinite(centerLat) ? centerLat.toFixed(6) : "NaN",
    Number.isFinite(centerLng) ? centerLng.toFixed(6) : "NaN",
    radiusKm,
    quantity || "",
    scope || "",
    analysisLevel || "",
    selectionScope || "",
    canonicalCodes
  ].join("|");

  const baseUrl = (typeof import.meta !== "undefined" && import.meta.env ? (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SUPABASE_URL) : null) ||
    (typeof process !== "undefined" && process.env ? (process.env.VITE_API_BASE_URL || process.env.VITE_SUPABASE_URL) : null);
    
  const endpoint = service === 'd2d' ? 'analysis-istat' : 'analysis-poi-search';
  
  const explicitUrl = (typeof import.meta !== "undefined" && import.meta.env ? (service === 'd2d' ? import.meta.env.VITE_ANALYSIS_ISTAT_URL : import.meta.env.VITE_ANALYSIS_POI_URL) : null) ||
    (typeof process !== "undefined" && process.env ? (service === 'd2d' ? process.env.VITE_ANALYSIS_ISTAT_URL : process.env.VITE_ANALYSIS_POI_URL) : null);
    
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
    url,
    canonicalCodes,
    apiUrl
  };
}
