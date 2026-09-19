// Identita' "umane" per le conversazioni dell'Hub Comunicazioni Admin.
// SOLO presentazione: legge dati canonici gia' esistenti (campaigns,
// profiles, operator_profiles, operational_groups) e non li duplica nelle
// righe conversazione. Il codice tecnico (UUID) e' SOLO ultimo fallback e
// mai il titolo principale quando esiste un nome reale.

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
  const raw = clean(dir?.campaign_name) || clean(dir?.title) || clean(dir?.zone_name);
  if (!raw) return null;
  return /^campagna\b/i.test(raw) ? raw : `Campagna ${raw}`;
}

/** Cliente: azienda > nome cliente > campagna/zona > "Cliente" > id breve. */
export function resolveCustomerIdentity(conversation = {}, directory = {}) {
  const company = clean(directory.company_name);
  const person = clean(directory.customer_name) || clean(directory.client_name) || clean(directory.profile_full_name)
    || clean(conversation.customer_name);
  const campaign = campaignLabel({
    campaign_name: directory.campaign_name || conversation.campaign_name,
    title: directory.title,
    zone_name: directory.zone_name || directory.city,
  });
  const name = company || person;
  const title = name || campaign || 'Cliente';
  const secondaryParts = [];
  if (name && campaign) secondaryParts.push(campaign);
  const city = clean(directory.city);
  if (city && !(campaign || '').toLowerCase().includes(city.toLowerCase())) secondaryParts.push(city);
  return {
    kindLabel: 'Cliente',
    title,
    subtitle: secondaryParts.join(' · ') || null,
    campaign,
    // Riga tecnica secondaria: SOLO se non c'e' nessun nome da mostrare.
    technicalId: title === 'Cliente' ? shortTechnicalId(conversation.campaign_id) : null,
  };
}

/** Driver: operatore > nome driver > gruppo > "Driver" > id breve. */
export function resolveDriverIdentity(conversation = {}, directory = {}) {
  const operator = clean(directory.operator_name) || clean(conversation.operator_name)
    || clean(directory.participant_label);
  const group = clean(directory.group_name);
  const campaign = campaignLabel({
    campaign_name: directory.campaign_name || conversation.campaign_name,
    title: directory.title,
    zone_name: directory.zone_name || conversation.zone_name,
  });
  let title;
  if (operator && group) title = `${operator} · ${group}`;
  else if (operator) title = operator;
  else if (group) title = `Gruppo ${group}`;
  else title = 'Driver';
  return {
    kindLabel: 'Driver',
    title,
    subtitle: campaign,
    campaign,
    groupLabel: group ? `Gruppo ${group}` : null,
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
