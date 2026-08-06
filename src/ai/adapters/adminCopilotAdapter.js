import { supabase, ensureSupabaseSessionBridge } from "../../supabaseClient.js";
import { buildAdminAiContext } from "../context/buildAdminAiContext.js";
import { resolveIntent } from "../router/intentRouter.js";
import { buildAiResponse, buildFallbackResponse, validateAiResponse, sanitizeErrorForLog, AI_RESPONSE_STATUSES } from "../schema/aiResponseSchema.js";
import { AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from "../context/fieldTypes.js";

const ALERT_LABELS = Object.freeze({ warning: "Attenzione", error: "Problema", info: "Suggerimento" });

function contextToEvidence(context) {
  const evidence = [];
  const push = (label, field) => { if (field && field.type !== AI_FIELD_TYPES.UNAVAILABLE) evidence.push({ label, ...field }); };
  push("Campagne reali attive", context.campaigns.active);
  push("Campagne in ritardo", context.campaigns.late);
  push("Campagne da attenzionare", context.campaigns.attention);
  push("Preventivi aperti", context.campaigns.openQuotes);
  push("Operatori live", context.operators.live);
  push("Operatori in warning", context.operators.warning);
  return evidence;
}

function alertsToEvidence(alerts) {
  return (Array.isArray(alerts) ? alerts : []).map((alert) => ({
    label: ALERT_LABELS[alert?.type] || "Alert",
    value: typeof alert?.message === "string" ? alert.message : null,
    type: AI_FIELD_TYPES.DERIVED,
    source: "openai_gpt4o_mini_admin_copilot",
    updatedAt: new Date().toISOString(),
    confidence: AI_CONFIDENCE_LEVELS.MEDIUM,
  })).filter((item) => item.value);
}

/**
 * Adapter compatibile con l'Edge Function esistente `ai-admin-copilot`
 * (nessuna riscrittura server-side): costruisce il contesto autorizzato,
 * verifica l'intento tramite il router condiviso, chiama la Edge Function
 * invariata, poi normalizza SEMPRE l'output nel contratto unico prima che la
 * UI lo veda. Se qualunque passaggio fallisce, ritorna un fallback sicuro.
 */
export async function runAdminCopilot({ adminIdentity, campaigns, availability, operators, operatorsSummary, intentName = "daily_operations_summary" }) {
  const context = buildAdminAiContext(adminIdentity, { campaigns, availability, operators, operatorsSummary });
  if (!context) return buildFallbackResponse("access_denied", { intent: intentName });

  const authorization = resolveIntent(intentName, { role: adminIdentity?.role });
  if (!authorization.ok) return buildFallbackResponse(authorization.reason, { intent: intentName });

  if (context.dataAvailability.campaigns !== true) return buildFallbackResponse("source_unavailable", { intent: intentName });

  try {
    const dashboardData = {
      activeCampaignsCount: context.campaigns.active.value ?? 0,
      campaigns: context.criticalCampaigns.map((row) => ({
        id: row.reference,
        name: row.clientLabel,
        progress: row.operational?.progress ?? null,
        end_date: row.endDate,
        status: row.status,
      })),
    };
    // Stesso bridge richiesto per l'assistente territoriale: senza, il client SDK
    // usato da functions.invoke resta con la sola anon key (o con la sessione di
    // un altro utente ancora bridgata in memoria dalla SPA) e la Edge Function
    // rifiuta la richiesta come non autenticata o non autorizzata.
    await ensureSupabaseSessionBridge();
    const { data, error: invokeError } = await supabase.functions.invoke("ai-admin-copilot", { body: { dashboardData } });
    if (invokeError) throw invokeError;
    if (data?.error) throw new Error(data.error);

    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    const evidence = [...contextToEvidence(context), ...alertsToEvidence(alerts)];
    const answer = alerts.length > 0
      ? alerts.map((alert) => alert.message).filter(Boolean).join(" ")
      : "Nessun alert generato dall'AI. Tutte le campagne reali sembrano in regola.";

    const response = buildAiResponse({
      status: AI_RESPONSE_STATUSES.AI,
      answer,
      intent: intentName,
      evidence,
      limitations: context.dataAvailability.photos ? [] : ["Fonte foto/documenti non disponibile per questa analisi."],
      suggestedQuestions: ["Quali operatori sono inattivi?", "Ci sono sessioni GPS stantie?", "Quali gruppi non sono ancora assegnati?"],
      actions: authorization.descriptor.allowedNavActions.map((id) => ({ id, label: id.replace(/_/g, " ") })),
    });
    if (!validateAiResponse(response)) return buildFallbackResponse("invalid_output", { intent: intentName });
    return response;
  } catch (error) {
    const safe = sanitizeErrorForLog(error);
    console.error("[ai-admin-copilot]", safe.code, safe.message);
    return buildFallbackResponse("backend_error", { intent: intentName });
  }
}
