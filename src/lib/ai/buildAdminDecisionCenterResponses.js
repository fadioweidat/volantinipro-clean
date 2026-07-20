import { AI_FRESHNESS_STATES } from "./insight-contract.js";
import { ADMIN_DECISION_LEVELS, ADMIN_DECISION_STATES } from "./buildAdminDecisionItems.js";

export const ADMIN_DECISION_QUESTION_IDS = Object.freeze({
  ACTION: "admin.decision.copilot.action",
  POSITION: "admin.decision.copilot.position",
  STALE: "admin.decision.copilot.stale",
  UNAVAILABLE: "admin.decision.copilot.unavailable",
  SOURCE: "admin.decision.copilot.source",
});
export const ADMIN_DECISION_QUESTIONS = Object.freeze([
  { id: ADMIN_DECISION_QUESTION_IDS.ACTION, label: "Quali elementi richiedono intervento?" },
  { id: ADMIN_DECISION_QUESTION_IDS.POSITION, label: "Perche questo elemento e in alto?" },
  { id: ADMIN_DECISION_QUESTION_IDS.STALE, label: "Quali fonti risultano obsolete?" },
  { id: ADMIN_DECISION_QUESTION_IDS.UNAVAILABLE, label: "Quali elementi non possono essere valutati?" },
  { id: ADMIN_DECISION_QUESTION_IDS.SOURCE, label: "Da dove arriva questo segnale?" },
]);

function makeResponse(question, items, text, state = "ready") {
  const safeItems = state === "denied" ? [] : items;
  return Object.freeze({ id: `response.${question.id}`, questionId: question.id, question: question.label, state, text, evidence: Object.freeze(safeItems.map((item) => item.datum)), links: Object.freeze(state === "ready" ? safeItems.filter((item) => item.href).map((item) => ({ href: item.href, label: `Apri ${item.title}` })) : []) });
}

export function buildAdminDecisionCenterResponses({ decisionCenter } = {}) {
  const questions = ADMIN_DECISION_QUESTIONS;
  if (decisionCenter?.access !== "allowed") {
    const responses = questions.map((question) => makeResponse(question, [], "Accesso negato: il Centro Decisionale non espone valori, collegamenti o conclusioni.", "denied"));
    return Object.freeze({ questions, responses: Object.freeze(Object.fromEntries(responses.map((response) => [response.questionId, response]))) });
  }
  const items = Array.isArray(decisionCenter.items) ? decisionCenter.items : [];
  const action = items.filter((item) => item.level === ADMIN_DECISION_LEVELS.ACTION);
  const stale = items.filter((item) => item.datum?.freshness?.state === AI_FRESHNESS_STATES.STALE);
  const unavailable = items.filter((item) => [ADMIN_DECISION_STATES.MISSING, ADMIN_DECISION_STATES.ERROR, ADMIN_DECISION_STATES.DENIED].includes(item.state));
  const first = items.slice(0, 1);
  const evidenceOrAll = (selection) => selection.length ? selection : items;
  const byId = new Map(questions.map((question) => [question.id, question]));
  const responses = [
    makeResponse(byId.get(ADMIN_DECISION_QUESTION_IDS.ACTION), evidenceOrAll(action), action.length ? `${action.length} ${action.length === 1 ? "elemento richiede" : "elementi richiedono"} intervento secondo le regole statiche dichiarate.` : "Nessun elemento e etichettato come intervento richiesto."),
    makeResponse(byId.get(ADMIN_DECISION_QUESTION_IDS.POSITION), first, first.length ? `${first[0].title}: ${first[0].positionReason}` : "Nessun elemento e disponibile per spiegare la posizione.", first.length ? "ready" : "unavailable"),
    makeResponse(byId.get(ADMIN_DECISION_QUESTION_IDS.STALE), evidenceOrAll(stale), stale.length ? `${stale.length} ${stale.length === 1 ? "elemento usa" : "elementi usano"} una fonte obsoleta.` : "Nessun elemento del Centro Decisionale usa una fonte marcata obsoleta."),
    makeResponse(byId.get(ADMIN_DECISION_QUESTION_IDS.UNAVAILABLE), evidenceOrAll(unavailable), unavailable.length ? `${unavailable.length} ${unavailable.length === 1 ? "elemento non puo" : "elementi non possono"} essere valutato completamente.` : "Tutti gli elementi esposti hanno uno stato ready."),
    makeResponse(byId.get(ADMIN_DECISION_QUESTION_IDS.SOURCE), first, first.length ? `Il primo elemento deriva dall'insight stabile ${first[0].insightId}. Fonte e criterio sono consultabili nell'evidenza.` : "Nessun segnale e disponibile.", first.length ? "ready" : "unavailable"),
  ];
  return Object.freeze({ questions, responses: Object.freeze(Object.fromEntries(responses.map((response) => [response.questionId, response]))) });
}
