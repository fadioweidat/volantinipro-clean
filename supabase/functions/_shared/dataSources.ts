export type ServiceId = "d2d" | "h2h" | "b2b";

export type DataSource = {
  id: string;
  label: string;
  provider: string;
  enabled: boolean;
  requiredEnv?: string[];
  usedByServices: ServiceId[];
  description: string;
};

export const DATA_SOURCES: DataSource[] = [
  {
    id: "mapbox",
    label: "Mapbox",
    provider: "Mapbox",
    enabled: Boolean(Deno.env.get("MAPBOX_TOKEN") || Deno.env.get("VITE_MAPBOX_TOKEN")),
    requiredEnv: ["MAPBOX_TOKEN", "VITE_MAPBOX_TOKEN"],
    usedByServices: ["d2d", "h2h", "b2b"],
    description: "Geocoding, map navigation, address/area search.",
  },
  {
    id: "istat",
    label: "ISTAT",
    provider: "ISTAT",
    enabled: Boolean(Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    usedByServices: ["d2d"],
    description: "Population, families, demographic indicators, residential analysis.",
  },
  {
    id: "postgis",
    label: "Dati geografici / PostGIS",
    provider: "Supabase PostGIS",
    enabled: Boolean(Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    usedByServices: ["d2d", "h2h", "b2b"],
    description: "Radius analysis, area coverage, municipalities in radius, spatial intersections.",
  },
  {
    id: "google_places",
    label: "Google Places",
    provider: "Google",
    enabled: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY") || Deno.env.get("GOOGLE_API_KEY")),
    requiredEnv: ["GOOGLE_PLACES_API_KEY", "GOOGLE_API_KEY"],
    usedByServices: ["h2h", "b2b"],
    description: "POI, activities, categories, local places.",
  },
  {
    id: "foursquare",
    label: "Foursquare",
    provider: "Foursquare",
    enabled: Boolean(Deno.env.get("FOURSQUARE_API_KEY")),
    requiredEnv: ["FOURSQUARE_API_KEY"],
    usedByServices: ["h2h", "b2b"],
    description: "Commercial activities, categories, clusters, business context.",
  },
  {
    id: "overpass",
    label: "OpenStreetMap / Overpass",
    provider: "OpenStreetMap",
    enabled: Boolean(Deno.env.get("OVERPASS_ENDPOINT")),
    requiredEnv: ["OVERPASS_ENDPOINT"],
    usedByServices: ["d2d", "h2h", "b2b"],
    description: "POI, streets, urban context, landuse, public amenities.",
  },
  {
    id: "gtfs",
    label: "GTFS / Trasporto pubblico",
    provider: "GTFS",
    enabled: Boolean(Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    usedByServices: ["h2h"],
    description: "Stops, stations, mobility, public transport anchors.",
  },
  {
    id: "omi",
    label: "Agenzia Entrate - OMI",
    provider: "Agenzia Entrate - OMI",
    enabled: Boolean(Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    usedByServices: ["d2d", "b2b"],
    description: "Official real estate value ranges by municipality and OMI zone.",
  },
  {
    id: "internal_scoring",
    label: "Analisi interna",
    provider: "VolantiniPro",
    enabled: true,
    usedByServices: ["d2d", "h2h", "b2b"],
    description: "Commercial Density, Family Index, Reach, ROI, Confidence, area intensity.",
  },
];

export function sourceLabel(id: string) {
  return DATA_SOURCES.find((source) => source.id === id)?.label || id;
}

export function availableSourceIds(service: ServiceId) {
  return DATA_SOURCES.filter((source) => source.enabled && source.usedByServices.includes(service)).map((source) => source.id);
}
