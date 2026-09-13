import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const SUPPLIER_EMAIL = "fenice.sp@gmail.com";
const NON_SUPPLIER_EMAIL = "test-step4-magiclink@volantinipro-test.local";

async function getSessionFor(email) {
  console.log(`[AUTH] Generating real session for ${email}...`);
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkRes.ok) throw new Error(`generate_link failed: ${linkRes.status} ${await linkRes.text()}`);
  const linkData = await linkRes.json();
  const hashedToken = linkData?.hashed_token || linkData?.properties?.hashed_token;
  if (!hashedToken) throw new Error("No hashed_token returned from generate_link");

  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }),
  });
  if (!verifyRes.ok) throw new Error(`verify failed: ${verifyRes.status} ${await verifyRes.text()}`);
  const session = await verifyRes.json();
  if (!session?.access_token) throw new Error("No access_token returned from verify");
  console.log(`[AUTH] Session acquired for ${email}. User ID: ${session.user?.id}`);
  return session;
}

async function getOrCreateTestDriverAssignment() {
  console.log("[DB] Finding or creating real operator assignment with token...");
  const selectRes = await fetch(`${supabaseUrl}/rest/v1/operator_assignments?select=id,access_token,campaign_id,status&limit=1`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const rows = await selectRes.json();
  if (Array.isArray(rows) && rows.length > 0 && rows[0].access_token) {
    console.log(`[DB] Found existing assignment: id=${rows[0].id}`);
    return rows[0];
  }

  // Find an existing campaign to link
  const campRes = await fetch(`${supabaseUrl}/rest/v1/campaigns?select=id,title&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const camps = await campRes.json();
  const campaignId = camps[0]?.id;

  const testToken = `test_token_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/operator_assignments`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      access_token: testToken,
      status: "assigned",
      quantity_assigned: 5000,
    }),
  });
  const created = await insertRes.json();
  console.log(`[DB] Created test assignment: id=${created[0]?.id}`);
  return created[0];
}

async function callDriverAi({ assignmentId, accessToken, question, page = "driver-assignment" }) {
  const endpoint = `${supabaseUrl}/functions/v1/ai-core`;
  const headers = {
    "Content-Type": "application/json",
    apikey: anonKey,
  };
  const body = {
    contextType: "driver_assignment",
    assignmentId,
    accessToken,
    page,
    question,
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function callSupplierAi(jwtToken, { question, campaignId = null, page = "supplier-dashboard" }) {
  const endpoint = `${supabaseUrl}/functions/v1/ai-core`;
  const headers = {
    "Content-Type": "application/json",
    apikey: anonKey,
  };
  if (jwtToken) {
    headers.Authorization = `Bearer ${jwtToken}`;
  }
  const body = {
    contextType: "supplier_dashboard",
    page,
    campaignId,
    question,
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runPhase4RuntimeGates() {
  console.log("==================================================");
  console.log("PHASE 4 RUNTIME GATES: DRIVER & SUPPLIER AI");
  console.log("==================================================");

  const results = {};

  // 1. DRIVER ASSIGNMENT TESTS
  const assignment = await getOrCreateTestDriverAssignment();
  const validAssignmentId = assignment.id;
  const validAccessToken = assignment.access_token;
  const invalidAccessToken = "invalid_token_xyz_999";
  const invalidAssignmentId = "00000000-0000-0000-0000-000000000000";

  console.log("\n--- GATE 1: DRIVER QUAL E LA MIA ZONA ---");
  const d1 = await callDriverAi({
    assignmentId: validAssignmentId,
    accessToken: validAccessToken,
    question: "Qual è la mia zona?",
  });
  console.log("Gate 1 Status:", d1.status);
  console.log("Gate 1 Answer:", d1.data?.answer);
  const gate1Pass = d1.status === 200 && Boolean(d1.data?.answer) && !JSON.stringify(d1.data).includes(validAccessToken);
  results["1. Driver: Qual e la mia zona"] = gate1Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 2: DRIVER QUANTI VOLANTINI ---");
  const d2 = await callDriverAi({
    assignmentId: validAssignmentId,
    accessToken: validAccessToken,
    question: "Quanti volantini devo distribuire?",
  });
  console.log("Gate 2 Status:", d2.status);
  console.log("Gate 2 Answer:", d2.data?.answer);
  const gate2Pass = d2.status === 200 && Boolean(d2.data?.answer);
  results["2. Driver: Quanti volantini"] = gate2Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 3: DRIVER STATO GPS ---");
  const d3 = await callDriverAi({
    assignmentId: validAssignmentId,
    accessToken: validAccessToken,
    question: "Il GPS sta funzionando?",
    page: "driver-map",
  });
  console.log("Gate 3 Status:", d3.status);
  console.log("Gate 3 Answer:", d3.data?.answer);
  const gate3Pass = d3.status === 200 && Boolean(d3.data?.answer);
  results["3. Driver: Stato GPS"] = gate3Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 4: DRIVER RIFIUTO MUTAZIONE ---");
  const d4 = await callDriverAi({
    assignmentId: validAssignmentId,
    accessToken: validAccessToken,
    question: "modifica la quantita a 10000",
  });
  console.log("Gate 4 Status:", d4.status);
  console.log("Gate 4 Answer:", d4.data?.answer);
  const gate4Pass = d4.status === 200 && d4.data?.warnings?.includes("READ_ONLY");
  results["4. Driver: Rifiuto mutazione"] = gate4Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 5: DRIVER SECURITY - INVALID TOKEN (403) ---");
  const d5 = await callDriverAi({
    assignmentId: validAssignmentId,
    accessToken: invalidAccessToken,
    question: "Qual è la mia zona?",
  });
  console.log("Gate 5 Status:", d5.status, "Error:", d5.data?.error);
  const gate5Pass = d5.status === 403;
  results["5. Driver Security: Invalid Token -> 403"] = gate5Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 6: DRIVER SECURITY - CROSS CHECK FOREIGN ASSIGNMENT (403) ---");
  const d6 = await callDriverAi({
    assignmentId: invalidAssignmentId,
    accessToken: validAccessToken,
    question: "Qual è la mia zona?",
  });
  console.log("Gate 6 Status:", d6.status, "Error:", d6.data?.error);
  const gate6Pass = d6.status === 403;
  results["6. Driver Security: Cross-check Foreign Assignment -> 403"] = gate6Pass ? "PASS" : "FAIL";

  // 2. SUPPLIER TESTS
  const supplierSession = await getSessionFor(SUPPLIER_EMAIL);
  const supplierToken = supplierSession.access_token;
  const nonSupplierSession = await getSessionFor(NON_SUPPLIER_EMAIL);
  const nonSupplierToken = nonSupplierSession.access_token;

  console.log("\n--- GATE 7: SUPPLIER QUALI LAVORI HO ATTIVI ---");
  const s7 = await callSupplierAi(supplierToken, {
    question: "Quali lavori ho attivi?",
  });
  console.log("Gate 7 Status:", s7.status);
  console.log("Gate 7 Answer:", s7.data?.answer);
  const gate7Pass = s7.status === 200 && Boolean(s7.data?.answer);
  results["7. Supplier: Quali lavori ho attivi"] = gate7Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 8: SUPPLIER COMPENSO FORNITORE ---");
  const s8 = await callSupplierAi(supplierToken, {
    question: "Quanto è il mio compenso per questa campagna?",
  });
  console.log("Gate 8 Status:", s8.status);
  console.log("Gate 8 Answer:", s8.data?.answer);
  // Must NOT leak customer total price
  const gate8Pass = s8.status === 200 && Boolean(s8.data?.answer) && !s8.data?.answer?.toLowerCase().includes("prezzo cliente");
  results["8. Supplier: Compenso fornitore (no customer price)"] = gate8Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 9: SUPPLIER RIFIUTO MUTAZIONE ---");
  const s9 = await callSupplierAi(supplierToken, {
    question: "accetta l'offerta da 500 euro",
  });
  console.log("Gate 9 Status:", s9.status);
  console.log("Gate 9 Answer:", s9.data?.answer);
  const gate9Pass = s9.status === 200 && s9.data?.warnings?.includes("READ_ONLY");
  results["9. Supplier: Rifiuto mutazione"] = gate9Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 10: SUPPLIER SECURITY - ANON -> 401 ---");
  const s10 = await callSupplierAi(null, {
    question: "Quali lavori ho attivi?",
  });
  console.log("Gate 10 Status:", s10.status, "Error:", s10.data?.error);
  const gate10Pass = s10.status === 401;
  results["10. Supplier Security: Anon -> 401"] = gate10Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 11: SUPPLIER SECURITY - NON SUPPLIER USER -> 403 ---");
  const s11 = await callSupplierAi(nonSupplierToken, {
    question: "Quali lavori ho attivi?",
  });
  console.log("Gate 11 Status:", s11.status, "Error:", s11.data?.error);
  const gate11Pass = s11.status === 403;
  results["11. Supplier Security: Non-supplier user -> 403"] = gate11Pass ? "PASS" : "FAIL";

  console.log("\n--- GATE 12: SUPPLIER SECURITY - FOREIGN CAMPAIGN -> 403 ---");
  const s12 = await callSupplierAi(supplierToken, {
    campaignId: "00000000-0000-0000-0000-000000000000",
    question: "Quanto è il mio compenso per questa campagna?",
  });
  console.log("Gate 12 Status:", s12.status, "Error:", s12.data?.error);
  const gate12Pass = s12.status === 403;
  results["12. Supplier Security: Foreign Campaign -> 403"] = gate12Pass ? "PASS" : "FAIL";

  console.log("\n==================================================");
  console.log("PHASE 4 RUNTIME GATES SUMMARY:");
  console.log("==================================================");
  let allPass = true;
  for (const [k, v] of Object.entries(results)) {
    console.log(`[${v}] ${k}`);
    if (v !== "PASS") allPass = false;
  }

  if (!allPass) {
    console.error("FAILED: One or more Phase 4 runtime gates did not pass.");
    process.exit(1);
  } else {
    console.log("SUCCESS: ALL PHASE 4 RUNTIME GATES PASSED!");
  }
}

runPhase4RuntimeGates().catch(err => {
  console.error("Runtime Gate Error:", err);
  process.exit(1);
});
