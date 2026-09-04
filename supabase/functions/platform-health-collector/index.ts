// platform-health-collector — raccolta server-side del Centro Controllo.
// Il job pg_cron esistente lo invoca ogni 5 minuti. La stessa invocazione
// funge da dispatcher idempotente per il ciclo giornaliero e mensile: nessun
// secondo scheduler e nessun Vercel Cron.
//
// COSA FA:
// 1. Esegue gli stessi check LIVE gia' usati da platformHealth.js/
//    authHealth.js lato browser, ma server-side (nessuna dipendenza da un
//    Admin con il browser aperto).
// 2. Scrive i risultati in platform_health_checks (source='collector').
// 3. Applica la stessa macchina a stati di src/lib/monitoring/
//    incidentEngine.js (qui reimplementata in TypeScript puro Deno-compatibile
//    — duplicazione deliberata: un edge function Deno non puo' importare
//    direttamente un modulo ESM del bundle Vite/Node senza un passaggio di
//    build condiviso che questo progetto non ha. Il comportamento e'
//    identico e va tenuto sincronizzato manualmente con
//    src/lib/monitoring/incidentEngine.js/alertRules.js — i test Node di
//    quei due moduli restano la fonte di verita' per la logica; qualunque
//    modifica alle soglie va applicata in ENTRAMBI i posti).
// 4. Aggiorna/apre/risolve platform_incidents di conseguenza.
//
// AUTORIZZAZIONE: NON un utente Admin (nessun browser aperto). Verificato
// tramite un secret condiviso dedicato (PLATFORM_HEALTH_COLLECTOR_SECRET),
// mai il service-role key nudo in un header — lo scheduler passa solo
// questo secret, la function usa il service-role internamente (mai esposto
// al chiamante). Fail-closed: secret assente/non corrispondente => 401,
// nessun check eseguito.
//
// NON invia email/SMS/notifiche esterne. NON cancella/modifica alcuna
// sessione/campagna/dato business: scrive solo nello storico di monitoraggio
// e osserva gli auto-fix verdi già eseguiti dai job approvati. Un errore in QUALUNQUE singolo
// check e' catturato e trattato come 'fail' per quel check — non propaga mai
// un'eccezione che interrompa gli altri check o che possa in alcun modo
// toccare il sito pubblico (questo processo e' interamente separato dal
// traffico utente reale).

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import {
  buildMaintenanceDiagnosisPayload,
  buildMonthlyMaintenanceReport,
  decideMaintenanceRuns,
  evaluatePostFixVerification,
  sanitizeMaintenanceData,
  shouldEscalateWarning,
} from "./maintenance.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-collector-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Stessi 3 endpoint gia' pingati da src/lib/services/gps-api.js/
// platformHealth.js lato browser (submit-campaign-request, ai-core,
// admin-grant-access) — nessun nuovo endpoint scelto qui.
const PINGABLE_EDGE_FUNCTIONS = ["submit-campaign-request", "ai-core", "admin-grant-access"];
const EDGE_FUNCTION_PING_TIMEOUT_MS = 8000;

const MAX_MESSAGE_LENGTH = 500;
const SECRET_LIKE_PATTERN = /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})|(sb_(secret|publishable)_[a-zA-Z0-9_-]+)|(apikey=[^&\s]+)|(authorization:\s*bearer\s+\S+)/gi;
function sanitizeMessage(raw: unknown): string | null {
  if (!raw) return null;
  const text = String(raw).replace(SECRET_LIKE_PATTERN, "[redacted]");
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
}

// Timeout per singolo probe: ogni check e' un fetch/query indipendente, un
// singolo servizio lento (es. Auth momentaneamente in stallo) non deve MAI
// bloccare gli altri check ne' far superare il timeout globale della
// function — vedi PROBE_TIMEOUT_MS/GLOBAL_TIMEOUT_MS sotto e la sua
// applicazione nel serve() principale.
const PROBE_TIMEOUT_MS = 8000;
// Il pg_net esistente attende al massimo 25s: la function deve terminare
// prima del chiamante, anche nel ciclo giornaliero con diagnosi AI.
const GLOBAL_TIMEOUT_MS = 23000;

