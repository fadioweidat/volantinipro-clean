// Phase 3B.4-P1: server adapter, territory resolver, shadow comparison and the shadow
// Edge Function artefact built on the VERIFIED deployed submit-campaign-request v11.
// No network, no database, no deploy: the Edge Function runs in the in-memory harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createMockSupabase, loadSubmitFunction } from './helpers/submitCampaignHarness.mjs';
import { resetPricingShadowCache } from '../deploy/edge/submit-campaign-request-v11-shadow/pricingShadow.ts';
import { adaptSubmissionPayload, resolveTerritories, computeShadowPricing, EXTRA_HEADS, PLAN_LABELS, classify } from '../src/lib/pricing/server/index.js';
import { calculateQuotePricing } from '../src/lib/quotePricing.js';
import { buildExtraServicesRegistry } from '../src/lib/extraServicesRegistry.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ART = join(ROOT, 'deploy/edge/submit-campaign-request-v11-shadow');
const sha = s => createHash('sha256').update(s).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });

// --- territory fixtures (as geo_municipalities would return them) --------------------
const MUNICIPALITIES = [
  { municipality_code: '015146', municipality_name: 'Milano', density_per_km2: 7450 },
  { municipality_code: '015209', municipality_name: 'Sesto San Giovanni', density_per_km2: 6800 },
  { municipality_code: '013075', municipality_name: 'Como', density_per_km2: 2900 },
  { municipality_code: '015077', municipality_name: 'Cormano', density_per_km2: 4300 },
  { municipality_code: '014061', municipality_name: 'Sondrio', density_per_km2: 1060 },
  { municipality_code: '097999', municipality_name: 'Comune Montano', density_per_km2: 90 },
  { municipality_code: '098001', municipality_name: 'Città Doppia', density_per_km2: 900 },
  { municipality_code: '098002', municipality_name: 'Citta Doppia', density_per_km2: 900 },
];
// point -> containing municipality codes (stand-in for get_comuni_breakdown_in_radius, 1 m)
const POINTS = { '45.4642,9.19': ['015146'], '45.5357,9.2349': ['015209'], '45.8081,9.0852': ['013075'] };
function fixtureLookup({ fail = false, rpcFail = false, slowMs = 0 } = {}) {
  return {
    async municipalities() { if (slowMs) await new Promise(r => setTimeout(r, slowMs)); if (fail) throw new Error('GEO_LOOKUP_FAILED'); return MUNICIPALITIES; },
    async containing(lat, lng) { if (rpcFail) return null; return POINTS[`${lat},${lng}`] ?? []; },
  };
}

// --- Production Step4 / Quick Quote payload shapes (047a764) ------------------------
const prodTotal = ({ zones, qty, urgency = 'normal', planPct = 0, extras = [] }) =>
  calculateQuotePricing({ quantity: qty, pricePerThousand: 18.5, urgency, planDiscountPct: planPct, extras, distributionZones: zones }).total;
function step4Body({ rows, flyerQuantity, piano = 'Singola', subtotal, urgencySurcharge = 0, extraIds = [], total, grandTotal, multiZone, printing, service = 'd2d' }) {
  return {
    title: 'Campagna Preventivo (Test)', service_type: service, status: 'pending_review', city_name: 'Milano', zone_ids: [],
    campaignZones: rows, flyer_quantity: flyerQuantity, flyer_format: 'A5', start_date: null, end_date: null,
    client_name: 'Mario Rossi', client_email: 'mario.rossi@example.test', client_phone: '+39 333 0000000', company_name: 'ACME', smart_pairing_discount: 0,
    total_amount: total,
    metadata: { grand_total: grandTotal ?? total, zona: 'Milano', comune: 'Milano', mode: multiZone ? 'multi_zone' : 'municipality', ...(multiZone ? { multi_zone: multiZone } : {}),
      piano, servizi_extra: extraIds.map(id => ({ id, label: id, price: 0 })), selected_dates: [], extra_services: extraIds,
      pricing: { urgencySurcharge, subtotal, total, grandTotal: grandTotal ?? total, discounts: [] }, source: 'configurator',
      printing: printing ?? { enabled: false, printing_selected: false, artwork_required: false, artwork_selected: false, specs: {} } },
  };
}
const row = (municipality, quantity, extra = {}) => ({ municipality, quantity, priority: 1, lat: null, lng: null, radius_m: null, territory_type: 'comune', parent_municipality: 'Milano', address_label: null, polygon_geojson: null, ...extra });

