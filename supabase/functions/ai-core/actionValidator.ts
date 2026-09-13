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
  computeActionExecutionKey,
  type AuditLogEntry,
} from "./actionSchema.ts";

declare const Deno: any;

export interface ActionValidationResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
  auditEntry?: AuditLogEntry;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (mutationName === "admin_send_message" && actor.role !== "admin") {
      return { allowed: false, error: "FORBIDDEN_ROLE_MISMATCH", statusCode: 403 };
    }

    // Role verification against database
    if (actor.role === "admin") {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", actor.id)
        .maybeSingle();

      if (pErr || !profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
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

    // Phase 5B.1: Initial mutation allowlist: admin_send_message ONLY
    if (mutationName !== "admin_send_message") {
      return { allowed: false, error: "MUTATION_ACTION_NOT_PERMITTED", statusCode: 403 };
    }

    // Build audit entry
    const auditEntry = buildAuditLogEntry({
      actorId: actor.id,
      role: actor.role,
      actionType: mutationName,
      entityId: entityId || "none",
      beforeState: action.beforeState || null,
      afterState: action.afterState || null,
      metadata: { requestedVia: "ai_assistant_confirmation", sourceAction: action },
    });

    return { allowed: true, auditEntry };
  }

  return { allowed: false, error: "UNSUPPORTED_ACTION_TYPE", statusCode: 400 };
}

/**
 * Executes confirmed admin_send_message mutation with durable idempotency
 * and canonical database RPC invocation (Customer / Driver).
 */
