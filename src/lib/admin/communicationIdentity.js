// Identita' "umane" per le conversazioni dell'Hub Comunicazioni Admin.
// SOLO presentazione: legge dati canonici gia' esistenti (campaigns,
// profiles, operator_profiles, operational_groups) e non li duplica nelle
// righe conversazione. Il codice tecnico non e' mai un titolo principale.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  // Un UUID (anche mascherato da "nome") non e' un nome umano.
  if (UUID_RE.test(text)) return null;
  return text;
}

export function shortTechnicalId(id) {
  return String(id || '').slice(0, 8);
}

function campaignLabel(dir) {
  const raw = clean(dir?.business_name) || clean(dir?.campaign_name) || clean(dir?.title);
  const realZones = (Array.isArray(dir?.real_zone_names) ? dir.real_zone_names : [])
    .map(clean).filter(Boolean);
  // "Campagna Preventivo (Nome cliente)" non e' il nome pubblicizzato.
  // Preferisci zone canoniche, mai nomi commerciali inventati.
  if ((!raw || /^campagna preventivo(?:\s*\([^)]*\))?$/i.test(raw))
      && realZones.length) {
    const distinct = [...new Set(realZones)];
    const label = distinct.length <= 2 ? distinct.join(' + ') : `${distinct.slice(0, 2).join(' + ')} +${distinct.length - 2}`;
    return `Distribuzione volantini · ${label}`;
  }
  if (!raw) return null;
  return /^campagna\b/i.test(raw) ? raw : `Campagna ${raw}`;
}

// Non dedurre provincia o comune dal titolo della campagna.
export function getConversationLocationLabel(conversation = {}, directory = {}) {
  const location = (Array.isArray(directory.real_zone_names) && directory.real_zone_names.length === 1
    ? clean(directory.real_zone_names[0]) : null)
    || clean(directory.city) || clean(conversation.city)
    || clean(directory.zone_name) || clean(conversation.zone_name);
  if (!location) return 'Località non disponibile';
  return location.replace(/\s*\(\s*([a-z]{2})\s*\)\s*$/i, (_, code) => ` (${code.toUpperCase()})`);
}

export function getConversationPreview(conversation = {}) {
  const text = typeof conversation.last_message?.text === 'string' ? conversation.last_message.text.trim() : '';
  return text || (conversation.kind === 'driver_admin' && !conversation.id
    ? 'Nessuna conversazione ancora — scrivi il primo messaggio'
    : 'Nessun messaggio ancora');
}

/** Cliente: azienda > nome cliente > "Cliente". Campagna sempre separata. */
export function resolveCustomerIdentity(conversation = {}, directory = {}) {
  const company = clean(directory.company_name);
  const person = clean(directory.customer_name) || clean(directory.client_name) || clean(directory.profile_full_name)
    || clean(conversation.customer_name);
  const campaign = campaignLabel({
    ...directory,
    campaign_name: clean(directory.campaign_name) || clean(conversation.campaign_name),
  });
  const name = company || person;
  const title = name || 'Cliente';
  const locationLabel = getConversationLocationLabel(conversation, directory);
  return {
    kindLabel: 'Cliente',
    title,
    subtitle: [campaign || 'Campagna', locationLabel].join(' · '),
    campaign: campaign || 'Campagna',
    locationLabel,
    // Riga tecnica secondaria: SOLO se non c'e' nessun nome da mostrare.
    technicalId: title === 'Cliente' ? shortTechnicalId(conversation.campaign_id) : null,
  };
}

/** Driver: operatore > nome driver > gruppo > "Driver" > id breve. */
export function resolveDriverIdentity(conversation = {}, directory = {}) {
  const operator = clean(directory.operator_name) || clean(conversation.operator_name)
    || clean(directory.participant_label);
  const group = clean(directory.group_name) || clean(conversation.group_name);
  const groupLabel = group ? (/^gruppo\b/i.test(group) ? group : `Gruppo ${group}`) : null;
  const campaign = campaignLabel({
    ...directory,
    campaign_name: clean(directory.campaign_name) || clean(conversation.campaign_name),
  });
  let title;
  if (operator && group) title = `${operator} · ${group}`;
  else if (operator) title = operator;
  else if (group) title = groupLabel;
  else title = 'Driver';
  return {
    kindLabel: 'Driver',
    title,
    subtitle: campaign,
    campaign,
    groupLabel,
    locationLabel: getConversationLocationLabel(conversation, directory),
    assignmentLabel: conversation.assignment_id ? `Assignment #${shortTechnicalId(conversation.assignment_id)}` : null,
    technicalId: title === 'Driver' ? shortTechnicalId(conversation.assignment_id) : null,
  };
}

export function resolveConversationIdentity(conversation, directories = {}) {
  if (conversation?.kind === 'customer_admin') {
    return resolveCustomerIdentity(conversation, directories.campaigns?.[conversation.campaign_id] || {});
  }
  const assignment = directories.assignments?.[conversation?.assignment_id] || {};
  const campaign = directories.campaigns?.[conversation?.campaign_id] || {};
  return resolveDriverIdentity(conversation, { ...campaign, ...assignment });
}
