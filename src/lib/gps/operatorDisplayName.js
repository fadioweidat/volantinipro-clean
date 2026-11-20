// Nomi operatori nel monitor GPS (2026-11-20, prova GPS 2 telefoni).
//
// Le assegnazioni senza profilo operatore (caposquadra-fornitore, partecipanti
// entrati dal link di gruppo) hanno sessioni con driver_id = id assegnazione e
// nessun driver_name: displayDriverName mostrava "Operatore 8b01fd". Il nome
// reale esiste altrove:
//  - partecipante dal link di gruppo -> participant_label ("OP 4");
//  - assegnazione personale senza operatore (caposquadra/fornitore) ->
//    referente del gruppo (operational_groups.lead_name), "· Caposquadra";
//  - operatore con profilo -> operator_profiles.display_name.
// Mai un nome inventato: se manca tutto, "Nome non disponibile · <id>".

const GENERIC_LABEL = /^OP\s*\d+$/i;

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/**
 * @param {{ assignment?: object|null, group?: object|null, profileName?: string|null, fallbackId?: string|null }} input
 * @returns {string}
 */
export function resolveOperatorDisplayName({ assignment = null, group = null, profileName = null, fallbackId = null } = {}) {
  const profile = clean(profileName);
  if (profile && !GENERIC_LABEL.test(profile)) return profile;
  if (assignment) {
    const label = clean(assignment.participant_label);
    const viaGroupLink = Boolean(assignment.group_access_link_id);
    if (viaGroupLink && label) return label;
    if (!viaGroupLink && !assignment.operator_id) {
      const lead = clean(group?.lead_name) || clean(assignment.metadata?.supplier_contact_name) || clean(assignment.metadata?.supplier_name);
      if (lead) return `${lead} · Caposquadra`;
      return `Nome non disponibile · ${String(assignment.id || fallbackId || '').slice(0, 6)} · Caposquadra`;
    }
    if (label) return label;
  }
  if (profile) return profile;
  return `Nome non disponibile · ${String(fallbackId || assignment?.id || '').slice(0, 6)}`;
}

/**
 * Copertura minima della zona dalle sessioni GPS, quando campaign_zone_progress
 * non ha ancora un valore. Il valore reale (unione delle tracce) e' >= della
 * sessione migliore, quindi si mostra "almeno X%". Le sessioni annullate
 * (prove chiuse) non contano.
 * @param {Array<{campaign_zone_id?: string, coverage_percent?: number|string, calculation_status?: string, session_status?: string}>} rows
 * @returns {Map<string, {percent: number, sessions: number}>}
 */
export function sessionCoverageByZone(rows = []) {
  const byZone = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.campaign_zone_id || row.calculation_status !== 'ready') continue;
    if (row.session_status === 'cancelled') continue;
    const percent = Number(row.coverage_percent);
    if (!Number.isFinite(percent)) continue;
    const prev = byZone.get(row.campaign_zone_id) || { percent: 0, sessions: 0 };
    byZone.set(row.campaign_zone_id, { percent: Math.max(prev.percent, percent), sessions: prev.sessions + 1 });
  }
  return byZone;
}
