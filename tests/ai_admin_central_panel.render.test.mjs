import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
try {
  const { default: AdminCentralAiPanel } = await vite.ssrLoadModule("/src/components/ai/admin/AdminCentralAiPanel.jsx");
  const html = renderToStaticMarkup(React.createElement(AdminCentralAiPanel, { adminIdentity: { user: { id: "admin-1", email: "admin@test.local" }, role: "admin" }, campaigns: [], availability: {} }));
  test("pannello Admin discreto e accessibile da chiuso", () => {
    assert.match(html, /Assistente Operativo VolantiniPro/); assert.match(html, /CentralAiAgent/); assert.match(html, /aria-expanded="false"/); assert.match(html, /Apri assistente/);
  });
  test("da chiuso non monta form o cronologia", () => {
    assert.doesNotMatch(html, /id="admin-central-ai-message"/); assert.doesNotMatch(html, /Cronologia Assistente Operativo/);
  });
} finally { await vite.close(); }
console.log(`AI Admin Central panel render tests: ${passed} passed`);
