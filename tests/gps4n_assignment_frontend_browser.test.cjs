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

test('UI operatore espone stato assegnazione e blocca start', () => {
  assert.match(trackingPage, /assignmentBlocksStart/);
  assert.match(trackingPage, /tracking\.assignmentStatus !== 'ready'/);
  assert.match(trackingPage, /disabled=\{Boolean\(actionLoading\) \|\| assignmentBlocksStart\}/);
  assert.match(trackingPage, /label="Assegnazione"/);
  assert.match(trackingPage, /operator-assignment-error/);
  assert.match(trackingPage, /role=\{danger \? 'alert' : 'status'\}/);
});

test('log assignment senza dati sensibili o coordinate', () => {
  const readyPayload = consolePayloadFor('[OPERATOR_ASSIGNMENT_READY]', gpsHook);
  const blockedPayload = consolePayloadFor('[OPERATOR_ASSIGNMENT_BLOCKED]', gpsHook);
  for (const payload of [readyPayload, blockedPayload]) {
    assert.doesNotMatch(payload, /\blat\s*:/);
    assert.doesNotMatch(payload, /\blng\s*:/);
    assert.doesNotMatch(payload, /token/i);
    assert.doesNotMatch(payload, /email/i);
  }
});

test('start session log non include driver_id grezzo', () => {
  const payload = consolePayloadFor('START GPS SESSION', gpsApi);
  assert.doesNotMatch(payload, /driverId/);
  assert.doesNotMatch(payload, /driver_id/);
  assert.match(payload, /hasAssignment/);
});

console.log(`GPS-4N assignment frontend browser tests: ${passed} passed`);
