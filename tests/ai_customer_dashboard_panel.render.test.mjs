import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const { default: CustomerAiAssistantPanel } = await vite.ssrLoadModule("/src/components/ai/customer/CustomerAiAssistantPanel.jsx");
  const html = renderToStaticMarkup(React.createElement(CustomerAiAssistantPanel, { session: null, customer: null, campaigns: [] }));
  test("pannello discreto chiuso con titolo e controllo accessibile", () => {
    assert.match(html, /Assistente VolantiniPro/);
    assert.match(html, /CentralAiAgent/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /Apri assistente/);
  });
  test("da chiuso non altera la dashboard con form o cronologia", () => {
    assert.doesNotMatch(html, /id="customer-central-ai-message"/);
    assert.doesNotMatch(html, /Cronologia Assistente VolantiniPro/);
  });
} finally {
  await vite.close();
}

console.log(`AI Customer Dashboard panel render tests: ${passed} passed`);
