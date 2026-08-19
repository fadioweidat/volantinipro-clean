const CRITICAL_ALERTS = new Set(['ZONE_BLOCKED', 'GPS_STALE', 'ASSIGNMENT_OVERDUE']);

const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function programStateForAssignments(assignments = []) {
  if (!assignments.length) return { key: 'none', label: 'Nessun programma' };
  if (assignments.every((item) => item.programConfirmedAt)) return { key: 'confirmed', label: 'Confermato' };
  if (assignments.some((item) => item.programOpenedAt)) return { key: 'opened', label: 'Aperto, da confermare' };
  if (assignments.some((item) => item.programSentAt)) return { key: 'sent', label: 'Inviato, da confermare' };
  return { key: 'prepared', label: 'Da preparare' };
}

export function presenceForGroup(groupId, liveOperators = []) {
  const signals = liveOperators.filter((item) => item?.group?.id === groupId || item?.session?.group_id === groupId);
  if (signals.some((item) => item.lifecycle === 'live')) return { key: 'online', label: 'Online' };
  if (signals.some((item) => item.lifecycle === 'warning')) return { key: 'warning', label: 'Segnale debole' };
  if (signals.some((item) => item.lifecycle === 'offline_recent')) return { key: 'offline', label: 'Offline' };
  return { key: 'unavailable', label: 'Non disponibile' };
}

export function buildTodayGroupCards({ operations = [], liveOperators = [], operators = [] } = {}) {
  const operatorById = new Map(operators.map((item) => [item.id || item.user_id, item]));
  const byGroup = new Map();

  for (const assignment of operations) {
    const groupId = assignment.group_id || `assignment:${assignment.id}`;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(assignment);
  }

  return [...byGroup.entries()].map(([groupId, assignments]) => {
    const first = assignments[0];
    const zones = assignments.flatMap((item) => item.zones || []);
    const sessions = assignments.flatMap((item) => item.sessions || []);
    const alerts = assignments.flatMap((item) => item.alerts || []);
    const critical = alerts.find((item) => item.level === 'red' || CRITICAL_ALERTS.has(item.code));
    const started = sessions.some((item) => ['started', 'paused'].includes(item.status));
    const completed = sessions.length > 0 && sessions.every((item) => item.status === 'completed');
    const program = programStateForAssignments(assignments);
    const presence = presenceForGroup(groupId, liveOperators);
    const operatorIds = [...new Set(assignments.map((item) => item.operator_id).filter(Boolean))];
    const contacts = operatorIds.map((id) => operatorById.get(id)).filter(Boolean);
    const phone = contacts.map((item) => clean(item.phone)).find(Boolean) || null;
    const quantity = zones.reduce((sum, zone) => sum + asNumber(zone.quantity), 0);
    const orderedZones = [...zones].sort((a, b) => asNumber(a.priority) - asNumber(b.priority));

    return {
      id: groupId,
      name: clean(first.operational_groups?.name) || 'Gruppo non disponibile',
      campaignId: first.campaign_id,
      campaign: clean(first.campaigns?.title) || 'Campagna non disponibile',
      assignments,
      primaryAssignmentId: first.id,
      primaryAssignmentAccessToken: first.access_token || null,
      operatorIds,
      operatorNames: assignments.map((item) => clean(item.operator_profiles?.display_name)).filter(Boolean),
      phone,
      zones: orderedZones,
      zoneLabel: orderedZones.map((item) => clean(item.name)).filter(Boolean).join(', ') || 'Zona non disponibile',
      quantity: quantity || null,
      presence,
      program,
      work: critical
        ? { key: 'problem', label: critical.label || 'Problema operativo' }
        : started
          ? { key: 'started', label: 'In distribuzione' }
          : completed
            ? { key: 'completed', label: 'Completato' }
            : { key: 'scheduled', label: 'Programmato' },
      problem: critical?.detail || critical?.label || null,
    };
  });
}

export function buildOperationalGroups({ groups = [], assignments = [], operators = [], liveOperators = [], campaigns = [] } = {}) {
  const operatorById = new Map(operators.map((item) => [item.id || item.user_id, item]));
  const campaignById = new Map(campaigns.map((item) => [item.id, item]));
  return groups.map((group) => {
    const groupAssignments = assignments.filter((item) => item.group_id === group.id);
    const activeAssignments = groupAssignments.filter((item) => item.status === 'active' && !item.revoked_at);
    const memberIds = [...new Set(activeAssignments.map((item) => item.operator_id).filter(Boolean))];
    const historicalMemberIds = [...new Set(groupAssignments.map((item) => item.operator_id).filter(Boolean))];
    return {
      ...group,
      campaign: campaignById.get(group.campaign_id) || null,
      members: memberIds.map((id) => operatorById.get(id)).filter(Boolean),
      activeAssignments,
      historicalMemberCount: historicalMemberIds.length,
      presence: presenceForGroup(group.id, liveOperators),
    };
  });
}
