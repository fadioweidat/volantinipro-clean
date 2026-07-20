import {
  AI_AUDIENCES,
  AI_DATA_CATEGORIES,
  AI_FRESHNESS_STATES,
  AI_UNAVAILABLE_CODES,
} from "./insight-contract.js";
import { AI_RESOURCES, projectAiPermissions } from "./projectAiPermissions.js";

export const AI_NOTIFICATION_LEVELS = Object.freeze({
  ATTENTION: "richiede attenzione",
  VERIFY: "da verificare",
  INFORMATION: "informativo",
  UNAVAILABLE: "non disponibile",
});

export const AI_NOTIFICATION_STATES = Object.freeze({
  READY: "ready",
  MISSING: "missing",
  ERROR: "error",
  DENIED: "denied",
});

const CLIENT_ROUTE = "/dashboard";
const REPORT_ID = "client.home.available_reports";

function stateFor(datum) {
  if (datum?.permission?.allowed === false || datum?.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED) return AI_NOTIFICATION_STATES.DENIED;
  if (datum?.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR) return AI_NOTIFICATION_STATES.ERROR;
  if (datum?.category === AI_DATA_CATEGORIES.UNAVAILABLE || datum?.value === null) return AI_NOTIFICATION_STATES.MISSING;
  return AI_NOTIFICATION_STATES.READY;
}

function makeNotification({ datum, level, description, href = null }) {
  const state = stateFor(datum);
  const denied = state === AI_NOTIFICATION_STATES.DENIED;
  return Object.freeze({
    id: `client.notification.${datum.id}`,
    audience: AI_AUDIENCES.CLIENT,
    title: datum.label,
    description: denied ? "Il contenuto non viene esposto perche l'accesso alla fonte non e autorizzato." : description,
    level: denied || state !== AI_NOTIFICATION_STATES.READY ? AI_NOTIFICATION_LEVELS.UNAVAILABLE : level,
    category: datum.category,
    state,
    timestamp: denied ? null : datum.observedAt,
    href: state === AI_NOTIFICATION_STATES.READY ? href : null,
    unavailableReason: datum.unavailable?.reason ?? null,
    datum,
  });
}

function project(datum, context, now) {
  return projectAiPermissions(datum, {
    audience: AI_AUDIENCES.CLIENT,
    resource: AI_RESOURCES.OWN_CAMPAIGN_SUMMARY,
    context: { ownershipConfirmed: context.ownershipConfirmed === true },
    now,
  });
}

export function buildClientNotifications({ insights = {}, context = {}, now = new Date() } = {}) {
  const generatedAt = new Date(now).toISOString();
  if (context.authorized !== true || context.role !== "cliente") {
    return Object.freeze({ audience: AI_AUDIENCES.CLIENT, access: "denied", generatedAt, notifications: Object.freeze([]), authorizedCount: 0 });
  }

  const notifications = [];
  const seen = new Set();
  const attention = Array.isArray(insights.attention) ? insights.attention : [];
  const items = Array.isArray(insights.items) ? insights.items : [];

  for (const source of attention) {
    const datum = project(source, context, now);
    seen.add(datum.id);
    notifications.push(makeNotification({ datum, level: AI_NOTIFICATION_LEVELS.ATTENTION, description: datum.value, href: CLIENT_ROUTE }));
  }

  for (const source of items) {
    if (!source || seen.has(source.id)) continue;
    const datum = project(source, context, now);
    const state = stateFor(datum);
    if (state !== AI_NOTIFICATION_STATES.READY) {
      notifications.push(makeNotification({ datum, level: AI_NOTIFICATION_LEVELS.UNAVAILABLE, description: datum.unavailable?.reason ?? "Dato non disponibile." }));
      continue;
    }
    if (datum.freshness?.state === AI_FRESHNESS_STATES.STALE) {
      notifications.push(makeNotification({ datum, level: AI_NOTIFICATION_LEVELS.VERIFY, description: `${datum.label}: la fonte supera la soglia di freshness dichiarata.`, href: CLIENT_ROUTE }));
      continue;
    }
    if (datum.id === REPORT_ID && Number.isFinite(datum.value) && datum.value > 0) {
      notifications.push(makeNotification({ datum, level: AI_NOTIFICATION_LEVELS.INFORMATION, description: `${datum.value} ${datum.value === 1 ? "report finale risulta disponibile" : "report finali risultano disponibili"}.`, href: CLIENT_ROUTE }));
    }
  }

  return Object.freeze({
    audience: AI_AUDIENCES.CLIENT,
    access: "allowed",
    generatedAt,
    notifications: Object.freeze(notifications),
    authorizedCount: notifications.filter((item) => item.state !== AI_NOTIFICATION_STATES.DENIED).length,
  });
}
