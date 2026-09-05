import { supabase, ensureSupabaseSessionBridge } from '../../supabaseClient.js';

// TICKET — CUSTOMER CONTROL CENTER + ADMIN HUB + DRIVER MESSAGING.
// Messaggistica Cliente<->Admin e Driver<->Admin + richieste di modifica
// campagna. Cliente<->Driver diretto e' STRUTTURALMENTE impossibile (vedi
// vincolo CHECK in conversation_messages, migration 20260905130000): nessuna
// funzione qui sotto accetta un destinatario diverso da 'admin' per
// Cliente/Driver. Tutte le scritture passano da RPC SECURITY DEFINER,
// stesso pattern di customer-issues-api.js.

// PARTE H (WhatsApp): nessuna WhatsApp Business Platform/Cloud API
// configurata in questo progetto (verificato: nessun webhook, nessun
// provider, nessun token in Supabase Secrets — solo link wa.me di
// click-to-chat in contactConfig.js, non un canale integrabile
// nell'inbox). Lo schema (colonna `channel`) e' gia' pronto per un futuro
// adapter WhatsApp, ma NESSUN messaggio viene finto come inviato via
// WhatsApp: ogni messaggio creato da queste funzioni ha channel='in_app'.
export const WHATSAPP_STATUS = Object.freeze({ configured: false, mode: 'adapter_ready' });

async function callHubRpc(name, args = {}) {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const mapped = new Error(error.message || 'Operazione non riuscita.');
    mapped.code = error.code || null;
    throw mapped;
  }
  return data;
}

export const MODIFICATION_TYPES = Object.freeze([
  { value: 'quantita', label: 'Quantità' },
  { value: 'zona', label: 'Zona' },
  { value: 'servizio', label: 'Servizio' },
  { value: 'data', label: 'Data' },
  { value: 'extra', label: 'Servizi extra' },
  { value: 'stampa', label: 'Stampa' },
  { value: 'grafica', label: 'Grafica' },
  { value: 'altro', label: 'Altro' },
]);

export const MODIFICATION_STATUS_LABELS = Object.freeze({
  pending: 'In attesa',
  approved: 'Approvata',
  rejected: 'Rifiutata',
  applied: 'Applicata',
  cancelled: 'Annullata',
});

// --- Cliente ---------------------------------------------------------------

export async function customerListMessages(campaignId) {
  return callHubRpc('customer_list_messages', { p_campaign_id: campaignId });
}

export async function customerSendMessage({ campaignId, text, issueId = null, modificationRequestId = null }) {
  return callHubRpc('customer_send_message', {
    p_campaign_id: campaignId, p_text: text, p_issue_id: issueId, p_modification_request_id: modificationRequestId,
  });
}

export async function customerMarkMessagesSeen(campaignId) {
  return callHubRpc('customer_mark_messages_seen', { p_campaign_id: campaignId });
}

export async function customerCreateModificationRequest({ campaignId, type, currentValue = {}, requestedValue = {}, note = null }) {
  return callHubRpc('customer_create_modification_request', {
    p_campaign_id: campaignId, p_type: type, p_current_value: currentValue, p_requested_value: requestedValue, p_note: note,
  });
}

export async function customerListModificationRequests(campaignId) {
  return callHubRpc('customer_list_modification_requests', { p_campaign_id: campaignId });
}

// --- Driver (auth o token, mai Magic Link/OTP) ------------------------------

export async function driverListMessages(assignmentId, accessToken = null) {
  return callHubRpc('driver_list_messages', { p_assignment_id: assignmentId, p_access_token: accessToken });
}

export async function driverSendMessage({ assignmentId, text, accessToken = null, issueId = null }) {
  return callHubRpc('driver_send_message', {
    p_assignment_id: assignmentId, p_text: text, p_access_token: accessToken, p_issue_id: issueId,
  });
}

export async function driverMarkMessagesSeen(assignmentId, accessToken = null) {
  return callHubRpc('driver_mark_messages_seen', { p_assignment_id: assignmentId, p_access_token: accessToken });
}

// --- Admin -------------------------------------------------------------------

export async function adminListConversations({ kind = null, unreadOnly = false } = {}) {
  return callHubRpc('admin_list_conversations', { p_kind: kind, p_unread_only: unreadOnly });
}

// TICKET — FIX FIRST MESSAGE ADMIN -> DRIVER: elenca TUTTI gli assignment
// reali (non solo quelli con gia' una conversazione), cosi' l'Admin puo'
// scrivere per primo a un Driver che non ha mai scritto.
export async function adminListDriverDirectory() {
  return callHubRpc('admin_list_driver_directory');
}

// Get-or-create la conversazione driver_admin + invia come Admin — stesso
// path sia per il primo messaggio sia per i successivi (idempotente).
export async function adminSendDriverMessage({ assignmentId, text }) {
  return callHubRpc('admin_send_driver_message', { p_assignment_id: assignmentId, p_text: text });
}

export async function adminListMessages(conversationId) {
  return callHubRpc('admin_list_messages', { p_conversation_id: conversationId });
}

export async function adminSendMessage({ conversationId, text, issueId = null, modificationRequestId = null }) {
  return callHubRpc('admin_send_message', {
    p_conversation_id: conversationId, p_text: text, p_issue_id: issueId, p_modification_request_id: modificationRequestId,
  });
}

export async function adminMarkMessagesSeen(conversationId) {
  return callHubRpc('admin_mark_messages_seen', { p_conversation_id: conversationId });
}

export async function adminListModificationRequests({ campaignId = null, status = null } = {}) {
  return callHubRpc('admin_list_modification_requests', { p_campaign_id: campaignId, p_status: status });
}

export async function adminDecideModificationRequest({ requestId, decision, adminNote = null }) {
  return callHubRpc('admin_decide_modification_request', { p_request_id: requestId, p_decision: decision, p_admin_note: adminNote });
}
