import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gpsApi = readFileSync(resolve(repoRoot, 'src/lib/services/gps-api.js'), 'utf8');
const gpsHook = readFileSync(resolve(repoRoot, 'src/hooks/useGpsTracking.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test('rimuove il fallback DEV_DRIVER_ID e richiede utente Supabase', () => {
  assert.doesNotMatch(gpsApi, /DEV_DRIVER_ID/);
  assert.doesNotMatch(gpsApi, /uso driver test/i);
  assert.match(gpsApi, /client\.auth\.getUser\(\)/);
  assert.match(gpsApi, /GPS_AUTH_REQUIRED_MESSAGE/);
  assert.match(gpsApi, /throw new Error\(GPS_AUTH_REQUIRED_MESSAGE\)/);
});

test('usa gps_tracking_points come source of truth di scrittura moderna', () => {
  assert.match(gpsApi, /\.from\('gps_tracking_points'\)/);
  assert.doesNotMatch(gpsApi, /\.from\('tracking_gps'\)/);
});

test('blocca payload driver_id non coerente con utente autenticato', () => {
  assert.match(gpsApi, /const authenticatedDriverId = await getCurrentUserId\(\)/);
  assert.match(gpsApi, /resolvedDriverId !== authenticatedDriverId/);
  assert.match(gpsApi, /GPS_DRIVER_MISMATCH_MESSAGE/);
});

test('non ritenta né accoda errori permanenti auth o RLS', () => {
  assert.match(gpsApi, /isPermanentGpsWriteError\(error\)\) break/);
  assert.match(gpsHook, /isPermanentGpsWriteError\(err\)/);
  assert.match(gpsHook, /clearQueuedPoints\(\)/);
  assert.match(gpsHook, /setStatus\('permission_error'\)/);
  assert.match(gpsHook, /setError\(err\?\.message \|\| 'Accesso operatore richiesto/);
});

test('mantiene retry/queue solo per errori transitori', () => {
  assert.match(gpsHook, /enqueuePoint\(payload\)/);
  assert.match(gpsHook, /OPERATOR_GPS_QUEUE_RETRY/);
  assert.match(gpsHook, /reason: err\?\.code \|\| err\?\.status \|\| 'transient_error'/);
});

console.log(`GPS-4B-Lite contract tests: ${passed} passed`);
