import { AI_TOOL_NAMES } from "../../contracts.js";
import { AiToolAdapterError } from "../../tools/AiToolRegistry.js";

export const TERRITORY_DATA_STATES = Object.freeze(["complete", "partial", "missing", "available", "unavailable", "loading", "error", "unsupported_service"]);
const operations = new Set(["overview", "quantity", "coverage", "families", "zones", "missing", "simple", "transit", "stations", "selected_points", "businesses", "materials"]);
const clean = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const validOutput = (value) => Boolean(value && value.source === AI_TOOL_NAMES.TERRITORY && TERRITORY_DATA_STATES.includes(value.state) && Array.isArray(value.missing) && value.data?.fingerprint);

export class TerritorialSnapshotProvider {
  #snapshots = new Map();
  #principals = new Map();

  update(sessionId, snapshot, { principalId = null } = {}) {
    if (typeof sessionId !== "string" || !sessionId.trim()) throw new AiToolAdapterError("invalid_input");
    if (!snapshot || typeof snapshot !== "object") throw new AiToolAdapterError("invalid_input");
    this.#snapshots.set(sessionId, structuredClone(snapshot));
    if (principalId) this.#principals.set(sessionId, String(principalId));
  }

  read(sessionId) {
    if (typeof sessionId !== "string" || !sessionId.trim()) throw new AiToolAdapterError("invalid_input");
    const snapshot = this.#snapshots.get(sessionId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  clear(sessionId) {
    if (typeof sessionId !== "string" || !sessionId.trim()) return;
    this.#snapshots.delete(sessionId);
    this.#principals.delete(sessionId);
  }

  clearByPrincipal(principalId) {
    if (!principalId) return;
    for (const [sessionId, owner] of this.#principals) if (owner === String(principalId)) this.clear(sessionId);
  }

  clearAll() {
    this.#snapshots.clear();
    this.#principals.clear();
  }
}

function rejectOverrides(args) {
  const forbidden = ["role", "identity", "principalId", "userId", "subjectId", "customerId", "ownerId", "sessionId", "contextId", "campaignId", "quoteId", "service", "quantity", "families", "coverage", "radius", "zone", "snapshot", "fingerprint"];
  if (forbidden.some((key) => args?.[key] !== undefined)) throw new AiToolAdapterError("access_denied");
}

export function createTerritoryToolAdapter(provider) {
  return Object.freeze({
    timeoutMs: 2_000,
    validateOutput: validOutput,
    async execute({ arguments: args, scope, trustedContext }) {
      if (scope?.kind !== "public") throw new AiToolAdapterError("access_denied");
      rejectOverrides(args);
      if (!operations.has(clean(args?.operation))) throw new AiToolAdapterError("invalid_input");
      const sessionId = clean(trustedContext?.sessionId);
      if (!sessionId) throw new AiToolAdapterError("invalid_input");
      const snapshot = provider.read(sessionId);
      if (!snapshot) throw new AiToolAdapterError("unsupported_data");
      return Object.freeze({ source: AI_TOOL_NAMES.TERRITORY, state: snapshot.state, data: Object.freeze(snapshot), missing: Object.freeze([...(snapshot.missing ?? [])]) });
    },
  });
}
