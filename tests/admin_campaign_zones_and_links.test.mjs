import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const assignWork = readFileSync(new URL('../src/pages/admin/AssignWork.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8');
// La sezione "I miei gruppi" (con l'ancora #link-operatori e "Copia link
// gruppo") vive ora nella pagina dedicata /admin/groups, non piu' nella Home.
const groupsManager = readFileSync(new URL('../src/pages/admin/GroupsManager.jsx', import.meta.url), 'utf8');
const adminApi = readFileSync(new URL('../src/lib/services/admin-api.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260813114316_admin_campaign_zones_rls.sql', import.meta.url), 'utf8');

test('AssignWork loads campaign zones without converting query failures to an empty state', () => {
  assert.match(assignWork, /getCampaignZonesWithGroups\(campaignId\)/);
  assert.doesNotMatch(assignWork, /getCampaignZonesWithGroups\(campaignId\)\.catch/);
  assert.match(assignWork, /Nessuna zona configurata per questa campagna\./);
});

test('campaign zone query uses the route campaign id without premature group or status filters', () => {
  const query = adminApi.slice(
    adminApi.indexOf('export async function getCampaignZonesWithGroups'),
    adminApi.indexOf('export async function updateCampaignZoneAssignment'),
  );
  assert.match(query, /from\('campaign_zones'\)[\s\S]*\.eq\('campaign_id', campaignId\)/);
  assert.doesNotMatch(query, /\.eq\('group_id'/);
  assert.doesNotMatch(query, /\.eq\('status'/);
  assert.match(query, /zones:\s*zonesRes\.data \|\| \[\]/);
});

test('campaign zones grant authenticated Admin read and update through gps_is_admin', () => {
  assert.match(migration, /campaign_zones_admin_select/);
  assert.match(migration, /for select\s+to authenticated\s+using \(\(select public\.gps_is_admin\(\)\)\)/i);
  assert.match(migration, /campaign_zones_admin_update/);
  assert.match(migration, /for update\s+to authenticated/i);
  assert.match(migration, /with check \(\(select public\.gps_is_admin\(\)\)\)/i);
});

test('Link operatori hash targets the real group-link section', () => {
  assert.match(groupsManager, /href="#link-operatori"/);
  assert.match(groupsManager, /id="link-operatori"/);
  assert.match(groupsManager, /addEventListener\("hashchange", scrollToDashboardHash\)/);
  assert.match(groupsManager, /getElementById\(id\)\?\.scrollIntoView/);
  assert.match(groupsManager, /href=\{`\/admin\/campaigns\/\$\{group\.campaign_id\}\/groups`\}>Copia link gruppo/);
});
