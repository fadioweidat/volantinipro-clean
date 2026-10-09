// P0 engine: commercial rules, Multi-PV, multi-date pairing, security and contract tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceQuote, describeHistoricalPricingSnapshot, repriceHistorical, zoneBaseCents, zoneRational, allocateLargestRemainder, divHalfUp, percentOf, PRICING_VERSION, catalog as C } from '../src/lib/pricing/engine/index.js';

const T = {
  MI: { status: 'resolved', municipalityName: 'Milano', municipalityCode: '015146', densityPerKm2: 7450, source: 'geo_municipalities' },
  CO: { status: 'resolved', municipalityName: 'Como', municipalityCode: '013075', densityPerKm2: 2900, source: 'geo_municipalities' },
  HD: { status: 'resolved', municipalityName: 'Comune Denso', municipalityCode: 'X1', densityPerKm2: 3100, source: 'geo_municipalities' },
  LD: { status: 'resolved', municipalityName: 'Comune Montano', municipalityCode: 'X3', densityPerKm2: 90, source: 'geo_municipalities' },
  NIL9: { status: 'resolved', kind: 'nil', municipalityName: 'Milano', nilCode: '9', source: 'geo_nil_milano' },
};
const pv = (pvId, ref, quantity, dates) => ({ pvId, zones: [{ territoryRef: ref, quantity }], ...(dates ? { dates } : {}) });
const quote = (request, extra = {}) => priceQuote({ request: { service: 'd2d', ...request }, territory: T, ...extra });
const MI5959 = 23685;

