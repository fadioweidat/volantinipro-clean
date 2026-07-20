import { confirmClientCampaignOwnership, filterApprovedClientPhotos } from "./buildClientCampaignInsights.js";
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
export const CLIENT_HISTORY_QUANTITY_RATIO_LIMIT = 1.25;
export const CLIENT_COMPLETED_CAMPAIGN_STATES = Object.freeze(["completata", "completed", "report_pronto", "report_ready", "conclusa", "finished"]);
export const CLIENT_HISTORY_COMPARABILITY_CRITERIA = Object.freeze([
  "La campagna corrente e la campagna storica devono essere concluse.",
  "La tipologia di servizio deve coincidere.",
  "Il rapporto tra la quantita maggiore e quella minore non deve superare 1,25.",
  "Il numero di comuni deve coincidere.",
  "Devono essere disponibili gli stessi gruppi di metriche: copertura finale, GPS e foto approvate.",
]);

function metadataOf(campaign) {
  if (!campaign?.metadata) return {};
  if (typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata)) return campaign.metadata;
  try { return JSON.parse(campaign.metadata) || {}; } catch { return {}; }
}
function finite(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function normalized(value) { return String(value ?? "").trim().toLowerCase(); }
function isCompleted(campaign) { return CLIENT_COMPLETED_CAMPAIGN_STATES.includes(normalized(campaign?.stato ?? campaign?.status)); }
function municipalitiesOf(campaign) { const meta = metadataOf(campaign); const list = Array.isArray(meta.selected_comuni) ? meta.selected_comuni : Array.isArray(campaign?.comuni_selezionati) ? campaign.comuni_selezionati : Array.isArray(campaign?.comuni) ? campaign.comuni : null; return list; }
function quantityOf(campaign) { const meta = metadataOf(campaign); return finite(campaign?.quantita ?? campaign?.flyer_quantity ?? meta.volantini_inseriti); }
function serviceOf(campaign) { return normalized(campaign?.servizio ?? campaign?.service_type); }
function finalCoverageOf(campaign) { const meta = metadataOf(campaign); const value = finite(campaign?.copertura_rilevata_pct ?? campaign?.copertura_finale_cliente_percent ?? campaign?.detected_coverage_percent ?? meta.copertura_rilevata_pct); return value !== null && value >= 0 && value <= 100 ? value : null; }
function gpsOf(campaign) { for (const key of ["gps_punti", "gps_points", "tracking_points"]) if (Array.isArray(campaign?.[key])) return campaign[key]; return null; }
function photosOf(campaign) { for (const key of ["foto_proof", "proof_photos", "photos"]) if (Array.isArray(campaign?.[key])) return filterApprovedClientPhotos(campaign[key]); return null; }
function signature(campaign) { return { coverage: finalCoverageOf(campaign) !== null, gps: Array.isArray(gpsOf(campaign)), photos: Array.isArray(photosOf(campaign)) }; }

export function filterOwnedCompletedClientCampaigns(campaigns, { session, currentCampaignId = null } = {}) {
  if (!Array.isArray(campaigns) || !session) return Object.freeze([]);
  return Object.freeze(campaigns.filter((campaign) => String(campaign?.id) !== String(currentCampaignId) && isCompleted(campaign) && confirmClientCampaignOwnership(campaign, session)));
}

export function evaluateClientCampaignComparability(currentCampaign, historicalCampaign) {
  const reasons = [];
  if (!isCompleted(currentCampaign) || !isCompleted(historicalCampaign)) reasons.push("stato_non_concluso");
  if (!serviceOf(currentCampaign) || serviceOf(currentCampaign) !== serviceOf(historicalCampaign)) reasons.push("tipologia_diversa");
  const currentQuantity = quantityOf(currentCampaign); const historicalQuantity = quantityOf(historicalCampaign);
  if (currentQuantity === null || historicalQuantity === null || currentQuantity <= 0 || historicalQuantity <= 0 || Math.max(currentQuantity, historicalQuantity) / Math.min(currentQuantity, historicalQuantity) > CLIENT_HISTORY_QUANTITY_RATIO_LIMIT) reasons.push("quantita_non_compatibile");
  const currentMunicipalities = municipalitiesOf(currentCampaign); const historicalMunicipalities = municipalitiesOf(historicalCampaign);
  if (!Array.isArray(currentMunicipalities) || !Array.isArray(historicalMunicipalities) || currentMunicipalities.length !== historicalMunicipalities.length) reasons.push("numero_comuni_diverso");
  const currentSignature = signature(currentCampaign); const historicalSignature = signature(historicalCampaign);
  if (Object.keys(currentSignature).some((key) => currentSignature[key] !== historicalSignature[key])) reasons.push("metriche_non_omogenee");
  return Object.freeze({ comparable: reasons.length === 0, reasons: Object.freeze(reasons), criteria: CLIENT_HISTORY_COMPARABILITY_CRITERIA });
}

function unavailable({ id, label, sourceState, reason, denied = false, valueType = AI_VALUE_TYPES.STRING, now }) {
  const accessDenied = denied || sourceState.status === AI_SOURCE_LOAD_STATES.DENIED;
  return createUnavailableAiDatum({ id, kind: AI_DATUM_KINDS.INSIGHT, label, valueType, sources: [AI_SOURCE_IDS.LEGACY_CAMPAIGNS], permission: { audience, allowed: !accessDenied, reason: accessDenied ? reason : null }, unavailableCode: accessDenied ? AI_UNAVAILABLE_CODES.ACCESS_DENIED : sourceState.status === AI_SOURCE_LOAD_STATES.ERROR ? AI_UNAVAILABLE_CODES.SOURCE_ERROR : AI_UNAVAILABLE_CODES.MISSING, unavailableReason: reason }, { now });
}
function derived({ id, label, value, valueType = AI_VALUE_TYPES.STRING, unit = null, sourceState, criterion, inputs, now }) { return createAiDatum({ id, kind: AI_DATUM_KINDS.INSIGHT, label, category: AI_DATA_CATEGORIES.DERIVED, value, valueType, unit, sources: [AI_SOURCE_IDS.LEGACY_CAMPAIGNS], observedAt: sourceState.observedAt, staleAfterMs: sourceState.staleAfterMs, derivation: { criterion, inputs, assumptions: CLIENT_HISTORY_COMPARABILITY_CRITERIA }, permission: { audience, allowed: true } }, { now }); }
function projectHistoryItems(items, ownershipConfirmed, now) { return Object.freeze(items.map((datum) => projectAiPermissions(datum, { audience, resource: AI_RESOURCES.OWN_CAMPAIGN_HISTORY, context: { ownershipConfirmed }, now }))); }

export function buildClientHistoricalSuggestions({ currentCampaign = null, sources = {}, context = {}, now = new Date() } = {}) {
  const ownershipConfirmed = context.ownershipConfirmed === true && context.historyOwnershipConfirmed === true;
  const historyState = ownershipConfirmed ? readAiSourceState(sources, "history") : { status: AI_SOURCE_LOAD_STATES.DENIED, data: null, observedAt: null, staleAfterMs: null, reason: "La titolarita dello storico Cliente non e confermata." };
  const denied = historyState.status === AI_SOURCE_LOAD_STATES.DENIED;
  if (!ownershipConfirmed || historyState.status !== AI_SOURCE_LOAD_STATES.READY || !Array.isArray(historyState.data)) {
    const reason = historyState.reason || "Lo storico Cliente non e disponibile.";
    const items = [
      unavailable({ id: "client.report.history.comparable_count", label: "Campagne storiche comparabili", sourceState: historyState, reason, denied, valueType: AI_VALUE_TYPES.COUNT, now }),
      unavailable({ id: "client.report.history.coverage_comparison", label: "Confronto copertura finale", sourceState: historyState, reason, denied, now }),
      unavailable({ id: "client.report.history.evidence_comparison", label: "Confronto disponibilita prove", sourceState: historyState, reason, denied, now }),
    ];
    return Object.freeze({ audience, criteria: CLIENT_HISTORY_COMPARABILITY_CRITERIA, comparableCampaignIds: Object.freeze([]), items: projectHistoryItems(items, ownershipConfirmed, now) });
  }
  if (!isCompleted(currentCampaign)) {
    const reason = "La campagna corrente non risulta conclusa; il confronto storico non e applicabile.";
    const missingState = { ...historyState, status: AI_SOURCE_LOAD_STATES.MISSING };
    const items = [
      derived({ id: "client.report.history.comparable_count", label: "Campagne storiche comparabili", value: 0, valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sourceState: historyState, criterion: "Conteggio delle campagne che soddisfano tutti i criteri dichiarati.", inputs: ["history"], now }),
      unavailable({ id: "client.report.history.coverage_comparison", label: "Confronto copertura finale", sourceState: missingState, reason, now }),
      unavailable({ id: "client.report.history.evidence_comparison", label: "Confronto disponibilita prove", sourceState: missingState, reason, now }),
    ];
    return Object.freeze({ audience, criteria: CLIENT_HISTORY_COMPARABILITY_CRITERIA, comparableCampaignIds: Object.freeze([]), items: projectHistoryItems(items, ownershipConfirmed, now) });
  }
  const comparable = historyState.data.filter((campaign) => evaluateClientCampaignComparability(currentCampaign, campaign).comparable);
  const count = derived({ id: "client.report.history.comparable_count", label: "Campagne storiche comparabili", value: comparable.length, valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sourceState: historyState, criterion: "Conteggio delle campagne Cliente concluse che soddisfano tutti i criteri di comparabilita dichiarati.", inputs: ["history", "currentCampaign"], now });
  if (comparable.length === 0) {
    const reason = "Nessuna campagna storica dello stesso Cliente soddisfa tutti i criteri di comparabilita dichiarati.";
    const missingState = { ...historyState, status: AI_SOURCE_LOAD_STATES.MISSING };
    return Object.freeze({ audience, criteria: CLIENT_HISTORY_COMPARABILITY_CRITERIA, comparableCampaignIds: Object.freeze([]), items: projectHistoryItems([count, unavailable({ id: "client.report.history.coverage_comparison", label: "Confronto copertura finale", sourceState: missingState, reason, now }), unavailable({ id: "client.report.history.evidence_comparison", label: "Confronto disponibilita prove", sourceState: missingState, reason, now })], ownershipConfirmed, now) });
  }
  const currentCoverage = finalCoverageOf(currentCampaign);
  const coverageValues = comparable.map(finalCoverageOf);
  const coverage = currentCoverage !== null && coverageValues.every((value) => value !== null)
    ? derived({ id: "client.report.history.coverage_comparison", label: "Confronto copertura finale", value: `Superiore a ${coverageValues.filter((value) => currentCoverage > value).length}, uguale a ${coverageValues.filter((value) => currentCoverage === value).length}, inferiore a ${coverageValues.filter((value) => currentCoverage < value).length} campagne comparabili.`, sourceState: historyState, criterion: "Confronto diretto del valore finale memorizzato, senza media, benchmark o previsione.", inputs: ["current.finalCoveragePercent", "comparable.finalCoveragePercent"], now })
    : unavailable({ id: "client.report.history.coverage_comparison", label: "Confronto copertura finale", sourceState: { ...historyState, status: AI_SOURCE_LOAD_STATES.MISSING }, reason: "La copertura finale non e disponibile in tutte le campagne comparabili.", now });
  const currentGps = gpsOf(currentCampaign); const currentPhotos = photosOf(currentCampaign);
  const gpsCounts = comparable.map((campaign) => gpsOf(campaign)?.length); const photoCounts = comparable.map((campaign) => photosOf(campaign)?.length);
  const evidence = Array.isArray(currentGps) && Array.isArray(currentPhotos) && gpsCounts.every(Number.isInteger) && photoCounts.every(Number.isInteger)
    ? derived({ id: "client.report.history.evidence_comparison", label: "Confronto disponibilita prove", value: `GPS piu numerosi in ${gpsCounts.filter((value) => currentGps.length > value).length} casi e foto approvate piu numerose in ${photoCounts.filter((value) => currentPhotos.length > value).length} casi comparabili.`, sourceState: historyState, criterion: "Confronto descrittivo dei conteggi gia disponibili; nessuna valutazione di operatori o qualita.", inputs: ["current.gpsPoints.length", "current.approvedPhotos.length", "comparable.gpsPoints.length", "comparable.approvedPhotos.length"], now })
    : unavailable({ id: "client.report.history.evidence_comparison", label: "Confronto disponibilita prove", sourceState: { ...historyState, status: AI_SOURCE_LOAD_STATES.MISSING }, reason: "GPS o foto approvate non sono disponibili in tutte le campagne comparabili.", now });
  return Object.freeze({ audience, criteria: CLIENT_HISTORY_COMPARABILITY_CRITERIA, comparableCampaignIds: Object.freeze(comparable.map((campaign) => campaign.id).filter(Boolean)), items: projectHistoryItems([count, coverage, evidence], ownershipConfirmed, now) });
}
