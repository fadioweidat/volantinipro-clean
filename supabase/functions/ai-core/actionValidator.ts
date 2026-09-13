/**
 * Server-Side Action Validation and Authorization Re-Check Framework.
 * Phase 5A: Never trust frontend role, ownership, or AI-generated IDs.
 */

import {
  ACTION_TYPES,
  isSafeNavigationAction,
  validateAction,
  validateMutationPreview,
  buildAuditLogEntry,
  type AuditLogEntry,
} from "./actionSchema.ts";

export interface ActionValidationResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
  auditEntry?: AuditLogEntry;
}

/**
 * Validates an action request with strict server-side authorization and ownership re-checks.
 *
 * @param supabase - Supabase client with admin/service role access
 * @param actor - Verified authenticated actor { id, role } or driver token
 * @param action - Action object to validate
 * @returns {Promise<ActionValidationResult>}
 */
export async function validateActionServerSide(
  supabase: any,
  actor: { id: string; role: string; accessToken?: string } | null,
  action: any
): Promise<ActionValidationResult> {
  // 1. Basic schema validation
  const schemaCheck = validateAction(action);
  if (!schemaCheck.valid) {
    return { allowed: false, error: schemaCheck.error || "INVALID_ACTION_SCHEMA", statusCode: 400 };
  }

  // 2. Safe Navigation check
  if (action.type === ACTION_TYPES.NAVIGATE) {
    const role = actor?.role || "guest";
    if (!isSafeNavigationAction(action, role)) {
      return { allowed: false, error: "NAVIGATION_ROUTE_FORBIDDEN", statusCode: 403 };
    }
    return { allowed: true };
  }

  // 3. For any mutation (preview or confirmed), actor MUST be authenticated
  if (!actor || !actor.id) {
    return { allowed: false, error: "AUTHENTICATION_REQUIRED", statusCode: 401 };
  }

  // 4. Preview Mutation check: safe inspection, zero database write
  if (action.type === ACTION_TYPES.PREVIEW_MUTATION) {
    if (!validateMutationPreview(action)) {
      return { allowed: false, error: "INVALID_MUTATION_PREVIEW", statusCode: 400 };
    }
    // Previews are informational and safe: allowed as long as schema is valid
    return { allowed: true };
  }

  // 5. Confirmed Mutation check: Strict re-check of role and entity ownership
  if (action.type === ACTION_TYPES.CONFIRMED_MUTATION) {
    const { action: mutationName, entityId } = action;

    // Role verification against database
    if (actor.role === "admin") {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", actor.id)
        .maybeSingle();
      if (pErr || profile?.role !== "admin") {
        return { allowed: false, error: "FORBIDDEN_ROLE_MISMATCH", statusCode: 403 };
      }
    } else if (actor.role === "customer") {
      // Re-verify campaign ownership for customer actions
      if (entityId) {
        const { data: campaign, error: cErr } = await supabase
          .from("campaigns")
          .select("id, user_id")
          .eq("id", entityId)
          .maybeSingle();
        if (cErr || !campaign || campaign.user_id !== actor.id) {
          return { allowed: false, error: "FORBIDDEN_ENTITY_NOT_OWNED", statusCode: 403 };
        }
      }
    } else if (actor.role === "supplier") {
      // Re-verify supplier status and assignment ownership
      const { data: supProfile, error: sErr } = await supabase
        .from("supplier_profiles")
        .select("status")
        .eq("id", actor.id)
        .maybeSingle();
      if (sErr || supProfile?.status !== "verified") {
        return { allowed: false, error: "FORBIDDEN_SUPPLIER_UNVERIFIED", statusCode: 403 };
      }
      if (entityId) {
        const { data: campaign, error: cErr } = await supabase
          .from("campaigns")
          .select("id, supplier_id")
          .eq("id", entityId)
          .maybeSingle();
        if (cErr || !campaign || campaign.supplier_id !== actor.id) {
          return { allowed: false, error: "FORBIDDEN_ENTITY_NOT_OWNED", statusCode: 403 };
        }
      }
    } else if (actor.role === "driver") {
      // Re-verify assignment and token cross-check
      if (!actor.accessToken || !entityId) {
        return { allowed: false, error: "FORBIDDEN_DRIVER_AUTH_MISSING", statusCode: 403 };
      }
      const { data: assignment, error: aErr } = await supabase
        .from("operator_assignments")
        .select("id, access_token")
        .eq("id", entityId)
        .eq("access_token", actor.accessToken)
        .maybeSingle();
      if (aErr || !assignment) {
        return { allowed: false, error: "FORBIDDEN_INVALID_ASSIGNMENT", statusCode: 403 };
      }
    } else {
      return { allowed: false, error: "FORBIDDEN_UNKNOWN_ROLE", statusCode: 403 };
    }

    // Build audit entry
    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      role: actor.role,
      actionType: mutationName,
      entityId,
      beforeState: action.beforeState || null,
      afterState: action.afterState || null,
      metadata: { requestedVia: "ai_assistant_confirmation", sourceAction: action },
    });

    return { allowed: true, auditEntry };
  }

  return { allowed: false, error: "UNSUPPORTED_ACTION_TYPE", statusCode: 400 };
}

/**
 * Handles action verification endpoint requests in ai-core.
 * Derives actor identity strictly server-side (Supabase auth / driver token),
 * NEVER trusting client-supplied role claims.
 */
export async function handleActionVerify(
  supabaseAdminFn: () => any,
  jsonFn: (data: unknown, status?: number) => Response,
  req: Request,
  user: { id: string } | null,
  action: any,
  assignmentId?: string
): Promise<Response> {
  const supabase = supabaseAdminFn();
  if (!supabase) {
    return jsonFn({ answer: null, status: "error", error: "DATABASE_UNAVAILABLE" }, 500);
  }

  const operatorHeader = req.headers.get("x-operator-token") || null;
  let actor: { id: string; role: string; accessToken?: string } | null = null;

  if (user) {
    let resolvedRole = "customer";
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (prof && (prof.role === "admin" || prof.role === "superadmin")) {
      resolvedRole = "admin";
    } else {
      const { data: sup } = await supabase
        .from("supplier_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sup) {
        resolvedRole = "supplier";
      }
    }
    actor = { id: user.id, role: resolvedRole };
  } else if (operatorHeader) {
    actor = {
      id: assignmentId || "driver",
      role: "driver",
      accessToken: operatorHeader,
    };
  }

  const validation = await validateActionServerSide(supabase, actor, action);
  if (!validation.allowed) {
    return jsonFn({ allowed: false, error: validation.error }, validation.statusCode || 400);
  }

  return jsonFn({
    allowed: true,
    action,
    auditEntry: validation.auditEntry || null,
    status: "action_verified",
  });
}