// timed(): esegue fn con un AbortController dedicato, passato a fn cosi'
// puo' inoltrarlo alla fetch reale (cancellazione vera della richiesta, non
// solo "smettere di aspettare"). In PIU', una race esplicita con un timer
// garantisce che questa funzione non resti mai appesa oltre PROBE_TIMEOUT_MS
// anche se fn() o l'abort non rispettano il segnale per qualche motivo
// (difesa in profondita', stesso principio di withTimeout() gia' usato in
// useGpsTracking.js/end() per lo Stop GPS).
async function timed(fn: (signal: AbortSignal) => Promise<void>, timeoutMs = PROBE_TIMEOUT_MS) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error(`Timeout dopo ${timeoutMs}ms`)));
      }),
    ]);
    return { status: "ok" as const, responseTimeMs: Date.now() - start, error: null as string | null };
  } catch (err: any) {
    return { status: "fail" as const, responseTimeMs: Date.now() - start, error: sanitizeMessage(err?.message || String(err)) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkSupabaseRest(url: string, anonKey: string) {
  return timed(async (signal) => {
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, signal });
    if (!res.ok && res.status !== 401 && res.status !== 403) throw new Error(`HTTP ${res.status}`);
  });
}

async function checkAuthHealth(url: string, anonKey: string) {
  return timed(async (signal) => {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

async function checkDatabase(supabase: any) {
  return timed(async (signal) => {
    const { error } = await supabase.from("campaigns").select("id", { head: true, count: "exact" }).limit(1).abortSignal(signal);
    if (error) throw new Error(error.message);
  });
}

async function checkGpsBackend(supabase: any) {
  return timed(async (signal) => {
    const { error } = await supabase.from("gps_tracking_points").select("id", { head: true, count: "exact" }).limit(1).abortSignal(signal);
    if (error) throw new Error(error.message);
  });
}

async function checkAnalytics(supabase: any) {
  return timed(async (signal) => {
    const { error } = await supabase.from("site_events").select("id", { head: true, count: "exact" }).limit(1).abortSignal(signal);
    if (error) throw new Error(error.message);
  });
}

async function checkTable(supabase: any, table: string) {
  return timed(async (signal) => {
    const { error } = await supabase.from(table).select("id", { head: true, count: "exact" }).limit(1).abortSignal(signal);
    if (error) throw new Error(error.message);
  });
}

async function checkFrontend(origin: string, path = "/") {
  return timed(async (signal) => {
    const res = await fetch(`${origin.replace(/\/$/, "")}${path}`, { method: "GET", redirect: "follow", signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

function maintenanceResult(checkName: string, checkGroup: string, result: any) {
  return { checkName, checkGroup, status: result.status, responseTimeMs: result.responseTimeMs, errorMessage: result.error };
}

// Stessa sonda "fail-closed" gia' testata lato browser in
// src/lib/monitoring/authHealth.js/probeAdminRoleFailsClosedLive: un token
// inventato non deve MAI risultare admin. Qui replicata server-side
// (fetch diretto all'RPC, senza il client SDK autenticato) — stesso esito
// atteso, stessa assenza di password/account reali.
async function probeAdminRoleFailsClosed(url: string, anonKey: string) {
  const bogusToken = `health-check-invalid-token-${Date.now()}`;
  return timed(async (signal) => {
    const res = await fetch(`${url}/rest/v1/rpc/jwt_is_admin`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${bogusToken}`, "Content-Type": "application/json" },
      body: "{}",
      signal,
    });
    if (res.ok) {
      const result = await res.json();
      if (result === true) throw new Error("jwt_is_admin ha restituito true per un token non valido (fail-open)");
    }
    // non-ok (401/403/ecc.) e' l'esito atteso per un token inventato: OK.
  });
}

async function pingEdgeFunction(url: string, anonKey: string, name: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_PING_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, { method: "GET", headers: { apikey: anonKey }, signal: controller.signal });
    const responseTimeMs = Date.now() - start;
    if (res.status === 404) return { reachable: false, responseTimeMs, error: "Funzione non deployata (404)" };
    // submit-campaign-request accetta solo POST: un GET riceve sempre 500
    // dalla function stessa, non un segnale di infrastruttura down — resta
    // REACHABLE, solo etichettata esplicitamente (stessa logica lato browser
    // in src/lib/monitoring/platformHealth.js, duplicazione deliberata).
    const classification = name === "submit-campaign-request" && res.status >= 500 ? "method_not_supported" : "ok";
    return { reachable: true, responseTimeMs, error: null as string | null, classification };
  } catch (err: any) {
    const timedOut = err?.name === "AbortError";
    return { reachable: false, responseTimeMs: Date.now() - start, error: timedOut ? `Timeout dopo ${EDGE_FUNCTION_PING_TIMEOUT_MS}ms` : sanitizeMessage(err?.message || String(err)) };
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Incident engine (duplicato Deno-compatibile — vedi commento di testa) ---

const DEFAULT_RULE = { alertable: false, severity: "warning", consecutiveFailuresBeforeOpen: 2, consecutiveSuccessesBeforeResolve: 2 };
const CRITICAL_INFRA_RULE = { alertable: true, severity: "critical", consecutiveFailuresBeforeOpen: 2, consecutiveSuccessesBeforeResolve: 2 };
const ALERT_RULES: Record<string, typeof DEFAULT_RULE> = {
  supabase: CRITICAL_INFRA_RULE,
  auth_infrastructure: CRITICAL_INFRA_RULE,
  database: CRITICAL_INFRA_RULE,
  edge_functions: CRITICAL_INFRA_RULE,
  auth_admin_role_probe: CRITICAL_INFRA_RULE,
  gps_backend: { ...CRITICAL_INFRA_RULE, severity: "warning" },
  analytics: { ...CRITICAL_INFRA_RULE, severity: "warning" },
};
function resolveRule(checkName: string) {
  return ALERT_RULES[checkName] || DEFAULT_RULE;
}

function evaluateIncidentTransition(checkName: string, rule: typeof DEFAULT_RULE, recentResults: any[], existingIncident: any, nowIso: string) {
  if (!recentResults.length) return { action: "none" as const };
  const latest = recentResults[0];
  const isFailure = (s: string) => s === "fail" || s === "warning";
  const isOk = (s: string) => s === "ok";
  let consecutiveFailures = 0;
  for (const r of recentResults) { if (isFailure(r.status)) consecutiveFailures += 1; else break; }
  let consecutiveSuccesses = 0;
  for (const r of recentResults) { if (isOk(r.status)) consecutiveSuccesses += 1; else break; }

  if (!rule.alertable) return { action: "none" as const };

  if (existingIncident) {
    if (isOk(latest.status)) {
      if (consecutiveSuccesses >= rule.consecutiveSuccessesBeforeResolve) {
        return { action: "resolve" as const, patch: { status: "resolved", resolved_at: nowIso, last_seen_at: nowIso, consecutive_successes: consecutiveSuccesses } };
      }
      return { action: "update" as const, patch: { last_seen_at: nowIso, consecutive_successes: consecutiveSuccesses } };
    }
    return { action: "update" as const, patch: { last_seen_at: nowIso, occurrence_count: (existingIncident.occurrence_count || 0) + 1, last_error_code: latest.error_code || null, consecutive_successes: 0 } };
  }

  if (!isFailure(latest.status)) return { action: "none" as const };
  if (consecutiveFailures < rule.consecutiveFailuresBeforeOpen) return { action: "none" as const };
  return {
    action: "open" as const,
    incident: {
      check_name: checkName,
      severity: rule.severity,
      status: "open",
      started_at: nowIso,
      last_seen_at: nowIso,
      occurrence_count: consecutiveFailures,
      consecutive_successes: 0,
      first_error_code: latest.error_code || null,
      last_error_code: latest.error_code || null,
      summary: latest.error_message || `${checkName}: stato ${latest.status} per ${consecutiveFailures} controlli consecutivi`,
    },
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get("PLATFORM_HEALTH_COLLECTOR_SECRET");
  const providedSecret = req.headers.get("x-collector-secret");
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabase = supabaseAdmin();
  if (!url || !anonKey || !supabase) return json({ error: "SERVER_NOT_CONFIGURED" }, 500);

  const now = new Date();
  const nowIso = now.toISOString();
  const results: Array<{ checkName: string; checkGroup: string; status: string; responseTimeMs: number | null; errorMessage: string | null }> = [];

  // Timeout GLOBALE: ogni singolo check e' gia' limitato a PROBE_TIMEOUT_MS
  // (vedi timed()), ma questa e' una difesa ulteriore — l'intera esecuzione
  // (incluse le letture/scritture di platform_incidents nel loop finale,
  // non coperte da timed()) non deve MAI superare GLOBAL_TIMEOUT_MS. Se
  // scattasse, la function risponde comunque con un errore esplicito
  // invece di restare appesa indefinitamente verso lo scheduler chiamante.
  const globalTimeoutController = new AbortController();
  const globalTimeoutId = setTimeout(() => globalTimeoutController.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const runPromise = (async () => {
    const maintenanceState = decideMaintenanceRuns({ now });
    const candidateMarkers = [maintenanceState.window.dailyMarker, maintenanceState.window.monthlyMarker];
    const { data: existingMarkerRows } = await supabase
      .from("platform_health_checks")
      .select("check_name")
      .in("check_name", candidateMarkers);
    const schedule = decideMaintenanceRuns({ now, existingMarkers: (existingMarkerRows || []).map((row: any) => row.check_name) });

    const [supabaseRest, authHealthCheck, database, gpsBackend, analytics, adminProbe, edgeFns] = await Promise.all([
      checkSupabaseRest(url, anonKey),
      checkAuthHealth(url, anonKey),
      checkDatabase(supabase),
      checkGpsBackend(supabase),
      checkAnalytics(supabase),
      probeAdminRoleFailsClosed(url, anonKey),
      Promise.all(PINGABLE_EDGE_FUNCTIONS.map((name) => pingEdgeFunction(url, anonKey, name))),
    ]);

    results.push({ checkName: "supabase", checkGroup: "supabase", status: supabaseRest.status, responseTimeMs: supabaseRest.responseTimeMs, errorMessage: supabaseRest.error });
    results.push({ checkName: "auth_infrastructure", checkGroup: "auth", status: authHealthCheck.status, responseTimeMs: authHealthCheck.responseTimeMs, errorMessage: authHealthCheck.error });
    results.push({ checkName: "database", checkGroup: "database", status: database.status, responseTimeMs: database.responseTimeMs, errorMessage: database.error });
    results.push({ checkName: "gps_backend", checkGroup: "gps", status: gpsBackend.status, responseTimeMs: gpsBackend.responseTimeMs, errorMessage: gpsBackend.error });
    results.push({ checkName: "analytics", checkGroup: "analytics", status: analytics.status, responseTimeMs: analytics.responseTimeMs, errorMessage: analytics.error });
    results.push({ checkName: "auth_admin_role_probe", checkGroup: "auth", status: adminProbe.status, responseTimeMs: adminProbe.responseTimeMs, errorMessage: adminProbe.error });

    const unreachable = edgeFns.filter((f) => !f.reachable);
    results.push({
      checkName: "edge_functions",
      checkGroup: "edge_function",
      status: unreachable.length === 0 ? "ok" : unreachable.length === edgeFns.length ? "fail" : "warning",
      responseTimeMs: Math.max(...edgeFns.map((f) => f.responseTimeMs)),
      errorMessage: unreachable.length > 0 ? sanitizeMessage(unreachable.map((f) => f.error).join("; ")) : null,
    });

    if (schedule.runDaily || schedule.runMonthly) {
      const publicOrigin = Deno.env.get("PUBLIC_SITE_URL") || "https://www.volantinipro.it";
      const [frontend, configurator, marketplace, quoteStore] = await Promise.all([
        checkFrontend(publicOrigin),
        checkFrontend(publicOrigin, "/configuratore?step=1"),
        checkTable(supabase, "supplier_profiles"),
        checkTable(supabase, "quote_requests"),
      ]);
      results.push(maintenanceResult("frontend_reachable", "frontend", frontend));
      results.push(maintenanceResult("preventivatore_smoke", "frontend", configurator));
      results.push(maintenanceResult("marketplace_base", "provider", marketplace));
      results.push(maintenanceResult("quote_api", "database", quoteStore));

      const { data: activeSessions, error: inactiveError } = await supabase
        .from("delivery_sessions")
        .select("id,status,started_at")
        .eq("status", "started")
        .limit(500);
      let gpsPointError: any = null;
      let recentPoints: any[] = [];
      if (!inactiveError && activeSessions?.length) {
        const pointResult = await supabase
          .from("gps_tracking_points")
          .select("session_id,recorded_at")
          .in("session_id", activeSessions.map((row: any) => row.id))
          .order("recorded_at", { ascending: false })
          .limit(5000);
        recentPoints = pointResult.data || [];
        gpsPointError = pointResult.error;
      }
      const lastPointBySession = new Map<string, number>();
      for (const point of recentPoints) if (!lastPointBySession.has(point.session_id)) lastPointBySession.set(point.session_id, new Date(point.recorded_at).getTime());
      const sessionAges = (activeSessions || []).map((row: any) => now.getTime() - (lastPointBySession.get(row.id) || new Date(row.started_at).getTime()));
      const staleCount = inactiveError || gpsPointError ? null : sessionAges.filter((age: number) => age >= 10 * 60 * 1000).length;
      const abandonedCount = inactiveError || gpsPointError ? null : sessionAges.filter((age: number) => age >= 4 * 60 * 60 * 1000).length;
      results.push({
        checkName: "gps_stale_sessions",
        checkGroup: "gps",
        status: inactiveError || gpsPointError ? "fail" : staleCount ? "warning" : "ok",
        responseTimeMs: null,
        errorMessage: inactiveError || gpsPointError ? sanitizeMessage(inactiveError?.message || gpsPointError?.message) : staleCount ? `${staleCount} sessioni inattive; ${abandonedCount} oltre 4 ore. Recovery automatico non eseguito senza identità Admin verificata.` : null,
      });
    }

    const rows = results.map((r) => ({
      check_name: r.checkName,
      check_group: r.checkGroup,
      status: r.status,
      response_time_ms: r.responseTimeMs,
      error_code: null,
      error_message: r.errorMessage,
      checked_at: nowIso,
      source: "collector",
      metadata: {},
    }));
    const { error: insertError } = await supabase.from("platform_health_checks").insert(rows);
    if (insertError) {
      console.error("[platform-health-collector] INSERT_HEALTH_CHECKS_FAILED", insertError.message);
    }

    const incidentActions: any[] = [];
    // Numero di controlli consecutivi in cui un check risulta ancora aperto
    // (platform_incidents.occurrence_count e' gia' esattamente questo dato)
    // — usato dal report mensile (FASE 8: "indicare da quanti controlli
    // persiste") senza ricalcolare nulla, solo letto dalla stessa incident
    // machine che gia' gestisce apertura/chiusura.
    const persistenceByCheck: Record<string, number> = {};
    for (const r of results) {
      const rule = resolveRule(r.checkName);
      if (!rule.alertable) continue;
      const historyLimit = Math.max(rule.consecutiveFailuresBeforeOpen, rule.consecutiveSuccessesBeforeResolve, 1) + 1;
      const [{ data: recent }, { data: existingIncident }] = await Promise.all([
        supabase.from("platform_health_checks").select("status, error_code, error_message, checked_at").eq("check_name", r.checkName).order("checked_at", { ascending: false }).limit(historyLimit),
        supabase.from("platform_incidents").select("*").eq("check_name", r.checkName).eq("status", "open").maybeSingle(),
      ]);
      const decision = evaluateIncidentTransition(r.checkName, rule, recent || [], existingIncident, nowIso);
      if (decision.action === "open") {
        persistenceByCheck[r.checkName] = decision.incident.occurrence_count;
      } else if (decision.action === "update") {
        persistenceByCheck[r.checkName] = decision.patch.occurrence_count ?? existingIncident?.occurrence_count ?? 0;
      } else if (existingIncident) {
        persistenceByCheck[r.checkName] = existingIncident.occurrence_count || 0;
      }
      if (decision.action === "open") {
        const { error } = await supabase.from("platform_incidents").insert(decision.incident);
        if (error) {
          if (error.code === "23505") {
            // Race: l'unique index parziale platform_incidents_one_open_per_check_uidx
            // ha rifiutato l'insert perche' un'altra esecuzione concorrente
            // (es. due invocazioni schedulate sovrapposte) ha gia' aperto
            // l'incidente per questo check_name — recupera e aggiorna
            // quello, mai un secondo incidente duplicato.
            const { data: raceIncident } = await supabase.from("platform_incidents").select("*").eq("check_name", r.checkName).eq("status", "open").maybeSingle();
            if (raceIncident) {
              await supabase.from("platform_incidents").update({
                last_seen_at: nowIso,
                occurrence_count: (raceIncident.occurrence_count || 0) + 1,
                last_error_code: decision.incident.last_error_code,
                consecutive_successes: 0,
              }).eq("id", raceIncident.id);
            }
          } else {
            console.error("[platform-health-collector] INSERT_INCIDENT_FAILED", error.message);
          }
        }
      } else if ((decision.action === "update" || decision.action === "resolve") && existingIncident) {
        const { error } = await supabase.from("platform_incidents").update(decision.patch).eq("id", existingIncident.id);
        if (error) console.error("[platform-health-collector] UPDATE_INCIDENT_FAILED", error.message);
      }
      incidentActions.push({ checkName: r.checkName, action: decision.action });
    }

    const maintenanceRuns: any[] = [];
    if (schedule.runDaily || schedule.runMonthly) {
      const autoFixes: any[] = [];
      const diagnoses: any[] = [];
      const todayStart = `${schedule.window.dateKey}T00:00:00+00:00`;
      const [{ count: resolvedOldCount }, { count: stillOldOpenCount }] = await Promise.all([
        supabase.from("error_log").select("id", { head: true, count: "exact" }).eq("resolved_note", "auto").gte("resolved_at", todayStart),
        supabase.from("error_log").select("id", { head: true, count: "exact" }).eq("status", "open").or(`last_seen_at.lt.${new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString()},and(last_seen_at.is.null,created_at.lt.${new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString()})`),
      ]);
      const errorLogVerification = evaluatePostFixVerification(stillOldOpenCount || 0);
      autoFixes.push({
        action: "observe_error_log_auto_resolve",
        result: errorLogVerification.verified ? "verified" : "failed",
        affected: resolvedOldCount || 0,
        postFixVerification: errorLogVerification.verified ? "Nessun error_log aperto e silente da almeno 72 ore." : `${stillOldOpenCount} error_log vecchi risultano ancora aperti; nessun secondo fix eseguito.`,
        stop: errorLogVerification.stop,
      });

      for (const result of results.filter((row) => row.status === "warning" || row.status === "fail")) {
        const { data: recentRows } = await supabase
          .from("platform_health_checks")
          .select("status")
          .eq("check_name", result.checkName)
          .order("checked_at", { ascending: false })
          .limit(3);
        const statuses = (recentRows || []).map((row: any) => row.status);
        if (!shouldEscalateWarning(statuses)) continue;
        const payload = buildMaintenanceDiagnosisPayload({
          checkName: result.checkName,
          group: result.checkGroup,
          status: result.status,
          message: result.errorMessage,
          checkedAt: nowIso,
          responseTimeMs: result.responseTimeMs,
          occurrenceCount: statuses.length,
        });
        try {
          const aiController = new AbortController();
          const aiTimeoutId = setTimeout(() => aiController.abort(), 5000);
          const diagnosisResponse = await fetch(`${url}/functions/v1/ai-core`, {
            method: "POST",
            headers: { apikey: anonKey, "Content-Type": "application/json", "x-collector-secret": expectedSecret },
            body: JSON.stringify(payload),
            signal: aiController.signal,
          });
          clearTimeout(aiTimeoutId);
          const diagnosis = await diagnosisResponse.json().catch(() => null);
          diagnoses.push(sanitizeMaintenanceData({ checkName: result.checkName, status: diagnosisResponse.ok ? "completed" : "failed", diagnosis: diagnosisResponse.ok ? diagnosis : null, error: diagnosisResponse.ok ? null : `AI_CORE_HTTP_${diagnosisResponse.status}` }));
        } catch (error: any) {
          diagnoses.push({ checkName: result.checkName, status: "failed", diagnosis: null, error: sanitizeMessage(error?.message) });
        }
      }

      const failedVerification = autoFixes.some((row) => row.result === "failed");
      const dailyMetadata = {
        maintenanceType: "daily",
        localDate: schedule.window.dateKey,
        timeZone: "Europe/Rome",
        summary: {
          ok: results.filter((row) => row.status === "ok").length,
          warning: results.filter((row) => row.status === "warning").length,
          critical: results.filter((row) => row.status === "fail").length,
          autoFixes: autoFixes.filter((row) => row.result === "verified" && row.affected > 0).length,
          diagnoses: diagnoses.filter((row) => row.status === "completed").length,
        },
        autoFixes,
        diagnoses,
        postFixVerified: !failedVerification,
      };
      if (schedule.runDaily) {
        const marker = { check_name: schedule.window.dailyMarker, check_group: "provider", status: failedVerification ? "warning" : "ok", response_time_ms: null, error_code: failedVerification ? "POST_FIX_VERIFICATION_FAILED" : null, error_message: failedVerification ? "Verifica post-fix fallita; nessun secondo intervento automatico eseguito." : null, checked_at: nowIso, source: "collector", metadata: sanitizeMaintenanceData(dailyMetadata) };
        const { error } = await supabase.from("platform_health_checks").insert(marker);
        maintenanceRuns.push({ type: "daily", status: error ? "record_failed" : marker.status });
      }
      if (schedule.runMonthly) {
        // Mese precedente: solo per il confronto "degrado performance" in
        // sezione Performance — lettura, nessuna scrittura, nessun impatto
        // se il marker del mese scorso non esiste ancora (report nuovo).
        const previousMonthKey = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
        const previousMonthMarker = `maintenance_monthly_${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(previousMonthKey)}`;
        const { data: previousMonthlyRow } = await supabase.from("platform_health_checks").select("metadata").eq("check_name", previousMonthMarker).order("checked_at", { ascending: false }).limit(1).maybeSingle();
        const report = buildMonthlyMaintenanceReport({
          monthKey: schedule.window.monthKey,
          checks: results.map((row) => ({ ...row, severity: resolveRule(row.checkName).severity, checkedAt: nowIso, persistedForChecks: persistenceByCheck[row.checkName] || 0 })),
          autoFixes,
          diagnoses,
          generatedAt: nowIso,
          previousReport: (previousMonthlyRow as any)?.metadata?.report || null,
        });
        const marker = { check_name: schedule.window.monthlyMarker, check_group: "provider", status: failedVerification ? "warning" : "ok", response_time_ms: null, error_code: failedVerification ? "POST_FIX_VERIFICATION_FAILED" : null, error_message: failedVerification ? "Report mensile completato con verifica post-fix da revisionare." : null, checked_at: nowIso, source: "collector", metadata: { maintenanceType: "monthly", localMonth: schedule.window.monthKey, timeZone: "Europe/Rome", report } };
        const { error } = await supabase.from("platform_health_checks").insert(marker);
        maintenanceRuns.push({ type: "monthly", status: error ? "record_failed" : marker.status });
      }
    }

    return { checkedAt: nowIso, checksRecorded: rows.length, incidentActions, maintenanceRuns };
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      globalTimeoutController.signal.addEventListener("abort", () => reject(new Error(`Timeout globale dopo ${GLOBAL_TIMEOUT_MS}ms`)));
    });
    const result = await Promise.race([runPromise, timeoutPromise]);
    return json(result);
  } catch (err: any) {
    console.error("[platform-health-collector] UNEXPECTED_ERROR", err?.message || err);
    return json({ error: "INTERNAL_ERROR" }, 500);
  } finally {
    clearTimeout(globalTimeoutId);
  }
});
