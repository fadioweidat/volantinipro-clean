import { supabase } from '../../supabaseClient.js';
import { driverDiag } from '../diagnostics/driverDiagnostics.js';

/**
 * Unisce una lista esistente di messaggi con uno o più nuovi messaggi,
 * garantendo:
 *   1. Deduplicazione rigorosa per ID (nessun messaggio duplicato).
 *   2. Ordinamento cronologico canonico per `created_at` (ascendente).
 *   3. Aggiornamento dello stato (es. seen_at) se il messaggio esiste già.
 */
export function mergeMessages(existingList = [], incoming) {
  const safeExisting = Array.isArray(existingList) ? existingList : [];
  if (!incoming) return safeExisting;
  const items = Array.isArray(incoming) ? incoming : [incoming];
  if (items.length === 0) return safeExisting;

  const map = new Map();
  for (const m of safeExisting) {
    if (m && m.id) map.set(m.id, m);
  }
  for (const m of items) {
    if (m && m.id) {
      const prev = map.get(m.id);
      map.set(m.id, prev ? { ...prev, ...m } : m);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const tA = new Date(a.created_at || 0).getTime();
    const tB = new Date(b.created_at || 0).getTime();
    if (tA !== tB) return tA - tB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Calcola il conteggio dei messaggi non letti per un determinato ruolo.
 */
export function countUnreadMessages(messages = [], recipientRole = 'driver') {
  if (!Array.isArray(messages)) return 0;
  return messages.filter((m) => m && m.recipient_role === recipientRole && !m.seen_at).length;
}

/** Invalidations only. Payloads are deliberately ignored: authorized RPCs own
 * message content and access checks, including on public Driver channels.
 * client is injectable to test the actual subscription contract.
 */
export function subscribeToMessageInvalidations(topic, { onChanged, onStatusChange } = {}, client = supabase) {
  if (!client || !topic) return { unsubscribe() {} };
  let active = true;
  const channel = client.channel(topic, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'messages_changed' }, () => {
    if (active) onChanged?.();
  }).subscribe((status) => {
    if (!active) return;
    onStatusChange?.(status);
    if (status === 'SUBSCRIBED') onChanged?.();
  });
  return {
    channel,
    unsubscribe() {
      active = false;
      try { Promise.resolve(client.removeChannel(channel)).catch(() => {}); } catch { /* cleanup */ }
    },
  };
}

export function subscribeToDriverMessages(assignmentId, options = {}) {
  return subscribeToMessageInvalidations(assignmentId ? `assignment:${assignmentId}` : null, {
    ...options,
    onStatusChange(status) {
      driverDiag.record('REALTIME', 'status', { state: String(status).toLowerCase() });
      options.onStatusChange?.(status);
    },
  });
}
export function subscribeToAdminMessages(options = {}) {
  return subscribeToMessageInvalidations('admin:messages', options);
}
export function subscribeToConversation(conversationId, options = {}) {
  return subscribeToMessageInvalidations(conversationId ? `conversation:${conversationId}` : null, options);
}
export function subscribeToCustomerMessages(campaignId, options = {}) {
  return subscribeToMessageInvalidations(campaignId ? `campaign:${campaignId}` : null, options);
}
