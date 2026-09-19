import { supabase } from '../../supabaseClient.js';

export async function setDriverZoneWorkStatus({ assignmentId, zoneId, status, accessToken }) {
  if (!supabase) throw new Error('Supabase non configurato.');
  const { data, error } = await supabase.rpc('driver_set_zone_work_status', {
    p_assignment_id: assignmentId,
    p_zone_id: zoneId,
    p_status: status,
    p_access_token: accessToken || null,
  });
  if (error) throw error;
  return data;
}
