const TOP_LEVEL_KEYS = new Set(["issueType", "module", "message", "timestamp", "riskLevel", "technicalContext", "health"]);
const TECHNICAL_KEYS = new Set(["status", "responseTimeMs", "occurrenceCount"]);
const HEALTH_KEYS = new Set(["state"]);
const RISK_LEVELS = new Set(["green", "yellow", "red"]);
const URGENCY_LEVELS = new Set(["low", "medium", "high", "critical"]);
const SENSITIVE_KEY = /password|token|secret|authorization|service.?role|api.?key|email|phone|telefono|customer|client|user.?id|(^|_)ip$/i;
const SENSITIVE_VALUE = /\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b(?:sk|sb_[a-z]+)-[A-Za-z0-9_-]{12,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\s().-]*){9,}|\b(?:\d{1,3}\.){3}\d{1,3}\b/i;

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasSensitiveData(value: unknown): boolean {
  if (typeof value === "string") return SENSITIVE_VALUE.test(value);
  if (Array.isArray(value)) return value.some(hasSensitiveData);
  if (!plainObject(value)) return false;
  return Object.entries(value).some(([key, item]) => SENSITIVE_KEY.test(key) || hasSensitiveData(item));
}

function validOptionalNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function validateControlCenterSnapshot(snapshot: unknown): snapshot is Record<string, unknown> {
  if (!plainObject(snapshot) || Object.keys(snapshot).some((key) => !TOP_LEVEL_KEYS.has(key)) || hasSensitiveData(snapshot)) return false;
  if (typeof snapshot.issueType !== "string" || !snapshot.issueType.trim() || snapshot.issueType.length > 180) return false;
  if (typeof snapshot.module !== "string" || !snapshot.module.trim() || snapshot.module.length > 120) return false;
  if (typeof snapshot.message !== "string" || snapshot.message.length > 500) return false;
  if (typeof snapshot.timestamp !== "string" || !Number.isFinite(Date.parse(snapshot.timestamp))) return false;
  if (!RISK_LEVELS.has(String(snapshot.riskLevel))) return false;
  if (!plainObject(snapshot.technicalContext) || Object.keys(snapshot.technicalContext).some((key) => !TECHNICAL_KEYS.has(key))) return false;
  if (!(snapshot.technicalContext.status === null || typeof snapshot.technicalContext.status === "string")) return false;
  if (!validOptionalNumber(snapshot.technicalContext.responseTimeMs) || !validOptionalNumber(snapshot.technicalContext.occurrenceCount)) return false;
  if (!plainObject(snapshot.health) || Object.keys(snapshot.health).some((key) => !HEALTH_KEYS.has(key))) return false;
  return ["ok", "warning", "error"].includes(String(snapshot.health.state));
}

export function buildControlCenterSystemPrompt() {
  return [
    "Sei il diagnostico del Centro Controllo VolantiniPro.",
    "Usa soltanto il segnale tecnico minimo ricevuto. Non inventare log, metriche, utenti o cause certe.",
    "Distingui causa probabile, impatto, urgenza e fix suggerito.",
    "autoResolvable puo essere true soltanto per retry di check, chiusura di sessioni GPS realmente abbandonate o risoluzione di log vecchi.",
    "Per database, migration, RLS, autenticazione, pagamenti, deploy, codice, cancellazione dati o secret deve essere false e il fix deve richiedere approvazione umana.",
    "Rispondi esclusivamente come JSON valido: {\"probableCause\":\"...\",\"impact\":\"...\",\"urgency\":\"low|medium|high|critical\",\"suggestedFix\":\"...\",\"autoResolvable\":false}.",
  ].join(" ");
}

export function buildControlCenterUserPrompt(snapshot: Record<string, unknown>) {
  return `Segnale tecnico minimo:\n${JSON.stringify(snapshot, null, 2)}`;
}

export function validateControlCenterDiagnosis(value: unknown) {
  if (!plainObject(value)) return false;
  const allowed = new Set(["probableCause", "impact", "urgency", "suggestedFix", "autoResolvable"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  for (const key of ["probableCause", "impact", "suggestedFix"]) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 500) return false;
  }
  return URGENCY_LEVELS.has(String(value.urgency)) && typeof value.autoResolvable === "boolean";
}
