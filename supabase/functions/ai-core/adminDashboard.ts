export const ADMIN_SOURCE_ALLOWLIST = Object.freeze([
  "operator_assignments",
  "campaign_zones",
  "delivery_sessions",
  "gps_telemetry_aggregated",
  "proof_photo_counts",
  "assignment_event_log",
  "operation_alerts",
]);

const FORBIDDEN_SNAPSHOT_KEYS = /(^|_)(email|phone|telephone|mobile|token|secret|service_role|latitude|longitude|coordinates?|raw_gps|user_id|operator_id|customer_id|campaign_id|assignment_id|session_id|id)$/i;
const PII_PATTERN = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d .()-]{7,}\d))/i;
const SECRET_PATTERN = /(service\s*role|api\s*key|secret|token)/i;
const WRITE_PATTERN = /\b(cambia|modifica|elimina|cancella|crea|assegna|aggiorna|imposta|completa)\b/i;
const PRIVACY_PATTERN = /\b(email|telefono|telefoni|phone|coordinate|pii)\b/i;

type AdminResult = {
  answer: string;
  summary: string;
  priorities: string[];
  warnings: string[];
  sources: string[];
};

function keysArePrivacySafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysArePrivacySafe);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) => !FORBIDDEN_SNAPSHOT_KEYS.test(key) && keysArePrivacySafe(child));
}

export function validateAdminSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !keysArePrivacySafe(snapshot)) return false;
  if (snapshot.schemaVersion !== 1 || typeof snapshot.generatedAt !== "string" || typeof snapshot.date !== "string") return false;
  if (!snapshot.totals || !Array.isArray(snapshot.drivers) || !Array.isArray(snapshot.campaigns) || !Array.isArray(snapshot.sources)) return false;
  if (snapshot.drivers.length > 20 || snapshot.campaigns.length > 30) return false;
  if (!snapshot.sources.every((source: unknown) => typeof source === "string" && ADMIN_SOURCE_ALLOWLIST.includes(source))) return false;
  return Object.values(snapshot.totals).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

const safeResult = (answer: string, summary: string, warnings: string[] = [], sources: string[] = []): AdminResult => ({
  answer,
  summary,
  priorities: [],
  warnings,
  sources,
});

export function deterministicAdminResponse(snapshot: any, question: string): AdminResult | null {
  if (PRIVACY_PATTERN.test(question)) return safeResult("Non posso mostrare dati personali o coordinate. Il Copilot Admin usa esclusivamente dati operativi aggregati e privacy-safe.", "Richiesta rifiutata per tutela della privacy.", ["PII_NOT_AVAILABLE"]);
  if (SECRET_PATTERN.test(question)) return safeResult("Non posso accedere né mostrare chiavi, token o altri segreti.", "Richiesta di segreti rifiutata.", ["SECRETS_NOT_AVAILABLE"]);
  if (WRITE_PATTERN.test(question)) return safeResult("Il Copilot Admin è read-only e non può modificare campagne, assegnazioni, GPS o stati.", "Nessuna azione è stata eseguita.", ["READ_ONLY"]);
  if ((snapshot?.totals?.assignments || 0) === 0) return safeResult("Nessuna attività operativa registrata per oggi.", "Non risultano operazioni per la data selezionata.");
  if (/volantini.*distribuit|distribuit.*volantini/i.test(question) && snapshot?.availability?.distributedQuantity === false) return safeResult("Il dato dei volantini realmente distribuiti non è disponibile. La quantità assegnata non viene usata come quantità distribuita.", "Quantità distribuita non disponibile.", ["DISTRIBUTED_QUANTITY_NOT_AVAILABLE"]);
  if (/\b(km|chilometr)/i.test(question) && snapshot?.availability?.distanceKm === false) return safeResult("Il dato sui chilometri percorsi non è disponibile nello snapshot operativo.", "Distanza non disponibile.", ["DISTANCE_NOT_AVAILABLE"]);
  if (/motivo.*blocc|perch[eé].*blocc/i.test(question) && snapshot?.availability?.blockReason === false) return safeResult("Il motivo del blocco non è disponibile nei dati operativi forniti.", "Motivo del blocco non disponibile.", ["BLOCK_REASON_NOT_AVAILABLE"]);
  const assertedDrivers = question.match(/(?:ci sono|sono)\s+(\d+)\s+driver/i);
  if (assertedDrivers) {
    const claimed = Number(assertedDrivers[1]);
    const asksBlocked = /blocc/i.test(question);
    const actual = asksBlocked
      ? (snapshot?.drivers || []).filter((driver: any) => Number(driver?.blockedZones || 0) > 0).length
      : Number(snapshot?.totals?.drivers || 0);
    const subject = asksBlocked ? "driver con almeno una zona bloccata" : "driver programmati";
    return safeResult(claimed === actual ? `Sì. I ${subject} sono ${actual}.` : `No. I ${subject} nei dati di oggi sono ${actual}, non ${claimed}.`, `${subject}: ${actual}.`, [], ["operator_assignments", ...(asksBlocked ? ["campaign_zones"] : [])]);
  }
  return null;
}

export function buildAdminSystemPrompt() {
  return [
    "Sei il Copilot Operativo Admin di VolantiniPro, un assistente esclusivamente read-only.",
    "Rispondi SOLO usando lo snapshot JSON fornito. Se un dato manca, dichiaralo; non stimare e non inventare numeri o motivi.",
    "Distingui fatti e raccomandazioni. Dai priorità a CRITICAL e WARNING.",
    "Non rivelare PII, coordinate GPS raw, identificativi, token o segreti e non fingere di avere eseguito azioni.",
    "assignedQuantity significa quantità assegnata, mai quantità distribuita.",
    `Le sources possono contenere solo: ${ADMIN_SOURCE_ALLOWLIST.join(", ")}. Non inventare URL.`,
    "Restituisci JSON valido: {\"answer\":string,\"summary\":string,\"priorities\":string[],\"warnings\":string[],\"sources\":string[]}.",
  ].join(" ");
}

export function buildAdminUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Snapshot operativo reale e privacy-safe:\n${JSON.stringify(snapshot)}\n\nDomanda Admin: ${JSON.stringify(question)}`;
}

export function validateAdminAiResult(value: any): value is AdminResult {
  if (!value || typeof value !== "object") return false;
  if (typeof value.answer !== "string" || !value.answer.trim() || typeof value.summary !== "string" || !value.summary.trim()) return false;
  if (![value.priorities, value.warnings, value.sources].every(Array.isArray)) return false;
  if (value.priorities.length > 12 || value.warnings.length > 12 || value.sources.length > ADMIN_SOURCE_ALLOWLIST.length) return false;
  if (![...value.priorities, ...value.warnings, ...value.sources].every(item => typeof item === "string" && item.length <= 300)) return false;
  if (!value.sources.every((source: string) => ADMIN_SOURCE_ALLOWLIST.includes(source))) return false;
  return !PII_PATTERN.test([value.answer, value.summary, ...value.priorities, ...value.warnings].join(" "));
}

export function numbersAreGrounded(value: AdminResult, snapshot: unknown): boolean {
  const snapshotNumbers = new Set((JSON.stringify(snapshot).match(/-?\d+(?:[.,]\d+)?/g) || []).map(item => item.replace(",", ".")));
  const outputNumbers = [value.answer, value.summary, ...value.priorities, ...value.warnings].join(" ").match(/-?\d+(?:[.,]\d+)?/g) || [];
  return outputNumbers.every(item => snapshotNumbers.has(item.replace(",", ".")));
}
