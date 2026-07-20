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

function metadataOf(campaign) {
  if (!campaign?.metadata) return {};
  if (typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata)) return campaign.metadata;
  try { return JSON.parse(campaign.metadata) || {}; } catch { return {}; }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function percentage(value) { const number = finite(value); return number !== null && number >= 0 && number <= 100 ? number : null; }
function nonNegative(value) { const number = finite(value); return number !== null && number >= 0 ? number : null; }

function collection(campaign, keys) {
  for (const key of keys) if (Array.isArray(campaign?.[key])) return campaign[key];
  return null;
}

function deniedState(reason) {
  return { status: AI_SOURCE_LOAD_STATES.DENIED, reason };
}

function unavailable({ id, label, valueType, unit = null, sources, state, reason, code = null, now }) {
  const denied = state.status === AI_SOURCE_LOAD_STATES.DENIED;
  return createUnavailableAiDatum({
    id,
    kind: AI_DATUM_KINDS.KPI,
    label,
    valueType,
    unit,
    sources,
    permission: { audience, allowed: !denied, reason: denied ? state.reason : null },
    unavailableCode: code ?? (denied ? AI_UNAVAILABLE_CODES.ACCESS_DENIED : state.status === AI_SOURCE_LOAD_STATES.ERROR ? AI_UNAVAILABLE_CODES.SOURCE_ERROR : AI_UNAVAILABLE_CODES.MISSING),
    unavailableReason: reason ?? state.reason ?? "Il dato non e disponibile nella fonte autorizzata.",
  }, { now });
}

function real({ id, label, value, valueType, unit = null, sources, observedAt, staleAfterMs, now }) {
  return createAiDatum({ id, kind: AI_DATUM_KINDS.KPI, label, category: AI_DATA_CATEGORIES.REAL, value, valueType, unit, sources, observedAt, staleAfterMs, permission: { audience, allowed: true } }, { now });
}

function derived({ id, label, value, valueType, unit = null, sources, observedAt, staleAfterMs, criterion, inputs, now }) {
  return createAiDatum({ id, kind: AI_DATUM_KINDS.KPI, label, category: AI_DATA_CATEGORIES.DERIVED, value, valueType, unit, sources, observedAt, staleAfterMs, derivation: { criterion, inputs, assumptions: ["Sono usati soltanto valori gia presenti nelle fonti autorizzate."] }, permission: { audience, allowed: true } }, { now });
}

export function projectClientCampaignReportSourceData(campaign) {
  const metadata = metadataOf(campaign);
  const municipalities = Array.isArray(metadata.selected_comuni) ? metadata.selected_comuni
    : Array.isArray(campaign?.comuni_selezionati) ? campaign.comuni_selezionati
      : Array.isArray(campaign?.comuni) ? campaign.comuni
        : null;
  return Object.freeze({
    status: campaign?.stato ?? campaign?.status ?? null,
    distributedQuantity: campaign?.volantini_distribuiti ?? metadata.volantini_distribuiti ?? null,
    municipalities,
    plannedCoveragePercent: metadata.copertura_pct ?? campaign?.copertura_pct ?? campaign?.planned_coverage_percent ?? null,
    plannedCoverageFormula: metadata.coverage_formula ?? campaign?.coverage_formula ?? null,
    plannedCoverageAssumptions: Array.isArray(metadata.coverage_assumptions) ? metadata.coverage_assumptions : [],
    finalCoveragePercent: campaign?.copertura_rilevata_pct ?? campaign?.copertura_finale_cliente_percent ?? campaign?.detected_coverage_percent ?? metadata.copertura_rilevata_pct ?? null,
    startDate: campaign?.data_inizio ?? campaign?.start_date ?? null,
    endDate: campaign?.data_fine ?? campaign?.end_date ?? campaign?.completed_at ?? null,
    gpsPoints: collection(campaign, ["gps_punti", "gps_points", "tracking_points"]),
    photos: collection(campaign, ["foto_proof", "proof_photos", "photos"]),
  });
}

