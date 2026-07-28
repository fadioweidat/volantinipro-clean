/**
 * Contratti pubblici dell'AI Foundation.
 *
 * Il progetto usa JavaScript; i typedef JSDoc mantengono i confini fortemente
 * tipizzati senza introdurre una toolchain TypeScript nel runtime esistente.
 */

export const AI_ROLES = Object.freeze({
  VISITOR: "visitatore",
  CLIENT: "cliente",
  SUPPLIER: "fornitore",
  ADMIN: "admin",
});

export const AI_PAGES = Object.freeze({
  HOMEPAGE: "homepage",
  GUIDED_QUOTE: "preventivo_guidato",
  QUICK_QUOTE: "preventivo_rapido",
  CONSULTING: "consulenza",
  CLIENT_DASHBOARD: "dashboard_cliente",
  SUPPLIER_DASHBOARD: "dashboard_fornitore",
  ADMIN_DASHBOARD: "dashboard_admin",
  GPS: "gps",
  REPORT: "report",
  PROFILE: "profilo",
  UNKNOWN: "sconosciuta",
});

export const AI_DATA_SCOPES = Object.freeze({
  PUBLIC: "public",
  CUSTOMER: "customer",
  ASSIGNED_JOBS: "assigned_jobs",
  ADMIN: "admin",
});

export const AI_TOOL_NAMES = Object.freeze({
  CAMPAIGN: "campaign",
  GPS: "gps",
  TERRITORY: "territory",
  CUSTOMER: "customer",
  SUPPLIER: "supplier",
  DASHBOARD: "dashboard",
  PRICING: "pricing",
  NOTIFICATION: "notification",
  DOCUMENT: "document",
  ANALYTICS: "analytics",
});

export const AI_MESSAGE_ROLES = Object.freeze({ USER: "user", ASSISTANT: "assistant" });

/** @typedef {typeof AI_ROLES[keyof typeof AI_ROLES]} AiRole */
/** @typedef {typeof AI_PAGES[keyof typeof AI_PAGES]} AiPage */
/** @typedef {typeof AI_DATA_SCOPES[keyof typeof AI_DATA_SCOPES]} AiDataScope */

/**
 * @typedef {object} AiUser
 * @property {string|null} id Identificatore autenticato, mai dedotto dalla UI.
 * @property {string|null} customerId Identificatore public.clienti verificato dal flusso autenticato.
 * @property {string|null} email
 * @property {AiRole} role
 * @property {boolean} authenticated
 */

/**
 * @typedef {object} AiToolCall
 * @property {string} id
 * @property {string} name
 * @property {Readonly<Record<string, unknown>>} [arguments]
 */

/**
 * Porta di un tool futuro. Ogni adapter deve essere di sola lettura e deve
 * applicare lo scope ricevuto anche nella query sottostante (defence in depth).
 * @typedef {object} AiToolAdapter
 * @property {(input: {arguments: Readonly<Record<string, unknown>>, scope: Readonly<Record<string, unknown>>, signal?: AbortSignal}) => Promise<unknown>} execute
 * @property {(output: unknown) => boolean} [validateOutput]
 * @property {number} [timeoutMs]
 */

/**
 * Porta dell'unico modello/agent runtime.
 * @typedef {object} AiRuntime
 * @property {(input: Readonly<Record<string, unknown>>) => Promise<{toolCalls?: AiToolCall[], requiresData?: boolean}>} plan
 * @property {(input: Readonly<Record<string, unknown>>) => Promise<{text: string, citations?: string[], sources?: string[], kind?: "fact"|"explanation"|"general"}>} respond
 */
