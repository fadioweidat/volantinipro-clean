// FASE Centro Controllo — Login health check reale.
// Convenzioni riusate da tests/auth_login_admin_guard.test.mjs:
// withSupabaseConfig (env via process.env, ripristinato in t.after),
// mockFetchOnce (intercetta globalThis.fetch, restore esplicito).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkAuthInfrastructure,
  checkAuthContract,
  classifyRealLoginEvidence,
  computeAuthHealth,
} from "../src/lib/monitoring/authHealth.js";
import { resolveAppRoute } from "../src/app/routeResolution.js";

function withSupabaseConfig(t) {
  const prevUrl = process.env.VITE_SUPABASE_URL;
  const prevKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
  t.after(() => {
    process.env.VITE_SUPABASE_URL = prevUrl;
    process.env.VITE_SUPABASE_ANON_KEY = prevKey;
  });
}

function mockFetch(t, responder) {
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return responder(String(url), options);
  };
  t.after(() => {
    globalThis.fetch = prevFetch;
  });
  return calls;
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

const authHealthSource = readFileSync(new URL("../src/lib/monitoring/authHealth.js", import.meta.url), "utf8");

// 1. Auth endpoint reachable => infrastructure OK
test("1. checkAuthInfrastructure(): endpoint Auth raggiungibile (200) => status OK", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => {
    assert.match(url, /\/auth\/v1\/health$/);
    return jsonResponse({}, { ok: true, status: 200 });
  });
  const result = await checkAuthInfrastructure();
  assert.equal(result.status, "ok");
  assert.equal(result.error, null);
});

// 2. Auth network failure => infrastructure FAIL
test("2. checkAuthInfrastructure(): eccezione di rete => status error (mai finto OK)", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, () => {
    throw new Error("network down");
  });
  const result = await checkAuthInfrastructure();
  assert.equal(result.status, "error");
  assert.match(result.error, /network down/);
});

test("2b. computeAuthHealth(): infrastructure FAIL viene mappato esattamente su 'FAIL'", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => {
    if (url.includes("/auth/v1/health")) throw new Error("network down");
    return jsonResponse(false, { ok: true, status: 200 });
  });
  const result = await computeAuthHealth({});
  assert.equal(result.infrastructure.status, "FAIL");
});

// 3. cliente senza sessione => redirect login corretto (contratto deterministico)
test("3. checkAuthContract(): resolveAppRoute('/dashboard' senza sessione valida) instrada su 'dashboard', '/login'/'/auth/callback' instradano su 'login'", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(false) : jsonResponse({})));
  const contract = await checkAuthContract();
  const loginCases = contract.client.checks.filter((c) => c.label?.includes("/login") || c.label?.includes("/auth/callback"));
  assert.ok(loginCases.length >= 2);
  assert.ok(loginCases.every((c) => c.pass));
});

// 4. admin senza sessione => redirect login corretto
test("4. checkAuthContract(): sessione assente/scaduta e' sempre non valida (invariante riusato sia da Cliente che da Admin)", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(false) : jsonResponse({})));
  const contract = await checkAuthContract();
  const sessionCases = contract.admin.checks.filter((c) => c.label?.includes("sessione"));
  assert.ok(sessionCases.length >= 2);
  assert.ok(sessionCases.every((c) => c.pass));
});

// 5. cliente autenticato non-admin => mai admin
test("5. probeAdminRoleFailsClosedLive (via checkAuthContract): un token non valido non diventa mai admin", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(false) : jsonResponse({})));
  const contract = await checkAuthContract();
  assert.equal(contract.admin.liveProbe.status, "ok");
  assert.equal(contract.admin.status, "pass");
});

test("5b. Se jwt_is_admin rispondesse true per un token inventato, la sonda lo rileva come fail-open (status error)", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(true) : jsonResponse({})));
  const contract = await checkAuthContract();
  assert.equal(contract.admin.liveProbe.status, "error");
  assert.match(contract.admin.liveProbe.error, /fail-open/);
  assert.equal(contract.admin.status, "fail");
});

