import assert from "node:assert/strict";
import { buildAdminDecisionItems, ADMIN_DECISION_LEVELS, ADMIN_DECISION_STATES } from "../src/lib/ai/buildAdminDecisionItems.js";
import { buildAdminDecisionCenterResponses, ADMIN_DECISION_QUESTION_IDS } from "../src/lib/ai/buildAdminDecisionCenterResponses.js";
import { AI_AUDIENCES, AI_DATA_CATEGORIES, AI_DATUM_KINDS, AI_UNAVAILABLE_CODES, AI_VALUE_TYPES, createAiDatum, createUnavailableAiDatum } from "../src/lib/ai/insight-contract.js";
import { AI_SOURCE_IDS } from "../src/lib/ai/source-labels.js";

const now = new Date("2026-07-20T12:00:00Z");
const permission = { audience: AI_AUDIENCES.ADMIN, allowed: true };
function signal(id, label, value, observedAt = "2026-07-20T11:55:00Z", sources = [AI_SOURCE_IDS.CAMPAIGNS]) {
  return createAiDatum({ id, kind: AI_DATUM_KINDS.INSIGHT, label, category: AI_DATA_CATEGORIES.DERIVED, value, valueType: AI_VALUE_TYPES.STRING, sources, observedAt, staleAfterMs: 600_000, derivation: { criterion: "Segnale gia prodotto.", inputs: [id] }, permission }, { now });
}
function kpi(id, label, value, { observedAt = "2026-07-20T11:55:00Z", staleAfterMs = 600_000, sources = [AI_SOURCE_IDS.CAMPAIGNS] } = {}) {
  return createAiDatum({ id, kind: AI_DATUM_KINDS.KPI, label, category: AI_DATA_CATEGORIES.DERIVED, value, valueType: AI_VALUE_TYPES.COUNT, unit: "elementi", sources, observedAt, staleAfterMs, derivation: { criterion: "KPI gia prodotto.", inputs: [id] }, permission }, { now });
}
function unavailable(id, label, code, sources = [AI_SOURCE_IDS.CAMPAIGNS]) {
  const denied = code === AI_UNAVAILABLE_CODES.ACCESS_DENIED;
  return createUnavailableAiDatum({ id, kind: AI_DATUM_KINDS.KPI, label, valueType: AI_VALUE_TYPES.COUNT, unit: "elementi", sources, permission: { audience: AI_AUDIENCES.ADMIN, allowed: !denied, reason: denied ? "Negato" : null }, unavailableCode: code, unavailableReason: code === AI_UNAVAILABLE_CODES.SOURCE_ERROR ? "Errore sorgente" : denied ? "Negato" : "Assente" }, { now });
}
function attention(datum, href) { return { datum, href }; }

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("ordine statico segue stati e segnali approvati", () => {
  const insights = {
    items: [
      unavailable("admin.home.missing", "Dato mancante", AI_UNAVAILABLE_CODES.MISSING),
      unavailable("admin.home.error", "Errore fonte", AI_UNAVAILABLE_CODES.SOURCE_ERROR),
      kpi("admin.home.stale", "Fonte obsoleta", 4, { observedAt: "2026-07-20T10:00:00Z", staleAfterMs: 60_000 }),
    ],
    attention: [
      attention(signal("admin.home.attention.pending_requests", "Richieste in attesa", "2 richieste"), null),
      attention(signal("admin.home.attention.offline_operators", "Operatori inattivi", "1 operatore", undefined, [AI_SOURCE_IDS.DELIVERY_SESSIONS]), "/admin/live"),
      attention(signal("admin.home.attention.late_campaigns", "Campagne in ritardo", "1 campagna"), "#campagne-attive"),
      attention(signal("admin.home.attention.operational_problems", "Anomalie gia rilevate", "3 problemi", undefined, [AI_SOURCE_IDS.AUDIT_LOG]), "/admin/anomalie"),
    ],
  };
  const center = buildAdminDecisionItems({ insights, context: { authorized: true, role: "admin" }, now });
  assert.deepEqual(center.items.map((item) => item.insightId), ["admin.home.error", "admin.home.attention.operational_problems", "admin.home.attention.late_campaigns", "admin.home.attention.offline_operators", "admin.home.attention.pending_requests", "admin.home.stale", "admin.home.missing"]);
  assert.match(center.orderingRule, /timestamp decrescente, poi ID alfabetico/);
  assert.ok(center.items.every((item) => item.positionReason.includes("ID stabile")));
});

