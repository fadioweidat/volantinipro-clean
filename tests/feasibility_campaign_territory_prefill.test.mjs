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

test('FeasibilityPurchase & FeasibilityReport markup: render Door to Door and rich radius territory', async () => {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const FeasibilityPurchase = (await import('../src/pages/customer/feasibility/FeasibilityPurchase.jsx')).default;
  const FeasibilityReport = (await import('../src/pages/customer/feasibility/FeasibilityReport.jsx')).default;
  const { calculateFeasibility } = await import('../src/pages/customer/feasibility/feasibilityEngine.js');

  const context = {
    referenceId: 'camp_oroboni_100k',
    quantity: 100637,
    service: 'd2d',
    total: 2902.2,
    operationalCity: 'Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO',
    campaignAreas: '12 NIL Milano + 8 comuni limitrofi',
    areas: ['BRUZZANO', 'AFFORI', 'Cormano', 'Bresso'],
    startDate: '2026-10-15',
  };

  const inputs = initialInputs(context);
  inputs.businessType = { value: 'palestra', source: 'user_provided' };
  inputs.averageCustomerRevenue = { value: 200, source: 'user_provided' };
  inputs.averageCustomerMargin = { value: 150, source: 'user_provided' };
  inputs.targetNewCustomers = { value: 20, source: 'user_provided' };

  // 1. Test FeasibilityPurchase markup (Free Preview / Studio Completato block)
  const preview = {
    city: inputs.city.value,
    operationalCity: inputs.city.value,
    campaignAreas: inputs.campaignArea.value,
    businessType: inputs.businessType.value,
    flyerQuantity: inputs.flyerQuantity.value,
    campaignCost: 2902.2,
    breakEvenCustomers: 20,
    classification: 'CONVENIENTE',
    scenarioName: 'Prudente',
    expectedCustomers: 30,
    serviceLabel: 'Door to Door',
  };

  const purchaseHtml = renderToStaticMarkup(React.createElement(FeasibilityPurchase, { preview, inputs, context }));
  assert.ok(purchaseHtml.includes('Door to Door · Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO'), 'Header must show Door to Door and rich radius territory');
  assert.ok(purchaseHtml.includes('Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO · palestra · 100.637 volantini'), 'Studio completato block must show rich territory');
  assert.ok(!purchaseHtml.includes('Door to Door · Milano<'), 'Header must NOT collapse to just Milano');

  // 2. Test FeasibilityReport markup (Report body, header, section 3, PDF footer)
  const result = calculateFeasibility(inputs);
  const narrative = {
    executive: 'Campagna con ottimo potenziale nel raggio di 3 km.',
    business: 'Attività fitness sul territorio.',
  };

  const reportHtml = renderToStaticMarkup(React.createElement(FeasibilityReport, { inputs, result, narrative }));
  assert.ok(reportHtml.includes('Door to Door · Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO'), 'Report heading must show Door to Door and rich radius territory');
  assert.ok(reportHtml.includes('Area operativa:</strong> Raggio 3 km da Via Antonio Oroboni, 20161 Milano — NIL BRUZZANO'), 'Section 3 must show Area operativa');
  assert.ok(reportHtml.includes('Aree campagna:</strong> 12 NIL Milano + 8 comuni limitrofi'), 'Section 3 must show Aree campagna');
  assert.ok(reportHtml.includes('Servizio:</strong> Door to Door'), 'Section 3 must show Door to Door');
});

test('fallback: single municipality mode produces clean municipality name without radius clutter', () => {
  const mockData = {
    areaMode: 'municipality',
    cityName: 'Monza',
    selectedComuni: [{ name: 'Monza' }],
    zonesAllocation: [{ name: 'Monza Centro' }, { name: 'Monza San Biagio' }]
  };

  const territoryCtx = buildCampaignTerritoryContext(mockData);
  assert.equal(territoryCtx.operationalCity, 'Monza');
  assert.equal(territoryCtx.campaignAreas, 'Monza Centro, Monza San Biagio');
});