test('extra head map (Quick Quote labels) and plan labels are pinned to the Production registry / Step4', () => {
  const reg = buildExtraServicesRegistry({ flyerQty: 10000, durationDays: 1, campaignDurationKnown: false, printConfig: null });
  for (const item of reg) assert.equal(EXTRA_HEADS[item.head], item.id, item.head);
  assert.equal(Object.keys(EXTRA_HEADS).length, reg.length);
  assert.deepEqual({ ...PLAN_LABELS }, { Singola: 'single', '3 mesi': 'monthly3', '6 mesi': 'monthly6', '12 mesi': 'monthly12' });
});

test('adapter: single-PV comune, NIL grouping, multi-comune, multi-PV, quick quote, h2h', () => {
  const single = adaptSubmissionPayload(step4Body({ rows: [row('Milano', 5000)], flyerQuantity: 5959, subtotal: 236.85, total: 236.85 }));
  assert.equal(single.ok, true); assert.deepEqual(single.request.pvs, [{ pvId: 'pv-1', zones: [{ territoryRef: 't:milano', quantity: 5959 }] }]);
  assert.ok(single.notes.includes('SINGLE_TERRITORY_PV_USES_PV_QUANTITY'));
  const nil = adaptSubmissionPayload(step4Body({ rows: [row('ISOLA', 3000, { territory_type: 'nil' }), row('BRERA', 2959, { territory_type: 'nil' })], flyerQuantity: 5959, subtotal: 236.85, total: 236.85 }));
  assert.deepEqual(nil.request.pvs[0].zones, [{ territoryRef: 't:milano', quantity: 5959 }]);
  assert.equal(nil.territoryClaims[0].nilNames.length, 2);
  const multiComune = adaptSubmissionPayload(step4Body({ rows: [row('Milano', 3000), row('Cormano', 2000), row('milano ', 500)], flyerQuantity: 5500, subtotal: 1, total: 1 }));
  assert.deepEqual(multiComune.request.pvs[0].zones, [{ territoryRef: 't:milano', quantity: 3500 }, { territoryRef: 't:cormano', quantity: 2000 }]);
  const mpv = adaptSubmissionPayload(step4Body({ rows: [row('ISOLA', 5959, { territory_type: 'nil', campaign_zone_id: 'pvA' }), row('Como', 4000, { campaign_zone_id: 'pvB' })],
    flyerQuantity: 9959, subtotal: 1, total: 1, multiZone: { zones: [{ id: 'pvA', quantity: 5959 }, { id: 'pvB', quantity: 4100 }] } }));
  assert.deepEqual(mpv.request.pvs.map(p => [p.pvId, p.zones]), [['pvA', [{ territoryRef: 't:milano', quantity: 5959 }]], ['pvB', [{ territoryRef: 't:como', quantity: 4100 }]]]);
  assert.ok(mpv.notes.includes('MULTI_PV_PAYLOAD'));
  const quick = adaptSubmissionPayload({ service_type: 'd2d', campaignZones: [{ municipality: 'Milano', quantity: 5000, priority: 1, lat: 0, lng: 0 }], flyer_quantity: 5000, total_amount: 252,
    metadata: { source: 'quick_quote', timing: 'Urgente', servizi_extra: ['Controllo PRO', 'Tracking GPS Live', 'Etichetta ignota'], total: 252 } });
  assert.equal(quick.request.urgency, 'urgent'); assert.equal(quick.request.plan, 'single');
  assert.deepEqual(quick.request.extras, ['control_pro', 'tracking_gps']); assert.ok(quick.notes.includes('EXTRA_LABEL_UNMAPPED'));
  assert.deepEqual(quick.territoryClaims[0].points, [], 'lat/lng 0,0 placeholders are not treated as a location');
  const h2h = adaptSubmissionPayload(step4Body({ service: 'h2h', rows: [row('Milano', 3000)], flyerQuantity: 3000, subtotal: 66, total: 66 }));
  assert.deepEqual(h2h.request.pvs, [{ pvId: 'pv-1', quantity: 3000 }]);
});

