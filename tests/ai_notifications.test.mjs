import assert from "node:assert/strict";
import { buildClientDashboardInsights } from "../src/lib/ai/buildClientInsights.js";
import { buildAdminDashboardInsights } from "../src/lib/ai/buildAdminInsights.js";
import { buildAdminDecisionItems } from "../src/lib/ai/buildAdminDecisionItems.js";
import { buildClientNotifications } from "../src/lib/ai/buildClientNotifications.js";
import { buildAdminNotifications } from "../src/lib/ai/buildAdminNotifications.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const now = new Date("2026-07-20T12:00:00Z");
const clientReady = (data, observedAt = "2026-07-20T11:58:00Z") => ({ status: "ready", data, observedAt, staleAfterMs: 600_000 });
const ownContext = { ownershipConfirmed: true };

const clientInsights = buildClientDashboardInsights({
  sources: { campaigns: clientReady([
    { stato: "report_pronto", stato_pagamento: "pagato", totale_euro: 100, updated_at: "2026-07-20T11:58:00Z" },
    { stato: "preventivo", stato_pagamento: "da_pagare", totale_euro: 0, updated_at: "2026-07-20T11:57:00Z" },
  ]) },
  context: ownContext,
  now,
});

test("Cliente usa solo insight stabili gia proiettati", () => {
  const center = buildClientNotifications({ insights: clientInsights, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now });
  assert.equal(center.access, "allowed");
  assert.ok(center.notifications.some((item) => item.id === "client.notification.client.home.attention.pending_payments"));
  assert.ok(center.notifications.some((item) => item.id === "client.notification.client.home.available_reports"));
  assert.ok(center.notifications.every((item) => item.audience === "cliente"));
  assert.ok(center.notifications.every((item) => !item.href || item.href === "/dashboard"));
});

test("zero reale non diventa assenza o attenzione", () => {
  const zeroInsights = buildClientDashboardInsights({ sources: { campaigns: clientReady([]) }, context: ownContext, now });
  const center = buildClientNotifications({ insights: zeroInsights, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now });
  assert.equal(center.notifications.some((item) => item.id.includes("pending_payments") || item.id.includes("available_reports")), false);
  assert.equal(center.notifications.length, 1, "Solo l'ultimo aggiornamento realmente assente deve essere notificato.");
  assert.equal(center.notifications[0].state, "missing");
});

test("Cliente distingue missing, error e obsoleto", () => {
  const missing = buildClientDashboardInsights({ sources: {}, context: ownContext, now });
  const missingCenter = buildClientNotifications({ insights: missing, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now });
  assert.ok(missingCenter.notifications.every((item) => item.state === "missing"));
  const error = buildClientDashboardInsights({ sources: { campaigns: { status: "error", reason: "Errore fixture" } }, context: ownContext, now });
  const errorCenter = buildClientNotifications({ insights: error, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now });
  assert.ok(errorCenter.notifications.every((item) => item.state === "error" && item.href === null));
  const stale = buildClientDashboardInsights({ sources: { campaigns: clientReady([], "2026-07-19T10:00:00Z") }, context: ownContext, now });
  const staleCenter = buildClientNotifications({ insights: stale, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now });
  const staleItems = staleCenter.notifications.filter((item) => item.datum.freshness?.state === "obsoleto");
  assert.ok(staleItems.length > 0);
  assert.ok(staleItems.every((item) => item.level === "da verificare"));
});

test("diniego Cliente non conta o espone valore, link e timestamp", () => {
  const center = buildClientNotifications({ insights: clientInsights, context: { authorized: true, role: "cliente", ownershipConfirmed: false }, now });
  assert.equal(center.authorizedCount, 0);
  assert.ok(center.notifications.every((item) => item.state === "denied" && item.href === null && item.timestamp === null));
  assert.ok(center.notifications.every((item) => !String(item.description).includes("100")));
  const wrongRole = buildClientNotifications({ insights: clientInsights, context: { authorized: true, role: "admin", ownershipConfirmed: true }, now });
  assert.equal(wrongRole.access, "denied");
  assert.equal(wrongRole.notifications.length, 0);
});

const adminReady = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:58:00Z", staleAfterMs: 600_000 });
const adminInsights = buildAdminDashboardInsights({
  sources: { campaigns: adminReady([]), sessions: adminReady([]), gpsPoints: adminReady([]), proofPhotos: adminReady([]), waitlist: adminReady([]), activities: adminReady([]) },
  snapshot: { activeCampaigns: 1, completedCampaigns: 0, lateCampaigns: 2, liveSessions: 0, operatorStatus: "0/1", onlineOperators: 0, offlineOperators: 1, pendingCampaigns: 0, activeClients: 1, pendingRequests: 1, totalRevenue: 0, avgCpm: 0, alarmCount: 3, opsProblems: 1, lastUpdate: "2026-07-20T11:58:00Z" },
  now,
});
const decisionCenter = buildAdminDecisionItems({ insights: adminInsights, context: { authorized: true, role: "admin" }, now });

test("Admin riusa ordine, segnali e route del Centro Decisionale", () => {
  const center = buildAdminNotifications({ decisionCenter, context: { authorized: true, role: "admin" }, now });
  assert.deepEqual(center.notifications.map((item) => item.title), decisionCenter.items.map((item) => item.title));
  assert.ok(center.notifications.every((item) => item.audience === "admin"));
  assert.ok(center.notifications.every((item) => !item.href || ["/admin/live", "/admin/anomalie", "/admin/finance", "#campagne-attive"].includes(item.href)));
  assert.equal(center.authorizedCount, center.notifications.length);
});

test("Admin e super_admin ammessi, Cliente e Operatore negati", () => {
  assert.equal(buildAdminNotifications({ decisionCenter, context: { authorized: true, role: "super_admin" }, now }).access, "allowed");
  for (const role of ["cliente", "operatore"]) {
    const center = buildAdminNotifications({ decisionCenter, context: { authorized: true, role }, now });
    assert.equal(center.access, "denied");
    assert.equal(center.notifications.length, 0);
  }
});

test("nessuna notifica introduce punteggi o campi predittivi", () => {
  const centers = [
    buildClientNotifications({ insights: clientInsights, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now }),
    buildAdminNotifications({ decisionCenter, context: { authorized: true, role: "admin" }, now }),
  ];
  const serialized = JSON.stringify(centers);
  assert.doesNotMatch(serialized, /score|probabilita|previsione|routing/i);
});

console.log(`AI notification builder tests: ${passed} passed`);
