import { AI_DATA_SCOPES, AI_ROLES } from "../contracts.js";

const roleScopes = Object.freeze({
  [AI_ROLES.VISITOR]: new Set([AI_DATA_SCOPES.PUBLIC]),
  [AI_ROLES.CLIENT]: new Set([AI_DATA_SCOPES.PUBLIC, AI_DATA_SCOPES.CUSTOMER]),
  [AI_ROLES.SUPPLIER]: new Set([AI_DATA_SCOPES.PUBLIC, AI_DATA_SCOPES.ASSIGNED_JOBS]),
  [AI_ROLES.ADMIN]: new Set(Object.values(AI_DATA_SCOPES)),
});

export class AiPermissionPolicy {
  authorize(user, requestedScope) {
    const allowed = roleScopes[user?.role]?.has(requestedScope) === true;
    if (!allowed) return Object.freeze({ allowed: false, reason: "scope_not_allowed", scope: null });
    if (requestedScope !== AI_DATA_SCOPES.PUBLIC && !user?.authenticated) {
      return Object.freeze({ allowed: false, reason: "authentication_required", scope: null });
    }
    if (requestedScope === AI_DATA_SCOPES.CUSTOMER && !user?.customerId) {
      return Object.freeze({ allowed: false, reason: "customer_identity_required", scope: null });
    }
    const scope = requestedScope === AI_DATA_SCOPES.CUSTOMER
      ? { kind: requestedScope, customerId: user.customerId, subjectId: user.id }
      : requestedScope === AI_DATA_SCOPES.ASSIGNED_JOBS
        ? { kind: requestedScope, supplierId: user.id, assignedOnly: true }
        : requestedScope === AI_DATA_SCOPES.ADMIN
          ? { kind: requestedScope, unrestricted: true, subjectId: user.id }
          : { kind: AI_DATA_SCOPES.PUBLIC };
    return Object.freeze({ allowed: true, reason: null, scope: Object.freeze(scope) });
  }
}
