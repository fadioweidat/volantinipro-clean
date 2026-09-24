// Real, live health checks for the Admin "Centro Controllo Sito" (Blocco 1).
// I check compatibili eseguono un round-trip reale. Le Edge Function business
// sono demandate al collector server-side, che usa un preflight non mutante.
// Nulla viene stimato o simulato. Failures are logged into
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

// Queste funzioni non espongono un endpoint GET di health: chiamarle con GET
// produceva volutamente 401/405/500 nella console Admin e nei log Supabase.
// Il controllo attivo e' delegato al collector server-side, che puo' usare
// OPTIONS senza i vincoli CORS del browser e senza eseguire logica business.
const PINGABLE_EDGE_FUNCTIONS = ["submit-campaign-request", "ai-core", "admin-grant-access"];

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

// API mantenuta per compatibilita' con i consumer/test esistenti. Non esegue
// rete dal browser: non esiste una sonda non mutante che restituisca 2xx con
// il contratto applicativo delle tre funzioni. Il collector periodico resta
// la fonte reale della reachability Edge.
export async function pingEdgeFunction(name) {
  return { name, reachable: null, status: null, responseTimeMs: null, classification: "collector_only", error: null };
}

async function checkEdgeFunctions() {
  const results = await Promise.all(PINGABLE_EDGE_FUNCTIONS.map(pingEdgeFunction));
  return {
    status: "unknown",
    responseTimeMs: null,
    error: null,
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
