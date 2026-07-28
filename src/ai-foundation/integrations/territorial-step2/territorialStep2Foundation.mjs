import { AI_PAGES, AI_ROLES, AI_TOOL_NAMES } from "../../contracts.js";
import { getApplicationAiFoundation, registerAiIntegration } from "../applicationAiFoundation.mjs";
import { TerritorialStep2ReadOnlyRuntime } from "./TerritorialStep2ReadOnlyRuntime.mjs";
import { TerritorialSnapshotProvider, createTerritoryToolAdapter } from "./territoryToolAdapter.mjs";

const provider = new TerritorialSnapshotProvider();
const runtime = new TerritorialStep2ReadOnlyRuntime();
const adapter = createTerritoryToolAdapter(provider);
const sessionPrincipals = new Map();

const cleanRef = (value) => typeof value === "string" || typeof value === "number"
  ? String(value).trim().slice(0, 128) || null
  : null;
const contextHash = (value) => {
  let result = 2166136261;
  for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16).padStart(8, "0");
};

export function buildTerritorialSessionContextKey({ principalId, role, contextId, campaignRef, quoteRef, fingerprint } = {}) {
  const principal = cleanRef(principalId);
  const fallbackContext = cleanRef(contextId);
  const territoryFingerprint = cleanRef(fingerprint);
  if (!principal || !territoryFingerprint || (!cleanRef(campaignRef) && !cleanRef(quoteRef) && !fallbackContext)) return null;
  return `territory-context:${contextHash(JSON.stringify({
    principal,
    role: cleanRef(role) ?? "visitatore",
    page: AI_PAGES.GUIDED_QUOTE,
    campaign: cleanRef(campaignRef),
    quote: cleanRef(quoteRef),
    fallbackContext,
    territoryFingerprint,
  }))}`;
}

for (const role of Object.values(AI_ROLES)) registerAiIntegration({
  role,
  runtime,
  pages: [AI_PAGES.GUIDED_QUOTE],
  scopeKinds: ["public"],
  toolAdapters: { [AI_TOOL_NAMES.TERRITORY]: adapter },
});

export function getTerritorialStep2Foundation() { return getApplicationAiFoundation(); }
export function updateTerritorialSnapshot(sessionId, snapshot, principalId = null) {
  provider.update(sessionId, snapshot, { principalId });
  if (sessionId && principalId) sessionPrincipals.set(sessionId, String(principalId));
}
export function registerTerritorialAiSession(sessionId, principalId = null) {
  if (sessionId && principalId) sessionPrincipals.set(sessionId, String(principalId));
}
export function invalidateTerritorialAiSession(sessionId) {
  if (!sessionId) return;
  try { getApplicationAiFoundation().stateManager.clear(sessionId); } catch {}
  provider.clear(sessionId);
  sessionPrincipals.delete(sessionId);
}
export function clearTerritorialAiContext(sessionId) { invalidateTerritorialAiSession(sessionId); }
export function clearTerritorialAiPrincipal(principalId) {
  if (!principalId) return;
  const foundation = getApplicationAiFoundation();
  for (const [sessionId, owner] of sessionPrincipals) if (owner === String(principalId)) {
    foundation.stateManager.clear(sessionId);
    sessionPrincipals.delete(sessionId);
  }
  provider.clearByPrincipal(principalId);
}
export function clearAllTerritorialAiContextsForTests() {
  const foundation = getApplicationAiFoundation();
  for (const sessionId of sessionPrincipals.keys()) foundation.stateManager.clear(sessionId);
  sessionPrincipals.clear();
  provider.clearAll();
}
