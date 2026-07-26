import { AI_TOOL_NAMES } from "../../contracts.js";
import { CUSTOMER_TOOL_DATA_STATES } from "./customerDashboardAdapters.mjs";

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const labels = Object.freeze({
  [AI_TOOL_NAMES.CUSTOMER]: "Profilo cliente",
  [AI_TOOL_NAMES.CAMPAIGN]: "Campagna",
  [AI_TOOL_NAMES.DASHBOARD]: "Dashboard",
});
const statusLabel = (value) => ({
  confermata: "confermata", in_preparazione: "in preparazione", in_distribuzione: "in distribuzione",
  completata: "completata", report_pronto: "completata con report indicato", preventivo: "in preventivo",
}[value] ?? value ?? "non disponibile");
const serviceLabel = (value) => ({ d2d: "Door to Door", h2h: "Hand to Hand", b2b: "Distribuzione Business" }[value] ?? value ?? "non disponibile");
const formatNumber = (value) => value == null ? "dato non disponibile" : Number(value).toLocaleString("it-IT");
const formatDate = (value) => value ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(value)) : "data non disponibile";

export const CUSTOMER_DASHBOARD_SUPPORTED_QUESTIONS = Object.freeze([
  "A che punto e la mia campagna?",
  "Mostrami le mie campagne recenti.",
  "Mostrami il mio ultimo preventivo.",
  "Quale servizio ho scelto?",
  "Qual e la quantita della campagna?",
  "In quale zona e prevista la distribuzione?",
  "Quando e programmato il lavoro?",
  "La campagna e completata?",
  "Sono disponibili report o foto?",
  "Spiegami questa dashboard.",
  "Quali informazioni risultano mancanti?",
]);

