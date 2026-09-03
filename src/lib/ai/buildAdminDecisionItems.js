import { AI_AUDIENCES, AI_DATA_CATEGORIES, AI_FRESHNESS_STATES, AI_UNAVAILABLE_CODES } from "./insight-contract.js";
import { AI_RESOURCES, projectAiPermissions } from "./projectAiPermissions.js";

export const ADMIN_DECISION_LEVELS = Object.freeze({
  ACTION: "intervento richiesto",
  VERIFY: "da verificare",
  INFORMATION: "informativo",
  UNAVAILABLE: "dato non disponibile",
});
export const ADMIN_DECISION_STATES = Object.freeze({ READY: "ready", MISSING: "missing", ERROR: "error", DENIED: "denied" });

const ALLOWED_ROUTES = new Set(["/admin/live", "/admin/anomalie", "/admin/finance", "#campagne-attive"]);
const SIGNAL_RULES = Object.freeze({
  "admin.home.attention.operational_problems": Object.freeze({ orderGroup: 10, level: ADMIN_DECISION_LEVELS.ACTION, reason: "Problema operativo gia rilevato dal sistema esistente.", position: "I problemi operativi gia rilevati precedono gli altri segnali.", resource: AI_RESOURCES.ANOMALIES }),
  "admin.home.attention.late_campaigns": Object.freeze({ orderGroup: 20, level: ADMIN_DECISION_LEVELS.ACTION, reason: "Campagna gia classificata in ritardo dal calcolo operativo esistente.", position: "I ritardi seguono i problemi operativi gia rilevati.", resource: AI_RESOURCES.ALL_CAMPAIGNS }),
  "admin.home.attention.offline_operators": Object.freeze({ orderGroup: 30, level: ADMIN_DECISION_LEVELS.VERIFY, reason: "Operatore gia classificato offline dai dati operativi esistenti.", position: "Gli operatori offline seguono i segnali di campagna.", resource: AI_RESOURCES.OPERATIONS }),
  "admin.home.attention.pending_requests": Object.freeze({ orderGroup: 40, level: ADMIN_DECISION_LEVELS.VERIFY, reason: "Richiesta waitlist gia conteggiata come non gestita.", position: "Le richieste non gestite seguono i segnali operativi.", resource: AI_RESOURCES.WAITLIST }),
});

const KPI_RESOURCES = Object.freeze({
  "admin.home.pending_requests": AI_RESOURCES.WAITLIST,
  "admin.home.operator_status": AI_RESOURCES.OPERATIONS,
  "admin.home.live_sessions": AI_RESOURCES.OPERATIONS,
  "admin.home.active_alarms": AI_RESOURCES.ANOMALIES,
});

function resourceFor(datum) { return KPI_RESOURCES[datum?.id] ?? (datum?.id?.includes("gps") ? AI_RESOURCES.RAW_GPS : AI_RESOURCES.ALL_CAMPAIGNS); }
function decisionState(datum) {
  if (datum?.unavailable?.code === AI_UNAVAILABLE_CODES.ACCESS_DENIED || datum?.permission?.allowed === false) return ADMIN_DECISION_STATES.DENIED;
  if (datum?.unavailable?.code === AI_UNAVAILABLE_CODES.SOURCE_ERROR) return ADMIN_DECISION_STATES.ERROR;
  if (datum?.category === AI_DATA_CATEGORIES.UNAVAILABLE || datum?.value === null) return ADMIN_DECISION_STATES.MISSING;
  return ADMIN_DECISION_STATES.READY;
}
function stateRule(state, stale) {
  if (state === ADMIN_DECISION_STATES.DENIED) return { orderGroup: 0, level: ADMIN_DECISION_LEVELS.UNAVAILABLE, reason: "Accesso alla fonte negato; valore e collegamento sono soppressi.", position: "Gli accessi negati vengono mostrati prima degli altri stati per rendere esplicito il limite informativo." };
  if (state === ADMIN_DECISION_STATES.ERROR) return { orderGroup: 1, level: ADMIN_DECISION_LEVELS.UNAVAILABLE, reason: "La fonte dell'insight ha restituito un errore.", position: "Gli errori di fonte precedono i segnali operativi per rendere visibile il limite dei dati." };
  if (stale) return { orderGroup: 50, level: ADMIN_DECISION_LEVELS.VERIFY, reason: "La freshness dell'insight risulta obsoleta rispetto alla soglia dichiarata.", position: "Le fonti obsolete seguono i segnali gia rilevati e precedono i dati mancanti." };
  return { orderGroup: 60, level: ADMIN_DECISION_LEVELS.UNAVAILABLE, reason: "Il dato richiesto non e disponibile nella fonte approvata.", position: "I dati mancanti seguono segnali operativi e fonti obsolete." };
}
function stableTimestamp(item) { const value = item.timestamp ? Date.parse(item.timestamp) : Number.NaN; return Number.isFinite(value) ? value : -1; }
function compareDecisionItems(a, b) { return a.orderGroup - b.orderGroup || stableTimestamp(b) - stableTimestamp(a) || a.id.localeCompare(b.id, "it"); }
function safeHref(href, state, permissionAllowed) { return state === ADMIN_DECISION_STATES.READY && permissionAllowed && ALLOWED_ROUTES.has(href) ? href : null; }

