import {
  AI_AUDIENCES,
  AI_DATA_CATEGORIES,
  AI_DATUM_KINDS,
  AI_SOURCE_LOAD_STATES,
  AI_UNAVAILABLE_CODES,
  AI_VALUE_TYPES,
  createAiDatum,
  createUnavailableAiDatum,
  readAiSourceState,
} from "./insight-contract.js";
import { AI_SOURCE_IDS } from "./source-labels.js";
import { AI_RESOURCES, projectAiPermissions } from "./projectAiPermissions.js";

const audience = AI_AUDIENCES.CLIENT;
const permission = { audience, allowed: true };

function unavailable({ id, label, valueType, sources, state, reason, now, unit = null }) {
  const denied = state?.status === AI_SOURCE_LOAD_STATES.DENIED;
  return createUnavailableAiDatum({
    id, kind: AI_DATUM_KINDS.KPI, label, valueType, unit, sources,
    permission: { audience, allowed: !denied, reason: denied ? state.reason : null },
    unavailableCode: denied ? AI_UNAVAILABLE_CODES.ACCESS_DENIED : state?.status === AI_SOURCE_LOAD_STATES.ERROR ? AI_UNAVAILABLE_CODES.SOURCE_ERROR : AI_UNAVAILABLE_CODES.MISSING,
    unavailableReason: reason ?? state?.reason ?? "Il valore non e presente nella fonte.",
  }, { now });
}

function project(datum, resource, context, now) {
  return projectAiPermissions(datum, { audience, resource, context, now });
}

