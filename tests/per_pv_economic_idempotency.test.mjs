// PHASE 3B.3 — per-PV economic snapshot x hardened submission idempotency.
// Payloads are built with the same helpers Step4 uses (buildPerPvEconomics,
// smartPairingSnapshot, pricePerPvQuote, buildMultiZoneCampaignZonesPayload)
// and submitted to the real submit-campaign-request handler running against
// an in-memory Supabase double. No network, no real submissions, no DB writes.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createMockSupabase, loadSubmitFunction } from "./helpers/submitCampaignHarness.mjs";
import { buildPerPvEconomics, pricePerPvQuote, smartPairingSnapshot } from "../src/lib/step3/perPvEconomics.js";
import { buildMultiZoneCampaignZonesPayload, buildMultiZoneDistributionZones, buildPointOfSalePricing, summarizeCampaignZones } from "../src/lib/step2/campaignZonesModel.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";

const FN_PATH = process.env.SUBMIT_FN_PATH || fileURLToPath(new URL("../supabase/functions/submit-campaign-request/index.ts", import.meta.url));
const invoke = await loadSubmitFunction(FN_PATH);
const step4 = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");

const T0 = Date.parse("2099-01-01T12:00:00Z");
const MILANO = { name: "Milano", label: "Milano (MI)", lat: 45.4642, lng: 9.19 };
const MONZA = { name: "Monza", label: "Monza (MB)", lat: 45.5845, lng: 9.2744 };
const CORMANO = { name: "Cormano", label: "Cormano (MI)", lat: 45.54, lng: 9.17 };
const RHO = { name: "Rho", label: "Rho (MI)", lat: 45.531, lng: 9.04 };
const row = (name, n, extra = {}) => ({ id: `r_${name}`, name, assignedFlyers: n, requiredFlyers: n, ...extra });
const base = (id, extra) => ({ id, store_name: "", readyForQuote: true, coverageDecision: "keepCurrent", ...extra, finalFlyers: extra.q, assigned_flyers: extra.q, kpiSnapshot: { requiredFlyers: extra.q, families: Math.round(extra.q * 0.9), population: extra.q * 2, analysisLevel: extra.nil ? "nil" : "comune" } });
const PV = {
  isola: (q = 5959) => base("pv_isola", { q, nil: true, searchMode: "municipality", nilManualMode: true, city: MILANO, cityName: "Milano (MI)", selectedComuni: [MILANO], allocation: [row("ISOLA", q, { nil_code: "9" })] }),
  torino: (q = 14127, radiusKm = 1) => base("pv_torino", { q, searchMode: "address", city: MILANO, cityName: "Milano", radiusKm, radius: radiusKm, selectedSearchPoint: { label: "Via Torino, Duomo", lat: 45.4609464, lng: 9.184435 }, selectedComuni: [MILANO], allocation: [row("DUOMO", q - 4000, { nil_code: "1" }), row("BRERA", 4000, { nil_code: "2" })] }),
  monza: (q = 10000) => base("pv_monza", { q, searchMode: "municipality", city: MONZA, cityName: "Monza (MB)", selectedComuni: [MONZA], allocation: [row("Monza", q)] }),
  cormano: (q = 10000) => base("pv_cormano", { q, searchMode: "address", city: CORMANO, cityName: "Cormano (MI)", radiusKm: 2, radius: 2, selectedSearchPoint: { label: "Cormano", lat: 45.54, lng: 9.17 }, selectedComuni: [CORMANO], allocation: [row("Cormano", q)] }),
  rho: (q = 10000) => base("pv_rho", { q, searchMode: "municipality", city: RHO, cityName: "Rho (MI)", selectedComuni: [RHO], allocation: [row("Rho", q)] }),
};
const draft = (zones, extra = {}) => ({ type: "d2d", smartPairingMode: "per_pv", campaignZones: zones, startDate: "2099-01-10", endDate: "2099-01-31", urgency: "normal", perPvPairingPreferences: {}, ...extra });

// Live coordinator states as Step3 would hold them (volatile fields included).
const liveStates = (zones, observedAt) => Object.fromEntries(zones.map((z) => [z.id, { status: "no_match", verified: true, generation: 2, lastCheckedAt: observedAt, expiresAt: observedAt + 300000 }]));

