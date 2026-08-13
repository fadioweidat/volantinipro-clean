import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { buildFinalDistributionReport } from '../reports/finalDistributionReport.js';
import { createProofPhotoSignedUrl } from './gps-api.js';

async function getCampaign(campaignId, customerOwned) {
  let query = supabase.from('campaigns')
    .select('id, user_id, title, campaign_name, client_name, status, start_date, end_date, distribution_start_date, distribution_end_date')
    .eq('id', campaignId);
  if (customerOwned) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) throw new Error('Autenticazione Cliente richiesta.');
    query = query.eq('user_id', authData.user.id);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Campagna non trovata o non autorizzata.');
  return data;
}

async function getTelemetry(campaignId, sessionsFallback, customerOwned) {
  const rpcName = customerOwned ? 'final_distribution_report_telemetry' : 'admin_daily_report_telemetry';
  const rpcArgs = customerOwned ? { p_campaign_id: campaignId } : { p_session_ids: sessionsFallback.map((session) => session.id) };
  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
  if (!error) return data || [];
  if (!sessionsFallback.length) return [];
  const sessionIds = sessionsFallback.map((session) => session.id);
  const { data: points, error: pointsError } = await supabase
    .from('gps_tracking_points').select('session_id, recorded_at').in('session_id', sessionIds);
  if (pointsError) return [];
  const result = new Map(sessionIds.map((id) => [id, { session_id: id, gps_count: 0, first_gps_at: null, last_gps_at: null }]));
  (points || []).forEach((point) => {
    const row = result.get(point.session_id);
    if (!row) return;
    row.gps_count += 1;
    if (!row.first_gps_at || point.recorded_at < row.first_gps_at) row.first_gps_at = point.recorded_at;
    if (!row.last_gps_at || point.recorded_at > row.last_gps_at) row.last_gps_at = point.recorded_at;
  });
  return [...result.values()];
}

export async function getFinalDistributionReport(campaignId, { customerOwned = false } = {}) {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  const campaign = await getCampaign(campaignId, customerOwned);
  const [zonesResult, sessionsResult, photosResult, assignmentsResult] = await Promise.all([
    supabase.from('campaign_zones')
      .select('id, priority, zone_name, quantity_assigned, status')
      .eq('campaign_id', campaignId).order('priority', { ascending: true }),
    supabase.from('delivery_sessions')
      .select('id, campaign_zone_id, status, started_at, paused_at, ended_at, created_at, updated_at')
      .eq('campaign_id', campaignId).order('created_at', { ascending: true }),
    supabase.from('proof_photos')
      .select('session_id, storage_path, taken_at, approved_at, created_at')
      .eq('campaign_id', campaignId).not('approved_at', 'is', null).order('taken_at', { ascending: true }),
    customerOwned
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('operator_assignments').select('id, operator_assignment_zones(zone_id, municipality_name, quantity)').eq('campaign_id', campaignId),
  ]);
  if (zonesResult.error) throw zonesResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (photosResult.error) throw photosResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const sessions = sessionsResult.data || [];
  const telemetry = await getTelemetry(campaignId, sessions, customerOwned);
  const signedPhotos = await Promise.all((photosResult.data || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
  const assignmentZones = (assignmentsResult.data || []).flatMap((assignment) => assignment.operator_assignment_zones || []);
  return buildFinalDistributionReport({
    campaign,
    zones: zonesResult.data || [],
    assignmentZones,
    sessions,
    telemetry,
    photos: signedPhotos,
  });
}