test('adapter: urgency/plan inference and unknowns', () => {
  const base = { rows: [row('Milano', 5959)], flyerQuantity: 5959, subtotal: 236.85, total: 1 };
  assert.equal(adaptSubmissionPayload(step4Body({ ...base, urgencySurcharge: 47.37 })).request.urgency, 'urgent');
  assert.equal(adaptSubmissionPayload(step4Body({ ...base, urgencySurcharge: 82.9 })).request.urgency, 'express');
  const odd = adaptSubmissionPayload(step4Body({ ...base, urgencySurcharge: 10 }));
  assert.equal(odd.ok, false); assert.ok(odd.notes.includes('URGENCY_UNKNOWN'));
  assert.equal(adaptSubmissionPayload(step4Body({ ...base, piano: '6 mesi' })).request.plan, 'monthly6');
  const noPlan = adaptSubmissionPayload(step4Body({ ...base, piano: '-' }));
  assert.equal(noPlan.ok, false); assert.ok(noPlan.notes.includes('PLAN_UNKNOWN'));
  assert.equal(adaptSubmissionPayload({ ...step4Body(base), urgency: 'express' }).request.urgency, 'express');
});

test('resolver: official data only; unknown / ambiguous / point outside -> verification_required; point check via containing()', async () => {
  const claims = [
    { territoryRef: 't:milano', municipalityName: 'MILANO', kinds: ['nil'], points: [[9.19, 45.4642]], nilNames: ['ISOLA'] },
    { territoryRef: 't:sesto', municipalityName: 'Sesto San Giovanni', kinds: ['comune'], points: [[9.19, 45.4642]] },
    { territoryRef: 't:como', municipalityName: 'Como', kinds: ['comune'], points: [] },
    { territoryRef: 't:x', municipalityName: 'Atlantide', kinds: ['comune'], points: [] },
    { territoryRef: 't:cd', municipalityName: 'Città Doppia', kinds: ['comune'], points: [] },
  ];
  const { territory, evidence } = await resolveTerritories(claims, fixtureLookup());
  assert.deepEqual({ ...territory['t:milano'] }, { status: 'resolved', municipalityName: 'Milano', municipalityCode: '015146', densityPerKm2: 7450, source: 'geo_municipalities', verification: 'name_and_point' });
  assert.equal(territory['t:sesto'].detail, 'point_outside_municipality');
  assert.equal(territory['t:como'].verification, 'name_only');
  assert.deepEqual({ ...territory['t:x'] }, { status: 'unresolved', reason: 'verification_required', detail: 'municipality_not_found' });
  assert.equal(territory['t:cd'].detail, 'municipality_ambiguous');
  assert.ok(!JSON.stringify(evidence).includes('ISOLA'), 'evidence carries counts/codes, not names');
  const unavailable = await resolveTerritories([claims[0]], fixtureLookup({ rpcFail: true }));
  assert.equal(unavailable.territory['t:milano'].verification, 'name_only_geometry_unavailable');
});

