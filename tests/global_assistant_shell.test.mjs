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

// Politica di rollout per fasi: Phase 1 (5ed327f) aveva tutto disabilitato; Phase 2 (6b94244) ha attivato
// l'area cliente, Phase 3 l'admin dashboard, Phase 4 (fc9a1de) driver e fornitore. Questa tabella codifica la
// politica CORRENTE: le rotte abilitate hanno ruolo esplicito e allowAnonymous=false (tranne i passi guest
// del configuratore); tutte le rotte pubbliche/auth restano disabilitate.
test("J. Assistant route policy: enabled routes carry explicit role/auth metadata", () => {
  const R = ASSISTANT_ROLES;
  // [route, role, allowAnonymous, contextType]
  const enabledPolicy = [
    ["step1", R.GUEST, true, "step1"],
    ["step2", R.GUEST, true, "step2"],
    ["step3", R.GUEST, true, "step3"],
    ["step4", R.GUEST, true, "step4"],
    ["dashboard", R.CUSTOMER, false, "customer_dashboard"],
    ["campaign:abc", R.CUSTOMER, false, "customer_dashboard"],
    ["customer-tracking:abc", R.CUSTOMER, false, "customer_dashboard"],
    ["customer-report:abc", R.CUSTOMER, false, "customer_dashboard"],
    ["customer-payment:abc", R.CUSTOMER, false, "customer_dashboard"],
    ["admin", R.ADMIN, false, "admin_dashboard"],
    ["admin-live", R.ADMIN, false, "admin_dashboard"],
    ["admin-operations", R.ADMIN, false, "admin_dashboard"],
    ["admin-operations:abc", R.ADMIN, false, "admin_dashboard"],
    ["admin-clients-quotes", R.ADMIN, false, "admin_dashboard"],
    ["admin-assignments:abc", R.ADMIN, false, "admin_dashboard"],
    ["admin-gps:abc", R.ADMIN, false, "admin_dashboard"],
    ["admin-unknown-page", R.ADMIN, false, "admin_dashboard"],
    ["supplier-dashboard", R.SUPPLIER, false, "supplier_dashboard"],
    ["driver-assignment:123", R.DRIVER, false, "driver_assignment"],
    ["driver-map:123", R.DRIVER, false, "driver_assignment"],
  ];
  for (const [route, role, anon, ctx] of enabledPolicy) {
    const config = getAssistantRouteConfig(route);
    assert.equal(config.enabled, true, `Route "${route}" must be enabled`);
    assert.equal(isAssistantEnabledForRoute(route), true, `isAssistantEnabledForRoute("${route}") must be true`);
    assert.equal(config.role, role, `Route "${route}" role`);
    assert.equal(config.allowAnonymous, anon, `Route "${route}" allowAnonymous`);
    assert.equal(config.contextType, ctx, `Route "${route}" contextType`);
    // ogni rotta non-guest non deve mai consentire l'accesso anonimo
    if (role !== R.GUEST) assert.equal(config.allowAnonymous, false, `Route "${route}" must not allow anonymous`);
  }
});

test("J1. No assistant leaks onto public/auth/tracking routes", () => {
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
    "login",
    "auth",
    "step5",
    "not-found",
    "tracking",
    "campaign-tracking",
    "quote:slug",
    "q/slug",
    "adminx",
    "admin:",
    "driver/assignment/123",
    "",
  ];

  for (const route of forbiddenRoutes) {
    const config = getAssistantRouteConfig(route);
    assert.equal(config.enabled, false, `Route "${route}" must NOT have assistant enabled`);
    assert.equal(isAssistantEnabledForRoute(route), false, `isAssistantEnabledForRoute("${route}") must be false`);
    assert.equal(config.contextType, null, `Route "${route}" must have no assistant contextType`);
  }
});

