// Supplier Dashboard AI Module — VolantiniPro
// Sola lettura, isolamento fornitore, compensi autorizzati, zero customer-price leakage.

export const SUPPLIER_SOURCE_ALLOWLIST = Object.freeze([
  "campaigns",
  "quotes",
  "supplier_profiles",
]);

export const FORBIDDEN_SUPPLIER_KEYS = Object.freeze([
  "customer_price",
  "customer_total",
  "total_amount_customer",
  "admin_notes",
  "competitor",
  "other_suppliers",
  "raw_gps",
  "driver_password",
  "driver_token",
  "driver_phone",
  "secret",
  "password",
]);

export interface SupplierResult {
  answer: string;
  summary: string;
  priorities: string[];
  warnings: string[];
  sources: string[];
  action?: {
    type: "navigate";
    route: string;
    label: string;
    campaignId?: string;
  } | null;
}

export function keysAreSupplierSafe(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return true;
  if (Array.isArray(obj)) return obj.every(keysAreSupplierSafe);

  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_SUPPLIER_KEYS.some((fk) => lower === fk.toLowerCase() || lower.includes("secret") || lower.includes("password"))) {
      return false;
    }
    if (typeof val === "object" && val !== null) {
      if (!keysAreSupplierSafe(val)) return false;
    }
  }
  return true;
}

export function validateSupplierSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.scope !== "supplier_dashboard") return false;
  if (typeof snapshot.supplierId !== "string" || !snapshot.supplierId.trim()) return false;
  if (!Array.isArray(snapshot.assignedCampaigns)) return false;

  const json = JSON.stringify(snapshot);
  if (json.length > 35000) return false;

  return keysAreSupplierSafe(snapshot);
}

function safeResult(
  answer: string,
  summary: string,
  priorities: string[] = [],
  sources: string[] = ["campaigns"],
  action: SupplierResult["action"] = null
): SupplierResult {
  return { answer, summary, priorities, warnings: [], sources, action };
}

