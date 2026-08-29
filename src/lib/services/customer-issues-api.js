import { supabase, ensureSupabaseSessionBridge } from '../../supabaseClient.js';
import { getDeviceInstallationId } from '../gps/deviceInstallationId.js';

// Segnalazioni Cliente -> Autista. Tutte le scritture passano da RPC
// SECURITY DEFINER (autorizzazione riletta server-side). Nessun access_token
// viene mai loggato o incluso nei payload.

async function callIssueRpc(name, args = {}) {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const mapped = new Error(error.message || 'Operazione segnalazione non riuscita.');
    mapped.code = error.code || null;
    throw mapped;
  }
  return data;
}

export const ISSUE_REASONS = Object.freeze([
  { value: 'non_ricevuto', label: 'Non ho ricevuto il volantino' },
  { value: 'via_non_coperta', label: 'Via apparentemente non coperta' },
  { value: 'zona_da_verificare', label: 'Zona da verificare' },
  { value: 'altro', label: 'Altro' },
]);

export const ISSUE_STATUS_LABELS = Object.freeze({
  new: 'Nuova',
  assigned: 'Assegnata',
  in_progress: 'Presa in carico',
  resolved: 'Risolta',
  not_resolvable: 'Non risolvibile',
});

// --- Cliente ---------------------------------------------------------------

/** Crea una segnalazione. Il routing all'autista e' automatico lato server;
 *  fallback coda Admin se l'assegnazione non e' certa. */
export async function createCustomerIssue({ campaignId, municipality, street, houseNumber = null, lat = null, lng = null, reason, notes = null }) {
  return callIssueRpc('customer_create_issue', {
    p_campaign_id: campaignId,
    p_municipality: municipality,
    p_street: street,
    p_house_number: houseNumber,
    p_lat: lat,
    p_lng: lng,
    p_reason: reason,
    p_notes: notes,
  });
}

/** Segnalazioni della campagna (owner) con eventi + foto di verifica. */
export async function getCustomerIssues(campaignId) {
  return callIssueRpc('get_customer_issues', { p_campaign_id: campaignId });
}

// --- Driver (auth o token) ----------------------------------------------------

export async function driverListIssues(assignmentId, accessToken = null) {
  return callIssueRpc('driver_list_issues', { p_assignment_id: assignmentId, p_access_token: accessToken });
}

export async function driverTransitionIssue({ issueId, action, note = null, assignmentId = null, accessToken = null }) {
  return callIssueRpc('driver_transition_issue', {
    p_issue_id: issueId,
    p_action: action,
    p_note: note,
    p_assignment_id: assignmentId,
    p_access_token: accessToken,
  });
}

// --- Admin ------------------------------------------------------------------

export async function adminListIssues(campaignId = null) {
  return callIssueRpc('admin_list_issues', { p_campaign_id: campaignId });
}

export async function adminRouteIssue(issueId, assignmentId) {
  return callIssueRpc('admin_route_issue', { p_issue_id: issueId, p_assignment_id: assignmentId });
}

export { getDeviceInstallationId };
