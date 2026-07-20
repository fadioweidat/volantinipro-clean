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

const audience = AI_AUDIENCES.ADMIN;
const permission = { audience, allowed: true };

const definitions = Object.freeze([
  { key: "campaigns", id: "admin.campaigns.count", label: "Campagne disponibili", unit: "campagne", source: AI_SOURCE_IDS.CAMPAIGNS, resource: AI_RESOURCES.ALL_CAMPAIGNS },
  { key: "sessions", id: "admin.sessions.count", label: "Sessioni disponibili", unit: "sessioni", source: AI_SOURCE_IDS.DELIVERY_SESSIONS, resource: AI_RESOURCES.OPERATIONS },
  { key: "gpsPoints", id: "admin.gps_points.count", label: "Punti GPS disponibili", unit: "punti", source: AI_SOURCE_IDS.GPS_POINTS, resource: AI_RESOURCES.RAW_GPS },
  { key: "proofPhotos", id: "admin.proof_photos.count", label: "Foto disponibili", unit: "foto", source: AI_SOURCE_IDS.PROOF_PHOTOS, resource: AI_RESOURCES.ALL_PROOF_PHOTOS },
  { key: "anomalies", id: "admin.anomalies.count", label: "Anomalie gia rilevate", unit: "anomalie", source: AI_SOURCE_IDS.AUDIT_LOG, resource: AI_RESOURCES.ANOMALIES },
  { key: "waitlist", id: "admin.waitlist.count", label: "Richieste in coda", unit: "richieste", source: AI_SOURCE_IDS.WAITLIST, resource: AI_RESOURCES.WAITLIST },
]);

function buildCount(definition, state, now) {
  if (state.status === AI_SOURCE_LOAD_STATES.READY && Array.isArray(state.data)) {
    return createAiDatum({
      id: definition.id, kind: AI_DATUM_KINDS.KPI, label: definition.label,
      category: AI_DATA_CATEGORIES.DERIVED, value: state.data.length,
      valueType: AI_VALUE_TYPES.COUNT, unit: definition.unit, sources: [definition.source],
      observedAt: state.observedAt, staleAfterMs: state.staleAfterMs,
      derivation: { criterion: `Conteggio dei record caricati dalla fonte ${definition.source}.`, formula: `${definition.key}.length`, inputs: [definition.key] },
      permission,
    }, { now });
  }
  const denied = state.status === AI_SOURCE_LOAD_STATES.DENIED;
  return createUnavailableAiDatum({
    id: definition.id, kind: AI_DATUM_KINDS.KPI, label: definition.label,
    valueType: AI_VALUE_TYPES.COUNT, unit: definition.unit, sources: [definition.source],
    permission: { audience, allowed: !denied, reason: denied ? state.reason : null },
    unavailableCode: denied ? AI_UNAVAILABLE_CODES.ACCESS_DENIED : state.status === AI_SOURCE_LOAD_STATES.ERROR ? AI_UNAVAILABLE_CODES.SOURCE_ERROR : AI_UNAVAILABLE_CODES.MISSING,
    unavailableReason: state.reason ?? "La collezione non e disponibile.",
  }, { now });
}

export function buildAdminInsights({ sources = {}, now = new Date() } = {}) {
  const items = definitions.map((definition) => {
    const state = readAiSourceState(sources, definition.key);
    const datum = buildCount(definition, state, now);
    return projectAiPermissions(datum, { audience, resource: definition.resource, now });
  });
  return Object.freeze({ audience, generatedAt: new Date(now).toISOString(), items: Object.freeze(items) });
}

