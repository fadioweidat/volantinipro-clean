// Rilevamento fuori-zona per il tracking GPS Autista. Modulo puro (nessuna
// dipendenza da Supabase/DOM): riceve la geometria delle zone campagna e una
// sequenza di punti, produce uno stato debounced inside/outside con isteresi
// per evitare falsi allarmi al confine o su un singolo punto isolato. Usato
// sia lato Autista (punto per punto, in tempo reale da watchPosition) sia
// lato Admin/storico (rieseguito sui punti gia' persistiti in
// gps_tracking_points, senza salvare alcun dato nuovo).
import { geoJsonContainsPoint } from '../geo/pointInPolygon.js';

export const GEOFENCE_MAX_ACCURACY_M = 50;
export const GEOFENCE_EXIT_CONSECUTIVE_POINTS = 3;
export const GEOFENCE_RETURN_CONSECUTIVE_POINTS = 2;
export const GEOFENCE_EXIT_MIN_DURATION_MS = 60_000;
export const GEOFENCE_RETURN_MIN_DURATION_MS = 30_000;
export const GEOFENCE_STALE_AFTER_MS = 3 * 60_000;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractGeometry(zone) {
  const raw = zone?.geometry_geojson || zone?.geometry || zone?.geojson || zone?.geom || null;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Normalizza un oggetto zona (dalla stessa forma prodotta da Step2/apiToZones
// o dalla riga campaign_zones) in { kind: 'polygon'|'circle'|'unusable', ... }.
function normalizeZone(zone) {
  if (!zone || typeof zone !== 'object') return { kind: 'unusable' };

  const geometry = extractGeometry(zone);
  if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
    return { kind: 'polygon', geometry };
  }

  const centerLat = toFiniteNumber(zone.center_lat ?? zone.centerLat ?? zone.city?.lat);
  const centerLng = toFiniteNumber(zone.center_lng ?? zone.centerLng ?? zone.city?.lng);
  const radiusKm = toFiniteNumber(zone.radius_km ?? zone.radius ?? zone.selectedRadius);
  if (centerLat != null && centerLng != null && radiusKm != null && radiusKm > 0) {
    return { kind: 'circle', centerLat, centerLng, radiusKm };
  }

  return { kind: 'unusable' };
}

// Estrae le zone dalla campagna cosi' come arriva al frontend (RPC
// gps_get_operator_campaign lato Autista, o lettura diretta campaigns/campagne
// lato Admin). Nessuna colonna/tabella nuova: guarda difensivamente le
// posizioni gia' note in cui il codice esistente scrive le zone campagna.
export function normalizeZonesFromCampaign(campaign) {
  const raw =
    campaign?.metadata?.campaign_zones ||
    campaign?.campaignZones ||
    campaign?.campaign_zones ||
    campaign?.zones ||
    campaign?.metadata?.zones ||
    [];
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeZone).filter((zone) => zone.kind !== 'unusable');
}

function circleContainsPoint(zone, lat, lng) {
  const distanceM = haversineMeters(zone.centerLat, zone.centerLng, lat, lng);
  return distanceM <= zone.radiusKm * 1000;
}

// true/false = dentro/fuori rispetto ad almeno una zona; null = nessuna zona
// con geometria utilizzabile (fallback "zona non disponibile").
export function isPointInAnyZone(zones, lat, lng) {
  const usable = Array.isArray(zones) ? zones.filter((z) => z.kind !== 'unusable') : [];
  if (!usable.length) return null;
  return usable.some((zone) =>
    zone.kind === 'polygon' ? geoJsonContainsPoint(zone.geometry, lat, lng) : circleContainsPoint(zone, lat, lng),
  );
}

export function createGeofenceState() {
  return {
    status: 'unknown', // unknown | zone_unavailable | inside | outside | stale
    confirmedAt: null,
    candidate: null, // { side: 'inside'|'outside', since: msEpoch, count }
    lastValidPointAt: null,
    events: [], // { type: 'exited'|'returned', at: msEpoch, lat, lng } — solo transizioni confermate
  };
}

// Valuta un singolo punto e ritorna il prossimo stato. Ignora silenziosamente
// (ritorna lo stato invariato) i punti con coordinate non valide o accuracy
// sopra soglia: un punto scartato non deve mai contribuire al debounce.
export function evaluateGeofencePoint(prevState, point, zones) {
  const state = prevState || createGeofenceState();
  const lat = toFiniteNumber(point?.lat);
  const lng = toFiniteNumber(point?.lng);
  if (lat == null || lng == null) return state;

  const accuracy = toFiniteNumber(point?.accuracy);
  if (accuracy != null && accuracy > GEOFENCE_MAX_ACCURACY_M) return state;

  const nowMs = point?.recordedAt ? new Date(point.recordedAt).getTime() : Date.now();
  if (!Number.isFinite(nowMs)) return state;

  const containment = isPointInAnyZone(zones, lat, lng);
  if (containment === null) {
    return { ...state, status: 'zone_unavailable', candidate: null, lastValidPointAt: nowMs };
  }

  const side = containment ? 'inside' : 'outside';
  const candidate =
    state.candidate && state.candidate.side === side
      ? { side, since: state.candidate.since, count: state.candidate.count + 1 }
      : { side, since: nowMs, count: 1 };

  const requiredCount = side === 'outside' ? GEOFENCE_EXIT_CONSECUTIVE_POINTS : GEOFENCE_RETURN_CONSECUTIVE_POINTS;
  const requiredDuration = side === 'outside' ? GEOFENCE_EXIT_MIN_DURATION_MS : GEOFENCE_RETURN_MIN_DURATION_MS;
  const elapsedSinceCandidate = nowMs - candidate.since;

  let status = state.status;
  let confirmedAt = state.confirmedAt;
  let events = state.events;

  const isAlreadyConfirmed = status === side;
  if (!isAlreadyConfirmed && candidate.count >= requiredCount && elapsedSinceCandidate >= requiredDuration) {
    const wasConfirmedOppositeSide = status === 'inside' || status === 'outside';
    status = side;
    confirmedAt = nowMs;
    if (wasConfirmedOppositeSide) {
      events = [...events, { type: side === 'outside' ? 'exited' : 'returned', at: nowMs, lat, lng }];
    }
  }

  return { status, confirmedAt, candidate, lastValidPointAt: nowMs, events };
}

// Da chiamare periodicamente (non ad ogni punto) per rilevare l'assenza
// prolungata di punti validi (GPS fermo, app in background, offline esteso):
// lo stato passa a 'stale' finche' non arriva un nuovo punto valido.
export function applyStaleness(state, nowMs = Date.now()) {
  if (!state?.lastValidPointAt || state.status === 'stale') return state;
  if (nowMs - state.lastValidPointAt > GEOFENCE_STALE_AFTER_MS) {
    return { ...state, status: 'stale' };
  }
  return state;
}

// Rigioca una lista di punti gia' persistiti (gps_tracking_points) attraverso
// lo stesso motore usato in tempo reale: usato da Admin e dallo storico
// sessione per derivare stato/eventi senza alcuna scrittura aggiuntiva.
export function summarizeGeofencePoints(points, zones) {
  const sorted = [...(points || [])].sort(
    (a, b) => new Date(a.recorded_at || a.recordedAt || 0) - new Date(b.recorded_at || b.recordedAt || 0),
  );
  let state = createGeofenceState();
  for (const p of sorted) {
    state = evaluateGeofencePoint(
      state,
      { lat: p.lat, lng: p.lng, accuracy: p.accuracy, recordedAt: p.recorded_at || p.recordedAt },
      zones,
    );
  }
  return state;
}