export function deterministicSupplierResponse(snapshot: Record<string, any>, question: string): SupplierResult | null {
  const normalized = question.trim().toLowerCase();

  // 1. Rifiuto categorico mutazioni / scritture
  if (
    /\b(accetta|invia|submit|proponi)\b.*\b(offerta|preventivo|richiesta)\b/i.test(normalized) ||
    /\b(cambia|modifica|aggiorna)\b.*\b(compenso|prezzo|tariffa|data|quantit[àa]|quantita|quantità)\b/i.test(normalized) ||
    /\b(assegna|collega)\b.*\b(operatore|driver)\b/i.test(normalized) ||
    /\b(completa|termina|chiudi|segna)\b.*\b(campagna|lavoro|completat)/i.test(normalized)
  ) {
    return {
      answer: "L'Assistente VolantiniPro per Fornitori è in sola lettura (read-only): non può accettare o inviare offerte, modificare compensi o assegnare operatori. Usa i pulsanti appositi nella Dashboard Fornitore.",
      summary: "Azione non consentita: assistente in sola lettura.",
      priorities: [],
      warnings: ["READ_ONLY"],
      sources: [],
      action: {
        type: "preview_mutation",
        action: "supplier_dashboard_action",
        entityId: snapshot?.supplierId || "current",
        summary: "Operazione fornitore su marketplace/campagna",
        consequences: [
          "L'operazione deve essere gestita manualmente dalla sezione dedicata",
          "Nessuna modifica viene applicata in automatico dall'assistente",
        ],
      },
    };
  }

  const assigned = Array.isArray(snapshot.assignedCampaigns) ? snapshot.assignedCampaigns : [];
  const ownQuotes = Array.isArray(snapshot.ownQuotes) ? snapshot.ownQuotes : [];
  const targetCampaign = snapshot.targetCampaign || null;

  // 2. "Quali lavori ho attivi?" / "lavori attivi" / "Quali campagne mi sono state assegnate?"
  if (
    /lavori.*(?:attivi|assegnati|in\s+corso)/i.test(normalized) ||
    /quali\s+(?:campagne|lavori).*(?:attivi|assegnat|in\s+corso|miei|ho)/i.test(normalized) ||
    /campagne\s+attive/i.test(normalized) ||
    /cosa\s+ho\s+da\s+fare/i.test(normalized)
  ) {
    if (assigned.length === 0) {
      return safeResult(
        "Al momento non hai lavori attivi o campagne assegnate. Controlla le richieste disponibili nel marketplace.",
        "Nessun lavoro assegnato.",
        [],
        ["campaigns"],
        { type: "navigate", route: "supplier-dashboard", label: "Apri Marketplace" }
      );
    }
    const list = assigned
      .slice(0, 5)
      .map((c: any) => {
        const comp = c.supplierCompensation ? ` (Compenso: €${c.supplierCompensation})` : "";
        const city = c.city ? ` [${c.city}]` : "";
        return `- ${c.title || "Lavoro"}${city}: ${c.quantity || 0} pz${comp}`;
      })
      .join("\n");
    return safeResult(
      `Hai ${assigned.length} lavori assegnati:\n${list}`,
      `Lavori assegnati: ${assigned.length}.`,
      [],
      ["campaigns"],
      { type: "navigate", route: "supplier-dashboard", label: "Apri Lavori" }
    );
  }

  // 3. "Quanto è il mio compenso per questa campagna?" / "quanto compenso" / "mio compenso"
  if (
    /(?:quanto|quale|mio)?\s*compenso/i.test(normalized) ||
    /quanto\s+vengo\s+pagato/i.test(normalized) ||
    /quanto.*(?:pagat|compenso)/i.test(normalized)
  ) {
    const hasComp = (val: any) => val !== null && val !== undefined && val !== "" && Number.isFinite(Number(val));
    if (targetCampaign) {
      if (hasComp(targetCampaign.supplierCompensation)) {
        return safeResult(
          `Il tuo compenso concordato per la campagna "${targetCampaign.title}" è di €${targetCampaign.supplierCompensation}.`,
          `Compenso fornitore: €${targetCampaign.supplierCompensation}.`,
          [],
          ["quotes"]
        );
      }
      return safeResult("Compenso non disponibile per questa campagna.", "Compenso non disponibile.", [], ["quotes"]);
    }
    // Se non c'è target campaign, elenca i compensi noti delle campagne assegnate
    const withComp = assigned.filter((c: any) => hasComp(c.supplierCompensation));
    if (withComp.length > 0) {
      const list = withComp.map((c: any) => `- ${c.title}: €${c.supplierCompensation}`).join("\n");
      return safeResult(
        `Ecco i compensi concordati per i tuoi lavori assegnati:\n${list}`,
        `Compensi disponibili per ${withComp.length} campagne.`,
        [],
        ["quotes"]
      );
    }
    return safeResult("Compenso non disponibile nei dati operativi attuali.", "Compenso non disponibile.", [], ["quotes"]);
  }

  // 4. "Quando devo iniziare?" / "quando inizia"
  if (
    /quando\s+(?:devo\s+)?inizia(?:re)?/i.test(normalized) ||
    /data\s+(?:di\s+)?inizio/i.test(normalized) ||
    /quando\s+parte/i.test(normalized)
  ) {
    if (targetCampaign && targetCampaign.startDate) {
      return safeResult(
        `La data di inizio programmata per "${targetCampaign.title}" è il ${targetCampaign.startDate}.`,
        `Inizio: ${targetCampaign.startDate}.`,
        [],
        ["campaigns"]
      );
    }
    const withDate = assigned.filter((c: any) => c.startDate);
    if (withDate.length > 0) {
      const list = withDate.map((c: any) => `- ${c.title}: dal ${c.startDate}`).join("\n");
      return safeResult(
        `Date di inizio per le tue campagne assegnate:\n${list}`,
        `Date inizio per ${withDate.length} campagne.`,
        [],
        ["campaigns"]
      );
    }
    return safeResult("Questo dato non è disponibile per le campagne correnti.", "Data inizio non disponibile.", [], ["campaigns"]);
  }

  // 5. "Quali zone devo coprire?"
  if (
    /quali\s+zone\s+(?:devo\s+)?coprire/i.test(normalized) ||
    /zone\s+da\s+coprire/i.test(normalized) ||
    /dove\s+si\s+distribuisce/i.test(normalized)
  ) {
    if (targetCampaign && Array.isArray(targetCampaign.zones) && targetCampaign.zones.length > 0) {
      const zList = targetCampaign.zones.join(", ");
      return safeResult(
        `Le zone da coprire per "${targetCampaign.title}" sono: ${zList} (${targetCampaign.city || "territorio indicato"}).`,
        `Zone da coprire: ${zList}.`,
        [],
        ["campaigns"]
      );
    }
    if (assigned.length > 0) {
      const list = assigned
        .slice(0, 5)
        .map((c: any) => {
          const z = Array.isArray(c.zones) && c.zones.length > 0 ? c.zones.join(", ") : c.city || "Zona concordata";
          return `- ${c.title}: ${z}`;
        })
        .join("\n");
      return safeResult(
        `Territori e zone per le tue campagne:\n${list}`,
        "Zone delle campagne assegnate.",
        [],
        ["campaigns"]
      );
    }
    return safeResult("Questo dato non è disponibile.", "Nessuna zona registrata.", [], ["campaigns"]);
  }

  // 6. "Quante campagne ho questa settimana?" / "quante campagne"
  if (/quant[ee]\s+campagne/i.test(normalized) || /conteggio\s+lavori/i.test(normalized)) {
    return safeResult(
      `Attualmente risultano ${assigned.length} campagne assegnate al tuo profilo fornitore.`,
      `Totale campagne assegnate: ${assigned.length}.`,
      [],
      ["campaigns"]
    );
  }

  // 7. "Quali lavori sono ancora da accettare?" / "richieste disponibili"
  if (
    /da\s+accettare/i.test(normalized) ||
    /richieste\s+disponibili/i.test(normalized) ||
    /offerte\s+inviate/i.test(normalized)
  ) {
    const pendingQuotes = ownQuotes.filter((q: any) => q.status === "submitted" || q.status === "Inviata");
    const count = pendingQuotes.length;
    return safeResult(
      `Hai ${count} offerte inviate in attesa di decisione da parte del cliente o dell'amministrazione.`,
      `Offerte in attesa: ${count}.`,
      [],
      ["quotes"],
      { type: "navigate", route: "supplier-dashboard", label: "Apri Offerte Inviate" }
    );
  }

  // 8. "Apri il lavoro di Milano" / specifica campagna
  const openMatch = normalized.match(/apri(?:\s+il)?(?:\s+lavoro|\s+la\s+campagna)?(?:\s+di|\s+per)?\s+([a-zA-ZÀ-ÿ\s]+)/i);
  if (openMatch) {
    const query = openMatch[1].trim().toLowerCase();
    const matched = assigned.find((c: any) =>
      (c.title && c.title.toLowerCase().includes(query)) ||
      (c.city && c.city.toLowerCase().includes(query)) ||
      (Array.isArray(c.zones) && c.zones.some((z: string) => z.toLowerCase().includes(query)))
    );
    if (matched) {
      return safeResult(
        `Ho trovato il lavoro "${matched.title}" (${matched.city || "territorio assegnato"}). Puoi visualizzarlo direttamente:`,
        `Lavoro trovato: ${matched.title}.`,
        [],
        ["campaigns"],
        { type: "navigate", route: "supplier-dashboard", label: `Apri ${matched.title}`, campaignId: matched.id }
      );
    }
  }

  return null;
}

