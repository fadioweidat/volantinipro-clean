import { supabase, ensureSupabaseSessionBridge } from '../../supabaseClient.js';

// Stesso bridge richiesto da gps-api.js/customer-api.js: senza, il client SDK
// usato da supabase.rpc() resta senza sessione anche subito dopo un login
// riuscito con il client REST leggero (vp_supabase_session).
async function callCoverageRpc(name, args = {}) {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw mapCoverageRpcError(error);
  return data;
}

function mapCoverageRpcError(error) {
  const message = String(error?.message || '');
  const mapped = new Error(message || 'Operazione correzione copertura non riuscita.');
  mapped.code = error?.code || null;
  mapped.forbidden = /ADMIN_NON_AUTORIZZATO|CAMPAGNA_NON_AUTORIZZATA|permission denied/i.test(message);
  return mapped;
}

/** Lista correzioni per una campagna (filtrata per ruolo lato RPC). */
export async function listCoverageAdjustments(campaignId) {
  return callCoverageRpc('get_campaign_coverage_adjustments', { p_campaign_id: campaignId });
}

/** Copertura operativa finale separata per fonte (GPS/manuale/inaccessibile). */
export async function getFinalCoverage(campaignId) {
  return callCoverageRpc('calculate_campaign_final_coverage', { p_campaign_id: campaignId });
}

/** Crea una correzione verificata (solo Admin — verificato server-side).
 * source: 'manual_verified' | 'automatic_verified' | 'gps_exclusion'.
 * gps_exclusion = GOMMA sul GPS reale: overlay che sottrae un tratto, MAI un
 * DELETE su gps_tracking_points. geometryGeoJson puo' essere LineString
 * (matita a tratto) per manual/automatic: in quel caso lineBufferM e' il
 * raggio di buffer (m). */
export async function createCoverageAdjustment({
  campaignId, zoneId = null, adjustmentType, geometryGeoJson, reason, notes = null,
  metadata = {}, source = 'manual_verified', lineBufferM = null,
}) {
  return callCoverageRpc('admin_create_coverage_adjustment', {
    p_campaign_id: campaignId,
    p_zone_id: zoneId,
    p_adjustment_type: adjustmentType,
    p_geometry_geojson: geometryGeoJson,
    p_reason: reason,
    p_notes: notes,
    p_metadata: metadata,
    p_source: source,
    p_line_buffer_m: lineBufferM,
  });
}

/** Modifica/corregge una correzione non revocata (solo Admin). */
export async function updateCoverageAdjustment({
  adjustmentId, adjustmentType, geometryGeoJson = null, reason, notes = null,
  metadata = null, source = null, lineBufferM = null,
}) {
  return callCoverageRpc('admin_update_coverage_adjustment', {
    p_adjustment_id: adjustmentId,
    p_adjustment_type: adjustmentType,
    p_geometry_geojson: geometryGeoJson,
    p_reason: reason,
    p_notes: notes,
    p_metadata: metadata,
    p_source: source,
    p_line_buffer_m: lineBufferM,
  });
}

/** Revoca una correzione (solo Admin): la riga resta come storico, mai cancellata. */
export async function revokeCoverageAdjustment({ adjustmentId, reason }) {
  return callCoverageRpc('admin_revoke_coverage_adjustment', {
    p_adjustment_id: adjustmentId,
    p_reason: reason,
  });
}

export const COVERAGE_ADJUSTMENT_TYPES = Object.freeze([
  { value: 'manual_covered', label: 'Coperta manualmente' },
  { value: 'partially_covered', label: 'Parzialmente coperta' },
  { value: 'inaccessible', label: 'Non accessibile' },
]);

// Livello di editing nel Monitor Admin. La GOMMA e' disponibile su TUTTI e
// tre: gps (crea un'esclusione overlay, mai tocca gps_tracking_points),
// automatic e manual (matita/gomma su tratti verificati).
export const COVERAGE_SOURCE_LEVELS = Object.freeze([
  { value: 'gps_exclusion', label: 'GPS reale', diagnostic: 'GPS REALE' },
  { value: 'automatic_verified', label: 'Automatico Admin', diagnostic: 'AUTOMATICO ADMIN' },
  { value: 'manual_verified', label: 'Manuale Admin', diagnostic: 'MANUALE ADMIN' },
]);

// Stile UNICO della copertura finale — identico per Admin ("Copertura
// finale") e Cliente ("Copertura verificata"). Nessuna variazione per source.
export const VERIFIED_COVERAGE_STYLE = Object.freeze({
  color: '#16a34a',
  fillColor: '#16a34a',
  fillOpacity: 0.22,
  weight: 2,
  opacity: 1,
});

// LineString a partire da una lista [lat,lng]. Usato dalla matita "a tratto".
export function latLngsToLineStringGeoJson(latlngs) {
  return { type: 'LineString', coordinates: (latlngs || []).map(([lat, lng]) => [lng, lat]) };
}
