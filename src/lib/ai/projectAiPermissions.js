import {
  AI_AUDIENCES,
  AI_DATA_CATEGORIES,
  AI_UNAVAILABLE_CODES,
  createUnavailableAiDatum,
} from "./insight-contract.js";

export const AI_RESOURCES = Object.freeze({
  OWN_CAMPAIGN_SUMMARY: "own_campaign_summary",
  OWN_CAMPAIGN_TRACKING: "own_campaign_tracking",
  OWN_APPROVED_PHOTOS: "own_approved_photos",
  OWN_CAMPAIGN_REPORT: "own_campaign_report",
  OWN_CAMPAIGN_HISTORY: "own_campaign_history",
  ALL_CAMPAIGNS: "all_campaigns",
  OPERATIONS: "operations",
  RAW_GPS: "raw_gps",
  ALL_PROOF_PHOTOS: "all_proof_photos",
  ANOMALIES: "anomalies",
  WAITLIST: "waitlist",
  AUDIT: "audit",
});

const clientResources = new Set([
  AI_RESOURCES.OWN_CAMPAIGN_SUMMARY,
  AI_RESOURCES.OWN_CAMPAIGN_TRACKING,
  AI_RESOURCES.OWN_APPROVED_PHOTOS,
  AI_RESOURCES.OWN_CAMPAIGN_REPORT,
  AI_RESOURCES.OWN_CAMPAIGN_HISTORY,
]);
const adminResources = new Set(Object.values(AI_RESOURCES));

export function evaluateAiPermission(audience, resource, context = {}) {
  if (audience === AI_AUDIENCES.ADMIN) {
    return adminResources.has(resource)
      ? { allowed: true, reason: null }
      : { allowed: false, reason: "Risorsa AI non riconosciuta per la proiezione Admin." };
  }
  if (audience !== AI_AUDIENCES.CLIENT || !clientResources.has(resource)) {
    return { allowed: false, reason: "La risorsa non e disponibile al ruolo Cliente." };
  }
  if (context.ownershipConfirmed !== true) {
    return { allowed: false, reason: "La titolarita della campagna per il cliente non e confermata." };
  }
  if (resource === AI_RESOURCES.OWN_APPROVED_PHOTOS && context.approvedOnly !== true) {
    return { allowed: false, reason: "Il Cliente puo ricevere soltanto foto approvate." };
  }
  if (resource === AI_RESOURCES.OWN_CAMPAIGN_TRACKING && context.clientTrackingEnabled !== true) {
    return { allowed: false, reason: "Il tracking Cliente non e acquistato o non risulta abilitato." };
  }
  return { allowed: true, reason: null };
}

export function projectAiPermissions(datum, { audience, resource, context = {}, now = new Date() }) {
  const decision = evaluateAiPermission(audience, resource, context);
  if (decision.allowed) {
    if (datum.category === AI_DATA_CATEGORIES.UNAVAILABLE && datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED) {
      return Object.freeze({
        ...datum,
        permission: Object.freeze({ audience, allowed: false, reason: datum.unavailable.reason }),
      });
    }
    if (datum.permission.audience === audience && datum.permission.allowed === true) return datum;
    return Object.freeze({
      ...datum,
      permission: Object.freeze({ audience, allowed: true, reason: null }),
    });
  }
  return createUnavailableAiDatum({
    id: datum.id,
    kind: datum.kind,
    label: datum.label,
    description: datum.description,
    valueType: datum.valueType,
    unit: datum.unit,
    sources: datum.sources,
    permission: { audience, allowed: false, reason: decision.reason },
    unavailableCode: AI_UNAVAILABLE_CODES.ACCESS_DENIED,
    unavailableReason: decision.reason,
  }, { now });
}
