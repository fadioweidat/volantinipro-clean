// P0 engine vs the CURRENT Production pricing modules (identical at 047a764 and HEAD).
// Every difference must be classified: EXPECTED APPROVED BUSINESS CHANGE,
// LEGACY COMPATIBILITY DIFFERENCE, EXISTING PRODUCTION INCONSISTENCY or (forbidden)
// UNEXPECTED REGRESSION.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceQuote, catalog as C, zoneBaseCents, zoneRational, flatBaseCents, LEGACY_FLOAT } from '../src/lib/pricing/engine/index.js';
import { calculateDistributionZonePrice, calculateMultiZoneDistributionPrice, TERRITORY_MINIMUMS, URGENCY_SURCHARGE_PCT } from '../src/lib/pricing/distributionPricing.js';
import { calculateQuotePricing } from '../src/lib/quotePricing.js';
import { QUOTE_PRICES } from '../src/lib/appConstants.js';
import { buildExtraServicesRegistry, buildExtraServicesById, normalizeSelectedExtras, CONTROL_PRO_INCLUDED_IDS } from '../src/lib/extraServicesRegistry.js';
import { calculatePrintPrice } from '../src/lib/pricing/printPricing.js';
import { GRAPHIC_SERVICE_PRICE } from '../src/lib/pricing/graphicPricing.js';

const cents = v => (v == null ? null : Math.round(v * 100));
// Deterministic PRNG (mulberry32).
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, list) => list[Math.floor(r() * list.length)];

// Server-resolved territory fixtures (names/densities as geo_municipalities would return).
const TERRITORY = {
  MI: { status: 'resolved', municipalityName: 'Milano', municipalityCode: '015146', densityPerKm2: 7450, source: 'geo_municipalities' },
  SSG: { status: 'resolved', municipalityName: 'Sesto San Giovanni', municipalityCode: '015209', densityPerKm2: 6800, source: 'geo_municipalities' },
  CO: { status: 'resolved', municipalityName: 'Como', municipalityCode: '013075', densityPerKm2: 2900, source: 'geo_municipalities' },
  HD: { status: 'resolved', municipalityName: 'Comune Denso', municipalityCode: 'X1', densityPerKm2: 3100, source: 'geo_municipalities' },
  CL: { status: 'resolved', municipalityName: 'Comune Medio', municipalityCode: 'X2', densityPerKm2: 1200, source: 'geo_municipalities' },
  LD: { status: 'resolved', municipalityName: 'Comune Montano', municipalityCode: 'X3', densityPerKm2: 90, source: 'geo_municipalities' },
};
const TIER_OF = { MI: 'MILANO_CORE', SSG: 'HINTERLAND_DENSE', CO: 'COMO_LECCO', HD: 'HINTERLAND_DENSE', CL: 'COMO_LECCO', LD: 'LOW_DENSITY_MOUNTAIN' };
const ACTIVE_EXTRAS = ['control_pro', 'tracking_gps', 'photo_proof', 'photo_report_advanced', 'video_proof', 'qr_analytics', 'advanced_report', 'account_manager', 'dedicated_supervision', 'puntiVetrina'];
const PLAN = { single: 0, monthly3: 3, monthly6: 5, monthly12: 8 };
const PRINT_SPECS = [null,
  { format: 'A5', grammage: '130', sides: 'fronte_retro', color: 'colori', paperType: 'patinata_opaca', fold: 'nessuna' },
  { format: 'A4', grammage: '170', sides: 'solo_fronte', color: 'colori', paperType: 'patinata_lucida', fold: 'nessuna' },
  { format: 'A6', grammage: '300', sides: 'fronte_retro', color: 'colori', paperType: 'patinata_opaca', fold: 'nessuna' },
  { format: 'A5', grammage: '130', sides: 'fronte_retro', color: 'colori', paperType: 'patinata_opaca', fold: 'meta' }, // REQUIRES_REVIEW
];

