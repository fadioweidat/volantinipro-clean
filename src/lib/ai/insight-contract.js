import { isKnownAiSource, makeAiSourceReference } from "./source-labels.js";

export const AI_DATA_CATEGORIES = Object.freeze({
  REAL: "DATO REALE",
  DERIVED: "DATO DERIVATO",
  ESTIMATE: "STIMA",
  UNAVAILABLE: "NON DISPONIBILE",
});

export const AI_DATUM_KINDS = Object.freeze({ KPI: "kpi", INSIGHT: "insight" });
export const AI_AUDIENCES = Object.freeze({ CLIENT: "cliente", ADMIN: "admin" });
export const AI_FRESHNESS_STATES = Object.freeze({
  CURRENT: "corrente",
  STALE: "obsoleto",
  UNKNOWN: "sconosciuta",
  NOT_APPLICABLE: "non_applicabile",
});
export const AI_UNAVAILABLE_CODES = Object.freeze({
  MISSING: "dato_mancante",
  SOURCE_ERROR: "errore_fonte",
  ACCESS_DENIED: "accesso_negato",
  NOT_APPLICABLE: "non_applicabile",
});
export const AI_SOURCE_LOAD_STATES = Object.freeze({
  READY: "ready",
  ERROR: "error",
  DENIED: "denied",
  MISSING: "missing",
});
export const AI_VALUE_TYPES = Object.freeze({
  NUMBER: "number",
  COUNT: "count",
  PERCENTAGE: "percentage",
  CURRENCY: "currency",
  DURATION: "duration",
  STRING: "string",
  BOOLEAN: "boolean",
  DATE: "date",
  LIST: "list",
});

const categoryValues = new Set(Object.values(AI_DATA_CATEGORIES));
const kindValues = new Set(Object.values(AI_DATUM_KINDS));
const audienceValues = new Set(Object.values(AI_AUDIENCES));
const freshnessValues = new Set(Object.values(AI_FRESHNESS_STATES));
const unavailableValues = new Set(Object.values(AI_UNAVAILABLE_CODES));
const valueTypeValues = new Set(Object.values(AI_VALUE_TYPES));

function isIsoDate(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function normalizeIso(value) {
  return value == null ? null : new Date(value).toISOString();
}

export function evaluateAiFreshness({ observedAt = null, staleAfterMs = null, now = new Date() } = {}) {
  const evaluatedAt = new Date(now);
  if (!Number.isFinite(evaluatedAt.getTime())) throw new TypeError("now deve essere una data valida");
  if (observedAt == null) {
    return Object.freeze({
      state: AI_FRESHNESS_STATES.UNKNOWN,
      evaluatedAt: evaluatedAt.toISOString(),
      ageMs: null,
      staleAfterMs: staleAfterMs ?? null,
      reason: "La fonte non espone un timestamp utilizzabile.",
    });
  }
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) throw new TypeError("observedAt deve essere una data valida");
  const threshold = Number.isFinite(staleAfterMs) && staleAfterMs >= 0 ? staleAfterMs : null;
  const ageMs = Math.max(0, evaluatedAt.getTime() - observed.getTime());
  if (threshold == null) {
    return Object.freeze({
      state: AI_FRESHNESS_STATES.UNKNOWN,
      evaluatedAt: evaluatedAt.toISOString(), ageMs, staleAfterMs: null,
      reason: "Nessuna soglia di obsolescenza definita per questa fonte.",
    });
  }
  const stale = ageMs > threshold;
  return Object.freeze({
    state: stale ? AI_FRESHNESS_STATES.STALE : AI_FRESHNESS_STATES.CURRENT,
    evaluatedAt: evaluatedAt.toISOString(), ageMs, staleAfterMs: threshold,
    reason: stale ? "Il dato supera la soglia di obsolescenza." : null,
  });
}

