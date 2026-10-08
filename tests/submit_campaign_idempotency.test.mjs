// PHASE 3B.3-H — submit-campaign-request idempotency hardening.
// Drives the real Edge Function handler (index.ts) in Node against an
// in-memory Supabase double (tests/helpers/submitCampaignHarness.mjs).
// No network, no real submissions, no database writes.
//
// SUBMIT_FN_PATH may point at another copy of the function (e.g. the deployed
// v11 source) to compare behaviour on the same scenarios.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createMockSupabase, loadSubmitFunction } from "./helpers/submitCampaignHarness.mjs";
import { canonicalJson, canonicalSubmission, computeSemanticFingerprint, fingerprintFromStoredCampaign } from "../supabase/functions/submit-campaign-request/submissionFingerprint.ts";

const FN_PATH = process.env.SUBMIT_FN_PATH || fileURLToPath(new URL("../supabase/functions/submit-campaign-request/index.ts", import.meta.url));
const invoke = await loadSubmitFunction(FN_PATH);

// --- Realistic multi-PV Step4 payload (shape of buildMultiZoneCampaignZonesPayload + metadata).
const pvZone = (id, index, name, quantity, extra = {}) => ({
  municipality: name, quantity, priority: index + 1, lat: 45.4839, lng: 9.1890, radius_m: null,
  territory_type: "nil", parent_municipality: "Milano", address_label: null, polygon_geojson: null,
  campaign_zone_id: id, campaign_zone_label: `Punto vendita ${index + 1} · ${name}`, campaign_zone_index: index,
  campaign_zone_mode: "municipality", campaign_zone_name: `Punto vendita ${index + 1}`, campaign_zone_location: name, store_name: null,
  ...extra,
});
const spRow = (pvId, quantity, baseCents, extra = {}) => ({
  pvId, name: pvId, quantity, contextSignature: `sig-${pvId}`, generation: 1, availabilityStatus: "unavailable",
  observedAt: 1791400000000, expiresAt: 1791400300000, context: { pvId, signature: `sig-${pvId}`, period: { start: "2026-10-08", end: "2027-01-05" } },
  selectedDates: [], selectedValidDates: [], verified: false, eligiblePercent: 0, eligibilityStatus: "unverified",
  reason: "unapproved_backend_contract", base: baseCents / 100, discount: 0, net: baseCents / 100, baseCents, discountCents: 0, netCents: baseCents,
  ...extra,
});

function multiPvBody(overrides = {}) {
  const zones = [
    pvZone("zone_pv1", 0, "ISOLA", 5959),
    pvZone("zone_pv2", 1, "DUOMO", 8209, { territory_type: "radius", radius_m: 1000, lat: 45.4609464, lng: 9.184435, address_label: "Via Torino, Duomo" }),
  ];
  const smart_pairing = {
    version: 1, contract: "name-only-v10-unverified", reservesCapacity: false, serverAuthorized: false,
    rows: [spRow("zone_pv1", 5959, 23685), spRow("zone_pv2", 8209, 29560)],
    totals: { quantity: 14168, base: 532.45, discount: 0, net: 532.45, baseCents: 53245, discountCents: 0, netCents: 53245 },
  };
  return {
    title: "Campagna Preventivo (Mario Rossi)", service_type: "d2d", status: "pending_review",
    city_name: "Milano", campaignZones: zones, flyer_quantity: 14168, flyer_format: "a5",
    start_date: "2026-10-20", end_date: null, client_name: "Mario Rossi", client_email: "Mario.Rossi@Example.it",
    client_phone: "+39 333 0000000", company_name: "Rossi SRL", smart_pairing_discount: 0, total_amount: 532.45,
    metadata: {
      grand_total: 532.45, zona: "ISOLA + DUOMO", comune: "Milano", mode: "multi_zone", selected_dates: [],
      formato: "a5", materiale: "già stampato", piano: "Singola", extra_services: [],
      smart_pairing,
      pricing: { lines: [{ label: "Distribuzione Door to Door", detail: "14.168 volantini", quantity: 14168, unitPrice: 0.035, total: 532.45 }], subtotal: 532.45, extras: [], discounts: [], total: 532.45, grandTotal: 532.45, urgencySurcharge: 0, printingLine: null, graphicLine: { label: "Grafica", amount: 0, inTotal: false } },
      quote_summary: { generatedAt: "2026-10-08T10:00:00.000Z", quoteDate: "2026-10-08" },
    },
    ...overrides,
  };
}