test("J2. Privileged assistant hosts are mounted inside their auth guards", () => {
  const router = read("src/app/AppRouter.jsx");
  // Il guard piu' vicino aperto prima dell'host (tag esatto: <Guard seguito da spazio o >, non <GuardLoader)
  // non deve essere gia' chiuso prima dell'host e deve chiudersi dopo di esso.
  const insideGuard = (guard, host) => {
    const hostAt = router.indexOf(host);
    if (hostAt < 0) return false;
    const opens = [...router.matchAll(new RegExp(`<${guard}[\\s>]`, "g"))].map((m) => m.index).filter((i) => i < hostAt);
    if (opens.length === 0) return false;
    const openAt = opens[opens.length - 1];
    const closeTag = `</${guard}>`;
    const closedBefore = router.slice(openAt, hostAt).includes(closeTag);
    return !closedBefore && router.indexOf(closeTag, hostAt) > hostAt;
  };
  assert.equal((router.match(/<AdminAssistantHost/g) || []).length, 1);
  assert.equal((router.match(/<SupplierAssistantHost/g) || []).length, 1);
  assert.ok(insideGuard("AdminGuard", "<AdminAssistantHost"), "AdminAssistantHost must be inside AdminGuard");
  assert.ok(insideGuard("SupplierGuard", "<SupplierAssistantHost"), "SupplierAssistantHost must be inside SupplierGuard");
  // difesa in profondita': gli host verificano anche il ruolo della rotta
  assert.match(read("src/components/ai/admin/AdminAssistantHost.jsx"), /routeConfig\.role !== ASSISTANT_ROLES\.ADMIN/);
  assert.match(read("src/components/ai/customer/CustomerAssistantHost.jsx"), /routeConfig\.role !== ASSISTANT_ROLES\.CUSTOMER/);
});

// Corpo di una funzione TypeScript per bilanciamento delle graffe (le parentesi del tipo dei parametri,
// es. `{ id: string }`, precedono la graffa d'apertura del corpo ") {").
function functionBody(src, name) {
  const start = src.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const open = src.indexOf(") {", start) + 2;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  assert.fail(`${name} body not delimitable`);
}

test("J3. Server enforces authentication and authorization per assistant context, independent of the client route", () => {
  const core = read("supabase/functions/ai-core/index.ts");
  // contextType -> handler; l'autorizzazione avviene sul JWT/token lato server, non sulla rotta del client.
  const handlers = [
    ["customer_dashboard", "handleCustomerDashboard"],
    ["admin_dashboard", "handleAdminDashboard"],
    ["driver_assignment", "handleDriverAssignment"],
    ["supplier_dashboard", "handleSupplierDashboard"],
  ];
  for (const [contextType, handlerName] of handlers) {
    assert.match(core, new RegExp(`if \\(contextType === "${contextType}"\\) return await ${handlerName}\\(`), `${contextType} must dispatch to ${handlerName}`);
    const body = functionBody(core, handlerName);
    const authAt = body.indexOf('"AUTHENTICATION_REQUIRED"');
    const forbiddenAt = body.indexOf('"FORBIDDEN"');
    assert.ok(authAt >= 0, `${handlerName}: missing AUTHENTICATION_REQUIRED (401) for unauthenticated callers`);
    assert.ok(forbiddenAt > authAt, `${handlerName}: FORBIDDEN (403) must follow the authentication check`);
    assert.match(body, /401\)/, `${handlerName}: unauthenticated callers must get HTTP 401`);
    assert.match(body, /403\)/, `${handlerName}: unauthorized callers must get HTTP 403`);
  }
  // Admin: il 403 dipende dal ruolo del profilo, non da un valore fornito dal client.
  const admin = functionBody(core, "handleAdminDashboard");
  assert.ok(admin.indexOf("isAdminProfile(profile)") > admin.indexOf('"AUTHENTICATION_REQUIRED"'), "admin role check must come after authentication");
  assert.match(read("supabase/functions/_shared/aiAuthorization.ts"), /export function isAdminProfile\(profile: AiAuthProfile\): boolean \{\s*return profile\?\.role === "admin";/);
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
