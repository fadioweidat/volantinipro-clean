import { AI_TOOL_NAMES } from "../../contracts.js";

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const fmt = (value) => value == null ? "dato non disponibile" : Number(value).toLocaleString("it-IT", { maximumFractionDigits: 1 });
const pct = (value) => value == null ? "dato non disponibile" : `${fmt(value)}%`;

export const TERRITORIAL_SUPPORTED_QUESTIONS = Object.freeze([
  "Spiegami questa analisi.", "La quantita e sufficiente?", "Qual e la copertura stimata?", "Quali dati risultano mancanti?", "Quali sono fermate e stazioni?", "Qual e il piano materiali?", "Spiegamelo in modo semplice.",
]);

function classify(message) {
  const input = normalize(message);
  if (/modific|cambia|aumenta|riduci|imposta|seleziona(?:re)?\b|aggiungi|rimuovi|procedi|vai allo step|salva/.test(input)) return { intent: "write_rejected" };
  if (/fai finta|assumi|usa.*(?:quantita|copertura|famiglie|raggio|identita)|altro cliente|identita|identity|principal.?id|user.?id|customer.?id|subject.?id|session.?id|campaign.?id|quote.?id|preventivo.?id|come admin|come cliente/.test(input)) return { intent: "override_rejected" };
  if (/quantita.*material|materiali.*quantita|piano.*material|materiali.*(?:richiest|mancant|residu)|\bmateriali\b/.test(input)) return { intent: "materials", operation: "materials" };
  if (/punti?.*selezionat/.test(input)) return { intent: "selected_points", operation: "selected_points" };
  if (/stazion/.test(input)) return { intent: "stations", operation: "stations" };
  if (/fermat|transit|\btpl\b/.test(input)) return { intent: "transit", operation: "transit" };
  if (/attivit|imprese|aziende/.test(input)) return { intent: "businesses", operation: "businesses" };
  if (/famigli|cassett/.test(input)) return { intent: "families", operation: "families" };
  if (/copertura|perche.*complet/.test(input)) return { intent: "coverage", operation: "coverage" };
  if (/surplus|mancano.*volantin|quantita.*suff|differenza.*(?:quantita|fabbisogno)|fabbisogno/.test(input)) return { intent: "quantity", operation: "quantity" };
  if (/zone|comuni|cap|nil|raggio.*selezionat/.test(input)) return { intent: "zones", operation: "zones" };
  if (/mancant|non disponibil|parzial/.test(input)) return { intent: "missing", operation: "missing" };
  if (/stato.*calcol|calcol.*stato|analisi.*(?:pronta|completa|caricamento)/.test(input)) return { intent: "calculation_status", operation: "missing" };
  if (/semplice|senza termini tecnici/.test(input)) return { intent: "simple", operation: "simple" };
  if (/spieg|analisi|riepilog|panoramic|risultato/.test(input)) return { intent: "overview", operation: "overview" };
  return { intent: "unsupported" };
}

function sourceKeys(intent, serviceKey) {
  if (intent === "quantity") return ["quantity", "requirement", "surplus"];
  if (intent === "coverage") return ["coverage", "requirement"];
  if (intent === "families") return ["families"];
  if (intent === "zones") return ["territory"];
  if (intent === "selected_points") return serviceKey === "b2b" ? ["businesses"] : ["poi"];
  if (intent === "transit" || intent === "stations") return ["transit"];
  if (intent === "businesses") return ["businesses"];
  if (intent === "materials") return ["materials"];
  if (intent === "missing" || intent === "calculation_status") return ["calculationStatus"];
  if (serviceKey === "h2h") return ["service", "territory", "poi", "transit", "calculationStatus"];
  if (serviceKey === "b2b") return ["service", "territory", "businesses", "materials", "calculationStatus"];
  return ["service", "territory", "families", "population", "coverage", "requirement", "calculationStatus"];
}

export function territorialSourcesForIntent(snapshot, intent) {
  const fieldSources = snapshot?.fieldSources ?? {};
  const seen = new Set();
  return Object.freeze(sourceKeys(intent, snapshot?.service?.key)
    .flatMap((key) => Array.isArray(fieldSources[key]) ? fieldSources[key] : [])
    .filter((item) => item?.name && !seen.has(`${item.kind}:${item.name}:${item.source ?? ""}`) && seen.add(`${item.kind}:${item.name}:${item.source ?? ""}`))
    .map((item) => Object.freeze({
      name: item.name,
      kind: item.kind,
      provider: item.provider ?? null,
      dataset: item.dataset ?? null,
      source: item.source ?? null,
      status: item.status ?? "missing",
      limitation: item.limitation ?? null,
    })));
}