function makeItem({ datum, href = null, rule, now }) {
  const projected = projectAiPermissions(datum, { audience: AI_AUDIENCES.ADMIN, resource: rule.resource ?? resourceFor(datum), now });
  const state = decisionState(projected);
  const permissionAllowed = projected.permission?.allowed === true;
  return Object.freeze({
    id: `admin.decision.${datum.id}`,
    insightId: datum.id,
    title: datum.label,
    description: state === ADMIN_DECISION_STATES.READY ? String(projected.value) : projected.unavailable?.reason ?? "Dato non disponibile.",
    level: rule.level,
    inclusionReason: rule.reason,
    positionReason: `${rule.position} A parita si usa il timestamp piu recente e poi l'ID stabile in ordine alfabetico.`,
    state,
    timestamp: projected.observedAt ?? null,
    href: safeHref(href, state, permissionAllowed),
    datum: projected,
    orderGroup: rule.orderGroup,
  });
}

export function buildAdminDecisionItems({ insights = {}, context = {}, now = new Date() } = {}) {
  if (context.authorized !== true || !["admin", "super_admin"].includes(context.role)) return Object.freeze({ audience: AI_AUDIENCES.ADMIN, access: "denied", generatedAt: new Date(now).toISOString(), items: Object.freeze([]), orderingRule: "Nessun ordinamento esposto senza ruolo Admin autorizzato." });
  const sourceItems = Array.isArray(insights.items) ? insights.items : [];
  const attention = Array.isArray(insights.attention) ? insights.attention : [];
  const decisionItems = [];
  const signalIds = new Set();
  for (const entry of attention) {
    const rule = SIGNAL_RULES[entry?.datum?.id];
    if (!entry?.datum || !rule) continue;
    signalIds.add(entry.datum.id);
    decisionItems.push(makeItem({ datum: entry.datum, href: entry.href, rule, now }));
  }
  for (const datum of sourceItems) {
    if (!datum || signalIds.has(datum.id)) continue;
    const state = decisionState(datum);
    const stale = datum.freshness?.state === AI_FRESHNESS_STATES.STALE;
    if (state === ADMIN_DECISION_STATES.READY && !stale) continue;
    decisionItems.push(makeItem({ datum, rule: { ...stateRule(state, stale), resource: resourceFor(datum) }, now }));
  }
  if (decisionItems.length === 0) {
    const informational = sourceItems.find((datum) => datum.id === "admin.home.active_alarms" && datum.permission?.allowed === true && datum.category !== AI_DATA_CATEGORIES.UNAVAILABLE);
    if (informational) decisionItems.push(makeItem({ datum: informational, rule: { orderGroup: 70, level: ADMIN_DECISION_LEVELS.INFORMATION, reason: "Nessun segnale di attenzione e nessun limite di fonte emerge dagli insight approvati.", position: "Gli elementi informativi chiudono l'ordinamento dopo segnali e limiti dei dati.", resource: AI_RESOURCES.ANOMALIES }, now }));
  }
  decisionItems.sort(compareDecisionItems);
  return Object.freeze({
    audience: AI_AUDIENCES.ADMIN,
    access: "allowed",
    generatedAt: new Date(now).toISOString(),
    orderingRule: "Ordine statico: diniego, errore fonte, problemi operativi, campagne in ritardo, operatori offline, waitlist, fonti obsolete, dati mancanti, elementi informativi. Parita: timestamp decrescente, poi ID alfabetico.",
    items: Object.freeze(decisionItems.map(({ orderGroup, ...item }) => Object.freeze(item))),
  });
}