/** Current Production Step4 pipeline for a single PV (same calls as Step4.jsx). */
function production({ service, zones, quantity, urgency, plan, extraIds, printing, artwork }) {
  // Production selects Punti Vetrina through the Step1 flag data.puntiVetrina (its registry legacyIds is empty).
  const data = { extraServices: extraIds.filter(id => id !== 'puntiVetrina'), urgency, puntiVetrina: extraIds.includes('puntiVetrina') };
  const registry = buildExtraServicesRegistry({ flyerQty: quantity, durationDays: 1, campaignDurationKnown: false, printConfig: printing ? { ...printing, urgency } : null });
  const selected = normalizeSelectedExtras(data, buildExtraServicesById(registry)).filter(e => e.id !== 'printing');
  const pricing = calculateQuotePricing({ quantity, pricePerThousand: QUOTE_PRICES[service] || 18.5, smartPairingDiscountPct: 0, urgency, planDiscountPct: PLAN[plan],
    extras: selected, distributionZones: service === 'd2d' ? zones.map(z => ({ territory: TIER_OF[z.territoryRef], quantity: z.quantity })) : null });
  const pq = printing ? calculatePrintPrice({ quantity, printFormat: printing.format, grammage: printing.grammage, sides: printing.sides, color: printing.color,
    paperType: printing.paperType, fold: printing.fold, orientation: printing.orientation, urgency, enabled: true }) : null;
  const printingLine = pq && pq.customerPrice != null ? pq.customerPrice : 0;
  const graphics = artwork ? GRAPHIC_SERVICE_PRICE : 0;
  return { base: cents(pricing.baseCost), urgency: cents(pricing.urgencySurcharge), plan: cents(pricing.planDiscountAmount), extras: cents(pricing.extraCost),
    total: cents(pricing.total), grandTotal: cents(Number((pricing.total + printingLine + graphics).toFixed(2))) };
}
function engine({ service, zones, quantity, urgency, plan, extraIds, printing, artwork }, rounding) {
  const pv = service === 'd2d' ? { pvId: 'pv1', zones } : { pvId: 'pv1', quantity };
  return priceQuote({ request: { service, urgency, plan, pvs: [pv], extras: extraIds, printing, graphics: { required: artwork, selected: artwork } }, territory: TERRITORY, rounding });
}

test('catalog equals the Production constants it was copied from', () => {
  for (const t of C.TIERS) assert.equal(C.MINIMUM_CENTS[t], TERRITORY_MINIMUMS[t] * 100, t);
  assert.equal(C.FLAT_RATE_CENTS_PER_1000.h2h, QUOTE_PRICES.h2h * 100);
  assert.equal(C.FLAT_RATE_CENTS_PER_1000.b2b, QUOTE_PRICES.b2b * 100);
  assert.deepEqual({ normal: URGENCY_SURCHARGE_PCT.standard, urgent: URGENCY_SURCHARGE_PCT.urgent, express: URGENCY_SURCHARGE_PCT.express }, { ...C.URGENCY_PCT });
  for (const t of C.TIERS) for (const [k, q] of C.GRID_QUANTITIES.entries()) assert.equal(C.GRID_CENTS[t][k], cents(calculateDistributionZonePrice(t, q)), `${t}@${q}`);
  const reg = buildExtraServicesById(buildExtraServicesRegistry({ flyerQty: 10000, durationDays: 1, campaignDurationKnown: false, printConfig: null }));
  for (const [id, item] of Object.entries(C.EXTRAS)) assert.equal(item.cents, reg[id].price * 100, id);
  assert.deepEqual([...C.EXTRAS.control_pro.includes], [...CONTROL_PRO_INCLUDED_IDS]);
  assert.equal(C.GRAPHICS.cents, GRAPHIC_SERVICE_PRICE * 100);
  assert.equal(reg.graphic_design.price * 100, C.GRAPHICS.cents);
  assert.equal(reg.design.price, 49, 'legacy design price still 49 in Production (superseded by approved rule 3)');
});

const halfZone = (t, q) => { const { num, den, minimum } = zoneRational(t, q); return num > minimum * den && (2 * num) % (2 * den) === den; };
const halfPct = (c, pct) => (2 * c * pct) % 200 === 100;
const halfFlat = (s, q) => (2 * q * C.FLAT_RATE_CENTS_PER_1000[s]) % 2000 === 1000;

