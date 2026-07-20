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
import { buildClientInsights } from "./buildClientInsights.js";
import { AI_SOURCE_IDS } from "./source-labels.js";

const audience = AI_AUDIENCES.CLIENT;

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") return {};
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, "base64").toString("utf8"));
  } catch { return {}; }
}

export function confirmClientCampaignOwnership(campaign, session) {
  if (!campaign || !session) return false;
  const payload = decodeJwtPayload(session.accessToken ?? session.access_token);
  const user = session.user ?? {};
  const identityIds = [user.id, payload.sub, session.userId].filter(Boolean).map(String);
  const identityEmails = [user.email, payload.email, session.email].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  const campaignIds = [campaign.user_id, campaign.owner_id, campaign.auth_user_id, campaign.cliente?.user_id, campaign.client?.user_id].filter(Boolean).map(String);
  const campaignEmails = [campaign.client_email, campaign.cliente_email, campaign.email_cliente, campaign.cliente?.email, campaign.client?.email].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  return campaignIds.some((value) => identityIds.includes(value)) || campaignEmails.some((value) => identityEmails.includes(value));
}

export function isClientTrackingEnabled(campaign) {
  if (!campaign) return false;
  if ([campaign.tracking_enabled, campaign.gps_enabled, campaign.tracking_gps].some((value) => value === true)) return true;
  const metadata = parseMetadata(campaign.metadata);
  if ([metadata.tracking_enabled, metadata.gps_enabled, metadata.tracking_gps].some((value) => value === true)) return true;
  const collections = [campaign.servizi_extra, campaign.extra_services, metadata.servizi_extra, metadata.extra_services, metadata.quote_summary?.extras];
  const tokens = collections.flatMap((value) => Array.isArray(value) ? value : []).flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    return [entry?.id, entry?.addId, entry?.name, entry?.label].filter(Boolean);
  }).map((value) => String(value).toLowerCase());
  return tokens.some((token) => ["tracking_gps", "tracking gps", "gps live", "gps_default"].some((key) => token.includes(key)));
}

export function projectClientCampaignSourceData(campaign) {
  const metadata = parseMetadata(campaign?.metadata);
  const municipalities = Array.isArray(metadata.selected_comuni) ? metadata.selected_comuni
    : Array.isArray(campaign?.comuni) ? campaign.comuni
      : Array.isArray(campaign?.comuni_selezionati) ? campaign.comuni_selezionati
        : undefined;
  return Object.freeze({
    status: campaign?.stato ?? campaign?.status,
    quantity: campaign?.quantita ?? campaign?.flyer_quantity ?? metadata.volantini_inseriti,
    municipalities,
    plannedCoveragePercent: metadata.copertura_pct ?? campaign?.copertura_pct ?? campaign?.planned_coverage_percent,
    plannedCoverageFormula: metadata.coverage_formula ?? campaign?.coverage_formula ?? null,
    plannedCoverageAssumptions: Array.isArray(metadata.coverage_assumptions) ? metadata.coverage_assumptions : [],
  });
}

export function filterApprovedClientPhotos(photos) {
  if (!Array.isArray(photos)) return Object.freeze([]);
  return Object.freeze(photos.filter((photo) => Boolean(photo?.approved_at) || photo?.status === "approved" || photo?.approved === true));
}

function denied(reason) {
  return { status: AI_SOURCE_LOAD_STATES.DENIED, reason };
}

function unavailable({ id, label, valueType, unit = null, sourceIds, state, reason, now }) {
  const isDenied = state.status === AI_SOURCE_LOAD_STATES.DENIED;
  return createUnavailableAiDatum({
    id, kind: AI_DATUM_KINDS.KPI, label, valueType, unit, sources: sourceIds,
    permission: { audience, allowed: !isDenied, reason: isDenied ? state.reason : null },
    unavailableCode: isDenied ? AI_UNAVAILABLE_CODES.ACCESS_DENIED : state.status === AI_SOURCE_LOAD_STATES.ERROR ? AI_UNAVAILABLE_CODES.SOURCE_ERROR : AI_UNAVAILABLE_CODES.MISSING,
    unavailableReason: reason ?? state.reason ?? "Il dato non è disponibile nella fonte autorizzata.",
  }, { now });
}

