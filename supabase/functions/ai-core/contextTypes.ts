// Whitelist dei contextType accettati da ai-core. L'elenco implementato resta
// separato: un enum noto ma non ancora gestito risponde NOT_IMPLEMENTED,
// mentre una stringa estranea viene sempre rifiutata come INVALID_CONTEXT_TYPE.
export const AI_CORE_CONTEXT_TYPES = Object.freeze([
  "step1",
  "step2",
  "step3",
  "step4",
  "customer_dashboard",
  "admin_dashboard",
  "territorial_report",
  "campaign_report",
]);

// Context implementati: Step2 e Report Territoriale pubblici, Admin autenticato.
export const IMPLEMENTED_CONTEXT_TYPES = Object.freeze(["step2", "admin_dashboard", "territorial_report"]);

export function isKnownContextType(value: unknown): value is string {
  return typeof value === "string" && AI_CORE_CONTEXT_TYPES.includes(value);
}

export function isImplementedContextType(value: unknown): boolean {
  return typeof value === "string" && IMPLEMENTED_CONTEXT_TYPES.includes(value);
}
