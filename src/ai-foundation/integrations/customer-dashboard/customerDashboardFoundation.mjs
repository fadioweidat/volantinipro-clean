import { AI_TOOL_NAMES } from "../../contracts.js";
import { getApplicationAiFoundation, registerAiIntegration, resetApplicationAiFoundationForTests } from "../applicationAiFoundation.mjs";
import { CustomerDashboardReadOnlyRuntime } from "./CustomerDashboardReadOnlyRuntime.mjs";
import {
  CustomerDashboardDataProvider,
  createCampaignToolAdapter,
  createCustomerToolAdapter,
  createDashboardToolAdapter,
} from "./customerDashboardAdapters.mjs";

const provider = new CustomerDashboardDataProvider();
const activeSessionIds = new Set();

registerAiIntegration({
  role: "cliente",
  runtime: new CustomerDashboardReadOnlyRuntime(),
  toolAdapters: {
    [AI_TOOL_NAMES.CUSTOMER]: createCustomerToolAdapter(provider),
    [AI_TOOL_NAMES.CAMPAIGN]: createCampaignToolAdapter(provider),
    [AI_TOOL_NAMES.DASHBOARD]: createDashboardToolAdapter(provider),
  },
});

/** Una sola istanza del CentralAiAgent per il runtime applicativo. */
export function getCustomerDashboardFoundation() {
  return getApplicationAiFoundation();
}

export function updateCustomerDashboardData(snapshot) { provider.update(snapshot); }
export function registerCustomerAiSession(sessionId) { if (sessionId) activeSessionIds.add(sessionId); }

export function clearCustomerDashboardAiContext() {
  const foundation = getApplicationAiFoundation();
  for (const sessionId of activeSessionIds) foundation.stateManager.clear(sessionId);
  activeSessionIds.clear();
  provider.clear();
  if (typeof window !== "undefined") {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("vp_ai_customer_session:")) window.sessionStorage.removeItem(key);
    }
  }
}

export function resetCustomerDashboardFoundationForTests() {
  clearCustomerDashboardAiContext();
  resetApplicationAiFoundationForTests();
}