export function buildClientCampaignInsights({ sources = {}, context = {}, now = new Date() } = {}) {
  const ownershipConfirmed = context.ownershipConfirmed === true;
  const trackingEnabled = context.clientTrackingEnabled === true;
  const approvedOnly = context.approvedOnly === true;
  const ownershipDenied = denied("La proprietà della campagna non è stata confermata per la sessione Cliente.");
  const trackingDenied = denied("Il tracking Cliente non è acquistato, abilitato o autorizzato.");
  const photosDenied = denied("La fonte non è confermata come filtrata alle sole foto approvate.");
  const safeSources = ownershipConfirmed ? {
    campaign: sources.campaign,
    gpsPoints: trackingEnabled ? sources.gpsPoints : trackingDenied,
    approvedPhotos: approvedOnly ? sources.approvedPhotos : photosDenied,
    coverageMetrics: trackingEnabled ? sources.coverageMetrics : trackingDenied,
  } : { campaign: ownershipDenied, gpsPoints: ownershipDenied, approvedPhotos: ownershipDenied, coverageMetrics: ownershipDenied };
  const campaignState = readAiSourceState(safeSources, "campaign");
  const gpsState = readAiSourceState(safeSources, "gpsPoints");
  const campaignSourceId = context.campaignSourceId === AI_SOURCE_IDS.CAMPAIGNS ? AI_SOURCE_IDS.CAMPAIGNS : AI_SOURCE_IDS.LEGACY_CAMPAIGNS;
  const base = buildClientInsights({
    sources: safeSources,
    context: { ownershipConfirmed, clientTrackingEnabled: trackingEnabled, approvedOnly, campaignSourceId },
    now,
  });
  const statusValue = campaignState.data?.status;
  const status = campaignState.status === AI_SOURCE_LOAD_STATES.READY && typeof statusValue === "string" && statusValue.trim() !== ""
    ? createAiDatum({ id: "client.campaign.status", kind: AI_DATUM_KINDS.KPI, label: "Stato campagna", category: AI_DATA_CATEGORIES.REAL, value: statusValue, valueType: AI_VALUE_TYPES.STRING, sources: [campaignSourceId], observedAt: campaignState.observedAt, staleAfterMs: campaignState.staleAfterMs, permission: { audience, allowed: true } }, { now })
    : unavailable({ id: "client.campaign.status", label: "Stato campagna", valueType: AI_VALUE_TYPES.STRING, sourceIds: [campaignSourceId], state: campaignState, now });
  const lastGpsUpdate = gpsState.status === AI_SOURCE_LOAD_STATES.READY && gpsState.observedAt
    ? createAiDatum({ id: "client.tracking.last_update", kind: AI_DATUM_KINDS.KPI, label: "Ultimo aggiornamento GPS", category: AI_DATA_CATEGORIES.REAL, value: new Date(gpsState.observedAt).toISOString(), valueType: AI_VALUE_TYPES.DATE, sources: [AI_SOURCE_IDS.GPS_POINTS], observedAt: gpsState.observedAt, staleAfterMs: gpsState.staleAfterMs, permission: { audience, allowed: true } }, { now })
    : unavailable({ id: "client.tracking.last_update", label: "Ultimo aggiornamento GPS", valueType: AI_VALUE_TYPES.DATE, sourceIds: [AI_SOURCE_IDS.GPS_POINTS], state: gpsState, reason: gpsState.status === AI_SOURCE_LOAD_STATES.READY ? "La fonte GPS non espone un timestamp utilizzabile." : null, now });
  return Object.freeze({
    audience,
    campaignId: ownershipConfirmed ? context.campaignId ?? null : null,
    generatedAt: new Date(now).toISOString(),
    ownershipConfirmed,
    trackingEnabled,
    items: Object.freeze([status, ...base.items, lastGpsUpdate]),
  });
}
