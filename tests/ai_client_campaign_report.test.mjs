import assert from "node:assert/strict";
import { buildClientCampaignReportInsights, projectClientCampaignReportSourceData } from "../src/lib/ai/buildClientCampaignReportInsights.js";
import { buildClientHistoricalSuggestions, evaluateClientCampaignComparability, filterOwnedCompletedClientCampaigns } from "../src/lib/ai/buildClientHistoricalSuggestions.js";
import { buildClientReportAssistantResponses, CLIENT_REPORT_QUESTION_IDS } from "../src/lib/ai/buildClientReportAssistantResponses.js";
import { filterApprovedClientPhotos } from "../src/lib/ai/buildClientCampaignInsights.js";
import { AI_DATA_CATEGORIES, AI_FRESHNESS_STATES, AI_UNAVAILABLE_CODES } from "../src/lib/ai/insight-contract.js";

const now = new Date("2026-07-20T12:00:00Z");
const email = "cliente.report@fixture.local";
const token = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "client-report", email })).toString("base64url")}.fixture`;
const session = { accessToken: token };
const base = {
  id: "current", user_id: "client-report", client_email: email, stato: "completata", servizio: "d2d", quantita: 10000,
  volantini_distribuiti: 9800, comuni_selezionati: ["Varedo", "Paderno Dugnano"], copertura_pct: 91, copertura_rilevata_pct: 83,
  data_fine: "2026-07-19", updated_at: "2026-07-20T11:00:00Z",
  gps_punti: [{ id: 1 }, { id: 2 }], foto_proof: [{ id: "ok", approved: true }, { id: "pending", status: "pending" }],
};
const historical = { ...base, id: "historical", quantita: 9000, copertura_rilevata_pct: 80, gps_punti: [{ id: 3 }], foto_proof: [{ id: "old-ok", status: "approved" }], data_fine: "2026-06-10" };

function source(data, observedAt = base.updated_at) { return { status: "ready", data, observedAt, staleAfterMs: 24 * 60 * 60 * 1000 }; }
function report(campaign = base, overrides = {}) {
  const projected = projectClientCampaignReportSourceData(campaign);
  const approved = filterApprovedClientPhotos(projected.photos);
  return buildClientCampaignReportInsights({
    sources: {
      campaign: source(projected),
      gpsPoints: source(projected.gpsPoints),
      approvedPhotos: source(approved),
      finalCoverage: source(projected.finalCoveragePercent),
      ...overrides,
    },
    context: { ownershipConfirmed: true, approvedOnly: true, campaignId: campaign.id },
    now,
  });
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("report usa solo valori esistenti e distingue zero reale", () => {
  const insights = report({ ...base, volantini_distribuiti: 0, copertura_rilevata_pct: 0, gps_punti: [], foto_proof: [] });
  assert.equal(insights.items.find((item) => item.id === "client.report.distributed_quantity").value, 0);
  assert.equal(insights.items.find((item) => item.id === "client.report.final_coverage").value, 0);
  assert.equal(insights.items.find((item) => item.id === "client.report.gps_points_count").value, 0);
});

test("null non viene trasformato in zero", () => {
  const insights = report({ ...base, volantini_distribuiti: null, copertura_rilevata_pct: null }, { finalCoverage: { status: "missing", reason: "Copertura assente" } });
  for (const id of ["client.report.distributed_quantity", "client.report.final_coverage"]) {
    const datum = insights.items.find((item) => item.id === id);
    assert.equal(datum.category, AI_DATA_CATEGORIES.UNAVAILABLE);
    assert.equal(datum.value, null);
  }
});

test("errore, obsoleto e accesso negato restano distinti", () => {
  const errorInsights = report(base, { finalCoverage: { status: "error", reason: "Errore fonte" } });
  assert.equal(errorInsights.items.find((item) => item.id === "client.report.final_coverage").unavailable.code, AI_UNAVAILABLE_CODES.SOURCE_ERROR);
  const staleInsights = buildClientCampaignReportInsights({ sources: { campaign: source(projectClientCampaignReportSourceData(base), "2026-07-18T10:00:00Z"), gpsPoints: source(base.gps_punti), approvedPhotos: source(filterApprovedClientPhotos(base.foto_proof)), finalCoverage: source(83) }, context: { ownershipConfirmed: true, approvedOnly: true }, now });
  assert.equal(staleInsights.items.find((item) => item.id === "client.report.status").freshness.state, AI_FRESHNESS_STATES.STALE);
  const denied = buildClientCampaignReportInsights({ sources: {}, context: { ownershipConfirmed: false }, now });
  assert.ok(denied.items.every((item) => item.value === null && item.unavailable.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED));
});

test("solo foto approvate entrano nel report", () => {
  assert.equal(report().items.find((item) => item.id === "client.report.approved_photos_count").value, 1);
});

test("comparabilita dichiara e applica tutti i criteri", () => {
  assert.equal(evaluateClientCampaignComparability(base, historical).comparable, true);
  assert.equal(evaluateClientCampaignComparability(base, { ...historical, quantita: 8000 }).comparable, true, "Il rapporto esatto 1,25 deve essere incluso.");
  assert.equal(evaluateClientCampaignComparability(base, { ...historical, quantita: 7999 }).reasons.includes("quantita_non_compatibile"), true, "Un rapporto appena oltre 1,25 deve essere escluso.");
  assert.equal(evaluateClientCampaignComparability(base, { ...historical, quantita: 7000 }).reasons.includes("quantita_non_compatibile"), true);
  assert.equal(evaluateClientCampaignComparability(base, { ...historical, comuni_selezionati: ["Varedo"] }).reasons.includes("numero_comuni_diverso"), true);
  assert.equal(evaluateClientCampaignComparability(base, { ...historical, gps_punti: undefined }).reasons.includes("metriche_non_omogenee"), true);
  assert.equal(evaluateClientCampaignComparability(base, { ...historical, stato: "in_distribuzione" }).reasons.includes("stato_non_concluso"), true);
});

test("filtro storico esclude campagne cross-customer e non concluse prima del builder", () => {
  const filtered = filterOwnedCompletedClientCampaigns([historical, { ...historical, id: "foreign", user_id: "other", client_email: "other@fixture.local" }, { ...historical, id: "active", stato: "in_distribuzione" }], { session, currentCampaignId: base.id });
  assert.deepEqual(filtered.map((campaign) => campaign.id), ["historical"]);
});

test("assenza comparabili produce conteggio zero e suggerimenti NON DISPONIBILI", () => {
  const suggestions = buildClientHistoricalSuggestions({ currentCampaign: base, sources: { history: source([{ ...historical, servizio: "h2h" }]) }, context: { ownershipConfirmed: true, historyOwnershipConfirmed: true }, now });
  assert.equal(suggestions.items[0].value, 0);
  assert.ok(suggestions.items.slice(1).every((item) => item.category === AI_DATA_CATEGORIES.UNAVAILABLE));
});

test("confronto storico e descrittivo senza medie, benchmark o previsioni", () => {
  const suggestions = buildClientHistoricalSuggestions({ currentCampaign: base, sources: { history: source([historical]) }, context: { ownershipConfirmed: true, historyOwnershipConfirmed: true }, now });
  assert.equal(suggestions.items[0].value, 1);
  const text = suggestions.items.slice(1).map((item) => item.value).join(" ").toLowerCase();
  assert.match(text, /superiore a 1/);
  assert.doesNotMatch(text, /media|benchmark|previs/);
});

test("storico negato elimina ogni valore", () => {
  const suggestions = buildClientHistoricalSuggestions({ currentCampaign: base, sources: { history: source([historical]) }, context: { ownershipConfirmed: false, historyOwnershipConfirmed: false }, now });
  assert.ok(suggestions.items.every((item) => item.value === null && item.unavailable.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED));
});

test("assistente report usa ID stabili e non conclude senza evidenza", () => {
  const reportInsights = report();
  const historicalSuggestions = buildClientHistoricalSuggestions({ currentCampaign: base, sources: { history: source([historical]) }, context: { ownershipConfirmed: true, historyOwnershipConfirmed: true }, now });
  const assistant = buildClientReportAssistantResponses({ reportInsights, historicalSuggestions });
  assert.equal(assistant.questions.length, 7);
  assert.match(assistant.responses[CLIENT_REPORT_QUESTION_IDS.FINAL_COVERAGE].text, /83%/);
  const unavailableReport = report({ ...base, copertura_rilevata_pct: null }, { finalCoverage: { status: "missing", reason: "Assente" } });
  const unavailableAssistant = buildClientReportAssistantResponses({ reportInsights: unavailableReport, historicalSuggestions });
  assert.equal(unavailableAssistant.responses[CLIENT_REPORT_QUESTION_IDS.FINAL_COVERAGE].state, "unavailable");
});

let passed = 0;
for (const [name, fn] of tests) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
console.log(`AI client campaign report tests: ${passed} passed`);
