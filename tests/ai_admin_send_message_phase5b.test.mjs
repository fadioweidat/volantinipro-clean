import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { computeActionExecutionKey } from "../supabase/functions/ai-core/actionSchema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const txt = fs.readFileSync(filePath, "utf8");
  const res = {};
  for (const l of txt.split("\n")) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) res[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return res;
}

const conf = {
  ...parseEnv(path.resolve(ROOT, ".env")),
  ...parseEnv(path.resolve(ROOT, ".env.development.local")),
};

const serviceRoleKey = conf.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = conf.VITE_SUPABASE_URL;
const anonKey = conf.VITE_SUPABASE_ANON_KEY;

const ADMIN_EMAIL = "fenice.sp@gmail.com";
const CUSTOMER_EMAIL = "test-step4-magiclink@volantinipro-test.local";

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function getSessionFor(email) {
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkRes.ok) throw new Error(`generate_link failed: ${linkRes.status}`);
  const linkData = await linkRes.json();
  const hashedToken = linkData?.hashed_token || linkData?.properties?.hashed_token;
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }),
  });
  if (!verifyRes.ok) throw new Error(`verify failed: ${verifyRes.status}`);
  return await verifyRes.json();
}

async function invokeAiCore(sessionToken, body) {
  const headers = {
    apikey: anonKey,
    "Content-Type": "application/json",
  };
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/ai-core`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test("Phase 5B.1: Complete Admin Send Message Execution with Durable Idempotency & Audit", async (t) => {
  const adminSession = await getSessionFor(ADMIN_EMAIL);
  const adminToken = adminSession.access_token;
  assert.ok(adminToken, "Admin access token must be present");

  const customerSession = await getSessionFor(CUSTOMER_EMAIL);
  const customerToken = customerSession.access_token;
  assert.ok(customerToken, "Customer access token must be present");

  // Fetch real target IDs
  const { data: conv } = await adminClient
    .from("conversations")
    .select("id, campaign_id")
    .eq("kind", "customer_admin")
    .limit(1)
    .single();
  assert.ok(conv?.id, "Target customer conversation must exist");

  const { data: asg } = await adminClient
    .from("operator_assignments")
    .select("id")
    .limit(1)
    .single();
  assert.ok(asg?.id, "Target driver assignment must exist");

  const createdMessageIds = [];
  const createdIdempotencyKeys = [];

  t.after(async () => {
    // Cleanup created test records
    if (createdMessageIds.length > 0) {
      await adminClient.from("conversation_messages").delete().in("id", createdMessageIds);
    }
    if (createdIdempotencyKeys.length > 0) {
      await adminClient.from("ai_action_executions").delete().in("idempotency_key", createdIdempotencyKeys);
    }
  });

  // ── TEST 1: Admin -> Customer Confirmed Send ──────────────────────────────
  await t.test("1. Admin successfully sends message to customer via confirmed mutation", async () => {
    const uniqueNonce = Math.floor(Math.random() * 100000);
    const msgText = `[AUTOMATED TEST 5B.1] Gentile cliente, verifica consegna #${uniqueNonce}`;

    const actionPayload = {
      type: "confirmed_mutation",
      action: "admin_send_message",
      recipientType: "customer",
      recipientName: "Cliente Test",
      entityId: conv.id,
      messageText: msgText,
      summary: `Invia messaggio a Cliente Test: "${msgText}"`,
    };

    const key = computeActionExecutionKey(actionPayload);
    createdIdempotencyKeys.push(key);

    const { status, data } = await invokeAiCore(adminToken, {
      contextType: "action_verify",
      action: actionPayload,
    });

    assert.equal(status, 200, `Expected status 200, got ${status}: ${JSON.stringify(data)}`);
    assert.equal(data?.allowed, true);
    assert.equal(data?.status, "action_executed");
    assert.ok(data?.messageId, "Response must include canonical messageId");
    createdMessageIds.push(data.messageId);

    // Verify row in public.ai_action_executions
    const { data: ledgerRow, error: lErr } = await adminClient
      .from("ai_action_executions")
      .select("*")
      .eq("idempotency_key", key)
      .single();

    assert.equal(lErr, null);
    assert.equal(ledgerRow.status, "succeeded");
    assert.equal(ledgerRow.action_type, "admin_send_message");
    assert.equal(ledgerRow.actor_role, "admin");
    assert.equal(ledgerRow.canonical_result_id, data.messageId);

    // Verify message in public.conversation_messages
    const { data: dbMsg, error: mErr } = await adminClient
      .from("conversation_messages")
      .select("*")
      .eq("id", data.messageId)
      .single();

    assert.equal(mErr, null);
    assert.equal(dbMsg.conversation_id, conv.id);
    assert.equal(dbMsg.sender_role, "admin");
    assert.equal(dbMsg.recipient_role, "customer");
    assert.equal(dbMsg.text, msgText);
  });

  // ── TEST 2: Durable Idempotency on Duplicate Invocation ────────────────────
  await t.test("2. Duplicate confirmation invocation is deduplicated without inserting new messages", async () => {
    // Count current messages before duplicate call
    const { count: countBefore } = await adminClient
      .from("conversation_messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conv.id);

    const existingKey = createdIdempotencyKeys[createdIdempotencyKeys.length - 1];
    const { data: originalLedger } = await adminClient
      .from("ai_action_executions")
      .select("*")
      .eq("idempotency_key", existingKey)
      .single();

    // Call ai-core again with identical parameters
    const duplicateAction = {
      type: "confirmed_mutation",
      action: "admin_send_message",
      recipientType: "customer",
      recipientName: "Cliente Test",
      entityId: conv.id,
      messageText: originalLedger.before_state.text,
      summary: `Invia messaggio a Cliente Test: "${originalLedger.before_state.text}"`,
    };

    const { status, data } = await invokeAiCore(adminToken, {
      contextType: "action_verify",
      action: duplicateAction,
    });

    assert.equal(status, 200);
    assert.equal(data?.allowed, true);
    assert.equal(data?.deduplicated, true, "Must flag deduplicated: true");
    assert.equal(data?.messageId, originalLedger.canonical_result_id, "Must return original messageId");

    // Message count in DB must NOT change!
    const { count: countAfter } = await adminClient
      .from("conversation_messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conv.id);

    assert.equal(countAfter, countBefore, "Duplicate call must NOT insert additional messages");
  });

  // ── TEST 3: Admin -> Driver Confirmed Send ────────────────────────────────
  await t.test("3. Admin successfully sends message to driver via confirmed mutation", async () => {
    const uniqueNonce = Math.floor(Math.random() * 100000);
    const msgText = `[AUTOMATED TEST 5B.1] Ciao driver, carica foto zona #${uniqueNonce}`;

    const actionPayload = {
      type: "confirmed_mutation",
      action: "admin_send_message",
      recipientType: "driver",
      recipientName: "Driver Mario",
      entityId: asg.id,
      messageText: msgText,
      summary: `Invia messaggio a Driver Mario: "${msgText}"`,
    };

    const key = computeActionExecutionKey(actionPayload);
    createdIdempotencyKeys.push(key);

    const { status, data } = await invokeAiCore(adminToken, {
      contextType: "action_verify",
      action: actionPayload,
    });

    assert.equal(status, 200, `Expected status 200, got ${status}: ${JSON.stringify(data)}`);
    assert.equal(data?.allowed, true);
    assert.equal(data?.status, "action_executed");
    assert.ok(data?.messageId, "Response must include canonical messageId");
    createdMessageIds.push(data.messageId);

    // Verify row in public.ai_action_executions
    const { data: ledgerRow, error: lErr } = await adminClient
      .from("ai_action_executions")
      .select("*")
      .eq("idempotency_key", key)
      .single();

    assert.equal(lErr, null);
    assert.equal(ledgerRow.status, "succeeded");
    assert.equal(ledgerRow.action_type, "admin_send_message");
    assert.equal(ledgerRow.actor_role, "admin");
    assert.equal(ledgerRow.canonical_result_id, data.messageId);

    // Verify message in public.conversation_messages
    const { data: dbMsg, error: mErr } = await adminClient
      .from("conversation_messages")
      .select("*")
      .eq("id", data.messageId)
      .single();

    assert.equal(mErr, null);
    assert.equal(dbMsg.sender_role, "admin");
    assert.equal(dbMsg.recipient_role, "driver");
    assert.equal(dbMsg.text, msgText);
  });

  // ── TEST 4: Channel Firewall & Non-Admin Rejection ─────────────────────────
  await t.test("4. Non-admin customer cannot execute admin_send_message mutation", async () => {
    const actionPayload = {
      type: "confirmed_mutation",
      action: "admin_send_message",
      recipientType: "driver",
      entityId: asg.id,
      messageText: "Tentativo non autorizzato da cliente",
    };

    const { status, data } = await invokeAiCore(customerToken, {
      contextType: "action_verify",
      action: actionPayload,
    });

    assert.equal(status, 403, "Customer executing admin_send_message must receive 403");
    assert.equal(data?.allowed, false);
    assert.equal(data?.error, "FORBIDDEN_ROLE_MISMATCH");
  });

  // ── TEST 5: Anonymous Request Rejection ────────────────────────────────────
  await t.test("5. Anonymous caller cannot execute confirmed mutation", async () => {
    const actionPayload = {
      type: "confirmed_mutation",
      action: "admin_send_message",
      recipientType: "customer",
      entityId: conv.id,
      messageText: "Tentativo anonimo",
    };

    const { status, data } = await invokeAiCore(null, {
      contextType: "action_verify",
      action: actionPayload,
    });

    assert.equal(status, 401, "Anonymous caller must receive 401");
    assert.equal(data?.allowed, false);
    assert.equal(data?.error, "AUTHENTICATION_REQUIRED");
  });
});
