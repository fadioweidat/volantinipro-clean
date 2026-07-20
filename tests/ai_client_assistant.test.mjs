import assert from "node:assert/strict";
import { buildClientDashboardInsights } from "../src/lib/ai/buildClientInsights.js";
import { buildClientAssistantResponses, CLIENT_ASSISTANT_QUESTION_IDS } from "../src/lib/ai/buildClientAssistantResponses.js";

const now = new Date("2026-07-20T12:00:00Z");
const ready = (data, observedAt = "2026-07-20T11:55:00Z", staleAfterMs = 600_000) => ({ status: "ready", data, observedAt, staleAfterMs });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
function assistantFrom(source, ownershipConfirmed = true) {
  const insights = buildClientDashboardInsights({ now, context: { ownershipConfirmed }, sources: { campaigns: source } });
  return buildClientAssistantResponses({ insights });
}

test("usa ID stabili e non espone chat libera", () => {
  const assistant = assistantFrom(ready([]));
  assert.equal(assistant.questions.length, 6);
  assert.equal(assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.PAYMENTS].questionId, CLIENT_ASSISTANT_QUESTION_IDS.PAYMENTS);
  assert.equal(Object.hasOwn(assistant, "prompt"), false);
});

test("distingue zero reale da NON DISPONIBILE", () => {
  const assistant = assistantFrom(ready([]));
  const payment = assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.PAYMENTS];
  assert.equal(payment.state, "ready");
  assert.match(payment.text, /valore rilevato è 0/);
  assert.equal(payment.evidence[0].value, 0);
  assert.equal(payment.evidence[0].category, "DATO DERIVATO");
});

test("non inferisce quando un campo necessario manca", () => {
  const assistant = assistantFrom(ready([{ stato: "confermata", stato_pagamento: null, totale_euro: 10, updated_at: "2026-07-20T11:55:00Z" }]));
  const payment = assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.PAYMENTS];
  assert.equal(payment.state, "unavailable");
  assert.match(payment.text, /NON DISPONIBILE/);
  assert.equal(payment.evidence[0].value, null);
});

test("errore fonte produce risposta senza inferenze", () => {
  const assistant = assistantFrom({ status: "error", reason: "Errore controllato." });
  const reports = assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.REPORTS];
  assert.equal(reports.state, "error");
  assert.match(reports.text, /Non posso rispondere/);
  assert.equal(reports.evidence[0].value, null);
});

test("accesso negato non espone alcun valore", () => {
  const assistant = assistantFrom(ready([{ stato: "completata", stato_pagamento: "pagato", totale_euro: 999, updated_at: "2026-07-20T11:55:00Z" }]), false);
  const status = assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.CAMPAIGN_STATUS];
  assert.equal(status.state, "denied");
  assert.match(status.text, /non è autorizzato/);
  assert.ok(status.evidence.every((datum) => datum.value === null));
  assert.doesNotMatch(status.text, /999/);
});

test("segnala freshness obsoleta senza cambiare i valori", () => {
  const assistant = assistantFrom(ready([{ stato: "completata", stato_pagamento: "pagato", totale_euro: 10, updated_at: "2026-07-19T10:00:00Z" }], "2026-07-19T10:00:00Z", 600_000));
  const freshness = assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.FRESHNESS];
  assert.equal(freshness.state, "ready");
  assert.match(freshness.text, /9 dati risultano da aggiornare/);
  assert.ok(freshness.evidence.every((datum) => datum.freshness.state === "obsoleto"));
});

test("freshness non conclude quando un insight resta NON DISPONIBILE", () => {
  const assistant = assistantFrom(ready([], "2026-07-19T10:00:00Z", 600_000));
  const freshness = assistant.responses[CLIENT_ASSISTANT_QUESTION_IDS.FRESHNESS];
  assert.equal(freshness.state, "unavailable");
  assert.match(freshness.text, /NON DISPONIBILE/);
});

console.log(`AI client assistant tests: ${passed} passed`);
