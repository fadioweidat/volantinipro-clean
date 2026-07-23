import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const supabaseClient = readFileSync('src/lib/supabaseClient.js', 'utf8');

const getCampaignByIdBody = supabaseClient.slice(
  supabaseClient.indexOf('export async function getCampaignById'),
  supabaseClient.indexOf('export async function saveSmartPairingWaitlist'),
);

assert.match(getCampaignByIdBody, /gps_tracking_points/, 'Cliente tracking reader must use gps_tracking_points');
assert.doesNotMatch(getCampaignByIdBody, /tracking_gps/, 'Cliente tracking reader must not use tracking_gps');
assert.match(getCampaignByIdBody, /gps_punti:\s*gpsRows/, 'gps_punti must remain a compatibility alias');
assert.match(getCampaignByIdBody, /gps_points_source:\s*"gps_tracking_points"/, 'source marker must identify modern GPS table');
assert.match(getCampaignByIdBody, /gps_points_unavailable:\s*Boolean\(gpsError\)/, 'RLS/source errors must be distinct from zero points');
assert.match(getCampaignByIdBody, /gps_points_error:/, 'GPS read errors must be exposed explicitly');

const gpsReaderBlock = getCampaignByIdBody.slice(getCampaignByIdBody.indexOf('let gps = null'));
assert.doesNotMatch(gpsReaderBlock, /catch\(\(\)\s*=>\s*\[\]\)/, 'GPS errors must not silently become an empty point list');

assert.doesNotMatch(supabaseClient, /service_role|mqkelrsvksrzrpmbstvd|pooler\.supabase\.com/, 'frontend client must not embed privileged or remote references');

console.log('gps_prod_client_reader_contract: PASS');