// Payload exactly as Step4 assembles it for a per-PV D2D quote.
function step4Payload(data, { now = T0, states = {}, email = "cliente@example.it" } = {}) {
  const breakdown = buildPerPvEconomics(data, { now, states });
  assert.ok(breakdown, "breakdown expected");
  const snapshot = smartPairingSnapshot(breakdown);
  const pricing = pricePerPvQuote(breakdown, { quantity: breakdown.totals.quantity, pricePerThousand: 18.5, smartPairingDiscountPct: 0, urgency: data.urgency, planDiscountPct: 0, extras: [], distributionZones: null });
  const summary = summarizeCampaignZones(data.campaignZones);
  return {
    title: "Campagna Preventivo (Cliente)", service_type: "d2d", city_name: "Milano", client_name: "Cliente", client_email: email,
    campaignZones: summary.isMultiZone ? buildMultiZoneCampaignZonesPayload(summary) : buildMultiZoneCampaignZonesPayload(summary),
    flyer_quantity: breakdown.totals.quantity, start_date: data.startDate, end_date: data.endDate,
    total_amount: Number(pricing.total.toFixed(2)),
    metadata: {
      grand_total: pricing.total, smart_pairing: snapshot, mode: summary.isMultiZone ? "multi_zone" : "municipality",
      selected_dates: [], pricing: { subtotal: pricing.baseCost, total: pricing.total, grandTotal: pricing.total, urgencySurcharge: pricing.urgencySurcharge, smart_pairing: snapshot, lines: [{ quantity: breakdown.totals.quantity, total: pricing.baseCost }], extras: [], discounts: [] },
      quote_summary: { generatedAt: new Date(now).toISOString() },
    },
  };
}

async function pair(first, second) {
  const mock = createMockSupabase();
  const a = await invoke(mock, first);
  const b = await invoke(mock, second);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(b.status, 200, JSON.stringify(b.json));
  return { a, b, mock, reused: b.json.idempotent === true && b.json.campaign.id === a.json.campaign.id };
}

test("Step4 still sends the shared snapshot in metadata and pricing (contract)", () => {
  assert.equal((step4.match(/smart_pairing: economicSnapshot/g) || []).length, 2);
  assert.match(step4, /const pricing = economicBreakdown \? pricePerPvQuote\(economicBreakdown, commercialInputs\) : calculateQuotePricing\(commercialInputs\);/);
});

test("exact and volatile-only retries of a per-PV quote are idempotent (1, 2, 5 PV)", async () => {
  for (const zones of [[PV.isola()], [PV.isola(), PV.torino()], [PV.isola(), PV.torino(), PV.monza(), PV.cormano(), PV.rho()]]) {
    const data = draft(zones);
    const first = step4Payload(data, { states: liveStates(zones, T0) });
    // 4 minutes later: new observation timestamps/generation, new generatedAt.
    const later = step4Payload(data, { now: T0 + 240000, states: liveStates(zones, T0 + 240000) });
    assert.notDeepEqual(first.metadata.smart_pairing.rows.map((r) => r.observedAt), later.metadata.smart_pairing.rows.map((r) => r.observedAt));
    assert.equal((await pair(first, structuredClone(first))).reused, true, `${zones.length} PV exact retry`);
    assert.equal((await pair(first, later)).reused, true, `${zones.length} PV volatile retry`);
  }
});

test("changed PV identity, territory, quantity, dates, evidence or amounts never reuse", async () => {
  const zones = [PV.isola(), PV.torino()];
  const ref = step4Payload(draft(zones));
  const variants = {
    "PV id": step4Payload(draft([PV.isola(), { ...PV.torino(), id: "pv_torino_bis" }])),
    "radius": step4Payload(draft([PV.isola(), PV.torino(14127, 2)])),
    "quantity": step4Payload(draft([PV.isola(6000), PV.torino()])),
    "start date": step4Payload(draft(zones, { startDate: "2099-01-12" })),
    "end date": step4Payload(draft(zones, { endDate: "2099-01-30" })),
    "per-PV preferred dates": step4Payload(draft(zones, { perPvPairingPreferences: { pv_isola: ["2099-01-15"] } })),
    "urgency (amount)": step4Payload(draft(zones, { urgency: "urgent" })),
  };
  for (const [label, payload] of Object.entries(variants)) {
    const r = await pair(ref, payload);
    assert.equal(r.reused, false, label);
    assert.equal(r.mock.db.campaigns.length, 2, label);
  }
});

