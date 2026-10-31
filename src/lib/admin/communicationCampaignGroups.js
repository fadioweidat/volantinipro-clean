// Una card Admin per campagna, chat Cliente e Driver distinte all'interno.
// Nessuna fusione di conversation_id o messaggi, nessun rapporto Cliente↔Driver.
export function resolveCommunicationCampaign(conversation, directory = {}) {
  if (conversation.campaign_id) return conversation;
  if (conversation.kind !== 'driver_admin' || !conversation.assignment_id) return conversation;
  const campaignId = directory.assignments?.[conversation.assignment_id]?.campaign_id;
  return campaignId ? { ...conversation, campaign_id: campaignId } : conversation;
}

export function groupCommunicationsByCampaign(conversations = []) {
  const groups = new Map();
  for (const conversation of conversations) {
    if (!conversation || !conversation.key) continue;
    // Senza campaign_id NON abbinare chat per nome cliente, città o Driver.
    const key = conversation.campaign_id
      ? `campaign:${conversation.campaign_id}`
      : `unlinked:${conversation.key}`;
    if (!groups.has(key)) {
      groups.set(key, { key, campaignId: conversation.campaign_id || null, conversations: [], unreadCount: 0, lastActivity: 0 });
    }
    const group = groups.get(key);
    group.conversations.push(conversation);
    group.unreadCount += Math.max(0, Number(conversation.unread_count) || 0);
    const when = Date.parse(conversation.last_message?.created_at || conversation.updated_at || '');
    if (Number.isFinite(when)) group.lastActivity = Math.max(group.lastActivity, when);
  }

  return [...groups.values()].map((group) => {
    // La label e' identica per Cliente/Driver della stessa campagna, quando
    // disponibile dalla directory. Non scegliere mai un'altra campagna.
    const named = group.conversations.find((c) => c.identity?.campaign && c.identity.campaign !== 'Campagna');
    const first = named || group.conversations[0];
    const identity = first.identity || {};
    return {
      ...group,
      label: identity.campaign || (group.campaignId ? 'Campagna senza nome' : 'Campagna non collegata'),
      location: identity.locationLabel && identity.locationLabel !== 'Località non disponibile' ? identity.locationLabel : null,
    };
  }).sort((a, b) => b.lastActivity - a.lastActivity || a.key.localeCompare(b.key));
}
