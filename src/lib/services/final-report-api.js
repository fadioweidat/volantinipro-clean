import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { buildFinalDistributionReport } from '../reports/finalDistributionReport.js';
import { createProofPhotoSignedUrl, calculateDistanceKm } from './gps-api.js';
import { filterValidGpsPoints } from '../gps/pointQuality.js';
import { resolveMunicipalityBoundary } from '../geo/resolveMunicipalityBoundary.js';

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

// Sezione "Tracciamento GPS e Copertura": per ogni zona reale, la
// scomposizione certificata GPS/manuale/finale gia' calcolata server-side da
// calculate_zone_final_coverage (stessa funzione, stesso motore geometrico
// gia' usato da CoverageAdjustmentPanel/GpsMonitor per calculate_campaign_final_coverage,
// qui scoped a UNA zona) — mai un secondo calcolo lato client. Best-effort:
// una zona il cui calcolo fallisce (RLS, geometria mancante) riporta
// semplicemente calculationStatus diverso da 'ready', mai un fallback fake.
async function getZoneFinalCoverage(campaignZoneId) {
  try {
    const { data, error } = await supabase.rpc('calculate_zone_final_coverage', { p_campaign_zone_id: campaignZoneId });
    if (error || !data) return { calculationStatus: 'not_available' };
    return {
      calculationStatus: data.calculation_status || 'not_available',
      gpsCoveragePercent: data.gps_coverage_pct ?? null,
      manualCoveragePercent: data.manual_coverage_pct ?? null,
      inaccessibleAreaPercent: data.inaccessible_area_pct ?? null,
      finalCoveragePercent: data.final_operational_coverage_pct ?? null,
    };
  } catch {
    return { calculationStatus: 'not_available' };
  }
}

// Confine reale del comune per la mappa del report — stesso
// resolveMunicipalityBoundary gia' usato da Driver/Admin/Cliente/GPS Live,
// mai una seconda implementazione. Sola lettura, mai persistito qui (la
// persistenza su campaign_zones.polygon_geojson resta esclusiva di
// useZoneBoundaries, usato nelle pagine mappa interattive — questo report
// puo' generarsi anche per zone mai aperte in GpsMonitor/CampaignTracking).
async function getZoneBoundaryGeometry(zoneName, lat, lng) {
  try {
    return await resolveMunicipalityBoundary(zoneName, { lat, lng });
  } catch {
    return null;
  }
}

export async function getFinalDistributionReport(campaignId, { customerOwned = false } = {}) {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  const campaign = await getCampaign(campaignId, customerOwned);
  const [zonesResult, sessionsResult, photosResult, assignmentsResult] = await Promise.all([
    supabase.from('campaign_zones')
      .select('id, priority, zone_name, quantity_assigned, status, center_lat, center_lng')
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

  const zones = zonesResult.data || [];
  const sessions = sessionsResult.data || [];
  const telemetry = await getTelemetry(campaignId, sessions, customerOwned);
  const signedPhotos = await Promise.all((photosResult.data || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
  const assignmentZones = (assignmentsResult.data || []).flatMap((assignment) => assignment.operator_assignment_zones || []);

  // Punti GPS grezzi (lat/lng/recorded_at/accuracy) per zona: servono solo
  // per la sezione GPS del report (km reali via filterValidGpsPoints, e
  // traccia per lo screenshot mappa) — la telemetria sopra resta la fonte
  // per i conteggi di sessione gia' esistenti, invariata.
  const sessionIds = sessions.map((s) => s.id);
  const pointsBySession = new Map();
  if (sessionIds.length) {
    const { data: rawPoints } = await supabase
      .from('gps_tracking_points')
      .select('session_id, lat, lng, accuracy, recorded_at')
      .in('session_id', sessionIds);
    (rawPoints || []).forEach((point) => {
      if (!pointsBySession.has(point.session_id)) pointsBySession.set(point.session_id, []);
      pointsBySession.get(point.session_id).push(point);
    });
  }

  const zoneExtras = new Map(await Promise.all(zones.map(async (zone) => {
    const zoneSessionIds = sessions.filter((s) => s.campaign_zone_id === zone.id).map((s) => s.id);
    const rawZonePoints = zoneSessionIds.flatMap((id) => pointsBySession.get(id) || []);
    const validPoints = filterValidGpsPoints(rawZonePoints).valid;
    const [coverage, boundaryGeometry] = await Promise.all([
      getZoneFinalCoverage(zone.id),
      zone.zone_name ? getZoneBoundaryGeometry(zone.zone_name, zone.center_lat, zone.center_lng) : Promise.resolve(null),
    ]);
    return [zone.id, {
      ...coverage,
      gpsDistanceKm: validPoints.length ? Number(calculateDistanceKm(validPoints).toFixed(2)) : null,
      validGpsPoints: rawZonePoints.length ? validPoints.length : null,
      excludedGpsPoints: rawZonePoints.length ? rawZonePoints.length - validPoints.length : null,
      boundaryAvailable: Boolean(boundaryGeometry),
      traceAvailable: validPoints.length > 0,
      boundaryGeometry,
      tracePoints: validPoints,
    }];
  })));

  return buildFinalDistributionReport({
    campaign,
    zones,
    assignmentZones,
    sessions,
    telemetry,
    photos: signedPhotos,
    zoneExtras,
  });
}
