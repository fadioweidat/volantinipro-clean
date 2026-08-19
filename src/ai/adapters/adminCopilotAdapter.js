import { supabase, ensureSupabaseSessionBridge } from "../../supabaseClient.js";
import { getDailyOperationsReport } from "../../lib/services/admin-api.js";
import { buildAdminOperationsSnapshot } from "../context/buildAdminOperationsSnapshot.js";
import { resolveIntent } from "../router/intentRouter.js";
import { buildAiResponse, buildFallbackResponse, validateAiResponse, sanitizeErrorForLog, AI_RESPONSE_STATUSES } from "../schema/aiResponseSchema.js";
import { AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from "../context/fieldTypes.js";

const INTENT_QUESTIONS = Object.freeze({
  operations_summary: "Fammi il riepilogo operativo di oggi.",
  driver_attention: "Quali driver hanno problemi oggi?",
  campaign_attention: "Qual è la campagna più critica?",
  blocked_zones: "Quali zone sono bloccate?",
  gps_stale: "Quali driver hanno GPS fermo?",
  program_status: "Chi non ha ancora confermato il programma?",
  alerts_summary: "Quali campagne hanno più alert?",
  // Alias legacy mantenuti per compatibilità con consumer/test esistenti.
  daily_operations_summary: "Fammi il riepilogo operativo di oggi.",
  critical_campaigns: "Qual è la campagna più critica?",
  inactive_operators: "Quali driver hanno problemi oggi?",
  stale_gps_sessions: "Quali driver hanno GPS fermo?",
  campaigns_without_photos: "Quali campagne non hanno ancora foto?",
  unassigned_groups: "Quali programmi non hanno gruppi assegnati?",
});

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function totalsEvidence(snapshot) {
  const updatedAt = snapshot.generatedAt;
  return [
    ["Driver programmati", snapshot.totals.drivers, "operator_assignments"],
    ["Programmi", snapshot.totals.assignments, "operator_assignments"],
    ["Zone bloccate", snapshot.totals.blockedZones, "campaign_zones"],
    ["Alert attivi", snapshot.totals.activeAlerts, "operation_alerts"],
    ["Punti GPS aggregati", snapshot.totals.gpsPoints, "gps_telemetry_aggregated"],
  ].map(([label, value, source]) => ({ label, value, type: AI_FIELD_TYPES.REAL, source, updatedAt, confidence: AI_CONFIDENCE_LEVELS.HIGH }));
}

export async function runAdminCopilot({
  adminIdentity,
  intentName = "operations_summary",
  question = null,
  date = localDate(),
  operationsReport = null,
  availability = null,
}) {
  if (!adminIdentity?.user?.id || !["admin", "super_admin"].includes(adminIdentity?.role)) {
    return buildFallbackResponse("access_denied", { intent: intentName });
  }
  const authorization = resolveIntent(intentName, { role: adminIdentity.role });
  if (!authorization.ok) return buildFallbackResponse(authorization.reason, { intent: intentName });
  if (availability?.campaigns === false && !operationsReport) return buildFallbackResponse("source_unavailable", { intent: intentName });

  try {
    const report = operationsReport || await getDailyOperationsReport(date);
    const snapshot = buildAdminOperationsSnapshot(report);
    const prompt = typeof question === "string" && question.trim() ? question.trim() : INTENT_QUESTIONS[intentName];
    if (!prompt) return buildFallbackResponse("unknown_intent", { intent: intentName });

    await ensureSupabaseSessionBridge();
    const { data, error: invokeError } = await supabase.functions.invoke("ai-core", {
      body: { contextType: "admin_dashboard", snapshot, question: prompt },
    });
    if (invokeError) throw invokeError;
    if (data?.error) throw new Error(data.error);
    if (!data?.answer) {
      const warning = Array.isArray(data?.warnings) && data.warnings.length ? ` (${data.warnings.join(", ")})` : "";
      throw new Error(`AI_CORE_NO_ANSWER${warning}`);
    }

    const base = buildAiResponse({
      status: AI_RESPONSE_STATUSES.AI,
      answer: data.answer,
      intent: intentName,
      evidence: totalsEvidence(snapshot),
      limitations: Array.isArray(data.warnings) ? data.warnings : [],
      suggestedQuestions: ["Quali driver hanno problemi oggi?", "Quali zone sono bloccate?", "Chi non ha confermato il programma?"],
      actions: authorization.descriptor.allowedNavActions.map(id => ({ id, label: id.replace(/_/g, " ") })),
    });
    if (!validateAiResponse(base)) return buildFallbackResponse("invalid_output", { intent: intentName });
    return Object.freeze({
      ...base,
      summary: typeof data.summary === "string" ? data.summary : "",
      priorities: Object.freeze(Array.isArray(data.priorities) ? data.priorities : []),
      warnings: Object.freeze(Array.isArray(data.warnings) ? data.warnings : []),
      sources: Object.freeze(Array.isArray(data.sources) ? data.sources : []),
      updatedAt: snapshot.generatedAt,
      provider: data.status === "deterministic" ? "deterministic" : "openai",
    });
  } catch (error) {
    const safe = sanitizeErrorForLog(error);
    console.error("[ai-core:admin_dashboard]", safe.code, safe.message);
    return buildFallbackResponse("backend_error", { intent: intentName, text: `Analisi AI non disponibile: ${safe.message}` });
  }
}