export function validateAiDatum(datum) {
  const errors = [];
  if (!datum || typeof datum !== "object" || Array.isArray(datum)) return { valid: false, errors: ["Il dato deve essere un oggetto."] };
  if (typeof datum.id !== "string" || datum.id.trim() === "") errors.push("id obbligatorio.");
  if (typeof datum.label !== "string" || datum.label.trim() === "") errors.push("label obbligatoria.");
  if (!kindValues.has(datum.kind)) errors.push("kind non valido.");
  if (!categoryValues.has(datum.category)) errors.push("category non valida.");
  if (!valueTypeValues.has(datum.valueType)) errors.push("valueType non valido.");
  if (datum.unit !== null && typeof datum.unit !== "string") errors.push("unit deve essere una stringa oppure null.");
  if (!Array.isArray(datum.sources) || datum.sources.length === 0) errors.push("Almeno una fonte e obbligatoria.");
  else if (datum.sources.some((item) => !item || !isKnownAiSource(item.id))) errors.push("Tutte le fonti devono appartenere al catalogo.");
  if (!datum.permission || !audienceValues.has(datum.permission.audience) || typeof datum.permission.allowed !== "boolean") errors.push("Proiezione permessi non valida.");
  if (datum.observedAt !== null && !isIsoDate(datum.observedAt)) errors.push("observedAt deve essere ISO oppure null.");
  if (!datum.freshness || !freshnessValues.has(datum.freshness.state) || !isIsoDate(datum.freshness.evaluatedAt)) errors.push("freshness non valida.");

  const unavailable = datum.category === AI_DATA_CATEGORIES.UNAVAILABLE;
  if (unavailable) {
    if (datum.value !== null) errors.push("NON_DISPONIBILE deve avere value null.");
    if (!datum.unavailable || !unavailableValues.has(datum.unavailable.code) || typeof datum.unavailable.reason !== "string" || datum.unavailable.reason.trim() === "") errors.push("NON_DISPONIBILE richiede codice e motivazione.");
  } else {
    if (datum.value === null || datum.value === undefined) errors.push("Un dato disponibile richiede un valore esplicito.");
    if (datum.unavailable !== null) errors.push("Un dato disponibile non puo avere unavailable.");
    if (!datum.permission?.allowed) errors.push("Un dato non autorizzato deve essere NON_DISPONIBILE.");
  }
  if ([AI_VALUE_TYPES.NUMBER, AI_VALUE_TYPES.COUNT, AI_VALUE_TYPES.PERCENTAGE, AI_VALUE_TYPES.CURRENCY, AI_VALUE_TYPES.DURATION].includes(datum.valueType) && !unavailable && (typeof datum.value !== "number" || !Number.isFinite(datum.value))) errors.push("Il valore numerico deve essere finito; zero e valido.");
  if (datum.valueType === AI_VALUE_TYPES.COUNT && !unavailable && (!Number.isInteger(datum.value) || datum.value < 0)) errors.push("Un conteggio deve essere un intero non negativo.");
  if (datum.valueType === AI_VALUE_TYPES.PERCENTAGE && !unavailable && (datum.value < 0 || datum.value > 100)) errors.push("Una percentuale deve essere compresa tra 0 e 100.");
  if (datum.valueType === AI_VALUE_TYPES.DURATION && !unavailable && datum.value < 0) errors.push("Una durata non puo essere negativa.");
  if (datum.valueType === AI_VALUE_TYPES.STRING && !unavailable && typeof datum.value !== "string") errors.push("Un valore string deve essere testuale.");
  if (datum.valueType === AI_VALUE_TYPES.BOOLEAN && !unavailable && typeof datum.value !== "boolean") errors.push("Un valore boolean deve essere booleano.");
  if (datum.valueType === AI_VALUE_TYPES.DATE && !unavailable && !isIsoDate(datum.value)) errors.push("Un valore date deve essere ISO.");
  if (datum.valueType === AI_VALUE_TYPES.LIST && !unavailable && !Array.isArray(datum.value)) errors.push("Un valore list deve essere un array.");
  if ([AI_DATA_CATEGORIES.DERIVED, AI_DATA_CATEGORIES.ESTIMATE].includes(datum.category)) {
    if (!datum.derivation || typeof datum.derivation.criterion !== "string" || datum.derivation.criterion.trim() === "" || !Array.isArray(datum.derivation.inputs) || datum.derivation.inputs.length === 0) errors.push("DATO_DERIVATO e STIMA richiedono criterio e input.");
  } else if (datum.derivation !== null) errors.push("DATO_REALE e NON_DISPONIBILE non devono dichiarare derivazione.");
  if (datum.permission?.allowed === false && (!unavailable || datum.unavailable?.code !== AI_UNAVAILABLE_CODES.ACCESS_DENIED)) errors.push("Un accesso negato deve essere NON_DISPONIBILE con codice accesso_negato.");
  return { valid: errors.length === 0, errors };
}