export function buildClientInsights({ sources = {}, context = {}, now = new Date() } = {}) {
  const campaign = readAiSourceState(sources, "campaign");
  const gps = readAiSourceState(sources, "gpsPoints");
  const photos = readAiSourceState(sources, "approvedPhotos");
  const coverage = readAiSourceState(sources, "coverageMetrics");
  const campaignSource = context.campaignSourceId === AI_SOURCE_IDS.CAMPAIGNS ? AI_SOURCE_IDS.CAMPAIGNS : AI_SOURCE_IDS.LEGACY_CAMPAIGNS;
  const own = { ownershipConfirmed: context.ownershipConfirmed === true };
  const tracking = { ...own, clientTrackingEnabled: context.clientTrackingEnabled === true };
  const approved = { ...own, approvedOnly: context.approvedOnly === true };
  const items = [];

  const quantity = campaign.data?.quantity;
  items.push(project(
    campaign.status === AI_SOURCE_LOAD_STATES.READY && typeof quantity === "number" && Number.isFinite(quantity)
      ? createAiDatum({ id: "client.campaign.quantity", kind: AI_DATUM_KINDS.KPI, label: "Quantita campagna", category: AI_DATA_CATEGORIES.REAL, value: quantity, valueType: AI_VALUE_TYPES.COUNT, unit: "volantini", sources: [campaignSource], observedAt: campaign.observedAt, staleAfterMs: campaign.staleAfterMs, permission }, { now })
      : unavailable({ id: "client.campaign.quantity", label: "Quantita campagna", valueType: AI_VALUE_TYPES.COUNT, unit: "volantini", sources: [campaignSource], state: campaign, now }),
    AI_RESOURCES.OWN_CAMPAIGN_SUMMARY, own, now,
  ));

  const municipalities = campaign.data?.municipalities;
  items.push(project(
    campaign.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(municipalities)
      ? createAiDatum({ id: "client.campaign.municipalities_count", kind: AI_DATUM_KINDS.KPI, label: "Comuni selezionati", category: AI_DATA_CATEGORIES.DERIVED, value: municipalities.length, valueType: AI_VALUE_TYPES.COUNT, unit: "comuni", sources: [campaignSource], observedAt: campaign.observedAt, staleAfterMs: campaign.staleAfterMs, derivation: { criterion: "Conteggio degli elementi presenti nella lista comuni della campagna.", formula: "municipalities.length", inputs: ["campaign.municipalities"] }, permission }, { now })
      : unavailable({ id: "client.campaign.municipalities_count", label: "Comuni selezionati", valueType: AI_VALUE_TYPES.COUNT, unit: "comuni", sources: [campaignSource], state: campaign, now }),
    AI_RESOURCES.OWN_CAMPAIGN_SUMMARY, own, now,
  ));

  const plannedCoverage = campaign.data?.plannedCoveragePercent;
  items.push(project(
    campaign.status === AI_SOURCE_LOAD_STATES.READY && typeof plannedCoverage === "number" && Number.isFinite(plannedCoverage)
      ? createAiDatum({ id: "client.campaign.planned_coverage", kind: AI_DATUM_KINDS.KPI, label: "Copertura prevista", category: AI_DATA_CATEGORIES.ESTIMATE, value: plannedCoverage, valueType: AI_VALUE_TYPES.PERCENTAGE, unit: "%", sources: [campaignSource], observedAt: campaign.observedAt, staleAfterMs: campaign.staleAfterMs, derivation: { criterion: "Proiezione gia memorizzata nella campagna; il builder AI non la ricalcola.", formula: campaign.data?.plannedCoverageFormula ?? null, inputs: ["campaign.plannedCoveragePercent"], assumptions: campaign.data?.plannedCoverageAssumptions ?? [] }, permission }, { now })
      : unavailable({ id: "client.campaign.planned_coverage", label: "Copertura prevista", valueType: AI_VALUE_TYPES.PERCENTAGE, unit: "%", sources: [campaignSource], state: campaign, now }),
    AI_RESOURCES.OWN_CAMPAIGN_SUMMARY, own, now,
  ));

  items.push(project(
    gps.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(gps.data)
      ? createAiDatum({ id: "client.tracking.gps_points_count", kind: AI_DATUM_KINDS.KPI, label: "Punti GPS disponibili", category: AI_DATA_CATEGORIES.DERIVED, value: gps.data.length, valueType: AI_VALUE_TYPES.COUNT, unit: "punti", sources: [AI_SOURCE_IDS.GPS_POINTS], observedAt: gps.observedAt, staleAfterMs: gps.staleAfterMs, derivation: { criterion: "Conteggio dei punti GPS autorizzati restituiti dalla fonte.", formula: "gpsPoints.length", inputs: ["gpsPoints"] }, permission }, { now })
      : unavailable({ id: "client.tracking.gps_points_count", label: "Punti GPS disponibili", valueType: AI_VALUE_TYPES.COUNT, unit: "punti", sources: [AI_SOURCE_IDS.GPS_POINTS], state: gps, now }),
    AI_RESOURCES.OWN_CAMPAIGN_TRACKING, tracking, now,
  ));

  items.push(project(
    photos.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(photos.data)
      ? createAiDatum({ id: "client.campaign.approved_photos_count", kind: AI_DATUM_KINDS.KPI, label: "Foto approvate", category: AI_DATA_CATEGORIES.DERIVED, value: photos.data.length, valueType: AI_VALUE_TYPES.COUNT, unit: "foto", sources: [AI_SOURCE_IDS.PROOF_PHOTOS], observedAt: photos.observedAt, staleAfterMs: photos.staleAfterMs, derivation: { criterion: "Conteggio della collezione gia filtrata alle sole foto approvate.", formula: "approvedPhotos.length", inputs: ["approvedPhotos"] }, permission }, { now })
      : unavailable({ id: "client.campaign.approved_photos_count", label: "Foto approvate", valueType: AI_VALUE_TYPES.COUNT, unit: "foto", sources: [AI_SOURCE_IDS.PROOF_PHOTOS], state: photos, now }),
    AI_RESOURCES.OWN_APPROVED_PHOTOS, approved, now,
  ));

  const coverageValue = coverage.data?.coveragePercent;
  items.push(project(
    coverage.status === AI_SOURCE_LOAD_STATES.READY && typeof coverageValue === "number" && Number.isFinite(coverageValue)
      ? createAiDatum({ id: "client.tracking.coverage", kind: AI_DATUM_KINDS.KPI, label: "Copertura rilevata", category: AI_DATA_CATEGORIES.DERIVED, value: coverageValue, valueType: AI_VALUE_TYPES.PERCENTAGE, unit: "%", sources: [AI_SOURCE_IDS.GPS_POINTS, AI_SOURCE_IDS.ASSIGNED_ZONES, AI_SOURCE_IDS.COVERAGE_CORRECTIONS], observedAt: coverage.observedAt, staleAfterMs: coverage.staleAfterMs, derivation: { criterion: "Valore ricevuto dal calcolo di copertura esistente; nessun ricalcolo nel builder AI.", formula: coverage.data?.formula ?? null, inputs: coverage.data?.inputs ?? ["coverageMetrics.coveragePercent"], assumptions: coverage.data?.assumptions ?? [] }, permission }, { now })
      : unavailable({ id: "client.tracking.coverage", label: "Copertura rilevata", valueType: AI_VALUE_TYPES.PERCENTAGE, unit: "%", sources: [AI_SOURCE_IDS.GPS_POINTS, AI_SOURCE_IDS.ASSIGNED_ZONES, AI_SOURCE_IDS.COVERAGE_CORRECTIONS], state: coverage, now }),
    AI_RESOURCES.OWN_CAMPAIGN_TRACKING, tracking, now,
  ));

  return Object.freeze({ audience, generatedAt: new Date(now).toISOString(), items: Object.freeze(items) });
}

