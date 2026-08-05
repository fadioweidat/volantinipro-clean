import { AI_ROLES } from "../../ai-foundation/contracts.js";

/**
 * Registro dichiarativo degli intenti AI-BRAIN-2. Ogni intento dichiara:
 * - allowedRoles: chi puo' invocarlo (mai dedotto dal payload frontend);
 * - requiredContext: quale scope del Context Layer serve (deve gia' esistere,
 *   costruito dopo l'autorizzazione, prima di questa risoluzione);
 * - authorizedFunction: quale funzione/adapter AI puo' rispondere;
 * - fallback: testo mostrato se la funzione non produce un risultato valido
 *   o se il dato richiesto non e' collegato;
 * - allowedNavActions: unica lista di azioni di navigazione che l'intento
 *   puo' proporre (mai azioni libere generate dal modello).
 *
 * Il router NON esegue nulla: autorizza e descrive. L'esecuzione resta negli
 * adapter/runtime esistenti (CentralAiAgent, Edge Function OpenAI) — nessuna
 * logica di dominio duplicata qui.
 */

const intent = (name, { allowedRoles, requiredContext, authorizedFunction, fallback, allowedNavActions = [] }) => Object.freeze({
  name, allowedRoles: Object.freeze([...allowedRoles]), requiredContext, authorizedFunction, fallback, allowedNavActions: Object.freeze([...allowedNavActions]),
});

const CONFIGURATOR_ROLES = Object.freeze([AI_ROLES.VISITOR, AI_ROLES.CLIENT, AI_ROLES.SUPPLIER, AI_ROLES.ADMIN]);

