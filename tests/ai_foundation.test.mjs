import assert from "node:assert/strict";
import {
  AI_DATA_SCOPES,
  AI_PAGES,
  AI_ROLES,
  AI_TOOL_NAMES,
  AiIdentityResolver,
  AiPageResolver,
  AiPermissionPolicy,
  AiStateManager,
  AiToolRegistry,
  SAFE_UNAVAILABLE,
  createAiFoundation,
} from "../src/ai-foundation/index.js";

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }
const fixedNow = () => new Date("2026-07-26T10:00:00.000Z");

await test("riconosce Visitatore, Cliente, Fornitore e Admin senza fidarsi del pathname", () => {
  const resolver = new AiIdentityResolver();
  assert.equal(resolver.resolve().role, AI_ROLES.VISITOR);
  assert.equal(resolver.resolve({ authUser: { id: "c1" }, profile: { role: "cliente" } }).role, AI_ROLES.CLIENT);
  assert.equal(resolver.resolve({ authUser: { id: "s1" }, profile: { role: "supplier" } }).role, AI_ROLES.SUPPLIER);
  assert.equal(resolver.resolve({ authUser: { id: "a1" }, profile: { role: "super_admin" } }).role, AI_ROLES.ADMIN);
  assert.equal(resolver.resolve({ authUser: { id: "x" }, profile: { role: "sconosciuto" } }).role, AI_ROLES.VISITOR);
});

await test("riconosce tutti i contesti pagina richiesti senza intervenire sul router", () => {
  const resolver = new AiPageResolver();
  const cases = [
    ["/", AI_PAGES.HOMEPAGE], ["/configuratore?step=1", AI_PAGES.GUIDED_QUOTE],
    ["/zona", AI_PAGES.GUIDED_QUOTE], ["/preventivo-rapido", AI_PAGES.QUICK_QUOTE],
    ["/consulente", AI_PAGES.CONSULTING], ["/dashboard", AI_PAGES.CLIENT_DASHBOARD],
    ["/fornitore/lavori", AI_PAGES.SUPPLIER_DASHBOARD], ["/admin", AI_PAGES.ADMIN_DASHBOARD],
    ["/admin/campaigns/c1/gps", AI_PAGES.GPS], ["/campagna/c1/report", AI_PAGES.REPORT],
    ["/profilo", AI_PAGES.PROFILE],
  ];
  for (const [path, expected] of cases) assert.equal(resolver.resolve(path), expected, path);
});

await test("mantiene campagna, preventivo e cronologia oltre dieci messaggi", () => {
  const manager = new AiStateManager({ now: fixedNow, historyLimit: 100 });
  const user = { id: "c1", email: "c@example.it", role: AI_ROLES.CLIENT, authenticated: true };
  manager.initialize({ sessionId: "session-1", user, page: AI_PAGES.GUIDED_QUOTE, activeCampaign: { flyerQuantity: 20_000 }, activeQuote: { id: "q1" } });
  manager.appendMessage("session-1", "user", "Voglio distribuire 20.000 volantini");
  for (let index = 0; index < 10; index += 1) manager.appendMessage("session-1", "assistant", `Messaggio ${index + 1}`);
  manager.initialize({ sessionId: "session-1", user, page: AI_PAGES.REPORT });
  const state = manager.snapshot("session-1");
  assert.equal(state.activeCampaign.flyerQuantity, 20_000);
  assert.equal(state.activeQuote.id, "q1");
  assert.equal(state.history[0].content, "Voglio distribuire 20.000 volantini");
  assert.equal(state.history.length, 11);
});

await test("cambio identita sulla stessa sessione elimina il contesto precedente", () => {
  const manager = new AiStateManager({ now: fixedNow });
  manager.initialize({ sessionId: "shared", user: { id: "c1", role: AI_ROLES.CLIENT, authenticated: true }, page: AI_PAGES.CLIENT_DASHBOARD, activeCampaign: { id: "private" } });
  manager.appendMessage("shared", "user", "dato privato");
  const reset = manager.initialize({ sessionId: "shared", user: { id: "c2", role: AI_ROLES.CLIENT, authenticated: true }, page: AI_PAGES.CLIENT_DASHBOARD });
  assert.equal(reset.activeCampaign, null);
  assert.deepEqual(reset.history, []);
});