export function buildSupplierSystemPrompt() {
  return [
    "Sei l'Assistente VolantiniPro per i Partner Fornitori (Supplier).",
    "Rispondi SOLO ed ESCLUSIVAMENTE usando i dati reali forniti nello snapshot operativo autorizzato per questo fornitore.",
    "Se un dato non è presente o non è disponibile (es. compenso non concordato, data non specificata), rispondi chiaramente 'Questo dato non è disponibile' o 'Compenso non disponibile'. NON stimare, NON fare ipotesi e NON inventare cifre.",
    "Il compenso del fornitore deriva SOLO ed ESCLUSIVAMENTE dalla propria offerta accettata (supplierCompensation). NON mostrare MAI prezzi pagati dal cliente o importi totali cliente (customer total price).",
    "Non rivelare mai dati di altri fornitori concorrenti o compensi altrui.",
    "Sei rigorosamente di sola lettura (read-only): non dichiarare mai di aver accettato offerte, assegnato operatori o modificato compensi.",
    "Puoi suggerire un'azione di navigazione sicura nel campo 'action': {\"type\": \"navigate\", \"route\": \"supplier-dashboard\", \"label\": \"Testo Bottone\", \"campaignId\": null|string}.",
    `Le sources possono contenere solo: ${SUPPLIER_SOURCE_ALLOWLIST.join(", ")}. Non inventare URL.`,
    "Restituisci JSON valido nel formato: {\"answer\":string,\"summary\":string,\"priorities\":string[],\"warnings\":string[],\"sources\":string[],\"action\":null|object}.",
  ].join(" ");
}