export function buildClientCampaignReportInsights({ sources = {}, context = {}, now = new Date() } = {}) {
  const ownershipConfirmed = context.ownershipConfirmed === true;
  const approvedOnly = context.approvedOnly === true;
  const ownershipDenied = deniedState("La proprieta del report non e stata confermata per la sessione Cliente.");
  const photosDenied = deniedState("La fonte fotografica non e confermata come filtrata alle sole foto approvate.");
  const safeSources = ownershipConfirmed ? {
    campaign: sources.campaign,
    gpsPoints: sources.gpsPoints,
    approvedPhotos: approvedOnly ? sources.approvedPhotos : photosDenied,
    finalCoverage: sources.finalCoverage,
  } : { campaign: ownershipDenied, gpsPoints: ownershipDenied, approvedPhotos: ownershipDenied, finalCoverage: ownershipDenied };
  const campaignState = readAiSourceState(safeSources, "campaign");
  const gpsState = readAiSourceState(safeSources, "gpsPoints");
  const photoState = readAiSourceState(safeSources, "approvedPhotos");
  const coverageState = readAiSourceState(safeSources, "finalCoverage");
  const campaign = campaignState.data ?? {};
  const sourceId = context.campaignSourceId === AI_SOURCE_IDS.CAMPAIGNS ? AI_SOURCE_IDS.CAMPAIGNS : AI_SOURCE_IDS.LEGACY_CAMPAIGNS;
  const campaignSources = [sourceId];
  const campaignReady = campaignState.status === AI_SOURCE_LOAD_STATES.READY;
  const makeUnavailable = (id, label, valueType, unit, state = campaignState, reason = null) => unavailable({ id, label, valueType, unit, sources: state === gpsState ? [AI_SOURCE_IDS.GPS_POINTS] : state === photoState ? [AI_SOURCE_IDS.PROOF_PHOTOS] : state === coverageState ? [AI_SOURCE_IDS.COVERAGE_CORRECTIONS, sourceId] : campaignSources, state, reason, now });

  const status = campaignReady && typeof campaign.status === "string" && campaign.status.trim()
    ? real({ id: "client.report.status", label: "Stato finale registrato", value: campaign.status, valueType: AI_VALUE_TYPES.STRING, sources: campaignSources, observedAt: campaignState.observedAt, staleAfterMs: campaignState.staleAfterMs, now })
    : makeUnavailable("client.report.status", "Stato finale registrato", AI_VALUE_TYPES.STRING);
  const distributedQuantity = campaignReady && nonNegative(campaign.distributedQuantity) !== null
    ? real({ id: "client.report.distributed_quantity", label: "Quantita distribuita", value: nonNegative(campaign.distributedQuantity), valueType: AI_VALUE_TYPES.NUMBER, unit: "volantini", sources: campaignSources, observedAt: campaignState.observedAt, staleAfterMs: campaignState.staleAfterMs, now })
    : makeUnavailable("client.report.distributed_quantity", "Quantita distribuita", AI_VALUE_TYPES.NUMBER, "volantini", campaignState, "La campagna non espone una quantita distribuita finale.");
  const municipalities = campaignReady && Array.isArray(campaign.municipalities)
    ? derived({ id: "client.report.municipalities_count", label: "Comuni coinvolti", value: campaign.municipalities.length, valueType: AI_VALUE_TYPES.COUNT, unit: "comuni", sources: campaignSources, observedAt: campaignState.observedAt, staleAfterMs: campaignState.staleAfterMs, criterion: "Conteggio degli elementi della lista comuni gia memorizzata nel report.", inputs: ["campaign.municipalities"], now })
    : makeUnavailable("client.report.municipalities_count", "Comuni coinvolti", AI_VALUE_TYPES.COUNT, "comuni", campaignState, "La lista dei comuni non e disponibile.");
  const plannedCoverage = campaignReady && percentage(campaign.plannedCoveragePercent) !== null
    ? createAiDatum({ id: "client.report.planned_coverage", kind: AI_DATUM_KINDS.KPI, label: "Copertura prevista", category: AI_DATA_CATEGORIES.ESTIMATE, value: percentage(campaign.plannedCoveragePercent), valueType: AI_VALUE_TYPES.PERCENTAGE, unit: "%", sources: campaignSources, observedAt: campaignState.observedAt, staleAfterMs: campaignState.staleAfterMs, derivation: { criterion: "Valore di copertura prevista gia memorizzato dal sistema; nessun ricalcolo AI.", formula: campaign.plannedCoverageFormula || null, inputs: ["campaign.plannedCoveragePercent"], assumptions: campaign.plannedCoverageAssumptions ?? [] }, permission: { audience, allowed: true } }, { now })
    : makeUnavailable("client.report.planned_coverage", "Copertura prevista", AI_VALUE_TYPES.PERCENTAGE, "%", campaignState, "La copertura prevista non e presente nel report.");
  const finalCoverage = coverageState.status === AI_SOURCE_LOAD_STATES.READY && percentage(coverageState.data) !== null
    ? derived({ id: "client.report.final_coverage", label: "Copertura finale", value: percentage(coverageState.data), valueType: AI_VALUE_TYPES.PERCENTAGE, unit: "%", sources: [AI_SOURCE_IDS.COVERAGE_CORRECTIONS, sourceId], observedAt: coverageState.observedAt, staleAfterMs: coverageState.staleAfterMs, criterion: "Proiezione del valore finale gia prodotto dal sistema operativo; nessun ricalcolo AI.", inputs: ["campaign.finalCoveragePercent"], now })
    : makeUnavailable("client.report.final_coverage", "Copertura finale", AI_VALUE_TYPES.PERCENTAGE, "%", coverageState, "La copertura finale non e disponibile nella campagna.");
  const gpsCount = gpsState.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(gpsState.data)
    ? derived({ id: "client.report.gps_points_count", label: "Punti GPS disponibili", value: gpsState.data.length, valueType: AI_VALUE_TYPES.COUNT, unit: "punti", sources: [AI_SOURCE_IDS.GPS_POINTS], observedAt: gpsState.observedAt, staleAfterMs: gpsState.staleAfterMs, criterion: "Conteggio dei punti GPS autorizzati; coordinate e percorsi non vengono esposti.", inputs: ["gpsPoints.length"], now })
    : makeUnavailable("client.report.gps_points_count", "Punti GPS disponibili", AI_VALUE_TYPES.COUNT, "punti", gpsState);
  const photoCount = photoState.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(photoState.data)
    ? derived({ id: "client.report.approved_photos_count", label: "Foto approvate", value: photoState.data.length, valueType: AI_VALUE_TYPES.COUNT, unit: "foto", sources: [AI_SOURCE_IDS.PROOF_PHOTOS], observedAt: photoState.observedAt, staleAfterMs: photoState.staleAfterMs, criterion: "Conteggio delle sole foto gia approvate prima della costruzione dell'insight.", inputs: ["approvedPhotos.length"], now })
    : makeUnavailable("client.report.approved_photos_count", "Foto approvate", AI_VALUE_TYPES.COUNT, "foto", photoState);
  const endDate = campaignReady && campaign.endDate && Number.isFinite(Date.parse(campaign.endDate))
    ? real({ id: "client.report.end_date", label: "Data finale disponibile", value: new Date(campaign.endDate).toISOString(), valueType: AI_VALUE_TYPES.DATE, sources: campaignSources, observedAt: campaignState.observedAt, staleAfterMs: campaignState.staleAfterMs, now })
    : makeUnavailable("client.report.end_date", "Data finale disponibile", AI_VALUE_TYPES.DATE, null, campaignState, "La campagna non espone una data finale valida.");

  const items = [status, distributedQuantity, municipalities, plannedCoverage, finalCoverage, gpsCount, photoCount, endDate]
    .map((datum) => projectAiPermissions(datum, { audience, resource: AI_RESOURCES.OWN_CAMPAIGN_REPORT, context: { ownershipConfirmed }, now }));
  return Object.freeze({ audience, campaignId: ownershipConfirmed ? context.campaignId ?? null : null, generatedAt: new Date(now).toISOString(), ownershipConfirmed, items: Object.freeze(items) });
}
