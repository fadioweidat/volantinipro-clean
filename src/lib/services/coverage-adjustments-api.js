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

/** Crea una correzione manuale (solo Admin — verificato server-side). */
export async function createCoverageAdjustment({ campaignId, zoneId = null, adjustmentType, geometryGeoJson, reason, notes = null, metadata = {} }) {
  return callCoverageRpc('admin_create_coverage_adjustment', {
    p_campaign_id: campaignId,
    p_zone_id: zoneId,
    p_adjustment_type: adjustmentType,
    p_geometry_geojson: geometryGeoJson,
    p_reason: reason,
    p_notes: notes,
    p_metadata: metadata,
  });
}

/** Modifica una correzione non revocata (solo Admin). */
export async function updateCoverageAdjustment({ adjustmentId, adjustmentType, geometryGeoJson = null, reason, notes = null, metadata = null }) {
  return callCoverageRpc('admin_update_coverage_adjustment', {
    p_adjustment_id: adjustmentId,
    p_adjustment_type: adjustmentType,
    p_geometry_geojson: geometryGeoJson,
    p_reason: reason,
    p_notes: notes,
    p_metadata: metadata,
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
