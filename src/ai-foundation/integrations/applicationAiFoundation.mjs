import { AI_ROLES, AI_TOOL_NAMES } from "../contracts.js";
import { createAiFoundation } from "../createAiFoundation.js";
import { AiToolAdapterError } from "../tools/AiToolRegistry.js";

const runtimes = new Map();
const contextualRuntimes = new Map();
const adapters = new Map();
let singleton = null;

const scopeKeyForRole = Object.freeze({
  [AI_ROLES.VISITOR]: "public",
  [AI_ROLES.CLIENT]: "customer",
  [AI_ROLES.SUPPLIER]: "assigned_jobs",
  [AI_ROLES.ADMIN]: "admin",
});

class ApplicationAiRuntime {
  async plan(input) {
    const contextual = contextualRuntimes.get(`${input.state?.role}:${input.state?.page}`);
    const runtime = contextual ?? runtimes.get(input.state?.role);
    if (!runtime) return Object.freeze({ intent: "integration_unavailable", requiresData: false, toolCalls: Object.freeze([]) });
    return runtime.plan(input);
  }
  async respond(input) {
    const contextual = contextualRuntimes.get(`${input.state?.role}:${input.state?.page}`);
    const runtime = contextual ?? runtimes.get(input.state?.role);
    if (!runtime) return Object.freeze({ text: "L'integrazione AI per questo ruolo non e disponibile.", citations: [], sources: [], kind: "general" });
    return runtime.respond(input);
  }
}

function multiplexedAdapter(toolName) {
  return Object.freeze({
    timeoutMs: 8_000,
    validateOutput: (value) => Boolean(value && typeof value.source === "string" && typeof value.state === "string" && Array.isArray(value.missing)),
    async execute(input) {
      const adapter = adapters.get(toolName)?.get(input.scope.kind);
      if (!adapter) throw new AiToolAdapterError("unsupported_data");
      const output = await adapter.execute(input);
      if (adapter.validateOutput && adapter.validateOutput(output) !== true) throw new AiToolAdapterError("invalid_output");
      return output;
    },
  });
}

export function registerAiIntegration({ role, runtime, toolAdapters = {}, pages = [], scopeKinds = null }) {
  if (!Object.values(AI_ROLES).includes(role) || !runtime?.plan || !runtime?.respond) throw new TypeError("Integrazione AI non valida.");
  if (Array.isArray(pages) && pages.length > 0) {
    for (const page of pages) contextualRuntimes.set(`${role}:${page}`, runtime);
  } else runtimes.set(role, runtime);
  const resolvedScopeKinds = Array.isArray(scopeKinds) && scopeKinds.length ? scopeKinds : [scopeKeyForRole[role]].filter(Boolean);
  for (const [toolName, adapter] of Object.entries(toolAdapters)) {
    if (!Object.values(AI_TOOL_NAMES).includes(toolName) || !adapter?.execute) throw new TypeError(`Adapter AI non valido: ${toolName}`);
    if (!adapters.has(toolName)) adapters.set(toolName, new Map());
    for (const scopeKind of resolvedScopeKinds) adapters.get(toolName).set(scopeKind, adapter);
  }
}

/** Unico CentralAiAgent condiviso da tutte le integrazioni applicative. */
export function getApplicationAiFoundation() {
  if (!singleton) {
    const toolAdapters = Object.fromEntries([...adapters.keys()].map((toolName) => [toolName, multiplexedAdapter(toolName)]));
    singleton = createAiFoundation({ runtime: new ApplicationAiRuntime(), toolAdapters });
  } else {
    for (const toolName of adapters.keys()) {
      if (!singleton.toolRegistry.adapters.has(toolName)) singleton.toolRegistry.register(toolName, multiplexedAdapter(toolName));
    }
  }
  return singleton;
}

export function resetApplicationAiFoundationForTests() { singleton = null; }
