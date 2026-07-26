import { AI_TOOL_MANIFEST } from "./toolManifest.js";

const SAFE_ERROR_CODES = new Set(["access_denied", "backend_error", "invalid_input", "invalid_output", "tool_timeout", "unsupported_data"]);

export class AiToolAdapterError extends Error {
  constructor(code) {
    super(SAFE_ERROR_CODES.has(code) ? code : "backend_error");
    this.name = "AiToolAdapterError";
    this.code = SAFE_ERROR_CODES.has(code) ? code : "backend_error";
  }
}

export class AiToolRegistry {
  constructor({ permissionPolicy, manifest = AI_TOOL_MANIFEST } = {}) {
    if (!permissionPolicy) throw new TypeError("AiPermissionPolicy obbligatoria.");
    this.permissionPolicy = permissionPolicy;
    this.manifest = new Map(manifest.map((item) => [item.name, item]));
    this.adapters = new Map();
  }

  describeFor(user) {
    return Object.freeze([...this.manifest.values()]
      .filter((descriptor) => descriptor.scopes[user.role])
      .map(({ name, description, mode }) => Object.freeze({ name, description, mode })));
  }

  register(name, adapter) {
    if (!this.manifest.has(name)) throw new TypeError(`Tool AI sconosciuto: ${name}`);
    if (typeof adapter?.execute !== "function") throw new TypeError(`Adapter non valido per il tool AI: ${name}`);
    this.adapters.set(name, adapter);
    return this;
  }

  async execute(call, user, { signal, trustedContext = null } = {}) {
    if (typeof call?.id !== "string" || !call.id.trim()) return Object.freeze({ callId: null, status: "rejected", error: "invalid_call" });
    const descriptor = this.manifest.get(call?.name);
    if (!descriptor) return Object.freeze({ callId: call?.id ?? null, status: "rejected", error: "unknown_tool" });
    const requestedScope = descriptor.scopes[user.role];
    if (!requestedScope) return Object.freeze({ callId: call?.id ?? null, status: "denied", error: "role_not_allowed" });
    const decision = this.permissionPolicy.authorize(user, requestedScope);
    if (!decision.allowed) return Object.freeze({ callId: call?.id ?? null, status: "denied", error: decision.reason });
    const adapter = this.adapters.get(call.name);
    if (!adapter) return Object.freeze({ callId: call?.id ?? null, status: "unavailable", error: "tool_not_connected" });
    const timeoutMs = Number.isFinite(adapter.timeoutMs) ? Math.min(Math.max(adapter.timeoutMs, 50), 30_000) : 8_000;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener?.("abort", abortFromCaller, { once: true });
    let timeoutId;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => { controller.abort(); reject(new AiToolAdapterError("tool_timeout")); }, timeoutMs);
      });
      const data = await Promise.race([
        adapter.execute({
          arguments: Object.freeze({ ...(call.arguments ?? {}) }),
          scope: decision.scope,
          signal: controller.signal,
          trustedContext: Object.freeze({
            sessionId: typeof trustedContext?.sessionId === "string" ? trustedContext.sessionId : null,
          }),
        }),
        timeout,
      ]);
      if (adapter.validateOutput && adapter.validateOutput(data) !== true) throw new AiToolAdapterError("invalid_output");
      return Object.freeze({ callId: call.id, tool: call.name, status: "success", data });
    } catch (error) {
      const code = error instanceof AiToolAdapterError ? error.code : "backend_error";
      const status = code === "access_denied" ? "denied" : code === "unsupported_data" ? "unavailable" : "error";
      return Object.freeze({ callId: call.id, tool: call.name, status, error: code });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener?.("abort", abortFromCaller);
    }
  }
}
