// Geofence operativo rispetto alla ZONA ASSEGNATA alla sessione attiva
// (delivery_sessions.campaign_zone_id). Una sola valutazione per Admin
// header, Admin mappa e Cliente.
//
// Prima (diagnosi GPS 2026-10-01, sessione su PARCO NORD, GPS in BRUZZANO):
// header Admin = punto dentro UNA QUALSIASI zona della campagna ("In zona"),
// mappa Admin = sola zona selezionata ("Fuori zona 0,5 km"), Cliente =
// unione di tutte le zone ("Dentro la zona"). Tre zone di riferimento
// diverse per lo stesso punto.
//
// Regola:
//   - sessione con campaign_zone_id -> si valuta SOLO quella zona; se il suo
//     confine non e' ancora risolto lo stato e' "zona non disponibile" (mai
//     un ripiego silenzioso sull'unione, che direbbe "dentro" a torto);
//   - sessione senza campaign_zone_id (storico/legacy) -> unione delle zone
//     della campagna, come prima.
// Il motore (geofenceEngine.js) resta invariato: qui si sceglie solo QUALE
// zona passargli e QUALE punto valutare.
import {
  deriveLiveZoneStatus,
  estimateDistanceToZoneBoundaryMeters,
  summarizeGeofencePoints,
} from './geofenceEngine.js';
import { latestPointForSession } from '../gps/driverPresence.js';

/**
 * @param {{ sessionZoneId?: string|null, zoneIds?: string[], boundaries?: Record<string, object> }} p
 * @returns {{ mode: 'session'|'campaign', referenceZoneId: string|null, zones: Array<{kind:'polygon', geometry:object}> }}
 */
export function resolveOperationalZones({ sessionZoneId = null, zoneIds = [], boundaries = {} } = {}) {
  if (sessionZoneId) {
    const geometry = boundaries?.[sessionZoneId] || null;
    return {
      mode: 'session',
      referenceZoneId: sessionZoneId,
      zones: geometry ? [{ kind: 'polygon', geometry }] : [],
    };
  }
  return {
    mode: 'campaign',
    referenceZoneId: null,
    zones: (Array.isArray(zoneIds) ? zoneIds : [])
      .map((id) => boundaries?.[id])
      .filter(Boolean)
      .map((geometry) => ({ kind: 'polygon', geometry })),
  };
}

/**
 * Valutazione completa per la sessione attiva.
 * - liveStatus/distanceKm: ultimo punto GPS della sessione attiva vs zona di
 *   riferimento (stessa funzione pura del Driver: deriveLiveZoneStatus).
 * - history: debounce ufficiale (summarizeGeofencePoints) sui punti della
 *   sola sessione attiva, contro la stessa zona — per lo storico eventi.
 */
export function evaluateSessionGeofence({ activeSession = null, points = [], zoneIds = [], boundaries = {} } = {}) {
  const reference = resolveOperationalZones({
    sessionZoneId: activeSession?.campaign_zone_id || null,
    zoneIds,
    boundaries,
  });
  const allPoints = Array.isArray(points) ? points : [];
  const sessionPoints = activeSession?.id
    ? allPoints.filter((point) => point?.session_id === activeSession.id)
    : allPoints;
  const latestPoint = latestPointForSession(sessionPoints, null);
  const liveStatus = deriveLiveZoneStatus(reference.zones, latestPoint?.lat, latestPoint?.lng);
  let distanceKm = null;
  if (liveStatus === 'outside' && latestPoint) {
    const meters = estimateDistanceToZoneBoundaryMeters(reference.zones, latestPoint.lat, latestPoint.lng);
    distanceKm = meters != null ? meters / 1000 : null;
  }
  return {
    ...reference,
    latestPoint,
    liveStatus,
    distanceKm,
    history: summarizeGeofencePoints(sessionPoints, reference.zones),
  };
}

/**
 * Zona selezionata di default nella mappa Admin.
 * - Finche' l'Admin non sceglie a mano, segue SEMPRE la zona della sessione
 *   attiva (anche quando la sessione arriva DOPO le zone, o cambia zona).
 * - Una scelta manuale (anche "Tutti" = null) resta finche' valida.
 * - Senza sessione/zona di sessione: la selezione corrente se valida,
 *   altrimenti la prima zona in ordine stabile.
 */
export function resolveSelectedZoneId({ currentId = null, userPicked = false, sessionZoneId = null, zoneRows = [] } = {}) {
  const ids = new Set((Array.isArray(zoneRows) ? zoneRows : []).map((z) => z?.id).filter(Boolean));
  if (userPicked && (currentId == null || ids.has(currentId))) return currentId;
  if (sessionZoneId && ids.has(sessionZoneId)) return sessionZoneId;
  if (currentId && ids.has(currentId)) return currentId;
  return zoneRows?.[0]?.id || null;
}
