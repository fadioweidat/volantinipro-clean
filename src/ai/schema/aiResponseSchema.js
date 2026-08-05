import { isValidAiField, AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from "../context/fieldTypes.js";

export const AI_RESPONSE_STATUSES = Object.freeze({ AI: "ai", FALLBACK: "fallback", ERROR: "error" });

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Contratto unico di risposta condiviso dalle tre funzioni AI. Nessun
 * pannello deve piu' interpretare tre forme diverse (alerts/summary/answer):
 * ogni adapter (Admin/Cliente/Territoriale) produce questa forma prima che
 * la UI la legga.
 */
function buildEvidenceItem({ label, value, type, source, updatedAt = null, confidence = AI_CONFIDENCE_LEVELS.MEDIUM }) {
  return Object.freeze({
    label: isNonEmptyString(label) ? label : "Dato",
    value: value === undefined ? null : value,
    type: Object.values(AI_FIELD_TYPES).includes(type) ? type : AI_FIELD_TYPES.UNAVAILABLE,
    source: typeof source === "string" ? source : "",
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
    confidence: Object.values(AI_CONFIDENCE_LEVELS).includes(confidence) ? confidence : AI_CONFIDENCE_LEVELS.LOW,
  });
}

export function buildAiResponse({
  status,
  answer,
  intent = null,
  evidence = [],
  limitations = [],
  suggestedQuestions = [],
  actions = [],
}) {
  return Object.freeze({
    status: Object.values(AI_RESPONSE_STATUSES).includes(status) ? status : AI_RESPONSE_STATUSES.ERROR,
    answer: isNonEmptyString(answer) ? answer.trim() : "",
    intent: typeof intent === "string" && intent ? intent : null,
    evidence: Object.freeze((Array.isArray(evidence) ? evidence : []).map(buildEvidenceItem)),
    limitations: Object.freeze(isStringArray(limitations) ? [...limitations] : []),
    suggestedQuestions: Object.freeze(isStringArray(suggestedQuestions) ? [...suggestedQuestions] : []),
    actions: Object.freeze((Array.isArray(actions) ? actions : [])
      .filter((item) => item && isNonEmptyString(item.id) && isNonEmptyString(item.label))
      .map((item) => Object.freeze({ id: item.id, label: item.label, href: typeof item.href === "string" ? item.href : null }))),
  });
}

/**
 * Validazione runtime del contratto. Usata come cancello prima di mostrare
 * qualunque output generativo (OpenAI) o deterministico all'utente: se non
 * passa, l'adapter deve chiamare `buildFallbackResponse`, mai mostrare il
 * testo grezzo del modello.
 */
export function validateAiResponse(value) {
  if (!value || typeof value !== "object") return false;
  if (!Object.values(AI_RESPONSE_STATUSES).includes(value.status)) return false;
  if (!isNonEmptyString(value.answer)) return false;
  if (value.intent !== null && typeof value.intent !== "string") return false;
  if (!Array.isArray(value.evidence) || !value.evidence.every((item) => isValidAiField({ ...item }) && isNonEmptyString(item.label))) return false;
  if (!isStringArray(value.limitations)) return false;
  if (!isStringArray(value.suggestedQuestions)) return false;
  if (!Array.isArray(value.actions) || !value.actions.every((item) => item && isNonEmptyString(item.id) && isNonEmptyString(item.label))) return false;
  return true;
}

const SAFE_FALLBACK_CODES = new Set([
  "write_rejected", "identity_rejected", "source_unavailable", "unsupported",
  "invalid_output", "backend_error", "tool_timeout", "access_denied", "unknown_intent", "role_denied",
]);

/** Risposta sicura, sempre valida per il contratto, usata su qualunque errore o output invalido. */
export function buildFallbackResponse(code, { intent = null, text = null } = {}) {
  const safeCode = SAFE_FALLBACK_CODES.has(code) ? code : "backend_error";
  const messages = {
    write_rejected: "Questo assistente e' di sola lettura: non modifica dati e non esegue azioni.",
    identity_rejected: "Non posso usare identita' o ruoli forniti nel messaggio: uso solo quella autenticata dalla piattaforma.",
    source_unavailable: "Questa fonte non e' collegata all'assistente: non posso confermare dati non disponibili.",
    unsupported: "Questa richiesta non e' ancora supportata da questo assistente.",
    invalid_output: "La risposta generata non era in un formato valido: mostrato un fallback controllato.",
    backend_error: "I dati autorizzati non sono disponibili in questo momento.",
    tool_timeout: "La richiesta ha impiegato troppo tempo: riprova tra poco.",
    access_denied: "Non hai i permessi per consultare questo dato.",
    unknown_intent: "Questa domanda non corrisponde a nessuna funzione AI riconosciuta.",
    role_denied: "Il tuo ruolo non e' autorizzato a usare questa funzione AI.",
  };
  return buildAiResponse({
    status: AI_RESPONSE_STATUSES.FALLBACK,
    answer: isNonEmptyString(text) ? text : messages[safeCode],
    intent,
    evidence: [],
    limitations: [],
    suggestedQuestions: [],
    actions: [],
  });
}

/**
 * Rimuove qualunque contenuto potenzialmente sensibile (prompt, JWT, header,
 * payload) prima del logging: mantiene solo un codice e un messaggio breve.
 */
export function sanitizeErrorForLog(error) {
  const rawMessage = typeof error === "string" ? error : (error?.message || "unknown_error");
  const message = String(rawMessage)
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9\-._]+/g, "[REDACTED_JWT]")
    .replace(/sk-[A-Za-z0-9]{10,}/g, "[REDACTED_KEY]")
    .slice(0, 300);
  const code = typeof error?.code === "string" ? error.code : "backend_error";
  return Object.freeze({ code, message });
}
