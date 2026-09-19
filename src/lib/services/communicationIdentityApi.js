import { supabase, ensureSupabaseSessionBridge } from '../../supabaseClient.js';

// Lettura SOLA LETTURA delle identita' canoniche (campagna, cliente, driver,
// gruppo) per le conversazioni Admin. Nessuna scrittura, nessuno schema nuovo:
// stesse tabelle/embed gia' letti altrove dall'Admin (admin-api.js). Un errore
// di lettura NON rompe l'Hub: le etichette ripiegano sui fallback dichiarati
// in communicationIdentity.js.

const uniq = (list) => [...new Set((list || []).filter(Boolean))];

export async function loadCommunicationIdentityDirectory(conversations = []) {
  const empty = { campaigns: {}, assignments: {} };
  if (!supabase || !Array.isArray(conversations) || conversations.length === 0) return empty;
  try {
    await ensureSupabaseSessionBridge();
  } catch {
    return empty;
  }
  const campaignIds = uniq(conversations.map((c) => c.campaign_id));
  const assignmentIds = uniq(conversations.filter((c) => c.kind === 'driver_admin').map((c) => c.assignment_id));
  const result = { campaigns: {}, assignments: {} };

  if (campaignIds.length > 0) {
    try {
      const { data } = await supabase
        .from('campaigns')
        .select('id, user_id, title, campaign_name, customer_name, client_name, city, zone_name')
        .in('id', campaignIds);
      const rows = data || [];
      const userIds = uniq(rows.map((r) => r.user_id));
      const profiles = {};
      if (userIds.length > 0) {
        try {
          const { data: profileRows } = await supabase.from('profiles').select('id, full_name, company_name').in('id', userIds);
          for (const p of profileRows || []) profiles[p.id] = p;
        } catch { /* profili non leggibili: si usano i nomi della campagna */ }
      }
      for (const r of rows) {
        const p = profiles[r.user_id] || {};
        result.campaigns[r.id] = {
          title: r.title, campaign_name: r.campaign_name, customer_name: r.customer_name,
          client_name: r.client_name, city: r.city, zone_name: r.zone_name,
          company_name: p.company_name || null, profile_full_name: p.full_name || null,
        };
      }
    } catch { /* fallback etichette */ }
  }

  if (assignmentIds.length > 0) {
    try {
      const { data } = await supabase
        .from('operator_assignments')
        .select('id, operator_id, participant_label, operator_profiles ( display_name ), operational_groups ( name )')
        .in('id', assignmentIds);
      for (const a of data || []) {
        result.assignments[a.id] = {
          operator_name: a.operator_profiles?.display_name || null,
          participant_label: a.participant_label || null,
          group_name: a.operational_groups?.name || null,
        };
      }
    } catch { /* fallback etichette */ }
  }
  return result;
}
