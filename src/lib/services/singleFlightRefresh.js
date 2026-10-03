/** One request per owner, including slow requests and recovery/realtime bursts.
 * No queued retries: polling is the bounded fallback for invalidations received
 * during a request. Scope guards prevent results reaching a replaced screen.
 */
export function createSingleFlightRefresh({ now = Date.now, cooldownMs = 1000 } = {}) {
  let pending = null;
  let lastStart = -Infinity;
  let scope = null;
  let pendingScope = null;
  return {
    activate() {
      const current = {};
      scope = current;
      lastStart = -Infinity;
      return () => { if (scope === current) scope = null; };
    },
    run(task) {
      if (!scope) return Promise.resolve();
      if (pending) {
        if (pendingScope === scope) return pending;
        const requestedScope = scope;
        // Identity changes/StrictMode need an initial load after the old one
        // finishes, even when this screen has no periodic timer (group link).
        return pending.catch(() => {}).then(() => scope === requestedScope ? this.run(task) : undefined);
      }
      if (now() - lastStart < cooldownMs) return Promise.resolve();
      lastStart = now();
      const current = scope;
      pendingScope = current;
      const isCurrent = () => scope === current;
      pending = Promise.resolve().then(() => isCurrent() ? task(isCurrent) : undefined)
        .finally(() => { pending = null; });
      return pending;
    },
  };
}
