// Real, live health checks for the Admin "Centro Controllo Sito" (Blocco 1).
// Every check below performs an actual network round-trip when called —
// nothing here is a simulated/estimated value. Failures are logged into
// error_log (category=supabase/edge_function) so they also surface in
// "Errori recenti" (Blocco 2), not just in this one-off run.

import { supabase } from "../../supabaseClient.js";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "./errorLog.js";

// Stesso guard gia' usato in src/supabaseClient.js: import.meta.env e'
// sempre un oggetto reale sotto Vite, ma e' undefined quando questo modulo
// viene caricato da node:test puro (nessun Vite) — necessario per poter
// testare pingEdgeFunction in isolamento (vedi tests/platform_status_center.test.mjs).
let SUPABASE_URL = null;
let SUPABASE_ANON_KEY = null;
try {
  SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
} catch (e) {
  if (typeof process !== "undefined" && process.env) {
    SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
  }
}

// submit-campaign-request, ai-core, admin-grant-access: le 3 funzioni
// principali gia' identificate. send-email-conferma resta esclusa dal ping
// live (comportamento OPTIONS non pulito, gia' verificato in precedenza).
const PINGABLE_EDGE_FUNCTIONS = ["submit-campaign-request", "ai-core", "admin-grant-access"];

// Timeout esplicito: senza questo, una richiesta che si blocca (rete
// instabile, funzione che non risponde mai) farebbe attendere il check
// all'infinito invece di classificare la funzione come irraggiungibile.
const EDGE_FUNCTION_PING_TIMEOUT_MS = 8000;

async function timed(fn) {
  const start = (typeof performance !== "undefined" ? performance : Date).now();
  try {
    await fn();
    return { status: "ok", responseTimeMs: Math.round((typeof performance !== "undefined" ? performance : Date).now() - start), error: null };
  } catch (error) {
    return { status: "error", responseTimeMs: Math.round((typeof performance !== "undefined" ? performance : Date).now() - start), error: error?.message || String(error) };
  }
}

