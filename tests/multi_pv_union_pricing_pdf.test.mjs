import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildMultiPvTerritoryPlan, splitIntegerProportionally } from '../src/lib/step2/multiPvTerritoryPlan.js';
import { buildMultiZoneDistributionZones, buildPointOfSalePricing, buildMultiZoneCampaignZonesPayload, buildMultiZoneMetadata, summarizeCampaignZones } from '../src/lib/step2/campaignZonesModel.js';
import { calculateQuotePricing } from '../src/lib/quotePricing.js';
import { calculateDistributionZonePrice, calculateMultiZoneDistributionPrice } from '../src/lib/pricing/distributionPricing.js';
import { generateQuotePdfBytes } from '../src/lib/pdf/generateQuotePdf.js';
import { classifyMunicipalityForPrice } from '../src/lib/step2/municipalityPricingTier.js';
import { selectCampaignStep3Summary } from '../src/lib/step3/campaignStep3Summary.js';

// This test fixture is explicitly synthetic. It tests geographic invariants;
// it is NOT evidence of live Milan household counts.
const square = (lng, lat, dx = .016, dy = .012) => ({ type: 'Polygon', coordinates: [[
  [lng, lat], [lng + dx, lat], [lng + dx, lat + dy], [lng, lat + dy], [lng, lat],
]] });
const units = [
  { id: 'nil_1', name: 'NIL TEST', isNil: true, nilCode: '1', parent_municipality: 'Milano', familiesTotal: 10000, densita: 8000, geometry: square(9.10, 45.46) },
  { id: 'comune_baranzate', name: 'Baranzate', municipality_code: '015250', isNil: false, familiesTotal: 6000, densita: 4000, geometry: square(9.116, 45.46) },
];
function pv(id, lng, quantity = 10000, radiusKm = 3) {
  return { id, readyForQuote: true, city: { name: 'Milano', lat: 45.46, lng: 9.11 }, cityName: 'Milano',
    selectedComuni: [{ name: 'Milano' }], searchMode: 'address', radiusKm, selectedSearchPoint: { lat: 45.466, lng, label: `Via Test ${id}, Milano` },
    assigned_flyers: quantity, finalFlyers: quantity, store_name: `PV ${id}`,
    kpiSnapshot: { families: 14000, requiredFlyers: 15000, areaMode: 'radius', center: { lat: 45.466, lng }, radiusKm },
    allocation: units,
  };
}
const summary = (...pvs) => summarizeCampaignZones(pvs);

test('Step2 overlap notice promises unique families in Step4, not obsolete double-counting', () => {
  const ui = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
  assert.match(ui, /Le stime per singolo PV in questo Step sono preliminari/);
  assert.match(ui, /le famiglie vengono conteggiate una sola volta/);
  assert.doesNotMatch(ui, /vengono sommate senza deduplica/);
});

test('largest remainder is exact, deterministic, and never pools different PV orders', () => {
  assert.deepEqual(splitIntegerProportionally(10000, [1, 1, 1]), [3334, 3333, 3333]);
  assert.deepEqual(splitIntegerProportionally(1, [9, 1]), [1, 0]);
  assert.equal(splitIntegerProportionally(10, [0, 0]), null);
});

test('two identical radii count families ONCE, never twice; every cell has one owner', () => {
  const s = summary(pv('a', 9.115), pv('b', 9.115));
  const plan = buildMultiPvTerritoryPlan(s);
  // One PV receives no exclusive homes: totals cannot be commercially priced,
  // but geometric union remains countable and no double delivery is invented.
  assert.equal(plan.ready, false);
  assert.ok(plan.rows.reduce((a, r) => a + r.families, 0) > 0);
  assert.ok(plan.rows.reduce((a, r) => a + r.families, 0) <= 16000);
  assert.ok(plan.overlapCells > 0);
  assert.equal(plan.totalFamilies, null);
  assert.equal(plan.rows.reduce((n, z) => n + z.quantity, 0), 20000);
  assert.ok(plan.rows.filter(z => z.municipalities.length).every(z => z.municipalities.reduce((n, c) => n + c.quantity, 0) === z.quantity));
  assert.ok(plan.capacityWarnings.length > 0, 'shortfall is signalled when copies exceed exclusive homes');
  const again = buildMultiPvTerritoryPlan(s);
  assert.deepEqual(again.rows, plan.rows);
});

test('manual overlap assignment changes owner, not union or total PV flyers', () => {
  const s = summary(pv('a', 9.111), pv('b', 9.119));
  const initial = buildMultiPvTerritoryPlan(s);
  assert.equal(initial.ready, true);
  const shared = initial.ownershipChoices.find(c => c.eligiblePvIds.includes('a') && c.eligiblePvIds.includes('b'));
  assert.ok(shared);
  const override = buildMultiPvTerritoryPlan(s, { [shared.key]: 'b' });
  assert.equal(override.rows.reduce((a, r) => a + r.families, 0), initial.rows.reduce((a, r) => a + r.families, 0));
  assert.ok(override.rows.find(r => r.id === 'b').families >= initial.rows.find(r => r.id === 'b').families);
});

