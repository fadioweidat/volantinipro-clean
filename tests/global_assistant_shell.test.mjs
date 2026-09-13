import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  ASSISTANT_ROLES,
  CONFIGURATOR_STEP_ROUTES,
  getAssistantRouteConfig,
  isAssistantEnabledForRoute,
} from "../src/components/ai/global/assistantRouteRegistry.js";
import {
  buildQuoteAssistantBaseContext,
  buildQuoteAssistantStep2Context,
  buildQuoteAssistantStep4Context,
  generateClientStep2Answer,
  generateStep2QuickQuestions,
  quickQuestionsForPage,
} from "../src/ai/context/buildQuoteAssistantContext.js";

function read(relPath) {
  return fs.readFileSync(relPath, "utf8");
}

test("A-D. Step 1, Step 2, Step 3, Step 4 render assistant in registry", () => {
  for (const step of ["step1", "step2", "step3", "step4"]) {
    const config = getAssistantRouteConfig(step);
    assert.equal(config.enabled, true, `${step} must be enabled`);
    assert.equal(config.role, ASSISTANT_ROLES.GUEST, `${step} role must be guest`);
    assert.equal(isAssistantEnabledForRoute(step), true, `${step} isAssistantEnabledForRoute must be true`);
    assert.match(config.eyebrow, new RegExp(`Step ${step.replace("step", "")}`));
    assert.equal(config.title, "Assistente VolantiniPro");
    assert.ok(config.subtitle.length > 0);
  }
});

test("E. Same floating trigger works and preserves UX styling and accessibility", () => {
  const triggerSrc = read("src/components/ai/global/VolantiniProAssistantTrigger.jsx");
  assert.match(triggerSrc, /position:\s*"fixed"/);
  assert.match(triggerSrc, /Hai bisogno di aiuto\?/);
  assert.match(triggerSrc, /Chiedi all’assistente VolantiniPro/);
  assert.match(triggerSrc, /aria-expanded/);
  assert.match(triggerSrc, /aria-controls/);
  assert.match(triggerSrc, /#E8571A/); // Orange badge color
});

test("F. Drawer opens/closes correctly, manages focus, escape listener, and mobile overflow", () => {
  const drawerSrc = read("src/components/ai/global/VolantiniProAssistantDrawer.jsx");
  assert.match(drawerSrc, /if \(!open\) return null;/);
  assert.match(drawerSrc, /quote-ai__backdrop/);
  assert.match(drawerSrc, /role="dialog"/);
  assert.match(drawerSrc, /aria-modal="true"/);
  assert.match(drawerSrc, /aria-labelledby="quote-ai-title"/);
  assert.match(drawerSrc, /closeOnEscape/);
  assert.match(drawerSrc, /overflow = "hidden"/);
  assert.match(drawerSrc, /inputRef\.current\?\.focus\(\)/);
  assert.match(drawerSrc, /onClick=\{onClose\}/);
});

test("G. Existing quote context reaches adapter unchanged via QuoteAssistantPanel", () => {
  const panelSrc = read("src/components/ai/quote/QuoteAssistantPanel.jsx");
  assert.match(panelSrc, /import VolantiniProAssistantDrawer/);
  assert.match(panelSrc, /runQuoteAssistant\(\{ contextType: `step\$\{step\}`, snapshot: context, question \}\)/);
  assert.match(panelSrc, /QuoteStep2ContextCard/);
  assert.match(panelSrc, /Dati che sto leggendo/);
  assert.match(panelSrc, /HUMAN_REQUEST/);

  // Test that context builder for Step 2 remains robust
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Milano", mode: "nil", modeLabel: "NIL", selectedNames: ["Bruzzano"] },
    quantity: { inserted: 8000, current: 8000, recommended: 6840 },
    metrics: { residentialCoveragePct: 100, families: 6840 },
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { cityName: "Milano", qty: 8000 });
  assert.equal(context.comune, "Milano");
  assert.equal(context.quantitaInserita, 8000);
  assert.equal(context.famiglie, 6840);
  assert.equal(context.coveragePct, 100);
});

test("H. Existing deterministic answers still work", () => {
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Cormano", mode: "comune", modeLabel: "Comune", selectedNames: ["Cormano"] },
    quantity: { inserted: 10000, current: 10000, recommended: 22000, shortage: 12000 },
    metrics: { residentialCoveragePct: 45, families: 22000 },
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { cityName: "Cormano", qty: 10000 });
  const directAnswer = generateClientStep2Answer("Quanto copro con questa quantità?", context);
  assert.match(directAnswer, /10\.000/);
  assert.match(directAnswer, /45%/);
  assert.match(directAnswer, /Cormano/);

  const humanAnswer = generateClientStep2Answer("Vorrei parlare con un operatore umano", context);
  assert.match(humanAnswer, /\+39 351 767 3737/);
  assert.match(humanAnswer, /info@volantinipro\.it/);
});

test("I. Existing ai-core request shape unchanged", () => {
  const adapterSrc = read("src/ai/adapters/quoteAssistantAdapter.js");
  assert.match(adapterSrc, /supabase\.functions\.invoke\("ai-core",\s*\{/);
  assert.match(adapterSrc, /body:\s*\{\s*contextType,\s*snapshot,\s*question:\s*normalizedQuestion\s*\}/);
  assert.match(adapterSrc, /VALID_CONTEXT_TYPES = new Set\(\["step1", "step2", "step3", "step4"\]\)/);
});

test("J. No assistant leaks onto forbidden routes unexpectedly", () => {
  const forbiddenRoutes = [
    "home",
    "privacy",
    "terms",
    "cookie",
    "quick",
    "consultant",
    "feasibility",
    "feasibility-library",
    "preventivo",
    "milano-landing",
    "supplier-landing",
    "dashboard",
    "admin",
    "admin-live",
    "admin-operations",
    "supplier-dashboard",
    "driver/assignment/123",
  ];

  for (const route of forbiddenRoutes) {
    const config = getAssistantRouteConfig(route);
    assert.equal(config.enabled, false, `Route "${route}" must NOT have assistant enabled in Phase 1`);
    assert.equal(isAssistantEnabledForRoute(route), false, `isAssistantEnabledForRoute("${route}") must be false`);
  }
});

test("K. No duplicate floating trigger", () => {
  const publicRoutesSrc = read("src/app/PublicRoutes.jsx");
  const inlineTriggerCount = (publicRoutesSrc.match(/<InlineHelpCta/g) || []).length;
  const assistantTriggerCount = (publicRoutesSrc.match(/<VolantiniProAssistantTrigger/g) || []).length;
  // Total triggers in PublicRoutes must be exactly 1
  assert.equal(inlineTriggerCount + assistantTriggerCount, 1);
});

test("L. No duplicate panel instance", () => {
  const publicRoutesSrc = read("src/app/PublicRoutes.jsx");
  const quotePanelCount = (publicRoutesSrc.match(/<QuoteAssistantPanel/g) || []).length;
  const drawerCount = (publicRoutesSrc.match(/<VolantiniProAssistantDrawer/g) || []).length;
  // Exactly 1 panel mounted in PublicRoutes
  assert.equal(quotePanelCount + drawerCount, 1);
});