async function checkFrontend() {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { status: "unknown", responseTimeMs: null, error: "Non eseguibile fuori dal browser" };
  }
  return timed(async () => {
    const res = await fetch(window.location.origin + "/", { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

async function checkSupabaseAuth() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { status: "error", responseTimeMs: null, error: "Supabase non configurato" };
  return timed(async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

async function checkSupabaseReachable() {
  if (!supabase) return { status: "error", responseTimeMs: null, error: "Supabase non configurato" };
  return timed(async () => {
    const { error } = await supabase.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
  });
}

async function checkDatabase() {
  if (!supabase) return { status: "error", responseTimeMs: null, error: "Supabase non configurato" };
  return timed(async () => {
    const { error } = await supabase.from("campaigns").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
  });
}

async function checkGpsBackend() {
  if (!supabase) return { status: "error", responseTimeMs: null, error: "Supabase non configurato" };
  return timed(async () => {
    const { error } = await supabase.from("gps_tracking_points").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
  });
}

// REACHABLE vs UNREACHABLE (diagnosi precedente): un fetch(url,{method:
// "OPTIONS"}) dal browser non e' un preflight CORS automatico, e' una
// richiesta reale con metodo "OPTIONS" — e nessuna delle 3 funzioni dichiara
// Access-Control-Allow-Methods, quindi il browser la blocca PRIMA di
// arrivare al server ("Method OPTIONS is not allowed by
// Access-Control-Allow-Methods in preflight response"), producendo un falso
// ERRORE anche se curl (che non applica CORS) riceve 200. GET e HEAD sono
// invece metodi "semplici" per il CORS spec: nessun preflight del browser,
// nessun Access-Control-Allow-Methods richiesto — bastano gli header che le
// funzioni hanno gia' (Access-Control-Allow-Origin: *).
//
// Un fetch() che RESOLVE (qualunque status HTTP, incluso 401/403/405/500)
// significa che una risposta e' stata effettivamente ricevuta dal
// servizio: la funzione e' REACHABLE, anche se rifiuta o fallisce la
// richiesta stessa (es. submit-campaign-request risponde 500 a un GET
// perche' si aspetta sempre un body POST — comportamento della funzione,
// non un segnale di infrastruttura down, e non viene modificato qui). Solo
// un fetch() che LANCIA un'eccezione (network/DNS/CORS-block) o che supera
// il timeout esplicito e' classificato UNREACHABLE.
// Esportata per i test unitari (mock di fetch): la classificazione
// REACHABLE/UNREACHABLE e' la parte critica da verificare in isolamento,
// senza dipendere da import.meta.env.VITE_SUPABASE_URL (assente sotto
// node:test) ne' da una vera chiamata di rete.
export async function pingEdgeFunction(name) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_PING_TIMEOUT_MS);
  const start = (typeof performance !== "undefined" ? performance : Date).now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "GET", signal: controller.signal });
    const responseTimeMs = Math.round((typeof performance !== "undefined" ? performance : Date).now() - start);
    // Il gateway Supabase risponde 404 con {"code":"NOT_FOUND"} solo quando
    // la funzione non e' deployata con quel nome — non e' l'applicazione
    // stessa a rispondere, quindi va classificato come irraggiungibile
    // (vedi regola "404 function non deployata").
    if (res.status === 404) {
      return { name, reachable: false, status: 404, responseTimeMs, error: "Funzione non deployata (404)" };
    }
    return { name, reachable: true, status: res.status, responseTimeMs };
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return {
      name,
      reachable: false,
      status: null,
      responseTimeMs: Math.round((typeof performance !== "undefined" ? performance : Date).now() - start),
      error: timedOut ? `Timeout dopo ${EDGE_FUNCTION_PING_TIMEOUT_MS}ms` : (error?.message || String(error)),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkEdgeFunctions() {
  if (!SUPABASE_URL) return { status: "error", responseTimeMs: null, error: "Supabase non configurato", checked: [] };
  const start = (typeof performance !== "undefined" ? performance : Date).now();
  const results = await Promise.all(PINGABLE_EDGE_FUNCTIONS.map(pingEdgeFunction));
  const responseTimeMs = Math.round((typeof performance !== "undefined" ? performance : Date).now() - start);
  const unreachable = results.filter((r) => !r.reachable);
  return {
    status: unreachable.length === 0 ? "ok" : unreachable.length === results.length ? "error" : "warning",
    responseTimeMs,
    error: unreachable.length > 0 ? `${unreachable.length}/${results.length} funzioni irraggiungibili: ${unreachable.map((f) => `${f.name} (${f.error})`).join(", ")}` : null,
    checked: results,
  };
}

// Riusa la stessa funzione admin gia' esistente (getSiteTraffic) invece di
// duplicare la query: e' letteralmente una delle API principali dell'admin,
// e la sua disponibilita' e' anche il segnale reale per la riga Analytics.
async function checkSiteApiAndAnalytics(getSiteTrafficFn) {
  const timing = await timed(async () => {
    const result = await getSiteTrafficFn();
    if (!result.available) throw new Error("site_events non raggiungibile");
    return result;
  });
  return timing;
}

const LABELS = {
  ok: "OK",
  error: "ERRORE",
  warning: "ATTENZIONE",
  unknown: "NON DISPONIBILE",
};

function toRow(key, label, checkResult, extra = {}) {
  return {
    key,
    label,
    status: checkResult.status,
    statusLabel: LABELS[checkResult.status] || checkResult.status.toUpperCase(),
    responseTimeMs: checkResult.responseTimeMs,
    error: checkResult.error || null,
    ...extra,
  };
}

// getSiteTrafficFn e' iniettata (non importata direttamente) per evitare un
// import circolare: admin-api.js potrebbe in futuro voler leggere lo stato
// piattaforma, e questo modulo non deve dipendere da admin-api.js per motivi
// diversi dal solo riuso della query gia' esistente.
export async function runPlatformHealthCheck({ getSiteTrafficFn } = {}) {
  const [frontend, supabaseAuth, supabaseReachable, database, gpsBackend, edgeFunctions, siteApi] = await Promise.all([
    checkFrontend(),
    checkSupabaseAuth(),
    checkSupabaseReachable(),
    checkDatabase(),
    checkGpsBackend(),
    checkEdgeFunctions(),
    getSiteTrafficFn ? checkSiteApiAndAnalytics(getSiteTrafficFn) : Promise.resolve({ status: "unknown", responseTimeMs: null, error: "getSiteTraffic non disponibile" }),
  ]);

  const rows = [
    toRow("frontend", "Sito frontend", { ...frontend, status: frontend.status === "ok" ? "ok" : "error" }, { statusLabel: frontend.status === "ok" ? "ONLINE" : "OFFLINE" }),
    toRow("supabase", "Supabase", supabaseReachable),
    toRow("auth", "Auth Supabase", supabaseAuth),
    toRow("database", "Database", database),
    toRow("edge_functions", "Edge Functions principali", edgeFunctions),
    toRow("api", "API principali", siteApi),
    toRow("gps_backend", "Driver/GPS backend", gpsBackend),
    toRow("analytics", "Analytics", { ...siteApi, status: siteApi.status === "ok" ? "ok" : "error" }, { statusLabel: siteApi.status === "ok" ? "CONFIGURATO" : "NON CONFIGURATO" }),
  ];

  // Ogni riga in errore reale (non "unknown"/non configurato) finisce anche
  // in error_log, cosi' un guasto rilevato qui e' visibile anche in
  // "Errori recenti" senza dover ripetere la logica altrove.
  // fingerprint STABILE per check (`health:<key>`): un guasto di health che
  // persiste tra un run e l'altro aggiorna la STESSA riga (occurrence_count /
  // last_seen_at) invece di crearne una nuova ogni volta — il pannello lo
  // mostra gia', non deve diventare rumore in "Errori recenti".
  await Promise.all(rows.filter((row) => row.status === "error" && row.error).map((row) => logError({
    category: row.key === "gps_backend" ? ERROR_CATEGORIES.GPS : row.key === "edge_functions" ? ERROR_CATEGORIES.EDGE_FUNCTION : ERROR_CATEGORIES.SUPABASE,
    module: `health_check.${row.key}`,
    message: row.error,
    severity: ERROR_SEVERITY.WARNING,
    fingerprint: `health:${row.key}`,
  })));

  return {
    checkedAt: new Date().toISOString(),
    rows,
  };
}