export function assertAiDatum(datum) {
  const result = validateAiDatum(datum);
  if (!result.valid) throw new TypeError(`Contratto dato AI non valido: ${result.errors.join(" ")}`);
  return datum;
}

export function createAiDatum(input, { now = new Date() } = {}) {
  const sources = (input.sources ?? []).map((item) => typeof item === "string" ? makeAiSourceReference(item) : makeAiSourceReference(item.id, item.detail));
  const observedAt = normalizeIso(input.observedAt);
  const datum = {
    id: input.id,
    kind: input.kind,
    label: input.label,
    description: input.description ?? null,
    category: input.category,
    value: input.value,
    valueType: input.valueType,
    unit: input.unit ?? null,
    sources,
    observedAt,
    freshness: input.freshness ?? evaluateAiFreshness({ observedAt, staleAfterMs: input.staleAfterMs, now }),
    derivation: input.derivation ? {
      criterion: input.derivation.criterion,
      formula: input.derivation.formula ?? null,
      inputs: [...(input.derivation.inputs ?? [])],
      assumptions: [...(input.derivation.assumptions ?? [])],
    } : null,
    unavailable: input.unavailable ? { code: input.unavailable.code, reason: input.unavailable.reason } : null,
    permission: {
      audience: input.permission?.audience,
      allowed: input.permission?.allowed,
      reason: input.permission?.reason ?? null,
    },
  };
  assertAiDatum(datum);
  return Object.freeze(datum);
}

export function createUnavailableAiDatum(input, options) {
  return createAiDatum({
    ...input,
    category: AI_DATA_CATEGORIES.UNAVAILABLE,
    value: null,
    observedAt: input.observedAt ?? null,
    derivation: null,
    unavailable: { code: input.unavailableCode, reason: input.unavailableReason },
  }, options);
}

export function readAiSourceState(snapshot, key) {
  const entry = snapshot?.[key];
  if (!entry || typeof entry !== "object") {
    return { status: AI_SOURCE_LOAD_STATES.MISSING, data: null, observedAt: null, reason: "Fonte non fornita al builder." };
  }
  const status = entry.status ?? (Object.hasOwn(entry, "data") ? AI_SOURCE_LOAD_STATES.READY : AI_SOURCE_LOAD_STATES.MISSING);
  if (!Object.values(AI_SOURCE_LOAD_STATES).includes(status)) throw new TypeError(`Stato fonte non valido per ${key}.`);
  if (status === AI_SOURCE_LOAD_STATES.READY && !Object.hasOwn(entry, "data")) throw new TypeError(`La fonte ${key} pronta deve includere data, anche quando vale null.`);
  return {
    status,
    data: status === AI_SOURCE_LOAD_STATES.READY ? entry.data : null,
    observedAt: entry.observedAt ?? null,
    staleAfterMs: entry.staleAfterMs ?? null,
    reason: entry.reason ?? (status === AI_SOURCE_LOAD_STATES.ERROR
      ? "La lettura della fonte ha restituito un errore."
      : status === AI_SOURCE_LOAD_STATES.DENIED
        ? "La lettura della fonte e stata negata."
        : status === AI_SOURCE_LOAD_STATES.MISSING
          ? "La fonte non e disponibile."
          : null),
  };
}