const HOME_KPI_DEFINITIONS = Object.freeze([
  { id: "client.home.active_campaigns", label: "Campagne attive", unit: "campagne" },
  { id: "client.home.completed_campaigns", label: "Campagne completate", unit: "campagne" },
  { id: "client.home.pending_quotes", label: "Preventivi in attesa", unit: "preventivi" },
  { id: "client.home.accepted_quotes", label: "Preventivi accettati", unit: "preventivi" },
  { id: "client.home.pending_payments", label: "In attesa pagamento", unit: "campagne" },
  { id: "client.home.received_payments", label: "Pagamenti ricevuti", unit: "pagamenti" },
  { id: "client.home.available_reports", label: "Report disponibili", unit: "report" },
  { id: "client.home.total_spent", label: "Totale speso", unit: "EUR", valueType: AI_VALUE_TYPES.CURRENCY },
  { id: "client.home.last_update", label: "Ultimo aggiornamento", valueType: AI_VALUE_TYPES.DATE },
]);

function objectMetadata(row) {
  if (!row?.metadata) return {};
  if (typeof row.metadata === "object" && !Array.isArray(row.metadata)) return row.metadata;
  try { return JSON.parse(row.metadata) || {}; } catch { return {}; }
}

function presentFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildClientDashboardInsights({ sources = {}, context = {}, now = new Date() } = {}) {
  const campaignsState = readAiSourceState(sources, "campaigns");
  const own = { ownershipConfirmed: context.ownershipConfirmed === true };
  const sourceId = context.campaignSourceId === AI_SOURCE_IDS.CAMPAIGNS ? AI_SOURCE_IDS.CAMPAIGNS : AI_SOURCE_IDS.LEGACY_CAMPAIGNS;
  const rows = campaignsState.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(campaignsState.data) ? campaignsState.data : null;
  const statuses = rows?.map((row) => row?.stato ?? row?.status ?? null) ?? null;
  const payments = rows?.map((row) => row?.stato_pagamento ?? null) ?? null;
  const totals = rows?.map((row) => presentFiniteNumber(row?.totale_euro ?? row?.total_amount)) ?? null;
  const timestamps = rows?.map((row) => row?.updated_at ?? row?.created_at ?? null) ?? null;
  const allPresent = (values) => Array.isArray(values) && values.every((value) => value !== null && value !== undefined && value !== "");
  const statusReady = allPresent(statuses);
  const paymentReady = allPresent(payments);
  const totalsReady = Array.isArray(totals) && totals.every((value) => value !== null);
  const timestampReady = Array.isArray(timestamps) && timestamps.length > 0 && timestamps.every((value) => Number.isFinite(Date.parse(value)));
  const activeStatuses = new Set(["confermata", "in_preparazione", "in_distribuzione"]);
  const completedStatuses = new Set(["completata", "report_pronto"]);
  const acceptedStatuses = new Set(["confermata", "in_preparazione", "in_distribuzione", "completata"]);
  const pendingQuoteStatuses = new Set(["preventivo", "in_preparazione", "inviato"]);

  const specs = {
    "client.home.active_campaigns": statusReady ? { value: statuses.filter((status) => activeStatuses.has(status)).length, formula: "count(status in activeStatuses)", inputs: ["campaigns[].stato"] } : null,
    "client.home.completed_campaigns": statusReady ? { value: statuses.filter((status) => completedStatuses.has(status)).length, formula: "count(status in completedStatuses)", inputs: ["campaigns[].stato"] } : null,
    "client.home.pending_quotes": statusReady ? { value: rows.filter((row, index) => pendingQuoteStatuses.has(statuses[index]) || Boolean(objectMetadata(row).quote_summary)).length, formula: "count(status in pendingQuoteStatuses OR metadata.quote_summary)", inputs: ["campaigns[].stato", "campaigns[].metadata.quote_summary"] } : null,
    "client.home.accepted_quotes": statusReady ? { value: statuses.filter((status) => acceptedStatuses.has(status)).length, formula: "count(status in acceptedStatuses)", inputs: ["campaigns[].stato"] } : null,
    "client.home.pending_payments": paymentReady ? { value: payments.filter((status) => status !== "pagato").length, formula: "count(stato_pagamento != 'pagato')", inputs: ["campaigns[].stato_pagamento"] } : null,
    "client.home.received_payments": paymentReady ? { value: payments.filter((status) => status === "pagato").length, formula: "count(stato_pagamento == 'pagato')", inputs: ["campaigns[].stato_pagamento"] } : null,
    "client.home.available_reports": statusReady ? { value: statuses.filter((status) => completedStatuses.has(status)).length, formula: "count(status in completedStatuses)", inputs: ["campaigns[].stato"] } : null,
    "client.home.total_spent": totalsReady ? { value: totals.reduce((sum, value) => sum + value, 0), formula: "sum(totale_euro || total_amount)", inputs: ["campaigns[].totale_euro", "campaigns[].total_amount"] } : null,
    "client.home.last_update": timestampReady ? { value: [...timestamps].sort().pop(), formula: "max(updated_at || created_at)", inputs: ["campaigns[].updated_at", "campaigns[].created_at"] } : null,
  };

  const items = HOME_KPI_DEFINITIONS.map((definition) => {
    const spec = specs[definition.id];
    const base = spec
      ? createAiDatum({
        id: definition.id, kind: AI_DATUM_KINDS.KPI, label: definition.label,
        category: AI_DATA_CATEGORIES.DERIVED, value: spec.value,
        valueType: definition.valueType ?? AI_VALUE_TYPES.COUNT, unit: definition.unit ?? null,
        sources: [sourceId], observedAt: campaignsState.observedAt, staleAfterMs: campaignsState.staleAfterMs,
        derivation: { criterion: "Aggregazione deterministica delle campagne gia filtrate dall'hook Cliente.", formula: spec.formula, inputs: spec.inputs, assumptions: ["La collezione in ingresso contiene esclusivamente campagne autorizzate per il Cliente."] },
        permission,
      }, { now })
      : unavailable({ id: definition.id, label: definition.label, valueType: definition.valueType ?? AI_VALUE_TYPES.COUNT, unit: definition.unit ?? null, sources: [sourceId], state: campaignsState, reason: rows ? "Uno o piu campi necessari non sono disponibili nella collezione campagne." : null, now });
    return project(base, AI_RESOURCES.OWN_CAMPAIGN_SUMMARY, own, now);
  });

  const itemById = Object.fromEntries(items.map((item) => [item.id, item]));
  const attention = [];
  const addAttention = (id, label, message, sourceItem) => {
    if (sourceItem?.category === AI_DATA_CATEGORIES.UNAVAILABLE || sourceItem?.value <= 0) return;
    attention.push(createAiDatum({
      id, kind: AI_DATUM_KINDS.INSIGHT, label, category: AI_DATA_CATEGORIES.DERIVED,
      value: message(sourceItem.value), valueType: AI_VALUE_TYPES.STRING,
      sources: [sourceId], observedAt: sourceItem.observedAt, freshness: sourceItem.freshness,
      derivation: { criterion: `Segnalazione presente solo quando ${sourceItem.id} e maggiore di zero.`, formula: `${sourceItem.id} > 0`, inputs: [sourceItem.id], assumptions: ["Nessuna priorita o regola operativa aggiuntiva applicata."] },
      permission,
    }, { now }));
  };
  addAttention("client.home.attention.pending_payments", "Pagamenti da verificare", (value) => `${value} ${value === 1 ? "campagna risulta" : "campagne risultano"} in attesa di pagamento.`, itemById["client.home.pending_payments"]);
  addAttention("client.home.attention.pending_quotes", "Preventivi in attesa", (value) => `${value} ${value === 1 ? "preventivo richiede" : "preventivi richiedono"} ancora una decisione.`, itemById["client.home.pending_quotes"]);

  return Object.freeze({ audience, generatedAt: new Date(now).toISOString(), sourceStatus: campaignsState.status, items: Object.freeze(items), attention: Object.freeze(attention) });
}
