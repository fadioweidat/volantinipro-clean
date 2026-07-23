const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const trackingPage = readFileSync(resolve(repoRoot, 'src/pages/driver/TrackingPage.jsx'), 'utf8');
const gpsApi = readFileSync(resolve(repoRoot, 'src/lib/services/gps-api.js'), 'utf8');
const gpsHook = readFileSync(resolve(repoRoot, 'src/hooks/useGpsTracking.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function consolePayloadFor(marker, source) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} non trovato`);
  const end = source.indexOf('});', start);
  assert.notEqual(end, -1, `fine payload ${marker} non trovata`);
  return source.slice(start, end + 3);
}

test('log dev invio GPS non include coordinate grezze', () => {
  const payload = consolePayloadFor('SUPABASE GPS POINT RESULT', gpsApi);
  assert.doesNotMatch(payload, /\{\s*data\s*,\s*error\s*\}/);
  assert.doesNotMatch(payload, /\blat\s*:/);
  assert.doesNotMatch(payload, /\blng\s*:/);
  assert.match(payload, /pointId/);
});

test('log assignment non include coordinate o dati sensibili', () => {
  const readyPayload = consolePayloadFor('[OPERATOR_ASSIGNMENT_READY]', gpsHook);
  const blockedPayload = consolePayloadFor('[OPERATOR_ASSIGNMENT_BLOCKED]', gpsHook);
  for (const payload of [readyPayload, blockedPayload]) {
    assert.doesNotMatch(payload, /\blat\s*:/);
    assert.doesNotMatch(payload, /\blng\s*:/);
    assert.doesNotMatch(payload, /token/i);
    assert.doesNotMatch(payload, /email/i);
  }
});

test('pagina operatore minima non introduce mappa, geocoding o photo-proof', () => {
  assert.doesNotMatch(trackingPage, /react-leaflet|leaflet|Nominatim|photo-proof|createPhotoProofPackage|rememberPhotoHash/i);
});

console.log(`GPS-4B-Lite browser privacy tests: ${passed} passed`);
