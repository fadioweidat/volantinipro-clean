import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { sourceLabel, type ServiceId } from "../_shared/dataSources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, "Content-Type": "application/json" },
  });

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value || 0)));
const kmToMeters = (km: number) => Math.max(100, Math.min(50000, Math.round(km * 1000)));

type PoiProvider = "google_places" | "foursquare" | "overpass" | "gtfs";
type PoiRecord = {
  provider: PoiProvider;
  externalId: string;
  name: string;
  category: string | null;
  categories: string[];
  lat: number | null;
  lng: number | null;
  address: string | null;
  raw: Record<string, unknown>;
  score: number;
  tags: string[];
};

type ProviderResult = {
  provider: PoiProvider;
  items: PoiRecord[];
};

type SearchContext = {
  service: ServiceId;
  radiusKm: number;
  radiusMeters: number;
  competitorCategories: string[];
};

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeText(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function dedupeById(items: PoiRecord[]) {
  const map = new Map<string, PoiRecord>();
  for (const item of items) {
    const existing = map.get(item.externalId);
    if (!existing || item.score > existing.score) map.set(item.externalId, item);
  }
  return [...map.values()];
}

function categoryBucket(category: string | null, categories: string[] = []) {
  const haystack = `${category || ""} ${categories.join(" ")}`.toLowerCase();
  if (/station|stop|transit|bus|railway|train|metro/.test(haystack)) return "transit";
  if (/school|university|college|education/.test(haystack)) return "school";
  if (/event|theatre|cinema|museum|attraction|park|stadium/.test(haystack)) return "attraction";
  if (/mall|store|shop|retail|marketplace|pedestrian/.test(haystack)) return "retail";
  if (/pharmacy|bar|cafe|restaurant|office|doctor|lawyer|accounting|real_estate_agency|healthcare|craft/.test(haystack)) return "business";
  return "other";
}

function groupByCategory(items: PoiRecord[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const bucket = categoryBucket(item.category, item.categories);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  return counts;
}

function topCategories(items: PoiRecord[], limit = 6) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.category || categoryBucket(item.category, item.categories);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([category, count]) => ({ category, count }));
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function clusterCount(items: PoiRecord[]) {
  const buckets = new Set<string>();
  for (const item of items) {
    if (item.lat == null || item.lng == null) continue;
    buckets.add(`${Math.round(item.lat * 100)}:${Math.round(item.lng * 100)}`);
  }
  return buckets.size;
}

function defaultCompetitorCategories(service: ServiceId) {
  if (service === "b2b") return ["bar", "pharmacy", "store", "office", "restaurant"];
  return ["transit_station", "school", "shopping_mall", "tourist_attraction"];
}

function searchTextTerms(service: ServiceId, competitorCategories: string[]) {
  if (service === "b2b") {
    return ["bar", "pharmacy", "tabacchi", "office", "retail", "professional studio",...competitorCategories];
  }
  return ["transit station", "bus stop", "school", "university", "shopping mall", "tourist attraction", "pedestrian area"];
}

async function googleSearchNearby(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  includedTypes: string[],
  warnings: string[],
) {
  const endpoint = "https://places.googleapis.com/v1/places:searchNearby";
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.primaryType",
  ].join(",");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }),
  });
  if (!res.ok) {
    warnings.push(`GOOGLE_NEARBY_FAILED:${res.status}`);
    return [];
  }
  const body = await res.json();
  return Array.isArray(body.places) ? body.places : [];
}

async function googleSearchText(
  apiKey: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  textQuery: string,
  warnings: string[],
) {
  const endpoint = "https://places.googleapis.com/v1/places:searchText";
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.primaryType",
  ].join(",");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 10,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
    }),
  });
  if (!res.ok) {
    warnings.push(`GOOGLE_TEXT_FAILED:${textQuery}:${res.status}`);
    return [];
  }
  const body = await res.json();
  return Array.isArray(body.places) ? body.places : [];
}