// Legacy single-PV Step4 payload (no PV identity fields).
function singleBody(overrides = {}) {
  return {
    title: "Campagna Preventivo (Anna)", service_type: "d2d", city_name: "Milano",
    campaignZones: [{ municipality: "ISOLA", quantity: 5959, priority: 1, lat: 45.4839, lng: 9.189, radius_m: null, territory_type: "nil", parent_municipality: "Milano", address_label: null, polygon_geojson: null }],
    flyer_quantity: 5959, start_date: "2026-10-20", client_name: "Anna", client_email: "anna@example.it", total_amount: 236.85,
    metadata: { grand_total: 236.85, mode: "municipality", selected_dates: [], pricing: { subtotal: 236.85, total: 236.85, grandTotal: 236.85, lines: [{ quantity: 5959, total: 236.85 }], extras: [], discounts: [] } },
    ...overrides,
  };
}

// QuickQuote-like caller: no campaignZones at all, flat fields only.
function quickQuoteBody(overrides = {}) {
  return { client_name: "Luca", client_email: "luca@example.it", city_name: "Monza", flyer_quantity: 10000, total_amount: 420, service_type: "d2d", metadata: { source: "quick_quote" }, ...overrides };
}

// A campaigns row exactly as deployed v11 writes it (v1 fingerprint only).
function seedLegacyV11Row(mock, body, { createdAt = new Date().toISOString(), v1 = "legacy-v1-hash" } = {}) {
  const rawZones = Array.isArray(body.campaignZones) ? body.campaignZones.slice(0, 100) : [];
  const metadata = JSON.parse(JSON.stringify({ ...(body.metadata || {}), campaign_zones: rawZones, payment_status: "in_attesa_pagamento", company_name: body.company_name || null, is_public_request: true, submission_fingerprint: v1 }));
  const row = {
    id: `legacy-${mock.db.campaigns.length + 1}`, user_id: null, title: body.title || "x", service_type: body.service_type || "d2d", status: "pending_review",
    source: "quote_requests", city: body.city_name || null, zone_name: body.city_name || null, quantity: body.flyer_quantity ?? 0, total_amount: body.total_amount ?? 0,
    start_date: body.start_date ? String(body.start_date).slice(0, 10) : null, end_date: body.end_date ? String(body.end_date).slice(0, 10) : null,
    client_name: body.client_name, client_phone: null, client_email: String(body.client_email).trim().toLowerCase(), metadata, created_at: createdAt, updated_at: createdAt,
  };
  mock.db.campaigns.push(row);
  rawZones.forEach((z, i) => mock.db.campaign_zones.push({ id: `${row.id}-z${i}`, campaign_id: row.id, zone_name: z.municipality, quantity_assigned: z.quantity, priority: i + 1, center_lat: z.lat ?? 0, center_lng: z.lng ?? 0 }));
  return row;
}

const reversedKeys = (value) => {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).reverse().map((k) => [k, reversedKeys(value[k])]));
  return value;
};

async function submitTwice(first, second, mock = createMockSupabase()) {
  const a = await invoke(mock, first);
  const b = await invoke(mock, second);
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.equal(b.status, 200, JSON.stringify(b.json));
  return { a, b, mock };
}
const assertReused = ({ a, b, mock }) => {
  assert.equal(b.json.idempotent, true, "expected idempotent reuse");
  assert.equal(b.json.campaign.id, a.json.campaign.id);
  assert.equal(mock.db.campaigns.length, 1);
};
const assertNew = ({ a, b, mock }, label) => {
  assert.notEqual(b.json.idempotent, true, `${label}: must not reuse an incompatible campaign`);
  assert.notEqual(b.json.campaign.id, a.json.campaign.id, label);
  assert.equal(mock.db.campaigns.length, 2, label);
};

