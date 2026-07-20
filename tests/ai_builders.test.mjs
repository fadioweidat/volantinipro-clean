import assert from "node:assert/strict";
import { buildClientDashboardInsights, buildClientInsights } from "../src/lib/ai/buildClientInsights.js";
import { buildAdminDashboardInsights, buildAdminInsights } from "../src/lib/ai/buildAdminInsights.js";
import {
  AI_DATA_CATEGORIES,
  AI_FRESHNESS_STATES,
  AI_UNAVAILABLE_CODES,
  validateAiDatum,
} from "../src/lib/ai/insight-contract.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const now = new Date("2026-07-20T12:00:00.000Z");
const ready = (data, observedAt = "2026-07-20T11:55:00.000Z", staleAfterMs = 600_000) => ({ status: "ready", data, observedAt, staleAfterMs });
const byId = (result, id) => result.items.find((item) => item.id === id);

test("builder Cliente produce solo elementi conformi al contratto", () => {
  const result = buildClientInsights({
    now,
    context: { ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true },
    sources: {
      campaign: ready({ quantity: 0, municipalities: [], plannedCoveragePercent: 0 }),
      gpsPoints: ready([]), approvedPhotos: ready([]),
      coverageMetrics: ready({ coveragePercent: 0, formula: "calcolo esistente", inputs: ["gps", "zone"] }),
    },
  });
  assert.equal(result.items.length, 6);
  result.items.forEach((item) => assert.deepEqual(validateAiDatum(item), { valid: true, errors: [] }));
  assert.equal(byId(result, "client.campaign.quantity").value, 0);
  assert.equal(byId(result, "client.tracking.gps_points_count").value, 0);
  assert.equal(byId(result, "client.tracking.coverage").value, 0);
});

test("builder Cliente usa null per fonte mancante o in errore", () => {
  const result = buildClientInsights({
    now,
    context: { ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true },
    sources: {
      campaign: ready({ quantity: null, municipalities: null, plannedCoveragePercent: null }),
      gpsPoints: { status: "error", reason: "Timeout lettura GPS." },
      approvedPhotos: { status: "missing", reason: "Foto non caricate." },
      coverageMetrics: { status: "missing", reason: "Calcolo non prodotto." },
    },
  });
  assert.equal(byId(result, "client.campaign.quantity").value, null);
  assert.equal(byId(result, "client.tracking.gps_points_count").unavailable.code, AI_UNAVAILABLE_CODES.SOURCE_ERROR);
  assert.equal(byId(result, "client.campaign.approved_photos_count").unavailable.code, AI_UNAVAILABLE_CODES.MISSING);
});

test("builder Cliente oscura tutti i valori senza ownership", () => {
  const result = buildClientInsights({
    now,
    context: { ownershipConfirmed: false, clientTrackingEnabled: true, approvedOnly: true },
    sources: { campaign: ready({ quantity: 100, municipalities: ["Milano"], plannedCoveragePercent: 80 }), gpsPoints: ready([{}]), approvedPhotos: ready([{}]), coverageMetrics: ready({ coveragePercent: 50 }) },
  });
  result.items.forEach((item) => {
    assert.equal(item.category, AI_DATA_CATEGORIES.UNAVAILABLE);
    assert.equal(item.value, null);
    assert.equal(item.unavailable.code, AI_UNAVAILABLE_CODES.ACCESS_DENIED);
  });
});

test("builder conserva lo stato obsoleto", () => {
  const result = buildClientInsights({
    now,
    context: { ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true },
    sources: { campaign: ready({ quantity: 10, municipalities: [], plannedCoveragePercent: 50 }, "2026-07-20T09:00:00Z"), gpsPoints: ready([]), approvedPhotos: ready([]), coverageMetrics: ready({ coveragePercent: 0 }) },
  });
  assert.equal(byId(result, "client.campaign.quantity").freshness.state, AI_FRESHNESS_STATES.STALE);
});