test('D2D zone price: legacy-float replay equals Production for every quantity; exact mode differs only at exact half-cents (+1)', () => {
  const unexplained = []; let replayDiffs = 0; let halfDiffs = 0;
  for (const t of C.TIERS) {
    const qs = [];
    for (let q = 1; q <= 60000; q += 1) qs.push(q);
    for (let q = 60001; q <= 500000; q += 97) qs.push(q);
    for (const q of qs) {
      const prod = cents(calculateDistributionZonePrice(t, q));
      if (LEGACY_FLOAT.zone(t, q) !== prod) replayDiffs += 1;
      const e = zoneBaseCents(t, q);
      if (e !== prod) { if (halfZone(t, q) && e === prod + 1) halfDiffs += 1; else unexplained.push([t, q, e, prod]); }
    }
  }
  assert.equal(replayDiffs, 0, 'legacy-float replay must reproduce Production exactly');
  assert.deepEqual(unexplained, [], `UNEXPECTED REGRESSION: ${JSON.stringify(unexplained.slice(0, 5))}`);
  console.log(`# ROUNDING zone: ${halfDiffs} exact half-cent cases where Production float rounds down and the exact engine rounds up (+1 cent)`);
});

test('flat services (h2h/b2b): legacy-float replay equals Production; exact differs only at exact half-cents', () => {
  let replayDiffs = 0; let halfDiffs = 0; const unexplained = [];
  for (const s of ['h2h', 'b2b']) for (let q = 1; q <= 200000; q += 1) {
    const prod = cents(calculateQuotePricing({ quantity: q, pricePerThousand: QUOTE_PRICES[s] }).baseCost);
    if (LEGACY_FLOAT.flat(s, q) !== prod) replayDiffs += 1;
    const e = flatBaseCents(s, q);
    if (e !== prod) { if (halfFlat(s, q) && e === prod + 1) halfDiffs += 1; else unexplained.push([s, q]); }
  }
  assert.equal(replayDiffs, 0);
  assert.deepEqual(unexplained, []);
  console.log(`# ROUNDING flat: ${halfDiffs} exact half-cent cases (+1 cent)`);
});

function corpusCase(r) {
  const service = pick(r, ['d2d', 'd2d', 'd2d', 'h2h', 'b2b']);
  const nz = service === 'd2d' ? 1 + Math.floor(r() * 3) : 0;
  const refs = Object.keys(TERRITORY);
  const zones = Array.from({ length: nz }, () => ({ territoryRef: pick(r, refs), quantity: 1 + Math.floor(r() * (r() < 0.2 ? 900 : 60000)) }));
  const quantity = service === 'd2d' ? zones.reduce((s, z) => s + z.quantity, 0) : 1 + Math.floor(r() * 80000);
  const extraIds = ACTIVE_EXTRAS.filter(id => r() < 0.25 && (id !== 'puntiVetrina' || service === 'd2d'));
  return { service, zones, quantity, urgency: pick(r, ['normal', 'urgent', 'express']), plan: pick(r, Object.keys(PLAN)), extraIds, printing: pick(r, PRINT_SPECS), artwork: r() < 0.3 };
}
const view = e => (e.status === 'priced' ? { base: e.campaign.baseCents, urgency: e.campaign.urgency.cents, plan: e.campaign.plan.cents, extras: e.campaign.payableExtrasCents,
  total: e.totals.payableCents, grandTotal: e.totals.grossQuoteCents } : { status: e.status, issues: e.issues });
function explainedByHalfCents(c, ex, lg) {
  const zoneHalf = c.service === 'd2d' ? c.zones.some(z => halfZone(TIER_OF[z.territoryRef], z.quantity)) : halfFlat(c.service, c.quantity);
  const u = C.URGENCY_PCT[c.urgency]; const p = C.PLAN_PCT[c.plan];
  return zoneHalf || halfPct(ex.base, u) || halfPct(lg.base, u) || halfPct(ex.base + ex.urgency, p) || halfPct(lg.base + lg.urgency, p);
}

