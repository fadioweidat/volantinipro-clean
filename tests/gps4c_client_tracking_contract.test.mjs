import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseClient = readFileSync(resolve(repoRoot, 'src/lib/supabaseClient.js'), 'utf8');
const getCampaignByIdBody = supabaseClient.match(/export async function getCampaignById\(id\) \{[\s\S]*?\n\}/)?.[0] || '';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test('getCampaignById non legge più la tabella legacy tracking_gps', () => {
  assert.ok(getCampaignByIdBody, 'getCampaignById non trovato');
  assert.doesNotMatch(getCampaignByIdBody, /\/rest\/v1\/tracking_gps/);
  assert.doesNotMatch(getCampaignByIdBody, /campagna_id=eq/);
});

test('getCampaignById legge i punti dalla source of truth moderna gps_tracking_points', () => {
  assert.match(getCampaignByIdBody, /\/rest\/v1\/gps_tracking_points\?campaign_id=eq/);
  assert.match(getCampaignByIdBody, /order=recorded_at\.asc/);
  assert.match(getCampaignByIdBody, /gps_points_source:\s*"gps_tracking_points"/);
});

test('getCampaignById preserva gps_punti come alias di compatibilità', () => {
  assert.match(getCampaignByIdBody, /gps_punti:\s*Array\.isArray\(gps\) \? gps : null/);
});

test('errore RLS o fonte non disponibile non diventa lista vuota', () => {
  assert.doesNotMatch(getCampaignByIdBody, /gps_tracking_points[\s\S]*?\.catch\(\(\) => \[\]\)/);
  assert.match(getCampaignByIdBody, /gps_points_unavailable:\s*!Array\.isArray\(gps\)/);
  assert.match(getCampaignByIdBody, /gps_points_error:\s*gpsError/);
});

test('nessun service_role nel reader Cliente', () => {
  assert.doesNotMatch(getCampaignByIdBody, /service_role/i);
});

console.log(`GPS-4C client tracking contract tests: ${passed} passed`);
