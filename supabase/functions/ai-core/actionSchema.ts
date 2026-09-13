/**
 * Action Schema and Audit Log Definition for ai-core Edge Function.
 * Phase 5A: Controlled actions only. Zero autonomous mutations.
 */

export const ACTION_TYPES = Object.freeze({
  NAVIGATE: "navigate",
  PREVIEW_MUTATION: "preview_mutation",
  CONFIRMED_MUTATION: "confirmed_mutation",
});

export interface AuditLogEntry {
  actor_id: string;
  role: string;
  action_type: string;
  entity_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export const ALLOWED_NAVIGATION_ROUTES: Record<string, Set<string>> = Object.freeze({
  admin: new Set([
    "admin",
    "admin-clients-quotes",
    "admin-operations",
    "admin-assignments",
    "admin-gps",
    "admin-communications",
    "admin-suppliers",
    "admin-analytics",
  ]),
  customer: new Set([
    "dashboard",
    "campaign",
    "customer-tracking",
    "customer-report",
    "customer-payment",
    "messages",
  ]),
  driver: new Set([
    "driver-assignment",
    "driver-map",
    "driver-pod",
  ]),
  supplier: new Set([
    "supplier",
    "supplier-dashboard",
    "supplier-job",
    "supplier-assignment",
    "supplier-request",
  ]),
});

export function validateAction(action: any): { valid: boolean; error?: string } {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return { valid: false, error: "Action must be a non-null object" };
  }

  const { type } = action;
  if (!Object.values(ACTION_TYPES).includes(type)) {
    return { valid: false, error: `Unsupported action type: ${type}` };
  }

  if (type === ACTION_TYPES.NAVIGATE) {
    if (!action.route || typeof action.route !== "string") {
      return { valid: false, error: "Navigation action requires a valid route string" };
    }
    return { valid: true };
  }

  if (type === ACTION_TYPES.PREVIEW_MUTATION) {
    if (!action.action || typeof action.action !== "string") {
      return { valid: false, error: "Preview mutation requires an action name" };
    }
    if (!action.summary || typeof action.summary !== "string") {
      return { valid: false, error: "Preview mutation requires a summary explanation" };
    }
    if (!Array.isArray(action.consequences) || action.consequences.length === 0) {
      return { valid: false, error: "Preview mutation requires at least one consequence item" };
    }
    return { valid: true };
  }

  if (type === ACTION_TYPES.CONFIRMED_MUTATION) {
    if (!action.action || typeof action.action !== "string") {
      return { valid: false, error: "Confirmed mutation requires an action name" };
    }
    if (!action.entityId) {
      return { valid: false, error: "Confirmed mutation requires an entityId" };
    }
    return { valid: true };
  }

  return { valid: false, error: "Unknown action validation path" };
}

export function isSafeNavigationAction(action: any, role: string): boolean {
  if (!action || action.type !== ACTION_TYPES.NAVIGATE) return false;
  const roleRoutes = ALLOWED_NAVIGATION_ROUTES[role?.toLowerCase()];
  if (!roleRoutes) return false;

  const baseRoute = String(action.route || "").split(":")[0].toLowerCase();
  return roleRoutes.has(baseRoute);
}

export function validateMutationPreview(preview: any): boolean {
  if (!preview || preview.type !== ACTION_TYPES.PREVIEW_MUTATION) return false;
  if (!preview.action || typeof preview.action !== "string") return false;
  if (!preview.summary || typeof preview.summary !== "string") return false;
  if (!Array.isArray(preview.consequences) || preview.consequences.length === 0) return false;
  return true;
}

export function buildAuditLogEntry(params: {
  actorId: string;
  role: string;
  actionType: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): AuditLogEntry {
  if (!params.actorId) throw new Error("Audit log requires actorId");
  if (!params.role) throw new Error("Audit log requires role");
  if (!params.actionType) throw new Error("Audit log requires actionType");
  if (!params.entityId) throw new Error("Audit log requires entityId");

  return {
    actor_id: params.actorId,
    role: params.role,
    action_type: params.actionType,
    entity_id: params.entityId,
    before_state: params.beforeState || null,
    after_state: params.afterState || null,
    metadata: params.metadata || {},
    timestamp: new Date().toISOString(),
  };
}

export function computeActionExecutionKey(action: any): string {
  if (!action) return "unknown";
  if (action.action === "admin_send_message") {
    const normText = String(action.messageText || "").trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normText.length; i++) {
      hash = ((hash << 5) - hash) + normText.charCodeAt(i);
      hash |= 0;
    }
    const textHash = Math.abs(hash).toString(16);
    return `admin_send_message:${action.recipientType || "user"}:${action.entityId || "none"}:${textHash}`;
  }
  const id = action.entityId || action.targetZoneId || action.campaignId || action.route || "general";
  const type = action.type || "unknown";
  const name = action.action || action.route || "default";
  return `${type}:${name}:${id}`;
}