test('single-PV corpus (4000 deterministic quotes): legacy-float replay == Production on every component; exact differences all explained by half-cent steps', () => {
  const r = rng(20261009);
  const replayMismatch = []; const unexplained = []; let explained = 0; let maxDelta = 0;
  for (let n = 0; n < 4000; n += 1) {
    const c = corpusCase(r);
    const p = production(c);
    const lg = view(engine(c, 'legacy-float'));
    if (JSON.stringify(lg) !== JSON.stringify(p)) replayMismatch.push({ n, c, production: p, legacy: lg });
    const ex = view(engine(c));
    if (JSON.stringify(ex) !== JSON.stringify(p)) {
      if (ex.total !== undefined && explainedByHalfCents(c, ex, lg)) { explained += 1; maxDelta = Math.max(maxDelta, Math.abs(ex.total - p.total), Math.abs(ex.grandTotal - p.grandTotal)); }
      else unexplained.push({ n, c, production: p, engine: ex });
    }
  }
  assert.equal(replayMismatch.length, 0, `structural mismatch: ${JSON.stringify(replayMismatch.slice(0, 2))}`);
  assert.equal(unexplained.length, 0, `UNEXPECTED REGRESSION: ${JSON.stringify(unexplained.slice(0, 2))}`);
  assert.ok(maxDelta <= 3, `max delta ${maxDelta}`);
  console.log(`# PARITY single-PV: 4000 quotes, legacy-float replay identical to Production; exact engine identical on ${4000 - explained}, differs on ${explained} (all half-cent rounding, max ${maxDelta} cent)`);
});

test('multi-PV base (2 and 5 PV): legacy-float replay equals Production campaign base; exact differs only via half-cent zones', () => {
  const r = rng(7); let explained = 0;
  for (let n = 0; n < 500; n += 1) {
    const pvCount = n % 2 ? 2 : 5;
    const pvs = Array.from({ length: pvCount }, (_, i) => ({ pvId: `pv${i}`, zones: Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({ territoryRef: pick(r, Object.keys(TERRITORY)), quantity: 1 + Math.floor(r() * 30000) })) }));
    const prodBase = cents(calculateMultiZoneDistributionPrice(pvs.flatMap(p => p.zones.map(z => ({ territory: TIER_OF[z.territoryRef], quantity: z.quantity })))).distributionSubtotal);
    const lg = priceQuote({ request: { service: 'd2d', pvs }, territory: TERRITORY, rounding: 'legacy-float' });
    assert.equal(lg.campaign.baseCents, prodBase);
    const ex = priceQuote({ request: { service: 'd2d', pvs }, territory: TERRITORY });
    assert.equal(ex.status, 'priced');
    if (ex.campaign.baseCents !== prodBase) {
      assert.ok(pvs.some(p => p.zones.some(z => halfZone(TIER_OF[z.territoryRef], z.quantity))));
      explained += 1;
    }
  }
  console.log(`# PARITY multi-PV base: 500 campaigns; exact differs on ${explained} (half-cent zones only)`);
});

// ---- classified differences -------------------------------------------------------
const base1 = { service: 'd2d', zones: [{ territoryRef: 'MI', quantity: 5959 }], quantity: 5959, urgency: 'normal', plan: 'single', printing: null, artwork: false };
const DIFFERENCES = [];
function record(category, name, production, engineResult) { DIFFERENCES.push({ category, name, production, engine: engineResult }); }

test('classified: legacy "design" (EUR 49, payable) -> canonical graphics EUR 79, quoted not payable', () => {
  const p = production({ ...base1, extraIds: ['design'] });
  const e = engine({ ...base1, extraIds: ['design'] });
  assert.equal(p.extras, 4900); assert.equal(p.total, 23685 + 4900);
  assert.equal(e.status, 'priced'); assert.equal(e.totals.payableCents, 23685); assert.equal(e.graphics.cents, 7900); assert.equal(e.totals.grossQuoteCents, 23685 + 7900);
  record('LEGACY COMPATIBILITY DIFFERENCE', 'legacy design alias', p, e.totals);
});

test('classified: legacy design + artwork selected -> graphics charged once (Production charged 49 + 79)', () => {
  const p = production({ ...base1, extraIds: ['design'], artwork: true });
  const e = engine({ ...base1, extraIds: ['design'], artwork: true });
  assert.equal(p.grandTotal, 23685 + 4900 + 7900);
  assert.equal(e.totals.grossQuoteCents, 23685 + 7900);
  record('EXPECTED APPROVED BUSINESS CHANGE', 'graphics single EUR 79 (rule 3) fixes double charge', p, e.totals);
});