function classify(message) {
  const input = normalize(message);
  if (/altro cliente|customer.?id|cliente.?id|owner.?id/.test(input)) return { intent: "unsupported_identity", tool: null };
  if (/invia.*email|modific|cambia|elimina|cancella|crea|aggiorna/.test(input)) return { intent: "unsupported", tool: null };
  if (/campagn(e|a).*recent|recent.*campagn/.test(input)) return { intent: "recent", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "recent" };
  if (/preventiv/.test(input)) return { intent: "quote", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_quote" };
  if (/report|foto|document/.test(input)) return { intent: "assets", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "assets" };
  if (/mancant|non disponibil/.test(input)) return { intent: "missing", tool: AI_TOOL_NAMES.DASHBOARD, operation: "missing" };
  if (/spieg.*dashboard|dati.*dashboard|riepilog.*dashboard/.test(input)) return { intent: "overview", tool: AI_TOOL_NAMES.DASHBOARD, operation: "overview" };
  if (/servizio/.test(input)) return { intent: "service", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_details" };
  if (/quantita|volantin/.test(input)) return { intent: "quantity", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_details" };
  if (/zona|comune|distribuzione prevista/.test(input)) return { intent: "zone", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_details" };
  if (/quando|programm|data|periodo/.test(input)) return { intent: "schedule", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_details" };
  if (/completat|conclusa|finita/.test(input)) return { intent: "completion", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_details" };
  if (/stato|a che punto|campagna/.test(input)) return { intent: "status", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "latest_status" };
  if (/profilo|account|chi sono/.test(input)) return { intent: "profile", tool: AI_TOOL_NAMES.CUSTOMER, operation: "profile" };
  return { intent: "unsupported", tool: null };
}

function emptyText(intent) {
  return intent === "quote" ? "Non risultano preventivi nei dati della Dashboard Cliente."
    : intent === "recent" ? "Non risultano campagne recenti nei dati della Dashboard Cliente."
      : "Non risultano campagne collegate al cliente autenticato.";
}

function factualText(intent, payload) {
  const data = payload.data;
  if (payload.state === CUSTOMER_TOOL_DATA_STATES.EMPTY) return emptyText(intent);
  if (intent === "status") return `La campagna piu recente risulta ${statusLabel(data.status)}.`;
  if (intent === "recent") return data.map((campaign, index) => `${index + 1}. ${campaign.zone || "Zona non disponibile"} - ${statusLabel(campaign.status)} - ${formatNumber(campaign.quantity)} volantini.`).join("\n");
  if (intent === "quote") return `L'ultimo preventivo disponibile riguarda ${serviceLabel(data.service)}, ${formatNumber(data.quantity)} volantini, zona ${data.zone || "non disponibile"}${data.totalAmount == null ? ". Totale non disponibile." : `, totale reale EUR ${data.totalAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}.`}`;
  if (intent === "service") return `Il servizio indicato per la campagna piu recente e ${serviceLabel(data.service)}.`;
  if (intent === "quantity") return `La quantita indicata per la campagna piu recente e ${formatNumber(data.quantity)} volantini.`;
  if (intent === "zone") return `La zona indicata e ${data.zone || "non disponibile"}${data.municipalities?.length ? `. Comuni: ${data.municipalities.join(", ")}.` : "."}`;
  if (intent === "schedule") return `Il lavoro risulta programmato dal ${formatDate(data.startDate)} al ${formatDate(data.endDate)}.`;
  if (intent === "completion") return ["completata", "report_pronto"].includes(data.status) ? "Si, la campagna piu recente risulta completata." : `No: lo stato disponibile e ${statusLabel(data.status)}.`;
  if (intent === "assets") return `${data.reportIndicator ? "Lo stato campagna indica che un report puo essere disponibile." : "Lo stato campagna non indica ancora un report disponibile."} La fonte foto non e collegata a questo assistente, quindi non posso confermarne la disponibilita.`;
  if (intent === "overview") return `La Dashboard contiene ${data.campaignCount} campagne: ${data.activeCount} attive, ${data.completedCount} completate, ${data.pendingPaymentCount} con pagamento da verificare e ${data.reportIndicatorCount} con indicatore report.`;
  if (intent === "missing") return data.noCampaigns ? "Non ci sono campagne da verificare." : data.fields.length ? `Nella campagna piu recente mancano: ${data.fields.join(", ")}.` : "I campi principali della campagna piu recente risultano disponibili.";
  if (intent === "profile") return `Il profilo cliente autenticato e ${data.name || data.email || "disponibile"}.`;
  return "Questa richiesta non e ancora supportata dall'Assistente VolantiniPro. Consulta le sezioni Campagne e preventivi della Dashboard.";
}

/** Runtime deterministico: nessun modello o segreto nel browser, solo risposte dai tool reali. */
export class CustomerDashboardReadOnlyRuntime {
  async plan({ message }) {
    const classified = classify(message);
    return Object.freeze({
      intent: classified.intent,
      requiresData: Boolean(classified.tool),
      toolCalls: classified.tool ? Object.freeze([{ id: `customer-dashboard:${classified.intent}`, name: classified.tool, arguments: Object.freeze({ operation: classified.operation }) }]) : Object.freeze([]),
    });
  }

  async respond({ plan, toolResults }) {
    if (plan.intent === "unsupported_identity") return Object.freeze({ text: "Non posso consultare identificativi cliente forniti nel messaggio. Uso esclusivamente il cliente autenticato.", citations: [], sources: [], kind: "general" });
    if (plan.intent === "unsupported") return Object.freeze({ text: "Questa richiesta non e ancora supportata dall'Assistente VolantiniPro. Consulta le sezioni Campagne e preventivi della Dashboard.", citations: [], sources: [], kind: "general" });
    const result = toolResults.find((item) => item.status === "success");
    if (!result) return Object.freeze({ text: "I dati autorizzati non sono disponibili in questo momento.", citations: [], sources: [], kind: "general" });
    return Object.freeze({ text: factualText(plan.intent, result.data), citations: Object.freeze([result.callId]), sources: Object.freeze([result.tool]), kind: plan.intent === "overview" || plan.intent === "missing" ? "explanation" : "fact" });
  }
}

export function customerToolSourceLabel(name) { return labels[name] ?? "Fonte interna"; }
