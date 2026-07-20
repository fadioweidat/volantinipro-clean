import { AI_AUDIENCES } from "./insight-contract.js";
import { AI_NOTIFICATION_LEVELS, AI_NOTIFICATION_STATES } from "./buildClientNotifications.js";
import { ADMIN_DECISION_LEVELS } from "./buildAdminDecisionItems.js";

const ALLOWED_ROUTES = new Set(["/admin/live", "/admin/anomalie", "/admin/finance", "#campagne-attive"]);
const LEVEL_MAP = Object.freeze({
  [ADMIN_DECISION_LEVELS.ACTION]: AI_NOTIFICATION_LEVELS.ATTENTION,
  [ADMIN_DECISION_LEVELS.VERIFY]: AI_NOTIFICATION_LEVELS.VERIFY,
  [ADMIN_DECISION_LEVELS.INFORMATION]: AI_NOTIFICATION_LEVELS.INFORMATION,
  [ADMIN_DECISION_LEVELS.UNAVAILABLE]: AI_NOTIFICATION_LEVELS.UNAVAILABLE,
});

export function buildAdminNotifications({ decisionCenter = {}, context = {}, now = new Date() } = {}) {
  const generatedAt = new Date(now).toISOString();
  if (context.authorized !== true || !["admin", "super_admin"].includes(context.role) || decisionCenter.access !== "allowed") {
    return Object.freeze({ audience: AI_AUDIENCES.ADMIN, access: "denied", generatedAt, notifications: Object.freeze([]), authorizedCount: 0 });
  }

  const notifications = (Array.isArray(decisionCenter.items) ? decisionCenter.items : []).map((item) => {
    const denied = item.state === AI_NOTIFICATION_STATES.DENIED;
    const ready = item.state === AI_NOTIFICATION_STATES.READY;
    return Object.freeze({
      id: `admin.notification.${item.insightId}`,
      audience: AI_AUDIENCES.ADMIN,
      title: item.title,
      description: denied ? "Il contenuto non viene esposto perche l'accesso alla fonte non e autorizzato." : item.description,
      level: denied ? AI_NOTIFICATION_LEVELS.UNAVAILABLE : LEVEL_MAP[item.level] ?? AI_NOTIFICATION_LEVELS.UNAVAILABLE,
      category: item.datum.category,
      state: item.state,
      timestamp: denied ? null : item.timestamp,
      href: ready && ALLOWED_ROUTES.has(item.href) ? item.href : null,
      unavailableReason: item.datum.unavailable?.reason ?? null,
      datum: item.datum,
    });
  });

  return Object.freeze({
    audience: AI_AUDIENCES.ADMIN,
    access: "allowed",
    generatedAt,
    notifications: Object.freeze(notifications),
    authorizedCount: notifications.filter((item) => item.state !== AI_NOTIFICATION_STATES.DENIED).length,
  });
}