// ---------------------------------------------------------------- exact retries
test("1. identical request retried within 10 minutes is idempotent (multi-PV, single-PV, quick quote)", async () => {
  for (const body of [multiPvBody(), singleBody(), quickQuoteBody()]) {
    const r = await submitTwice(body, structuredClone(body));
    assertReused(r);
    assert.equal(r.b.json.zonesCreated, r.a.json.zonesCreated);
    assert.equal(r.mock.db.campaign_zones.length, r.a.json.zonesCreated);
  }
});

test("2. same request with reordered JSON keys is idempotent", async () => {
  const body = multiPvBody();
  const reordered = reversedKeys(body);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(body));
  assertReused(await submitTwice(body, reordered));
});

test("3. non-semantic timestamp/volatile differences do not break idempotency", async () => {
  const body = multiPvBody();
  const later = structuredClone(body);
  later.metadata.quote_summary.generatedAt = "2026-10-08T10:04:59.000Z";
  for (const row of later.metadata.smart_pairing.rows) {
    row.observedAt += 240000; row.expiresAt += 240000; row.lastCheckedAt = 1791400240000; row.generation = 3;
    row.context.period.start = "2026-10-08"; row.availabilityStatus = "stale";
  }
  later.metadata.pricing.lines[0].detail = "14.168 volantini  - €0,0350";
  later.zona = "label only";
  assertReused(await submitTwice(body, later));
});

// ---------------------------------------------------------------- semantic differences
test("4. two PV with distinct stable IDs never collide even with identical names/quantities", async () => {
  const body = multiPvBody();
  const other = structuredClone(body);
  other.campaignZones[1].campaign_zone_id = "zone_pv9";
  other.metadata.smart_pairing.rows[1].pvId = "zone_pv9";
  assertNew(await submitTwice(body, other), "different PV identity");
});

test("5. changed PV territory, quantity or dates create a new campaign", async () => {
  const mutations = {
    "radius": (b) => { b.campaignZones[1].radius_m = 2000; },
    "centre": (b) => { b.campaignZones[1].lat = 45.47; },
    "address": (b) => { b.campaignZones[1].address_label = "Corso Buenos Aires"; },
    "territory type": (b) => { b.campaignZones[0].territory_type = "comune"; },
    "polygon": (b) => { b.campaignZones[0].polygon_geojson = { type: "Polygon", coordinates: [[[9.1, 45.4], [9.2, 45.4], [9.2, 45.5], [9.1, 45.4]]] }; },
    "PV quantity (same total)": (b) => { b.campaignZones[0].quantity = 6000; b.campaignZones[1].quantity = 8168; },
    "start date": (b) => { b.start_date = "2026-11-20"; },
    "end date": (b) => { b.end_date = "2026-11-30"; },
    "selected dates": (b) => { b.metadata.selected_dates = ["2026-10-21"]; },
    "per-PV selected dates": (b) => { b.metadata.smart_pairing.rows[0].selectedDates = ["2026-10-22"]; },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const changed = structuredClone(multiPvBody());
    mutate(changed);
    assertNew(await submitTwice(multiPvBody(), changed), label);
  }
});

test("6. changed per-PV Smart Pairing breakdown creates a new campaign", async () => {
  const mutations = {
    "discount cents": (sp) => { sp.rows[0].discountCents = 4737; sp.rows[0].netCents = 18948; },
    "eligibility": (sp) => { sp.rows[1].eligibilityStatus = "eligible"; sp.rows[1].eligiblePercent = 20; },
    "context signature": (sp) => { sp.rows[0].contextSignature = "sig-other"; },
    "totals": (sp) => { sp.totals.netCents = 50000; },
    "contract": (sp) => { sp.contract = "server-verified-v11"; },
    "evidence removed": (sp, b) => { delete b.metadata.smart_pairing; },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const changed = structuredClone(multiPvBody());
    mutate(changed.metadata.smart_pairing, changed);
    assertNew(await submitTwice(multiPvBody(), changed), label);
  }
});

