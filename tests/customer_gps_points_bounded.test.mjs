/**
 * tests/customer_gps_points_bounded.test.mjs
 *
 * P1 — getCustomerCampaignGpsPoints() had no .limit()/date window: for a
 * long-running or very old campaign it fetched the entire
 * gps_tracking_points history in one request.
 *
 * Consumer audit (src/pages/customer/CampaignTracking.jsx) before fixing:
 *   - latestPoint = state.points[state.points.length - 1]  (needs the LAST/most recent point)
 *   - validGpsPoints / Polyline route rendering (needs a real, contiguous route)
 *   - aggregateOperationalMetrics({ gpsPoints: state.points, ... })
 *   - getOwnedCustomerReport's totalKm = calculateDistanceKm(tracking.points)
 * None of these require an unlimited full history to stay correct for any
 * realistic campaign (Step 1 lists Door to Door delivery as 5-7 giorni
 * lavorativi, not months) — a generous bounded window protects only
 * against the pathological case.
 *
 * Fix:
 *   BEFORE: .order('recorded_at', { ascending: true })   [no .limit()]
 *   AFTER:  .order('recorded_at', { ascending: false }).limit(20000), then
 *           reversed back to ascending before returning.
 *
 * The direction flip is the part that actually matters: naively bolting a
 * .limit() onto the existing ascending-order query would keep the OLDEST
 * rows and silently drop the most recent ones — breaking `latestPoint`
 * (live position) for exactly the long-running campaigns this fix targets.
 * Ordering DESC-then-reverse guarantees the kept rows are always the most
 * recent ones, and the returned array's ascending order (oldest-first) is
 * unchanged from the caller's point of view.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/lib/services/gps-api.js', import.meta.url), 'utf8');

function extractFn(name) {
  const start = SRC.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} deve esistere`);
  const nextExportIdx = SRC.indexOf('\nexport async function', start + 10);
  return SRC.slice(start, nextExportIdx > -1 ? nextExportIdx : SRC.length);
}

test('getCustomerCampaignGpsPoints ha un limite esplicito (mai una fetch illimitata)', () => {
  const fn = extractFn('getCustomerCampaignGpsPoints');
  assert.match(fn, /\.limit\(GPS_CUSTOMER_POINTS_LIMIT\)/);
  assert.match(SRC, /const GPS_CUSTOMER_POINTS_LIMIT = \d+;/);
  const limitValue = Number(SRC.match(/const GPS_CUSTOMER_POINTS_LIMIT = (\d+);/)[1]);
  assert.ok(limitValue >= 1000 && limitValue <= 100000, 'il limite deve essere generoso ma finito');
});

test('la query ordina DESC (piu recenti prima) quando applica il limite, non ASC', () => {
  const fn = extractFn('getCustomerCampaignGpsPoints');
  const orderIdx = fn.indexOf(".order('recorded_at'");
  const limitIdx = fn.indexOf('.limit(GPS_CUSTOMER_POINTS_LIMIT)');
  assert.ok(orderIdx > -1 && limitIdx > orderIdx, ".order deve precedere .limit sulla stessa query");
  assert.match(fn.slice(orderIdx, limitIdx), /ascending:\s*false/, 'con un limite attivo servono i punti PIU RECENTI, non i piu vecchi');
});

test('il risultato viene riportato in ordine ASC prima di tornare al chiamante (contratto latestPoint invariato)', () => {
  const fn = extractFn('getCustomerCampaignGpsPoints');
  assert.match(fn, /return \(data \|\| \[\]\)\.slice\(\)\.reverse\(\);/, 'il DESC dal DB deve essere ri-invertito in ASC per il consumer');
});

test('select customer-safe invariata: nessuna colonna aggiuntiva introdotta dal fix del limite', () => {
  const pointsSelect = SRC.match(/function getCustomerCampaignGpsPoints[\s\S]*?\.select\(([^)]*)\)/)[1];
  assert.match(pointsSelect, /'id, campaign_id, session_id, lat, lng, accuracy, speed, heading, recorded_at, created_at'/);
  assert.doesNotMatch(pointsSelect, /driver_id|driver_name|device_id/, 'il fix del limite non deve reintrodurre dati operatore nel payload cliente');
});
