const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const campaignTracking = readFileSync(resolve(repoRoot, 'src/pages/customer/CampaignTracking.jsx'), 'utf8');
const supabaseClient = readFileSync(resolve(repoRoot, 'src/lib/supabaseClient.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test('fixture Cliente usa punti moderni nella schermata tracking', () => {
  assert.match(campaignTracking, /getCampaignGpsPoints\(campaignId\)/);
  assert.match(campaignTracking, /state\.points\.length/);
  assert.match(campaignTracking, /<TrackingMap points=\{state\.points\}/);
});

test('fixture Cliente continua a leggere sessioni moderne e non crea dashboard parallele', () => {
  assert.match(campaignTracking, /getCampaignGpsSessions\(campaignId\)/);
  assert.doesNotMatch(campaignTracking, /tracking_gps/);
});

test('zero punti reale resta distinto da fonte GPS non disponibile', () => {
  assert.match(supabaseClient, /gps_punti:\s*Array\.isArray\(gps\) \? gps : null/);
  assert.match(supabaseClient, /gps_points_unavailable:\s*!Array\.isArray\(gps\)/);
});

test('nessun fallback silenzioso alla tabella legacy', () => {
  assert.doesNotMatch(supabaseClient, /\/rest\/v1\/tracking_gps/);
  assert.doesNotMatch(supabaseClient, /gps_tracking_points[\s\S]*?\.catch\(\(\) => \[\]\)/);
});

console.log(`GPS-4C client tracking browser fixture tests: ${passed} passed`);