test('shadow: Production-equivalent quotes classify as match; client total never changes the server amount', async () => {
  const total = prodTotal({ zones: [{ territory: 'MILANO_CORE', quantity: 5959 }], qty: 5959, extras: [{ price: 80 }] });
  assert.equal(total, 316.85);
  const body = step4Body({ rows: [row('ISOLA', 5959, { territory_type: 'nil', lat: 45.4642, lng: 9.19 })], flyerQuantity: 5959, subtotal: 236.85, total, extraIds: ['account_manager'] });
  const rec = await computeShadowPricing(body, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(rec.classification, 'match'); assert.equal(rec.serverPayableCents, 31685); assert.equal(rec.deltaCents, 0);
  assert.equal(rec.enforcement, 'none'); assert.equal(rec.mode, 'shadow');
  const forged = await computeShadowPricing({ ...body, total_amount: 1 }, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(forged.classification, 'mismatch'); assert.equal(forged.serverPayableCents, 31685); assert.equal(forged.deltaCents, 31585);
  for (const pii of ['Mario', 'Rossi', 'example.test', '333', 'ACME', 'ISOLA']) assert.ok(!JSON.stringify(rec).includes(pii), pii);
});

test('shadow: multi-comune and urgency/plan parity; half-cent float artefact classified as rounding', async () => {
  const zones = [{ territory: 'MILANO_CORE', quantity: 3000 }, { territory: 'HINTERLAND_DENSE', quantity: 2000 }];
  const total = prodTotal({ zones, qty: 5000, urgency: 'express', planPct: 8 });
  const p = calculateQuotePricing({ quantity: 5000, pricePerThousand: 18.5, urgency: 'express', planDiscountPct: 8, distributionZones: zones });
  const body = step4Body({ rows: [row('Milano', 3000), row('Cormano', 2000)], flyerQuantity: 5000, subtotal: p.baseCost, urgencySurcharge: p.urgencySurcharge, piano: '12 mesi', total });
  const rec = await computeShadowPricing(body, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(rec.status, 'priced'); assert.equal(rec.classification, 'match');
  assert.deepEqual(rec.components.perPv[0].tiers, ['MILANO_CORE', 'HINTERLAND_DENSE']);
  // A quantity whose Milano price is an exact half-cent that Production floats round down.
  assert.equal(classify({ exactPayable: 101, legacyPayable: 100, clientCents: 100 }), 'rounding_half_cent');
  assert.equal(classify({ exactPayable: 104, legacyPayable: 100, clientCents: 100 }), 'mismatch');
});

test('shadow: unrecognised municipality -> no definitive quote, no payable amount (verification required)', async () => {
  const body = step4Body({ rows: [row('Atlantide', 5000)], flyerQuantity: 5000, subtotal: 260, total: 260 });
  const rec = await computeShadowPricing(body, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(rec.classification, 'unresolved'); assert.equal(rec.serverPayableCents, null); assert.ok(rec.issueCodes.includes('TERRITORY_UNRESOLVED'));
});

test('shadow: Multi-PV with ambiguous-scope extras stays unresolved; independent parts still evidenced', async () => {
  const body = step4Body({ rows: [row('Milano', 5959, { campaign_zone_id: 'pvA' }), row('Como', 4000, { campaign_zone_id: 'pvB' })], flyerQuantity: 9959, subtotal: 1, total: 1,
    extraIds: ['control_pro'], multiZone: { zones: [{ id: 'pvA', quantity: 5959 }, { id: 'pvB', quantity: 4000 }] } });
  const rec = await computeShadowPricing(body, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(rec.classification, 'unresolved'); assert.ok(rec.issueCodes.includes('EXTRA_SCOPE_UNDECIDED'));
  assert.equal(rec.territory.filter(t => t.status === 'resolved').length, 2);
  const withoutAmbiguous = await computeShadowPricing({ ...body, metadata: { ...body.metadata, extra_services: ['tracking_gps', 'account_manager'] } }, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(withoutAmbiguous.status, 'priced');
  assert.equal(withoutAmbiguous.components.payableExtrasCents, 2 * 6000 + 8000);
});

test('shadow: Quick Quote inconsistencies of Production are surfaced as mismatches, not hidden', async () => {
  // Production Quick Quote: multi-comune D2D falls back to the flat 18.5/1000 rate and
  // sums Control PRO + GPS without de-duplication.
  const flat = calculateQuotePricing({ quantity: 6000, pricePerThousand: 18.5, extras: [{ price: 99 }, { price: 60 }] }).total;
  const body = { service_type: 'd2d', flyer_quantity: 6000, total_amount: flat,
    campaignZones: [{ municipality: 'Milano', quantity: 3000, priority: 1, lat: 0, lng: 0 }, { municipality: 'Como', quantity: 3000, priority: 2, lat: 0, lng: 0 }],
    metadata: { source: 'quick_quote', timing: 'Flessibile', servizi_extra: ['Controllo PRO', 'Tracking GPS Live'], total: flat } };
  const rec = await computeShadowPricing(body, { lookup: fixtureLookup(), now: () => 0 });
  assert.equal(rec.status, 'priced'); assert.equal(rec.classification, 'mismatch');
  assert.equal(rec.components.payableExtrasCents, 9900);
});

test('shadow never throws: lookup failure -> error record', async () => {
  const rec = await computeShadowPricing(step4Body({ rows: [row('Milano', 5959)], flyerQuantity: 5959, subtotal: 236.85, total: 236.85 }), { lookup: fixtureLookup({ fail: true }), now: () => 0 });
  assert.equal(rec.status, 'error'); assert.equal(rec.classification, 'error');
  const rec2 = await computeShadowPricing(null, { lookup: fixtureLookup(), now: () => 0 });
  assert.notEqual(rec2.status, 'priced');
});

// ---- artefact integrity ----------------------------------------------------------------
test('artefact: built on the verified deployed v11; patch reproduces index.ts; vendored modules match source; self-contained', () => {
  const v11 = git('show', '2b01ce9:supabase/functions/submit-campaign-request/index.ts');
  const expected = readFileSync(join(ART, 'DEPLOYED_V11.sha256'), 'utf8').split(/\s+/)[0];
  assert.equal(sha(v11), expected);
  assert.equal(expected, '6a2ecf9149679f5d6d098d33902c6d552ab93a9dd8d934b8364adb2b868ac1ca');
  const dir = mkdtempSync(join(tmpdir(), 'v11-shadow-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  cpSync(join(ART, 'v11-to-shadow.patch'), join(dir, 'p.patch'));
  execFileSync(process.execPath, ['-e', `require('fs').mkdirSync('supabase/functions/submit-campaign-request',{recursive:true});require('fs').writeFileSync('supabase/functions/submit-campaign-request/index.ts', ${JSON.stringify(v11)})`], { cwd: dir });
  execFileSync('git', ['apply', 'p.patch'], { cwd: dir });
  const patched = readFileSync(join(dir, 'supabase/functions/submit-campaign-request/index.ts'), 'utf8').replace(/\r\n/g, '\n'); // global core.autocrlf may apply
  assert.equal(patched, readFileSync(join(ART, 'index.ts'), 'utf8').replace(/\r\n/g, '\n'));
  execFileSync(process.execPath, [join(ROOT, 'scripts/vendor-pricing-shadow.mjs'), '--check'], { cwd: ROOT });
  const files = []; const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|ts)$/.test(e.name)) files.push(p); } }; walk(ART);
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/from\s+["']([^"']+)["']/g)) {
    if (m[1].startsWith('http')) assert.ok(f.endsWith('index.ts') && /deno\.land\/std@0\.168\.0|esm\.sh\/@supabase\/supabase-js@2\.21\.0/.test(m[1]), `${f} -> ${m[1]}`);
    else assert.ok(m[1].startsWith('./') || m[1].startsWith('../'), m[1]);
  }
  const diff = readFileSync(join(ART, 'v11-to-shadow.patch'), 'utf8');
  assert.equal((diff.match(/^\+[^+]/gm) || []).length, 7); assert.equal((diff.match(/^-[^-]/gm) || []).length, 2);
  assert.doesNotMatch(diff, /radius_m|polygon_geojson|address_label|409/);
});

// ---- the shadow Edge Function vs the deployed v11 in the harness -------------------------
function withGeo(mock, { fail = false, rpcFail = false, slowMs = 0, slowRpcMs = 0 } = {}) {
  resetPricingShadowCache();
  const from = mock.client.from;
  mock.client.from = table => {
    if (table !== 'geo_municipalities') return from(table);
    const st = { range: [0, 999] };
    const b = { select() { return b; }, order() { return b; }, range(a, z) { st.range = [a, z]; return b; },
      then(res, rej) { return (async () => { if (slowMs) await new Promise(r => setTimeout(r, slowMs)); return fail ? { data: null, error: { message: 'boom' } } : { data: MUNICIPALITIES.slice(st.range[0], st.range[1] + 1), error: null }; })().then(res, rej); } };
    return b;
  };
  mock.client.rpc = async (name, args) => (slowRpcMs && await new Promise(r => setTimeout(r, slowRpcMs)), rpcFail ? { data: null, error: { message: 'rpc' } }
    : name === 'get_comuni_breakdown_in_radius' ? { data: (POINTS[`${args.p_lat},${args.p_lng}`] ?? []).map(c => ({ municipality_code: c })), error: null } : { data: null, error: { message: 'unknown rpc' } });
  return mock;
}
const v11Dir = mkdtempSync(join(tmpdir(), 'v11-deployed-'));
writeFileSync(join(v11Dir, 'index.ts'), git('show', '2b01ce9:supabase/functions/submit-campaign-request/index.ts'));
writeFileSync(join(v11Dir, 'package.json'), '{"type":"module"}\n');
const invokeV11 = await loadSubmitFunction(join(v11Dir, 'index.ts'));
const invokeShadow = await loadSubmitFunction(join(ART, 'index.ts'));
const strip = row => { const { id, created_at, updated_at, ...rest } = row; const { price_authorization, ...metadata } = rest.metadata ?? {}; return { ...rest, metadata }; };

test('edge: same response and same stored row as deployed v11; only metadata.price_authorization added', async () => {
  const total = 316.85;
  const body = step4Body({ rows: [row('ISOLA', 5959, { territory_type: 'nil', lat: 45.4642, lng: 9.19 })], flyerQuantity: 5959, subtotal: 236.85, total, extraIds: ['account_manager'] });
  const a = createMockSupabase(); const b = withGeo(createMockSupabase());
  const ra = await invokeV11(a, body); const rb = await invokeShadow(b, body);
  assert.equal(ra.status, 200); assert.equal(rb.status, 200);
  const noTimes = j => ({ ...j, campaign: (({ created_at, updated_at, ...c }) => c)(j.campaign) });
  assert.deepEqual(noTimes(rb.json), noTimes(ra.json), 'response unchanged (shadow record stripped)');
  assert.deepEqual(strip(b.db.campaigns[0]), strip(a.db.campaigns[0]));
  assert.deepEqual(b.db.campaign_zones.map(({ id, ...z }) => z), a.db.campaign_zones.map(({ id, ...z }) => z));
  assert.equal(b.db.campaigns[0].total_amount, total);
  const pa = b.db.campaigns[0].metadata.price_authorization;
  assert.equal(pa.classification, 'match'); assert.equal(pa.serverPayableCents, 31685);
});

test('edge: forged total and forged client price_authorization -> stored as submitted, shadow overwrites the forgery, request not blocked', async () => {
  const body = step4Body({ rows: [row('Milano', 5959)], flyerQuantity: 5959, subtotal: 236.85, total: 0.01 });
  body.metadata.price_authorization = { classification: 'match', serverPayableCents: 1, enforcement: 'enforced' };
  const m = withGeo(createMockSupabase());
  const r = await invokeShadow(m, body);
  assert.equal(r.status, 200); assert.equal(m.db.campaigns[0].total_amount, 0.01);
  const pa = m.db.campaigns[0].metadata.price_authorization;
  assert.equal(pa.classification, 'mismatch'); assert.equal(pa.serverPayableCents, 23685); assert.equal(pa.enforcement, 'none');
  assert.equal(r.json.campaign.metadata.price_authorization, undefined);
});

test('edge: geo failure, RPC failure, timeout and kill switch never block the submission', async () => {
  const body = step4Body({ rows: [row('Milano', 5959, { lat: 45.4642, lng: 9.19 })], flyerQuantity: 5959, subtotal: 236.85, total: 236.85 });
  for (const [opts, expected] of [[{ fail: true }, 'error'], [{ rpcFail: true }, 'match']]) {
    const m = withGeo(createMockSupabase(), opts);
    const r = await invokeShadow(m, body);
    assert.equal(r.status, 200); assert.equal(m.db.campaigns[0].metadata.price_authorization.classification, expected);
  }
  const slow = withGeo(createMockSupabase(), { slowRpcMs: 1700 });
  const t0 = Date.now(); const rs = await invokeShadow(slow, body);
  assert.equal(rs.status, 200); assert.equal(slow.db.campaigns[0].metadata.price_authorization.errorCode, 'SHADOW_TIMEOUT'); assert.ok(Date.now() - t0 < 4000);
  const env = globalThis.Deno.env.get;
  globalThis.Deno.env.get = k => (k === 'PRICING_SHADOW_MODE' ? 'off' : env(k));
  try {
    const off = withGeo(createMockSupabase());
    const r = await invokeShadow(off, body);
    assert.equal(r.status, 200); assert.equal(off.db.campaigns[0].metadata.price_authorization.classification, 'disabled');
    assert.equal(off.calls.filter(c => c.table === 'geo_municipalities').length, 0);
  } finally { globalThis.Deno.env.get = env; }
});

test('edge: idempotent retry behaves like v11 (no second insert) and never returns the shadow record', async () => {
  const body = step4Body({ rows: [row('Milano', 5959)], flyerQuantity: 5959, subtotal: 236.85, total: 236.85 });
  const m = withGeo(createMockSupabase());
  const first = await invokeShadow(m, body); const second = await invokeShadow(m, body);
  assert.equal(m.db.campaigns.length, 1); assert.equal(second.json.idempotent, true);
  assert.equal(second.json.campaign.metadata.price_authorization, undefined);
  assert.equal(first.json.campaign.id, second.json.campaign.id);
});

test('edge: validation errors are identical to v11 (shadow runs only after v11 validation)', async () => {
  for (const body of [{}, { client_name: 'x' }, { client_name: 'x', client_email: 'bad' }, { ...step4Body({ rows: [row('', 0)], flyerQuantity: 1, subtotal: 1, total: 1 }) }]) {
    const a = await invokeV11(createMockSupabase(), body); const b = await invokeShadow(withGeo(createMockSupabase()), body);
    assert.equal(b.status, a.status); assert.deepEqual(b.json, a.json);
  }
});

test('edge: municipality lookup pages past the 1000-row PostgREST limit (1502 Lombardy rows)', async () => {
  const many = Array.from({ length: 1502 }, (_, i) => ({ municipality_code: String(100000 + i), municipality_name: i === 1400 ? 'Comune Lontano' : `Comune ${i}`, density_per_km2: 3000 }));
  const mock = createMockSupabase();
  resetPricingShadowCache();
  const from = mock.client.from;
  const ranges = [];
  mock.client.from = table => {
    if (table !== 'geo_municipalities') return from(table);
    let range = [0, 999];
    const b = { select() { return b; }, order() { return b; }, range(a, z) { range = [a, Math.min(z, a + 999)]; ranges.push(range); return b; },
      then(res, rej) { return Promise.resolve({ data: many.slice(range[0], range[1] + 1), error: null }).then(res, rej); } };
    return b;
  };
  mock.client.rpc = async () => ({ data: [], error: null });
  const body = step4Body({ rows: [row('Comune Lontano', 5000)], flyerQuantity: 5000, subtotal: 260, total: 260 });
  const r = await invokeShadow(mock, body);
  assert.equal(r.status, 200);
  const pa = mock.db.campaigns[0].metadata.price_authorization;
  assert.equal(pa.status, 'priced'); assert.equal(pa.territory[0].municipalityCode, '101400');
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});
