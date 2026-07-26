import { AI_DATA_SCOPES, AI_ROLES, AI_TOOL_NAMES } from "../contracts.js";

const PUBLIC_ALL = Object.freeze(Object.fromEntries(Object.values(AI_ROLES).map((role) => [role, AI_DATA_SCOPES.PUBLIC])));
const ROLE_SCOPED = Object.freeze({
  [AI_ROLES.VISITOR]: AI_DATA_SCOPES.PUBLIC,
  [AI_ROLES.CLIENT]: AI_DATA_SCOPES.CUSTOMER,
  [AI_ROLES.SUPPLIER]: AI_DATA_SCOPES.ASSIGNED_JOBS,
  [AI_ROLES.ADMIN]: AI_DATA_SCOPES.ADMIN,
});
const AUTH_SCOPED = Object.freeze({
  [AI_ROLES.CLIENT]: AI_DATA_SCOPES.CUSTOMER,
  [AI_ROLES.SUPPLIER]: AI_DATA_SCOPES.ASSIGNED_JOBS,
  [AI_ROLES.ADMIN]: AI_DATA_SCOPES.ADMIN,
});

const tool = (name, description, scopes) => Object.freeze({ name, description, mode: "read-only", scopes });

/** Solo metadati/interfacce: nessun motore o API esistente e collegato in questa fase. */
export const AI_TOOL_MANIFEST = Object.freeze([
  tool(AI_TOOL_NAMES.CAMPAIGN, "Legge campagne entro lo scope autorizzato.", ROLE_SCOPED),
  tool(AI_TOOL_NAMES.GPS, "Legge dati GPS reali autorizzati; non ricostruisce tracce.", AUTH_SCOPED),
  tool(AI_TOOL_NAMES.TERRITORY, "Legge dati territoriali disponibili.", PUBLIC_ALL),
  tool(AI_TOOL_NAMES.CUSTOMER, "Legge il profilo cliente corrente o dati cliente per Admin.", Object.freeze({ [AI_ROLES.CLIENT]: AI_DATA_SCOPES.CUSTOMER, [AI_ROLES.ADMIN]: AI_DATA_SCOPES.ADMIN })),
  tool(AI_TOOL_NAMES.SUPPLIER, "Legge dati del fornitore corrente o dati fornitore per Admin.", Object.freeze({ [AI_ROLES.SUPPLIER]: AI_DATA_SCOPES.ASSIGNED_JOBS, [AI_ROLES.ADMIN]: AI_DATA_SCOPES.ADMIN })),
  tool(AI_TOOL_NAMES.DASHBOARD, "Legge la proiezione della dashboard autorizzata.", ROLE_SCOPED),
  tool(AI_TOOL_NAMES.PRICING, "Consulta risultati reali del motore prezzi senza calcolarli.", PUBLIC_ALL),
  tool(AI_TOOL_NAMES.NOTIFICATION, "Legge notifiche autorizzate; non invia o modifica.", AUTH_SCOPED),
  tool(AI_TOOL_NAMES.DOCUMENT, "Legge metadati/documenti autorizzati.", AUTH_SCOPED),
  tool(AI_TOOL_NAMES.ANALYTICS, "Legge KPI reali entro lo scope autorizzato.", AUTH_SCOPED),
]);
