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
  const assignmentIds = uniq(conversations.filter((c) => c.kind === 'driver_admin').map((c) => c.assignment_id));
  const result = { campaigns: {}, assignments: {} };

  // In produzione molte conversazioni Driver hanno campaign_id NULL.
  // L'associazione canonica e' operator_assignments.campaign_id: ricavarla
  // PRIMA di leggere le campagne, senza dedurre nulla dal nome del Driver.
  if (assignmentIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from('operator_assignments')
        .select('id, campaign_id, participant_label, operator_profiles ( display_name ), operational_groups ( name )')
        .in('id', assignmentIds);
      if (error) throw error;
      for (const a of data || []) {
        result.assignments[a.id] = {
          campaign_id: a.campaign_id || null,
          operator_name: a.operator_profiles?.display_name || null,
          participant_label: a.participant_label || null,
          group_name: a.operational_groups?.name || null,
        };
      }
    } catch {
      // Se il join delle tabelle anagrafiche fallisce, recupera almeno il
      // collegamento campagna/assignment (e il label), senza azzerare il gruppo.
      try {
        const { data, error } = await supabase
          .from('operator_assignments')
          .select('id, campaign_id, participant_label')
          .in('id', assignmentIds);
        if (error) throw error;
        for (const a of data || []) {
          result.assignments[a.id] = {
            campaign_id: a.campaign_id || null,
            participant_label: a.participant_label || null,
          };
        }
      } catch { /* fallback: conversazioni non raggruppabili, mai inventare un ID */ }
    }
  }

  const campaignIds = uniq([
    ...conversations.map((c) => c.campaign_id),
    ...Object.values(result.assignments).map((a) => a.campaign_id),
  ]);
  if (campaignIds.length > 0) {
    try {
      const { data } = await supabase
        .from('campaigns')
        .select('id, user_id, title, campaign_name, customer_name, client_name, city, zone_name, address, address_input, metadata')
        .in('id', campaignIds);
      const rows = data || [];
      const zonesByCampaign = {};
      try {
        const { data: zoneRows, error: zoneError } = await supabase
          .from('campaign_zones')
          .select('campaign_id, zone_name, address_label')
          .in('campaign_id', campaignIds);
        if (zoneError) throw zoneError;
        for (const zone of zoneRows || []) {
          if (!zonesByCampaign[zone.campaign_id]) zonesByCampaign[zone.campaign_id] = [];
          zonesByCampaign[zone.campaign_id].push(zone);
        }
      } catch { /* campagna e chat restano disponibili anche senza zone */ }
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
          business_name: r.metadata?.business_name || r.metadata?.nome_campagna || null,
          real_zone_names: uniq((zonesByCampaign[r.id] || []).map((zone) => zone.zone_name)),
          address_label: (zonesByCampaign[r.id] || [])[0]?.address_label || r.address_input || r.address || null,
          created_at: r.created_at || null,
          company_name: p.company_name || null, profile_full_name: p.full_name || null,
        };
      }
    } catch { /* fallback etichette */ }
  }

  return result;
}
