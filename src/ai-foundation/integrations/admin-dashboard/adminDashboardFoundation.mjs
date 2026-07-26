import { AI_TOOL_NAMES } from "../../contracts.js";
import { getApplicationAiFoundation, registerAiIntegration } from "../applicationAiFoundation.mjs";
import { AdminDashboardReadOnlyRuntime } from "./AdminDashboardReadOnlyRuntime.mjs";
import { AdminDashboardDataProvider, createAdminCampaignToolAdapter, createAdminCustomerToolAdapter, createAdminDashboardToolAdapter } from "./adminDashboardAdapters.mjs";

const provider = new AdminDashboardDataProvider();
const activeSessionIds = new Set();

registerAiIntegration({
  role: "admin",
  runtime: new AdminDashboardReadOnlyRuntime(),
  toolAdapters: {
    [AI_TOOL_NAMES.CAMPAIGN]: createAdminCampaignToolAdapter(provider),
    [AI_TOOL_NAMES.CUSTOMER]: createAdminCustomerToolAdapter(provider),
    [AI_TOOL_NAMES.DASHBOARD]: createAdminDashboardToolAdapter(provider),
  },
});

export function getAdminDashboardFoundation() { return getApplicationAiFoundation(); }
export function updateAdminDashboardData(snapshot) { provider.update(snapshot); }
export function registerAdminAiSession(sessionId) { if (sessionId) activeSessionIds.add(sessionId); }
export function clearAdminDashboardAiContext() {
  const foundation = getApplicationAiFoundation();
  for (const sessionId of activeSessionIds) foundation.stateManager.clear(sessionId);
  activeSessionIds.clear();
  provider.clear();
  if (typeof window !== "undefined") for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith("vp_ai_admin_session:")) window.sessionStorage.removeItem(key);
  }
}
