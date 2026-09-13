export const ADMIN_SOURCE_ALLOWLIST = Object.freeze([
  "operator_assignments",
  "campaign_zones",
  "delivery_sessions",
  "gps_telemetry_aggregated",
  "proof_photo_counts",
  "assignment_event_log",
  "operation_alerts",
  "campaigns",
  "quote_requests",
  "supplier_profiles",
  "conversations",
]);

const FORBIDDEN_SNAPSHOT_KEYS = /(^|_)(email|phone|telephone|mobile|token|secret|service_role|latitude|longitude|coordinates?|raw_gps|user_id|operator_id|customer_id|campaign_id|assignment_id|session_id|id)$/i;
const FORBIDDEN_GLOBAL_KEYS = /(^|_)(password|token|secret|service_role|raw_gps|coordinates)$/i;
const PII_PATTERN = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d .()-]{7,}\d))/i;
const SECRET_PATTERN = /(service\s*role|api\s*key|secret|token|password)/i;
const WRITE_PATTERN = /\b(cambia|modifica|elimina|cancella|crea|assegna|aggiorna|imposta|completa|segna\s+come|paga|salda)\b/i;
const PRIVACY_PATTERN = /\b(email|telefono|telefoni|phone|coordinate|raw\s*gps|tracce\s*grezze|pii)\b/i;

export type AdminAction = {
  type: "navigate";
  route: string;
  label: string;
  campaignId?: string | null;
};

export type AdminResult = {
  answer: string;
  summary: string;
  priorities: string[];
  warnings: string[];
  sources: string[];
  action?: AdminAction | null;
};

function keysArePrivacySafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysArePrivacySafe);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) => !FORBIDDEN_SNAPSHOT_KEYS.test(key) && keysArePrivacySafe(child));
}

function keysAreGlobalAdminSafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysAreGlobalAdminSafe);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) => !FORBIDDEN_GLOBAL_KEYS.test(key) && keysAreGlobalAdminSafe(child));
}

export function validateAdminSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  if (snapshot.scope === "global_admin") {
    if (snapshot.schemaVersion !== 1) return false;
    return keysAreGlobalAdminSafe(snapshot);
  }
  // Legacy snapshot validation:
  if (!keysArePrivacySafe(snapshot)) return false;
  if (snapshot.schemaVersion !== 1 || typeof snapshot.generatedAt !== "string" || typeof snapshot.date !== "string") return false;
  if (!snapshot.totals || !Array.isArray(snapshot.drivers) || !Array.isArray(snapshot.campaigns) || !Array.isArray(snapshot.sources)) return false;
  if (snapshot.drivers.length > 20 || snapshot.campaigns.length > 30) return false;
  if (!snapshot.sources.every((source: unknown) => typeof source === "string" && ADMIN_SOURCE_ALLOWLIST.includes(source))) return false;
  return Object.values(snapshot.totals).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

const safeResult = (answer: string, summary: string, warnings: string[] = [], sources: string[] = [], action: AdminAction | null = null): AdminResult => ({
  answer,
  summary,
  priorities: [],
  warnings,
  sources,
  action,
});