test('Milano NIL retains Milano parent even if the PV starts in Pero; municipality tier is invariant', () => {
  const a = pv('a', 9.111);
  a.city = { name: 'Pero', lat: 45.466, lng: 9.111 };
  a.allocation = [{ ...units[0], parent_municipality: 'Pero', densita: 700 }];
  const b = pv('b', 9.121);
  b.allocation = [{ ...units[0], parent_municipality: 'Rho', densita: 10000 }, { ...units[1], densita: 8000 }];
  const plan = buildMultiPvTerritoryPlan(summary(a, b));
  assert.equal(plan.ready, true, plan.issues?.join(' | '));
  assert.ok(plan.rows.flatMap(r => r.municipalities).some(c => c.name === 'Milano' && c.tier === 'MILANO_CORE'));
  assert.ok(!plan.rows.flatMap(r => r.municipalities).some(c => c.name === 'Pero'));
  assert.ok(plan.rows.flatMap(r => r.municipalities).filter(c => c.name === 'Baranzate').every(c => c.tier === 'HINTERLAND_DENSE'));
  assert.equal(classifyMunicipalityForPrice({ name: 'Pero' }).tier, 'COMO_LECCO');
  assert.equal(classifyMunicipalityForPrice({ name: 'Rho', code: '015182' }).tier, 'COMO_LECCO');
  assert.equal(classifyMunicipalityForPrice({ name: 'Baranzate', code: '015250' }).tier, 'HINTERLAND_DENSE');
});

test('two PV × two municipalities price independently by municipality tier; PDF contains details', () => {
  const originalPVs = [pv('west', 9.112, 10000), pv('east', 9.121, 10000)];
  const s = summary(...originalPVs);
  const plan = buildMultiPvTerritoryPlan(s);
  assert.equal(plan.ready, true, plan.issues?.join(' | '));
  assert.equal(plan.rows.length, 2);
  for (const row of plan.rows) {
    assert.equal(row.municipalities.reduce((n, c) => n + c.quantity, 0), row.quantity);
    assert.equal(row.distributionPrice, Math.round((row.municipalities.reduce((n, c) => n + c.price, 0) + row.minimumAdjustment) * 100) / 100);
    for (const comune of row.municipalities) {
      const fullPvTierPrice = calculateDistributionZonePrice(comune.tier, row.quantity);
      assert.equal(comune.price, Math.round(fullPvTierPrice * comune.quantity / row.quantity * 100) / 100);
      assert.equal(comune.ratePerThousand, fullPvTierPrice * 1000 / row.quantity);
    }
  }
  assert.deepEqual([...new Set(plan.rows.flatMap(r => r.municipalities.map(c => c.name)))].sort(), ['Baranzate', 'Milano']);
  assert.notEqual(plan.distributionTotal, 700, 'not 2 × single-Milano price');
  const withPlan = { ...s, territoryPlan: plan, totalFamilies: plan.totalFamilies };
  assert.deepEqual(buildMultiZoneDistributionZones(withPlan), plan.distributionZones);
  assert.equal(buildPointOfSalePricing(withPlan).distributionTotal, plan.distributionTotal);
  const step3 = selectCampaignStep3Summary({ type: 'd2d', campaignZones: originalPVs });
  assert.equal(step3.priceVerified, true);
  assert.equal(step3.distributionSubtotal, plan.distributionTotal, 'Step3 and Step4 must have the SAME commercial price');
  const priced = calculateQuotePricing({ quantity: 20000, pricePerThousand: 35, baseCostOverride: plan.distributionTotal });
  assert.equal(priced.baseCost, plan.distributionTotal);
  assert.notEqual(calculateMultiZoneDistributionPrice(plan.distributionZones).distributionSubtotal, plan.distributionTotal,
    'Legacy multi-comune and per-PV weighted pricing are separate commercial rules');
  assert.equal(buildMultiZoneCampaignZonesPayload(withPlan).reduce((n, r) => n + r.quantity, 0), 20000);
  assert.equal(buildMultiZoneMetadata(withPlan).capacity_deduplicated, true);
  const bytes = generateQuotePdfBytes({ service: 'Door to Door', generatedAt: '2026-11-14T12:00:00Z', campaign: { quantity: 20000 },
    outputs: { estimatedFamilies: plan.totalFamilies, recommendedFlyers: 22000, insertedFlyers: 20000 },
    area: { mainArea: 'Milano e Baranzate' },
    pointOfSaleBreakdown: { rows: plan.rows, totalFamilies: plan.totalFamilies, method: plan.method, overlapCells: plan.overlapCells, capacityWarnings: plan.capacityWarnings },
    pricing: { lines: [{ label: 'Distribuzione', quantity: 20000, total: priced.baseCost }], total: priced.total },
  });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF');
  assert.ok(bytes.length > 10000, `valid PDF length ${bytes.length}`);
  const raw = new TextDecoder('windows-1252').decode(bytes);
  assert.match(raw, /Prezzo per PV e comune/);
  assert.match(raw, /Baranzate/);
  assert.match(raw, /PV west/);
});

