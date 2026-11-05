// Stato di una richiesta di analisi territoriale. Una sola fonte: la UI non deve
// dedurre "non disponibile" da un dato che sta ancora arrivando.
export const ANALYSIS_SLOW_AFTER_MS = 5000;
// Oltre questa attesa il tentativo viene interrotto: un fetch sospeso non deve
// lasciare i KPI in calcolo per sempre. Il massimo misurato in produzione e' 7,3 s.
export const ANALYSIS_ATTEMPT_TIMEOUT_MS = 12000;

const UNAVAILABLE_ERRORS = new Set(["ANALYSIS_BACKEND_NOT_CONFIGURED", "POI_DATA_NOT_AVAILABLE"]);

export function resolveAnalysisStatus({ active, cancelled, retrying, inFlight, slow, error, hasData }) {
  if (!active) return cancelled ? "cancelled" : "idle";
  if (retrying) return "retrying";
  if (inFlight) return slow ? "slow" : "loading";
  if (error) return UNAVAILABLE_ERRORS.has(error) ? "unavailable" : "error";
  return hasData ? "success" : "unavailable";
}

// Il timer copre anche la lettura del corpo della risposta.
export async function fetchWithAttemptTimeout(url, options, signal, timeoutMs = ANALYSIS_ATTEMPT_TIMEOUT_MS) {
  const attempt = new AbortController();
  let timedOut = false;
  const cancel = () => attempt.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; attempt.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: attempt.signal });
    const body = typeof response.json === "function"
      ? await response.json().catch((error) => {
        if (attempt.signal.aborted) throw error;
        return { error: response.ok ? "INVALID_ANALYSIS_RESPONSE" : `HTTP_${response.status}` };
      })
      : { error: "INVALID_ANALYSIS_RESPONSE" };
    return { response, body };
  } catch (error) {
    if (timedOut) throw Object.assign(new Error("ANALYSIS_TIMEOUT"), { name: "AnalysisTimeout" });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
