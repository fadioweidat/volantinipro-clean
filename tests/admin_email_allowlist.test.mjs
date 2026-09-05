// TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com.
//
// Copertura dedicata per il nuovo allowlist: modulo condiviso frontend
// (adminAuthorization.js), blocco pre-invio nel form Login Admin, blocco
// AdminGuard post-sessione (locale, prima della RPC), e rafforzamento
// backend (jwt_is_admin()/gps_is_admin(), source of truth unica). Stessa
// infrastruttura di mock di tests/admin_guard_fail_closed.test.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { AdminGuard } from "../src/auth/guards/AdminGuard.jsx";
import { ADMIN_AUTHORIZED_EMAIL, isAuthorizedAdminEmail, normalizeEmail } from "../src/auth/adminAuthorization.js";
import { getSessionEmail } from "../src/auth/session.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeFakeJwt(email) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64url({ alg: "none" })}.${b64url({ email })}.signature`;
}

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function makeWindow() {
  return { location: { hash: "", search: "", pathname: "/admin" }, history: { pushState: () => {}, replaceState: () => {} } };
}

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

function mockFetchOnce(responder) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => responder(url, options);
  return { restore: () => { globalThis.fetch = prevFetch; } };
}

async function renderAdminGuard({ onNav = () => {} } = {}) {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(AdminGuard, { onNav }, React.createElement("div", null, "SECRET ADMIN CONTENT"))
    );
  });
  return renderer;
}

const adminGuardSource = readFileSync(new URL("../src/auth/guards/AdminGuard.jsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/migrations/20260905150000_admin_email_allowlist.sql", import.meta.url), "utf8");

// ── Modulo condiviso (Fase 5: case-insensitive) ────────────────────────────
test("adminAuthorization.js: isAuthorizedAdminEmail case-insensitive + trim, un'unica email autorizzata", () => {
  assert.equal(ADMIN_AUTHORIZED_EMAIL, "fenice.sp@gmail.com");
  assert.equal(isAuthorizedAdminEmail("fenice.sp@gmail.com"), true);
  assert.equal(isAuthorizedAdminEmail("FENICE.SP@GMAIL.COM"), true);
  assert.equal(isAuthorizedAdminEmail(" Fenice.Sp@gmail.com "), true);
  assert.equal(isAuthorizedAdminEmail("altraemail@gmail.com"), false);
  assert.equal(isAuthorizedAdminEmail(""), false);
  assert.equal(isAuthorizedAdminEmail(null), false);
  assert.equal(isAuthorizedAdminEmail(undefined), false);
  assert.equal(normalizeEmail("  Foo@Bar.com  "), "foo@bar.com");
});

// ── getSessionEmail: legge il claim 'email' dal JWT, fail-closed ──────────
test("session.js: getSessionEmail decodifica il claim email dal JWT, ritorna null su token malformato/assente", () => {
  assert.equal(getSessionEmail({ accessToken: makeFakeJwt("fenice.sp@gmail.com") }), "fenice.sp@gmail.com");
  assert.equal(getSessionEmail({ accessToken: makeFakeJwt("Altro@Esempio.com") }), "Altro@Esempio.com");
  assert.equal(getSessionEmail({ accessToken: "not-a-jwt" }), null);
  assert.equal(getSessionEmail({ accessToken: null }), null);
  assert.equal(getSessionEmail({}), null);
  assert.equal(getSessionEmail(null), null);
});

// ── TEST A/B — blocco pre-invio nel form Login Admin ───────────────────────
test("TEST A/B — sendMagicLink: contesto Admin blocca ogni email diversa da fenice.sp@gmail.com PRIMA di chiamare signInWithOtp", () => {
  const sendBlock = loginSource.slice(loginSource.indexOf("const sendMagicLink"), loginSource.indexOf("signInWithOtp"));
  assert.match(sendBlock, /const normalizedEmail = normalizeEmail\(email\);/);
  assert.match(sendBlock, /if \(isAdminContext && !isAuthorizedAdminEmail\(normalizedEmail\)\) \{/);
  assert.match(sendBlock, /Email non autorizzata per l'accesso amministratore\./);
  // Il blocco email deve venire PRIMA del check "!configured" (nessuna
  // richiesta di rete, nemmeno una validazione di configurazione, per
  // un'email non autorizzata in contesto Admin).
  const blockIdx = sendBlock.indexOf("isAuthorizedAdminEmail(normalizedEmail)");
  const configuredIdx = sendBlock.indexOf("!configured");
  assert.ok(blockIdx > 0 && configuredIdx > 0 && blockIdx < configuredIdx);
});

test("Login: email normalizzata (trim+lowercase) usata per TUTTI i contesti nella chiamata reale a signInWithOtp", () => {
  assert.match(loginSource, /signInWithOtp\(\{\s*\n\s*email: normalizedEmail,/);
});

// ── TEST C/E — AdminGuard: email autorizzata PASS, altra email BLOCKED ─────
test("TEST C — sessione valida fenice.sp@gmail.com + jwt_is_admin()=true => Dashboard Admin", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("fenice.sp@gmail.com"), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => true }));
  try {
    const renderer = await renderAdminGuard();
    assert.equal(renderer.toJSON().children[0], "SECRET ADMIN CONTENT");
  } finally {
    fetchMock.restore();
  }
});

