import assert from "node:assert/strict";
import {
  AI_AUDIENCES,
  AI_DATA_CATEGORIES,
  AI_DATUM_KINDS,
  AI_FRESHNESS_STATES,
  AI_UNAVAILABLE_CODES,
  AI_VALUE_TYPES,
  createAiDatum,
  createUnavailableAiDatum,
  evaluateAiFreshness,
  validateAiDatum,
} from "../src/lib/ai/insight-contract.js";
import { AI_SOURCE_IDS } from "../src/lib/ai/source-labels.js";
import { AI_RESOURCES, evaluateAiPermission, projectAiPermissions } from "../src/lib/ai/projectAiPermissions.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const now = new Date("2026-07-20T12:00:00.000Z");

function realCount(value) {
  return createAiDatum({
    id: "test.count", kind: AI_DATUM_KINDS.KPI, label: "Conteggio",
    category: AI_DATA_CATEGORIES.REAL, value, valueType: AI_VALUE_TYPES.COUNT,
    sources: [AI_SOURCE_IDS.CAMPAIGNS], observedAt: "2026-07-20T11:55:00.000Z",
    staleAfterMs: 600_000, permission: { audience: AI_AUDIENCES.ADMIN, allowed: true },
  }, { now });
}

test("zero reale resta disponibile e distinto dall'assenza", () => {
  const datum = realCount(0);
  assert.equal(datum.value, 0);
  assert.equal(datum.category, AI_DATA_CATEGORIES.REAL);
  assert.equal(datum.unavailable, null);
});

test("lo stesso contratto accetta insight testuali tracciabili", () => {
  const datum = createAiDatum({
    id: "test.insight", kind: AI_DATUM_KINDS.INSIGHT, label: "Nota operativa",
    category: AI_DATA_CATEGORIES.DERIVED, value: "Nessuna sessione caricata.", valueType: AI_VALUE_TYPES.STRING,
    sources: [AI_SOURCE_IDS.DELIVERY_SESSIONS],
    derivation: { criterion: "Testo deterministico basato sul conteggio sessioni.", inputs: ["sessions.length"] },
    permission: { audience: AI_AUDIENCES.ADMIN, allowed: true },
  }, { now });
  assert.equal(validateAiDatum(datum).valid, true);
  assert.equal(datum.kind, AI_DATUM_KINDS.INSIGHT);
});

test("null o undefined non diventano fallback numerici", () => {
  assert.throws(() => realCount(null), /valore esplicito/);
  assert.throws(() => realCount(undefined), /valore esplicito/);
});

test("ogni dato richiede almeno una fonte catalogata", () => {
  assert.throws(() => createAiDatum({
    id: "bad", kind: AI_DATUM_KINDS.KPI, label: "Bad", category: AI_DATA_CATEGORIES.REAL,
    value: 1, valueType: AI_VALUE_TYPES.COUNT, sources: [],
    permission: { audience: AI_AUDIENCES.ADMIN, allowed: true },
  }, { now }), /fonte/);
});

test("derivato e stima richiedono criterio e input", () => {
  assert.throws(() => createAiDatum({
    id: "bad.derived", kind: AI_DATUM_KINDS.KPI, label: "Bad",
    category: AI_DATA_CATEGORIES.DERIVED, value: 1, valueType: AI_VALUE_TYPES.COUNT,
    sources: [AI_SOURCE_IDS.GPS_POINTS], permission: { audience: AI_AUDIENCES.ADMIN, allowed: true },
  }, { now }), /criterio e input/);
});

test("NON_DISPONIBILE richiede null, codice e motivazione", () => {
  const datum = createUnavailableAiDatum({
    id: "missing", kind: AI_DATUM_KINDS.KPI, label: "Mancante", valueType: AI_VALUE_TYPES.COUNT,
    sources: [AI_SOURCE_IDS.GPS_POINTS], permission: { audience: AI_AUDIENCES.CLIENT, allowed: true },
    unavailableCode: AI_UNAVAILABLE_CODES.MISSING, unavailableReason: "Nessun record restituito.",
  }, { now });
  assert.equal(datum.value, null);
  assert.equal(datum.category, AI_DATA_CATEGORIES.UNAVAILABLE);
  assert.equal(validateAiDatum(datum).valid, true);
});

test("freshness distingue corrente, obsoleto e timestamp assente", () => {
  assert.equal(evaluateAiFreshness({ observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000, now }).state, AI_FRESHNESS_STATES.CURRENT);
  assert.equal(evaluateAiFreshness({ observedAt: "2026-07-20T10:00:00Z", staleAfterMs: 600_000, now }).state, AI_FRESHNESS_STATES.STALE);
  assert.equal(evaluateAiFreshness({ observedAt: null, staleAfterMs: 600_000, now }).state, AI_FRESHNESS_STATES.UNKNOWN);
});

test("matrice Cliente applica ownership, tracking e filtro foto", () => {
  assert.equal(evaluateAiPermission(AI_AUDIENCES.CLIENT, AI_RESOURCES.OWN_CAMPAIGN_SUMMARY, { ownershipConfirmed: true }).allowed, true);
  assert.equal(evaluateAiPermission(AI_AUDIENCES.CLIENT, AI_RESOURCES.OWN_CAMPAIGN_SUMMARY, { ownershipConfirmed: false }).allowed, false);
  assert.equal(evaluateAiPermission(AI_AUDIENCES.CLIENT, AI_RESOURCES.OWN_CAMPAIGN_TRACKING, { ownershipConfirmed: true, clientTrackingEnabled: false }).allowed, false);
  assert.equal(evaluateAiPermission(AI_AUDIENCES.CLIENT, AI_RESOURCES.OWN_APPROVED_PHOTOS, { ownershipConfirmed: true, approvedOnly: false }).allowed, false);
  assert.equal(evaluateAiPermission(AI_AUDIENCES.CLIENT, AI_RESOURCES.AUDIT, { ownershipConfirmed: true }).allowed, false);
});

test("proiezione negata elimina il valore senza esporre fallback", () => {
  const projected = projectAiPermissions(realCount(42), {
    audience: AI_AUDIENCES.CLIENT,
    resource: AI_RESOURCES.OWN_CAMPAIGN_SUMMARY,
    context: { ownershipConfirmed: false },
    now,
  });
  assert.equal(projected.value, null);
  assert.equal(projected.category, AI_DATA_CATEGORIES.UNAVAILABLE);
  assert.equal(projected.unavailable.code, AI_UNAVAILABLE_CODES.ACCESS_DENIED);
  assert.equal(projected.permission.allowed, false);
  assert.equal(validateAiDatum(projected).valid, true);
});

console.log(`AI insight contract tests: ${passed} passed`);
