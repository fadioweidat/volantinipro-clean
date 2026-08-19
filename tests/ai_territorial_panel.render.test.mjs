import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" }); let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
try {
  const { default: Panel, normalizeTerritorialIdentity } = await vite.ssrLoadModule("/src/components/ai/territory/TerritorialAiAssistantPanel.jsx");
  const snapshot = Object.freeze({ fingerprint: "territory-test", state: "partial", service: { key: "h2h" }, territory: {}, quantity: {}, metrics: {}, calculation: {}, missing: [], sources: [], limitations: [] });
  const html = renderToStaticMarkup(React.createElement(Panel, { snapshot }));
  test("pannello territoriale chiuso e accessibile", () => { assert.match(html, /Assistente Analisi Territoriale/); assert.match(html, /Territory Tool/); assert.match(html, /aria-expanded="false"/); assert.match(html, /Dati parziali/); });
  test("pannello distingue stati complete e missing", () => {
    assert.match(renderToStaticMarkup(React.createElement(Panel, { snapshot: { ...snapshot, state: "complete" } })), /Dati completi/);
    assert.match(renderToStaticMarkup(React.createElement(Panel, { snapshot: { ...snapshot, state: "missing" } })), /Dati mancanti/);
  });
  test("pannello chiuso non monta form o cronologia", () => { assert.doesNotMatch(html, /territorial-central-ai-message/); assert.doesNotMatch(html, /Cronologia Assistente/); });
  test("territorial_report accetta anonimo pubblico con sessione tecnica isolata", () => {
    const authenticated = normalizeTerritorialIdentity({ status: "authenticated", authUser: { id: "user-a", email: "a@example.test" }, profile: { role: "cliente" } }, "ctx-a");
    assert.equal(authenticated.enabled, true); assert.equal(authenticated.principalId, "user-a");
    const anonymous = normalizeTerritorialIdentity({ status: "signed_out" }, "ctx-a");
    assert.equal(anonymous.enabled, true); assert.equal(anonymous.role, "visitatore"); assert.match(anonymous.principalId, /^visitor:/);
    assert.equal(normalizeTerritorialIdentity({ status: "authenticated", authUser: { id: "user-a" }, profile: { role: "inventato" } }, "ctx-a").enabled, true);
    assert.equal(normalizeTerritorialIdentity({ status: "anonymous" }).enabled, false);
  });
} finally { await vite.close(); }
console.log(`AI Territorial panel render tests: ${passed} passed`);
