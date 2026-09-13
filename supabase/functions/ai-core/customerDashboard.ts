export const CUSTOMER_SOURCE_ALLOWLIST = Object.freeze([
  "customer_campaigns",
  "campaign_zones",
  "campaign_settlement",
  "customer_profile",
  "coverage_adjustments",
]);

const FORBIDDEN_CUSTOMER_KEYS = /(^|_)(password|token|secret|service_role|raw_gps|coordinates?|latitude|longitude|operator_id|driver_id|driver_phone|driver_email)$/i;
const PII_PATTERN = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d .()-]{7,}\d))/i;
const SECRET_PATTERN = /(service\s*role|api\s*key|secret|token|password)/i;
const WRITE_PATTERN = /\b(cambia|modifica|elimina|cancella|crea|aggiorna|imposta)\w*|\binvia\s*email\b|(?:effettua|esegui|registra|conferma|fai|invia)\s+(?:il\s+)?(?:pagamento|bonifico)|paga\s+(?:adesso|ora|subito|la|il|questa)|bonifico\s+automatico/i;
const PRIVACY_PATTERN = /\b(driver|autista|autisti|coordinate|raw\s*gps|altri\s*clienti|altro\s*cliente)\b/i;
const HUMAN_CONTACT_PATTERN = /(?:parlare|sentire|contattare|scrivere).*(?:persona|operatore|consulente|umano|assistenza|admin)|(?:persona|operatore|consulente|umano|assistenza|admin).*(?:parlare|sentire|contattare|scrivere)|(?:numero|whatsapp|telefono|email).*(?:contatt|supporto|assistenza)/i;

export type CustomerAiResult = {
  answer: string;
  warnings?: string[];
  sources?: string[];
};

export function keysAreCustomerPrivacySafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysAreCustomerPrivacySafe);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) => !FORBIDDEN_CUSTOMER_KEYS.test(key) && keysAreCustomerPrivacySafe(child));
}

export function validateCustomerSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !keysAreCustomerPrivacySafe(snapshot)) {
    return false;
  }
  if (snapshot.schemaVersion && snapshot.schemaVersion !== 1) return false;
  if (snapshot.campaigns && !Array.isArray(snapshot.campaigns)) return false;
  return true;
}

const safeCustomerResult = (answer: string, warnings: string[] = [], sources: string[] = ["customer_campaigns"]): CustomerAiResult => ({
  answer,
  warnings,
  sources,
});

export function deterministicCustomerResponse(snapshot: any, question: string): CustomerAiResult | null {
  const normalized = question.trim().toLowerCase();

  // 1. Richiesta contatto umano / WhatsApp / Email
  if (HUMAN_CONTACT_PATTERN.test(normalized)) {
    return safeCustomerResult(
      "Puoi parlare direttamente con l'assistenza VolantiniPro: WhatsApp +39 351 767 3737 oppure Email info@volantinipro.it.",
      [],
      ["customer_profile"]
    );
  }

  // 2. Tentativi di mutazione / modifica / pagamento
  if (WRITE_PATTERN.test(normalized)) {
    return safeCustomerResult(
      "L'Assistente VolantiniPro opera esclusivamente in modalità di sola lettura (read-only). Non può modificare campagne, date, importi o registrare pagamenti.",
      ["READ_ONLY_ENFORCED"],
      ["customer_campaigns"]
    );
  }

  // 3. Richiesta privacy / driver / altri clienti / segreti
  if (PRIVACY_PATTERN.test(normalized)) {
    return safeCustomerResult(
      "Per motivi di riservatezza e sicurezza, non posso mostrare dati relativi a operatori sul campo, coordinate GPS non aggregate o dati di altri account.",
      ["PRIVACY_PROTECTED"],
      []
    );
  }

  if (SECRET_PATTERN.test(normalized)) {
    return safeCustomerResult(
      "Non posso accedere né rivelare credenziali, chiavi o informazioni riservate di sistema.",
      ["SECRETS_NOT_AVAILABLE"],
      []
    );
  }

  // 4. Caso nessuna campagna
  const campaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];
  const singleCampaign = snapshot?.currentCampaign || snapshot?.campaign;
  if (campaigns.length === 0 && !singleCampaign) {
    if (/(?:campagn|preventiv|stat|attivit)/i.test(normalized)) {
      return safeCustomerResult(
        "Al momento non risultano campagne o preventivi registrati per il tuo account cliente. Puoi crearne uno nuovo dal configuratore preventivo.",
        [],
        ["customer_campaigns"]
      );
    }
  }

  return null;
}

export function buildCustomerSystemPrompt() {
  return [
    "Sei l'Assistente VolantiniPro per l'Area Cliente autenticata.",
    "Rispondi SOLO ed ESCLUSIVAMENTE usando i dati reali forniti nello snapshot JSON della campagna o della dashboard del cliente.",
    "Se un dato non è presente o non è disponibile (es. report non pronto, foto non caricate, percentuale copertura non calcolata), dichiara chiaramente 'Questo dato non è ancora disponibile' o 'Dato non disponibile'. NON stimare, NON fare ipotesi e NON inventare cifre, date o stati.",
    "Sei rigorosamente di sola lettura: non dichiarare mai di aver modificato o poter modificare campagne, pagamenti o stati.",
    "Non rivelare dati personali, password, token o coordinate tecniche.",
    "Se l'utente desidera parlare con una persona o con l'amministrazione, fornisci i canali ufficiali: WhatsApp +39 351 767 3737 ed Email info@volantinipro.it.",
    "Rispondi in italiano con tono chiaro, professionale e conciso.",
    "La risposta deve essere restituita unicamente come oggetto JSON valido nel formato: {\"answer\": \"tua risposta qui\"}.",
  ].join(" ");
}

export function buildCustomerUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Dati reali autorizzati dell'Area Cliente:\n${JSON.stringify(snapshot, null, 2)}\n\nDomanda del cliente: "${question}"`;
}

function normalizedNumericTokens(value: unknown): Set<string> {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const normalized = text.replace(/(\d)\.(\d{3})(?=\D|$)/g, (_m, p1, p2) => `${p1}${p2}`);
  const rawMatches = normalized.match(/-?\d+(?:[.,]\d+)?/g) || [];
  const tokens = new Set<string>();

  for (const token of rawMatches) {
    const clean = token.replace(",", ".");
    tokens.add(clean);
    const parsed = parseFloat(clean);
    if (!Number.isNaN(parsed)) {
      tokens.add(String(parsed));
      tokens.add(String(Math.abs(parsed)));
    }
  }
  return tokens;
}

export function customerAnswerNumbersAreGrounded(answer: string, snapshot: Record<string, unknown>): boolean {
  const allowedNumbers = normalizedNumericTokens(snapshot);
  // Contatti consentiti standard
  allowedNumbers.add("39");
  allowedNumbers.add("351");
  allowedNumbers.add("767");
  allowedNumbers.add("3737");
  allowedNumbers.add("3517673737");

  const answerNumbers = normalizedNumericTokens(answer);
  for (const num of answerNumbers) {
    const parsed = parseFloat(num);
    const parsedStr = !Number.isNaN(parsed) ? String(parsed) : null;
    const absStr = !Number.isNaN(parsed) ? String(Math.abs(parsed)) : null;

    const isAllowed =
      allowedNumbers.has(num) ||
      (parsedStr !== null && allowedNumbers.has(parsedStr)) ||
      (absStr !== null && allowedNumbers.has(absStr));

    if (!isAllowed) {
      return false;
    }
  }
  return true;
}
