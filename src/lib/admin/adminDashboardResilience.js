const DEFAULT_REFRESH_MS = 30_000;
const MAX_REFRESH_MS = 5 * 60_000;

export class AdminResourceUnavailableError extends Error {
  constructor(resource, cause = null) {
    super(`${resource} non disponibile${cause?.message ? `: ${cause.message}` : ''}`);
    this.name = 'AdminResourceUnavailableError';
    this.resource = resource;
    this.cause = cause || null;
  }
}

export function createAdminResourceStore({ now = () => Date.now() } = {}) {
  const resources = new Map();

  return {
    async load(key, loader, { fallback, maxAgeMs = 0 } = {}) {
      const previous = resources.get(key) || null;
      if (previous && maxAgeMs > 0 && now() - previous.lastSuccessAt < maxAgeMs) {
        return { value: previous.value, available: true, stale: false, refreshed: false, error: null, lastSuccessAt: previous.lastSuccessAt };
      }
      try {
        const value = await loader();
        const record = { value, lastSuccessAt: now() };
        resources.set(key, record);
        return { value, available: true, stale: false, refreshed: true, error: null, lastSuccessAt: record.lastSuccessAt };
      } catch (error) {
        if (previous) {
          return { value: previous.value, available: true, stale: true, refreshed: false, error, lastSuccessAt: previous.lastSuccessAt };
        }
        return { value: fallback, available: false, stale: false, refreshed: false, error, lastSuccessAt: null };
      }
    },
    clear() { resources.clear(); },
  };
}

export function createSingleFlightLoader(loader) {
  let inFlight = null;
  return async (...args) => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(() => loader(...args));
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}

export async function withAbortTimeout(loader, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  const timeoutError = new Error('ADMIN_HOME_REFRESH_TIMEOUT');
  timeoutError.name = 'TimeoutError';
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => loader(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function nextAdminRefreshDelay(failureCount, { baseMs = DEFAULT_REFRESH_MS, maxMs = MAX_REFRESH_MS } = {}) {
  return Math.min(baseMs * (2 ** Math.max(0, failureCount)), maxMs);
}

export function summarizeAdminResourceStates(states) {
  const entries = Object.entries(states || {});
  return {
    refreshIssues: entries.filter(([, resource]) => resource?.error).map(([name]) => name),
    hasAnyData: entries.some(([, resource]) => resource?.lastSuccessAt != null),
  };
}

export function createAdminRefreshLoop({ run, onResult, onError, schedule = setTimeout, cancel = clearTimeout }) {
  let active = true;
  let timer = null;
  let failures = 0;

  const tick = async () => {
    try {
      const result = await run();
      if (!active) return;
      const degraded = Boolean(result?.refreshIssues?.length);
      failures = degraded ? failures + 1 : 0;
      onResult(result);
    } catch (error) {
      if (!active) return;
      failures += 1;
      onError(error);
    }
    if (active) timer = schedule(tick, nextAdminRefreshDelay(failures));
  };

  tick();
  return () => {
    active = false;
    if (timer != null) cancel(timer);
  };
}
