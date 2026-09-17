// TICKET — MASTER PERFORMANCE & LATENCY: "Invio in corso..." stuck forever.
//
// Root cause: LoginPage's sendMagicLink() awaited authSupabase.auth.signInWithOtp()
// directly. The SDK client (src/supabaseClient.js) has no fetch timeout
// configured, so when GoTrue is slow/unresponsive (documented production
// 504s on the Auth gateway), the call never resolves nor rejects — the
// `finally` that clears `busy`/otpRequestInFlight never runs, and the button
// is stuck on "Invio in corso..." with no way to retry.
//
// Fix: same withTimeout(promise, ms) pattern already used in
// src/auth/guards/AdminGuard.jsx, wrapping ONLY this one call (no change to
// the shared SDK client config, no change to auth/security semantics).
//
// Convention: source-text/contract, same as tests/auth_error_logging.test.mjs
// (volantinipro-final.jsx is a monolith not importable in isolation under
// node:test).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");

const loginPageStart = SRC.indexOf("export function LoginPage({");
const loginPageEnd = SRC.indexOf("export function DashboardPage(", loginPageStart);
assert.ok(loginPageStart > 0 && loginPageEnd > loginPageStart, "impossibile isolare LoginPage");
const loginPageFn = SRC.slice(loginPageStart, loginPageEnd);

test("esiste un withTimeout riusabile con lo stesso pattern di AdminGuard (Promise.race + clearTimeout in finally)", () => {
  assert.match(SRC, /function withTimeout\(promise, ms, timeoutMessage\) \{/);
  const fn = SRC.slice(SRC.indexOf("function withTimeout(promise, ms, timeoutMessage) {"), SRC.indexOf("function withTimeout(promise, ms, timeoutMessage) {") + 400);
  assert.match(fn, /Promise\.race\(\[promise, timeout\]\)\.finally\(\(\) => clearTimeout\(timer\)\)/);
});

test("signInWithOtp e' avvolta da withTimeout con un limite finito (MAGIC_LINK_REQUEST_TIMEOUT_MS)", () => {
  assert.match(SRC, /const MAGIC_LINK_REQUEST_TIMEOUT_MS = \d+;/);
  const value = Number(SRC.match(/const MAGIC_LINK_REQUEST_TIMEOUT_MS = (\d+);/)[1]);
  assert.ok(value >= 5000 && value <= 30000, "il timeout deve essere ragionevole: non troppo aggressivo, non infinito");
  assert.match(loginPageFn, /await withTimeout\(\s*authSupabase\.auth\.signInWithOtp\(\{/);
  assert.match(loginPageFn, /MAGIC_LINK_REQUEST_TIMEOUT_MS,\s*\n\s*"magic_link_timeout"/);
});

test("il timeout produce un messaggio italiano parlabile, distinto dall'errore SDK generico", () => {
  const catchBlock = loginPageFn.match(/\} catch \(err\) \{[\s\S]*?\} finally \{/);
  assert.ok(catchBlock);
  assert.match(catchBlock[0], /if \(err\.message === "magic_link_timeout"\) \{/);
  assert.match(catchBlock[0], /La richiesta al server ha impiegato troppo tempo\. Riprova\./);
});

test("finally continua a ripulire SEMPRE busy e otpRequestInFlight, anche sul ramo timeout (nessun click bloccato per sempre)", () => {
  const fnStart = loginPageFn.indexOf("const sendMagicLink");
  const finallyBlock = loginPageFn.slice(fnStart).match(/\} finally \{[\s\S]*?\n {4}\}/);
  assert.ok(finallyBlock, "blocco finally non trovato");
  assert.match(finallyBlock[0], /otpRequestInFlight\.current = false;/);
  assert.match(finallyBlock[0], /setBusy\(false\);/);
});

test("nessuna chiamata extra introdotta: un click resta esattamente una chiamata signInWithOtp (guard sincrono invariato)", () => {
  const matches = loginPageFn.match(/signInWithOtp\(/g) || [];
  assert.equal(matches.length, 1, "signInWithOtp deve essere chiamata una sola volta nel percorso di invio");
  assert.match(loginPageFn, /if \(otpRequestInFlight\.current\) return;/);
});