test("builder Admin distingue collezione vuota da fonte assente", () => {
  const result = buildAdminInsights({
    now,
    sources: {
      campaigns: ready([]), sessions: ready([]), gpsPoints: ready([]), proofPhotos: ready([]), anomalies: ready([]),
      waitlist: { status: "missing", reason: "Fonte non interrogata." },
    },
  });
  assert.equal(byId(result, "admin.campaigns.count").value, 0);
  assert.equal(byId(result, "admin.campaigns.count").category, AI_DATA_CATEGORIES.DERIVED);
  assert.equal(byId(result, "admin.waitlist.count").value, null);
  assert.equal(byId(result, "admin.waitlist.count").category, AI_DATA_CATEGORIES.UNAVAILABLE);
  result.items.forEach((item) => assert.equal(validateAiDatum(item).valid, true));
});

test("builder Admin mantiene accesso negato dalla fonte", () => {
  const result = buildAdminInsights({ now, sources: { campaigns: { status: "denied", reason: "Sessione Admin non autorizzata." } } });
  const datum = byId(result, "admin.campaigns.count");
  assert.equal(datum.value, null);
  assert.equal(datum.unavailable.code, AI_UNAVAILABLE_CODES.ACCESS_DENIED);
  assert.equal(datum.permission.allowed, false);
  assert.equal(validateAiDatum(datum).valid, true);
});

test("builder home Cliente conserva i KPI della dashboard con fonte completa", () => {
  const campaigns = [
    { stato: "in_distribuzione", stato_pagamento: "pagato", totale_euro: 386, updated_at: "2026-07-20T11:55:00Z" },
    { stato: "completata", stato_pagamento: "da_pagare", total_amount: 214.5, updated_at: "2026-07-20T10:00:00Z" },
    { stato: "preventivo", stato_pagamento: "da_pagare", totale_euro: 0, updated_at: "2026-07-19T18:00:00Z" },
  ];
  const result = buildClientDashboardInsights({ now, context: { ownershipConfirmed: true }, sources: { campaigns: ready(campaigns) } });
  assert.equal(byId(result, "client.home.active_campaigns").value, 1);
  assert.equal(byId(result, "client.home.completed_campaigns").value, 1);
  assert.equal(byId(result, "client.home.pending_quotes").value, 1);
  assert.equal(byId(result, "client.home.pending_payments").value, 2);
  assert.equal(byId(result, "client.home.received_payments").value, 1);
  assert.equal(byId(result, "client.home.available_reports").value, 1);
  assert.equal(byId(result, "client.home.total_spent").value, 600.5);
  assert.equal(result.attention.length, 2);
  [...result.items, ...result.attention].forEach((item) => assert.equal(validateAiDatum(item).valid, true));
});

test("builder home Cliente distingue zero reale e importo mancante", () => {
  const zero = buildClientDashboardInsights({ now, context: { ownershipConfirmed: true }, sources: { campaigns: ready([]) } });
  assert.equal(byId(zero, "client.home.total_spent").value, 0);
  assert.equal(byId(zero, "client.home.total_spent").category, AI_DATA_CATEGORIES.DERIVED);
  assert.equal(byId(zero, "client.home.last_update").value, null);
  const missing = buildClientDashboardInsights({ now, context: { ownershipConfirmed: true }, sources: { campaigns: ready([{ stato: "confermata", stato_pagamento: "pagato", totale_euro: null, updated_at: "2026-07-20T11:00:00Z" }]) } });
  assert.equal(byId(missing, "client.home.total_spent").value, null);
  assert.equal(byId(missing, "client.home.total_spent").category, AI_DATA_CATEGORIES.UNAVAILABLE);
});

test("builder home non genera attenzione su errore e oscura su diniego", () => {
  const errored = buildClientDashboardInsights({ now, context: { ownershipConfirmed: true }, sources: { campaigns: { status: "error", reason: "Errore controllato." } } });
  assert.equal(errored.attention.length, 0);
  errored.items.forEach((item) => assert.equal(item.value, null));
  const denied = buildClientDashboardInsights({ now, context: { ownershipConfirmed: false }, sources: { campaigns: ready([{ stato: "confermata", stato_pagamento: "pagato", totale_euro: 10, updated_at: "2026-07-20T11:00:00Z" }]) } });
  denied.items.forEach((item) => {
    assert.equal(item.value, null);
    assert.equal(item.unavailable.code, AI_UNAVAILABLE_CODES.ACCESS_DENIED);
  });
});

