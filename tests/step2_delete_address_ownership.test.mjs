import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { activatePointOfSale, deleteAndActivatePointOfSale, resolvePointOfSaleCoverageAddress,
  shouldAdoptZoneAnalysis, nextZoneAnalysisOwner, isZoneAnalysisDataUsable } from '../src/lib/step2/campaignZonesModel.js';
import { readConfiguratorDraft, writeConfiguratorDraft } from '../src/lib/configuratorState.js';
import { useServiceAnalysis } from '../src/hooks/useServiceAnalysis.js';

const MILANO = { name: 'Milano', label: 'Milano', lat: 45.4641943, lng: 9.1896346 };
const TORINO = { label: 'Via Torino, Milano', lat: 45.4609464, lng: 9.184435, type: 'address' };
const COMO = { label: 'Corso Como, Milano', lat: 45.4817426, lng: 9.1872468, type: 'address' };
const NIL = { id: 'pv_isola', city: MILANO, cityName: 'Milano', searchMode: 'municipality', nilManualMode: true,
  selected: ['nil_17_11'], selectedSearchPoint: null, coverage: { address: null }, readyForQuote: true,
  assigned_flyers: 5959, finalFlyers: 5959, coverageDecision: 'useRecommended',
  zonesAllocation: [{ id: 'nil_17_11', name: 'ISOLA', assignedFlyers: 5959 }] };
function radius(id, point, quantity) { return { id, city: MILANO, cityName: 'Milano', searchMode: 'address', nilManualMode: false,
  radius: 1, radiusKm: 1, selected: [`${id}_nil`], selectedSearchPoint: point, coverage: { address: { ...point, municipality: 'Milano' } },
  assigned_flyers: quantity, finalFlyers: quantity, readyForQuote: true, radiusSelectionConfirmed: true }; }
const PV2 = radius('pv_torino', TORINO, 14060), PV3 = radius('pv_como', COMO, 5000);
const clone = value => structuredClone(value);
function active(zones, id) { return activatePointOfSale({ campaignZones: clone(zones), activeZoneId: id, campaignBaseQuantity: 10000 }, id); }
function assertOwner(state, survivor) {
  assert.equal(state.activeZoneId, survivor.id);
  assert.deepEqual(state.coverage.address, survivor.coverage?.address ?? null, 'coverage.address belongs only to survivor');
  assert.deepEqual(state.selectedSearchPoint, survivor.selectedSearchPoint ?? null);
  assert.equal(state.qty, survivor.assigned_flyers);
  assert.equal(state.finalFlyers, survivor.finalFlyers);
  assert.deepEqual(state.zones, survivor.selected);
  assert.equal(state.nilManualMode, Boolean(survivor.nilManualMode));
  assert.equal(state.searchMode, survivor.searchMode);
  assert.equal(state.radiusSelectionConfirmed, Boolean(survivor.radiusSelectionConfirmed || survivor.searchMode === 'address' && ((survivor.selected || []).length || (survivor.zonesAllocation || []).length)), 'radius confirmation belongs only to the survivor');
  const stored = state.campaignZones.find(zone => zone.id === survivor.id);
  assert.deepEqual(stored, survivor, 'deleting another PV cannot alter the survivor record');
  assert.equal(stored.readyForQuote, true);
}
function hydrate(state) {
  const storage = { value: null, setItem(_key, value) { this.value = value; }, getItem() { return this.value; } };
  writeConfiguratorDraft(storage, state);
  const restored = readConfiguratorDraft(storage);
  return activatePointOfSale(restored, restored.activeZoneId);
}

