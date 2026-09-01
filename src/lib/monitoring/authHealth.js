// Login system health per il Centro Controllo Sito (FASE: login health check
// reale). Questo modulo MONITORA il login esistente, non lo riprogetta: non
// tocca AdminGuard, verifySupabaseAdminRole, session.js o LoginPage — li
// RIUSA cosi' come sono in produzione, esattamente come li usa il flusso
// reale. Nessuna password, nessun magic link, nessun account creato: ogni
// controllo qui e' o (a) puramente deterministico su input fissi, o (b) una
// singola chiamata di rete di sola lettura verso un endpoint gia' pubblico
// (Auth health) o un RPC STABLE senza side effect (jwt_is_admin).
//
// Tre livelli distinti, come richiesto — mai confusi tra loro:
//   1. AUTH INFRASTRUCTURE — l'endpoint Supabase Auth risponde? (rete reale)
//   2. AUTH CONTRACT       — le regole di routing/sessione/ruolo si
//                            comportano come atteso, su input noti? (nessun
//                            login vero, solo invarianti deterministici +
//                            UNA sonda live non distruttiva sul fail-closed
//                            di jwt_is_admin())
//   3. REAL LOGIN EVIDENCE — qualcuno si e' davvero autenticato di recente?
//                            (solo dati reali gia' esistenti: last_sign_in_at
//                            via l'edge function config-status, ed eventuali
//                            errori 'auth' gia' in error_log). Se non esiste
//                            alcuna evidenza, il risultato e'
//                            NO_RECENT_EVIDENCE — MAI un PASS finto.

import { getSupabaseEnv, verifySupabaseAdminRole, isStoredSupabaseSessionValid } from "../../auth/session.js";
import { resolveAppRoute } from "../../app/routeResolution.js";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "./errorLog.js";

// Stessa finestra "ultime 24h" gia' usata ovunque nel Centro Controllo
// (platformFlows.js: step1-4, submit_campaign, quote_creation,
// driver_assignment) — riusata qui per coerenza con il resto della
// dashboard, non perche' sia intrinsecamente la cadenza "corretta" di un
// login (un admin puo' accedere piu' spesso, un cliente molto meno: la
// finestra sceglie solo cosa intendiamo per "recente" in modo uniforme con
// il resto di questa stessa pagina).
export const AUTH_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function timed(fn) {
  const start = (typeof performance !== "undefined" ? performance : Date).now();
  try {
    await fn();
    return { status: "ok", responseTimeMs: Math.round((typeof performance !== "undefined" ? performance : Date).now() - start), error: null };
  } catch (error) {
    return { status: "error", responseTimeMs: Math.round((typeof performance !== "undefined" ? performance : Date).now() - start), error: error?.message || String(error) };
  }
}