test("delete 2->1 and 5->4 produce new submissions that never carry the deleted PV", async () => {
  const two = [PV.isola(), PV.torino()];
  const five = [PV.isola(), PV.torino(), PV.monza(), PV.cormano(), PV.rho()];
  for (const [before, after, deleted] of [[two, [PV.isola()], "pv_torino"], [five, five.filter((z) => z.id !== "pv_monza"), "pv_monza"]]) {
    const a = step4Payload(draft(before));
    const b = step4Payload(draft(after));
    assert.ok(!JSON.stringify(b).includes(deleted), "deleted PV absent from payload");
    assert.equal(b.metadata.smart_pairing.rows.length, after.length);
    const r = await pair(a, b);
    assert.equal(r.reused, false);
    assert.ok(!JSON.stringify(r.b.json.campaign.metadata.smart_pairing).includes(deleted));
    assert.equal(r.b.json.campaign.quantity, after.reduce((s, z) => s + z.finalFlyers, 0));
  }
});

test("snapshot is evidence only: claimed authorization changes no amount and never matches the honest request", async () => {
  const zones = [PV.isola(), PV.torino()];
  const honest = step4Payload(draft(zones));
  const forged = structuredClone(honest);
  forged.metadata.smart_pairing.serverAuthorized = true;
  for (const r of forged.metadata.smart_pairing.rows) { r.verified = true; r.eligiblePercent = 40; r.eligibilityStatus = "eligible"; }
  const r = await pair(forged, honest);
  assert.equal(r.reused, false);
  assert.equal(r.a.json.campaign.total_amount, honest.total_amount);
  assert.equal(r.a.json.campaign.status, "pending_review");
  // The engine never turns a forged snapshot into a discount.
  const data = draft(zones, { perPvPairingEconomicSnapshot: forged.metadata.smart_pairing });
  const rebuilt = buildPerPvEconomics(data, { now: T0, states: Object.fromEntries(zones.map((z) => [z.id, { status: "match", verified: true, generation: 1, slots: [{ date: "2099-01-15", type: "same", discountPercent: 40 }] }])) });
  assert.equal(rebuilt.totals.discountCents, 0);
  assert.ok(rebuilt.rows.every((x) => x.verified === false && x.eligiblePercent === 0));
});

test("fail-closed: malformed drafts never throw and fall back to existing pricing", () => {
  const bad = [
    null, undefined, {}, { type: "d2d" }, { type: "d2d", smartPairingMode: "per_pv", campaignZones: "x" },
    draft([{ ...PV.isola(), id: "" }, PV.torino()]), draft([PV.isola(), { ...PV.torino(), id: "pv_isola" }]),
    draft([{ ...PV.isola(), allocation: [] }, PV.torino()]), draft([{ ...PV.isola(), finalFlyers: Number.NaN, assigned_flyers: "abc" }, PV.torino()]),
    draft([{ ...PV.torino(), selectedSearchPoint: { lat: 999, lng: 999 } }]), draft([PV.isola()], { startDate: "not-a-date" }),
    draft([PV.isola()], { perPvPairingEconomicSnapshot: { version: 1, rows: "garbage" } }),
  ];
  for (const d of bad) {
    let result;
    assert.doesNotThrow(() => { result = buildPerPvEconomics(d, { now: T0 }); });
    if (result) {
      assert.equal(result.totals.discountCents, 0);
      assert.equal(result.reservesCapacity, false);
      assert.equal(result.serverAuthorized, false);
    }
  }
  // Non per-PV legacy drafts keep the legacy path (null) untouched.
  assert.equal(buildPerPvEconomics({ ...draft([PV.isola()]), smartPairingMode: undefined }, { now: T0 }), null);
});

test("rounding: per-PV cents always reconcile with the campaign engine (deterministic sweep)", () => {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 200; i++) {
    const n = 1 + Math.floor(rand() * 5);
    const makers = [PV.isola, PV.torino, PV.monza, PV.cormano, PV.rho];
    const zones = makers.slice(0, n).map((make) => make(5000 + Math.floor(rand() * 60000)));
    const data = draft(zones, { urgency: ["normal", "urgent", "express"][i % 3] });
    const b = buildPerPvEconomics(data, { now: T0 });
    assert.ok(b, `breakdown for ${n} PV`);
    const summary = summarizeCampaignZones(zones);
    const engine = calculateQuotePricing({ quantity: summary.totalQuantity, pricePerThousand: 18.5, urgency: data.urgency, distributionZones: buildMultiZoneDistributionZones(summary) });
    const priced = pricePerPvQuote(b, { pricePerThousand: 18.5, urgency: data.urgency });
    assert.deepEqual(priced, engine);
    assert.equal(b.rows.reduce((s, r) => s + r.baseCents, 0), Math.round(engine.baseCost * 100));
    assert.equal(b.totals.base, buildPointOfSalePricing(summary).distributionTotal);
    assert.equal(b.totals.discountCents, 0);
  }
});