test('classified: gps_plus_report -> unresolved (Production charges EUR 90, even next to Control PRO)', () => {
  const p = production({ ...base1, extraIds: ['control_pro', 'gps_plus_report'] });
  const e = engine({ ...base1, extraIds: ['control_pro', 'gps_plus_report'] });
  assert.equal(p.extras, 9900 + 9000);
  assert.equal(e.status, 'unresolved'); assert.ok(e.issues.some(i => i.code === 'EXTRA_DECISION_PENDING'));
  record('EXISTING PRODUCTION INCONSISTENCY', 'premium GPS/report outside Control PRO (decision pending)', p, { status: e.status });
});

test('classified: hidden legacy quality_control / operator_support -> unresolved', () => {
  for (const id of ['quality_control', 'operator_support']) {
    const p = production({ ...base1, extraIds: [id] });
    const e = engine({ ...base1, extraIds: [id] });
    assert.ok(p.extras > 0); assert.equal(e.status, 'unresolved');
    record('LEGACY COMPATIBILITY DIFFERENCE', `${id} not in canonical contract`, p, { status: e.status });
  }
});

test('classified: multi-PV operational extras priced per PV, central extras once (rule 4)', () => {
  const pvs = [0, 1].map(i => ({ pvId: `pv${i}`, zones: [{ territoryRef: 'MI', quantity: 5959 }] }));
  const e = priceQuote({ request: { service: 'd2d', pvs, extras: ['tracking_gps', 'photo_proof', 'account_manager', 'dedicated_supervision'] }, territory: TERRITORY });
  const prodExtras = (60 + 30 + 80 + 120) * 100; // Production: every extra once per campaign
  assert.equal(e.campaign.payableExtrasCents, 2 * 6000 + 2 * 3000 + 8000 + 12000);
  record('EXPECTED APPROVED BUSINESS CHANGE', 'per-PV operational extras on 2 PV', { extras: prodExtras }, { extras: e.campaign.payableExtrasCents });
});

test('classified: unresolved territory / missing density -> no quote (Production falls back to HINTERLAND_DENSE)', () => {
  const e = priceQuote({ request: { service: 'd2d', pvs: [{ pvId: 'a', zones: [{ territoryRef: 'NOPE', quantity: 5000 }] }] }, territory: {} });
  assert.equal(e.status, 'unresolved');
  const e2 = priceQuote({ request: { service: 'd2d', pvs: [{ pvId: 'a', zones: [{ territoryRef: 'X', quantity: 5000 }] }] }, territory: { X: { status: 'resolved', municipalityName: 'Ignoto' } } });
  assert.equal(e2.status, 'unresolved'); assert.ok(e2.issues.some(i => i.code === 'DENSITY_UNAVAILABLE'));
  record('LEGACY COMPATIBILITY DIFFERENCE', 'no silent HINTERLAND fallback', { base: cents(calculateDistributionZonePrice('HINTERLAND_DENSE', 5000)) }, { status: e.status });
});

test('classified: forged plan 100 % and forged density/name -> ignored (Production would honour them)', () => {
  const forgedPlan = cents(calculateQuotePricing({ quantity: 5959, pricePerThousand: 18.5, planDiscountPct: 100, distributionZones: [{ territory: 'MILANO_CORE', quantity: 5959 }] }).total);
  assert.equal(forgedPlan, 0);
  const e = priceQuote({ request: { service: 'd2d', plan: 'single', pvs: [{ pvId: 'a', zones: [{ territoryRef: 'LD', quantity: 5959, density: 99999, densita: 99999 }] }],
    clientClaims: { planDiscountPct: 100, totalAmount: 0 } }, territory: TERRITORY });
  assert.equal(e.campaign.plan.pct, 0);
  assert.equal(e.pvs[0].zones[0].tier, 'LOW_DENSITY_MOUNTAIN');
  assert.equal(e.totals.clientTotalComparison.matches, false);
  record('EXISTING PRODUCTION INCONSISTENCY', 'client-controlled plan % and density', { total: forgedPlan }, { total: e.totals.payableCents });
});

test('difference report: zero UNEXPECTED REGRESSION', () => {
  assert.ok(DIFFERENCES.length >= 7);
  assert.equal(DIFFERENCES.filter(d => d.category === 'UNEXPECTED REGRESSION').length, 0);
  for (const d of DIFFERENCES) console.log(`# DIFF [${d.category}] ${d.name}: production=${JSON.stringify(d.production)} engine=${JSON.stringify(d.engine)}`);
});
