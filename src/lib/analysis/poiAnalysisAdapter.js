// Analisi POI Hand to Hand e Business calcolata dai dati gratuiti di /api/poi-search.
// Produce gli stessi campi della risposta di analysis-poi-search: nessun provider a
// pagamento, nessun numero senza un POI reale dietro.
import { fetchPois } from "../services/poi-api.js";

const SOURCE = "OpenStreetMap";
const MAX_RADIUS_KM = 50;
const COMPETITORS = { h2h: /stazione|metro|scuola|universit|centro comm|attrazione/i, b2b: /bar|farmacia|supermercato|ufficio|studio|ristorante/i };

const clamp = (value, min = 0, max = 100) => Math.round(Math.min(max, Math.max(min, value)));

function bucket(category) {
  const text = String(category || "").toLowerCase();
  if (/stazione|metro|fermata|bus|tram/.test(text)) return "transit";
  if (/scuola|universit|istruzione/.test(text)) return "school";
  if (/teatro|cinema|museo|attrazione|parco|stadio|bibliotec/.test(text)) return "attraction";
  if (/centro comm|supermercato|mercato|negozio|shop/.test(text)) return "retail";
  if (/bar|caff|ristorante|farmacia|ufficio|studio|commercialista|tabacchi|hotel|struttura|parrucchiere|estetico|palestra|sportivo|clinica|capannone/.test(text)) return "business";
  return "other";
}

function distanceKm(aLat, aLng, bLat, bLng) {
  const rad = (value) => (value * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function topCategories(pois, limit = 6) {
  const counts = new Map();
  pois.forEach((poi) => counts.set(poi.category, (counts.get(poi.category) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([category, count]) => ({ category, count }));
}

export function buildPoiAnalysis({ pois, lat, lng, radiusKm, service }) {
  if (!pois.length) {
    return { values: {}, metadata: { isEstimated: false, warnings: [] }, sources: [], error: "POI_DATA_NOT_AVAILABLE" };
  }
  const count = (name) => pois.filter((poi) => bucket(poi.category) === name).length;
  const transit = count("transit");
  const schoolsEvents = count("school") + count("attraction");
  const business = count("business");
  const retail = count("retail");
  const hotspots = [...pois]
    .map((poi) => ({ name: poi.name, category: poi.category, lat: poi.lat, lng: poi.lng, provider: SOURCE, priority: poi.priority, distance_km: Math.round(distanceKm(lat, lng, poi.lat, poi.lng) * 100) / 100 }))
    .sort((a, b) => (b.priority - a.priority) || (a.distance_km - b.distance_km))
    .slice(0, 6)
    .map(({ priority, ...spot }) => spot);
  const clusters = new Set(pois.map((poi) => `${Math.round(poi.lat * 100)}:${Math.round(poi.lng * 100)}`)).size;
  const top = topCategories(pois);
  const labels = top.map((row) => row.category);
  const competitors = pois.filter((poi) => (COMPETITORS[service] || COMPETITORS.b2b).test(poi.category || "")).length;
  const targets = service === "b2b" ? business + retail : retail + schoolsEvents;
  const area = Math.max(0.3, Math.PI * radiusKm * radiusKm);
  const passageDensity = Math.round(pois.length / area);
  const flow = clamp(transit * 6 + schoolsEvents * 4 + retail * 3 + hotspots.length * 5);
  const commercialDensity = Math.round((business + retail + competitors) / area);
  const commercialIndex = clamp(commercialDensity * 2.4 + clusters * 6 + targets * 1.5);
  const reach = clamp(service === "h2h"
    ? flow * 0.55 + passageDensity * 0.35 + hotspots.length * 4
    : commercialIndex * 0.52 + targets * 1.8 + clusters * 3);
  const roi = clamp(service === "h2h"
    ? reach * 0.62 + transit * 2 + schoolsEvents * 1.5
    : reach * 0.58 + targets * 2.2 - competitors * 0.8 + clusters * 2.5);
  const confidence = clamp(48 + 14 + Math.min(18, pois.length / 4));
  const shared = { reach_score: reach, roi_score: roi, confidence_score: confidence, categories: labels.join(" - ") };
  const values = service === "h2h"
    ? {
      ...shared, poi_count: pois.length, poi_rilevati: pois.length, transit_points: transit, transit_stops: transit,
      schools_events_count: schoolsEvents, schools_events: schoolsEvents, potential_flow: flow, flow_score: flow,
      passage_density: passageDensity, hotspot_count: hotspots.length, hotspot_strength: clamp((flow + reach + confidence) / 3),
      nearby_activities: pois.length,
    }
    : {
      ...shared, detected_activities: business, businesses: business, competitor_count: competitors, competitors,
      commercial_density: commercialDensity, commercial_density_index: commercialIndex, cdIdx: commercialIndex,
      top_categories: labels, target_activities_count: targets, target_businesses: targets, cluster_count: clusters, clusters,
    };
  return {
    values,
    metadata: {
      isEstimated: false,
      warnings: [],
      nearby_activities: pois.slice(0, 24).map((poi) => ({ name: poi.name, category: poi.category, provider: SOURCE, lat: poi.lat, lng: poi.lng })),
      hotspots,
      suggested_points: hotspots,
      transport_stops: [],
      top_categories: top,
    },
    confidenceReduced: false,
    sources: [SOURCE],
  };
}

export async function fetchPoiAnalysis({ lat, lng, radiusKm, service, targetSelection = [] }) {
  const radius = Math.min(MAX_RADIUS_KM, radiusKm);
  const pois = await fetchPois({ centerLat: lat, centerLng: lng, radiusKm: radius, serviceType: service, targetSelection: Array.isArray(targetSelection) ? targetSelection : [] });
  return buildPoiAnalysis({ pois, lat, lng, radiusKm: radius, service });
}
