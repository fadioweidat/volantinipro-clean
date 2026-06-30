// Layer panel config is the authoritative source of truth — derives from service-config.js.
// All other exports (DATA_SOURCES, source helpers) remain unchanged.
import { SERVICE_LAYERS, defaultLayersForService } from './services/service-config.js';

export const SERVICE_IDS = {
  D2D: "d2d",
  H2H: "h2h",
  B2B: "b2b",
};

export const DATA_SOURCES = [
  {
    id: "mapbox",
    label: "Mapbox",
    provider: "Mapbox",
    enabled: Boolean(import.meta.env.VITE_MAPBOX_TOKEN),
    requiredEnv: ["VITE_MAPBOX_TOKEN"],
    usedByServices: [SERVICE_IDS.D2D, SERVICE_IDS.H2H, SERVICE_IDS.B2B],
    description: "Geocoding, map navigation, address/area search.",
  },
  {
    id: "istat",
    label: "ISTAT",
    provider: "ISTAT",
    enabled: true,
    requiredEnv: ["VITE_ANALYSIS_ISTAT_URL"],
    usedByServices: [SERVICE_IDS.D2D],
    description: "Population, families, demographic indicators, residential analysis.",
  },
  {
    id: "postgis",
    label: "Dati geografici / PostGIS",
    provider: "Supabase PostGIS",
    enabled: true,
    requiredEnv: ["VITE_ANALYSIS_ISTAT_URL", "VITE_ANALYSIS_POI_URL"],
    usedByServices: [SERVICE_IDS.D2D, SERVICE_IDS.H2H, SERVICE_IDS.B2B],
    description: "Radius analysis, area coverage, municipalities in radius, spatial intersections.",
  },
  {
    id: "google_places",
    label: "Google Places",
    provider: "Google",
    enabled: false,
    requiredEnv: ["VITE_ANALYSIS_POI_URL"],
    usedByServices: [SERVICE_IDS.H2H, SERVICE_IDS.B2B],
    description: "POI, activities, categories, local places.",
  },
  {
    id: "foursquare",
    label: "Foursquare",
    provider: "Foursquare",
    enabled: false,
    requiredEnv: ["VITE_ANALYSIS_POI_URL"],
    usedByServices: [SERVICE_IDS.H2H, SERVICE_IDS.B2B],
    description: "Commercial activities, categories, clusters, business context.",
  },
  {
    id: "overpass",
    label: "OpenStreetMap / Overpass",
    provider: "OpenStreetMap",
    enabled: false,
    requiredEnv: ["VITE_ANALYSIS_POI_URL"],
    usedByServices: [SERVICE_IDS.D2D, SERVICE_IDS.H2H, SERVICE_IDS.B2B],
    description: "POI, streets, urban context, landuse, public amenities.",
  },
  {
    id: "gtfs",
    label: "GTFS / Trasporto pubblico",
    provider: "GTFS",
    enabled: false,
    requiredEnv: ["VITE_ANALYSIS_POI_URL"],
    usedByServices: [SERVICE_IDS.H2H],
    description: "Stops, stations, mobility, public transport anchors.",
  },
  {
    id: "omi",
    label: "Agenzia Entrate - OMI",
    provider: "Agenzia Entrate - OMI",
    enabled: false,
    requiredEnv: ["VITE_ANALYSIS_POI_URL"],
    usedByServices: [SERVICE_IDS.D2D, SERVICE_IDS.B2B],
    description: "Official real estate value ranges by municipality and OMI zone.",
  },
  {
    id: "internal_scoring",
    label: "Analisi interna",
    provider: "VolantiniPro",
    enabled: true,
    usedByServices: [SERVICE_IDS.D2D, SERVICE_IDS.H2H, SERVICE_IDS.B2B],
    description: "Commercial Density, Indice di residenzialità, Reach, ROI, Confidence, area intensity.",
  },
];

const SOURCE_ALIASES = {
  Backend: "Analisi interna",
  "Backend scoring": "Analisi interna",
  "Calc.": "Analisi interna",
  GIS: "Dati geografici / PostGIS",
  "GIS/PostGIS": "Dati geografici / PostGIS",
  "Dati geografici": "Dati geografici / PostGIS",
  GTFS: "GTFS / Trasporto pubblico",
  "GTFS/ATM": "GTFS / Trasporto pubblico",
  OMI: "Agenzia Entrate - OMI",
  "OMI/dataset": "Agenzia Entrate - OMI",
  "Dati territoriali": "Agenzia Entrate - OMI",
  "Dati territoriali / OMI": "Agenzia Entrate - OMI",
  Google: "Google Places",
  Places: "Google Places",
  Overpass: "OpenStreetMap / Overpass",
  OpenStreetMap: "OpenStreetMap / Overpass",
};

export function normalizeDataSourceLabel(source) {
  return SOURCE_ALIASES[source] || source;
}

export function sourceIsConfirmed(source, confirmedSources = []) {
  const normalized = normalizeDataSourceLabel(source);
  return confirmedSources.map(normalizeDataSourceLabel).includes(normalized);
}

export function confirmedSourcesOrFallback(analysisData, analysisError) {
  const sources = Array.isArray(analysisData?.sources) ? analysisData.sources.map(normalizeDataSourceLabel).filter(Boolean) : [];
  if (sources.length > 0) return [...new Set(sources)];
  if (analysisError || analysisData?.error) return ["Dati non disponibili"];
  if (analysisData?.metadata?.isEstimated) return ["Stima interna"];
  return ["Stima interna"];
}

// LAYER_PANEL_CONFIG — derived from service-config.js for backward compatibility.
// Consumers in volantinipro-final.jsx import this without any code change.
export const LAYER_PANEL_CONFIG = Object.fromEntries(
  Object.entries(SERVICE_LAYERS).map(([svcType, cfg]) => [svcType, cfg.layers])
);

export function defaultLayerState(svcType) {
  return defaultLayersForService(svcType);
}

// Re-export for consumers that want the richer service-config API directly.
export { SERVICE_LAYERS, defaultLayersForService } from './services/service-config.js';
export { getServiceLayers, getPoiFocusForService } from './services/service-config.js';