export function buildSupplierUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Snapshot autorizzato del Fornitore:\n${JSON.stringify(snapshot, null, 2)}\n\nDomanda del Fornitore: "${question}"`;
}

export function validateSupplierAiResult(value: any): value is SupplierResult {
  if (!value || typeof value !== "object") return false;
  if (typeof value.answer !== "string" || !value.answer.trim() || typeof value.summary !== "string" || !value.summary.trim()) return false;
  if (![value.priorities, value.warnings, value.sources].every(Array.isArray)) return false;
  if (value.priorities.length > 8 || value.warnings.length > 8 || value.sources.length > SUPPLIER_SOURCE_ALLOWLIST.length) return false;
  return value.sources.every((s: string) => SUPPLIER_SOURCE_ALLOWLIST.includes(s));
}

export function supplierNumbersAreGrounded(result: SupplierResult, snapshot: Record<string, any>): boolean {
  const text = `${result.answer} ${result.summary}`;
  const extracted = text.match(/\b\d+(?:[.,]\d+)?\b/g);
  if (!extracted) return true;

  const allowed = new Set<number>();
  const addNum = (n: any) => {
    const num = Number(n);
    if (Number.isFinite(num)) allowed.add(num);
  };

  const assigned = Array.isArray(snapshot.assignedCampaigns) ? snapshot.assignedCampaigns : [];
  addNum(assigned.length);

  for (const c of assigned) {
    addNum(c.quantity);
    addNum(c.supplierCompensation);
  }

  const quotes = Array.isArray(snapshot.ownQuotes) ? snapshot.ownQuotes : [];
  addNum(quotes.length);
  for (const q of quotes) {
    addNum(q.totalAmount);
  }

  if (snapshot.targetCampaign) {
    addNum(snapshot.targetCampaign.quantity);
    addNum(snapshot.targetCampaign.supplierCompensation);
  }

  allowed.add(1);
  allowed.add(2);
  allowed.add(3);
  allowed.add(5);

  for (const token of extracted) {
    const num = Number(token.replace(",", "."));
    if (!Number.isFinite(num)) continue;
    if (!allowed.has(num)) {
      return false;
    }
  }
  return true;
}
