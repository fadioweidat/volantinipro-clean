import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { AdminDecisionCenter } = await vite.ssrLoadModule("/src/components/ai/admin/AdminDecisionCenter.jsx");
  const { AdminOperationalCopilot } = await vite.ssrLoadModule("/src/components/ai/admin/AdminOperationalCopilot.jsx");
  const { buildAdminDashboardInsights } = await vite.ssrLoadModule("/src/lib/ai/buildAdminInsights.js");
  const { buildAdminDecisionItems } = await vite.ssrLoadModule("/src/lib/ai/buildAdminDecisionItems.js");
  const ready = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:58:00Z", staleAfterMs: 600_000 });
  const insights = buildAdminDashboardInsights({ sources: { campaigns: ready([]), sessions: ready([]), gpsPoints: ready([]), proofPhotos: ready([]), waitlist: ready([]), activities: ready([]) }, snapshot: { activeCampaigns: 1, completedCampaigns: 2, lateCampaigns: 1, liveSessions: 0, operatorStatus: "0/1", onlineOperators: 0, offlineOperators: 1, pendingCampaigns: 0, activeClients: 1, pendingRequests: 0, totalRevenue: 100, avgCpm: 10, alarmCount: 2, opsProblems: 0, lastUpdate: "2026-07-20T11:58:00Z" }, now: new Date("2026-07-20T12:00:00Z") });
  const center = buildAdminDecisionItems({ insights, context: { authorized: true, role: "admin" }, now: new Date("2026-07-20T12:00:00Z") });

  test("centro rende ID, livello, stato, fonti e spiegazione", () => {
    const html = renderToStaticMarkup(React.createElement(AdminDecisionCenter, { decisionCenter: center }));
    assert.match(html, /Centro Decisionale/);
    assert.match(html, /admin\.decision\.admin\.home\.attention\.late_campaigns/);
    assert.match(html, /intervento richiesto/);
    assert.match(html, /Stato: ready/);
    assert.match(html, /Fonte e criterio/);
    assert.match(html, /Perche compare qui/);
    assert.match(html, /Regola di ordinamento/);
  });

  test("centro espone solo link di navigazione", () => {
    const html = renderToStaticMarkup(React.createElement(AdminDecisionCenter, { decisionCenter: center }));
    assert.match(html, /href="#campagne-attive"/);
    assert.match(html, /href="\/admin\/live"/);
    assert.doesNotMatch(html, /onClick|Segna|Assegna|Conferma|type="submit"/);
    assert.equal((html.match(/<button/g) || []).length, (html.match(/ai-source__trigger/g) || []).length, "Sono ammessi soltanto i controlli di consultazione fonte.");
  });

  test("copilota riusa il pannello esistente con domande decisionali", () => {
    const html = renderToStaticMarkup(React.createElement(AdminOperationalCopilot, { insights, decisionCenter: center }));
    assert.match(html, /Quali elementi richiedono intervento/);
    assert.match(html, /Perche questo elemento e in alto/);
    assert.equal((html.match(/class="admin-ai-copilot__question"/g) || []).length, 12);
    assert.doesNotMatch(html, /<input|<textarea|contenteditable/);
  });

  test("diniego non rende elementi o collegamenti", () => {
    const denied = buildAdminDecisionItems({ insights, context: { authorized: false, role: "cliente" }, now: new Date("2026-07-20T12:00:00Z") });
    const html = renderToStaticMarkup(React.createElement(AdminDecisionCenter, { decisionCenter: denied }));
    assert.match(html, /Accesso negato/);
    assert.doesNotMatch(html, /admin\.decision\.admin\.home/);
    assert.doesNotMatch(html, /href=/);
  });

  test("loading ed errore hanno stati espliciti", () => {
    const loading = renderToStaticMarkup(React.createElement(AdminDecisionCenter, { decisionCenter: center, loading: true }));
    const error = renderToStaticMarkup(React.createElement(AdminDecisionCenter, { decisionCenter: center, error: "Errore" }));
    assert.match(loading, /aria-busy="true"/);
    assert.match(error, /sopprime i link relativi/);
  });
} finally { await vite.close(); }

console.log(`AI admin decision center render tests: ${passed} passed`);