test("7. changed campaign total or economic lines create a new campaign", async () => {
  const mutations = {
    "total_amount": (b) => { b.total_amount = 600; },
    "grand_total": (b) => { b.metadata.grand_total = 611.45; },
    "pricing discount line": (b) => { b.metadata.pricing.discounts = [{ label: "Piano -10%", amount: 53.25, percentage: 10 }]; },
    "extra service": (b) => { b.metadata.extra_services = ["gps_live"]; },
  };
  for (const [label, mutate] of Object.entries(mutations)) {
    const changed = structuredClone(multiPvBody());
    mutate(changed);
    assertNew(await submitTwice(multiPvBody(), changed), label);
  }
});

// ---------------------------------------------------------------- legacy / absent metadata
test("8. absent or malformed metadata: retries stay idempotent and nothing crashes", async () => {
  for (const metadata of [undefined, null, "not-an-object", [1, 2, 3], { smart_pairing: "garbage", pricing: 42, selected_dates: "x" }]) {
    const body = singleBody({ metadata });
    if (metadata === undefined) delete body.metadata;
    const r = await submitTwice(body, structuredClone(body));
    assertReused(r);
  }
});

test("9. legacy single-PV and quick-quote callers keep v11 response shape and idempotency", async () => {
  for (const body of [singleBody(), quickQuoteBody()]) {
    const mock = createMockSupabase();
    const first = await invoke(mock, body);
    assert.equal(first.status, 200);
    assert.equal(first.json.success, true);
    assert.equal(first.json.zonesError, null);
    assert.equal(first.json.campaign.status, "pending_review");
    assert.equal(first.json.campaign.source, "quote_requests");
    assert.equal(first.json.campaign.metadata.is_public_request, true);
    assert.equal(first.json.campaign.metadata.payment_status, "in_attesa_pagamento");
    assert.match(first.json.campaign.metadata.submission_fingerprint, /^[0-9a-f]{64}$/, "v1 key still written");
    const retry = await invoke(mock, structuredClone(body));
    assert.equal(retry.json.idempotent, true);
    assert.equal(retry.json.campaign.id, first.json.campaign.id);
    const otherDate = await invoke(mock, { ...structuredClone(body), start_date: "2026-12-01" });
    assert.notEqual(otherDate.json.campaign.id, first.json.campaign.id);
  }
});

// A row created by the handler with its v2 key removed is exactly what the
// deployed v11 writes (real v1 fingerprint, metadata verbatim).
async function createV11ShapedRow(mock, body) {
  const created = await invoke(mock, body);
  const row = mock.db.campaigns.find((c) => c.id === created.json.campaign.id);
  delete row.metadata.submission_fingerprint_v2;
  return row;
}

test("10. legacy v11 rows: reused only when the stored snapshot matches the request", async () => {
  // Compatible legacy row (v1 only): an exact retry across the deploy boundary is still idempotent.
  for (const body of [multiPvBody(), singleBody(), quickQuoteBody()]) {
    const mock = createMockSupabase();
    const legacy = await createV11ShapedRow(mock, body);
    const retry = await invoke(mock, structuredClone(body));
    assert.equal(retry.json.idempotent, true);
    assert.equal(retry.json.campaign.id, legacy.id);
    assert.equal(mock.db.campaigns.length, 1);
  }
  // Hand-written legacy row (no fingerprint keys at all) is matched on its content too.
  const mock = createMockSupabase();
  const seeded = seedLegacyV11Row(mock, singleBody());
  delete seeded.metadata.submission_fingerprint;
  assert.equal((await invoke(mock, singleBody())).json.campaign.id, seeded.id);
});