test("TEST E — utente autenticato con ALTRA email (anche se jwt_is_admin()=true lato RPC) => BLOCKED, mai children Admin", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("altraemail@gmail.com"), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  let fetchCalled = false;
  const fetchMock = mockFetchOnce(async () => { fetchCalled = true; return { ok: true, json: async () => true }; });
  try {
    const renderer = await renderAdminGuard();
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /Accesso negato/);
    assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
    // Il controllo email e' locale e sincrono: blocca PRIMA di chiamare la
    // RPC jwt_is_admin(), anche se quella avrebbe risposto true (account
    // con profiles.role='admin' ma email diversa — esattamente il caso che
    // questo ticket deve chiudere).
    assert.equal(fetchCalled, false, "jwt_is_admin() non deve essere chiamata per un'email non autorizzata");
  } finally {
    fetchMock.restore();
  }
});

test("TEST E (case/trim) — email autorizzata scritta con maiuscole/spazi nel JWT viene comunque accettata", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt(" FENICE.SP@GMAIL.COM "), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => true }));
  try {
    const renderer = await renderAdminGuard();
    assert.equal(renderer.toJSON().children[0], "SECRET ADMIN CONTENT");
  } finally {
    fetchMock.restore();
  }
});

// ── TEST G — Cliente autenticato non può accedere /admin (invariato) ──────
test("TEST G — Cliente autenticato (email non fenice, jwt_is_admin()=false) => BLOCKED", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("cliente@esempio.it"), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => false }));
  try {
    const renderer = await renderAdminGuard();
    const text = JSON.stringify(renderer.toJSON());
    assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
  } finally {
    fetchMock.restore();
  }
});

// ── TEST H — Driver invariato (nessun riferimento ad AdminGuard/allowlist) ─
test("TEST H — Driver auth (token/assignment) non referenzia AdminGuard/adminAuthorization: percorso strutturalmente indipendente", () => {
  const driverFiles = [
    "src/pages/driver/DriverAssignmentPage.jsx",
    "src/hooks/useDriverAssignment.js",
  ];
  for (const rel of driverFiles) {
    const source = readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /AdminGuard|adminAuthorization|ADMIN_AUTHORIZED_EMAIL/, `${rel} non deve referenziare l'allowlist Admin`);
  }
});

// ── Fase 9 — outage Supabase resta distinto da "email non autorizzata" ────
test("FASE 9 — il controllo email e' sincrono/locale (nessun await prima), il timeout esistente resta SOLO su verifySupabaseAdminRole", () => {
  const effectBody = adminGuardSource.slice(adminGuardSource.indexOf(".then(async (restoredSession)"), adminGuardSource.indexOf(".catch((err)"));
  const emailCheckIdx = effectBody.indexOf("getSessionEmail(restoredSession)");
  const timeoutIdx = effectBody.indexOf("withTimeout(verifySupabaseAdminRole");
  assert.ok(emailCheckIdx > 0 && timeoutIdx > 0 && emailCheckIdx < timeoutIdx, "il controllo email deve avvenire PRIMA del timeout di rete, non deve consumarne il budget");
  assert.doesNotMatch(adminGuardSource, /withTimeout\(getSessionEmail/, "getSessionEmail non fa I/O, non deve mai essere avvolta in un timeout");
});

// ── Backend: source of truth unica, service_role bypass preservato ────────
test("BACKEND — is_authorized_admin_email() e' l'unica fonte di verita' email, richiamata sia da jwt_is_admin() sia da gps_is_admin()", () => {
  assert.match(migrationSource, /create or replace function public\.is_authorized_admin_email\(\)/);
  assert.match(migrationSource, /lower\(btrim\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)\) = 'fenice\.sp@gmail\.com'/);
  const jwtFn = migrationSource.slice(migrationSource.indexOf("function public.jwt_is_admin"), migrationSource.indexOf("function public.gps_is_admin"));
  const gpsFn = migrationSource.slice(migrationSource.indexOf("function public.gps_is_admin"));
  assert.match(jwtFn, /public\.is_authorized_admin_email\(\)/);
  assert.match(gpsFn, /public\.is_authorized_admin_email\(\)/);
  // service_role resta un bypass legittimo in ENTRAMBE (Edge Function
  // server-side, mai dal browser) — invariato rispetto a prima del ticket.
  assert.match(jwtFn, /auth\.role\(\) = 'service_role'/);
  assert.match(gpsFn, /auth\.role\(\) = 'service_role'/);
});

test("BACKEND — un ruolo admin (profiles.role='admin' o claim JWT) SENZA l'email autorizzata non basta piu' (AND, non OR)", () => {
  const jwtFn = migrationSource.slice(migrationSource.indexOf("function public.jwt_is_admin"), migrationSource.indexOf("function public.gps_is_admin"));
  assert.match(jwtFn, /\)\s*\n\s*and public\.is_authorized_admin_email\(\)\s*\n\s*\);/);
  const gpsFn = migrationSource.slice(migrationSource.indexOf("function public.gps_is_admin"));
  assert.match(gpsFn, /\)\s*\n\s*and public\.is_authorized_admin_email\(\)\s*\n\s*\);/);
});

test("DO NOT TOUCH — la migration non tocca GPS/coverage/Driver App/messaging/segnalazioni/pricing/Payments/Marketplace/SEO/Step1-4", () => {
  assert.doesNotMatch(migrationSource, /gps_tracking_points|delivery_sessions|calculate_campaign_final_coverage|campaign_coverage_adjustments|customer_issues|conversation_messages|campaign_modification_requests|total_amount|estimated_price|payment_status/i);
  const defs = migrationSource.match(/create or replace function public\.\w+/g) || [];
  assert.equal(defs.length, 3, "la migration deve toccare solo le 3 funzioni: is_authorized_admin_email, jwt_is_admin, gps_is_admin");
});
