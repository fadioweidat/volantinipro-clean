/**
 * Formato di campo condiviso dal Context Layer AI (AI-BRAIN-2).
 * Ogni dato esposto all'AI passa da questo wrapper: value + provenienza +
 * affidabilita' dichiarata, mai un valore nudo. Nessuna logica di dominio
 * qui dentro, solo il contratto del campo.
 */

export const AI_FIELD_TYPES = Object.freeze({
  REAL: "REAL",
  DERIVED: "DERIVED",
  ESTIMATE: "ESTIMATE",
  UNAVAILABLE: "UNAVAILABLE",
});

export const AI_CONFIDENCE_LEVELS = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

const VALID_TYPES = new Set(Object.values(AI_FIELD_TYPES));
const VALID_CONFIDENCE = new Set(Object.values(AI_CONFIDENCE_LEVELS));

/**
 * Costruisce un campo di contesto AI valido. `value` puo' essere qualunque
 * dato serializzabile gia' letto da una fonte reale (mai calcolato qui).
 */
export function aiField(value, { type, source, updatedAt = null, confidence = AI_CONFIDENCE_LEVELS.MEDIUM } = {}) {
  const resolvedType = VALID_TYPES.has(type) ? type : AI_FIELD_TYPES.UNAVAILABLE;
  const resolvedConfidence = VALID_CONFIDENCE.has(confidence) ? confidence : AI_CONFIDENCE_LEVELS.LOW;
  const isUnavailable = value === null || value === undefined || resolvedType === AI_FIELD_TYPES.UNAVAILABLE;
  return Object.freeze({
    value: isUnavailable ? null : value,
    type: isUnavailable ? AI_FIELD_TYPES.UNAVAILABLE : resolvedType,
    source: typeof source === "string" && source.trim() ? source.trim() : "",
    updatedAt: typeof updatedAt === "string" && updatedAt ? updatedAt : (isUnavailable ? null : new Date().toISOString()),
    confidence: isUnavailable ? AI_CONFIDENCE_LEVELS.LOW : resolvedConfidence,
  });
}

/** Campo esplicitamente non disponibile: nessun valore inventato o stimato. */
export function unavailableField(source = "") {
  return aiField(null, { type: AI_FIELD_TYPES.UNAVAILABLE, source, confidence: AI_CONFIDENCE_LEVELS.LOW });
}

/** Vero se un campo del context layer rispetta il contratto minimo. */
export function isValidAiField(field) {
  return Boolean(
    field &&
    typeof field === "object" &&
    "value" in field &&
    VALID_TYPES.has(field.type) &&
    typeof field.source === "string" &&
    (field.updatedAt === null || typeof field.updatedAt === "string") &&
    VALID_CONFIDENCE.has(field.confidence) &&
    (field.type !== AI_FIELD_TYPES.UNAVAILABLE || field.value === null)
  );
}
