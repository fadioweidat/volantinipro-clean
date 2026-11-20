// Letture admin (sola lettura) per nomi operatori e copertura zona dalle
// sessioni. Se una lettura fallisce si torna ai dati originali: il monitor non
// deve mai rompersi per un nome.
import { resolveOperatorDisplayName, sessionCoverageByZone } from '../gps/operatorDisplayName.js';

const unique = (values) => Array.from(new Set(values.filter(Boolean).map(String)));

/** Aggiunge session.operator_display_name alle righe { session } del monitor. */
export async function enrichSessionsWithOperatorNames(client, rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const assignmentIds = unique(list.map((row) => row?.session?.assignment_id));
  if (!client || assignmentIds.length === 0) return list;
  try {
    const { data: assignments, error } = await client
      .from('operator_assignments')
      .select('id,operator_id,group_id,participant_label,group_access_link_id,metadata')
      .in('id', assignmentIds);
    if (error || !Array.isArray(assignments)) return list;
    const groupIds = unique(assignments.map((a) => a.group_id));
    const operatorIds = unique(assignments.map((a) => a.operator_id));
    const [groupsRes, profilesRes] = await Promise.all([
      groupIds.length ? client.from('operational_groups').select('id,lead_name').in('id', groupIds) : Promise.resolve({ data: [] }),
      operatorIds.length ? client.from('operator_profiles').select('user_id,display_name').in('user_id', operatorIds) : Promise.resolve({ data: [] }),
    ]);
    const groups = new Map((groupsRes?.data || []).map((g) => [String(g.id), g]));
    const profiles = new Map((profilesRes?.data || []).map((p) => [String(p.user_id), p.display_name]));
    const byId = new Map(assignments.map((a) => [String(a.id), a]));
    return list.map((row) => {
      const assignment = byId.get(String(row?.session?.assignment_id || ''));
      if (!assignment || row?.session?.driver_name) return row;
      const name = resolveOperatorDisplayName({
        assignment,
        group: groups.get(String(assignment.group_id || '')) || null,
        profileName: assignment.operator_id ? profiles.get(String(assignment.operator_id)) : null,
        fallbackId: row.session.driver_id,
      });
      return { ...row, session: { ...row.session, operator_display_name: name } };
    });
  } catch {
    return list;
  }
}

/** Copertura minima per zona dalle sessioni GPS della campagna. */
export async function fetchZoneSessionCoverage(client, campaignId) {
  if (!client || !campaignId) return new Map();
  try {
    const { data, error } = await client
      .from('delivery_session_coverage')
      .select('campaign_zone_id,coverage_percent,calculation_status,delivery_sessions!inner(status,campaign_id)')
      .eq('delivery_sessions.campaign_id', campaignId);
    if (error || !Array.isArray(data)) return new Map();
    return sessionCoverageByZone(data.map((row) => ({
      campaign_zone_id: row.campaign_zone_id,
      coverage_percent: row.coverage_percent,
      calculation_status: row.calculation_status,
      session_status: row.delivery_sessions?.status,
    })));
  } catch {
    return new Map();
  }
}