// 6. admin verificato => route admin
test("6. resolveAppRoute: le route /admin risolvono sempre su 'admin' (o una sotto-pagina admin nota)", () => {
  assert.equal(resolveAppRoute("/admin"), "admin");
  assert.equal(resolveAppRoute("/admin/dashboard"), "admin");
  assert.equal(resolveAppRoute("/admin/status"), "admin-status");
});

// 7. sessione scaduta => fail closed
test("7. checkAuthContract(): il caso 'sessione scaduta => non valida' e' incluso e supera l'assert (fail closed)", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(false) : jsonResponse({})));
  const contract = await checkAuthContract();
  const expired = contract.client.checks.find((c) => c.label === "sessione scaduta => non valida");
  assert.ok(expired);
  assert.equal(expired.actual, false);
  assert.equal(expired.pass, true);
});

// 8. callback auth malformed => errore gestito (mai un instradamento diverso da 'login')
test("8. resolveAppRoute('/auth/callback', {hasAuthHash:true}) instrada sempre su 'login', anche con un hash malformato/di errore", () => {
  assert.equal(resolveAppRoute("/auth/callback", { hasAuthHash: true }), "login");
  assert.equal(resolveAppRoute("/auth/callback", {}), "login");
});

// 9. nessun login reale recente => WARNING (NO_RECENT_EVIDENCE), mai PASS
test("9. classifyRealLoginEvidence(): nessun last_sign_in_at e nessun errore => NO_RECENT_EVIDENCE, mai OK_RECENT", () => {
  const result = classifyRealLoginEvidence({ lastSignInIso: null, recentAuthErrorCount: 0, now: new Date("2026-08-27T12:00:00Z") });
  assert.equal(result.status, "NO_RECENT_EVIDENCE");
});

// 10. login cliente recente reale => OK_RECENT
test("10. classifyRealLoginEvidence(): last_sign_in_at 10 minuti fa => OK_RECENT", () => {
  const now = new Date("2026-08-27T12:00:00Z");
  const result = classifyRealLoginEvidence({ lastSignInIso: new Date(now.getTime() - 10 * 60000).toISOString(), recentAuthErrorCount: 0, now });
  assert.equal(result.status, "OK_RECENT");
});

// 11. login admin recente reale => OK_RECENT (stessa funzione pura, riusata identica per Admin)
test("11. classifyRealLoginEvidence(): usata identicamente per Admin, last_sign_in_at 2 ore fa (dentro le 24h) => OK_RECENT", () => {
  const now = new Date("2026-08-27T12:00:00Z");
  const result = classifyRealLoginEvidence({ lastSignInIso: new Date(now.getTime() - 2 * 3600000).toISOString(), recentAuthErrorCount: 0, now });
  assert.equal(result.status, "OK_RECENT");
});

// 12. errore auth recente => ERROR_RECENT
test("12. classifyRealLoginEvidence(): errori auth recenti presenti => ERROR_RECENT, anche con un last_sign_in_at recente", () => {
  const now = new Date("2026-08-27T12:00:00Z");
  const result = classifyRealLoginEvidence({ lastSignInIso: new Date(now.getTime() - 5 * 60000).toISOString(), recentAuthErrorCount: 2, now });
  assert.equal(result.status, "ERROR_RECENT");
});

test("12b. computeAuthHealth(): un error_log 'auth' con module contenente 'admin' nelle ultime 24h classifica adminRealLogin come ERROR_RECENT", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(false) : jsonResponse({})));
  const now = new Date("2026-08-27T12:00:00Z");
  const result = await computeAuthHealth({
    lastAdminSignIn: new Date(now.getTime() - 60000).toISOString(),
    errorLogRows: [{ category: "auth", module: "login_admin", created_at: new Date(now.getTime() - 60000).toISOString() }],
    now,
  });
  assert.equal(result.adminRealLogin.status, "ERROR_RECENT");
});

