import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { AINotificationCenter } = await vite.ssrLoadModule("/src/components/ai/AINotificationCenter.jsx");
  const { buildClientDashboardInsights } = await vite.ssrLoadModule("/src/lib/ai/buildClientInsights.js");
  const { buildClientNotifications } = await vite.ssrLoadModule("/src/lib/ai/buildClientNotifications.js");
  const { buildAdminDashboardInsights } = await vite.ssrLoadModule("/src/lib/ai/buildAdminInsights.js");
  const { buildAdminDecisionItems } = await vite.ssrLoadModule("/src/lib/ai/buildAdminDecisionItems.js");
  const { buildAdminNotifications } = await vite.ssrLoadModule("/src/lib/ai/buildAdminNotifications.js");
  const { default: VolantiniProAIHub } = await vite.ssrLoadModule("/src/components/ai/VolantiniProAIHub.jsx");
  const now = new Date("2026-07-20T12:00:00Z");
  const ready = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:58:00Z", staleAfterMs: 600_000 });
  const clientInsights = buildClientDashboardInsights({ sources: { campaigns: ready([{ stato: "report_pronto", stato_pagamento: "da_pagare", totale_euro: 0, updated_at: "2026-07-20T11:58:00Z" }]) }, context: { ownershipConfirmed: true }, now });
  const clientCenter = buildClientNotifications({ insights: clientInsights, context: { authorized: true, role: "cliente", ownershipConfirmed: true }, now });

  test("Centro condiviso espone ID, audience, categoria, freshness, fonte e route", () => {
    const html = renderToStaticMarkup(React.createElement(AINotificationCenter, { center: clientCenter }));
    assert.match(html, /Centro Notifiche/);
    assert.match(html, /client\.notification\.client\.home\.attention\.pending_payments/);
    assert.match(html, />cliente</);
    assert.match(html, /DATO DERIVATO/);
    assert.match(html, /Dato aggiornato/);
    assert.match(html, /Fonte e criterio/);
    assert.match(html, /href="\/dashboard"/);
  });

  test("filtri sono consultivi e non esistono azioni persistenti", () => {
    const html = renderToStaticMarkup(React.createElement(AINotificationCenter, { center: clientCenter }));
    assert.match(html, /Filtra notifiche per tipologia/);
    assert.equal((html.match(/aria-pressed=/g) || []).length, 5);
    assert.doesNotMatch(html, /segna come letto|archivia(?:re)?|risolvi(?:re)?/i);
    assert.doesNotMatch(html, /<input|<textarea|contenteditable|type="submit"/);
  });

  test("diniego non rende notifiche, fonti o link", () => {
    const denied = buildClientNotifications({ insights: clientInsights, context: { authorized: false, role: "cliente", ownershipConfirmed: false }, now });
    const html = renderToStaticMarkup(React.createElement(AINotificationCenter, { center: denied }));
    assert.match(html, /Accesso negato/);
    assert.doesNotMatch(html, /client\.notification/);
    assert.doesNotMatch(html, /Fonte e criterio|href=/);
  });

  test("loading, errore e vuoto restano distinti", () => {
    const empty = { audience: "cliente", access: "allowed", authorizedCount: 0, notifications: [] };
    const loading = renderToStaticMarkup(React.createElement(AINotificationCenter, { center: empty, loading: true }));
    const error = renderToStaticMarkup(React.createElement(AINotificationCenter, { center: empty, error: "Errore" }));
    const zero = renderToStaticMarkup(React.createElement(AINotificationCenter, { center: empty }));
    assert.match(loading, /aria-busy="true"/);
    assert.match(error, /Fonte non disponibile/);
    assert.match(zero, /Nessuna notifica per questo filtro/);
  });

  test("Centro Admin usa esclusivamente elementi gia approvati", () => {
    const insights = buildAdminDashboardInsights({ sources: { campaigns: ready([]), sessions: ready([]), gpsPoints: ready([]), proofPhotos: ready([]), waitlist: ready([]), activities: ready([]) }, snapshot: { activeCampaigns: 1, completedCampaigns: 0, lateCampaigns: 1, liveSessions: 0, operatorStatus: "0/1", onlineOperators: 0, offlineOperators: 1, pendingCampaigns: 0, activeClients: 1, pendingRequests: 0, totalRevenue: 0, avgCpm: 0, alarmCount: 2, opsProblems: 0, lastUpdate: "2026-07-20T11:58:00Z" }, now });
    const decisions = buildAdminDecisionItems({ insights, context: { authorized: true, role: "admin" }, now });
    const center = buildAdminNotifications({ decisionCenter: decisions, context: { authorized: true, role: "admin" }, now });
    const html = renderToStaticMarkup(React.createElement(AINotificationCenter, { center }));
    assert.match(html, /admin\.notification\.admin\.home\.attention\.late_campaigns/);
    assert.match(html, />admin</);
    assert.doesNotMatch(html, /client\.notification/);
  });

  test("landing dichiara maturita senza presentare routing e LLM come disponibili", () => {
    const html = renderToStaticMarkup(React.createElement(VolantiniProAIHub));
    assert.match(html, /✅.*Disponibile/);
    assert.match(html, /🟡.*In sviluppo/);
    assert.match(html, /🔵.*Roadmap/);
    assert.match(html, /Centro Notifiche UI consultivo/);
    assert.match(html, /Centro Notifiche persistente/);
    assert.match(html, /Routing intelligente avanzato/);
    assert.ok(html.indexOf("Routing intelligente avanzato") > html.indexOf("Roadmap"));
    assert.doesNotMatch(html, /ottimizzazione garantita|automazione completa|eliminazione totale/i);
  });
} finally { await vite.close(); }

console.log(`AI notification render tests: ${passed} passed`);
