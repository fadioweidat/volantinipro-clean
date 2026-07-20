import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { ClientCampaignReportAI } = await vite.ssrLoadModule("/src/components/ai/client/ClientCampaignReportAI.jsx");
  const { buildClientCampaignReportInsights, projectClientCampaignReportSourceData } = await vite.ssrLoadModule("/src/lib/ai/buildClientCampaignReportInsights.js");
  const { buildClientHistoricalSuggestions } = await vite.ssrLoadModule("/src/lib/ai/buildClientHistoricalSuggestions.js");
  const campaign = { id: "current", stato: "completata", servizio: "d2d", quantita: 10000, volantini_distribuiti: 9800, comuni_selezionati: ["Varedo"], copertura_pct: 91, copertura_rilevata_pct: 83, data_fine: "2026-07-19", gps_punti: [], foto_proof: [] };
  const historical = { ...campaign, id: "history", quantita: 9000, copertura_rilevata_pct: 80 };
  const ready = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000 });
  const projected = projectClientCampaignReportSourceData(campaign);
  const reportInsights = buildClientCampaignReportInsights({ sources: { campaign: ready(projected), gpsPoints: ready([]), approvedPhotos: ready([]), finalCoverage: ready(83) }, context: { ownershipConfirmed: true, approvedOnly: true, campaignId: campaign.id }, now: new Date("2026-07-20T12:00:00Z") });
  const historicalSuggestions = buildClientHistoricalSuggestions({ currentCampaign: campaign, sources: { history: ready([historical]) }, context: { ownershipConfirmed: true, historyOwnershipConfirmed: true }, now: new Date("2026-07-20T12:00:00Z") });

  test("report rende dati finali, storico e sole domande guidate", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignReportAI, { reportInsights, historicalSuggestions }));
    assert.match(html, /Lettura AI del risultato/);
    assert.match(html, /Migliora la prossima campagna/);
    assert.match(html, /Criteri di comparabilita/);
    assert.match(html, /Come e andata questa campagna/);
    assert.doesNotMatch(html, /<textarea|<input|contenteditable/);
  });

  test("fonte, categoria e freshness sono consultabili", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignReportAI, { reportInsights, historicalSuggestions }));
    assert.match(html, /DATO REALE/);
    assert.match(html, /DATO DERIVATO/);
    assert.match(html, /STIMA/);
    assert.match(html, /Fonte e criterio/);
    assert.match(html, /Dato aggiornato/);
  });

  test("loading ed errore non producono conclusioni", () => {
    const loading = renderToStaticMarkup(React.createElement(ClientCampaignReportAI, { reportInsights, historicalSuggestions, loading: true }));
    const error = renderToStaticMarkup(React.createElement(ClientCampaignReportAI, { reportInsights, historicalSuggestions, error: "Errore" }));
    assert.match(loading, /Caricamento lettura AI report/);
    assert.match(error, /Nessuna conclusione viene prodotta/);
    assert.match(error, /Nessun suggerimento viene prodotto/);
  });

  test("accesso negato non mostra valori protetti", () => {
    const deniedReport = buildClientCampaignReportInsights({ sources: {}, context: { ownershipConfirmed: false }, now: new Date("2026-07-20T12:00:00Z") });
    const deniedHistory = buildClientHistoricalSuggestions({ currentCampaign: campaign, sources: {}, context: { ownershipConfirmed: false, historyOwnershipConfirmed: false }, now: new Date("2026-07-20T12:00:00Z") });
    const html = renderToStaticMarkup(React.createElement(ClientCampaignReportAI, { reportInsights: deniedReport, historicalSuggestions: deniedHistory }));
    assert.match(html, /Accesso non verificato/);
    assert.match(html, /Accesso negato/);
    assert.doesNotMatch(html, />9\.800</);
    assert.doesNotMatch(html, />83</);
  });
} finally {
  await vite.close();
}

console.log(`AI client campaign report render tests: ${passed} passed`);