test('A/H: deleting active Via Torino radius leaves addressless ISOLA clean before render and after refresh', () => {
  const before = active([NIL, PV2], PV2.id);
  const savedNil = clone(before.campaignZones[0]);
  assert.match(before.coverage.address.label, /Torino/);
  const after = deleteAndActivatePointOfSale(before, PV2.id);
  assertOwner(after, savedNil);
  assert.equal(after.selectedSearchPoint, null);
  assert.equal(after.coverage.address, null);
  assert.equal(JSON.stringify(after).includes('Via Torino'), false);
  assert.equal(JSON.stringify(after).includes(String(TORINO.lat)), false);
  assertOwner(hydrate(after), savedNil);
});
test('A: deleting active PV cannot enable legacy fallback for a survivor without a coverage object', () => {
  const survivor = clone(NIL); delete survivor.coverage;
  assertOwner(deleteAndActivatePointOfSale(active([survivor, PV2], PV2.id), PV2.id), survivor);
});
test('B/H: deleting active NIL preserves the radius survivor own address/radius after hydration', () => {
  const after = deleteAndActivatePointOfSale(active([PV2, NIL], NIL.id), NIL.id);
  assertOwner(after, PV2); assert.equal(after.radiusKm, 1); assertOwner(hydrate(after), PV2);
});
test('C/H: radius/radius deletion retains only the surviving address and coordinates', () => {
  const after = deleteAndActivatePointOfSale(active([PV2, PV3], PV3.id), PV3.id);
  assertOwner(after, PV2); assertOwner(hydrate(after), PV2); assert.equal(JSON.stringify(after).includes('Corso Como'), false);
});
test('D: deleting the middle active PV of three preserves both remaining records', () => {
  const after = deleteAndActivatePointOfSale(active([NIL, PV2, PV3], PV2.id), PV2.id);
  assert.deepEqual(after.campaignZones, [NIL, PV3]); assertOwner(after, NIL); assertOwner(hydrate(after), NIL);
});
for (const order of [[1, 3, 4, 2], [4, 2, 3, 1], [2, 1, 4, 3]]) {
  test(`E/H: five PVs retain ownership through active deletion order ${order.join(',')}`, () => {
    const five = [NIL, PV2, PV3, radius('pv_four', { ...COMO, label: 'Via Quattro', lat: 45.5 }, 6000), radius('pv_five', { ...TORINO, label: 'Via Cinque', lng: 9.3 }, 7000)];
    let state = active(five, five[order[0]].id);
    for (const index of order) {
      state = activatePointOfSale(state, five[index].id);
      state = deleteAndActivatePointOfSale(state, five[index].id);
      assertOwner(state, five.find(zone => zone.id === state.activeZoneId));
      state = hydrate(state); assertOwner(state, five.find(zone => zone.id === state.activeZoneId));
    }
    assertOwner(state, NIL); assert.equal(state.campaignZones.length, 1);
  });
}
test('F: deleting a non-active PV preserves active ownership', () => {
  assertOwner(deleteAndActivatePointOfSale(active([NIL, PV2, PV3], PV2.id), NIL.id), PV2);
  assertOwner(deleteAndActivatePointOfSale(active([NIL, PV2], NIL.id), PV2.id), NIL);
});
test('G/I: NIL/radius switching before deletion never transfers an address', () => {
  let state = active([NIL, PV2], NIL.id);
  for (const zone of [PV2, NIL, PV2, NIL, PV2]) { state = activatePointOfSale(state, zone.id); assertOwner(state, zone); }
  assertOwner(deleteAndActivatePointOfSale(state, PV2.id), NIL);
});
test('H: hydration repairs an explicit addressless modern PV with a contaminated campaign-level address', () => {
  const contaminated = { ...active([NIL], NIL.id), coverage: { address: clone(PV2.coverage.address) } };
  assertOwner(hydrate(contaminated), NIL);
  assert.equal(resolvePointOfSaleCoverageAddress(NIL, [NIL], contaminated.coverage), null);
});
test('J: genuine single-PV legacy address remains compatible', () => {
  const legacy = { id: 'legacy', city: MILANO, assigned_flyers: 10000, finalFlyers: 10000 };
  const state = activatePointOfSale({ campaignZones: [legacy], activeZoneId: legacy.id, coverage: { address: TORINO } }, legacy.id);
  assert.deepEqual(state.coverage.address, TORINO);
  assert.deepEqual(hydrate(state).coverage.address, TORINO);
  assert.equal(resolvePointOfSaleCoverageAddress(legacy, [legacy], { address: TORINO }), TORINO);
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function AnalysisProbe({ args, probe }) { probe.current = useServiceAnalysis(...args); return null; }
test('async: a late PV2 territorial result cannot be adopted after deletion or switch to PV1', async t => {
  const oldFetch = global.fetch, oldUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = 'https://ownership.fixture.invalid';
  const pending = []; global.fetch = (url, options) => new Promise(resolve => pending.push({ url, options, resolve }));
  t.after(() => { global.fetch = oldFetch; if (oldUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = oldUrl; });
  const probe = { current: null }; let renderer;
  const args = zone => [zone.selectedSearchPoint?.lat || MILANO.lat, zone.selectedSearchPoint?.lng || MILANO.lng, zone.radiusKm || 3, 'd2d', 'Milano', zone.finalFlyers, zone.id, 'nil'];
  await act(async () => { renderer = TestRenderer.create(React.createElement(AnalysisProbe, { args: args(PV2), probe })); });
  t.after(() => act(() => renderer.unmount()));
  await act(async () => { await wait(500); }); assert.equal(pending.length, 1);
  const survivor = deleteAndActivatePointOfSale(active([NIL, PV2], PV2.id), PV2.id);
  await act(async () => { renderer.update(React.createElement(AnalysisProbe, { args: args(NIL), probe })); });
  await act(async () => { pending[0].resolve({ ok: true, json: async () => ({ values: { address: TORINO, families: 99999 }, nil_breakdown: [{ name: 'PV2 WRONG', coordinates: [TORINO.lng, TORINO.lat] }] }) }); await wait(500); });
  assert.equal(pending[0].options.signal.aborted, true);
  assert.ok(!JSON.stringify(probe.current.data).includes('PV2 WRONG'));
  const context = { activeZoneId: NIL.id, localZoneId: NIL.id, armedZoneId: NIL.id, fetchKey: probe.current.fetchKey, dataKey: 'pv2-stale-key', loading: false };
  assert.equal(shouldAdoptZoneAnalysis(context), false);
  assert.deepEqual(nextZoneAnalysisOwner(null, context), { zoneId: null, dataKey: null });
  assert.equal(isZoneAnalysisDataUsable({ owner: { zoneId: PV2.id, dataKey: 'pv2-stale-key' }, ...context }), false);
  assertOwner(survivor, NIL);
});
