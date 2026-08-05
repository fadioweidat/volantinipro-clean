import {
  getCustomerDashboardFoundation,
} from "../../ai-foundation/integrations/customer-dashboard/customerDashboardFoundation.mjs";
import { AI_ROLES } from "../../ai-foundation/contracts.js";
import { buildCustomerCampaignAiContext } from "../context/buildCustomerCampaignAiContext.js";
import { resolveIntent } from "../router/intentRouter.js";
import { buildAiResponse, buildFallbackResponse, validateAiResponse, sanitizeErrorForLog, AI_RESPONSE_STATUSES } from "../schema/aiResponseSchema.js";

// Traduce l'intento AI-BRAIN-2 in un messaggio compatibile con la
// classificazione a regex gia' esistente in CustomerDashboardReadOnlyRuntime
// (invariata, non duplicata): dove non esiste una corrispondenza reale, il
// messaggio non fa match con nessun ramo e il runtime risponde "unsupported"
// in modo genuino, non un fallback finto.
const TRIGGER_MESSAGE = Object.freeze({
  campaign_progress: "A che punto e' la mia campagna?",
  completed_areas: "Quali aree sono state completate?",
  latest_gps: "Qual e' l'ultima posizione GPS della mia campagna?",
  approved_photos: "Sono disponibili report o foto approvate?",
  explain_report: "Spiegami il report della mia campagna.",
  next_campaign_suggestion: "Suggerisci la prossima campagna.",
});

const EVIDENCE_KEYS_BY_INTENT = Object.freeze({
  campaign_progress: ["status", "service", "zone"],
  completed_areas: ["zone"],
  latest_gps: ["latestGps"],
  approved_photos: ["approvedPhotos", "reportIndicator"],
  explain_report: ["reportIndicator"],
  next_campaign_suggestion: [],
});

const LABELS = Object.freeze({
  status: "Stato campagna", service: "Servizio", zone: "Zona", quantity: "Quantita'",
  startDate: "Data inizio", endDate: "Data fine", totalAmount: "Totale", reportIndicator: "Indicatore report",
  approvedPhotos: "Foto approvate", latestGps: "Ultima posizione GPS",
});

/** Classificazione leggera del testo libero in uno dei sei intenti Cliente dichiarati dal router. */
export function classifyCustomerIntent(message) {
  const input = String(message || "").toLowerCase();
  if (/suggerisc|prossima campagna|nuova campagna/.test(input)) return "next_campaign_suggestion";
  if (/report/.test(input)) return "explain_report";
  if (/foto|document/.test(input)) return "approved_photos";
  if (/gps|posizione|dove si trova/.test(input)) return "latest_gps";
  if (/completat|area.*complet|complet.*area/.test(input)) return "completed_areas";
  return "campaign_progress";
}

function evidenceForIntent(intentName, context) {
  const keys = EVIDENCE_KEYS_BY_INTENT[intentName] || [];
  const campaign = context?.latestCampaign;
  if (!campaign) return [];
  return keys.filter((key) => campaign[key]).map((key) => ({ label: LABELS[key] || key, ...campaign[key] }));
}

/**
 * Adapter che instrada l'Assistente Cliente attraverso il CentralAiAgent
 * gia' esistente (nessuna riscrittura del runtime deterministico) e
 * normalizza SEMPRE l'output nel contratto unico AI-BRAIN-2.
 */
export async function runCustomerAssistant({ sessionId, authUser, customer, campaigns, dataLoading, dataError, activeCampaign = null, activeQuote = null, location = "/", intentName }) {
  const context = buildCustomerCampaignAiContext(
    { customerId: customer?.id, subjectId: authUser?.id },
    { authUser, customer, campaigns, loading: dataLoading, error: Boolean(dataError) },
  );
  if (!context) return buildFallbackResponse("access_denied", { intent: intentName });

  const authorization = resolveIntent(intentName, { role: AI_ROLES.CLIENT });
  if (!authorization.ok) return buildFallbackResponse(authorization.reason, { intent: intentName });

  const message = TRIGGER_MESSAGE[intentName];
  if (!message) return buildFallbackResponse("unknown_intent", { intent: intentName });

  try {
    const { agent } = getCustomerDashboardFoundation();
    const result = await agent.reply({
      sessionId, authUser, customerId: String(customer.id), profile: { role: "cliente" },
      location, activeCampaign, activeQuote, message,
    });

    const response = buildAiResponse({
      status: AI_RESPONSE_STATUSES.AI,
      answer: result.text,
      intent: intentName,
      evidence: evidenceForIntent(intentName, context),
      limitations: result.kind === "general" ? [] : [],
      suggestedQuestions: [],
      actions: result.citations.length > 0 ? authorization.descriptor.allowedNavActions.map((id) => ({ id, label: id.replace(/_/g, " ") })) : [],
    });
    if (!validateAiResponse(response)) return buildFallbackResponse("invalid_output", { intent: intentName });
    return response;
  } catch (error) {
    const safe = sanitizeErrorForLog(error);
    console.error("[customer-assistant]", safe.code, safe.message);
    return buildFallbackResponse("backend_error", { intent: intentName });
  }
}
