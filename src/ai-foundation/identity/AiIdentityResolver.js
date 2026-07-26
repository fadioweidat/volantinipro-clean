import { AI_ROLES } from "../contracts.js";

const ROLE_ALIASES = Object.freeze({
  client: AI_ROLES.CLIENT,
  cliente: AI_ROLES.CLIENT,
  customer: AI_ROLES.CLIENT,
  supplier: AI_ROLES.SUPPLIER,
  provider: AI_ROLES.SUPPLIER,
  fornitore: AI_ROLES.SUPPLIER,
  admin: AI_ROLES.ADMIN,
  super_admin: AI_ROLES.ADMIN,
});

/** Risolve soltanto identità già autenticate. Ambiguità e ruoli ignoti falliscono a Visitatore. */
export class AiIdentityResolver {
  resolve({ authUser = null, profile = null, customerId = null } = {}) {
    if (!authUser?.id) return Object.freeze({ id: null, customerId: null, email: null, role: AI_ROLES.VISITOR, authenticated: false });
    const rawRole = typeof profile?.role === "string" ? profile.role.trim().toLowerCase() : "";
    const role = ROLE_ALIASES[rawRole] ?? AI_ROLES.VISITOR;
    if (role === AI_ROLES.VISITOR) {
      return Object.freeze({ id: null, customerId: null, email: null, role, authenticated: false });
    }
    return Object.freeze({
      id: String(authUser.id),
      customerId: role === AI_ROLES.CLIENT && customerId ? String(customerId) : null,
      email: typeof authUser.email === "string" ? authUser.email : null,
      role,
      authenticated: true,
    });
  }
}
