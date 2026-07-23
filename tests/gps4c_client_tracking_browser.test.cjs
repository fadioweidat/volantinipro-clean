const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const supabaseClient = readFileSync(resolve(repoRoot, 'src/lib/supabaseClient.js'), 'utf8');
const trackingPage = readFileSync(resolve(repoRoot, 'src/pages/driver/TrackingPage.jsx'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test('reader Cliente usa punti moderni e non crea dashboard parallele', () => {
  assert.match(supabaseClient, /\/rest\/v1\/gps_tracking_points\?campaign_id=eq/);
  assert.doesNotMatch(supabaseClient, /\/rest\/v1\/tracking_gps/);
  assert.doesNotMatch(trackingPage, /Dashboard AI|dashboard ai|terza dashboard/i);
});

test('zero punti reale resta distinto da fonte GPS non disponibile', () => {
  assert.match(supabaseClient, /gps_punti:\s*Array\.isArray\(gps\) \? gps : null/);
  assert.match(supabaseClient, /gps_points_unavailable:\s*!Array\.isArray\(gps\)/);
  assert.match(supabaseClient, /gps_points_error:\s*gpsError/);
});

test('nessun fallback silenzioso alla tabella legacy', () => {
  assert.doesNotMatch(supabaseClient, /\/rest\/v1\/tracking_gps/);
  assert.doesNotMatch(supabaseClient, /gps_tracking_points[\s\S]*?\.catch\(\(\) => \[\]\)/);
});

test('porting production minimo non importa mappa, geocoding o photo-proof', () => {
  assert.doesNotMatch(trackingPage, /react-leaflet|leaflet|Nominatim|photo-proof|createPhotoProofPackage|rememberPhotoHash/i);
});

console.log(`GPS-4C client tracking browser fixture tests: ${passed} passed`);
