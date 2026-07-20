import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { ClientCampaignAssistant } = await vite.ssrLoadModule("/src/components/ai/client/ClientCampaignAssistant.jsx");
  const { buildClientDashboardInsights } = await vite.ssrLoadModule("/src/lib/ai/buildClientInsights.js");
  const insights = buildClientDashboardInsights({
    now: new Date("2026-07-20T12:00:00Z"),
    context: { ownershipConfirmed: true },
    sources: { campaigns: { status: "ready", data: [], observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000 } },
  });

  test("rende solo domande guidate senza input libero", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignAssistant, { insights }));
    assert.match(html, /Assistente Campagna AI/);
    assert.match(html, /Quali campagne richiedono attenzione/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /Nessuna chat libera/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /<input/);
  });

  test("espone stato iniziale e regione live accessibile", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignAssistant, { insights }));
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Scegli una domanda guidata/);
    assert.match(html, /Guidato · deterministico · sola lettura/);
  });

  test("durante loading disabilita le domande senza creare risposte", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignAssistant, { insights, loading: true }));
    assert.match(html, /disabled=""/);
    assert.match(html, /Scegli una domanda guidata/);
  });
} finally {
  await vite.close();
}

console.log(`AI client assistant render tests: ${passed} passed`);
