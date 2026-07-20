import { AI_DATA_CATEGORIES, AI_FRESHNESS_STATES, AI_UNAVAILABLE_CODES } from "./insight-contract.js";

export const CLIENT_ASSISTANT_QUESTION_IDS = Object.freeze({
  ATTENTION: "client.assistant.attention",
  PAYMENTS: "client.assistant.pending_payments",
  REPORTS: "client.assistant.available_reports",
  CAMPAIGN_STATUS: "client.assistant.campaign_status",
  FRESHNESS: "client.assistant.freshness",
  SOURCES: "client.assistant.sources",
});

export const CLIENT_ASSISTANT_QUESTIONS = Object.freeze([
  { id: CLIENT_ASSISTANT_QUESTION_IDS.ATTENTION, label: "Quali campagne richiedono attenzione?" },
  { id: CLIENT_ASSISTANT_QUESTION_IDS.PAYMENTS, label: "Ci sono pagamenti in attesa?" },
  { id: CLIENT_ASSISTANT_QUESTION_IDS.REPORTS, label: "Quanti report sono disponibili?" },
  { id: CLIENT_ASSISTANT_QUESTION_IDS.CAMPAIGN_STATUS, label: "Qual è lo stato generale delle campagne?" },
  { id: CLIENT_ASSISTANT_QUESTION_IDS.FRESHNESS, label: "Quali dati non sono aggiornati?" },
  { id: CLIENT_ASSISTANT_QUESTION_IDS.SOURCES, label: "Da dove arrivano i KPI principali?" },
]);

const INSIGHT_IDS = Object.freeze({
  ACTIVE: "client.home.active_campaigns",
  COMPLETED: "client.home.completed_campaigns",
  PENDING_PAYMENTS: "client.home.pending_payments",
  PENDING_QUOTES: "client.home.pending_quotes",
  REPORTS: "client.home.available_reports",
  TOTAL_SPENT: "client.home.total_spent",
});

function responseState(evidence) {
  const unavailable = evidence.filter((datum) => datum?.category === AI_DATA_CATEGORIES.UNAVAILABLE);
  if (unavailable.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED)) return "denied";
  if (unavailable.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR)) return "error";
  if (unavailable.length > 0 || evidence.length === 0) return "unavailable";
  return "ready";
}

function guardedAnswer({ question, evidence, readyText }) {
  const state = responseState(evidence);
  const fallback = {
    denied: "Non posso mostrare questi dati: l'accesso alla fonte non è autorizzato.",
    error: "Non posso rispondere: la fonte ha restituito un errore. Non applico inferenze o valori sostitutivi.",
    unavailable: "Non posso rispondere con i dati disponibili. Il valore mancante resta NON DISPONIBILE.",
  };
  return Object.freeze({
    id: `response.${question.id}`,
    questionId: question.id,
    question: question.label,
    state,
    text: state === "ready" ? readyText(evidence) : fallback[state],
    evidence: Object.freeze([...evidence]),
  });
}
function plural(value, singular, pluralForm) {
  return value === 1 ? singular : pluralForm;
}

export function buildClientAssistantResponses({ insights } = {}) {
  const items = Array.isArray(insights?.items) ? insights.items : [];
  const attention = Array.isArray(insights?.attention) ? insights.attention : [];
  const byId = new Map(items.map((datum) => [datum.id, datum]));
  const pick = (...ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const questionById = new Map(CLIENT_ASSISTANT_QUESTIONS.map((question) => [question.id, question]));
  const make = (questionId, evidence, readyText) => guardedAnswer({ question: questionById.get(questionId), evidence, readyText });

  const attentionEvidence = attention.length > 0
    ? attention
    : pick(INSIGHT_IDS.PENDING_PAYMENTS, INSIGHT_IDS.PENDING_QUOTES);

  const responses = [
    make(CLIENT_ASSISTANT_QUESTION_IDS.ATTENTION, attentionEvidence, (evidence) => attention.length > 0
      ? evidence.map((datum) => datum.value).join(" ")
      : "Nessun elemento di attenzione emerge dagli insight disponibili."),
    make(CLIENT_ASSISTANT_QUESTION_IDS.PAYMENTS, pick(INSIGHT_IDS.PENDING_PAYMENTS), ([datum]) => datum.value === 0
      ? "Non risultano campagne in attesa di pagamento. Il valore rilevato è 0."
      : `${datum.value} ${plural(datum.value, "campagna risulta", "campagne risultano")} in attesa di pagamento.`),
    make(CLIENT_ASSISTANT_QUESTION_IDS.REPORTS, pick(INSIGHT_IDS.REPORTS), ([datum]) => `${datum.value} ${plural(datum.value, "report risulta disponibile", "report risultano disponibili")}.`),
    make(CLIENT_ASSISTANT_QUESTION_IDS.CAMPAIGN_STATUS, pick(INSIGHT_IDS.ACTIVE, INSIGHT_IDS.COMPLETED), ([active, completed]) =>
      `${active.value} ${plural(active.value, "campagna attiva", "campagne attive")} e ${completed.value} ${plural(completed.value, "campagna completata", "campagne completate")} negli insight disponibili.`),
    make(CLIENT_ASSISTANT_QUESTION_IDS.FRESHNESS, items, (evidence) => {
      const stale = evidence.filter((datum) => datum.freshness?.state === AI_FRESHNESS_STATES.STALE);
      const unknown = evidence.filter((datum) => datum.freshness?.state === AI_FRESHNESS_STATES.UNKNOWN);
      if (stale.length > 0) return `${stale.length} ${plural(stale.length, "dato risulta da aggiornare", "dati risultano da aggiornare")}: ${stale.map((datum) => datum.label).join(", ")}.`;
      if (unknown.length > 0) return `Nessun dato è marcato obsoleto, ma per ${unknown.length} ${plural(unknown.length, "dato la freshness è sconosciuta", "dati la freshness è sconosciuta")}.`;
      return "Tutti i dati disponibili risultano aggiornati rispetto alla soglia dichiarata.";
    }),
    make(CLIENT_ASSISTANT_QUESTION_IDS.SOURCES, pick(INSIGHT_IDS.ACTIVE, INSIGHT_IDS.COMPLETED, INSIGHT_IDS.TOTAL_SPENT), () =>
      "I KPI principali provengono dalle campagne già filtrate per il Cliente. Apri “Fonte e criterio” per il dettaglio di ogni valore."),
  ];

  return Object.freeze({
    generatedAt: insights?.generatedAt ?? null,
    questions: CLIENT_ASSISTANT_QUESTIONS,
    responses: Object.freeze(Object.fromEntries(responses.map((response) => [response.questionId, response]))),
  });
}
