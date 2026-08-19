import { supabase, ensureSupabaseSessionBridge } from "../../supabaseClient.js";
import { AI_ROLES } from "../../ai-foundation/contracts.js";
import { buildConfiguratorAiContext } from "../context/buildConfiguratorAiContext.js";
import { resolveIntent } from "../router/intentRouter.js";
import { buildAiResponse, buildFallbackResponse, validateAiResponse, sanitizeErrorForLog, AI_RESPONSE_STATUSES } from "../schema/aiResponseSchema.js";

const ROLE_ALIASES = Object.freeze({ super_admin: AI_ROLES.ADMIN, admin: AI_ROLES.ADMIN, cliente: AI_ROLES.CLIENT, client: AI_ROLES.CLIENT, customer: AI_ROLES.CLIENT, fornitore: AI_ROLES.SUPPLIER, supplier: AI_ROLES.SUPPLIER, visitatore: AI_ROLES.VISITOR });

/** Classificazione leggera solo per etichettare l'intento (non per rispondere: la risposta resta dell'Edge Function OpenAI esistente). */
export function classifyConfiguratorIntent(question) {
  const input = String(question || "").toLowerCase();
  if (/smart pairing/.test(input)) return "explain_smart_pairing";
  if (/preventivo|quote|prezzo/.test(input)) return "explain_quote";
  if (/quantit|surplus|mancano|fabbisogno/.test(input)) return "explain_quantity";
  if (/zona|comun|cap|nil|territorio|raggio/.test(input)) return "explain_territory";
  return "explain_service";
}

const EVIDENCE_KEYS_BY_INTENT = Object.freeze({
  explain_service: ["service", "territory"],
  explain_quantity: ["quantity"],
  explain_territory: ["territory"],
  explain_smart_pairing: [],
  explain_quote: [],
});

function flattenGroup(group, prefix) {
  if (!group || typeof group !== "object") return [];
  return Object.entries(group)
    .filter(([, field]) => field && typeof field === "object" && "type" in field)
    .map(([key, field]) => ({ label: `${prefix} · ${key}`, ...field }));
}

function evidenceForIntent(intentName, context) {
  const keys = EVIDENCE_KEYS_BY_INTENT[intentName] || [];
  return keys.flatMap((key) => flattenGroup(context[key], key === "quantity" ? "Quantita'" : key === "territory" ? "Territorio" : "Servizio"));
}

/**
 * Adapter compatibile con l'Edge Function esistente `ai-assistant-territory`
 * (nessuna riscrittura server-side): costruisce il contesto Configuratore dal
 * medesimo snapshot gia' prodotto da `buildTerritorialAiSnapshot`, verifica
 * l'intento tramite il router condiviso, poi normalizza l'output OpenAI nel
 * contratto unico prima che la UI lo mostri.
 */
export async function runTerritorialAssistant({ snapshot, question, role = "visitatore" }) {
  const context = buildConfiguratorAiContext(snapshot);
  const intentName = classifyConfiguratorIntent(question);
  if (!context) return buildFallbackResponse("source_unavailable", { intent: intentName });

  const resolvedRole = ROLE_ALIASES[String(role || "").toLowerCase()] || AI_ROLES.VISITOR;
  const authorization = resolveIntent(intentName, { role: resolvedRole });
  if (!authorization.ok) return buildFallbackResponse(authorization.reason, { intent: intentName });

  try {
    // Senza il bridge il client SDK usato da functions.invoke resta con la sola
    // anon key: la Edge Function verifica il Bearer token come utente reale e
    // risponde 401 anche con una sessione vp_supabase_session valida (stesso
    // bug gia' noto e risolto per gli altri chiamanti in supabaseClient.js).
    await ensureSupabaseSessionBridge();
    // Migrato ad ai-core (backend AI centrale, Fase 1 = solo contextType
    // "step2"): stessa auth logic, stesso prompt, stessa cache di
    // ai-assistant-territory, che resta deployata invariata come rollback.
    const { data, error: invokeError } = await supabase.functions.invoke("ai-core", { body: { contextType: "step2", snapshot, question } });
    if (invokeError) throw invokeError;
    if (data?.error) throw new Error(data.error);
    const answer = typeof data?.answer === "string" && data.answer.trim() ? data.answer.trim() : null;
    if (!answer) return buildFallbackResponse("backend_error", { intent: intentName });

    const response = buildAiResponse({
      status: AI_RESPONSE_STATUSES.AI,
      answer,
      intent: intentName,
      evidence: evidenceForIntent(intentName, context),
      limitations: context.limitations,
      suggestedQuestions: [],
      actions: authorization.descriptor.allowedNavActions.map((id) => ({ id, label: id.replace(/_/g, " ") })),
    });
    if (!validateAiResponse(response)) return buildFallbackResponse("invalid_output", { intent: intentName });
    return response;
  } catch (error) {
    const safe = sanitizeErrorForLog(error);
    console.error("[territorial-assistant]", safe.code, safe.message);
    return buildFallbackResponse("backend_error", { intent: intentName });
  }
}