export function deterministicAdminResponse(snapshot: any, question: string): AdminResult | null {
  const normalized = question.trim().toLowerCase();

  // 1. Privacy e segreti di sistema
  if (PRIVACY_PATTERN.test(normalized)) {
    return safeResult("Non posso mostrare dati personali o coordinate. Il Copilot Admin usa esclusivamente dati operativi aggregati e privacy-safe.", "Richiesta rifiutata per tutela della privacy.", ["PII_NOT_AVAILABLE"]);
  }
  if (SECRET_PATTERN.test(normalized)) {
    return safeResult("Non posso accedere né mostrare chiavi, token o password di sistema.", "Richiesta di segreti rifiutata.", ["SECRETS_NOT_AVAILABLE"]);
  }

  // 1.5 Invio messaggi (Admin -> Customer o Admin -> Driver)
  const isMessageSend =
    /(?:scrivi|manda|invia)\s+(?:subito\s+)?(?:un\s+messaggio\s+)?(?:al\s+|a\s+)?(?:cliente|driver|operatore)/i.test(normalized) ||
    /^(?:scrivi|manda|invia)\s+(?:al\s+|a\s+)?(?:cliente|driver|operatore)/i.test(normalized);

  if (isMessageSend) {
    const isDriver = /driver|operatore/i.test(normalized);
    const recipientType = isDriver ? "driver" : "customer";

    let recipientName = isDriver ? "Driver" : "Cliente";
    let messageText = "";

    const colonIdx = question.indexOf(":");
    if (colonIdx !== -1 && colonIdx < question.length - 1) {
      messageText = question.slice(colonIdx + 1).trim();
      const beforeColon = question.slice(0, colonIdx);
      const nameMatch = beforeColon.match(/(?:cliente|driver|operatore)\s+([A-Za-zÀ-ÿ\s]+)/i);
      if (nameMatch && nameMatch[1].trim()) {
        recipientName = nameMatch[1].trim();
      }
    } else {
      const cheMatch = question.match(/(?:cliente|driver|operatore)(?:\s+([A-Za-zÀ-ÿ\s]+?))?\s+che\s+(.+)/i);
      if (cheMatch) {
        if (cheMatch[1] && cheMatch[1].trim()) recipientName = cheMatch[1].trim();
        messageText = cheMatch[2].trim();
      } else {
        const leadMatch = question.match(
          /(?:scrivi|manda|invia)\s+(?:subito\s+)?(?:un\s+messaggio\s+)?(?:al\s+|a\s+)?(?:cliente|driver|operatore)(?:\s+([A-Za-zÀ-ÿ\s]+?))?[\s,]+(.+)/i
        );
        if (leadMatch) {
          if (leadMatch[1] && leadMatch[1].trim()) recipientName = leadMatch[1].trim();
          messageText = leadMatch[2].trim();
        }
      }
    }

    if (!messageText) {
      messageText = question
        .replace(/^(?:scrivi|manda|invia)\s+(?:subito\s+)?(?:un\s+messaggio\s+)?(?:al\s+|a\s+)?(?:cliente|driver|operatore)\s*/i, "")
        .trim();
    }

    const uuidMatch = question.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    let entityId = (uuidMatch && uuidMatch[0]) || (isDriver
      ? snapshot?.assignmentId || (Array.isArray(snapshot?.assignments) && snapshot.assignments[0]?.id) || "pending"
      : snapshot?.targetCampaign?.id || snapshot?.campaignId || (Array.isArray(snapshot?.campaigns) && snapshot.campaigns[0]?.id) || "pending");

    const previewAction = {
      type: "preview_mutation",
      action: "admin_send_message",
      recipientType,
      recipientName,
      entityId,
      messageText,
      summary: `Invia messaggio a ${recipientName}: "${messageText}"`,
      consequences: [
        `Il messaggio verrà recapitato in tempo reale sul canale canonico ${isDriver ? "dell'operatore" : "della campagna cliente"}`,
        "L'invio richiede la conferma esplicita dell'amministratore prima di procedere",
      ],
    };

    return safeResult(
      `Ho preparato l'invio del messaggio per ${recipientName}: "${messageText}". Conferma l'operazione tramite il pulsante apposito per procedere con l'invio canonico.`,
      `Anteprima messaggio ${recipientType}`,
      ["READ_ONLY"],
      ["conversations"],
      previewAction
    );
  }

  // 2. Operazioni di scrittura / mutazione
  if (WRITE_PATTERN.test(normalized)) {
    let previewAction: any = null;
    if (/(?:assegna|affida)/i.test(normalized)) {
      previewAction = {
        type: "preview_mutation",
        action: "assign_campaign",
        entityId: snapshot?.campaignId || "pending",
        summary: "Assegnazione lavoro al fornitore",
        consequences: [
          "La campagna verrà associata al fornitore indicato",
          "Verrà generato un incarico per gli operatori",
        ],
      };
    } else if (/(?:paga|pagat|bonifico)/i.test(normalized)) {
      previewAction = {
        type: "preview_mutation",
        action: "mark_as_paid",
        entityId: snapshot?.campaignId || "pending",
        summary: "Registrazione incasso pagamento campagna",
        consequences: [
          "Lo stato del pagamento passerà a saldato",
          "Verrà aggiornato lo stato contabile",
        ],
      };
    } else {
      previewAction = {
        type: "preview_mutation",
        action: "update_record",
        entityId: snapshot?.campaignId || "record",
        summary: "Modifica stato o parametri operativi",
        consequences: [
          "Verrà registrata la variazione richiesta",
          "L'operazione richiederà conferma esplicita prima di qualunque scrittura",
        ],
      };
    }

    return safeResult(
      "Il Copilot Admin è rigorosamente in sola lettura (read-only) e non può modificare campagne, assegnare fornitori, registrare pagamenti o alterare stati. Ecco l'anteprima dell'azione:",
      "Nessuna azione è stata eseguita.",
      ["READ_ONLY"],
      ["campaigns"],
      previewAction
    );
  }

  // 3. Contatto umano / Supporto
  if (/(?:parlare|sentire|contattare).*(?:persona|operatore|consulente|umano|amministratore)|(?:numero|whatsapp|telefono|email).*(?:supporto|assistenza)/i.test(normalized)) {
    return safeResult("Puoi contattare l'assistenza tecnica o la direzione VolantiniPro: WhatsApp +39 351 767 3737 oppure Email info@volantinipro.it.", "Canali ufficiali di contatto VolantiniPro.", [], ["campaigns"]);
  }

  // --- Supporto Global Admin Snapshot ---
  if (snapshot?.scope === "global_admin") {
    const quotesToday = Array.isArray(snapshot?.quotesToday) ? snapshot.quotesToday : [];
    const unassigned = Array.isArray(snapshot?.unassignedCampaigns) ? snapshot.unassignedCampaigns : [];
    const unpaid = Array.isArray(snapshot?.unpaidCampaigns) ? snapshot.unpaidCampaigns : [];
    const gpsIssues = Array.isArray(snapshot?.gpsIssues) ? snapshot.gpsIssues : [];
    const activeSuppliers = Array.isArray(snapshot?.activeSuppliers) ? snapshot.activeSuppliers : [];
    const campaigns = Array.isArray(snapshot?.campaigns) ? snapshot.campaigns : [];

    // "preventivi oggi" / "quali preventivi sono arrivati oggi" / "quanti preventivi oggi"
    if (/(?:preventiv.*oggi|oggi.*preventiv)/i.test(normalized)) {
      if (quotesToday.length === 0) {
        return safeResult(
          "Oggi non sono ancora arrivati nuovi preventivi dal configuratore.",
          "Preventivi ricevuti oggi: 0.",
          [],
          ["quote_requests"],
          { type: "navigate", route: "admin-clients-quotes", label: "Apri Clienti & Preventivi" }
        );
      }
      const count = quotesToday.length;
      const details = quotesToday.slice(0, 5).map((q: any) => `- ${q.contactName || "Cliente"} (${q.city || "Zona non specificata"}, ${q.quantity || 0} volantini): ${q.amount ? `€${q.amount}` : "Importo in calcolo"}`).join("\n");
      return safeResult(
        `Oggi sono arrivati ${count} preventivi:\n${details}`,
        `Preventivi ricevuti oggi: ${count}.`,
        [],
        ["quote_requests"],
        { type: "navigate", route: "admin-clients-quotes", label: "Apri Clienti & Preventivi" }
      );
    }

    // "campagne non ancora assegnate" / "quali campagne non sono assegnate"
    if (/(?:campagn.*non.*assegnat|non.*ancora.*assegnat|non.*assegnat)/i.test(normalized)) {
      if (unassigned.length === 0) {
        return safeResult(
          "Tutte le campagne attive risultano attualmente assegnate a un fornitore o driver.",
          "Nessuna campagna da assegnare.",
          [],
          ["campaigns", "operator_assignments"]
        );
      }
      const count = unassigned.length;
      const details = unassigned.slice(0, 5).map((c: any) => `- ${c.name} (${c.city || "Città n.d."}, ${c.quantity || 0} pz)`).join("\n");
      return safeResult(
        `Ci sono ${count} campagne non ancora assegnate:\n${details}`,
        `Campagne da assegnare: ${count}.`,
        [],
        ["campaigns", "operator_assignments"],
        { type: "navigate", route: "admin-operations", label: "Apri Operazioni" }
      );
    }

    // "quali clienti devono ancora pagare" / "pagamenti da completare"
    if (/(?:client.*pagare|devono.*pagare|pagament.*completare|non.*pagat)/i.test(normalized)) {
      if (unpaid.length === 0) {
        return safeResult(
          "Tutte le campagne registrate risultano saldate. Nessun pagamento in sospeso.",
          "Nessun pagamento in sospeso.",
          [],
          ["campaigns"]
        );
      }
      const count = unpaid.length;
      const details = unpaid.slice(0, 5).map((c: any) => `- ${c.name} (${c.clientName || "Cliente"}): ${c.totalAmount ? `€${c.totalAmount}` : "importo n.d."} [Stato: ${c.paymentStatus || "non pagato"}]`).join("\n");
      return safeResult(
        `Risultano ${count} campagne con pagamento da completare:\n${details}`,
        `Campagne non pagate: ${count}.`,
        [],
        ["campaigns"]
      );
    }

    // "ci sono problemi gps" / "quali campagne hanno problemi gps"
    if (/(?:problem.*gps|gps.*problem|gps.*anomali|gps.*ferm)/i.test(normalized)) {
      if (gpsIssues.length === 0) {
        return safeResult(
          "Al momento non risultano anomalie o problemi GPS nelle sessioni attive.",
          "Nessun problema GPS attivo.",
          [],
          ["delivery_sessions"]
        );
      }
      const count = gpsIssues.length;
      const details = gpsIssues.slice(0, 5).map((g: any) => `- Campagna ${g.campaignId || "n.d."}: sessione ${g.status || "sospesa"} (${g.driverName || "Driver"})`).join("\n");
      return safeResult(
        `Risultano ${count} anomalie o alert GPS attivi:\n${details}`,
        `Anomalie GPS: ${count}.`,
        ["GPS_ATTENTION"],
        ["delivery_sessions"]
      );
    }

    // "quali fornitori hanno lavori attivi"
    if (/(?:fornitor.*attivi|fornitor.*lavori)/i.test(normalized)) {
      if (activeSuppliers.length === 0) {
        return safeResult(
          "Nessun fornitore esterno ha lavori attivi in questo momento.",
          "Fornitori attivi: 0.",
          [],
          ["supplier_profiles"],
          { type: "navigate", route: "admin-suppliers", label: "Apri Fornitori" }
        );
      }
      const count = activeSuppliers.length;
      const details = activeSuppliers.map((s: any) => `- ${s.companyName || "Fornitore"} (${s.activeCount || 1} campagne assegnate)`).join("\n");
      return safeResult(
        `Ci sono ${count} fornitori con lavori attivi:\n${details}`,
        `Fornitori con lavori attivi: ${count}.`,
        [],
        ["supplier_profiles"],
        { type: "navigate", route: "admin-suppliers", label: "Apri Fornitori" }
      );
    }

    // "apri la campagna di marco bianchi" o nome/città specifica
    const openCampaignMatch = normalized.match(/apri(?:\s+la)?\s+campagna(?:\s+di|\s+per)?\s+([a-zA-ZÀ-ÿ\s]+)/i);
    if (openCampaignMatch) {
      const targetQuery = openCampaignMatch[1].trim().toLowerCase();
      const matchedCampaign = campaigns.find((c: any) =>
        (c.name && c.name.toLowerCase().includes(targetQuery)) ||
        (c.clientName && c.clientName.toLowerCase().includes(targetQuery)) ||
        (c.city && c.city.toLowerCase().includes(targetQuery)) ||
        (Array.isArray(c.zones) && c.zones.some((z: string) => z.toLowerCase().includes(targetQuery)))
      );
      if (matchedCampaign) {
        return safeResult(
          `Ho trovato la campagna "${matchedCampaign.name}" (${matchedCampaign.clientName || matchedCampaign.city || "Cliente registrato"}). Puoi aprirla direttamente:`,
          `Campagna trovata: ${matchedCampaign.name}.`,
          [],
          ["campaigns"],
          { type: "navigate", route: `admin-operations:${matchedCampaign.id}`, label: `Apri Campagna ${matchedCampaign.name}`, campaignId: matchedCampaign.id }
        );
      }
    }
  }

  // --- Supporto Legacy Snapshot ---
  if ((snapshot?.totals?.assignments || 0) === 0 && !snapshot?.scope) {
    return safeResult("Nessuna attività operativa registrata per oggi.", "Non risultano operazioni per la data selezionata.");
  }
  if (/volantini.*distribuit|distribuit.*volantini/i.test(question) && snapshot?.availability?.distributedQuantity === false) {
    return safeResult("Il dato dei volantini realmente distribuiti non è disponibile. La quantità assegnata non viene usata come quantità distribuita.", "Quantità distribuita non disponibile.", ["DISTRIBUTED_QUANTITY_NOT_AVAILABLE"]);
  }
  if (/\b(km|chilometr)/i.test(question) && snapshot?.availability?.distanceKm === false) {
    return safeResult("Il dato sui chilometri percorsi non è disponibile nello snapshot operativo.", "Distanza non disponibile.", ["DISTANCE_NOT_AVAILABLE"]);
  }
  if (/motivo.*blocc|perch[eé].*blocc/i.test(question) && snapshot?.availability?.blockReason === false) {
    return safeResult("Il motivo del blocco non è disponibile nei dati operativi forniti.", "Motivo del blocco non disponibile.", ["BLOCK_REASON_NOT_AVAILABLE"]);
  }
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
    "Sei l'Assistente VolantiniPro Copilot per l'Area Amministrativa (Admin).",
    "Rispondi SOLO ed ESCLUSIVAMENTE usando i dati reali forniti nello snapshot operativo autorizzato.",
    "Se un dato non è presente o non è disponibile (es. GPS non attivo, report non generato, fornitore non assegnato), dichiara chiaramente 'Questo dato non è disponibile'. NON stimare, NON fare ipotesi e NON inventare numeri, stati o nomi.",
    "Sei rigorosamente di sola lettura (read-only): non dichiarare mai di aver modificato, cancellato o assegnato campagne, fornitori o pagamenti.",
    "Non rivelare mai coordinate GPS raw, credenziali, token o password tecniche.",
    "Se la risposta riguarda una pagina o una campagna specifica, puoi suggerire un'azione di navigazione sicura nel campo 'action': {\"type\": \"navigate\", \"route\": \"nome_route\", \"label\": \"Testo Bottone\", \"campaignId\": null|string}.",
    "Le route ammesse per l'azione di navigazione sono: admin, admin-clients-quotes, admin-operations, admin-gps, admin-suppliers, admin-communications, admin-analytics.",
    `Le sources possono contenere solo: ${ADMIN_SOURCE_ALLOWLIST.join(", ")}. Non inventare URL.`,
    "Restituisci JSON valido nel formato: {\"answer\":string,\"summary\":string,\"priorities\":string[],\"warnings\":string[],\"sources\":string[],\"action\":null|object}.",
  ].join(" ");
}

export function buildAdminUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Snapshot operativo reale autorizzato per Admin:\n${JSON.stringify(snapshot, null, 2)}\n\nDomanda dell'Admin: "${question}"`;
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

export function numbersAreGrounded(value: AdminResult, snapshot: unknown): boolean {
  const allowedNumbers = normalizedNumericTokens(snapshot);
  // Contatti consentiti standard
  allowedNumbers.add("39");
  allowedNumbers.add("351");
  allowedNumbers.add("767");
  allowedNumbers.add("3737");
  allowedNumbers.add("3517673737");

  const outputText = [value.answer, value.summary, ...value.priorities, ...value.warnings].join(" ");
  const outputNumbers = normalizedNumericTokens(outputText);

  for (const num of outputNumbers) {
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
