import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatServiceLabel, buildCampaignTerritoryContext, feasibilityContext } from '../src/lib/feasibility/entryPoint.js';
import { initialInputs } from '../src/pages/customer/feasibility/feasibilitySchemas.js';
import { readFeasibility } from '../src/pages/customer/feasibility/feasibilityStorage.js';

function withHistoryWindow(state) {
  const map = new Map();
  return {
    history: { state },
    sessionStorage: { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
  };
}

test('formatServiceLabel: maps internal service codes to customer-facing labels', () => {
  assert.equal(formatServiceLabel('d2d'), 'Door to Door');
  assert.equal(formatServiceLabel('door to door'), 'Door to Door');
  assert.equal(formatServiceLabel('Door to Door'), 'Door to Door');
  assert.equal(formatServiceLabel('h2h'), 'Hand to Hand');
  assert.equal(formatServiceLabel('hand to hand'), 'Hand to Hand');
  assert.equal(formatServiceLabel('b2b'), 'Distribuzione presso attività e aziende');
  assert.equal(formatServiceLabel('business'), 'Distribuzione presso attività e aziende');
  assert.equal(formatServiceLabel(null), 'Servizio non indicato');
});

test('buildCampaignTerritoryContext: preserves 3km radius from address in Bruzzano with 12 NILs + 8 external comuni', () => {
  const nilZones = [
    { name: 'BRUZZANO', isNil: true, nilCode: '88' },
    { name: 'AFFORI', isNil: true, nilCode: '87' },
    { name: 'NIGUARDA', isNil: true, nilCode: '86' },
    { name: 'BOVISASCA', isNil: true, nilCode: '85' },
    { name: 'COMASINA', isNil: true, nilCode: '84' },
    { name: 'BOVISA', isNil: true, nilCode: '83' },
    { name: 'DERGANO', isNil: true, nilCode: '82' },
    { name: 'BICOCCA', isNil: true, nilCode: '81' },
    { name: 'GRECO', isNil: true, nilCode: '80' },
    { name: 'PRATO CENTENARO', isNil: true, nilCode: '79' },
    { name: 'SEGNANO', isNil: true, nilCode: '78' },
    { name: 'PARCO NORD', isNil: true, nilCode: '77' },
  ];
  const externalComuni = [
    { name: 'Cormano', isComune: true, territoryLevel: 'comune' },
    { name: 'Bresso', isComune: true, territoryLevel: 'comune' },
    { name: 'Cusano Milanino', isComune: true, territoryLevel: 'comune' },
    { name: 'Novate Milanese', isComune: true, territoryLevel: 'comune' },
    { name: 'Bollate', isComune: true, territoryLevel: 'comune' },
    { name: 'Paderno Dugnano', isComune: true, territoryLevel: 'comune' },
    { name: 'Cinisello Balsamo', isComune: true, territoryLevel: 'comune' },
    { name: 'Sesto San Giovanni', isComune: true, territoryLevel: 'comune' },
  ];
  const mockData = {
    areaMode: 'radius',
    radiusKm: 3,
    addressLabel: 'Via Antonio Oroboni, 20161 Milano',
    selectedSearchPoint: {
      label: 'Via Antonio Oroboni, 20161 Milano',
      nilName: 'BRUZZANO',
      nilCode: '88',
      comune: 'Milano'
    },
    cityName: 'Milano',
    zonesAllocation: [...nilZones, ...externalComuni],
  };
  const territoryCtx = buildCampaignTerritoryContext(mockData);
  assert.equal(territoryCtx.operationalCity, 'Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO');
  assert.equal(territoryCtx.campaignAreas, '12 NIL Milano + 8 comuni limitrofi');
  assert.equal(territoryCtx.areas.length, 20);
});

test('initialInputs & readFeasibility: prefill enriched territory and human readable service label', () => {
  const ctx = feasibilityContext({
    referenceId: 'camp_oroboni_1',
    quantity: 15000,
    service: 'd2d',
    total: 850,
    operationalCity: 'Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO',
    campaignAreas: '12 NIL Milano + 8 comuni limitrofi',
    areas: ['BRUZZANO', 'AFFORI', 'Cormano', 'Bresso'],
    startDate: '2026-10-15',
  });
  assert.equal(ctx.service, 'd2d');
  assert.equal(ctx.serviceLabel, 'Door to Door');
  assert.equal(ctx.operationalCity, 'Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO');
  assert.equal(ctx.campaignAreas, '12 NIL Milano + 8 comuni limitrofi');
  const browser = withHistoryWindow({
    feasibility: ctx,
    contextSource: 'quote',
  });
  const state = readFeasibility(browser);
  assert.equal(state.inputs.serviceType.value, 'Door to Door');
  assert.equal(state.inputs.serviceType.source, 'campaign_existing');
  assert.equal(state.inputs.city.value, 'Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO');
  assert.equal(state.inputs.city.source, 'campaign_existing');
  assert.equal(state.inputs.campaignArea.value, '12 NIL Milano + 8 comuni limitrofi');
  assert.equal(state.inputs.campaignArea.source, 'campaign_existing');
  assert.equal(state.inputs.campaignCost.value, 850);
  assert.equal(state.inputs.flyerQuantity.value, 15000);
});
