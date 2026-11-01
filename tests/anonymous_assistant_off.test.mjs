import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("ai-core refuses anonymous chat and report before any model call", () => {
  const source = read("supabase/functions/ai-core/index.ts");
  assert.match(source, /const ANONYMOUS_AI_ENABLED = false;/);
  const route = source.slice(source.indexOf("async function routeAiRequest("));
  const gate = route.indexOf('error: "AI_ANONYMOUS_DISABLED"');
  assert.ok(gate > route.indexOf("await getAuthedUser(req)"));
  assert.ok(gate < route.indexOf("handleQuoteStep("));
  assert.ok(gate < route.indexOf("handleTerritorialReport("));
  assert.match(route, /QUOTE_CONTEXT_TYPES\.has\(contextType\) \|\| contextType === "territorial_report"/);
});

test("drivers, customers and admins keep the assistant", () => {
  const route = read("supabase/functions/ai-core/index.ts");
  const line = route.split("\n").find((row) => row.includes("!ANONYMOUS_AI_ENABLED && !user"));
  assert.doesNotMatch(line, /driver_assignment|customer_dashboard|admin_dashboard|supplier_dashboard/);
});

test("the public site shows contacts to visitors and the assistant to logged users", () => {
  const routes = read("src/app/PublicRoutes.jsx");
  assert.match(routes, /isConfiguratorStep && !assistantAllowed && <PublicContactBox \/>/);
  const box = read("src/components/common/PublicContactBox.jsx");
  assert.match(box, /Hai domande\? Scrivici/);
  assert.match(box, /WhatsApp/);
  assert.match(box, /Email/);
  assert.doesNotMatch(box, /functions\.invoke|ai-core/);
  assert.match(read("src/ai/assistantAccess.js"), /export const ANONYMOUS_AI_ENABLED = false;/);
});

test("the report does not call the AI for visitors, the chat sends the customer session", () => {
  const report = read("src/pages/TerritorialReport.jsx");
  assert.ok(report.indexOf("canUseAssistant()") < report.indexOf("await runTerritorialReport("));
  const adapter = read("src/ai/adapters/quoteAssistantAdapter.js");
  assert.ok(adapter.indexOf("await ensureSupabaseSessionBridge()") < adapter.indexOf('functions.invoke("ai-core"'));
});