async function googlePlacesProvider(
  lat: number,
  lng: number,
  context: SearchContext,
  warnings: string[],
): Promise<ProviderResult | null> {
  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) return null;

  try {
    const nearbyTypes =
      context.service === "b2b"
        ? ["store", "shopping_mall", "pharmacy", "restaurant", "cafe", "bar", "real_estate_agency"]
        : ["transit_station", "bus_station", "train_station", "school", "university", "shopping_mall", "park", "tourist_attraction"];

    const nearbyCalls = [];
    while (nearbyTypes.length) nearbyCalls.push(nearbyTypes.splice(0, 5));
    const nearbyResults = await Promise.all(
      nearbyCalls.map((types) => googleSearchNearby(apiKey, lat, lng, context.radiusMeters, types, warnings)),
    );

    const textResults = await Promise.all(
      searchTextTerms(context.service, context.competitorCategories).slice(0, 6).map((query) => googleSearchText(apiKey, lat, lng, context.radiusMeters, query, warnings)),
    );

    const items = dedupeById(
      [...nearbyResults.flat(),...textResults.flat()].map((place: Record<string, unknown>) => ({
        provider: "google_places" as const,
        externalId: String(place.id || crypto.randomUUID()),
        name: String((place.displayName as { text?: string } | undefined)?.text || place.primaryType || "Google place"),
        category: String(place.primaryType || "") || null,
        categories: Array.isArray(place.types) ? place.types.map((type) => String(type)) : [],
        lat: Number((place.location as { latitude?: number } | undefined)?.latitude ?? NaN),
        lng: Number((place.location as { longitude?: number } | undefined)?.longitude ?? NaN),
        address: String(place.formattedAddress || "") || null,
        raw: place,
        score: 80,
        tags: Array.isArray(place.types) ? place.types.map((type) => String(type)) : [],
      })),
    ).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    return items.length ? { provider: "google_places", items } : null;
  } catch (error) {
    warnings.push(`GOOGLE_PLACES_UNAVAILABLE:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function foursquareProvider(
  lat: number,
  lng: number,
  context: SearchContext,
  warnings: string[],
): Promise<ProviderResult | null> {
  const apiKey = Deno.env.get("FOURSQUARE_API_KEY");
  if (!apiKey) return null;

  try {
    const queries = context.service === "b2b"
      ? ["bar", "pharmacy", "tabacchi", "office", "retail", "doctor", "lawyer",...context.competitorCategories]
      : ["station", "bus stop", "school", "university", "shopping", "park", "museum"];

    const responses = await Promise.all(
      queries.slice(0, 8).map(async (query) => {
        const url = new URL("https://api.foursquare.com/v3/places/search");
        url.searchParams.set("ll", `${lat},${lng}`);
        url.searchParams.set("radius", String(context.radiusMeters));
        url.searchParams.set("limit", "20");
        url.searchParams.set("query", query);
        const res = await fetch(url, {
          headers: { Authorization: apiKey, Accept: "application/json", "Accept-Language": "it" },
        });
        if (!res.ok) {
          warnings.push(`FOURSQUARE_QUERY_FAILED:${query}:${res.status}`);
          return [];
        }
        const body = await res.json();
        return Array.isArray(body.results) ? body.results : [];
      }),
    );

    const items = dedupeById(
      responses.flat().map((place: Record<string, unknown>) => ({
        provider: "foursquare" as const,
        externalId: String(place.fsq_id || crypto.randomUUID()),
        name: String(place.name || "Foursquare place"),
        category: String((place.categories as Array<{ name?: string }> | undefined)?.[0]?.name || "") || null,
        categories: Array.isArray(place.categories)
          ? (place.categories as Array<{ name?: string }>).map((category) => String(category.name || ""))
          : [],
        lat: Number((place.geocodes as { main?: { latitude?: number } } | undefined)?.main?.latitude ?? NaN),
        lng: Number((place.geocodes as { main?: { longitude?: number } } | undefined)?.main?.longitude ?? NaN),
        address: String((place.location as { formatted_address?: string } | undefined)?.formatted_address || "") || null,
        raw: place,
        score: 72,
        tags: Array.isArray(place.categories)
          ? (place.categories as Array<{ name?: string }>).map((category) => normalizeText(category.name))
          : [],
      })),
    ).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    return items.length ? { provider: "foursquare", items } : null;
  } catch (error) {
    warnings.push(`FOURSQUARE_UNAVAILABLE:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function overpassProvider(
  lat: number,
  lng: number,
  context: SearchContext,
  warnings: string[],
): Promise<ProviderResult | null> {
  const endpoint = Deno.env.get("OVERPASS_ENDPOINT");
  if (!endpoint) return null;

  const h2hTags = [
    'node(around:R,LAT,LNG)["amenity"="school"]',
    'node(around:R,LAT,LNG)["amenity"="university"]',
    'node(around:R,LAT,LNG)["public_transport"="station"]',
    'node(around:R,LAT,LNG)["railway"="station"]',
    'node(around:R,LAT,LNG)["highway"="bus_stop"]',
    'node(around:R,LAT,LNG)["shop"]',
    'node(around:R,LAT,LNG)["amenity"="marketplace"]',
    'way(around:R,LAT,LNG)["highway"="pedestrian"]',
  ];

  const b2bTags = [
    'node(around:R,LAT,LNG)["shop"]',
    'node(around:R,LAT,LNG)["amenity"="pharmacy"]',
    'node(around:R,LAT,LNG)["amenity"="bar"]',
    'node(around:R,LAT,LNG)["amenity"="cafe"]',
    'node(around:R,LAT,LNG)["amenity"="restaurant"]',
    'node(around:R,LAT,LNG)["office"]',
    'node(around:R,LAT,LNG)["craft"]',
    'node(around:R,LAT,LNG)["healthcare"]',
  ];

  const query = `[out:json][timeout:18];(${(context.service === "b2b" ? b2bTags : h2hTags).map((tag) => tag.replaceAll("R", String(context.radiusMeters)).replaceAll("LAT", String(lat)).replaceAll("LNG", String(lng))).join(";")};);out center tags 200;`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
    });
    if (!res.ok) {
      warnings.push(`OVERPASS_UNAVAILABLE:${res.status}`);
      return null;
    }
    const body = await res.json();
    const elements = Array.isArray(body.elements) ? body.elements : [];
    const items = dedupeById(
      elements.map((element: Record<string, unknown>) => {
        const tags = (element.tags as Record<string, unknown> | undefined) || {};
        const category = String(tags.amenity || tags.shop || tags.office || tags.highway || tags.railway || tags.public_transport || tags.healthcare || tags.craft || "");
        return {
          provider: "overpass" as const,
          externalId: `osm-${element.type}-${element.id}`,
          name: String(tags.name || tags.brand || category || "OSM point"),
          category: category || null,
          categories: Object.entries(tags).filter(([, value]) => typeof value === "string").slice(0, 8).map(([key, value]) => `${key}:${value}`),
          lat: Number((element.lat as number | undefined) ?? (element.center as { lat?: number } | undefined)?.lat ?? NaN),
          lng: Number((element.lon as number | undefined) ?? (element.center as { lon?: number } | undefined)?.lon ?? NaN),
          address: null,
          raw: element,
          score: 64,
          tags: Object.entries(tags).map(([key, value]) => `${normalizeText(key)}:${normalizeText(value)}`),
        };
      }),
    ).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    return items.length ? { provider: "overpass", items } : null;
  } catch (error) {
    warnings.push(`OVERPASS_UNAVAILABLE:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function gtfsDbProvider(
  supabase: ReturnType<typeof supabaseAdmin>,
  lat: number,
  lng: number,
  context: SearchContext,
  warnings: string[],
): Promise<ProviderResult | null> {
  if (!supabase || context.service !== "h2h") return null;

  try {
    const { data, error } = await supabase.rpc("get_gtfs_stops_in_radius", {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: context.radiusKm,
      p_limit: 200,
    });
    if (error) {
      warnings.push(`GTFS_DB_UNAVAILABLE:${error.message}`);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) return null;

    const items = dedupeById(data.map((stop: Record<string, unknown>) => ({
      provider: "gtfs" as const,
      externalId: `gtfs-${String(stop.source || "default")}-${String(stop.stop_id || crypto.randomUUID())}`,
      name: String(stop.stop_name || "GTFS stop"),
      category: "gtfs_stop",
      categories: ["gtfs_stop", String(stop.agency || "").trim()].filter(Boolean),
      lat: Number(stop.stop_lat ?? NaN),
      lng: Number(stop.stop_lng ?? NaN),
      address: null,
      raw: stop,
      score: 80,
      tags: ["gtfs_stop", normalizeText(stop.agency)].filter(Boolean),
    }))).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    return items.length ? { provider: "gtfs", items } : null;
  } catch (error) {
    warnings.push(`GTFS_DB_UNAVAILABLE:${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function makeBboxHash(service: string, provider: string, lat: number, lng: number, radiusKm: number): Promise<string> {
  const input = `${service}:${provider}:${Math.round(lat * 100)}:${Math.round(lng * 100)}:${Math.round(radiusKm * 10)}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function makeBbox(lat: number, lng: number, radiusKm: number): string {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const minLat = Math.round((lat - dLat) * 10000) / 10000;
  const minLng = Math.round((lng - dLng) * 10000) / 10000;
  const maxLat = Math.round((lat + dLat) * 10000) / 10000;
  const maxLng = Math.round((lng + dLng) * 10000) / 10000;
  return `${minLat},${minLng},${maxLat},${maxLng}`;
}

async function cachePoiResults(
  supabase: ReturnType<typeof supabaseAdmin>,
  service: ServiceId,
  lat: number,
  lng: number,
  radiusKm: number,
  items: PoiRecord[],
  warnings: string[],
) {
  if (!supabase || items.length === 0) return;
  const provider = items[0].provider;
  const bboxHash = await makeBboxHash(service, provider, lat, lng, radiusKm);
  const bbox = makeBbox(lat, lng, radiusKm);
  const row = {
    bbox_hash: bboxHash,
    service_type: service,
    service_context: service,
    bbox,
    provider,
    external_id: bboxHash,
    name: `${provider}:${service}:${bbox}`,
    category: "area_cache",
    pois: items.map((item) => ({
      name: item.name,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
      external_id: item.externalId,
    })),
    raw_json: { count: items.length, service, lat, lng, radiusKm },
    fetched_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("poi_cache").upsert(row, { onConflict: "bbox_hash" });
  if (error) warnings.push(`POI_CACHE_WRITE_FAILED:${error.message}`);
}

async function logSearch(
  supabase: ReturnType<typeof supabaseAdmin>,
  service: ServiceId,
  lat: number,
  lng: number,
  radiusKm: number,
  providersUsed: string[],
  resultsCount: number,
  warnings: string[],
) {
  if (!supabase) return;
  const { error } = await supabase.from("poi_search_logs").insert({
    service,
    lat,
    lng,
    radius_km: radiusKm,
    providers_used: providersUsed,
    results_count: resultsCount,
  });
  if (error) warnings.push(`POI_SEARCH_LOG_FAILED:${error.message}`);
}

function buildHotspots(lat: number, lng: number, items: PoiRecord[], limit = 6) {
  return items.filter((item) => item.lat != null && item.lng != null).sort((a, b) => {
      const aDistance = distanceKm(lat, lng, a.lat!, a.lng!);
      const bDistance = distanceKm(lat, lng, b.lat!, b.lng!);
      return (b.score - a.score) || (aDistance - bDistance);
    }).slice(0, limit).map((item) => ({
      name: item.name,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
      provider: sourceLabel(item.provider),
      distance_km: Math.round(distanceKm(lat, lng, item.lat!, item.lng!) * 100) / 100,
    }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const radiusKm = Number(url.searchParams.get("radius") || "1");
    const requestedService = normalizeText(url.searchParams.get("service"));
    const service = (requestedService === "b2b" ? "b2b" : "h2h") as ServiceId;
    const competitorCategories = (url.searchParams.get("poiCompetitorCategories") || "").split(",").map((value) => normalizeText(value)).filter(Boolean);
    const warnings: string[] = [];
    const sources = new Set<string>();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ values: {}, metadata: { isEstimated: false }, sources: [], error: "INVALID_COORDINATES" }, 400);
    }

    const context: SearchContext = {
      service,
      radiusKm,
      radiusMeters: kmToMeters(radiusKm),
      competitorCategories: competitorCategories.length ? competitorCategories : defaultCompetitorCategories(service),
    };

    const supabase = supabaseAdmin();
    const providerResults = [
      await googlePlacesProvider(lat, lng, context, warnings),
      await foursquareProvider(lat, lng, context, warnings),
      await overpassProvider(lat, lng, context, warnings),
      await gtfsDbProvider(supabase, lat, lng, context, warnings),
    ].filter((result): result is ProviderResult => Boolean(result));

    for (const result of providerResults) sources.add(sourceLabel(result.provider));

    const allItems = dedupeById(providerResults.flatMap((result) => result.items));
    if (allItems.length === 0) {
      await logSearch(supabase, service, lat, lng, radiusKm, [], 0, warnings);
      return json({
        values: {},
        metadata: { isEstimated: false, warnings },
        sources: [],
        error: "POI_DATA_NOT_AVAILABLE",
      });
    }

    for (const result of providerResults) {
      await cachePoiResults(supabase, service, lat, lng, radiusKm, result.items, warnings);
    }

    const categoryCounts = groupByCategory(allItems);
    const transitPoints = (categoryCounts.get("transit") || 0) + (providerResults.find((result) => result.provider === "gtfs")?.items.length || 0);
    const schoolsEventsCount = (categoryCounts.get("school") || 0) + (categoryCounts.get("attraction") || 0);
    const detectedActivities = categoryCounts.get("business") || 0;
    const retailCount = categoryCounts.get("retail") || 0;
    const hotspots = buildHotspots(lat, lng, allItems);
    const hotspotCount = hotspots.length;
    const clusterTotal = clusterCount(allItems);
    const topCategoryRows = topCategories(allItems);
    const topCategoryLabels = topCategoryRows.map((row) => row.category);

    const competitorCount = allItems.filter((item) => {
      const haystack = `${item.category || ""} ${item.categories.join(" ")}`.toLowerCase();
      return context.competitorCategories.some((category) => haystack.includes(category));
    }).length;

    const targetActivitiesCount = service === "b2b"
      ? allItems.filter((item) => ["business", "retail"].includes(categoryBucket(item.category, item.categories))).length
      : retailCount + schoolsEventsCount;

    const areaKm2 = Math.max(0.3, Math.PI * radiusKm * radiusKm);
    const poiCount = allItems.length;
    const passageDensity = Math.round(poiCount / areaKm2);
    const potentialFlow = clamp(
      transitPoints * 6 +
      schoolsEventsCount * 4 +
      retailCount * 3 +
      hotspotCount * 5,
      0,
      100,
    );
    const commercialDensity = Math.round((detectedActivities + retailCount + competitorCount) / areaKm2);
    const commercialDensityIndex = clamp(commercialDensity * 2.4 + clusterTotal * 6 + targetActivitiesCount * 1.5, 0, 100);
    const reachScore = clamp(
      service === "h2h"
        ? potentialFlow * 0.55 + passageDensity * 0.35 + hotspotCount * 4
        : commercialDensityIndex * 0.52 + targetActivitiesCount * 1.8 + clusterTotal * 3,
      0,
      100,
    );
    const roiScore = clamp(
      service === "h2h"
        ? reachScore * 0.62 + transitPoints * 2 + schoolsEventsCount * 1.5
        : reachScore * 0.58 + targetActivitiesCount * 2.2 - competitorCount * 0.8 + clusterTotal * 2.5,
      0,
      100,
    );
    const confidenceScore = clamp(48 + (providerResults.length * 14) + Math.min(18, poiCount / 4) - (warnings.length * 4), 0, 100);
    const gtfsStopsCount = providerResults.find((result) => result.provider === "gtfs")?.items.length || 0;
    const foursquareResultsCount = providerResults.find((result) => result.provider === "foursquare")?.items.length || 0;

    sources.add(sourceLabel("internal_scoring"));
    await logSearch(supabase, service, lat, lng, radiusKm, [...sources].filter((source) => source !== sourceLabel("internal_scoring")), poiCount, warnings);

    const values = service === "h2h"
      ? {
          poi_count: poiCount,
          poi_rilevati: poiCount,
          transit_points: transitPoints,
          transit_stops: transitPoints,
          schools_events_count: schoolsEventsCount,
          schools_events: schoolsEventsCount,
          potential_flow: potentialFlow,
          flow_score: potentialFlow,
          passage_density: passageDensity,
          hotspot_count: hotspotCount,
          hotspot_strength: clamp((potentialFlow + reachScore + confidenceScore) / 3),
          nearby_activities: poiCount,
          reach_score: reachScore,
          roi_score: roiScore,
          confidence_score: confidenceScore,
          ...(gtfsStopsCount > 0 ? {
            gtfs_transport_stops: gtfsStopsCount,
            mobility_accessibility_signal: potentialFlow,
          } : {}),
          categories: topCategoryLabels.join(" - "),
        }
      : {
          detected_activities: detectedActivities,
          businesses: detectedActivities,
          competitor_count: competitorCount,
          competitors: competitorCount,
          commercial_density: commercialDensity,
          commercial_density_index: commercialDensityIndex,
          cdIdx: commercialDensityIndex,
          top_categories: topCategoryLabels,
          categories: topCategoryLabels.join(" - "),
          target_activities_count: targetActivitiesCount,
          target_businesses: targetActivitiesCount,
          cluster_count: clusterTotal,
          clusters: clusterTotal,
          reach_score: reachScore,
          roi_score: roiScore,
          confidence_score: confidenceScore,
          ...(foursquareResultsCount > 0 ? { foursquare_results: foursquareResultsCount } : {}),
        };

    return json({
      values,
      metadata: {
        isEstimated: false,
        warnings,
        nearby_activities: allItems.slice(0, 24).map((item) => ({
          name: item.name,
          category: item.category,
          provider: sourceLabel(item.provider),
          lat: item.lat,
          lng: item.lng,
        })),
        hotspots,
        suggested_points: hotspots,
        transport_stops: providerResults.find((result) => result.provider === "gtfs")?.items.map((item) => ({
          name: item.name,
          lat: item.lat,
          lng: item.lng,
        })) || [],
        top_categories: topCategoryRows,
      },
      confidenceReduced: warnings.length > 0,
      sources: [...sources],
    });
  } catch (error) {
    return json({
      values: {},
      metadata: {
        isEstimated: false,
        warnings: [error instanceof Error ? error.message : "UNKNOWN_ERROR"],
      },
      sources: [],
      error: "POI_DATA_NOT_AVAILABLE",
    }, 500);
  }
});
