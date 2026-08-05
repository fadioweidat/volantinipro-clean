import { aiField, unavailableField, AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from "./fieldTypes.js";
import {
  active,
  isLate,
  nonTestCampaigns,
  realCampaigns,
  attention,
  openQuotes,
} from "../../ai-foundation/integrations/admin-dashboard/adminDashboardAdapters.mjs";

const SOURCE = "admin_dashboard_snapshot";
const now = () => new Date().toISOString();
const cleanText = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const truncate = (value, max) => (typeof value === "string" ? value.slice(0, max) : value);

/**
 * Costruisce il contesto AI Admin. Nessuna query qui dentro: legge soltanto
 * i dati gia' caricati dalla Dashboard Admin reale (stesse regole di
 * classificazione campagna gia' verificate in adminDashboardAdapters.mjs,
 * riusate — non duplicate).
 *
 * Ritorna `null` se l'identita' non e' un Admin verificato: nessun contesto
 * Admin viene mai costruito per un ruolo diverso, indipendentemente da cosa
 * viene passato come props/argomenti a chi chiama questa funzione.
 */
export function buildAdminAiContext(adminIdentity, { campaigns = [], availability = {}, operators = [], operatorsSummary = {} } = {}) {
  const role = adminIdentity?.role;
  const subjectId = adminIdentity?.user?.id;
  if (!subjectId || !["admin", "super_admin"].includes(role)) return null;

  const snapshot = { campaigns };
  const nonTest = nonTestCampaigns(snapshot);
  const real = realCampaigns(snapshot);
  const lateRows = real.filter(isLate);
  const attentionRows = attention(snapshot);
  const openQuoteRows = openQuotes(snapshot);
  const incompleteRows = nonTest.filter((row) => row.quality === "incomplete" || (row.reference == null));
  const activeRows = real.filter(active);

  const campaignsAvailable = availability?.campaigns === true;
  const photosAvailable = availability?.photos === true;

  const campaignCounts = {
    total: campaignsAvailable ? aiField(real.length, { type: AI_FIELD_TYPES.REAL, source: SOURCE, updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }) : unavailableField(SOURCE),
    active: campaignsAvailable ? aiField(activeRows.length, { type: AI_FIELD_TYPES.REAL, source: SOURCE, updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }) : unavailableField(SOURCE),
    late: campaignsAvailable ? aiField(lateRows.length, { type: AI_FIELD_TYPES.DERIVED, source: SOURCE, updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }) : unavailableField(SOURCE),
    attention: campaignsAvailable ? aiField(attentionRows.length, { type: AI_FIELD_TYPES.DERIVED, source: SOURCE, updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.MEDIUM }) : unavailableField(SOURCE),
    openQuotes: campaignsAvailable ? aiField(openQuoteRows.length, { type: AI_FIELD_TYPES.REAL, source: SOURCE, updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }) : unavailableField(SOURCE),
    incomplete: campaignsAvailable ? aiField(incompleteRows.length, { type: AI_FIELD_TYPES.REAL, source: SOURCE, updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }) : unavailableField(SOURCE),
  };

  // Elenco campagne critiche/da attenzione, gia' sanificato dalle stesse
  // regole del tool Admin esistente (nessun dato cliente grezzo, nessun
  // prezzo ricalcolato — il totale, quando presente, arriva gia' letto dal
  // record campagna/motore prezzi, mai ricomputato qui).
  const criticalCampaignList = attentionRows.slice(0, 20).map((row) => ({
    reference: row.reference,
    clientLabel: row.clientLabel,
    status: row.status,
    zone: row.zone,
    endDate: row.endDate,
    attentionRules: row.attentionRules,
    operational: row.operational,
  }));

  const campaignsWithoutPhotos = photosAvailable
    ? activeRows.filter((row) => !row.operational || !Number.isFinite(row.operational.progress) || row.operational.progress === 0).slice(0, 20).map((row) => ({ reference: row.reference, clientLabel: row.clientLabel, zone: row.zone }))
    : null;

  const unassignedGroups = campaignsAvailable
    ? activeRows.filter((row) => !row.operational || !row.operational.groups).slice(0, 20).map((row) => ({ reference: row.reference, clientLabel: row.clientLabel, zone: row.zone }))
    : null;

  const operatorList = Array.isArray(operators) ? operators.slice(0, 30).map((item) => ({
    operatorLabel: truncate(cleanText(item.driverName) || "Operatore non nominato", 60),
    groupLabel: truncate(cleanText(item.groupName) || null, 60),
    lifecycle: item.lifecycle || null,
    lastPing: item.lastPing || item.activityAt || null,
    distanceKm: Number.isFinite(item.km) ? Number(item.km) : null,
  })) : [];

  const staleOperators = operatorList.filter((item) => item.lifecycle === "warning");

  return Object.freeze({
    scope: "admin_operations",
    generatedAt: now(),
    identity: Object.freeze({ subjectId: String(subjectId), role }),
    campaigns: Object.freeze(campaignCounts),
    criticalCampaigns: Object.freeze(criticalCampaignList),
    campaignsWithoutPhotos: campaignsWithoutPhotos ? Object.freeze(campaignsWithoutPhotos) : unavailableField(SOURCE),
    unassignedGroups: unassignedGroups ? Object.freeze(unassignedGroups) : unavailableField(SOURCE),
    operators: Object.freeze({
      live: aiField(Number.isFinite(operatorsSummary.liveCount) ? operatorsSummary.liveCount : null, { type: AI_FIELD_TYPES.REAL, source: "gps_live_operators_summary", updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      warning: aiField(Number.isFinite(operatorsSummary.warningCount) ? operatorsSummary.warningCount : null, { type: AI_FIELD_TYPES.REAL, source: "gps_live_operators_summary", updatedAt: now(), confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      inactiveOrStale: Object.freeze(staleOperators),
      list: Object.freeze(operatorList),
    }),
    dataAvailability: Object.freeze({
      campaigns: campaignsAvailable,
      photos: photosAvailable,
      waitlist: availability?.waitlist === true,
      activities: availability?.activities === true,
    }),
  });
}