// 13. PII non inclusa nel report
test("13. Il report tecnico (authHealth serializzato) contiene solo stringhe di stato, nessun campo PII", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(false) : jsonResponse({})));
  const { buildPlatformStatusReport } = await import("../src/lib/monitoring/platformReport.js");
  const authHealth = await computeAuthHealth({});
  const report = buildPlatformStatusReport({ authHealth });
  const serialized = JSON.stringify(report.authHealth);
  assert.doesNotMatch(serialized, /@/); // nessun indirizzo email
  assert.deepEqual(Object.keys(report.authHealth).sort(), ["adminContract", "adminRealLogin", "clientContract", "clientRealLogin", "infrastructure"]);
  for (const value of Object.values(report.authHealth)) {
    assert.equal(typeof value, "string");
  }
});

// 14. token non incluso nel report
test("14. Nessun token/bearer/JWT compare nel report ne' nel messaggio di errore della sonda live, anche quando la sonda fallisce", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => (url.includes("jwt_is_admin") ? jsonResponse(true) : jsonResponse({})));
  const { buildPlatformStatusReport } = await import("../src/lib/monitoring/platformReport.js");
  const authHealth = await computeAuthHealth({});
  assert.doesNotMatch(authHealth.adminContract.liveProbe.error, /health-check-invalid-token-\d+/);
  assert.doesNotMatch(authHealth.adminContract.liveProbe.error, /bearer/i);
  const report = buildPlatformStatusReport({ authHealth });
  assert.doesNotMatch(JSON.stringify(report.authHealth), /token/i);
});

// 15. health check non invia email/magic-link
test("15. authHealth.js non chiama mai signInWithOtp/sendMagicLink/inviaEmail: nessun invio email durante il check", () => {
  // Cerca solo forme di INVOCAZIONE reale (nome seguito da parentesi aperta),
  // non un commento che spiega perche' il modulo NON deve mai farlo.
  assert.doesNotMatch(authHealthSource, /signInWithOtp\s*\(/);
  assert.doesNotMatch(authHealthSource, /send-email\w*\s*\(/i);
  assert.doesNotMatch(authHealthSource, /sendMagicLink\s*\(/i);
});

// 16. health check non crea utenti
test("16. authHealth.js non chiama mai signUp/admin.createUser/inviteUserByEmail: nessun utente creato durante il check", () => {
  assert.doesNotMatch(authHealthSource, /signUp/);
  assert.doesNotMatch(authHealthSource, /createUser/);
  assert.doesNotMatch(authHealthSource, /inviteUserByEmail/);
  assert.doesNotMatch(authHealthSource, /service_role/i);
});

// 17. Centro Controllo non confonde Auth infrastructure con login business flow
test("17. computeAuthHealth() distingue i 5 segnali e li calcola in modo indipendente: infrastructure FAIL non forza contract/evidence a FAIL", async (t) => {
  withSupabaseConfig(t);
  mockFetch(t, (url) => {
    if (url.includes("/auth/v1/health")) throw new Error("network down");
    if (url.includes("jwt_is_admin")) return jsonResponse(false);
    return jsonResponse({});
  });
  const now = new Date("2026-08-27T12:00:00Z");
  const result = await computeAuthHealth({ lastAdminSignIn: new Date(now.getTime() - 60000).toISOString(), now });
  assert.equal(result.infrastructure.status, "FAIL");
  // Il contratto e' un invariante di codice indipendente dalla rete Auth
  // health-endpoint (usa un RPC diverso, jwt_is_admin): resta PASS.
  assert.equal(result.adminContract.status, "PASS");
  // L'evidenza reale (last_sign_in_at) e' un segnale a se': resta OK_RECENT
  // anche se l'infrastruttura ha fallito in QUESTO istante.
  assert.equal(result.adminRealLogin.status, "OK_RECENT");
  assert.deepEqual(Object.keys(result).sort(), ["adminContract", "adminRealLogin", "checkedAt", "clientContract", "clientRealLogin", "infrastructure"]);
});
