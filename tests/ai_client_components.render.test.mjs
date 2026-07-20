import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { AIInsightCard } = await vite.ssrLoadModule("/src/components/ai/AIInsightCard.jsx");
  const { ClientCampaignBrief } = await vite.ssrLoadModule("/src/components/ai/client/ClientCampaignBrief.jsx");
  const { createAiDatum, createUnavailableAiDatum, AI_AUDIENCES, AI_DATA_CATEGORIES, AI_DATUM_KINDS, AI_UNAVAILABLE_CODES, AI_VALUE_TYPES } = await vite.ssrLoadModule("/src/lib/ai/insight-contract.js");
  const { AI_SOURCE_IDS } = await vite.ssrLoadModule("/src/lib/ai/source-labels.js");
  const now = new Date("2026-07-20T12:00:00Z");
  const available = createAiDatum({ id: "render.zero", kind: AI_DATUM_KINDS.KPI, label: "Campagne attive", category: AI_DATA_CATEGORIES.DERIVED, value: 0, valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sources: [AI_SOURCE_IDS.LEGACY_CAMPAIGNS], observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000, derivation: { criterion: "Conteggio test.", formula: "rows.length", inputs: ["rows"] }, permission: { audience: AI_AUDIENCES.CLIENT, allowed: true } }, { now });
  const denied = createUnavailableAiDatum({ id: "render.denied", kind: AI_DATUM_KINDS.KPI, label: "Totale speso", valueType: AI_VALUE_TYPES.CURRENCY, sources: [AI_SOURCE_IDS.LEGACY_CAMPAIGNS], permission: { audience: AI_AUDIENCES.CLIENT, allowed: false, reason: "Campagna non autorizzata." }, unavailableCode: AI_UNAVAILABLE_CODES.ACCESS_DENIED, unavailableReason: "Campagna non autorizzata." }, { now });
  const missing = createUnavailableAiDatum({ id: "render.missing", kind: AI_DATUM_KINDS.KPI, label: "Ultimo aggiornamento", valueType: AI_VALUE_TYPES.DATE, sources: [AI_SOURCE_IDS.LEGACY_CAMPAIGNS], permission: { audience: AI_AUDIENCES.CLIENT, allowed: true }, unavailableCode: AI_UNAVAILABLE_CODES.MISSING, unavailableReason: "Timestamp non presente." }, { now });

  test("card rende zero, categoria, freshness e controllo fonte", () => {
    const html = renderToStaticMarkup(React.createElement(AIInsightCard, { datum: available }));
    assert.match(html, /ai-insight-card__value">0</);
    assert.match(html, /DATO DERIVATO/);
    assert.match(html, /Dato aggiornato/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /Fonte e criterio/);
  });

  test("card accesso negato non rende il valore protetto", () => {
    const html = renderToStaticMarkup(React.createElement(AIInsightCard, { datum: denied }));
    assert.match(html, /Non disponibile/);
    assert.match(html, /Accesso negato/);
    assert.doesNotMatch(html, />10</);
  });

  test("loading espone aria-busy e skeleton", () => {
    const html = renderToStaticMarkup(React.createElement(AIInsightCard, { loading: true }));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Caricamento dato/);
  });

  test("brief errore non genera conclusioni e mantiene accesso guidato", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignBrief, { items: [], attention: [], error: "Errore" }));
    assert.match(html, /Dati non caricati/);
    assert.match(html, /Nessuna conclusione generata/);
    assert.match(html, /Assistente Campagna AI/);
    assert.match(html, /Nessuna chat libera/);
    assert.doesNotMatch(html, /<textarea/);
  });

  test("brief distingue visivamente disponibile e non disponibile", () => {
    const html = renderToStaticMarkup(React.createElement(ClientCampaignBrief, { items: [available, denied, missing], attention: [] }));
    assert.match(html, /DATO DERIVATO/);
    assert.match(html, /NON DISPONIBILE/);
    assert.match(html, /Timestamp non presente/);
    assert.match(html, /nessun valore sostitutivo/);
  });

  test("brief espone stati vuoto e loading senza conclusioni", () => {
    const emptyHtml = renderToStaticMarkup(React.createElement(ClientCampaignBrief, { items: [], attention: [] }));
    const loadingHtml = renderToStaticMarkup(React.createElement(ClientCampaignBrief, { loading: true }));
    assert.match(emptyHtml, /Nessun dato da mostrare/);
    assert.match(loadingHtml, /Caricamento KPI Cliente/);
    assert.match(loadingHtml, /Nessuna conclusione generata/);
  });
} finally {
  await vite.close();
}

console.log(`AI client component render tests: ${passed} passed`);