test("11. old records with incompatible snapshots are never reused nor modified", async () => {
  const stored = multiPvBody();
  const mock = createMockSupabase();
  // Same v1 identity (email, city, quantity, total, zone names:quantities) but different dates/territory:
  // deployed v11 would return this row for `stored`.
  const legacy = await createV11ShapedRow(mock, { ...structuredClone(stored), start_date: "2026-10-01", campaignZones: stored.campaignZones.map((z) => ({ ...z, radius_m: 3000 })) });
  const before = structuredClone(legacy);
  const res = await invoke(mock, stored);
  assert.equal(res.status, 200);
  assert.notEqual(res.json.idempotent, true);
  assert.notEqual(res.json.campaign.id, legacy.id);
  assert.deepEqual(mock.db.campaigns.find((c) => c.id === legacy.id), before, "legacy row untouched");
  // Rows the function did not create (other source / no public flag) are never candidates.
  const mock2 = createMockSupabase();
  const manual = seedLegacyV11Row(mock2, stored);
  manual.source = "manual";
  const res2 = await invoke(mock2, stored);
  assert.notEqual(res2.json.campaign.id, manual.id);
  const mock3 = createMockSupabase();
  const unflagged = seedLegacyV11Row(mock3, stored);
  delete unflagged.metadata.is_public_request;
  const res3 = await invoke(mock3, stored);
  assert.notEqual(res3.json.campaign.id, unflagged.id);
});

test("12. window, email and candidate bounds", async () => {
  const body = multiPvBody();
  // Outside the 10-minute window -> new campaign.
  const mock = createMockSupabase();
  seedLegacyV11Row(mock, body, { createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() });
  const res = await invoke(mock, body);
  assert.notEqual(res.json.idempotent, true);
  // Different email never reuses; email comparison is case-insensitive.
  assertNew(await submitTwice(body, { ...structuredClone(body), client_email: "someone.else@example.it" }), "other email");
  // (v11 validates the raw email before trimming: surrounding spaces stay a 400, unchanged.)
  assertReused(await submitTwice(body, { ...structuredClone(body), client_email: "MARIO.ROSSI@example.IT" }));
});

// ---------------------------------------------------------------- concurrency
test("13. sequential double submit creates one campaign; concurrent duplicates keep v11 best-effort behaviour", async () => {
  const body = multiPvBody();
  const mock = createMockSupabase();
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await invoke(mock, structuredClone(body)));
  assert.equal(new Set(results.map((r) => r.json.campaign.id)).size, 1);
  assert.equal(mock.db.campaigns.length, 1);

  // Truly concurrent identical requests: both read before either writes.
  // Without a unique constraint (out of scope: no migrations) both insert,
  // exactly as deployed v11 does. Each response is internally consistent.
  const race = createMockSupabase();
  const [x, y] = await Promise.all([invoke(race, structuredClone(body)), invoke(race, structuredClone(body))]);
  assert.equal(x.status, 200);
  assert.equal(y.status, 200);
  assert.ok(race.db.campaigns.length <= 2);
  for (const c of race.db.campaigns) assert.equal(c.total_amount, body.total_amount);

  // Concurrent DIFFERENT requests never return each other's campaign.
  const race2 = createMockSupabase();
  const other = { ...structuredClone(body), start_date: "2026-11-20" };
  const [p, q] = await Promise.all([invoke(race2, body), invoke(race2, other)]);
  assert.notEqual(p.json.campaign.id, q.json.campaign.id);
  assert.equal(p.json.campaign.start_date, "2026-10-20");
  assert.equal(q.json.campaign.start_date, "2026-11-20");
});

// ---------------------------------------------------------------- failure paths
test("14. failure paths are unchanged and fail safe", async () => {
  const body = multiPvBody();
  // Candidate lookup error: no reuse, a new campaign is created (v11 ignored lookup errors too).
  const lookupFails = createMockSupabase({ faults: { campaignsSelect: "boom" } });
  const r1 = await invoke(lookupFails, body);
  assert.equal(r1.status, 200);
  assert.notEqual(r1.json.idempotent, true);
  // Zone insert failure: 500 and compensating delete of the new campaign.
  const zonesFail = createMockSupabase({ faults: { zonesInsert: "fk" } });
  const r2 = await invoke(zonesFail, body);
  assert.equal(r2.status, 500);
  assert.equal(zonesFail.db.campaigns.length, 0);
  // Campaign insert failure: 500, nothing stored.
  const campFail = createMockSupabase({ faults: { campaignsInsert: "x" } });
  const r3 = await invoke(campFail, body);
  assert.equal(r3.status, 500);
  assert.equal(campFail.db.campaigns.length, 0);
  // Validation paths.
  const v = createMockSupabase();
  assert.equal((await invoke(v, { ...body, client_email: "not-an-email" })).status, 400);
  assert.equal((await invoke(v, { ...body, client_name: "" })).status, 400);
  assert.equal((await invoke(v, { ...body, flyer_quantity: -1 })).status, 400);
  assert.equal((await invoke(v, { ...body, total_amount: 2000000 })).status, 400);
  assert.equal((await invoke(v, { ...body, campaignZones: [{ municipality: "", quantity: 0 }] })).status, 400);
  assert.equal(v.db.campaigns.length, 0);
  const opt = await invoke(v, null, { method: "OPTIONS" });
  assert.equal(opt.status, 200);
  assert.equal(opt.text, "ok");
  assert.equal((await invoke(v, null, { rawBody: "{not json" })).status, 500);
});

