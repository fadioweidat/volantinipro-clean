import { createAbortError, createTimeoutSignal, isAbortError, throwIfAborted } from './request-cancellation.js';

export const EMPTY_TRANSPORT_STATE = {
  available: false,
  count: 0,
  label: 'Dati TPL non disponibili',
  message: 'Dati TPL non disponibili per questa zona',
  stops: [],
  routeTypes: [],
  routeCount: 0,
  hotspotCount: 0,
  sources: [],
};

const TYPE_ORDER = ['metro', 'tram', 'bus', 'train', 'unknown'];
const SOURCE_LABELS = {
  atm_milano: 'ATM Milano',
  trenord_lombardia: 'Trenord',
};

export function makeTransportState(rows) {
  const stops = Array.isArray(rows)
    ? rows
        .map((row) => {
          const routes = Array.isArray(row.routes) ? row.routes : [];
          const routeTypes = routes
            .map((route) => route.route_type_label || route.routeTypeLabel || 'unknown')
            .filter(Boolean);
          return {
            id: `${row.source || 'gtfs'}-${row.stop_id}`,
            source: row.source || null,
            stopId: row.stop_id,
            stopName: row.stop_name,
            stopType: row.stop_type || routeTypes[0] || 'unknown',
            routes: routes.map((route) => ({
              routeId: route.route_id,
              shortName: route.route_short_name,
              longName: route.route_long_name,
              routeType: route.route_type,
              routeTypeLabel: route.route_type_label || 'unknown',
              color: route.route_color,
              textColor: route.route_text_color,
            })),
            distanceM: row.distance_m != null ? Number(row.distance_m) : null,
            lat: Number(row.lat),
            lng: Number(row.lng),
          };
        })
        .filter((stop) => stop.stopId && Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
    : [];

  const count = stops.length;
  if (count <= 0) return EMPTY_TRANSPORT_STATE;

  const routeIds = new Set();
  const routeTypeSet = new Set();
  for (const stop of stops) {
    for (const route of stop.routes) {
      if (route.routeId) routeIds.add(route.routeId);
      routeTypeSet.add(route.routeTypeLabel || 'unknown');
    }
  }

  const routeTypes = TYPE_ORDER.filter((type) => routeTypeSet.has(type));
  const sources = normalizeTransportSources(stops, routeTypes);
  const hotspotCount = stops.filter((stop) => stop.routes.length >= 3 || stop.stopType === 'metro' || stop.stopType === 'train').length;

  return {
    available: true,
    count,
    label: makeTransportLabel(sources, count),
    message: 'Fermate e linee GTFS programmate disponibili per questa zona.',
    stops,
    routeTypes,
    routeCount: routeIds.size,
    hotspotCount,
    sources,
  };
}

function normalizeTransportSources(stops, routeTypes) {
  const explicitSources = Array.from(new Set(stops.map((stop) => stop.source).filter(Boolean))).sort();
  if (explicitSources.length > 0) return explicitSources;

  if (routeTypes.length === 1 && routeTypes[0] === 'train') return ['trenord_lombardia'];
  if (routeTypes.some((type) => ['metro', 'tram', 'bus'].includes(type))) return ['atm_milano'];
  return ['gtfs'];
}

function makeTransportLabel(sources, count = 0) {
  if (!count) return 'Dati TPL non disponibili';
  if (!sources.length) return 'TPL';
  if (sources.length > 1) return 'TPL · fonti multiple';
  return `TPL · ${SOURCE_LABELS[sources[0]] || sources[0]}`;
}

export async function fetchTransportStopsInRadius({ centerLat, centerLng, radiusKm }, { signal, timeoutMs = 15_000 } = {}) {
  throwIfAborted(signal);
  const runtimeEnv = import.meta.env || (typeof process !== 'undefined' ? process.env : {});
  const url = runtimeEnv.VITE_SUPABASE_URL;
  const anonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { rows: [] };

  const timeout = createTimeoutSignal(signal, timeoutMs);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/get_transport_stops_in_radius`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        center_lat: centerLat,
        center_lng: centerLng,
        radius_km: radiusKm,
      }),
      signal: timeout.signal,
    });

    const rows = await response.json();
    if (!response.ok) throw new Error(rows?.message || 'TRANSPORT_RPC_ERROR');
    return { rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    if (signal?.aborted) throw isAbortError(error) ? error : (isAbortError(signal.reason) ? signal.reason : createAbortError());
    if (timeout.didTimeout()) throw new Error('TRANSPORT_TIMEOUT');
    throw error;
  } finally {
    timeout.cleanup();
  }
}