function sourcesText(snapshot, intent) {
  const values = territorialSourcesForIntent(snapshot, intent);
  if (!values.length) return " La provenienza specifica di questo fatto non è disponibile nello snapshot.";
  const describe = (item) => {
    const details = [item.name];
    if (item.provider) details.push(`provider: ${item.provider}`);
    if (item.dataset) details.push(`dataset: ${item.dataset}`);
    if (item.source && item.source !== item.provider && item.source !== item.dataset) details.push(`fonte: ${item.source}`);
    details.push(`stato: ${item.status}`);
    return `${item.kind === "application" ? "interno Step 2" : "dato territoriale"} — ${details.join(" — ")}`;
  };
  return ` Fonti pertinenti: ${values.map(describe).join("; ")}.`;
}

function unavailableState(snapshot) {
  if (snapshot.state === "loading") return "L'analisi territoriale e ancora in caricamento.";
  if (snapshot.state === "error") return "Il risultato territoriale non e disponibile per un errore tecnico controllato.";
  if (snapshot.state === "unsupported_service") return "Il servizio selezionato non e supportato dal Territory Tool.";
  if (snapshot.state === "missing") return "Nessuna metrica utile per il servizio selezionato è disponibile nello snapshot.";
  if (snapshot.state === "unavailable") return `I dati territoriali non sono disponibili${snapshot.calculation.unavailableReason ? `: ${snapshot.calculation.unavailableReason}` : "."}`;
  return null;
}

function quantityText(snapshot) {
  const q = snapshot.quantity;
  if (q.current == null || q.recommended == null) return "Quantita corrente o fabbisogno non sono disponibili nello snapshot.";
  if (q.shortage > 0) return `Il motore indica ${fmt(q.current)} volantini rispetto a un fabbisogno di ${fmt(q.recommended)}: risultano mancanti ${fmt(q.shortage)} volantini. E una spiegazione del risultato, non una modifica della quantita.`;
  if (q.surplus > 0) return `Il motore indica ${fmt(q.current)} volantini rispetto a un fabbisogno di ${fmt(q.recommended)}: il surplus calcolato e ${fmt(q.surplus)} volantini. La scelta resta all'utente.`;
  return `La quantita corrente di ${fmt(q.current)} volantini coincide con il fabbisogno indicato di ${fmt(q.recommended)}.`;
}

function serviceOverview(snapshot, simple = false) {
  const territory = snapshot.territory.label || "territorio selezionato";
  if (snapshot.service.key === "d2d") return simple
    ? `Per ${territory}, il sistema indica ${fmt(snapshot.metrics.families)} famiglie raggiungibili e una copertura operativa del ${pct(snapshot.metrics.residentialCoveragePct)}.`
    : `Analisi Door to Door per ${territory}: ${fmt(snapshot.metrics.families)} famiglie, popolazione ${fmt(snapshot.metrics.population)}, copertura del fabbisogno ${pct(snapshot.metrics.residentialCoveragePct)} e fabbisogno consigliato ${fmt(snapshot.metrics.recommendedQuantity)} volantini.`;
  if (snapshot.service.key === "h2h") return `Analisi Hand to Hand per ${territory}: ${fmt(snapshot.metrics.poiAvailable)} POI disponibili, ${fmt(snapshot.metrics.selectedPoints)} punti selezionati, ${fmt(snapshot.metrics.transitStops)} fermate e ${fmt(snapshot.metrics.stations)} stazioni. Non vengono applicate famiglie o copertura residenziale Door to Door.`;
  return `Analisi Business per ${territory}: ${fmt(snapshot.metrics.businessesAvailable)} attivita disponibili, ${fmt(snapshot.metrics.selectedBusinesses)} selezionate; piano materiali: ${fmt(snapshot.metrics.materialsRequired)} richiesti, ${fmt(snapshot.metrics.materialsMissing)} mancanti e ${fmt(snapshot.metrics.materialsRemaining)} residui. Il dato delle attività deriva dalla fonte collegata e non equivale a un censimento completo delle imprese.`;
}

