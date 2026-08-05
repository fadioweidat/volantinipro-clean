import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dedupeGpsPointQueue } from '../src/lib/gps/offlineQueue.js';

const gpsApi = readFileSync('src/lib/services/gps-api.js', 'utf8');
const trackingHook = readFileSync('src/hooks/useGpsTracking.js', 'utf8');
const trackingPage = readFileSync('src/pages/driver/TrackingPage.jsx', 'utf8');
const podCapture = readFileSync('src/components/driver/PodCapture.jsx', 'utf8');
const customerApi = readFileSync('src/lib/services/customer-api.js', 'utf8');
const adminLive = readFileSync('src/pages/admin/AdminLiveDashboard.jsx', 'utf8');
const contractMigration = readFileSync('supabase/migrations/20260805000003_reconcile_driver_gps_contract.sql', 'utf8');
const zoneMigration = readFileSync('supabase/migrations/20260805000004_secure_gps_zone_transitions.sql', 'utf8');
const podMigration = readFileSync('supabase/migrations/20260805000005_harden_pod_visibility.sql', 'utf8');
const pointDedupeMigration = readFileSync('supabase/migrations/20260805000006_dedupe_gps_points.sql', 'utf8');
const sessionMigration = readFileSync('supabase/migrations/20260803000003_gps_cancel_stale_session.sql', 'utf8');

test('GPS authorization contract', async (t) => {
  await t.test('start uses authenticated operator assignment and rejects foreign zones', () => {
    assert.match(contractMigration, /a\.operator_id = v_uid/);
    assert.match(contractMigration, /gps_assignment_is_valid/);
    assert.match(contractMigration, /z\.campaign_id = v_assignment\.campaign_id/);
    assert.match(contractMigration, /z\.group_id = v_assignment\.group_id/);
    assert.match(contractMigration, /ZONA_NON_AUTORIZZATA/);
  });

  await t.test('duplicate start remains fail-closed', () => {
    assert.match(contractMigration, /unique_violation/);
    assert.match(contractMigration, /SESSIONE_GIA_ATTIVA/);
  });

  await t.test('Driver B and Customer cannot mutate a Driver A zone', () => {
    assert.match(zoneMigration, /s\.driver_id = v_uid/);
    assert.match(zoneMigration, /s\.campaign_id = v_zone\.campaign_id/);
    assert.match(zoneMigration, /s\.group_id = v_zone\.group_id/);
    assert.match(zoneMigration, /ZONA_NON_AUTORIZZATA/);
  });

  await t.test('anonymous access is excluded by auth.uid and authenticated-only grants', () => {
    assert.match(contractMigration, /if v_uid is null/);
    assert.match(contractMigration, /grant execute[^;]+to authenticated, service_role/i);
    assert.match(zoneMigration, /grant execute[^;]+to authenticated, service_role/i);
  });
});

