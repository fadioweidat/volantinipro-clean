import { AI_MESSAGE_ROLES } from "../contracts.js";
import { buildCentralSystemPrompt } from "../prompt/centralSystemPrompt.js";

const SAFE_UNAVAILABLE = "Non dispongo di dati reali autorizzati sufficienti per rispondere. Collega o consulta lo strumento VolantiniPro dedicato.";

/** Unico orchestratore AI della piattaforma. Runtime, memoria e tool sono dipendenze iniettate. */
export class CentralAiAgent {
  constructor({ runtime, identityResolver, pageResolver, stateManager, toolRegistry }) {
    if (!runtime?.plan || !runtime?.respond) throw new TypeError("AiRuntime obbligatorio.");
    Object.assign(this, { runtime, identityResolver, pageResolver, stateManager, toolRegistry });
  }

  initialize({ sessionId, authUser = null, profile = null, customerId = null, location = "/", activeCampaign, activeQuote }) {
    const user = this.identityResolver.resolve({ authUser, profile, customerId });
    const page = this.pageResolver.resolve(location);
    return this.stateManager.initialize({ sessionId, user, page, activeCampaign, activeQuote });
  }

  async reply(input) {
    let state = this.initialize(input);
    state = this.stateManager.appendMessage(input.sessionId, AI_MESSAGE_ROLES.USER, input.message);
    const systemPrompt = buildCentralSystemPrompt(state);
    const availableTools = this.toolRegistry.describeFor(state.currentUser);
    const plan = await this.runtime.plan(Object.freeze({ systemPrompt, state, availableTools, message: input.message }));
    const calls = Array.isArray(plan?.toolCalls) ? plan.toolCalls : [];
    const toolResults = await Promise.all(calls.map((call) => this.toolRegistry.execute(call, state.currentUser, {
      signal: input.signal,
      trustedContext: Object.freeze({ sessionId: input.sessionId }),
    })));
    const successfulIds = new Set(toolResults.filter((item) => item.status === "success").map((item) => item.callId));

    let response;
    if ((plan?.requiresData === true || calls.length > 0) && successfulIds.size === 0) {
      response = { text: SAFE_UNAVAILABLE, citations: [] };
    } else {
      response = await this.runtime.respond(Object.freeze({ systemPrompt, state, message: input.message, plan, toolResults }));
      const citations = Array.isArray(response?.citations) ? response.citations : [];
      const sources = Array.isArray(response?.sources) ? response.sources : [];
      const citationsValid = citations.every((id) => successfulIds.has(id));
      const successfulTools = new Set(toolResults.filter((item) => item.status === "success").map((item) => item.tool));
      const sourcesValid = sources.every((name) => successfulTools.has(name));
      if (successfulIds.size > 0 && (!citationsValid || citations.length === 0 || !sourcesValid || sources.length === 0)) response = { text: SAFE_UNAVAILABLE, citations: [], sources: [], kind: "general" };
    }
    const text = typeof response?.text === "string" && response.text.trim() ? response.text.trim() : SAFE_UNAVAILABLE;
    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const sources = Array.isArray(response?.sources) ? response.sources : [];
    const kind = ["fact", "explanation", "general"].includes(response?.kind) ? response.kind : "general";
    this.stateManager.appendMessage(input.sessionId, AI_MESSAGE_ROLES.ASSISTANT, text, { citations, sources, kind });
    return Object.freeze({ text, citations: Object.freeze([...citations]), sources: Object.freeze([...sources]), kind, state: this.stateManager.snapshot(input.sessionId) });
  }
}

export { SAFE_UNAVAILABLE };
