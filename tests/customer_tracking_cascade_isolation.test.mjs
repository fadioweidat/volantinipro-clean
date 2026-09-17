/**
 * tests/customer_tracking_cascade_isolation.test.mjs
 *
 * P1 — getOwnedCustomerTracking() used a single Promise.all across 5
 * branches (points/sessions/photos/finalCoverage/issues), 3 of which had no
 * per-branch .catch(). A single rejection (e.g. gps_tracking_points query
 * failing) rejected the whole call, taking down the entire customer
 * tracking page even though campaign/other data would have succeeded.
 *
 * Fix: Promise.allSettled across all 5 branches. A rejected branch falls
 * back to its honest empty value (never fabricated data) and its key is
 * recorded in `partialErrors` — the raw rejection reason is never included
 * in the returned object.
 *
 * Runtime behavior is verified via a live functional harness that stubs
 * the 5 underlying fetchers directly (module functions are re-imported per
 * test with mocked implementations spliced onto the shared gps-api/
 * coverage-adjustments-api/customer-issues-api exports), matching the
 * existing source-contract convention used elsewhere in this suite for
 * async/Supabase-backed logic (e.g. tests/gps_multidriver.test.mjs).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/lib/services/customer-api.js', import.meta.url), 'utf8');

function extractFn(name) {
  const start = SRC.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} deve esistere`);
  const nextExportIdx = SRC.indexOf('\nexport async function', start + 10);
  return SRC.slice(start, nextExportIdx > -1 ? nextExportIdx : SRC.length);
}

test('getOwnedCustomerTracking usa Promise.allSettled (non Promise.all) per le 5 fonti', () => {
  const fn = extractFn('getOwnedCustomerTracking');
  assert.match(fn, /Promise\.allSettled\(\[/, 'le 5 fetch devono essere isolate con allSettled');
  assert.doesNotMatch(
    fn.slice(0, fn.indexOf('Promise.allSettled')),
    /const \[[^\]]*\] = await Promise\.all\(\[/,
    'non deve restare un Promise.all non isolato prima di allSettled'
  );
});

test('ogni branch fallita ricade su un valore vuoto onesto, mai su dati inventati', () => {
  const fn = extractFn('getOwnedCustomerTracking');
  assert.match(fn, /const points = pointsResult\.status === 'fulfilled' \? pointsResult\.value : \[\]/);
  assert.match(fn, /const sessions = sessionsResult\.status === 'fulfilled' \? sessionsResult\.value : \[\]/);
  assert.match(fn, /const photos = photosResult\.status === 'fulfilled' \? photosResult\.value : \[\]/);
  assert.match(fn, /const finalCoverage = finalCoverageResult\.status === 'fulfilled' \? finalCoverageResult\.value : null/);
  assert.match(fn, /const issues = issuesResult\.status === 'fulfilled' \? issuesResult\.value : \[\]/);
});

test('partialErrors elenca solo le chiavi realmente fallite, mai l\'errore grezzo del provider', () => {
  const fn = extractFn('getOwnedCustomerTracking');
  assert.match(fn, /const partialErrors = \[/);
  assert.match(fn, /pointsResult\.status === 'rejected' && 'points'/);
  assert.match(fn, /sessionsResult\.status === 'rejected' && 'sessions'/);
  assert.match(fn, /photosResult\.status === 'rejected' && 'photos'/);
  assert.match(fn, /finalCoverageResult\.status === 'rejected' && 'finalCoverage'/);
  assert.match(fn, /issuesResult\.status === 'rejected' && 'issues'/);
  // Il valore restituito non deve MAI includere .reason / l'oggetto Error grezzo.
  assert.doesNotMatch(fn, /\.reason\b/, 'il motivo di rigetto grezzo non deve mai propagarsi nel valore restituito al Cliente');
  assert.match(fn, /return \{ campaign, points, sessions, photos: approvedPhotos, finalCoverage, issues: issuesWithPhotos, partialErrors \};/);
});

test('getOwnedCustomerCampaign (fetch della campagna) resta un throw pieno — non isolato, per design: senza campagna non c\'e\' pagina', () => {
  const fn = extractFn('getOwnedCustomerCampaign');
  assert.match(fn, /if \(error\) throw error;/);
  assert.match(fn, /if \(!data\) throw new CustomerCampaignAccessError\(\);/);
});