async function executeAdminSendMessage(
  supabaseAdmin: any,
  req: Request,
  actor: { id: string; role: string },
  action: any,
  jsonFn: (data: unknown, status?: number) => Response
): Promise<Response> {
  const recipientType = action.recipientType;
  if (recipientType !== "customer" && recipientType !== "driver") {
    return jsonFn({ allowed: false, error: "INVALID_RECIPIENT_TYPE" }, 400);
  }

  const messageText = typeof action.messageText === "string" ? action.messageText.trim() : "";
  if (!messageText) {
    return jsonFn({ allowed: false, error: "EMPTY_MESSAGE_TEXT" }, 400);
  }

  const rawEntityId = String(action.entityId || "").trim();
  if (!rawEntityId || rawEntityId === "pending" || !UUID_REGEX.test(rawEntityId)) {
    return jsonFn({ allowed: false, error: "INVALID_ENTITY_ID" }, 400);
  }

  const idempotencyKey = computeActionExecutionKey(action);

  // 1. Check durable execution ledger for idempotency
  const { data: existingRecord, error: fetchErr } = await supabaseAdmin
    .from("ai_action_executions")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (fetchErr) {
    return jsonFn({ allowed: false, error: "LEDGER_READ_FAILED", detail: fetchErr.message }, 500);
  }

  if (existingRecord) {
    if (existingRecord.status === "succeeded") {
      return jsonFn({
        allowed: true,
        status: "action_executed",
        action,
        deduplicated: true,
        messageId: existingRecord.canonical_result_id,
        conversationId: existingRecord.after_state?.conversationId || null,
        afterState: existingRecord.after_state,
        message: "Azione già eseguita in precedenza (riproduzione idempotente).",
      });
    }

    if (existingRecord.status === "pending") {
      const pendingAge = Date.now() - new Date(existingRecord.created_at).getTime();
      if (pendingAge < 30000) {
        return jsonFn(
          {
            allowed: false,
            status: "in_progress",
            error: "OPERATION_IN_PROGRESS",
            message: "Un'operazione identica è già in corso di esecuzione.",
          },
          409
        );
      }
    }
  }

  // 2. Insert or reset pending execution record
  let executionId: string;
  if (existingRecord) {
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("ai_action_executions")
      .update({
        status: "pending",
        actor_id: actor.id,
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("idempotency_key", idempotencyKey)
      .select("id")
      .single();

    if (uErr) {
      return jsonFn({ allowed: false, error: "FAILED_TO_LOCK_ACTION", detail: uErr.message }, 500);
    }
    executionId = updated.id;
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("ai_action_executions")
      .insert({
        idempotency_key: idempotencyKey,
        actor_id: actor.id,
        actor_role: "admin",
        action_type: "admin_send_message",
        entity_type: recipientType === "driver" ? "operator_assignment" : "campaign",
        entity_id: rawEntityId,
        status: "pending",
        before_state: {
          recipientType,
          recipientName: action.recipientName || null,
          entityId: rawEntityId,
          text: messageText,
        },
        metadata: {
          source: "ai_assistant_confirmation",
          channel: "in_app",
        },
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: raced } = await supabaseAdmin
          .from("ai_action_executions")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (raced?.status === "succeeded") {
          return jsonFn({
            allowed: true,
            status: "action_executed",
            action,
            deduplicated: true,
            messageId: raced.canonical_result_id,
            conversationId: raced.after_state?.conversationId || null,
            afterState: raced.after_state,
            message: "Azione già eseguita in precedenza (riproduzione idempotente).",
          });
        }
        return jsonFn({ allowed: false, error: "CONCURRENT_EXECUTION_CONFLICT" }, 409);
      }
      return jsonFn({ allowed: false, error: "FAILED_TO_RECORD_ACTION", detail: insertErr.message }, 500);
    }
    executionId = inserted.id;
  }

  // 3. Client setup for canonical execution
  const authHeader = req?.headers?.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let rpcClient = supabaseAdmin;
  if (token && typeof Deno !== "undefined") {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (url && anonKey) {
      // @ts-ignore
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.105.4");
      rpcClient = createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    }
  }

  const markFailed = async (code: string, message: string) => {
    await supabaseAdmin
      .from("ai_action_executions")
      .update({
        status: "failed",
        error_code: code,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", executionId);
  };

  // 4. Canonical RPC Invocation
  if (recipientType === "driver") {
    let targetAssignmentId = rawEntityId;
    const { data: asg } = await supabaseAdmin
      .from("operator_assignments")
      .select("id")
      .eq("id", targetAssignmentId)
      .maybeSingle();

    if (!asg) {
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("assignment_id")
        .eq("id", rawEntityId)
        .eq("kind", "driver_admin")
        .maybeSingle();

      if (conv?.assignment_id) {
        targetAssignmentId = conv.assignment_id;
      } else {
        await markFailed("ASSIGNMENT_NOT_FOUND", "Incarico operatore non trovato.");
        return jsonFn({ allowed: false, error: "ASSIGNMENT_NOT_FOUND" }, 404);
      }
    }

    const { data: msgResult, error: rpcErr } = await rpcClient.rpc("admin_send_driver_message", {
      p_assignment_id: targetAssignmentId,
      p_text: messageText,
    });

    if (rpcErr || !msgResult) {
      await markFailed(rpcErr?.code || "RPC_ERROR", rpcErr?.message || "Errore chiamata admin_send_driver_message");
      return jsonFn({ allowed: false, error: rpcErr?.message || "INVIO_MESSAGGIO_DRIVER_FALLITO" }, 500);
    }

    const afterState = {
      messageId: msgResult.id,
      conversationId: msgResult.conversation_id,
      recipientRole: "driver",
      senderRole: "admin",
      senderId: actor.id,
      text: messageText,
      sentAt: msgResult.created_at || new Date().toISOString(),
    };

    await supabaseAdmin
      .from("ai_action_executions")
      .update({
        status: "succeeded",
        canonical_result_id: msgResult.id,
        after_state: afterState,
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", executionId);

    return jsonFn({
      allowed: true,
      status: "action_executed",
      action,
      messageId: msgResult.id,
      conversationId: msgResult.conversation_id,
      afterState,
      message: `✓ Messaggio inviato con successo al driver.`,
    });
  } else {
    // Customer flow
    let convId: string | null = null;
    const { data: directConv } = await supabaseAdmin
      .from("conversations")
      .select("id, kind, campaign_id, customer_id")
      .eq("id", rawEntityId)
      .maybeSingle();

    if (directConv && directConv.kind === "customer_admin") {
      convId = directConv.id;
    } else {
      const { data: campConv } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("kind", "customer_admin")
        .eq("campaign_id", rawEntityId)
        .maybeSingle();

      if (campConv) {
        convId = campConv.id;
      } else {
        const { data: camp } = await supabaseAdmin
          .from("campaigns")
          .select("id, user_id")
          .eq("id", rawEntityId)
          .maybeSingle();

        if (camp && camp.user_id) {
          const { data: newConvId, error: createConvErr } = await supabaseAdmin.rpc(
            "hub_get_or_create_customer_conversation",
            {
              p_campaign_id: camp.id,
              p_customer_id: camp.user_id,
            }
          );
          if (!createConvErr && newConvId) {
            convId = newConvId;
          }
        }
      }
    }

    if (!convId) {
      await markFailed("CONVERSATION_NOT_FOUND", "Conversazione cliente o campagna non trovata.");
      return jsonFn({ allowed: false, error: "CONVERSATION_NOT_FOUND" }, 404);
    }

    const { data: msgResult, error: rpcErr } = await rpcClient.rpc("admin_send_message", {
      p_conversation_id: convId,
      p_text: messageText,
    });

    if (rpcErr || !msgResult) {
      await markFailed(rpcErr?.code || "RPC_ERROR", rpcErr?.message || "Errore chiamata admin_send_message");
      return jsonFn({ allowed: false, error: rpcErr?.message || "INVIO_MESSAGGIO_CLIENTE_FALLITO" }, 500);
    }

    const afterState = {
      messageId: msgResult.id,
      conversationId: msgResult.conversation_id || convId,
      recipientRole: "customer",
      senderRole: "admin",
      senderId: actor.id,
      text: messageText,
      sentAt: msgResult.created_at || new Date().toISOString(),
    };

    await supabaseAdmin
      .from("ai_action_executions")
      .update({
        status: "succeeded",
        canonical_result_id: msgResult.id,
        after_state: afterState,
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", executionId);

    return jsonFn({
      allowed: true,
      status: "action_executed",
      action,
      messageId: msgResult.id,
      conversationId: msgResult.conversation_id || convId,
      afterState,
      message: `✓ Messaggio inviato con successo al cliente.`,
    });
  }
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

  // Phase 5B.1: Confirmed Mutation Execution for Admin Send Message
  if (action?.type === ACTION_TYPES.CONFIRMED_MUTATION && action?.action === "admin_send_message") {
    if (!actor || actor.role !== "admin") {
      return jsonFn({ allowed: false, error: "FORBIDDEN_ROLE_MISMATCH" }, 403);
    }
    return await executeAdminSendMessage(supabase, req, actor, action, jsonFn);
  }

  return jsonFn({
    allowed: true,
    action,
    auditEntry: validation.auditEntry || null,
    status: "action_verified",
  });
}

