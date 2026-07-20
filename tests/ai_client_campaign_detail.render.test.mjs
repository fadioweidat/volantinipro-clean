import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { ClientCampaignDetailAI } = await vite.ssrLoadModule("/src/components/ai/client/ClientCampaignDetailAI.jsx");
  const { ClientTrackingAI } = await vite.ssrLoadModule("/src/components/ai/client/ClientTrackingAI.jsx");
  const { buildClientCampaignInsights, projectClientCampaignSourceData } = await vite.ssrLoadModule("/src/lib/ai/buildClientCampaignInsights.js");
  const campaign = { stato: "in_distribuzione", quantita: 10000, comuni_selezionati: ["Varedo"], copertura_pct: 91 };
  const ready = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000 });
  const insights = buildClientCampaignInsights({ sources: { campaign: ready(projectClientCampaignSourceData(campaign)), gpsPoints: ready([]), approvedPhotos: ready([]), coverageMetrics: ready({ coveragePercent: 0, inputs: ["existingCoverage"], assumptions: [] }) }, context: { campaignId: "campaign-1", ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now: new Date("2026-07-20T12:00:00Z") });

  test("dettaglio rende insight e sole domande guidate", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignDetailAI, { insights }));
    assert.match(html, /Riepilogo AI della campagna/);
    assert.match(html, /Proprietà verificata/);
    assert.match(html, /Qual è lo stato di questa campagna/);
    assert.match(html, /aria-pressed="false"/);
    assert.doesNotMatch(html, /<textarea|<input|contenteditable/);
  });

  test("tracking rende solo quattro KPI autorizzati e nessuna coordinata", () => {
    const html = renderToStaticMarkup(React.createElement(ClientTrackingAI, { insights }));
    assert.match(html, /Tracking spiegato dai dati disponibili/);
    assert.equal((html.match(/ai-insight-card ai-insight-card--standard/g) || []).length, 4);
    assert.doesNotMatch(html, /latitude|longitude|45\.4|9\.1/);
  });

  test("zero viene mostrato come valore disponibile", () => {
    const html = renderToStaticMarkup(React.createElement(ClientTrackingAI, { insights }));
    assert.match(html, /ai-insight-card__value">0/);
    assert.doesNotMatch(html, /nessun fallback numerico/);
  });

  test("loading ed errore non producono conclusioni", () => {
    const loading = renderToStaticMarkup(React.createElement(ClientCampaignDetailAI, { insights, loading: true }));
    const error = renderToStaticMarkup(React.createElement(ClientCampaignDetailAI, { insights, error: "Errore" }));
    assert.match(loading, /Caricamento insight campagna/);
    assert.match(error, /Nessuna conclusione viene prodotta/);
  });
} finally {
  await vite.close();
}

console.log(`AI client campaign detail render tests: ${passed} passed`);