await test("lo snapshot non consente al runtime di elevare il ruolo", () => {
  const manager = new AiStateManager({ now: fixedNow });
  manager.initialize({ sessionId: "immutable", user: { id: "c1", role: AI_ROLES.CLIENT, authenticated: true }, page: AI_PAGES.CLIENT_DASHBOARD });
  const state = manager.snapshot("immutable");
  assert.equal(Object.isFrozen(state.currentUser), true);
  assert.throws(() => { state.currentUser.role = AI_ROLES.ADMIN; }, TypeError);
  assert.equal(manager.snapshot("immutable").role, AI_ROLES.CLIENT);
});

await test("policy isola Cliente, Fornitore, Admin e Visitatore", () => {
  const policy = new AiPermissionPolicy();
  const visitor = { id: null, role: AI_ROLES.VISITOR, authenticated: false };
  const client = { id: "auth-c1", customerId: "c1", role: AI_ROLES.CLIENT, authenticated: true };
  const supplier = { id: "s1", role: AI_ROLES.SUPPLIER, authenticated: true };
  const admin = { id: "a1", role: AI_ROLES.ADMIN, authenticated: true };
  assert.equal(policy.authorize(visitor, AI_DATA_SCOPES.PUBLIC).allowed, true);
  assert.equal(policy.authorize(visitor, AI_DATA_SCOPES.CUSTOMER).allowed, false);
  assert.equal(policy.authorize(client, AI_DATA_SCOPES.CUSTOMER).scope.customerId, "c1");
  assert.equal(policy.authorize(client, AI_DATA_SCOPES.ASSIGNED_JOBS).allowed, false);
  assert.deepEqual(policy.authorize(supplier, AI_DATA_SCOPES.ASSIGNED_JOBS).scope, { kind: AI_DATA_SCOPES.ASSIGNED_JOBS, supplierId: "s1", assignedOnly: true });
  assert.equal(policy.authorize(supplier, AI_DATA_SCOPES.CUSTOMER).allowed, false);
  assert.equal(policy.authorize(admin, AI_DATA_SCOPES.ADMIN).scope.unrestricted, true);
});

await test("il registry deriva lo scope dall'identita e ignora ownerId suggeriti dal modello", async () => {
  const registry = new AiToolRegistry({ permissionPolicy: new AiPermissionPolicy() });
  let received;
  registry.register(AI_TOOL_NAMES.CAMPAIGN, { async execute(input) { received = input; return { campaigns: [] }; } });
  const result = await registry.execute({ id: "call-1", name: AI_TOOL_NAMES.CAMPAIGN, arguments: { customerId: "victim" } }, { id: "auth-c1", customerId: "c1", role: AI_ROLES.CLIENT, authenticated: true });
  assert.equal(result.status, "success");
  assert.equal(received.scope.customerId, "c1");
  assert.equal(received.arguments.customerId, "victim");
});

await test("inizializza un solo Agent e risponde soltanto con evidenze tool valide", async () => {
  const runtime = {
    async plan() { return { requiresData: true, toolCalls: [{ id: "gps-1", name: AI_TOOL_NAMES.GPS, arguments: { campaignId: "cmp-1" } }] }; },
    async respond({ toolResults }) { return { text: `Punti reali: ${toolResults[0].data.points}`, citations: ["gps-1"], sources: [AI_TOOL_NAMES.GPS], kind: "fact" }; },
  };
  const foundation = createAiFoundation({ runtime, now: fixedNow, toolAdapters: { [AI_TOOL_NAMES.GPS]: { async execute({ scope }) { assert.equal(scope.customerId, "c1"); return { points: 12 }; } } } });
  const response = await foundation.agent.reply({ sessionId: "agent-1", authUser: { id: "auth-c1", email: "c@example.it" }, customerId: "c1", profile: { role: "cliente" }, location: "/customer/campaigns/cmp-1/tracking", message: "Quanti punti GPS ci sono?" });
  assert.equal(response.text, "Punti reali: 12");
  assert.deepEqual(response.citations, ["gps-1"]);
  assert.equal(response.state.role, AI_ROLES.CLIENT);
  assert.equal(response.state.page, AI_PAGES.GPS);
});

await test("senza tool collegato non inventa dati e non invoca la generazione finale", async () => {
  let responded = false;
  const runtime = {
    async plan() { return { requiresData: true, toolCalls: [{ id: "price-1", name: AI_TOOL_NAMES.PRICING }] }; },
    async respond() { responded = true; return { text: "100 euro", citations: [] }; },
  };
  const { agent } = createAiFoundation({ runtime, now: fixedNow });
  const response = await agent.reply({ sessionId: "agent-2", location: "/", message: "Quanto costa?" });
  assert.equal(response.text, SAFE_UNAVAILABLE);
  assert.equal(responded, false);
});

console.log(`AI Foundation tests: ${passed} passed`);
