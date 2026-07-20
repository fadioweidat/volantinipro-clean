import { AI_DATA_CATEGORIES, AI_FRESHNESS_STATES, AI_UNAVAILABLE_CODES } from "./insight-contract.js";

export const ADMIN_COPILOT_QUESTION_IDS = Object.freeze({
  ATTENTION: "admin.copilot.attention",
  LATE_CAMPAIGNS: "admin.copilot.late_campaigns",
  OFFLINE_OPERATORS: "admin.copilot.offline_operators",
  OPERATIONAL_PROBLEMS: "admin.copilot.operational_problems",
  PENDING_REQUESTS: "admin.copilot.pending_requests",
  FRESHNESS: "admin.copilot.freshness",
  SOURCES: "admin.copilot.sources",
});

export const ADMIN_COPILOT_QUESTIONS = Object.freeze([
  { id: ADMIN_COPILOT_QUESTION_IDS.ATTENTION, label: "Quali elementi richiedono attenzione?" },
  { id: ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS, label: "Quante campagne risultano in ritardo?" },
  { id: ADMIN_COPILOT_QUESTION_IDS.OFFLINE_OPERATORS, label: "Ci sono operatori offline?" },
  { id: ADMIN_COPILOT_QUESTION_IDS.OPERATIONAL_PROBLEMS, label: "Quali problemi operativi sono già stati rilevati?" },
  { id: ADMIN_COPILOT_QUESTION_IDS.PENDING_REQUESTS, label: "Ci sono richieste ancora da gestire?" },
  { id: ADMIN_COPILOT_QUESTION_IDS.FRESHNESS, label: "Quali fonti non sono aggiornate?" },
  { id: ADMIN_COPILOT_QUESTION_IDS.SOURCES, label: "Da dove arriva il conteggio degli allarmi?" },
]);

const KPI_IDS = Object.freeze({
  LATE_CAMPAIGNS: "admin.home.late_campaigns",
  OPERATOR_STATUS: "admin.home.operator_status",
  PENDING_REQUESTS: "admin.home.pending_requests",
  ACTIVE_ALARMS: "admin.home.active_alarms",
});

const ATTENTION_IDS = Object.freeze({
  OFFLINE_OPERATORS: "admin.home.attention.offline_operators",
  OPERATIONAL_PROBLEMS: "admin.home.attention.operational_problems",
});

const LINKS = Object.freeze({
  [ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS]: Object.freeze([{ href: "#campagne-attive", label: "Apri campagne attive" }]),
  [ADMIN_COPILOT_QUESTION_IDS.OFFLINE_OPERATORS]: Object.freeze([{ href: "/admin/live", label: "Apri Monitor GPS Live" }]),
  [ADMIN_COPILOT_QUESTION_IDS.OPERATIONAL_PROBLEMS]: Object.freeze([{ href: "/admin/anomalie", label: "Apri anomalie esistenti" }]),
});

function responseState(evidence) {
  const unavailable = evidence.filter((datum) => datum?.category === AI_DATA_CATEGORIES.UNAVAILABLE);
  if (unavailable.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED)) return "denied";
  if (unavailable.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR)) return "error";
  if (unavailable.length > 0 || evidence.length === 0) return "unavailable";
  return "ready";
}

function plural(value, singular, pluralForm) {
  return value === 1 ? singular : pluralForm;
}

function guardedResponse({ question, evidence, readyText, links = [] }) {
  const state = responseState(evidence);
  const fallback = {
    denied: "Non posso mostrare questi dati: l'accesso a una fonte operativa non è autorizzato.",
    error: "Non posso rispondere: una fonte operativa ha restituito un errore. Non applico inferenze o valori sostitutivi.",
    unavailable: "Non posso rispondere con le evidenze disponibili. Il valore mancante resta NON DISPONIBILE.",
  };
  return Object.freeze({
    id: `response.${question.id}`,
    questionId: question.id,
    question: question.label,
    state,
    text: state === "ready" ? readyText(evidence) : fallback[state],
    evidence: Object.freeze([...evidence]),
    links: Object.freeze(state === "ready" ? [...links] : []),
  });
}

