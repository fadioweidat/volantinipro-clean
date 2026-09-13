import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTION_TYPES,
  ACTION_STATES,
  ALLOWED_NAVIGATION_ROUTES,
  validateAction,
  isSafeNavigationAction,
  validateMutationPreview,
  getActionExecutionKey,
} from "../src/ai/actions/actionSchema.js";
import {
  isImplementedContextType,
  isKnownContextType,
} from "../supabase/functions/ai-core/contextTypes.ts";
import {
  buildAuditLogEntry,
} from "../supabase/functions/ai-core/actionSchema.ts";
import {
  validateActionServerSide,
} from "../supabase/functions/ai-core/actionValidator.ts";
import {
  deterministicAdminResponse,
} from "../supabase/functions/ai-core/adminDashboard.ts";
import {
  deterministicCustomerResponse,
} from "../supabase/functions/ai-core/customerDashboard.ts";
import {
  deterministicDriverResponse,
} from "../supabase/functions/ai-core/driverAssignment.ts";
import {
  deterministicSupplierResponse,
} from "../supabase/functions/ai-core/supplierDashboard.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("Action Schema: valida correttamente azioni navigate, preview_mutation e confirmed_mutation", () => {
  // Navigate valida
  const navAction = { type: ACTION_TYPES.NAVIGATE, route: "admin-operations", label: "Apri Campagna" };
  assert.equal(validateAction(navAction).valid, true);

  // Navigate invalida (senza route)
  assert.equal(validateAction({ type: ACTION_TYPES.NAVIGATE }).valid, false);

  // Preview mutation valida
  const previewAction = {
    type: ACTION_TYPES.PREVIEW_MUTATION,
    action: "assign_campaign",
    entityId: "c-123",
    summary: "Assegnazione lavoro al fornitore",
    consequences: ["Verrà assegnata la campagna", "Verrà generato l'incarico"],
  };
  assert.equal(validateAction(previewAction).valid, true);

  // Preview mutation invalida (senza conseguenze o senza summary)
  assert.equal(validateAction({ type: ACTION_TYPES.PREVIEW_MUTATION, action: "test" }).valid, false);
  assert.equal(validateAction({ type: ACTION_TYPES.PREVIEW_MUTATION, action: "test", summary: "ok", consequences: [] }).valid, false);

  // Confirmed mutation valida
  const confirmedAction = {
    type: ACTION_TYPES.CONFIRMED_MUTATION,
    action: "assign_campaign",
    entityId: "c-123",
  };
  assert.equal(validateAction(confirmedAction).valid, true);

  // Tipo non supportato
  assert.equal(validateAction({ type: "arbitrary_execute" }).valid, false);
});

test("Safe Navigation: consente solo le route permesse per ogni ruolo ed esclude route non autorizzate", () => {
  // Admin
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-operations:c-1" }, "admin"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-clients-quotes" }, "admin"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-assignments" }, "admin"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-gps" }, "admin"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-communications" }, "admin"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-suppliers" }, "admin"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-analytics" }, "admin"), true);

  // Customer
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "campaign:c-1" }, "customer"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "customer-tracking:c-1" }, "customer"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "customer-report:c-1" }, "customer"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "customer-payment:c-1" }, "customer"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "messages" }, "customer"), true);

  // Driver
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "driver-assignment:a-1" }, "driver"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "driver-map:a-1" }, "driver"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "driver-pod:a-1" }, "driver"), true);

  // Supplier
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "supplier-dashboard" }, "supplier"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "supplier-job:j-1" }, "supplier"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "supplier-assignment:a-1" }, "supplier"), true);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "supplier-request:r-1" }, "supplier"), true);

  // Cross-role privilege escalation bloccata
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-analytics" }, "driver"), false);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "admin-suppliers" }, "customer"), false);
  assert.equal(isSafeNavigationAction({ type: "navigate", route: "unknown-backdoor-route" }, "admin"), false);
});

