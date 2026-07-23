import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gpsApi = readFileSync(resolve(repoRoot, 'src/lib/services/gps-api.js'), 'utf8');
const gpsHook = readFileSync(resolve(repoRoot, 'src/hooks/useGpsTracking.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test('recupera operator_profile e operator_assignments con utente autenticato', () => {
  assert.match(gpsApi, /export async function getCurrentOperatorProfile\(\)/);
  assert.match(gpsApi, /\.from\('operator_profiles'\)/);
  assert.match(gpsApi, /\.eq\('id', operatorId\)/);
  assert.match(gpsApi, /export async function getValidOperatorAssignments\(campaignId\)/);
  assert.match(gpsApi, /\.from\('operator_assignments'\)/);
  assert.match(gpsApi, /\.eq\('operator_id', operatorId\)/);
  assert.match(gpsApi, /\.eq\('campaign_id', campaignId\)/);
});

test('resolveGpsAssignment blocca profili e assignment non validi', () => {
  assert.match(gpsApi, /export async function resolveGpsAssignment\(campaignId\)/);
  for (const code of [
    'operator_profile_missing',
    'operator_suspended',
    'operator_archived',
    'assignment_missing',
    'assignment_revoked',
    'assignment_completed',
    'assignment_not_started',
    'assignment_expired',
    'assignment_ambiguous',
  ]) {
    assert.match(gpsApi, new RegExp(code));
  }
});

test('startGpsSession richiede e invia assignment_id senza fallback', () => {
  assert.match(gpsApi, /export async function startGpsSession\(campaignId, \{ assignmentId \} = \{\}\)/);
  assert.match(gpsApi, /if \(!isValidUuid\(assignmentId\)\) throw assignmentError\('assignment_missing'\)/);
  assert.match(gpsApi, /assignment_id: assignmentId/);
  assert.doesNotMatch(gpsApi, /DEV_DRIVER_ID/);
  assert.doesNotMatch(gpsApi, /service_role/i);
});

test('useGpsTracking risolve assignment prima dello start', () => {
  assert.match(gpsHook, /resolveGpsAssignment/);
  assert.match(gpsHook, /const \[assignmentStatus, setAssignmentStatus\] = useState\('idle'\)/);
  assert.match(gpsHook, /const resolvedAssignment = assignmentRef\.current \|\| await loadAssignment\(\)/);
  assert.match(gpsHook, /startGpsSession\(campaignId, \{ assignmentId: resolvedAssignment\.id \}\)/);
  assert.match(gpsHook, /isAssignmentReady: assignmentStatus === 'ready'/);
});

test('gps_tracking_points e retry offline restano invariati', () => {
  assert.match(gpsApi, /\.from\('gps_tracking_points'\)/);
  assert.doesNotMatch(gpsApi, /\.from\('tracking_gps'\)/);
  assert.match(gpsHook, /enqueuePoint\(payload\)/);
  assert.match(gpsHook, /OPERATOR_GPS_QUEUE_RETRY/);
  assert.match(gpsHook, /clearQueuedPoints\(\)/);
});

console.log(`GPS-4N assignment frontend contract tests: ${passed} passed`);
