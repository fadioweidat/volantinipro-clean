import { AI_MESSAGE_ROLES } from "../contracts.js";

const clone = (value) => value == null ? value : structuredClone(value);
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
};

export class InMemoryAiStateStore {
  #sessions = new Map();
  load(sessionId) { return clone(this.#sessions.get(sessionId) ?? null); }
  save(sessionId, state) { this.#sessions.set(sessionId, clone(state)); }
  remove(sessionId) { this.#sessions.delete(sessionId); }
}

/** Stato di sessione centrale; lo store e iniettabile per una persistenza futura. */
export class AiStateManager {
  constructor({ store = new InMemoryAiStateStore(), now = () => new Date(), historyLimit = 100 } = {}) {
    this.store = store;
    this.now = now;
    this.historyLimit = historyLimit;
  }

  initialize({ sessionId, user, page, activeCampaign, activeQuote }) {
    if (!sessionId || typeof sessionId !== "string") throw new TypeError("AI sessionId obbligatorio.");
    const timestamp = this.now().toISOString();
    const previous = this.store.load(sessionId);
    const samePrincipal = previous && previous.currentUser?.id === user.id && previous.role === user.role;
    const state = {
      currentUser: clone(user), role: user.role, page,
      activeCampaign: activeCampaign === undefined ? (samePrincipal ? previous.activeCampaign : null) : clone(activeCampaign),
      activeQuote: activeQuote === undefined ? (samePrincipal ? previous.activeQuote : null) : clone(activeQuote),
      aiSession: { id: sessionId, startedAt: samePrincipal ? previous.aiSession.startedAt : timestamp, updatedAt: timestamp },
      history: samePrincipal ? previous.history : [],
    };
    this.store.save(sessionId, state);
    return this.snapshot(sessionId);
  }

  appendMessage(sessionId, role, content, metadata = {}) {
    if (!Object.values(AI_MESSAGE_ROLES).includes(role)) throw new TypeError("Ruolo messaggio AI non valido.");
    if (typeof content !== "string" || !content.trim()) throw new TypeError("Contenuto messaggio AI obbligatorio.");
    const state = this.#required(sessionId);
    state.history.push(Object.freeze({ role, content: content.trim(), at: this.now().toISOString(), metadata: clone(metadata) }));
    state.history = state.history.slice(-this.historyLimit);
    state.aiSession.updatedAt = this.now().toISOString();
    this.store.save(sessionId, state);
    return this.snapshot(sessionId);
  }

  snapshot(sessionId) { return deepFreeze(clone(this.#required(sessionId))); }
  clear(sessionId) { this.store.remove(sessionId); }
  #required(sessionId) {
    const state = this.store.load(sessionId);
    if (!state) throw new Error(`Sessione AI non inizializzata: ${sessionId}`);
    return state;
  }
}
