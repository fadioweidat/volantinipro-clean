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

// Proiezione piatta locale (equirettangolare, centrata sul punto stesso):
// sufficiente per distanze a scala urbana come quelle di una zona di
// distribuzione, evita di importare una libreria geo solo per questo.
function projectMeters(lat, lng, refLatRad) {
  const R = 6371000;
  return [
    (lng * Math.PI) / 180 * R * Math.cos(refLatRad),
    (lat * Math.PI) / 180 * R,
  ];
}

function pointToSegmentDistanceMeters(lat, lng, [lngA, latA], [lngB, latB]) {
  const refLatRad = (lat * Math.PI) / 180;
  const [px, py] = projectMeters(lat, lng, refLatRad);
  const [ax, ay] = projectMeters(latA, lngA, refLatRad);
  const [bx, by] = projectMeters(latB, lngB, refLatRad);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function ringMinDistanceMeters(ring, lat, lng) {
  if (!Array.isArray(ring) || ring.length < 2) return null;
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const d = pointToSegmentDistanceMeters(lat, lng, a, b);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

// Distanza (metri) dal confine della zona usabile piu' vicina, indipendente
// dall'essere dentro o fuori — usata SOLO per una sfumatura visiva ("vicino
// al confine") sulla mappa Driver, mai per il debounce inside/outside
// ufficiale (quello resta esclusivamente evaluateGeofencePoint/applyStaleness).
// null = nessuna zona con geometria utilizzabile.
export function estimateDistanceToZoneBoundaryMeters(zones, lat, lng) {
  const usable = Array.isArray(zones) ? zones.filter((z) => z.kind !== 'unusable') : [];
  if (!usable.length) return null;
  const nLat = toFiniteNumber(lat);
  const nLng = toFiniteNumber(lng);
  if (nLat == null || nLng == null) return null;

  let min = Infinity;
  for (const zone of usable) {
    if (zone.kind === 'circle') {
      const distanceM = haversineMeters(zone.centerLat, zone.centerLng, nLat, nLng);
      const d = Math.abs(distanceM - zone.radiusKm * 1000);
      if (d < min) min = d;
    } else if (zone.kind === 'polygon') {
      const coords = zone.geometry?.type === 'Polygon'
        ? zone.geometry.coordinates
        : zone.geometry?.type === 'MultiPolygon'
          ? (zone.geometry.coordinates || []).flat()
          : null;
      if (!Array.isArray(coords)) continue;
      for (const ring of coords) {
        const d = ringMinDistanceMeters(ring, nLat, nLng);
        if (d != null && d < min) min = d;
      }
    }
  }
  return Number.isFinite(min) ? min : null;
}

// Stato "vivo" (non debounced) dentro/fuori/vicino-confine/zona-non-disponibile
// per un singolo punto — usato per il badge istantaneo sulla mappa (Driver
// DriverZoneMap.jsx e Admin GpsMonitor.jsx). Centralizzato qui apposta: prima
// esisteva solo dentro DriverZoneMap.jsx, e Admin avrebbe dovuto reinventare
// la stessa soglia/logica per allinearsi visivamente al Driver, rischiando
// di divergere in silenzio a un futuro tweak della soglia. Distinto di
// proposito dal debounce ufficiale (evaluateGeofencePoint/createGeofenceState),
// che resta l'unica fonte per l'alert operativo "sei fuori dalla zona".
export const ZONE_LIVE_STATUS_NEAR_BORDER_THRESHOLD_M = 40;
export const ZONE_LIVE_STATUS_LABELS = {
  inside: 'Dentro la zona',
  near_border: 'Vicino al confine',
  outside: 'Fuori zona',
  zone_unavailable: 'Zona non disponibile',
  awaiting_gps: 'In attesa GPS',
};
export const ZONE_LIVE_STATUS_COLORS = {
  inside: '#0f766e',
  near_border: '#b45309',
  outside: '#b91c1c',
  zone_unavailable: '#64748b',
  awaiting_gps: '#64748b',
};

export function deriveLiveZoneStatus(zones, lat, lng) {
  // toFiniteNumber(null) === 0 (Number(null) e' finito): un controllo
  // esplicito su lat/lng grezzi, prima della conversione, e' l'unico modo
  // corretto per distinguere "nessuna posizione nota ancora" (awaiting_gps)
  // da una posizione reale a 0/0.
  if (lat == null || lng == null) return 'awaiting_gps';
  const nLat = toFiniteNumber(lat);
  const nLng = toFiniteNumber(lng);
  if (nLat == null || nLng == null) return 'awaiting_gps';
  const inside = isPointInAnyZone(zones, nLat, nLng);
  if (inside === null) return 'zone_unavailable';
  const distance = estimateDistanceToZoneBoundaryMeters(zones, nLat, nLng);
  if (distance != null && distance <= ZONE_LIVE_STATUS_NEAR_BORDER_THRESHOLD_M) return 'near_border';
  return inside ? 'inside' : 'outside';
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

// Stato zona SOLO visivo, calcolato istantaneamente sull'ultima posizione
// nota — usato dalla card compatta Driver e dalla pagina mappa copertura.
// Distinto di proposito dallo stato debounced (evaluateGeofencePoint), che
// resta l'unica fonte per l'alert ufficiale "Sei fuori dalla zona".
export const INSTANT_ZONE_NEAR_BORDER_M = 40;

export function deriveInstantZoneStatus(zones, position, nearBorderM = INSTANT_ZONE_NEAR_BORDER_M) {
  const lat = toFiniteNumber(position?.lat);
  const lng = toFiniteNumber(position?.lng);
  if (lat == null || lng == null) return 'zone_unavailable';
  const inside = isPointInAnyZone(zones, lat, lng);
  if (inside === null) return 'zone_unavailable';
  const distance = estimateDistanceToZoneBoundaryMeters(zones, lat, lng);
  if (distance != null && distance <= nearBorderM) return 'near_border';
  return inside ? 'inside' : 'outside';
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
