import { AI_DATA_CATEGORIES, AI_UNAVAILABLE_CODES } from "./insight-contract.js";

export const CLIENT_REPORT_QUESTION_IDS = Object.freeze({
  SUMMARY: "client.report.assistant.summary",
  AVAILABLE: "client.report.assistant.available",
  FINAL_COVERAGE: "client.report.assistant.final_coverage",
  MISSING: "client.report.assistant.missing",
  COMPARABLE: "client.report.assistant.comparable",
  HISTORY: "client.report.assistant.history",
  SOURCES: "client.report.assistant.sources",
});
export const CLIENT_REPORT_QUESTIONS = Object.freeze([
  { id: CLIENT_REPORT_QUESTION_IDS.SUMMARY, label: "Come e andata questa campagna?" },
  { id: CLIENT_REPORT_QUESTION_IDS.AVAILABLE, label: "Quali dati finali sono disponibili?" },
  { id: CLIENT_REPORT_QUESTION_IDS.FINAL_COVERAGE, label: "La copertura finale e disponibile?" },
  { id: CLIENT_REPORT_QUESTION_IDS.MISSING, label: "Ci sono dati mancanti?" },
  { id: CLIENT_REPORT_QUESTION_IDS.COMPARABLE, label: "Esistono campagne storiche comparabili?" },
  { id: CLIENT_REPORT_QUESTION_IDS.HISTORY, label: "Cosa emerge dal confronto storico?" },
  { id: CLIENT_REPORT_QUESTION_IDS.SOURCES, label: "Da dove arriva questo valore?" },
]);

const stateOf = (evidence) => evidence.some((datum) => datum?.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED) ? "denied" : evidence.some((datum) => datum?.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR) ? "error" : evidence.length === 0 || evidence.some((datum) => datum?.category === AI_DATA_CATEGORIES.UNAVAILABLE) ? "unavailable" : "ready";
function response(question, evidence, readyText) {
  const state = stateOf(evidence);
  const fallback = { denied: "Non posso mostrare i valori: la proprieta del report non e verificata.", error: "La fonte ha restituito un errore. Nessuna conclusione viene prodotta.", unavailable: "Le evidenze necessarie non sono disponibili; non applico inferenze." };
  return Object.freeze({ id: `response.${question.id}`, questionId: question.id, question: question.label, state, text: state === "ready" ? readyText(evidence) : fallback[state], evidence: Object.freeze([...evidence]) });
}

export function buildClientReportAssistantResponses({ reportInsights, historicalSuggestions } = {}) {
  const reportItems = Array.isArray(reportInsights?.items) ? reportInsights.items : [];
  const historyItems = Array.isArray(historicalSuggestions?.items) ? historicalSuggestions.items : [];
  const byId = new Map([...reportItems, ...historyItems].map((datum) => [datum.id, datum]));
  const questionById = new Map(CLIENT_REPORT_QUESTIONS.map((question) => [question.id, question]));
  const pick = (...ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const make = (id, ids, text) => response(questionById.get(id), pick(...ids), text);
  const missing = reportItems.filter((datum) => datum.category === AI_DATA_CATEGORIES.UNAVAILABLE);
  const responses = [
    make(CLIENT_REPORT_QUESTION_IDS.SUMMARY, ["client.report.status", "client.report.distributed_quantity", "client.report.final_coverage"], ([status, quantity, coverage]) => `Lo stato registrato e ${status.value}; risultano ${quantity.value} volantini distribuiti e una copertura finale gia calcolata del ${coverage.value}%.`),
    response(questionById.get(CLIENT_REPORT_QUESTION_IDS.AVAILABLE), reportItems, (items) => `${items.filter((datum) => datum.category !== AI_DATA_CATEGORIES.UNAVAILABLE).length} dati finali risultano disponibili nel report autorizzato.`),
    make(CLIENT_REPORT_QUESTION_IDS.FINAL_COVERAGE, ["client.report.final_coverage"], ([datum]) => `La copertura finale gia prodotta dal sistema e ${datum.value}%. Non viene ricalcolata.`),
    Object.freeze({ id: `response.${CLIENT_REPORT_QUESTION_IDS.MISSING}`, questionId: CLIENT_REPORT_QUESTION_IDS.MISSING, question: questionById.get(CLIENT_REPORT_QUESTION_IDS.MISSING).label, state: missing.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED) ? "denied" : missing.some((datum) => datum.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR) ? "error" : "ready", text: missing.length === 0 ? "Tutti i dati previsti dal contratto del report risultano disponibili." : `${missing.length} dati restano NON DISPONIBILI. Le motivazioni sono consultabili nelle relative evidenze.`, evidence: Object.freeze(missing.length ? missing : reportItems) }),
    make(CLIENT_REPORT_QUESTION_IDS.COMPARABLE, ["client.report.history.comparable_count"], ([datum]) => datum.value === 0 ? "Non risultano campagne storiche comparabili secondo i criteri dichiarati." : `${datum.value} ${datum.value === 1 ? "campagna storica soddisfa" : "campagne storiche soddisfano"} tutti i criteri dichiarati.`),
    make(CLIENT_REPORT_QUESTION_IDS.HISTORY, ["client.report.history.coverage_comparison", "client.report.history.evidence_comparison"], ([coverage, evidence]) => `${coverage.value} ${evidence.value}`),
    make(CLIENT_REPORT_QUESTION_IDS.SOURCES, ["client.report.final_coverage"], () => "Il valore proviene dal report della campagna e dall'eventuale correzione gia prodotta dal sistema. Apri Fonte e criterio per i dettagli."),
  ];
  return Object.freeze({ questions: CLIENT_REPORT_QUESTIONS, responses: Object.freeze(Object.fromEntries(responses.map((item) => [item.questionId, item]))) });
}