function factualText(intent, snapshot) {
  const unavailable = unavailableState(snapshot); if (unavailable) return unavailable;
  if (intent === "families") return snapshot.service.key === "d2d" ? `Le famiglie raggiungibili indicate dal motore sono ${fmt(snapshot.metrics.families)}.` : "Le famiglie sono una metrica Door to Door e non sono disponibili per il servizio selezionato.";
  if (intent === "coverage") return snapshot.service.key === "d2d" ? `La copertura operativa stimata dal motore e ${pct(snapshot.metrics.residentialCoveragePct)} del fabbisogno indicato.` : "La copertura residenziale non e applicabile a questo servizio; non riutilizzo la metrica Door to Door.";
  if (intent === "quantity") return quantityText(snapshot);
  if (intent === "zones") return snapshot.territory.selectedNames.length ? `Zone presenti nello snapshot: ${snapshot.territory.selectedNames.join(", ")}.` : "I nomi delle zone selezionate non sono disponibili nello snapshot minimizzato.";
  if (intent === "transit") return snapshot.service.key === "h2h" ? `Le fermate di transito disponibili sono ${fmt(snapshot.metrics.transitStops)}.` : "Le metriche di transito sono supportate esclusivamente per il servizio Hand to Hand.";
  if (intent === "stations") return snapshot.service.key === "h2h" ? `Le stazioni disponibili sono ${fmt(snapshot.metrics.stations)}.` : "Le stazioni sono una metrica Hand to Hand e non sono disponibili per il servizio selezionato.";
  if (intent === "selected_points") return snapshot.service.key === "h2h" ? `I punti Hand to Hand selezionati sono ${fmt(snapshot.metrics.selectedPoints)}.` : "I punti selezionati Hand to Hand non sono disponibili per il servizio selezionato.";
  if (intent === "businesses") return snapshot.service.key === "b2b" ? `Le attività disponibili sono ${fmt(snapshot.metrics.businessesAvailable)} e quelle selezionate sono ${fmt(snapshot.metrics.selectedBusinesses)}.` : "Le attività sono una metrica Business e non sono disponibili per il servizio selezionato.";
  if (intent === "materials") return snapshot.service.key === "b2b" ? `Il piano materiali indica ${fmt(snapshot.metrics.materialsRequired)} materiali richiesti, ${fmt(snapshot.metrics.materialsMissing)} mancanti e ${fmt(snapshot.metrics.materialsRemaining)} residui.` : "Il piano materiali è disponibile esclusivamente per il servizio Business.";
  if (intent === "missing") {
    const missing = snapshot.missing.length ? `Dati mancanti: ${snapshot.missing.join(", ")}.` : "I campi principali supportati risultano presenti.";
    const limitation = snapshot.limitations.length ? ` Limitazioni dichiarate: ${snapshot.limitations.slice(0, 3).join(" ")}` : "";
    return `${missing}${limitation}`;
  }
  if (intent === "calculation_status") return `Lo stato del calcolo territoriale è ${snapshot.calculation.status || snapshot.state}.`;
  return serviceOverview(snapshot, intent === "simple");
}

export class TerritorialStep2ReadOnlyRuntime {
  async plan({ message }) {
    const value = classify(message);
    return Object.freeze({ intent: value.intent, requiresData: Boolean(value.operation), toolCalls: value.operation ? Object.freeze([{ id: `territorial-step2:${value.intent}`, name: AI_TOOL_NAMES.TERRITORY, arguments: Object.freeze({ operation: value.operation }) }]) : Object.freeze([]) });
  }
  async respond({ plan, toolResults }) {
    if (plan.intent === "write_rejected") return Object.freeze({ text: "L'Assistente Territoriale e di sola lettura: non cambia quantita, raggio, zone e non procede agli Step successivi.", citations: [], sources: [], kind: "general" });
    if (plan.intent === "override_rejected") return Object.freeze({ text: "Il messaggio non puo sostituire i dati territoriali. Uso esclusivamente lo snapshot prodotto dallo Step 2.", citations: [], sources: [], kind: "general" });
    if (plan.intent === "unsupported") return Object.freeze({ text: "Questa domanda non e supportata. Posso spiegare analisi, quantita, copertura, zone, transito, punti selezionati, attivita, materiali e dati mancanti presenti nello Step 2.", citations: [], sources: [], kind: "general" });
    const result = toolResults.find((item) => item.status === "success");
    if (!result) return Object.freeze({ text: "Lo snapshot territoriale autorizzato non e disponibile.", citations: [], sources: [], kind: "general" });
    const snapshot = result.data.data;
    return Object.freeze({ text: `${factualText(plan.intent, snapshot)}${sourcesText(snapshot, plan.intent)}`, citations: Object.freeze([result.callId]), sources: Object.freeze([result.tool]), kind: ["overview", "simple", "missing", "coverage", "calculation_status"].includes(plan.intent) ? "explanation" : "fact" });
  }
}

export function territorialToolSourceLabel() { return "Analisi territoriale"; }
