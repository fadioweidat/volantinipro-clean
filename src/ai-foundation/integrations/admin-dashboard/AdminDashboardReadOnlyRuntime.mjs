import { AI_TOOL_NAMES } from "../../contracts.js";

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const sourceLabels = Object.freeze({ [AI_TOOL_NAMES.CAMPAIGN]: "Campagne", [AI_TOOL_NAMES.CUSTOMER]: "Clienti da campagne", [AI_TOOL_NAMES.DASHBOARD]: "Dashboard Admin" });
const unsupported = "Questa richiesta non e disponibile nell'integrazione read-only Admin. Posso consultare solo campagne, clienti derivati dalle campagne e indicatori della Dashboard.";

export const ADMIN_DASHBOARD_SUPPORTED_QUESTIONS = Object.freeze([
  "Mostrami le campagne che richiedono attenzione.", "Quali dati risultano mancanti?", "Riassumi le campagne attive.",
  "Quali preventivi sono ancora aperti?", "Spiegami questa Dashboard.", "Quali campagne sono in ritardo?", "Mostrami i clienti recenti.", "Spiegami i KPI.",
]);

function classify(message) {
  const input = normalize(message);
  if (/modific|aggiorn|assegna|invia|approva|paga|elimina|cancella|crea|scrivi|salva/.test(input)) return { intent: "write_rejected" };
  if (/altro admin|admin.?id|subject.?id|user.?id|cambia.*ruolo|come.*cliente|come.*fornitore/.test(input)) return { intent: "identity_rejected" };
  if (/fornitor|document|fattur|pagament|gps|copertura/.test(input)) return { intent: "source_unavailable" };
  if (/cliente.*recent|recent.*client/.test(input)) return { intent: "recent_customers", tool: AI_TOOL_NAMES.CUSTOMER, operation: "recent" };
  if (/preventiv.*apert|preventiv.*attesa|quali.*preventiv/.test(input)) return { intent: "open_quotes", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "open_quotes" };
  if (/ritard/.test(input)) return { intent: "late", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "late" };
  if (/attenzion|problem|critic/.test(input)) return { intent: "attention", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "attention" };
  if (/mancant|incomplet|non disponibil/.test(input)) return { intent: "missing", tool: AI_TOOL_NAMES.DASHBOARD, operation: "missing" };
  if (/kpi|indicatore|come.*calcol/.test(input)) return { intent: "kpis", tool: AI_TOOL_NAMES.DASHBOARD, operation: "kpis" };
  if (/attiv/.test(input)) return { intent: "active", tool: AI_TOOL_NAMES.CAMPAIGN, operation: "active" };
  if (/spieg.*dashboard|riassum.*dashboard|panoramica|riepilog/.test(input)) return { intent: "overview", tool: AI_TOOL_NAMES.DASHBOARD, operation: "overview" };
  return { intent: "unsupported" };
}

const rowText = (row, index) => `${index + 1}. Rif. ${row.reference} - ${row.clientLabel} - ${row.zone || "zona non disponibile"} - stato ${row.status || "non disponibile"}${row.attentionRules?.length ? `; regola: ${row.attentionRules.join("; ")}` : ""}.`;
function factualText(intent, payload) {
  const data = payload.data;
  if (payload.state === "empty") return intent === "active" ? "Non risultano campagne attive reali." : intent === "open_quotes" ? "Non risultano preventivi aperti nei dati collegati." : "Non risultano record corrispondenti nei dati collegati.";
  if (["active", "late", "attention", "open_quotes"].includes(intent)) return data.map(rowText).join("\n");
  if (intent === "recent_customers") return data.map((row, index) => `${index + 1}. ${row.label} - ultima campagna rif. ${row.latestCampaignReference}.`).join("\n");
  if (intent === "overview") return `La Dashboard contiene ${data.realCampaigns} campagne reali: ${data.activeCampaigns} attive, ${data.lateCampaigns} in ritardo, ${data.attentionCampaigns} da attenzionare, ${data.incompleteRecords} record incompleti e ${data.openQuotes} preventivi aperti.`;
  if (intent === "missing") {
    const sources = data.unavailableSources.length ? `Fonti non disponibili: ${data.unavailableSources.join(", ")}. ` : "";
    const records = data.incompleteRecords.length ? `Record incompleti: ${data.incompleteRecords.map((row) => `rif. ${row.reference} (${row.reason})`).join(", ")}.` : "Non risultano record incompleti.";
    return `${sources}${records}`;
  }
  if (intent === "kpis") return `KPI letti: ${data.values.activeCampaigns} campagne attive, ${data.values.lateCampaigns} in ritardo, ${data.values.attentionCampaigns} da attenzionare, ${data.values.openQuotes} preventivi aperti. Regole: attive = ${data.definitions.activeCampaigns}; ritardi = ${data.definitions.lateCampaigns}; attenzione = ${data.definitions.attentionCampaigns}; preventivi aperti = ${data.definitions.openQuotes}.`;
  return unsupported;
}

export class AdminDashboardReadOnlyRuntime {
  async plan({ message }) {
    const value = classify(message);
    return Object.freeze({ intent: value.intent, requiresData: Boolean(value.tool), toolCalls: value.tool ? Object.freeze([{ id: `admin-dashboard:${value.intent}`, name: value.tool, arguments: Object.freeze({ operation: value.operation }) }]) : Object.freeze([]) });
  }
  async respond({ plan, toolResults }) {
    if (plan.intent === "write_rejected") return Object.freeze({ text: "L'Assistente Admin e di sola lettura: non modifica dati e non esegue decisioni o azioni automatiche.", citations: [], sources: [], kind: "general" });
    if (plan.intent === "identity_rejected") return Object.freeze({ text: "Non accetto ruoli o identificativi dal messaggio. Uso esclusivamente l'identita Admin verificata dalla piattaforma.", citations: [], sources: [], kind: "general" });
    if (plan.intent === "source_unavailable") return Object.freeze({ text: "Questa fonte non e collegata all'Assistente Admin; non posso confermare dati non disponibili.", citations: [], sources: [], kind: "general" });
    if (plan.intent === "unsupported") return Object.freeze({ text: unsupported, citations: [], sources: [], kind: "general" });
    const result = toolResults.find((item) => item.status === "success");
    if (!result) return Object.freeze({ text: "I dati Admin autorizzati non sono disponibili in questo momento.", citations: [], sources: [], kind: "general" });
    return Object.freeze({ text: factualText(plan.intent, result.data), citations: Object.freeze([result.callId]), sources: Object.freeze([result.tool]), kind: ["overview", "missing", "kpis", "attention", "late"].includes(plan.intent) ? "explanation" : "fact" });
  }
}

export function adminToolSourceLabel(name) { return sourceLabels[name] ?? "Fonte interna"; }