// LIVELLO 1 — stesso endpoint pubblico gia' pingato da
// platformHealth.js/checkSupabaseAuth (non esportata da li'): duplicato qui
// deliberatamente come funzione di modulo indipendente, cosi' il login
// health check resta leggibile/testabile per conto proprio senza importare
// l'intero modulo platformHealth.
export async function checkAuthInfrastructure() {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) return { status: "error", responseTimeMs: null, error: "Supabase non configurato" };
  return timed(async () => {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

// LIVELLO 2a — invarianti puri di routing (resolveAppRoute e' una funzione
// pura, gia' usata da AppRouter: nessun login vero, solo input/output noti).
const CLIENT_ROUTE_CASES = [
  { path: "/dashboard", flags: {}, expected: "dashboard" },
  { path: "/login", flags: {}, expected: "login" },
  { path: "/auth/callback", flags: {}, expected: "login" },
  { path: "/auth/callback", flags: { hasAuthHash: true }, expected: "login" },
];
const ADMIN_ROUTE_CASES = [
  { path: "/admin", flags: {}, expected: "admin" },
  { path: "/admin/dashboard", flags: {}, expected: "admin" },
  { path: "/admin/status", flags: {}, expected: "admin-status" },
  { path: "/admin/una-sezione-sconosciuta", flags: {}, expected: "admin" },
];

function runRouteCases(cases) {
  return cases.map(({ path, flags, expected }) => {
    const actual = resolveAppRoute(path, flags);
    return { label: `resolveAppRoute(${path}) === ${expected}`, expected, actual, pass: actual === expected };
  });
}

// LIVELLO 2b — invarianti puri di validita' sessione
// (isStoredSupabaseSessionValid, gia' usata da AdminGuard/CustomerGuard):
// sessione mancante/scaduta deve risultare sempre non valida.
const SESSION_CASES = [
  { label: "sessione assente => non valida", session: null, expected: false },
  { label: "sessione senza accessToken => non valida", session: {}, expected: false },
  { label: "sessione scaduta => non valida", session: { accessToken: "x", expiresAt: Math.floor(Date.now() / 1000) - 3600 }, expected: false },
  { label: "sessione valida (scadenza futura) => valida", session: { accessToken: "x", expiresAt: Math.floor(Date.now() / 1000) + 3600 }, expected: true },
];

function runSessionCases() {
  return SESSION_CASES.map(({ label, session, expected }) => {
    const actual = isStoredSupabaseSessionValid(session);
    return { label, expected, actual, pass: actual === expected };
  });
}

// LIVELLO 2c — UNICA sonda live di questo modulo: riusa verifySupabaseAdminRole
// (la stessa funzione che chiama davvero AdminGuard) con un token
// deliberatamente non valido, per confermare che jwt_is_admin() realmente
// deployata in produzione fallisce chiuso (mai true) anche fuori dai test
// offline. Nessuna password, nessun account, nessuna sessione reale: un
// token inventato non corrisponde a nessun utente, quindi l'unica risposta
// corretta e' false/errore — se risultasse true sarebbe un fail-open reale
// e grave, mai osservato finora ma degno di un controllo attivo.
async function probeAdminRoleFailsClosedLive() {
  const bogusToken = `health-check-invalid-token-${Date.now()}`;
  return timed(async () => {
    const result = await verifySupabaseAdminRole({ accessToken: bogusToken });
    if (result === true) throw new Error("jwt_is_admin ha restituito true per un token non valido (fail-open)");
  });
}

export async function checkAuthContract() {
  const clientRouteChecks = runRouteCases(CLIENT_ROUTE_CASES);
  const adminRouteChecks = runRouteCases(ADMIN_ROUTE_CASES);
  const sessionChecks = runSessionCases();
  const liveProbe = await probeAdminRoleFailsClosedLive();

  const clientChecks = [...clientRouteChecks, ...sessionChecks];
  const adminChecks = [...adminRouteChecks, ...sessionChecks];
  const clientPass = clientChecks.every((c) => c.pass);
  const adminPass = adminChecks.every((c) => c.pass) && liveProbe.status === "ok";

  return {
    client: { status: clientPass ? "pass" : "fail", checks: clientChecks },
    admin: { status: adminPass ? "pass" : "fail", checks: adminChecks, liveProbe },
  };
}

// LIVELLO 3 — classificazione pura di evidenza reale, MAI inventata: se non
// c'e' ne' un last_sign_in_at recente ne' un errore auth recente, il
// risultato e' esplicitamente "nessuna evidenza", non un successo presunto.
export function classifyRealLoginEvidence({ lastSignInIso = null, recentAuthErrorCount = 0, now = new Date(), windowMs = AUTH_RECENT_WINDOW_MS } = {}) {
  if (recentAuthErrorCount > 0) {
    return { status: "ERROR_RECENT", reason: `${recentAuthErrorCount} errore/i di autenticazione registrato/i nelle ultime 24h` };
  }
  if (lastSignInIso) {
    const ts = new Date(lastSignInIso).getTime();
    if (Number.isFinite(ts) && now.getTime() - ts <= windowMs) {
      const minutes = Math.max(0, Math.round((now.getTime() - ts) / 60000));
      return { status: "OK_RECENT", reason: `Ultimo accesso reale verificato ${minutes} min fa` };
    }
  }
  return { status: "NO_RECENT_EVIDENCE", reason: "Nessun accesso reale osservato nelle ultime 24h" };
}

// Orchestratore: unica funzione chiamata dalla UI. errorLogRows/lastAdminSignIn/
// lastCustomerSignIn sono INIETTATI (gia' letti altrove da PlatformStatus.jsx
// tramite getPlatformStatusData()/getConfigStatus(), gia' in uso per Blocco 2/8)
// — nessuna query duplicata qui.
export async function computeAuthHealth({ lastAdminSignIn = null, lastCustomerSignIn = null, errorLogRows = [], now = new Date() } = {}) {
  const infrastructure = await checkAuthInfrastructure();
  if (infrastructure.status === "error") {
    await logError({
      category: ERROR_CATEGORIES.AUTH,
      module: "health_check.auth_infrastructure",
      message: infrastructure.error || "Auth endpoint irraggiungibile",
      severity: ERROR_SEVERITY.CRITICAL,
      // fingerprint stabile: un guasto auth che persiste tra i run aggiorna
      // la stessa riga (last_seen_at/occurrence_count), non ne crea una nuova.
      fingerprint: "health:auth_infrastructure",
    });
  }

  const contract = await checkAuthContract();
  if (contract.admin.liveProbe.status === "error" && contract.admin.liveProbe.error?.includes("fail-open")) {
    await logError({
      category: ERROR_CATEGORIES.AUTH,
      module: "health_check.admin_role_probe",
      message: contract.admin.liveProbe.error,
      severity: ERROR_SEVERITY.CRITICAL,
      fingerprint: "health:admin_role_probe",
    });
  }

  const recentAuthErrors = (Array.isArray(errorLogRows) ? errorLogRows : []).filter((e) => {
    if (e?.category !== "auth") return false;
    const ts = new Date(e.created_at).getTime();
    return Number.isFinite(ts) && now.getTime() - ts <= AUTH_RECENT_WINDOW_MS;
  });
  const adminErrors = recentAuthErrors.filter((e) => String(e.module || "").toLowerCase().includes("admin"));
  const customerErrors = recentAuthErrors.filter((e) => String(e.module || "").toLowerCase().includes("customer"));

  const clientRealLogin = classifyRealLoginEvidence({ lastSignInIso: lastCustomerSignIn, recentAuthErrorCount: customerErrors.length, now });
  const adminRealLogin = classifyRealLoginEvidence({ lastSignInIso: lastAdminSignIn, recentAuthErrorCount: adminErrors.length, now });

  return {
    checkedAt: now.toISOString(),
    infrastructure: { status: infrastructure.status === "ok" ? "OK" : "FAIL", responseTimeMs: infrastructure.responseTimeMs, error: infrastructure.error },
    clientContract: { status: contract.client.status === "pass" ? "PASS" : "FAIL", checks: contract.client.checks },
    adminContract: { status: contract.admin.status === "pass" ? "PASS" : "FAIL", checks: contract.admin.checks, liveProbe: contract.admin.liveProbe },
    clientRealLogin,
    adminRealLogin,
  };
}