test("No Autonomous Mutations: richieste in linguaggio naturale generano anteprima e nessuna mutazione immediata", () => {
  // Admin: "Assegna questo lavoro a Mario"
  const adminSnap = { scope: "global_admin", campaignId: "c-123", campaigns: [] };
  const adminRes = deterministicAdminResponse(adminSnap, "assegna questo lavoro al fornitore Rossi");
  assert.ok(adminRes);
  assert.ok(adminRes.warnings.includes("READ_ONLY"));
  assert.equal(adminRes.action?.type, ACTION_TYPES.PREVIEW_MUTATION);
  assert.equal(adminRes.action?.action, "assign_campaign");
  assert.ok(Array.isArray(adminRes.action?.consequences) && adminRes.action.consequences.length > 0);

  // Customer: "effettua il pagamento adesso"
  const custSnap = { campaigns: [], campaignId: "c-456" };
  const custRes = deterministicCustomerResponse(custSnap, "effettua il pagamento adesso con bonifico");
  assert.ok(custRes);
  assert.ok(custRes.warnings.includes("READ_ONLY_ENFORCED"));
  assert.equal(custRes.action?.type, ACTION_TYPES.PREVIEW_MUTATION);
  assert.equal(custRes.action?.action, "initiate_payment");
  assert.ok(Array.isArray(custRes.action?.consequences));

  // Driver: "termina il lavoro e chiudi"
  const driverSnap = { assignmentId: "a-789", zones: [] };
  const driverRes = deterministicDriverResponse(driverSnap, "termina il lavoro e chiudi");
  assert.ok(driverRes);
  assert.ok(driverRes.warnings.includes("READ_ONLY"));
  assert.equal(driverRes.action?.type, ACTION_TYPES.PREVIEW_MUTATION);
  assert.equal(driverRes.action?.action, "driver_shift_action");

  // Supplier: "accetta l'offerta da 500 euro"
  const supSnap = { supplierId: "s-101", assignedCampaigns: [] };
  const supRes = deterministicSupplierResponse(supSnap, "accetta l'offerta da 500 euro");
  assert.ok(supRes);
  assert.ok(supRes.warnings.includes("READ_ONLY"));
  assert.equal(supRes.action?.type, ACTION_TYPES.PREVIEW_MUTATION);
  assert.equal(supRes.action?.action, "supplier_dashboard_action");
});

test("Server-Side Action Validator: rifiuta chiamate anonime o ruoli non autorizzati per confirmed_mutation", async () => {
  const fakeSupabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "profiles") return { data: { role: "customer" }, error: null }; // NOT admin
            if (table === "campaigns") return { data: { id: "c-123", user_id: "other-user" }, error: null };
            if (table === "supplier_profiles") return { data: { status: "pending" }, error: null }; // NOT verified
            return { data: null, error: null };
          },
        }),
      }),
    }),
  };

  const confirmedAction = {
    type: ACTION_TYPES.CONFIRMED_MUTATION,
    action: "assign_campaign",
    entityId: "c-123",
  };

  // Anonimo -> 401
  const anonRes = await validateActionServerSide(fakeSupabase, null, confirmedAction);
  assert.equal(anonRes.allowed, false);
  assert.equal(anonRes.statusCode, 401);

  // Ruolo falso: utente che si finge admin ma è customer nel database -> 403
  const fakeAdmin = { id: "user-1", role: "admin" };
  const forgedRoleRes = await validateActionServerSide(fakeSupabase, fakeAdmin, confirmedAction);
  assert.equal(forgedRoleRes.allowed, false);
  assert.equal(forgedRoleRes.statusCode, 403);
  assert.equal(forgedRoleRes.error, "FORBIDDEN_ROLE_MISMATCH");

  // Forged Entity: cliente che tenta azione su campagna di un altro utente -> 403
  const custActor = { id: "customer-1", role: "customer" };
  const forgedEntityRes = await validateActionServerSide(fakeSupabase, custActor, confirmedAction);
  assert.equal(forgedEntityRes.allowed, false);
  assert.equal(forgedEntityRes.statusCode, 403);
  assert.equal(forgedEntityRes.error, "FORBIDDEN_ENTITY_NOT_OWNED");

  // Forged Supplier: fornitore non verificato (status pending) -> 403
  const supActor = { id: "supplier-1", role: "supplier" };
  const forgedSupRes = await validateActionServerSide(fakeSupabase, supActor, confirmedAction);
  assert.equal(forgedSupRes.allowed, false);
  assert.equal(forgedSupRes.statusCode, 403);
  assert.equal(forgedSupRes.error, "FORBIDDEN_SUPPLIER_UNVERIFIED");
});

test("Idempotency & Duplicate Guard: getActionExecutionKey produce chiavi univoche coerenti", () => {
  const action1 = { type: "preview_mutation", action: "assign_campaign", entityId: "camp-123" };
  const action2 = { type: "preview_mutation", action: "assign_campaign", entityId: "camp-123" };
  const action3 = { type: "preview_mutation", action: "assign_campaign", entityId: "camp-999" };

  assert.equal(getActionExecutionKey(action1), getActionExecutionKey(action2));
  assert.notEqual(getActionExecutionKey(action1), getActionExecutionKey(action3));
  assert.equal(getActionExecutionKey(null), null);
});

test("Audit Log: buildAuditLogEntry genera record conformi con timestamp e prima/dopo", () => {
  const entry = buildAuditLogEntry({
    actorId: "admin-uuid-42",
    role: "admin",
    actionType: "assign_campaign",
    entityId: "camp-777",
    beforeState: { supplier_id: null },
    afterState: { supplier_id: "sup-99" },
  });

  assert.equal(entry.actor_id, "admin-uuid-42");
  assert.equal(entry.role, "admin");
  assert.equal(entry.action_type, "assign_campaign");
  assert.equal(entry.entity_id, "camp-777");
  assert.deepEqual(entry.before_state, { supplier_id: null });
  assert.deepEqual(entry.after_state, { supplier_id: "sup-99" });
  assert.ok(Date.parse(entry.timestamp) > 0);

  // Mancanza campi obbligatori
  assert.throws(() => buildAuditLogEntry({ actorId: "a", role: "r", actionType: "x" }));
});
