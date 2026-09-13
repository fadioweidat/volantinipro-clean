import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

test("Migration A & B: Unique idempotency_key enforced and duplicate INSERT rejected", async () => {
  const testKey = `test-key-${Date.now()}-${Math.random()}`;
  
  // First insert
  const res1 = await adminClient.from("ai_action_executions").insert({
    idempotency_key: testKey,
    actor_role: "admin",
    action_type: "admin_send_message",
    status: "pending",
  }).select().single();

  assert.equal(res1.error, null);
  assert.equal(res1.data.idempotency_key, testKey);
  assert.equal(res1.data.status, "pending");

  // Duplicate insert must fail
  const res2 = await adminClient.from("ai_action_executions").insert({
    idempotency_key: testKey,
    actor_role: "admin",
    action_type: "admin_send_message",
    status: "pending",
  });

  assert.notEqual(res2.error, null);
  assert.match(res2.error.message, /unique|duplicate/i);

  // Cleanup
  await adminClient.from("ai_action_executions").delete().eq("idempotency_key", testKey);
});

test("Migration C: Frontend anonymous insert is blocked by RLS", async () => {
  const anonKeyAttempt = `anon-key-${Date.now()}`;
  const res = await anonClient.from("ai_action_executions").insert({
    idempotency_key: anonKeyAttempt,
    actor_role: "admin",
    action_type: "admin_send_message",
    status: "pending",
  });

  assert.notEqual(res.error, null);
  // Cleanup if erroneously inserted
  await adminClient.from("ai_action_executions").delete().eq("idempotency_key", anonKeyAttempt);
});

test("Migration D & E: Customer and unprivileged insert blocked by RLS", async () => {
  // Generate customer token
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: "test-step4-magiclink@volantinipro-test.local" }),
  });
  const linkData = await linkRes.json();
  const hashedToken = linkData?.hashed_token || linkData?.properties?.hashed_token;
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }),
  });
  const session = await verifyRes.json();
  const customerToken = session?.access_token;

  const custClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${customerToken}` } },
  });

  const custKeyAttempt = `cust-key-${Date.now()}`;
  const res = await custClient.from("ai_action_executions").insert({
    idempotency_key: custKeyAttempt,
    actor_role: "admin",
    action_type: "admin_send_message",
    status: "pending",
  });

  assert.notEqual(res.error, null);
  await adminClient.from("ai_action_executions").delete().eq("idempotency_key", custKeyAttempt);
});

test("Migration F & G: Service role execution lifecycle (pending -> succeeded with canonical_result_id)", async () => {
  const lifecycleKey = `lifecycle-key-${Date.now()}`;
  const mockMsgId = "00000000-0000-0000-0000-000000000001";

  // Step 1: Claim pending
  const claim = await adminClient.from("ai_action_executions").insert({
    idempotency_key: lifecycleKey,
    actor_role: "admin",
    action_type: "admin_send_message",
    status: "pending",
  }).select().single();

  assert.equal(claim.error, null);
  assert.equal(claim.data.status, "pending");

  // Step 2: Transition to succeeded
  const succeed = await adminClient.from("ai_action_executions").update({
    status: "succeeded",
    canonical_result_id: mockMsgId,
    after_state: { message_id: mockMsgId, delivered: true },
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("idempotency_key", lifecycleKey).select().single();

  assert.equal(succeed.error, null);
  assert.equal(succeed.data.status, "succeeded");
  assert.equal(succeed.data.canonical_result_id, mockMsgId);

  // Cleanup
  await adminClient.from("ai_action_executions").delete().eq("idempotency_key", lifecycleKey);
});

test("Migration H: Constraints reject unauthorized action_types or roles", async () => {
  const invalidKey = `invalid-${Date.now()}`;
  
  // Non-whitelisted action_type
  const resInvalidAction = await adminClient.from("ai_action_executions").insert({
    idempotency_key: invalidKey,
    actor_role: "admin",
    action_type: "unauthorized_future_action",
    status: "pending",
  });
  assert.notEqual(resInvalidAction.error, null);

  // Non-whitelisted role
  const resInvalidRole = await adminClient.from("ai_action_executions").insert({
    idempotency_key: invalidKey,
    actor_role: "customer",
    action_type: "admin_send_message",
    status: "pending",
  });
  assert.notEqual(resInvalidRole.error, null);
});

test("Migration I: Existing audit_log table remains completely untouched and active", async () => {
  const { data, error } = await adminClient.from("audit_log").select("id").limit(1);
  assert.equal(error, null);
  assert.ok(Array.isArray(data));
});