test('ten PV remain deterministic, unique families bounded by territory, 100k unpooled copies', () => {
  const ten = Array.from({ length: 10 }, (_, i) => pv(String(i + 1), 9.112 + i * .002, 10000));
  const plan = buildMultiPvTerritoryPlan(summary(...ten));
  assert.equal(plan.ready, true, plan.issues?.join(' | '));
  assert.ok(plan.totalFamilies <= 16000);
  assert.equal(plan.rows.reduce((a, pv) => a + pv.quantity, 0), 100000);
  assert.equal(plan.distributionZones.reduce((a, z) => a + z.quantity, 0), 100000);
  assert.ok(plan.rows.every(pv => pv.municipalities.reduce((a, m) => a + m.quantity, 0) === 10000));
  assert.ok(plan.distributionTotal > 3500);
  const reverse = buildMultiPvTerritoryPlan(summary(...[...ten].reverse()));
  assert.equal(reverse.totalFamilies, plan.totalFamilies, 'PV order must not alter unique families');
  const priced = calculateQuotePricing({ quantity: 100000, pricePerThousand: 35, baseCostOverride: plan.distributionTotal });
  assert.equal(priced.baseCost, plan.distributionTotal);
  const pdf = generateQuotePdfBytes({ service: 'Door to Door', generatedAt: '2026-11-14T12:00:00Z',
    campaign: { quantity: 100000, format: 'A5' }, area: { mainArea: 'Milano e Baranzate' },
    outputs: { estimatedFamilies: plan.totalFamilies, insertedFlyers: 100000, recommendedFlyers: Math.ceil(plan.totalFamilies * 1.1) },
    pointOfSaleBreakdown: { method: plan.method, totalFamilies: plan.totalFamilies, overlapCells: plan.overlapCells, rows: plan.rows, capacityWarnings: plan.capacityWarnings },
    pricing: { lines: [{ label: 'Distribuzione', quantity: 100000, total: priced.baseCost }], subtotal: priced.baseCost, total: priced.total },
  });
  const pdfText = new TextDecoder('windows-1252').decode(pdf);
  for (let i = 1; i <= 10; i++) assert.match(pdfText, new RegExp(`PV ${i}[: ]`));
  assert.match(pdfText, /Baranzate/);
  assert.match(pdfText, /famiglie uniche/);
  assert.match(pdfText, /EUR\/1.000 PV/);
  if (process.env.VOLANTINIPRO_QA_PDF_EXPORT) writeFileSync(process.env.VOLANTINIPRO_QA_PDF_EXPORT, pdf);
});

test('traditional client-selected multi-comune still charges a minimum PER comune', () => {
  assert.equal(calculateMultiZoneDistributionPrice([
    { territory: 'MILANO_CORE', quantity: 1 },
    { territory: 'HINTERLAND_DENSE', quantity: 1 },
  ]).distributionSubtotal, 260);
  const step4 = readFileSync(new URL('../src/pages/public/configurator/Step4.jsx', import.meta.url), 'utf8');
  assert.match(step4, /baseCostOverride: isMultiZoneQuote && multiPvPlan\?\.ready \? multiPvPlan\.distributionTotal : null/);
});

test('missing full-territory geometry or household total fails closed rather than printing misleading figures', () => {
  const a = pv('a', 9.112);
  a.allocation = [{ id: 'nil_1', name: 'NIL TEST', families: 1234 }];
  const plan = buildMultiPvTerritoryPlan(summary(a, pv('b', 9.118)));
  assert.equal(plan.ready, false);
  assert.equal(plan.totalFamilies, null);
  assert.deepEqual(plan.rows, []);
});

test('two previously supported non-radius PV in disjoint comuni remain quotable', () => {
  const a = pv('a', 9.112, 10000);
  a.searchMode = 'municipality';
  a.city = { name: 'Milano', lat: 45.466, lng: 9.108 };
  a.allocation = [units[0]];
  const b = pv('b', 9.125, 10000);
  b.searchMode = 'municipality';
  b.city = { name: 'Baranzate', lat: 45.466, lng: 9.128 };
  b.allocation = [units[1]];
  const plan = buildMultiPvTerritoryPlan(summary(a, b));
  assert.equal(plan.ready, true, plan.issues?.join(' | '));
  assert.deepEqual(plan.rows.map(r => r.municipalities[0].name), ['Milano', 'Baranzate']);
  assert.equal(plan.distributionTotal, 770);
});
