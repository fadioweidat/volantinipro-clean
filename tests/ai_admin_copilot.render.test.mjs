import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const ready = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000 });

try {
  const { AdminOperationalCopilot } = await vite.ssrLoadModule("/src/components/ai/admin/AdminOperationalCopilot.jsx");
  const { AdminCopilotAnswer } = await vite.ssrLoadModule("/src/components/ai/admin/AdminCopilotAnswer.jsx");
  const { buildAdminDashboardInsights } = await vite.ssrLoadModule("/src/lib/ai/buildAdminInsights.js");
  const { buildAdminCopilotResponses, ADMIN_COPILOT_QUESTION_IDS } = await vite.ssrLoadModule("/src/lib/ai/buildAdminCopilotResponses.js");
  const sources = { campaigns: ready([{}]), sessions: ready([{}]), gpsPoints: ready([{}]), proofPhotos: ready([{}]), waitlist: ready([{}]), activities: ready([{}]) };
  const snapshot = { activeCampaigns: 3, completedCampaigns: 2, lateCampaigns: 1, liveSessions: 4, operatorStatus: "5/2", onlineOperators: 5, offlineOperators: 2, pendingCampaigns: 1, activeClients: 4, pendingRequests: 2, totalRevenue: 1520.5, avgCpm: 48.25, alarmCount: 6, opsProblems: 3, lastUpdate: "2026-07-20T11:55:00Z" };
  const insights = buildAdminDashboardInsights({ sources, snapshot, now: new Date("2026-07-20T12:00:00Z") });
  const copilot = buildAdminCopilotResponses({ insights });

  test("rende solo domande guidate senza campo di testo", () => {
    const html = renderToStaticMarkup(React.createElement(AdminOperationalCopilot, { insights }));
    assert.match(html, /Copilota Operativo AI/);
    assert.match(html, /Quali elementi richiedono attenzione/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /Nessuna chat libera/);
    assert.doesNotMatch(html, /<textarea|<input/);
  });

  test("espone regione live e stato iniziale accessibili", () => {
    const html = renderToStaticMarkup(React.createElement(AdminOperationalCopilot, { insights }));
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Scegli una domanda guidata/);
    assert.match(html, /Guidato · deterministico · sola lettura/);
  });

  test("risposta rende categoria, freshness, fonte e link approvato", () => {
    const response = copilot.responses[ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS];
    const html = renderToStaticMarkup(React.createElement(AdminCopilotAnswer, { response, id: "answer" }));
    assert.match(html, /DATO DERIVATO/);
    assert.match(html, /Dato aggiornato/);
    assert.match(html, /Fonte e criterio/);
    assert.match(html, /href="#campagne-attive"/);
    assert.match(html, /Il conteggio non espone nomi o cause/);
  });

  test("durante loading disabilita le domande", () => {
    const html = renderToStaticMarkup(React.createElement(AdminOperationalCopilot, { insights, loading: true }));
    assert.match(html, /disabled=""/);
  });
} finally {
  await vite.close();
}

console.log(`AI admin copilot render tests: ${passed} passed`);
