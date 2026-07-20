import assert from "node:assert/strict";
import { buildAdminDashboardInsights } from "../src/lib/ai/buildAdminInsights.js";
import { buildAdminCopilotResponses, ADMIN_COPILOT_QUESTION_IDS } from "../src/lib/ai/buildAdminCopilotResponses.js";

const now = new Date("2026-07-20T12:00:00Z");
const ready = (data, observedAt = "2026-07-20T11:55:00Z", staleAfterMs = 600_000) => ({ status: "ready", data, observedAt, staleAfterMs });
const fullSources = () => ({ campaigns: ready([{}]), sessions: ready([{}]), gpsPoints: ready([{}]), proofPhotos: ready([{}]), waitlist: ready([{}]), activities: ready([{}]) });
const snapshot = (overrides = {}) => ({ activeCampaigns: 3, completedCampaigns: 2, lateCampaigns: 1, liveSessions: 4, operatorStatus: "5/2", onlineOperators: 5, offlineOperators: 2, pendingCampaigns: 1, activeClients: 4, pendingRequests: 2, totalRevenue: 1520.5, avgCpm: 48.25, alarmCount: 6, opsProblems: 3, lastUpdate: "2026-07-20T11:55:00Z", ...overrides });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
function copilot(sources = fullSources(), values = snapshot()) {
  return buildAdminCopilotResponses({ insights: buildAdminDashboardInsights({ sources, snapshot: values, now }) });
}

test("usa sette ID stabili e non espone prompt libero", () => {
  const result = copilot();
  assert.equal(result.questions.length, 7);
  assert.equal(result.responses[ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS].questionId, ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS);
  assert.equal(Object.hasOwn(result, "prompt"), false);
});

test("riporta solo conteggi aggregati senza inventare dettagli", () => {
  const result = copilot();
  const late = result.responses[ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS];
  const problems = result.responses[ADMIN_COPILOT_QUESTION_IDS.OPERATIONAL_PROBLEMS];
  assert.match(late.text, /1 campagna risulta in ritardo/);
  assert.match(late.text, /non espone nomi o cause/);
  assert.match(problems.text, /3 problemi operativi/);
  assert.match(problems.text, /non identifica campagne o cause specifiche/);
});

test("operatori offline usa il segnale esistente e nessun nominativo", () => {
  const response = copilot().responses[ADMIN_COPILOT_QUESTION_IDS.OFFLINE_OPERATORS];
  assert.equal(response.state, "ready");
  assert.match(response.text, /2 operatori risultano offline/);
  assert.match(response.text, /non espone i nominativi/);
  assert.deepEqual(response.links.map((link) => link.href), ["/admin/live"]);
});

test("zero reale resta distinto da NON DISPONIBILE", () => {
  const response = copilot(fullSources(), snapshot({ pendingRequests: 0 })).responses[ADMIN_COPILOT_QUESTION_IDS.PENDING_REQUESTS];
  assert.equal(response.state, "ready");
  assert.match(response.text, /valore rilevato è 0/);
  assert.equal(response.evidence[0].value, 0);
});

test("mancante ed errore non generano inferenze o link", () => {
  const missing = copilot({ ...fullSources(), waitlist: { status: "missing", reason: "Waitlist assente." } }).responses[ADMIN_COPILOT_QUESTION_IDS.PENDING_REQUESTS];
  const errored = copilot({ ...fullSources(), campaigns: { status: "error", reason: "Errore campagne." } }).responses[ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS];
  assert.equal(missing.state, "unavailable");
  assert.match(missing.text, /NON DISPONIBILE/);
  assert.equal(errored.state, "error");
  assert.match(errored.text, /Non posso rispondere/);
  assert.equal(missing.links.length + errored.links.length, 0);
});

test("accesso negato oscura i valori e sopprime i link", () => {
  const response = copilot({ ...fullSources(), campaigns: { status: "denied", reason: "Ruolo non autorizzato." } }).responses[ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS];
  assert.equal(response.state, "denied");
  assert.equal(response.evidence[0].value, null);
  assert.equal(response.links.length, 0);
  assert.doesNotMatch(response.text, /1520|Cliente/);
});

test("segnala le fonti obsolete mantenendo le evidenze contrattuali", () => {
  const staleSources = Object.fromEntries(Object.entries(fullSources()).map(([key, value]) => [key, { ...value, observedAt: "2026-07-20T09:00:00Z" }]));
  const response = copilot(staleSources).responses[ADMIN_COPILOT_QUESTION_IDS.FRESHNESS];
  assert.equal(response.state, "ready");
  assert.match(response.text, /12 KPI risultano da aggiornare/);
  assert.ok(response.evidence.every((datum) => datum.freshness.state === "obsoleto"));
});

test("i collegamenti sono limitati alle route operative approvate", () => {
  const responses = Object.values(copilot().responses);
  const hrefs = [...new Set(responses.flatMap((response) => response.links.map((link) => link.href)))].sort();
  assert.deepEqual(hrefs, ["#campagne-attive", "/admin/anomalie", "/admin/live"]);
});

console.log(`AI admin copilot tests: ${passed} passed`);
