import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gpsApi = readFileSync('src/lib/services/gps-api.js', 'utf8');
const hook = readFileSync('src/hooks/useGpsTracking.js', 'utf8');
const page = readFileSync('src/pages/driver/TrackingPage.jsx', 'utf8');

const requiredRpcs = [
  'gps_get_operator_campaign',
  'gps_start_session',
  'gps_insert_point',
  'gps_heartbeat_session',
  'gps_transition_session',
];

for (const rpc of requiredRpcs) {
  assert.match(gpsApi, new RegExp(`['"]${rpc}['"]`), `gps-api.js must call ${rpc}`);
}

assert.doesNotMatch(gpsApi, /DEV_DRIVER_ID/, 'DEV_DRIVER_ID must not exist');
assert.doesNotMatch(gpsApi, /\.from\(['"]delivery_sessions['"]\)\s*[\s\S]{0,220}\.(insert|update)\(/, 'delivery_sessions writes must use RPC');
assert.doesNotMatch(gpsApi, /\.from\(['"]gps_tracking_points['"]\)\s*[\s\S]{0,220}\.insert\(/, 'gps_tracking_points writes must use RPC');
assert.doesNotMatch(gpsApi, /quote_requests|public\.profiles|service_role|Nominatim|react-leaflet|leaflet/, 'non-GPS or privileged dependencies must stay out');

assert.match(gpsApi, /\.eq\(['"]user_id['"]/, 'operator_profiles must use production user_id');
assert.match(gpsApi, /assignment\.group_id/, 'assignment validation must account for production group_id');
assert.match(gpsApi, /p_assignment_id/, 'session start must send p_assignment_id');
assert.match(gpsApi, /p_session_id/, 'point writes must send p_session_id');
// uploadProofPhoto costruisce legittimamente { campaign_id, driver_id } per
// l'insert in proof_photos (autorizzato con GPS PHASE 2): la funzione viene
// esclusa dal controllo, che resta valido per il resto del modulo (nessun
// punto GPS deve portare campaign_id/driver_id costruiti a mano fuori da RPC).
const gpsApiWithoutProofUpload =
  gpsApi.slice(0, gpsApi.indexOf('export async function uploadProofPhoto')) +
  gpsApi.slice(gpsApi.indexOf('export async function createProofPhotoSignedUrl'));
assert.doesNotMatch(gpsApiWithoutProofUpload, /campaign_id:\s*campaignId[\s\S]{0,120}driver_id:/, 'frontend must not construct GPS point campaign/driver payload outside the proof-photo upload path');

assert.match(hook, /resolveGpsAssignment/, 'hook must resolve assignment before start');
assert.match(hook, /isPermanentGpsWriteError/, 'hook must avoid infinite retry for permanent auth/RLS errors');
assert.match(hook, /assignmentState/, 'hook must expose assignment state');

assert.match(page, /tracking\.canStart/, 'TrackingPage must block Start without a valid assignment');
// Il POD/foto (uploadProofPhoto, cattura fotocamera) e' stato autorizzato ed
// e' entrato in scope con GPS PHASE 2: non e' piu' un limite di questo
// contratto. Mappa e geocoding sul lato Autista restano fuori scope, invariato.
assert.doesNotMatch(page, /Nominatim|react-leaflet|leaflet/, 'map/geocoding UI is out of scope');

console.log('gps_prod_rpc_frontend_contract: PASS');
