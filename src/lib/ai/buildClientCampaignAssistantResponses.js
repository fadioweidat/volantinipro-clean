import { AI_DATA_CATEGORIES, AI_FRESHNESS_STATES, AI_UNAVAILABLE_CODES } from "./insight-contract.js";

export const CLIENT_CAMPAIGN_QUESTION_IDS = Object.freeze({
  STATUS: "client.campaign.assistant.status",
  MUNICIPALITIES: "client.campaign.assistant.municipalities",
  PLANNED_COVERAGE: "client.campaign.assistant.planned_coverage",
  GPS: "client.campaign.assistant.gps",
  PHOTOS: "client.campaign.assistant.photos",
  DETECTED_COVERAGE: "client.campaign.assistant.detected_coverage",
  DATA_QUALITY: "client.campaign.assistant.data_quality",
  SOURCES: "client.campaign.assistant.sources",
});

export const CLIENT_CAMPAIGN_QUESTIONS = Object.freeze([
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.STATUS, label: "Qual è lo stato di questa campagna?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.MUNICIPALITIES, label: "Quanti comuni sono coinvolti?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.PLANNED_COVERAGE, label: "Qual è la copertura prevista?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.GPS, label: "Sono disponibili dati GPS?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.PHOTOS, label: "Quante foto approvate risultano?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.DETECTED_COVERAGE, label: "La copertura rilevata è disponibile?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.DATA_QUALITY, label: "Quali dati sono mancanti o non aggiornati?" },
  { id: CLIENT_CAMPAIGN_QUESTION_IDS.SOURCES, label: "Da dove arriva la copertura rilevata?" },
]);

const IDS = Object.freeze({
  STATUS: "client.campaign.status",
  MUNICIPALITIES: "client.campaign.municipalities_count",
  PLANNED_COVERAGE: "client.campaign.planned_coverage",
  GPS: "client.tracking.gps_points_count",
  PHOTOS: "client.campaign.approved_photos_count",
  DETECTED_COVERAGE: "client.tracking.coverage",
});

function stateOf(evidence) {
  const unavailable = evidence.filter((datum) => datum?.category === AI_DATA_CATEGORIES.UNAVAILABLE);
  if (unavailable.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED)) return "denied";
  if (unavailable.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR)) return "error";
  if (unavailable.length > 0 || evidence.length === 0) return "unavailable";
  return "ready";
}

function guarded(question, evidence, readyText) {
  const state = stateOf(evidence);
  const fallback = {
    denied: "Non posso mostrare il dato: l'accesso alla campagna o al tracking non è autorizzato.",
    error: "Non posso rispondere: la fonte ha restituito un errore. Non applico inferenze.",
    unavailable: "Non posso rispondere con le evidenze disponibili. Il dato resta NON DISPONIBILE.",
  };
  return Object.freeze({ id: `response.${question.id}`, questionId: question.id, question: question.label, state, text: state === "ready" ? readyText(evidence) : fallback[state], evidence: Object.freeze([...evidence]) });
}

export function buildClientCampaignAssistantResponses({ insights } = {}) {
  const items = Array.isArray(insights?.items) ? insights.items : [];
  const byId = new Map(items.map((datum) => [datum.id, datum]));
  const questionById = new Map(CLIENT_CAMPAIGN_QUESTIONS.map((question) => [question.id, question]));
  const pick = (...ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const make = (questionId, ids, readyText) => guarded(questionById.get(questionId), pick(...ids), readyText);
  const responses = [
    make(CLIENT_CAMPAIGN_QUESTION_IDS.STATUS, [IDS.STATUS], ([datum]) => `Lo stato registrato è “${datum.value}”.`),
    make(CLIENT_CAMPAIGN_QUESTION_IDS.MUNICIPALITIES, [IDS.MUNICIPALITIES], ([datum]) => `${datum.value} ${datum.value === 1 ? "comune risulta coinvolto" : "comuni risultano coinvolti"}.`),
    make(CLIENT_CAMPAIGN_QUESTION_IDS.PLANNED_COVERAGE, [IDS.PLANNED_COVERAGE], ([datum]) => `La copertura prevista già memorizzata è ${datum.value}%. Non viene ricalcolata dall’assistente.`),
    make(CLIENT_CAMPAIGN_QUESTION_IDS.GPS, [IDS.GPS], ([datum]) => datum.value === 0 ? "La fonte autorizzata contiene 0 punti GPS." : `La fonte autorizzata contiene ${datum.value} punti GPS.`),
    make(CLIENT_CAMPAIGN_QUESTION_IDS.PHOTOS, [IDS.PHOTOS], ([datum]) => `${datum.value} ${datum.value === 1 ? "foto approvata risulta disponibile" : "foto approvate risultano disponibili"}.`),
    make(CLIENT_CAMPAIGN_QUESTION_IDS.DETECTED_COVERAGE, [IDS.DETECTED_COVERAGE], ([datum]) => `La copertura rilevata già prodotta dal sistema è ${datum.value}%. L’assistente non la ricalcola.`),
    guarded(questionById.get(CLIENT_CAMPAIGN_QUESTION_IDS.DATA_QUALITY), items, (evidence) => {
      const stale = evidence.filter((datum) => datum.freshness?.state === AI_FRESHNESS_STATES.STALE);
      const unknown = evidence.filter((datum) => datum.freshness?.state === AI_FRESHNESS_STATES.UNKNOWN);
      if (stale.length > 0) return `${stale.length} dati risultano da aggiornare: ${stale.map((datum) => datum.label).join(", ")}.`;
      if (unknown.length > 0) return `Nessun dato è marcato obsoleto, ma ${unknown.length} dati hanno freshness sconosciuta.`;
      return "Tutti i dati disponibili risultano aggiornati rispetto alle soglie dichiarate.";
    }),
    make(CLIENT_CAMPAIGN_QUESTION_IDS.SOURCES, [IDS.DETECTED_COVERAGE], () => "La copertura rilevata proviene dal valore già prodotto dal sistema operativo. Apri “Fonte e criterio” per dettagli e assunzioni."),
  ];
  return Object.freeze({ questions: CLIENT_CAMPAIGN_QUESTIONS, responses: Object.freeze(Object.fromEntries(responses.map((response) => [response.questionId, response]))) });
}
