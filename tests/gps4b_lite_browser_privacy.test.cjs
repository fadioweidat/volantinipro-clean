const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const trackingPage = readFileSync(resolve(repoRoot, 'src/pages/driver/TrackingPage.jsx'), 'utf8');
const gpsApi = readFileSync(resolve(repoRoot, 'src/lib/services/gps-api.js'), 'utf8');

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

test('log browser out-of-zone senza coordinate grezze', () => {
  const payload = consolePayloadFor('[OPERATOR_OUT_OF_ZONE]', trackingPage);
  assert.doesNotMatch(payload, /\blat\s*:/);
  assert.doesNotMatch(payload, /\blng\s*:/);
  assert.match(payload, /hasPosition/);
});

test('log browser SOS senza coordinate grezze', () => {
  const payload = consolePayloadFor('[OPERATOR_SOS]', trackingPage);
  assert.doesNotMatch(payload, /\blat\s*:/);
  assert.doesNotMatch(payload, /\blng\s*:/);
  assert.match(payload, /hasPosition/);
});

test('log dev invio GPS non include riga Supabase con lat/lng', () => {
  const payload = consolePayloadFor('SUPABASE GPS POINT RESULT', gpsApi);
  assert.doesNotMatch(payload, /\{\s*data\s*,\s*error\s*\}/);
  assert.doesNotMatch(payload, /\blat\s*:/);
  assert.doesNotMatch(payload, /\blng\s*:/);
  assert.match(payload, /pointId/);
});

console.log(`GPS-4B-Lite browser privacy tests: ${passed} passed`);