export function buildAdminCopilotResponses({ insights } = {}) {
  const items = Array.isArray(insights?.items) ? insights.items : [];
  const attention = Array.isArray(insights?.attention) ? insights.attention : [];
  const itemById = new Map(items.map((datum) => [datum.id, datum]));
  const attentionById = new Map(attention.map((entry) => [entry?.datum?.id, entry]).filter(([id]) => Boolean(id)));
  const questionById = new Map(ADMIN_COPILOT_QUESTIONS.map((question) => [question.id, question]));
  const item = (id) => itemById.get(id) ?? null;
  const signal = (id) => attentionById.get(id)?.datum ?? null;
  const pick = (...data) => data.filter(Boolean);
  const make = (questionId, evidence, readyText, links = LINKS[questionId] ?? []) => guardedResponse({ question: questionById.get(questionId), evidence, readyText, links });

  const attentionEvidence = attention.length > 0 ? attention.map((entry) => entry.datum) : pick(item(KPI_IDS.ACTIVE_ALARMS));
  const offlineSignal = signal(ATTENTION_IDS.OFFLINE_OPERATORS);
  const problemSignal = signal(ATTENTION_IDS.OPERATIONAL_PROBLEMS);
  const responses = [
    make(ADMIN_COPILOT_QUESTION_IDS.ATTENTION, attentionEvidence, (evidence) => attention.length > 0
      ? evidence.map((datum) => datum.value).join(" ")
      : "Nessun elemento di attenzione emerge dagli insight già prodotti."),
    make(ADMIN_COPILOT_QUESTION_IDS.LATE_CAMPAIGNS, pick(item(KPI_IDS.LATE_CAMPAIGNS)), ([datum]) =>
      `${datum.value} ${plural(datum.value, "campagna risulta in ritardo", "campagne risultano in ritardo")}. Il conteggio non espone nomi o cause.`),
    make(ADMIN_COPILOT_QUESTION_IDS.OFFLINE_OPERATORS, pick(offlineSignal ?? item(KPI_IDS.OPERATOR_STATUS)), ([datum]) => offlineSignal
      ? `${datum.value} Il contratto non espone i nominativi in questo riepilogo.`
      : `Non è presente un insight approvato di operatori inattivi. Lo stato aggregato disponibile è ${datum.value} (online/offline); non ricavo nominativi o cause.`),
    make(ADMIN_COPILOT_QUESTION_IDS.OPERATIONAL_PROBLEMS, pick(problemSignal ?? item(KPI_IDS.ACTIVE_ALARMS)), ([datum]) => problemSignal
      ? `${datum.value} Il conteggio aggregato non identifica campagne o cause specifiche.`
      : `Non è presente un insight approvato di problemi operativi. Il KPI aggregato degli allarmi vale ${datum.value}; non lo trasformo in cause specifiche.`),
    make(ADMIN_COPILOT_QUESTION_IDS.PENDING_REQUESTS, pick(item(KPI_IDS.PENDING_REQUESTS)), ([datum]) => datum.value === 0
      ? "Non risultano richieste ancora da gestire. Il valore rilevato è 0."
      : `${datum.value} ${plural(datum.value, "richiesta risulta", "richieste risultano")} ancora da gestire.`),
    make(ADMIN_COPILOT_QUESTION_IDS.FRESHNESS, items, (evidence) => {
      const stale = evidence.filter((datum) => datum.freshness?.state === AI_FRESHNESS_STATES.STALE);
      const unknown = evidence.filter((datum) => datum.freshness?.state === AI_FRESHNESS_STATES.UNKNOWN);
      if (stale.length > 0) return `${stale.length} ${plural(stale.length, "KPI risulta da aggiornare", "KPI risultano da aggiornare")}: ${stale.map((datum) => datum.label).join(", ")}.`;
      if (unknown.length > 0) return `Nessun KPI è marcato obsoleto, ma per ${unknown.length} KPI la freshness è sconosciuta.`;
      return "Tutti i KPI disponibili risultano aggiornati rispetto alle soglie dichiarate.";
    }, []),
    make(ADMIN_COPILOT_QUESTION_IDS.SOURCES, pick(item(KPI_IDS.ACTIVE_ALARMS)), () =>
      "Il valore proviene dal KPI degli allarmi già calcolato dalla Dashboard Admin. Apri “Fonte e criterio” per vedere fonti, derivazione e assunzioni.", []),
  ];

  return Object.freeze({
    generatedAt: insights?.generatedAt ?? null,
    questions: ADMIN_COPILOT_QUESTIONS,
    responses: Object.freeze(Object.fromEntries(responses.map((response) => [response.questionId, response]))),
  });
}