function adminDashboardSources(overrides = {}) {
  return {
    campaigns: ready([{}]), sessions: ready([{}]), gpsPoints: ready([{}]), proofPhotos: ready(null),
    waitlist: ready([{}]), activities: ready([{}]), ...overrides,
  };
}

function adminDashboardSnapshot(overrides = {}) {
  return {
    activeCampaigns: 3, completedCampaigns: 2, lateCampaigns: 1, liveSessions: 4,
    operatorStatus: "5/2", onlineOperators: 5, offlineOperators: 2,
    pendingCampaigns: 1, activeClients: 4, pendingRequests: 2,
    totalRevenue: 1520.5, avgCpm: 48.25, alarmCount: 6, opsProblems: 3,
    lastUpdate: "2026-07-20T11:55:00.000Z", ...overrides,
  };
}

test("builder Dashboard Admin conserva i dodici KPI esistenti", () => {
  const result = buildAdminDashboardInsights({ now, sources: adminDashboardSources(), snapshot: adminDashboardSnapshot() });
  assert.equal(result.items.length, 12);
  assert.equal(byId(result, "admin.home.active_campaigns").value, 3);
  assert.equal(byId(result, "admin.home.operator_status").value, "5/2");
  assert.equal(byId(result, "admin.home.total_revenue").value, 1520.5);
  assert.equal(byId(result, "admin.home.average_cpm").value, 48.25);
  assert.equal(byId(result, "admin.home.active_alarms").value, 6);
  assert.equal(result.attention.length, 4);
  [...result.items, ...result.attention.map((item) => item.datum)].forEach((item) => assert.equal(validateAiDatum(item).valid, true));
});

test("builder Dashboard Admin mantiene zero e stato obsoleto", () => {
  const staleSources = adminDashboardSources();
  Object.keys(staleSources).forEach((key) => { staleSources[key] = ready(staleSources[key].data, "2026-07-20T09:00:00Z", 600_000); });
  const result = buildAdminDashboardInsights({ now, sources: staleSources, snapshot: adminDashboardSnapshot({ activeCampaigns: 0, lateCampaigns: 0, offlineOperators: 0, pendingRequests: 0, opsProblems: 0, alarmCount: 0 }) });
  assert.equal(byId(result, "admin.home.active_campaigns").value, 0);
  assert.equal(byId(result, "admin.home.active_campaigns").category, AI_DATA_CATEGORIES.DERIVED);
  assert.equal(byId(result, "admin.home.active_campaigns").freshness.state, AI_FRESHNESS_STATES.STALE);
  assert.equal(result.attention.length, 0);
  assert.equal(result.attentionState, "empty");
});

test("builder Dashboard Admin distingue fonte assente e non espone attenzione negata", () => {
  const partial = buildAdminDashboardInsights({ now, sources: adminDashboardSources({ proofPhotos: { status: "missing", reason: "Foto non disponibili." } }), snapshot: adminDashboardSnapshot() });
  assert.equal(byId(partial, "admin.home.active_alarms").value, null);
  assert.equal(byId(partial, "admin.home.active_alarms").unavailable.code, AI_UNAVAILABLE_CODES.MISSING);
  assert.equal(partial.attention.some((item) => item.datum.id === "admin.home.attention.operational_problems"), false);
  assert.equal(partial.attentionState, "partial");

  const denied = buildAdminDashboardInsights({ now, sources: adminDashboardSources({ campaigns: { status: "denied", reason: "Ruolo Admin non confermato." } }), snapshot: adminDashboardSnapshot() });
  assert.equal(byId(denied, "admin.home.active_campaigns").value, null);
  assert.equal(byId(denied, "admin.home.active_campaigns").unavailable.code, AI_UNAVAILABLE_CODES.ACCESS_DENIED);
  assert.equal(denied.attention.some((item) => item.datum.id === "admin.home.attention.late_campaigns"), false);
  assert.equal(denied.attentionState, "denied");
});

console.log(`AI builder tests: ${passed} passed`);