export const AI_INTENTS = Object.freeze({
  // ---- Configuratore (Step 2), scope pubblico read-only ----
  explain_service: intent("explain_service", {
    allowedRoles: CONFIGURATOR_ROLES, requiredContext: "configurator", authorizedFunction: "territory_tool_edge_function",
    fallback: "Non dispongo di dati sufficienti sul servizio selezionato per rispondere.",
    allowedNavActions: [],
  }),
  explain_quantity: intent("explain_quantity", {
    allowedRoles: CONFIGURATOR_ROLES, requiredContext: "configurator", authorizedFunction: "territory_tool_edge_function",
    fallback: "Quantita' corrente o fabbisogno non disponibili nello snapshot dello Step 2.",
    allowedNavActions: [],
  }),
  explain_territory: intent("explain_territory", {
    allowedRoles: CONFIGURATOR_ROLES, requiredContext: "configurator", authorizedFunction: "territory_tool_edge_function",
    fallback: "Nessuna zona selezionata risulta disponibile nello snapshot.",
    allowedNavActions: [],
  }),
  explain_smart_pairing: intent("explain_smart_pairing", {
    allowedRoles: CONFIGURATOR_ROLES, requiredContext: "configurator", authorizedFunction: "territory_tool_edge_function",
    fallback: "Smart Pairing non e' una fonte collegata al Context Layer del Configuratore: consulta la sezione dedicata.",
    allowedNavActions: ["open_smart_pairing"],
  }),
  explain_quote: intent("explain_quote", {
    allowedRoles: CONFIGURATOR_ROLES, requiredContext: "configurator", authorizedFunction: "territory_tool_edge_function",
    fallback: "Il preventivo non e' una fonte collegata al Context Layer del Configuratore: consulta lo Step 4.",
    allowedNavActions: ["open_step4"],
  }),

  // ---- Dashboard Cliente, scope customer_campaign ----
  campaign_progress: intent("campaign_progress", {
    allowedRoles: [AI_ROLES.CLIENT], requiredContext: "customer_campaign", authorizedFunction: "customer_dashboard_central_agent",
    fallback: "Non risultano campagne collegate al cliente autenticato.",
    allowedNavActions: ["open_campaign_tracking"],
  }),
  completed_areas: intent("completed_areas", {
    allowedRoles: [AI_ROLES.CLIENT], requiredContext: "customer_campaign", authorizedFunction: "customer_dashboard_central_agent",
    fallback: "Il dettaglio aree completate non e' disponibile nel contesto Cliente.",
    allowedNavActions: ["open_campaign_tracking"],
  }),
  latest_gps: intent("latest_gps", {
    allowedRoles: [AI_ROLES.CLIENT], requiredContext: "customer_campaign", authorizedFunction: "customer_dashboard_central_agent",
    fallback: "Il dato GPS puntuale non e' una fonte collegata al contesto Cliente.",
    allowedNavActions: ["open_campaign_tracking"],
  }),
  approved_photos: intent("approved_photos", {
    allowedRoles: [AI_ROLES.CLIENT], requiredContext: "customer_campaign", authorizedFunction: "customer_dashboard_central_agent",
    fallback: "Le foto approvate non sono una fonte collegata al contesto Cliente.",
    allowedNavActions: ["open_campaign_report"],
  }),
  explain_report: intent("explain_report", {
    allowedRoles: [AI_ROLES.CLIENT], requiredContext: "customer_campaign", authorizedFunction: "customer_dashboard_central_agent",
    fallback: "Il report non risulta ancora disponibile per la campagna piu' recente.",
    allowedNavActions: ["open_campaign_report"],
  }),
  next_campaign_suggestion: intent("next_campaign_suggestion", {
    allowedRoles: [AI_ROLES.CLIENT], requiredContext: "customer_campaign", authorizedFunction: "customer_dashboard_central_agent",
    fallback: "Non genero suggerimenti su nuove campagne senza dati reali sufficienti.",
    allowedNavActions: ["open_new_quote"],
  }),

  // ---- Dashboard Admin, scope admin_operations ----
  critical_campaigns: intent("critical_campaigns", {
    allowedRoles: [AI_ROLES.ADMIN], requiredContext: "admin_operations", authorizedFunction: "admin_copilot_edge_function",
    fallback: "Non risultano campagne critiche nei dati Admin caricati.",
    allowedNavActions: ["open_campaign_operations", "open_campaign_report"],
  }),
  inactive_operators: intent("inactive_operators", {
    allowedRoles: [AI_ROLES.ADMIN], requiredContext: "admin_operations", authorizedFunction: "admin_copilot_edge_function",
    fallback: "Non risultano operatori inattivi nei dati GPS live caricati.",
    allowedNavActions: ["open_gps_monitor"],
  }),
  stale_gps_sessions: intent("stale_gps_sessions", {
    allowedRoles: [AI_ROLES.ADMIN], requiredContext: "admin_operations", authorizedFunction: "admin_copilot_edge_function",
    fallback: "Non risultano sessioni GPS stantie nei dati caricati.",
    allowedNavActions: ["open_gps_monitor"],
  }),
  campaigns_without_photos: intent("campaigns_without_photos", {
    allowedRoles: [AI_ROLES.ADMIN], requiredContext: "admin_operations", authorizedFunction: "admin_copilot_edge_function",
    fallback: "La fonte foto non e' disponibile o non risultano campagne senza foto.",
    allowedNavActions: ["open_campaign_report"],
  }),
  unassigned_groups: intent("unassigned_groups", {
    allowedRoles: [AI_ROLES.ADMIN], requiredContext: "admin_operations", authorizedFunction: "admin_copilot_edge_function",
    fallback: "Non risultano campagne attive senza gruppi assegnati.",
    allowedNavActions: ["open_campaign_groups"],
  }),
  daily_operations_summary: intent("daily_operations_summary", {
    allowedRoles: [AI_ROLES.ADMIN], requiredContext: "admin_operations", authorizedFunction: "admin_copilot_edge_function",
    fallback: "Dati operativi Admin non disponibili in questo momento.",
    allowedNavActions: ["open_gps_monitor", "open_campaign_operations"],
  }),
});

/**
 * Autorizza un intento per un ruolo. Non esegue nulla: restituisce solo la
 * decisione + il descrittore. `role` deve arrivare da un'identita' gia'
 * verificata a monte (mai da argomenti/messaggio dell'utente).
 */
export function resolveIntent(intentName, { role } = {}) {
  const descriptor = AI_INTENTS[intentName];
  if (!descriptor) return Object.freeze({ ok: false, reason: "unknown_intent", descriptor: null });
  if (!role || !descriptor.allowedRoles.includes(role)) return Object.freeze({ ok: false, reason: "role_denied", descriptor });
  return Object.freeze({ ok: true, reason: null, descriptor });
}

export function listIntentsForRole(role) {
  return Object.freeze(Object.values(AI_INTENTS).filter((descriptor) => descriptor.allowedRoles.includes(role)).map((descriptor) => descriptor.name));
}

export function isNavActionAllowed(intentName, actionId) {
  const descriptor = AI_INTENTS[intentName];
  return Boolean(descriptor && descriptor.allowedNavActions.includes(actionId));
}