// ---- arithmetic -------------------------------------------------------------------
test('cents helpers: half-up, exact, deterministic largest-remainder allocation', () => {
  assert.equal(divHalfUp(5, 2), 3); assert.equal(divHalfUp(4, 2), 2); assert.equal(divHalfUp(1, 3), 0); assert.equal(divHalfUp(2, 3), 1);
  assert.equal(percentOf(23685, 20), 4737); assert.equal(percentOf(10, 35), 4); assert.equal(percentOf(30, 5), 2); // 1.5 -> 2
  assert.deepEqual(allocateLargestRemainder(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateLargestRemainder(23685, [3000, 2959]), [11924, 11761]);
  assert.equal(allocateLargestRemainder(99999, [7, 11, 13, 17]).reduce((s, x) => s + x, 0), 99999);
  assert.throws(() => percentOf(100, 1.5)); assert.throws(() => divHalfUp(-1, 2)); assert.throws(() => allocateLargestRemainder(10, [0, 0]));
});

test('territorial bands and minimums: q=1 -> minimum for every tier; grid points exact; NIL priced as Milano', () => {
  for (const t of C.TIERS) {
    assert.equal(zoneBaseCents(t, 1), C.MINIMUM_CENTS[t]);
    assert.equal(zoneBaseCents(t, 1000), C.GRID_CENTS[t][0]);
    assert.equal(zoneBaseCents(t, 50000), C.GRID_CENTS[t][6]);
  }
  assert.equal(quote({ pvs: [pv('a', 'LD', 5000)] }).pvs[0].zones[0].tier, 'LOW_DENSITY_MOUNTAIN');
  assert.equal(quote({ pvs: [pv('a', 'HD', 5000)] }).pvs[0].zones[0].tier, 'HINTERLAND_DENSE');
  const nil = quote({ pvs: [pv('a', 'NIL9', 5959)] });
  assert.equal(nil.pvs[0].zones[0].tier, 'MILANO_CORE'); assert.equal(nil.totals.payableCents, MI5959);
  assert.equal(nil.pvs[0].zones[0].evidence.nilCode, '9');
});

test('rounding boundary: an exact half-cent zone rounds half-up', () => {
  let q = 1001; while (!((({ num, den }) => (2 * num) % (2 * den) === den)(zoneRational('MILANO_CORE', q)))) q += 1;
  const { num, den } = zoneRational('MILANO_CORE', q);
  assert.equal(zoneBaseCents('MILANO_CORE', q), (num + den / 2) / den);
});

// ---- single-PV baseline and existing commercial rules ---------------------------
test('single-PV Milano 5,959 flyers = EUR 236.85, payable, VAT excluded, version stamped', () => {
  const q = quote({ pvs: [pv('pv1', 'MI', 5959)] });
  assert.equal(q.status, 'priced'); assert.equal(q.totals.payableCents, MI5959); assert.equal(q.totals.grossQuoteCents, MI5959);
  assert.equal(q.vatIncluded, false); assert.equal(q.pricingVersion, PRICING_VERSION); assert.equal(q.rounding, 'exact'); assert.equal(q.serverAuthorized, false);
});

test('urgency on base and plan on (base + urgency), Production order', () => {
  const q = quote({ urgency: 'express', plan: 'monthly12', pvs: [pv('pv1', 'MI', 5959)] });
  assert.equal(q.campaign.urgency.cents, percentOf(MI5959, 35));
  assert.equal(q.campaign.plan.cents, percentOf(MI5959 + percentOf(MI5959, 35), 8));
  assert.equal(q.totals.payableCents, MI5959 + percentOf(MI5959, 35) - percentOf(MI5959 + percentOf(MI5959, 35), 8));
  for (const [code, pct] of Object.entries({ single: 0, monthly3: 3, monthly6: 5, monthly12: 8 })) assert.equal(quote({ plan: code, pvs: [pv('a', 'MI', 5959)] }).campaign.plan.pct, pct);
});

test('h2h / b2b flat base, attributed to PVs without losing a cent', () => {
  const q = priceQuote({ request: { service: 'h2h', pvs: [{ pvId: 'a', quantity: 3333 }, { pvId: 'b', quantity: 4444 }] } });
  assert.equal(q.campaign.baseCents, divHalfUp(7777 * 2200, 1000));
  assert.equal(q.pvs[0].baseCents + q.pvs[1].baseCents, q.campaign.baseCents);
});

// ---- approved rules ------------------------------------------------------------------
test('rule 1: supervision EUR 120 once per campaign for 1, 2 and 5 PV', () => {
  for (const n of [1, 2, 5]) {
    const q = quote({ pvs: Array.from({ length: n }, (_, i) => pv(`pv${i}`, 'MI', 5959)), extras: ['dedicated_supervision'] });
    assert.equal(q.status, 'priced'); assert.equal(q.extras.find(x => x.id === 'dedicated_supervision').cents, 12000);
    assert.equal(q.campaign.payableExtrasCents, 12000);
  }
});

test('rule 2: Control PRO EUR 99 absorbs GPS, photos and photo report (single PV); no double charge', () => {
  const q = quote({ pvs: [pv('a', 'MI', 5959)], extras: ['control_pro', 'tracking_gps', 'gps', 'photo_proof', 'foto', 'photo_report_advanced'] });
  assert.equal(q.status, 'priced'); assert.equal(q.campaign.payableExtrasCents, 9900);
  for (const id of ['tracking_gps', 'photo_proof', 'photo_report_advanced']) assert.equal(q.extras.find(x => x.id === id).includedIn, 'control_pro');
  // advanced_report is NOT in the catalogue's Control PRO contents -> charged separately
  assert.equal(quote({ pvs: [pv('a', 'MI', 5959)], extras: ['control_pro', 'advanced_report'] }).campaign.payableExtrasCents, 9900 + 4000);
});

test('rule 2 ambiguity: gps_plus_report (premium GPS/report) -> unresolved, never priced', () => {
  const q = quote({ pvs: [pv('a', 'MI', 5959)], extras: ['control_pro', 'gps_plus_report'] });
  assert.equal(q.status, 'unresolved'); assert.equal(q.totals, null);
  assert.ok(q.issues.some(i => i.code === 'EXTRA_DECISION_PENDING'));
});

test('rule 3: graphics EUR 79 once per campaign; legacy design/graphic_design aliases never add EUR 49; quoted, not payable', () => {
  const q = quote({ pvs: [pv('a', 'MI', 5959), pv('b', 'CO', 4000)], extras: ['design', 'grafica', 'graphic_design', 'preparazione_grafica', 'design'], graphics: { required: true, selected: true } });
  assert.equal(q.graphics.cents, 7900); assert.equal(q.graphics.payable, false);
  assert.equal(q.totals.quotedNotPayableCents, 7900);
  assert.equal(q.totals.grossQuoteCents, q.totals.payableCents + 7900);
  assert.equal(q.extras.length, 0);
  const notSelected = quote({ pvs: [pv('a', 'MI', 5959)], graphics: { required: true, selected: false } });
  assert.equal(notSelected.graphics.cents, 0);
});

test('rule 4: operational extras per PV (all or selected PVs), central extras once', () => {
  const pvs = Array.from({ length: 5 }, (_, i) => pv(`pv${i}`, i % 2 ? 'CO' : 'MI', 3000));
  const q = quote({ pvs, extras: ['tracking_gps', { id: 'video_proof', pvIds: ['pv1', 'pv3'] }, 'photo_proof', 'qr_analytics', 'advanced_report', 'account_manager'] });
  assert.equal(q.status, 'priced');
  const by = Object.fromEntries(q.extras.map(x => [x.id, x]));
  assert.equal(by.tracking_gps.units, 5); assert.equal(by.tracking_gps.cents, 30000);
  assert.equal(by.photo_proof.cents, 15000);
  assert.equal(by.video_proof.units, 2); assert.deepEqual([...by.video_proof.pvIds], ['pv1', 'pv3']);
  for (const id of ['qr_analytics', 'advanced_report', 'account_manager']) assert.equal(by[id].units, 1);
  assert.equal(q.campaign.payableExtrasCents, 30000 + 12000 + 15000 + 5000 + 4000 + 8000);
});

test('rule 4 ambiguity: Control PRO / photo report / Punti Vetrina on >1 PV -> unresolved (scope undecided)', () => {
  for (const id of ['control_pro', 'photo_report_advanced', 'puntiVetrina']) {
    const one = quote({ pvs: [pv('a', 'MI', 5959)], extras: [id] });
    assert.equal(one.status, 'priced', id);
    const two = quote({ pvs: [pv('a', 'MI', 5959), pv('b', 'CO', 4000)], extras: [id] });
    assert.equal(two.status, 'unresolved', id); assert.ok(two.issues.some(i => i.code === 'EXTRA_SCOPE_UNDECIDED'));
  }
  assert.equal(priceQuote({ request: { service: 'h2h', pvs: [{ pvId: 'a', quantity: 5000 }], extras: ['puntiVetrina'] } }).status, 'invalid');
});

// ---- multi-date pairing ------------------------------------------------------------
const NOW = Date.UTC(2026, 9, 9);
const elig = (o = {}) => ({ pvId: 'pv1', date: '2026-10-20', territoryRef: 'MI', matchType: 'same', discountPct: 40, pricingVersion: PRICING_VERSION,
  expiresAt: NOW + 3600000, verification: { verified: true, issuer: 'server', reference: 'test' }, ...o });
const datedPvs = () => [pv('pv1', 'MI', 5959, [{ date: '2026-10-20', quantity: 3000 }, { date: '2026-10-21', quantity: 2959 }]), pv('pv2', 'CO', 4000, [{ date: '2026-10-20', quantity: 4000 }])];

test('rule 5: pairing disabled by default -> zero discount even with eligibility', () => {
  const q = quote({ pvs: datedPvs() }, { authorizations: { pairing: { eligibility: [elig()], now: NOW } } });
  assert.equal(q.pairingMode, 'disabled'); assert.equal(q.campaign.pairingDiscountCents, 0);
  assert.ok(q.pvs[0].dates.every(d => d.pairing.reason === 'pairing_disabled'));
});

test('rule 5: only the verified PV x date portion is discounted; other dates and PVs stay at zero', () => {
  const q = quote({ pvs: datedPvs(), extras: ['account_manager'], graphics: { required: true, selected: true } },
    { authorizations: { pairing: { mode: 'verified-only', eligibility: [elig()], now: NOW } } });
  const [d1, d2] = q.pvs[0].dates;
  assert.deepEqual([d1.allocatedBaseCents, d2.allocatedBaseCents], allocateLargestRemainder(MI5959, [3000, 2959]));
  assert.equal(d1.pairing.discountCents, percentOf(d1.allocatedBaseCents, 40)); assert.equal(d1.pairing.reason, 'verified');
  assert.equal(d2.pairing.discountCents, 0); assert.equal(d2.pairing.reason, 'not_verified');
  assert.equal(q.pvs[1].pairing.discountCents, 0, 'same date on another PV is not authorized by pv1 eligibility');
  assert.equal(q.campaign.pairingDiscountCents, d1.pairing.discountCents);
  // never on extras, printing or graphics
  assert.equal(q.campaign.payableExtrasCents, 8000); assert.equal(q.graphics.cents, 7900);
  const undiscounted = quote({ pvs: datedPvs(), extras: ['account_manager'], graphics: { required: true, selected: true } });
  assert.equal(undiscounted.totals.payableCents - q.totals.payableCents, d1.pairing.discountCents - (undiscounted.campaign.plan.cents - q.campaign.plan.cents));
});

test('rule 5: rejected eligibility (expired, unverified, wrong version, wrong territory, over cap, nearby > 20, ambiguous) -> zero', () => {
  const cases = [{ expiresAt: NOW - 1 }, { verification: { verified: false, issuer: 'server' } }, { verification: { verified: true, issuer: 'client' } },
    { pricingVersion: 'old' }, { territoryRef: 'CO' }, { discountPct: 41 }, { matchType: 'nearby', discountPct: 25 }, { discountPct: 0 }, { matchType: 'unknown' }];
  for (const o of cases) {
    const q = quote({ pvs: datedPvs() }, { authorizations: { pairing: { mode: 'verified-only', eligibility: [elig(o)], now: NOW } } });
    assert.equal(q.campaign.pairingDiscountCents, 0, JSON.stringify(o));
  }
  const dup = quote({ pvs: datedPvs() }, { authorizations: { pairing: { mode: 'verified-only', eligibility: [elig(), elig({ discountPct: 20 })], now: NOW } } });
  assert.equal(dup.campaign.pairingDiscountCents, 0); assert.equal(dup.pvs[0].dates[0].pairing.reason, 'ambiguous_eligibility');
});

test('rule 5: unreliable date allocation -> zero pairing for that PV, flagged', () => {
  const pvs = [pv('pv1', 'MI', 5959, [{ date: '2026-10-20', quantity: 3000 }, { date: '2026-10-21' }])];
  const q = quote({ pvs }, { authorizations: { pairing: { mode: 'verified-only', eligibility: [elig()], now: NOW } } });
  assert.equal(q.status, 'priced'); assert.equal(q.campaign.pairingDiscountCents, 0);
  assert.equal(q.pvs[0].pairing.allocation, 'unreliable'); assert.ok(q.issues.some(i => i.code === 'PAIRING_ALLOCATION_UNRELIABLE'));
});

test('rule 5: eligibility for a removed PV never applies and is flagged', () => {
  const q = quote({ pvs: [pv('pv2', 'CO', 4000, [{ date: '2026-10-20', quantity: 4000 }])] },
    { authorizations: { pairing: { mode: 'verified-only', eligibility: [elig()], now: NOW } } });
  assert.equal(q.campaign.pairingDiscountCents, 0); assert.ok(q.issues.some(i => i.code === 'PAIRING_ELIGIBILITY_FOR_UNKNOWN_PV'));
});

// ---- security: forged inputs ----------------------------------------------------------
test('forged client claims (total, 100 % plan, pairing %, verified/serverAuthorized, density, prices) change nothing', () => {
  const honest = quote({ pvs: [pv('a', 'LD', 5959)], extras: ['account_manager'] });
  const forged = quote({ plan: 'single', pvs: [{ pvId: 'a', zones: [{ territoryRef: 'LD', quantity: 5959, density: 99999, densita: 99999, tier: 'MILANO_CORE', priceCents: 1 }] }],
    extras: [{ id: 'account_manager', price: 0, priceCents: 0 }],
    clientClaims: { totalAmount: 0.01, planDiscountPct: 100, smartPairingDiscountPct: 40, serverAuthorized: true, verified: true, grandTotal: 1 } });
  assert.equal(forged.totals.payableCents, honest.totals.payableCents);
  assert.equal(forged.pvs[0].zones[0].tier, 'LOW_DENSITY_MOUNTAIN');
  assert.equal(forged.serverAuthorized, false);
  assert.deepEqual(forged.totals.clientTotalComparison, { claimedCents: 1, matches: false });
  for (const k of ['totalAmount', 'planDiscountPct', 'smartPairingDiscountPct', 'serverAuthorized', 'verified', 'pvs[0].zones[0].density', 'pvs[0].zones[0].tier', 'pvs[0].zones[0].priceCents', 'extras[0].price'])
    assert.ok(forged.ignoredClientClaims.includes(k), k);
});

test('forged territory: unresolved ref, client-resolved record, missing density -> no quote (no fallback tier)', () => {
  assert.equal(quote({ pvs: [pv('a', 'NOPE', 5000)] }).status, 'unresolved');
  assert.equal(priceQuote({ request: { service: 'd2d', pvs: [pv('a', 'X', 5000)] }, territory: { X: { status: 'unresolved', reason: 'outside_lombardy' } } }).status, 'unresolved');
  const q = priceQuote({ request: { service: 'd2d', pvs: [pv('a', 'X', 5000)] }, territory: { X: { status: 'resolved', municipalityName: 'Ignoto' } } });
  assert.equal(q.status, 'unresolved'); assert.equal(q.totals, null);
});

test('invalid input -> status invalid, no totals', () => {
  const bad = [
    { pvs: [pv('a', 'MI', 0)] }, { pvs: [pv('a', 'MI', -5)] }, { pvs: [pv('a', 'MI', 1.5)] }, { pvs: [pv('a', 'MI', NaN)] }, { pvs: [pv('a', 'MI', '100')] },
    { pvs: [pv('a', 'MI', C.LIMITS.maxQuantityPerZone + 1)] }, { pvs: [] }, { pvs: [pv('a', 'MI', 10), pv('a', 'CO', 10)] }, { pvs: [pv('', 'MI', 10)] },
    { plan: 'quarterly', pvs: [pv('a', 'MI', 10)] }, { plan: 'monthly24', pvs: [pv('a', 'MI', 10)] }, { urgency: 'asap', pvs: [pv('a', 'MI', 10)] },
    { pvs: [pv('a', 'MI', 10)], extras: ['mystery_extra'] }, { pvs: [pv('a', 'MI', 10)], extras: [{ id: 'video_proof', pvIds: ['ghost'] }] },
    { pvs: [{ pvId: 'a', quantity: 99, zones: [{ territoryRef: 'MI', quantity: 10 }] }] },
    { pvs: [pv('a', 'MI', 10, [{ date: '2026-02-30', quantity: 10 }])] },
  ];
  for (const r of bad) { const q = quote(r); assert.equal(q.status, 'invalid', JSON.stringify(r)); assert.equal(q.totals, null); }
  assert.equal(priceQuote({ request: { service: 'flyers', pvs: [{ pvId: 'a', quantity: 10 }] } }).status, 'invalid');
});

// ---- legacy and immutability -----------------------------------------------------------
test('historical 5 % "3 mesi" snapshot stays immutable and is never re-priced; new monthly3 = 3 %', () => {
  const stored = { piano: '3 mesi', discounts: [{ label: 'Piano -5%', percentage: 5, amount: 11.84 }], total: 224.99 };
  const h = describeHistoricalPricingSnapshot(stored);
  assert.equal(h.kind, 'historical'); assert.equal(h.repriceable, false); assert.equal(h.pricingVersion, 'legacy-unversioned');
  assert.equal(h.snapshot.discounts[0].percentage, 5); assert.ok(Object.isFrozen(h.snapshot.discounts[0]));
  assert.equal(stored.discounts[0].percentage, 5); assert.ok(!Object.isFrozen(stored), 'input untouched');
  assert.throws(() => repriceHistorical(stored), /LEGACY_SNAPSHOT_IMMUTABLE/);
  assert.equal(quote({ plan: 'monthly3', pvs: [pv('a', 'MI', 5959)] }).campaign.plan.pct, 3);
});

test('output is deeply frozen, input never mutated, result deterministic and independent of PV order', () => {
  const req = { pvs: [pv('a', 'MI', 5959), pv('b', 'CO', 4000)], extras: ['tracking_gps'] };
  const snapshot = JSON.stringify(req);
  const q1 = quote(req); const q2 = quote(req);
  assert.equal(JSON.stringify(req), snapshot);
  assert.deepEqual(q1, q2);
  assert.throws(() => { 'use strict'; q1.totals.payableCents = 1; });
  assert.ok(Object.isFrozen(q1.pvs[0].zones[0]));
  const rev = quote({ ...req, pvs: [...req.pvs].reverse() });
  assert.equal(rev.totals.payableCents, q1.totals.payableCents);
});

test('1 / 2 / 5 PV: per-PV evidence, campaign base = sum of PVs, deleted PV never priced', () => {
  for (const n of [1, 2, 5]) {
    const pvs = Array.from({ length: n }, (_, i) => pv(`pv${i}`, ['MI', 'CO', 'HD', 'LD', 'NIL9'][i], 1000 + i * 1777));
    const q = quote({ pvs });
    assert.equal(q.status, 'priced'); assert.equal(q.pvs.length, n);
    assert.equal(q.campaign.baseCents, q.pvs.reduce((s, p) => s + p.baseCents, 0));
  }
  const five = Array.from({ length: 5 }, (_, i) => pv(`pv${i}`, 'MI', 2000));
  const four = quote({ pvs: five.slice(0, 4), extras: ['tracking_gps'] });
  assert.ok(!four.pvs.some(p => p.pvId === 'pv4'));
  assert.equal(four.extras[0].units, 4);
});

test('payable / quoted / indicative split matches Production checkout semantics', () => {
  const q = quote({ pvs: [pv('a', 'MI', 5959)], extras: ['account_manager'], graphics: { required: true, selected: true },
    printing: { format: 'A5', grammage: '130', sides: 'fronte_retro', color: 'colori', paperType: 'patinata_opaca', fold: 'nessuna' } });
  assert.equal(q.totals.payableCents, MI5959 + 8000); // = Production total_amount
  assert.equal(q.printing.indicative, true); assert.equal(q.printing.payable, false); assert.ok(q.printing.cents > 0);
  assert.equal(q.totals.grossQuoteCents, q.totals.payableCents + 7900 + q.printing.cents); // = Production grandTotal
  const review = quote({ pvs: [pv('a', 'MI', 5959)], printing: { format: 'A5', grammage: '130', sides: 'fronte_retro', color: 'colori', paperType: 'patinata_opaca', fold: 'meta' } });
  assert.equal(review.printing.status, 'REQUIRES_REVIEW'); assert.equal(review.printing.cents, null); assert.equal(review.totals.printingPriceKnown, false);
});