test("parita usa timestamp recente e poi ID stabile", () => {
  const a = kpi("admin.home.a", "A", 1, { observedAt: "2026-07-20T10:00:00Z", staleAfterMs: 1 });
  const b = kpi("admin.home.b", "B", 1, { observedAt: "2026-07-20T11:00:00Z", staleAfterMs: 1 });
  const c = kpi("admin.home.c", "C", 1, { observedAt: "2026-07-20T11:00:00Z", staleAfterMs: 1 });
  const center = buildAdminDecisionItems({ insights: { items: [c, a, b], attention: [] }, context: { authorized: true, role: "super_admin" }, now });
  assert.deepEqual(center.items.map((item) => item.insightId), ["admin.home.b", "admin.home.c", "admin.home.a"]);
});

test("diniego elimina elementi, valori, link e conclusioni", () => {
  const center = buildAdminDecisionItems({ insights: { items: [kpi("admin.home.active_alarms", "Allarmi", 2)], attention: [] }, context: { authorized: false, role: "cliente" }, now });
  assert.equal(center.access, "denied");
  assert.equal(center.items.length, 0);
  const responses = buildAdminDecisionCenterResponses({ decisionCenter: center });
  const answer = responses.responses[ADMIN_DECISION_QUESTION_IDS.ACTION];
  assert.equal(answer.state, "denied");
  assert.equal(answer.evidence.length, 0);
  assert.equal(answer.links.length, 0);
});

test("link sono limitati alle route approvate e soppressi su errore", () => {
  const ready = attention(signal("admin.home.attention.offline_operators", "Operatori inattivi", "1 operatore", undefined, [AI_SOURCE_IDS.DELIVERY_SESSIONS]), "/admin/live");
  const invalid = attention(signal("admin.home.attention.late_campaigns", "Campagne in ritardo", "1 campagna"), "/admin/not-existing");
  const center = buildAdminDecisionItems({ insights: { items: [unavailable("admin.home.error", "Errore", AI_UNAVAILABLE_CODES.SOURCE_ERROR)], attention: [ready, invalid] }, context: { authorized: true, role: "admin" }, now });
  assert.equal(center.items.find((item) => item.insightId === ready.datum.id).href, "/admin/live");
  assert.equal(center.items.find((item) => item.insightId === invalid.datum.id).href, null);
  assert.equal(center.items.find((item) => item.state === ADMIN_DECISION_STATES.ERROR).href, null);
});

test("zero reale produce elemento informativo e non dato mancante", () => {
  const center = buildAdminDecisionItems({ insights: { items: [kpi("admin.home.active_alarms", "Allarmi attivi", 0)], attention: [] }, context: { authorized: true, role: "admin" }, now });
  assert.equal(center.items.length, 1);
  assert.equal(center.items[0].level, ADMIN_DECISION_LEVELS.INFORMATION);
  assert.equal(center.items[0].state, ADMIN_DECISION_STATES.READY);
  assert.equal(center.items[0].datum.value, 0);
});

test("risposte usano elementi stabili e non inventano punteggi", () => {
  const center = buildAdminDecisionItems({ insights: { items: [], attention: [attention(signal("admin.home.attention.operational_problems", "Anomalie gia rilevate", "2 problemi", undefined, [AI_SOURCE_IDS.AUDIT_LOG]), "/admin/anomalie")] }, context: { authorized: true, role: "admin" }, now });
  const assistant = buildAdminDecisionCenterResponses({ decisionCenter: center });
  assert.equal(assistant.questions.length, 5);
  assert.match(assistant.responses[ADMIN_DECISION_QUESTION_IDS.POSITION].text, /problemi operativi/i);
  assert.deepEqual(assistant.responses[ADMIN_DECISION_QUESTION_IDS.SOURCE].evidence.map((datum) => datum.id), ["admin.home.attention.operational_problems"]);
  assert.doesNotMatch(JSON.stringify(center).toLowerCase(), /probabilita|punteggio|score/);
});

let passed = 0;
for (const [name, fn] of tests) { try { await fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}`); throw error; } }
console.log(`AI admin decision center tests: ${passed} passed`);
