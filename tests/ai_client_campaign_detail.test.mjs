import assert from "node:assert/strict";
import { buildClientCampaignInsights, confirmClientCampaignOwnership, filterApprovedClientPhotos, isClientTrackingEnabled, projectClientCampaignSourceData } from "../src/lib/ai/buildClientCampaignInsights.js";
import { buildClientCampaignAssistantResponses, CLIENT_CAMPAIGN_QUESTION_IDS } from "../src/lib/ai/buildClientCampaignAssistantResponses.js";

const now = new Date("2026-07-20T12:00:00Z");
const token = (payload) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fixture`;
const session = { accessToken: token({ sub: "user-1", email: "cliente@example.test" }) };
const campaign = { id: "campaign-1", user_id: "user-1", client_email: "cliente@example.test", stato: "in_distribuzione", quantita: 10000, comuni_selezionati: ["Varedo", "Paderno Dugnano"], copertura_pct: 91, tracking_enabled: true, updated_at: "2026-07-20T11:55:00Z" };
const ready = (data, observedAt = "2026-07-20T11:55:00Z", staleAfterMs = 600_000) => ({ status: "ready", data, observedAt, staleAfterMs });
const sources = (overrides = {}) => ({
  campaign: ready(projectClientCampaignSourceData(campaign)),
  gpsPoints: ready([{ id: "gps-1" }, { id: "gps-2" }]),
  approvedPhotos: ready([{ id: "approved-1", approved_at: "2026-07-20T11:00:00Z" }]),
  coverageMetrics: ready({ coveragePercent: 63.5, inputs: ["metrics.copertura_finale_cliente_percent"], assumptions: ["Valore operativo preesistente."] }),
  ...overrides,
});
const byId = (result, id) => result.items.find((datum) => datum.id === id);
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

test("conferma ownership tramite ID o email e rifiuta campagna estranea", () => {
  assert.equal(confirmClientCampaignOwnership(campaign, session), true);
  assert.equal(confirmClientCampaignOwnership({ ...campaign, user_id: "other", client_email: "other@example.test" }, session), false);
  assert.equal(confirmClientCampaignOwnership(campaign, null), false);
});

test("riconosce tracking solo da flag o servizio esplicito", () => {
  assert.equal(isClientTrackingEnabled(campaign), true);
  assert.equal(isClientTrackingEnabled({ metadata: { extra_services: [{ id: "tracking_gps" }] } }), true);
  assert.equal(isClientTrackingEnabled({ metadata: {} }), false);
});

test("builder conserva stato, quantità, comuni e coperture senza ricalcolo", () => {
  const result = buildClientCampaignInsights({ sources: sources(), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now });
  assert.equal(byId(result, "client.campaign.status").value, "in_distribuzione");
  assert.equal(byId(result, "client.campaign.quantity").value, 10000);
  assert.equal(byId(result, "client.campaign.municipalities_count").value, 2);
  assert.equal(byId(result, "client.campaign.planned_coverage").value, 91);
  assert.equal(byId(result, "client.tracking.gps_points_count").value, 2);
  assert.equal(byId(result, "client.campaign.approved_photos_count").value, 1);
  assert.equal(byId(result, "client.tracking.coverage").value, 63.5);
  assert.equal(byId(result, "client.tracking.last_update").value, "2026-07-20T11:55:00.000Z");
});

test("campagna estranea non costruisce alcun valore", () => {
  const result = buildClientCampaignInsights({ sources: sources(), context: { campaignId: "foreign", ownershipConfirmed: false, clientTrackingEnabled: true, approvedOnly: true }, now });
  assert.equal(result.campaignId, null);
  assert.equal(result.ownershipConfirmed, false);
  assert.ok(result.items.every((datum) => datum.value === null && datum.unavailable.code === "accesso_negato"));
  assert.doesNotMatch(JSON.stringify(result), /10000|63\.5|Varedo/);
});

test("tracking disabilitato è NON DISPONIBILE e non zero", () => {
  const result = buildClientCampaignInsights({ sources: sources(), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: false, approvedOnly: true }, now });
  assert.equal(byId(result, "client.tracking.gps_points_count").value, null);
  assert.equal(byId(result, "client.tracking.coverage").value, null);
  assert.equal(byId(result, "client.tracking.last_update").value, null);
  assert.equal(byId(result, "client.tracking.gps_points_count").unavailable.code, "accesso_negato");
});

test("zero reale, fonte assente ed errore restano distinti", () => {
  const zero = buildClientCampaignInsights({ sources: sources({ gpsPoints: ready([]), approvedPhotos: ready([]), coverageMetrics: ready({ coveragePercent: 0, inputs: ["metrics.coverage"], assumptions: [] }) }), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now });
  assert.equal(byId(zero, "client.tracking.gps_points_count").value, 0);
  assert.equal(byId(zero, "client.campaign.approved_photos_count").value, 0);
  assert.equal(byId(zero, "client.tracking.coverage").value, 0);
  const missing = buildClientCampaignInsights({ sources: sources({ gpsPoints: { status: "missing", reason: "GPS assente." } }), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now });
  const errored = buildClientCampaignInsights({ sources: sources({ coverageMetrics: { status: "error", reason: "Errore copertura." } }), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now });
  assert.equal(byId(missing, "client.tracking.gps_points_count").value, null);
  assert.equal(byId(errored, "client.tracking.coverage").unavailable.code, "errore_fonte");
});

test("foto non confermate come approvate vengono negate", () => {
  const filtered = filterApprovedClientPhotos([{ id: "ok", approved_at: "2026-07-20T11:00:00Z" }, { id: "hidden", approved_at: null, status: "pending" }]);
  assert.deepEqual(filtered.map((photo) => photo.id), ["ok"]);
  const result = buildClientCampaignInsights({ sources: sources(), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: false }, now });
  assert.equal(byId(result, "client.campaign.approved_photos_count").value, null);
  assert.equal(byId(result, "client.campaign.approved_photos_count").unavailable.code, "accesso_negato");
});

test("freshness obsoleta è preservata", () => {
  const stale = Object.fromEntries(Object.entries(sources()).map(([key, value]) => [key, { ...value, observedAt: "2026-07-20T09:00:00Z" }]));
  const result = buildClientCampaignInsights({ sources: stale, context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now });
  assert.ok(result.items.every((datum) => datum.freshness.state === "obsoleto"));
});

test("assistente usa ID stabili e non conclude senza evidenza", () => {
  const insights = buildClientCampaignInsights({ sources: sources({ coverageMetrics: { status: "missing", reason: "Copertura assente." } }), context: { campaignId: campaign.id, ownershipConfirmed: true, clientTrackingEnabled: true, approvedOnly: true }, now });
  const assistant = buildClientCampaignAssistantResponses({ insights });
  const coverage = assistant.responses[CLIENT_CAMPAIGN_QUESTION_IDS.DETECTED_COVERAGE];
  assert.equal(coverage.questionId, CLIENT_CAMPAIGN_QUESTION_IDS.DETECTED_COVERAGE);
  assert.equal(coverage.state, "unavailable");
  assert.match(coverage.text, /NON DISPONIBILE/);
  assert.equal(Object.hasOwn(assistant, "prompt"), false);
});

console.log(`AI client campaign detail tests: ${passed} passed`);