test('GPS lifecycle and frontend/DB RPC contract', async (t) => {
  await t.test('simultaneous watchPosition callbacks do not duplicate queued points', () => {
    const duplicate = { sessionId: 'session-a', recordedAt: '2026-08-05T12:00:00.000Z', lat: 45.46, lng: 9.19 };
    const distinct = { ...duplicate, recordedAt: '2026-08-05T12:00:20.000Z', lat: 45.461 };
    assert.deepEqual(dedupeGpsPointQueue([duplicate, { ...duplicate }, distinct]), [duplicate, distinct]);
    assert.match(trackingHook, /pendingPointKeyRef\.current === pointKey/);
    assert.match(pointDedupeMigration, /pg_advisory_xact_lock/);
    assert.match(pointDedupeMigration, /where p\.session_id = v_session\.id[^]*p\.recorded_at = v_recorded_at[^]*return v_point/s);
    assert.doesNotMatch(pointDedupeMigration, /delete from public\.gps_tracking_points/i);
  });

  await t.test('start signature and frontend arguments match exactly', () => {
    assert.match(contractMigration, /gps_start_session\(\s*p_assignment_id uuid,\s*p_device_id text[^,]+,\s*p_campaign_zone_id uuid/s);
    assert.match(gpsApi, /p_assignment_id: resolved\.assignment\.id/);
    assert.match(gpsApi, /p_device_id: deviceId \|\| null/);
    assert.match(gpsApi, /p_campaign_zone_id: zoneId \|\| null/);
  });

  await t.test('pause, reload, resume and stop keep the canonical session RPC', () => {
    assert.match(gpsApi, /gps_transition_session[^]*p_action: 'pause'/);
    assert.match(gpsApi, /gps_transition_session[^]*p_action: 'resume'/);
    assert.match(gpsApi, /gps_transition_session[^]*p_action: 'complete'/);
    assert.match(trackingHook, /getActiveGpsSession\(campaignId\)/);
    assert.match(trackingHook, /existing\.status === 'paused' \? 'paused' : 'active'/);
  });

  await t.test('zone switch completes the previous zone and updates the same session', () => {
    assert.match(zoneMigration, /v_previous_zone_id/);
    assert.match(zoneMigration, /set status = 'Completata'/);
    assert.match(zoneMigration, /set campaign_zone_id = p_campaign_zone_id/);
    assert.match(zoneMigration, /returns public\.delivery_sessions/);
    assert.match(trackingHook, /const changeZone = useCallback/);
    assert.match(trackingPage, /Passa alla zona/);
  });

  await t.test('stop completes the zone before the session and preserves POD state', () => {
    const stopBody = trackingPage.slice(trackingPage.indexOf('Termina e Completa Zona') - 400, trackingPage.indexOf('Termina e Completa Zona') + 100);
    assert.ok(stopBody.indexOf('tracking.completeZone') < stopBody.indexOf('tracking.end'));
    assert.doesNotMatch(stopBody, /location\.reload/);
  });

  await t.test('GPS point and coverage contracts use reconciled names', () => {
    for (const argument of ['p_session_id', 'p_lat', 'p_lng', 'p_accuracy', 'p_speed', 'p_heading', 'p_recorded_at']) {
      assert.match(gpsApi, new RegExp(argument));
    }
    assert.match(contractMigration, /add column if not exists geometry/);
    assert.match(trackingPage, /res\?\.coverage_percent/);
  });

  await t.test('stale recovery is explicit cancel, never automatic close', () => {
    assert.match(sessionMigration, /p_action = 'cancel'/);
    assert.match(sessionMigration, /reason', 'stale_session_recovery'/);
    assert.doesNotMatch(contractMigration, /auto.?close|stale_session_recovery/i);
  });
});

test('POD, Admin and Customer isolation contract', async (t) => {
  await t.test('POD captures watermark metadata and requires a real session path', () => {
    for (const field of ['takenAt', 'client', 'address', 'ddt', 'colli', 'outcome', 'driverName', 'lat', 'lng']) {
      assert.match(podCapture, new RegExp(`\\b${field}\\b`));
    }
    assert.match(gpsApi, /campaign\/\$\{campaignId\}\/session\/\$\{sessionId\}\/photo\//);
  });

  await t.test('legacy permissive row and Storage policies are removed', () => {
    assert.match(podMigration, /drop policy if exists proof_photos_select_policy/);
    assert.match(podMigration, /drop policy if exists proof_photos_insert_driver/);
    assert.match(podMigration, /drop policy if exists proof_photos_storage_insert_driver/);
    assert.doesNotMatch(podMigration, /auth\.uid\(\) is not null\s*\)\s*;/);
  });

  await t.test('Admin sees POD; Customer sees only approved POD from owned campaigns', () => {
    assert.match(podMigration, /public\.gps_is_admin\(\)/);
    assert.match(podMigration, /approved_at is not null/);
    assert.match(podMigration, /c\.user_id = auth\.uid\(\)/);
    assert.match(customerApi, /getOwnedCustomerCampaign\(campaignId\)/);
    assert.match(customerApi, /approvedOnly: true/);
  });

  await t.test('Admin Live keeps completed filtered sessions visible on map and list', () => {
    assert.match(adminLive, /status: 'all_history'/);
    assert.match(adminLive, /value="all_history">Tutti \(incl\. storico\)/);
    assert.match(adminLive, /<LiveMap drivers=\{withLifecycle\}/);
    assert.match(adminLive, /withLifecycle\.length \? withLifecycle\.map/);
    assert.match(adminLive, /const currentRows = useMemo/);
  });

  await t.test('Storage access is bound to the proof row and canonical session path', () => {
    assert.match(podMigration, /storage\.foldername\(name\)/);
    assert.match(podMigration, /p\.storage_path = name/);
    assert.match(podMigration, /s\.driver_id = auth\.uid\(\)/);
    assert.match(podMigration, /s\.campaign_id/);
  });
});
