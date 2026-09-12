import { supabase } from '../../supabaseClient.js';

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

/**
 * Iscrizione Realtime per il Driver sul canale dell'assignment.
 * Ascolta sia i messaggi broadcast dal database/admin che le conferme di lettura.
 */
export function subscribeToDriverMessages(assignmentId, { onMessage, onSeen, onStatusChange } = {}) {
  if (!supabase || !assignmentId) {
    return { unsubscribe: () => {}, broadcastMessage: async () => {} };
  }

  const topic = `assignment:${assignmentId}`;
  const channel = supabase.channel(topic, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      if (payload && onMessage) onMessage(payload);
    })
    .on('broadcast', { event: 'messages_seen' }, ({ payload }) => {
      if (payload && onSeen) onSeen(payload);
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_messages' },
      (payload) => {
        if (payload?.new && onMessage) onMessage(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_messages' },
      (payload) => {
        if (payload?.new && onSeen) onSeen(payload.new);
      }
    )
    .subscribe((status) => {
      if (onStatusChange) onStatusChange(status);
    });

  const broadcastMessage = async (msg) => {
    try {
      if (channel && msg) {
        await channel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: msg,
        });
      }
    } catch {
      // best effort — la transazione DB ha già inviato o invierà via trigger
    }
  };

  const unsubscribe = () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // safe cleanup
    }
  };

  return { unsubscribe, broadcastMessage, channel };
}

/**
 * Iscrizione Realtime per l'Admin Hub generale (`admin:messages`).
 * Notifica l'arrivo di nuovi messaggi da qualunque Driver o Cliente.
 */
export function subscribeToAdminMessages({ onMessage, onSeen, onStatusChange } = {}) {
  if (!supabase) {
    return { unsubscribe: () => {} };
  }

  const topic = 'admin:messages';
  const channel = supabase.channel(topic, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      if (payload && onMessage) onMessage(payload);
    })
    .on('broadcast', { event: 'messages_seen' }, ({ payload }) => {
      if (payload && onSeen) onSeen(payload);
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_messages' },
      (payload) => {
        if (payload?.new && onMessage) onMessage(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_messages' },
      (payload) => {
        if (payload?.new && onSeen) onSeen(payload.new);
      }
    )
    .subscribe((status) => {
      if (onStatusChange) onStatusChange(status);
    });

  const unsubscribe = () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // safe cleanup
    }
  };

  return { unsubscribe, channel };
}

/**
 * Iscrizione Realtime su una specifica conversazione (`conversation:${id}`).
 */
export function subscribeToConversation(conversationId, { onMessage, onSeen, onStatusChange } = {}) {
  if (!supabase || !conversationId) {
    return { unsubscribe: () => {}, broadcastMessage: async () => {} };
  }

  const topic = `conversation:${conversationId}`;
  const channel = supabase.channel(topic, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      if (payload && onMessage) onMessage(payload);
    })
    .on('broadcast', { event: 'messages_seen' }, ({ payload }) => {
      if (payload && onSeen) onSeen(payload);
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        if (payload?.new && onMessage) onMessage(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        if (payload?.new && onSeen) onSeen(payload.new);
      }
    )
    .subscribe((status) => {
      if (onStatusChange) onStatusChange(status);
    });

  const broadcastMessage = async (msg) => {
    try {
      if (channel && msg) {
        await channel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: msg,
        });
      }
    } catch {
      // best-effort
    }
  };

  const unsubscribe = () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // safe cleanup
    }
  };

  return { unsubscribe, broadcastMessage, channel };
}

/**
 * Iscrizione Realtime per il Cliente sulla sua campagna (`campaign:${id}`).
 */
export function subscribeToCustomerMessages(campaignId, { onMessage, onSeen, onStatusChange } = {}) {
  if (!supabase || !campaignId) {
    return { unsubscribe: () => {}, broadcastMessage: async () => {} };
  }

  const topic = `campaign:${campaignId}`;
  const channel = supabase.channel(topic, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      if (payload && onMessage) onMessage(payload);
    })
    .on('broadcast', { event: 'messages_seen' }, ({ payload }) => {
      if (payload && onSeen) onSeen(payload);
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_messages' },
      (payload) => {
        if (payload?.new && onMessage) onMessage(payload.new);
      }
    )
    .subscribe((status) => {
      if (onStatusChange) onStatusChange(status);
    });

  const broadcastMessage = async (msg) => {
    try {
      if (channel && msg) {
        await channel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: msg,
        });
      }
    } catch {
      // best-effort
    }
  };

  const unsubscribe = () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // safe cleanup
    }
  };

  return { unsubscribe, broadcastMessage, channel };
}