const dashboardDefinitions = Object.freeze([
  { key: "activeCampaigns", id: "admin.home.active_campaigns", label: "Campagne in distribuzione", valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.activeCampaigns" },
  { key: "completedCampaigns", id: "admin.home.completed_campaigns", label: "Campagne completate", valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.completedCampaigns" },
  { key: "lateCampaigns", id: "admin.home.late_campaigns", label: "Campagne in ritardo", valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.lateCampaigns" },
  { key: "liveSessions", id: "admin.home.live_sessions", label: "Sessioni GPS live", valueType: AI_VALUE_TYPES.COUNT, unit: "sessioni", sourceKeys: ["sessions"], sourceIds: [AI_SOURCE_IDS.DELIVERY_SESSIONS], formula: "snapshot.liveSessions" },
  { key: "operatorStatus", id: "admin.home.operator_status", label: "Operatori online/offline", valueType: AI_VALUE_TYPES.STRING, sourceKeys: ["campaigns", "sessions"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS, AI_SOURCE_IDS.DELIVERY_SESSIONS], formula: "`${snapshot.onlineOperators}/${snapshot.offlineOperators}`" },
  { key: "pendingCampaigns", id: "admin.home.pending_campaigns", label: "Campagne in attesa", valueType: AI_VALUE_TYPES.COUNT, unit: "campagne", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.pendingCampaigns" },
  { key: "activeClients", id: "admin.home.active_clients", label: "Clienti attivi", valueType: AI_VALUE_TYPES.COUNT, unit: "clienti", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.activeClients" },
  { key: "pendingRequests", id: "admin.home.pending_requests", label: "Nuovi preventivi/richieste", valueType: AI_VALUE_TYPES.COUNT, unit: "richieste", sourceKeys: ["waitlist"], sourceIds: [AI_SOURCE_IDS.WAITLIST], formula: "snapshot.pendingRequests" },
  { key: "totalRevenue", id: "admin.home.total_revenue", label: "Revenue totale", valueType: AI_VALUE_TYPES.CURRENCY, unit: "EUR", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.totalRevenue" },
  { key: "avgCpm", id: "admin.home.average_cpm", label: "CPM medio", valueType: AI_VALUE_TYPES.CURRENCY, unit: "EUR/1000 volantini", sourceKeys: ["campaigns"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], formula: "snapshot.avgCpm" },
  { key: "alarmCount", id: "admin.home.active_alarms", label: "Allarmi attivi", valueType: AI_VALUE_TYPES.COUNT, unit: "allarmi", sourceKeys: ["campaigns", "sessions", "gpsPoints", "proofPhotos"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS, AI_SOURCE_IDS.DELIVERY_SESSIONS, AI_SOURCE_IDS.GPS_POINTS, AI_SOURCE_IDS.PROOF_PHOTOS], formula: "snapshot.alarmCount" },
  { key: "lastUpdate", id: "admin.home.last_update", label: "Ultimo aggiornamento", valueType: AI_VALUE_TYPES.DATE, sourceKeys: ["campaigns", "gpsPoints", "activities"], sourceIds: [AI_SOURCE_IDS.CAMPAIGNS, AI_SOURCE_IDS.GPS_POINTS, AI_SOURCE_IDS.ACTIVITY_LOG], formula: "snapshot.lastUpdate", anySource: true },
]);

function unavailableState(states) {
  return states.find((state) => state.status === AI_SOURCE_LOAD_STATES.DENIED)
    ?? states.find((state) => state.status === AI_SOURCE_LOAD_STATES.ERROR)
    ?? states.find((state) => state.status === AI_SOURCE_LOAD_STATES.MISSING)
    ?? null;
}

function buildDashboardDatum(definition, snapshot, sourceStates, now) {
  const states = definition.sourceKeys.map((key) => sourceStates[key]);
  const ready = definition.anySource
    ? states.some((state) => state.status === AI_SOURCE_LOAD_STATES.READY)
    : states.every((state) => state.status === AI_SOURCE_LOAD_STATES.READY);
  const value = snapshot?.[definition.key];
  const valuePresent = value !== null && value !== undefined && value !== "";
  const observedAt = states.map((state) => state.observedAt).filter(Boolean).sort().pop() ?? null;
  const staleAfterMs = states.map((state) => state.staleAfterMs).filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;
  if (ready && valuePresent) {
    return createAiDatum({
      id: definition.id, kind: AI_DATUM_KINDS.KPI, label: definition.label,
      category: AI_DATA_CATEGORIES.DERIVED, value, valueType: definition.valueType,
      unit: definition.unit ?? null, sources: definition.sourceIds, observedAt, staleAfterMs,
      derivation: {
        criterion: "Proiezione del KPI gia calcolato dalla Dashboard Admin esistente; il builder AI non lo ricalcola.",
        formula: definition.formula,
        inputs: definition.sourceKeys.map((key) => `sources.${key}`),
        assumptions: ["Il valore snapshot proviene esclusivamente dalle funzioni operative esistenti."],
      },
      permission,
    }, { now });
  }
  const failed = unavailableState(states);
  const denied = failed?.status === AI_SOURCE_LOAD_STATES.DENIED;
  return createUnavailableAiDatum({
    id: definition.id, kind: AI_DATUM_KINDS.KPI, label: definition.label,
    valueType: definition.valueType, unit: definition.unit ?? null, sources: definition.sourceIds,
    permission: { audience, allowed: !denied, reason: denied ? failed.reason : null },
    unavailableCode: denied ? AI_UNAVAILABLE_CODES.ACCESS_DENIED : failed?.status === AI_SOURCE_LOAD_STATES.ERROR ? AI_UNAVAILABLE_CODES.SOURCE_ERROR : AI_UNAVAILABLE_CODES.MISSING,
    unavailableReason: failed?.reason ?? `Il KPI ${definition.label} non e disponibile nello snapshot operativo.`,
  }, { now });
}

function makeAttention({ id, label, value, message, sourceIds, observedAt, formula, inputs, href, now }) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const datum = createAiDatum({
    id, kind: AI_DATUM_KINDS.INSIGHT, label, category: AI_DATA_CATEGORIES.DERIVED,
    value: message(value), valueType: AI_VALUE_TYPES.STRING, sources: sourceIds,
    observedAt, staleAfterMs: 5 * 60 * 1000,
    derivation: {
      criterion: "Spiegazione deterministica di un conteggio gia prodotto dal sistema operativo esistente.",
      formula, inputs,
      assumptions: ["Nessuna nuova priorita, classificazione o azione automatica applicata."],
    },
    permission,
  }, { now });
  return Object.freeze({ datum, href });
}

export function buildAdminDashboardInsights({ sources = {}, snapshot = {}, now = new Date() } = {}) {
  const sourceStates = {
    campaigns: readAiSourceState(sources, "campaigns"),
    sessions: readAiSourceState(sources, "sessions"),
    gpsPoints: readAiSourceState(sources, "gpsPoints"),
    proofPhotos: readAiSourceState(sources, "proofPhotos"),
    waitlist: readAiSourceState(sources, "waitlist"),
    activities: readAiSourceState(sources, "activities"),
  };
  const items = dashboardDefinitions.map((definition) => {
    const datum = buildDashboardDatum(definition, snapshot, sourceStates, now);
    const resource = definition.sourceKeys.includes("waitlist") ? AI_RESOURCES.WAITLIST
      : definition.sourceKeys.includes("gpsPoints") ? AI_RESOURCES.RAW_GPS
        : definition.sourceKeys.includes("sessions") ? AI_RESOURCES.OPERATIONS
          : AI_RESOURCES.ALL_CAMPAIGNS;
    return projectAiPermissions(datum, { audience, resource, now });
  });
  const allReady = (keys) => keys.every((key) => sourceStates[key].status === AI_SOURCE_LOAD_STATES.READY);
  const observedAt = snapshot.lastUpdate ?? null;
  const attention = [
    makeAttention({ id: "admin.home.attention.late_campaigns", label: "Campagne in ritardo", value: allReady(["campaigns"]) ? snapshot.lateCampaigns : null, message: (value) => `${value} ${value === 1 ? "campagna ha" : "campagne hanno"} superato la data finale gia registrata.`, sourceIds: [AI_SOURCE_IDS.CAMPAIGNS], observedAt, formula: "snapshot.lateCampaigns > 0", inputs: ["snapshot.lateCampaigns"], href: "#campagne-attive", now }),
    makeAttention({ id: "admin.home.attention.offline_operators", label: "Operatori inattivi", value: allReady(["sessions", "gpsPoints"]) ? snapshot.offlineOperators : null, message: (value) => `${value} ${value === 1 ? "operatore risulta" : "operatori risultano"} offline nei dati operativi esistenti.`, sourceIds: [AI_SOURCE_IDS.DELIVERY_SESSIONS, AI_SOURCE_IDS.GPS_POINTS], observedAt, formula: "snapshot.offlineOperators > 0", inputs: ["snapshot.offlineOperators"], href: "/admin/live", now }),
    makeAttention({ id: "admin.home.attention.operational_problems", label: "Anomalie gia rilevate", value: allReady(["campaigns", "sessions", "gpsPoints", "proofPhotos"]) ? snapshot.opsProblems : null, message: (value) => `${value} ${value === 1 ? "problema operativo e gia associato" : "problemi operativi sono gia associati"} alle campagne.`, sourceIds: [AI_SOURCE_IDS.CAMPAIGNS, AI_SOURCE_IDS.DELIVERY_SESSIONS, AI_SOURCE_IDS.GPS_POINTS, AI_SOURCE_IDS.PROOF_PHOTOS], observedAt, formula: "snapshot.opsProblems > 0", inputs: ["campaigns[].ops.problems"], href: "/admin/anomalie", now }),
    makeAttention({ id: "admin.home.attention.pending_requests", label: "Richieste in attesa", value: allReady(["waitlist"]) ? snapshot.pendingRequests : null, message: (value) => `${value} ${value === 1 ? "richiesta risulta" : "richieste risultano"} ancora da gestire.`, sourceIds: [AI_SOURCE_IDS.WAITLIST], observedAt, formula: "snapshot.pendingRequests > 0", inputs: ["snapshot.pendingRequests"], href: null, now }),
  ].filter(Boolean);
  const attentionKeys = ["campaigns", "sessions", "gpsPoints", "proofPhotos", "waitlist"];
  const attentionStates = attentionKeys.map((key) => sourceStates[key]);
  const attentionState = attentionStates.some((state) => state.status === AI_SOURCE_LOAD_STATES.DENIED) ? "denied"
    : attentionStates.some((state) => state.status === AI_SOURCE_LOAD_STATES.ERROR) ? "error"
      : attentionStates.some((state) => state.status !== AI_SOURCE_LOAD_STATES.READY) ? "partial"
        : attention.length ? "ready" : "empty";
  return Object.freeze({
    audience,
    generatedAt: new Date(now).toISOString(),
    items: Object.freeze(items),
    attention: Object.freeze(attention),
    attentionState,
  });
}
