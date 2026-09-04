import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AUTO_REPAIR_ALLOWLIST, buildControlCenterAiSnapshot, buildControlCenterModel,
  createControlCenterAuditEntry, executeControlCenterRepair, isAutoRepairAllowed,
} from "../src/lib/monitoring/controlCenterEngine.js";
import { validateControlCenterDiagnosis, validateControlCenterSnapshot } from "../supabase/functions/ai-core/controlCenterDiagnosis.ts";

const NOW = new Date("2026-09-04T12:00:00.000Z");

test("warning operativo resta warning e non diventa fail", () => {
  const model = buildControlCenterModel({ flows: [{ key: "quote_creation", status: "warning", reason: "Nessun preventivo recente", lastChecked: NOW.toISOString() }], now: NOW });
  const problem = model.issues.find((row) => row.id === "flow:quote_creation");
  assert.equal(problem.state, "warning");
  assert.equal(problem.risk, "yellow");
});

test("errori duplicati sono raggruppati per fingerprint", () => {
  const common = { fingerprint: "same", status: "open", category: "frontend", module: "step2", message: "boom", severity: "error", last_seen_at: NOW.toISOString() };
  const model = buildControlCenterModel({ errorLogRows: [{ ...common, id: "a", occurrence_count: 2 }, { ...common, id: "b", occurrence_count: 3 }], now: NOW });
  const grouped = model.issues.filter((row) => row.id === "error:same");
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].technicalContext.occurrenceCount, 5);
  assert.equal(grouped[0].targets.length, 2);
});

test("auto-fix è limitato all'allowlist e un'azione rossa viene respinta", async () => {
  assert.deepEqual(AUTO_REPAIR_ALLOWLIST, ["retry_health_check", "resolve_old_error", "recover_abandoned_gps"]);
  for (const forbidden of ["deploy", "migration", "change_rls", "change_auth", "delete_business_data", "git_change", "payment_update"]) assert.equal(isAutoRepairAllowed(forbidden), false);
  await assert.rejects(() => executeControlCenterRepair({ actionId: "deploy", risk: "red" }), /ACTION_NOT_ALLOWLISTED/);
  await assert.rejects(() => executeControlCenterRepair({ actionId: "retry_health_check", risk: "red" }), /RISK_REQUIRES_APPROVAL/);
});

test("auto-resolve vecchio verifica età e risultato post-fix", async () => {
  const problem = { actionId: "resolve_old_error", risk: "green", technicalContext: { ageHours: 90 }, targets: [{ id: "e1" }] };
  const result = await executeControlCenterRepair(problem, { resolveOldError: async () => ({ status: "resolved" }) });
  assert.match(result.verification, /verificati come risolti/);
  await assert.rejects(() => executeControlCenterRepair({ ...problem, technicalContext: { ageHours: 10 } }, { resolveOldError: async () => ({ status: "resolved" }) }), /ERROR_NOT_OLD_ENOUGH/);
});

test("sessione GPS è auto-riparabile solo oltre quattro ore e richiede cancelled", async () => {
  const old = new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const model = buildControlCenterModel({ deliverySessions: [{ id: "s1", status: "started", started_at: old }], gpsPoints: [], now: NOW });
  const problem = model.issues.find((row) => row.id === "gps:abandoned_sessions");
  assert.equal(problem.risk, "green");
  const result = await executeControlCenterRepair(problem, { recoverAbandonedGps: async () => ({ status: "cancelled" }) });
  assert.match(result.verification, /cancelled/);
});

test("snapshot AI contiene solo contesto minimo e redige secret, PII e IP", () => {
  const snapshot = buildControlCenterAiSnapshot({
    id: "error:x", module: "edge", state: "error", risk: "yellow", checkedAt: NOW.toISOString(),
    message: "Bearer abc.def.ghi sk-proj-abcdefghijklmn mario@example.com +39 333 1234567 192.168.1.5",
    technicalContext: { status: "error", responseTimeMs: 1900, occurrenceCount: 4, rawPayload: "vietato" }, targets: [{ password: "vietato" }],
  });
  assert.deepEqual(Object.keys(snapshot).sort(), ["health", "issueType", "message", "module", "riskLevel", "technicalContext", "timestamp"].sort());
  assert.deepEqual(Object.keys(snapshot.technicalContext).sort(), ["occurrenceCount", "responseTimeMs", "status"].sort());
  assert.doesNotMatch(JSON.stringify(snapshot), /abc\.def|sk-proj|example\.com|333|192\.168|rawPayload|password/);
  assert.equal(validateControlCenterSnapshot(snapshot), true);
});

test("backend rifiuta snapshot sensibili e valida output strutturato", () => {
  assert.equal(validateControlCenterSnapshot({ issueType: "x", module: "auth", message: "errore", timestamp: NOW.toISOString(), riskLevel: "red", technicalContext: { status: "error", responseTimeMs: null, occurrenceCount: 1 }, health: { state: "error" }, password: "x" }), false);
  assert.equal(validateControlCenterDiagnosis({ probableCause: "causa", impact: "impatto", urgency: "high", suggestedFix: "revisione", autoResolvable: false }), true);
  assert.equal(validateControlCenterDiagnosis({ probableCause: "causa", impact: "impatto", urgency: "urgentissimo", suggestedFix: "revisione", autoResolvable: false }), false);
});

test("audit log contiene autorizzazione, risultato e verifica", () => {
  const row = createControlCenterAuditEntry({ problem: { id: "x", problem: "Errore", module: "auth" }, action: "approval_requested", mode: "approval", actor: "Admin autenticato", authorizedBy: "Admin autenticato", result: "recorded", verification: "Nessuna azione eseguita", at: NOW });
  for (const field of ["problem", "at", "action", "actor", "authorizedBy", "result", "verification"]) assert.ok(field in row);
});

test("UI rossa chiede approvazione inline e non esegue azioni distruttive", () => {
  const page = fs.readFileSync("src/pages/admin/PlatformStatus.jsx", "utf8");
  const engine = fs.readFileSync("src/lib/monitoring/controlCenterEngine.js", "utf8");
  assert.match(page, /Richiede approvazione/);
  assert.match(page, /Nessuna azione verrà eseguita/);
  assert.match(page, /Registra richiesta/);
  assert.doesNotMatch(engine, /git push|vercel deploy|supabase db push|DROP TABLE|TRUNCATE/);
});

test("ai-core richiede Admin verificato per la diagnosi", () => {
  const source = fs.readFileSync("supabase/functions/ai-core/index.ts", "utf8");
  const types = fs.readFileSync("supabase/functions/ai-core/contextTypes.ts", "utf8");
  assert.match(types, /"control_center_diagnosis"/);
  assert.match(source, /handleControlCenterDiagnosis/);
  assert.match(source, /AUTHENTICATION_REQUIRED/);
  assert.match(source, /isAdminProfile\(profile\)/);
  assert.match(source, /INVALID_CONTROL_CENTER_SNAPSHOT/);
});
