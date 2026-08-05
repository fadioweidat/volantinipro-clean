import { CentralAiAgent } from "./agent/CentralAiAgent.js";
import { AiPageResolver } from "./context/AiPageResolver.js";
import { AiIdentityResolver } from "./identity/AiIdentityResolver.js";
import { AiPermissionPolicy } from "./security/AiPermissionPolicy.js";
import { AiStateManager } from "./state/AiStateManager.js";
import { AiToolRegistry } from "./tools/AiToolRegistry.js";

/** Composition root. Non viene avviata automaticamente e non ha side effect. */
export function createAiFoundation({ runtime, store, now, historyLimit, toolAdapters = {} } = {}) {
  const permissionPolicy = new AiPermissionPolicy();
  const toolRegistry = new AiToolRegistry({ permissionPolicy });
  for (const [name, adapter] of Object.entries(toolAdapters)) toolRegistry.register(name, adapter);
  const stateManager = new AiStateManager({ store, now, historyLimit });
  const agent = new CentralAiAgent({
    runtime,
    identityResolver: new AiIdentityResolver(),
    pageResolver: new AiPageResolver(),
    stateManager,
    toolRegistry,
  });
  return Object.freeze({ agent, stateManager, toolRegistry, permissionPolicy });
}