// ---------------------------------------------------------------- authorization / payments untouched
test("15. no change to authorization, payments or price authority", async () => {
  const users = { "tok-ok": { id: "user-1", email: "mario.rossi@example.it" }, "tok-other": { id: "user-2", email: "x@example.it" } };
  const body = multiPvBody();
  const mock = createMockSupabase({ users });
  const owned = await invoke(mock, body, { token: "tok-ok" });
  assert.equal(owned.json.campaign.user_id, "user-1");
  const mock2 = createMockSupabase({ users });
  const notOwned = await invoke(mock2, body, { token: "tok-other" });
  assert.equal(notOwned.json.campaign.user_id, null);
  // Snapshot flags are data, never authority: amounts are stored exactly as sent.
  const claimed = structuredClone(body);
  claimed.metadata.smart_pairing.serverAuthorized = true;
  claimed.metadata.smart_pairing.rows[0].verified = true;
  claimed.metadata.smart_pairing.rows[0].eligiblePercent = 40;
  const mock3 = createMockSupabase();
  const res = await invoke(mock3, claimed);
  assert.equal(res.json.campaign.total_amount, body.total_amount);
  assert.equal(res.json.campaign.status, "pending_review");
  assert.equal(res.json.campaign.metadata.payment_status, "in_attesa_pagamento");
  // ...and a claimed authorization does not match a request without it.
  const r = await invoke(mock3, body);
  assert.notEqual(r.json.campaign.id, res.json.campaign.id);
});

// ---------------------------------------------------------------- canonical module
test("16. canonical fingerprint: stable, order-free, rebuilt identically from a stored row", async () => {
  const body = multiPvBody();
  const input = (b) => ({ clientEmail: b.client_email.trim().toLowerCase(), serviceType: "d2d", cityName: b.city_name, quantity: b.flyer_quantity, totalAmount: b.total_amount, startDate: b.start_date, endDate: b.end_date, rawZones: b.campaignZones, metadata: b.metadata });
  const fp = await computeSemanticFingerprint(input(body));
  assert.match(fp, /^v2:[0-9a-f]{64}$/);
  assert.equal(await computeSemanticFingerprint(input(reversedKeys(body))), fp);
  const polygonObj = structuredClone(body);
  polygonObj.campaignZones[0].polygon_geojson = { type: "Polygon", coordinates: [[[9.1, 45.4], [9.2, 45.5], [9.1, 45.4]]] };
  const polygonStr = structuredClone(polygonObj);
  polygonStr.campaignZones[0].polygon_geojson = JSON.stringify(reversedKeys(polygonObj.campaignZones[0].polygon_geojson));
  assert.equal(await computeSemanticFingerprint(input(polygonObj)), await computeSemanticFingerprint(input(polygonStr)));
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
  assert.equal(canonicalSubmission({ ...input(body), startDate: "2026-10-20T09:00:00Z" }).start_date, "2026-10-20");
  // Stored row (jsonb-reordered) rebuilds the same identity.
  const mock = createMockSupabase();
  const created = await invoke(mock, body);
  assert.equal(await fingerprintFromStoredCampaign(mock.db.campaigns[0]), fp);
  assert.equal(created.json.campaign.metadata.submission_fingerprint_v2, fp);
  assert.equal(await fingerprintFromStoredCampaign({ metadata: { is_public_request: false } }), null);
  assert.equal(await fingerprintFromStoredCampaign(null), null);
});
