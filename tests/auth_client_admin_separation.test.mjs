// BUG CRITICO AUTH — separazione definitiva Cliente / Admin.
//
// Sintomo in produzione: un login avviato dal flusso CLIENTE atterrava nella
// Dashboard Admin quando l'account aveva profiles.role === "admin". Causa: la
// callback del magic link (volantinipro-final.jsx) e l'effetto "auth-landing"
// (src/app/AppRouter.jsx) instradavano a /admin sulla SOLA base del ruolo
// backend, ignorando l'INTENTO del login.
//
// Regola non negoziabile verificata qui:
//   - intento Cliente  -> SEMPRE /dashboard, anche se role === admin
//   - intento Admin + role === admin -> /admin
//   - intento Admin + role !== admin -> /dashboard (nessun privilegio)
//   - il ruolo admin resta verificato SOLO dal backend (RPC jwt_is_admin)
//
// volantinipro-final.jsx dipende da import.meta.env e non e' eseguibile sotto
// `node --test` puro: il contratto della callback si verifica sul sorgente
// (stesso approccio di tests/auth_login_admin_guard.test.mjs / magic_link_redirect).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AdminGuard } from "../src/auth/guards/AdminGuard.jsx";

const FINAL_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const APPROUTER_SRC = readFileSync(new URL("../src/app/AppRouter.jsx", import.meta.url), "utf8");
const SESSION_SRC = readFileSync(new URL("../src/auth/session.js", import.meta.url), "utf8");

const loginBlock = FINAL_SRC.slice(
  FINAL_SRC.indexOf("export function LoginPage"),
  FINAL_SRC.indexOf("export function DashboardPage"),
);

// ---------------------------------------------------------------------------
// 1. Callback magic link — intento + ruolo, non solo ruolo
// ---------------------------------------------------------------------------

test("callback: /admin scatta SOLO con intento Admin E ruolo Admin verificato dal backend", () => {
  // l'intento e' catturato prima di pulire il context ricordato
  assert.match(loginBlock, /const loginIntentIsAdmin = isAdminContext;/);
  const intentIdx = loginBlock.indexOf("const loginIntentIsAdmin = isAdminContext;");
  const clearIdx = loginBlock.indexOf("clearPendingAuthContext()", intentIdx);
  assert.ok(intentIdx >= 0 && clearIdx > intentIdx, "intento catturato prima di clearPendingAuthContext");

  // il ruolo viene dal backend (RPC), mai dedotto lato client
  assert.match(loginBlock, /verifySupabaseAdminRole\(restoredSession\)/);

  // il redirect a /admin richiede ENTRAMBI: ruolo backend + intento Admin
  assert.match(loginBlock, /if \(isAdmin && loginIntentIsAdmin\) \{\s*\n\s*onNav\("admin"\);/);

  // la vecchia condizione "solo ruolo" non esiste piu'
  assert.doesNotMatch(loginBlock, /if \(isAdmin\) \{\s*\n\s*onNav\("admin"\);/);
});

test("callback: intento Cliente (o mancante) atterra su dashboard/step4, mai su /admin", () => {
  // ramo non-admin: sempre dashboard (o ritorno a Step4 se richiesto da Step4)
  assert.match(loginBlock, /onNav\(pendingReturnToStep4 \? "step4" : "dashboard"\);/);
  // l'unico onNav("admin") della callback e' quello gated da loginIntentIsAdmin
  const adminNavs = loginBlock.match(/onNav\("admin"\)/g) || [];
  // due totali nel LoginPage: (a) callback gated, (b) restore sessione admin-context
  assert.ok(adminNavs.length === 2, `attesi 2 onNav("admin") nel LoginPage, trovati ${adminNavs.length}`);
  // il primo (callback) e' preceduto dal gate sull'intento
  const gateIdx = loginBlock.indexOf("if (isAdmin && loginIntentIsAdmin)");
  const firstAdminNav = loginBlock.indexOf('onNav("admin")');
  assert.ok(gateIdx >= 0 && firstAdminNav > gateIdx);
});

test("callback: il secondo ramo onNav('admin') resta nel contesto Admin esplicito", () => {
  // restoreSupabaseSession() (no-arg) -> verify -> onNav("admin") solo quando
  // isAdminContext && configured (Admin gia' loggato che riapre /login?context=admin)
  const restoreIdx = loginBlock.indexOf("restoreSupabaseSession().then");
  assert.ok(restoreIdx >= 0);
  const ctxGuard = loginBlock.lastIndexOf("isAdminContext && configured", restoreIdx);
  assert.ok(ctxGuard >= 0 && ctxGuard < restoreIdx, "il ramo restore e' dentro isAdminContext && configured");
});



// ---------------------------------------------------------------------------
// 3. Ruolo admin sempre e solo dal backend (fail-closed) — invariato
// ---------------------------------------------------------------------------

test("verifySupabaseAdminRole: unica fonte di verita' del ruolo, fail-closed", () => {
  assert.match(SESSION_SRC, /rpc\/jwt_is_admin/);
  assert.match(SESSION_SRC, /if \(!res\.ok\) return false;/);
  assert.match(SESSION_SRC, /return result === true;/);
  // nessuna deduzione del ruolo da email / storage / query nel modulo sessione
  assert.doesNotMatch(SESSION_SRC, /role\s*===?\s*["']admin["']\s*\?\s*true/);
});

// ---------------------------------------------------------------------------
// 4. AdminGuard — un non-admin autenticato NON entra mai in /admin
// ---------------------------------------------------------------------------

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

test("AdminGuard: sessione valida ma jwt_is_admin()=false -> nessun contenuto Admin", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const prevWindow = globalThis.window;
  const prevLocalStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem(
    "vp_supabase_session",
    JSON.stringify({ accessToken: "client-token", expiresAt: String(future) }),
  );
  globalThis.window = {
    location: { hash: "", search: "", pathname: "/admin" },
    history: { pushState: () => {}, replaceState: () => {} },
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => false }); // jwt_is_admin -> false

  const navCalls = [];
  try {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AdminGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement("div", null, "SECRET ADMIN CONTENT"),
        ),
      );
    });
    const json = renderer.toJSON();
    const text = JSON.stringify(json);
    assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
    assert.match(text, /Accesso negato/);
  } finally {
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
    if (prevLocalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevLocalStorage;
    if (prevFetch === undefined) delete globalThis.fetch; else globalThis.fetch = prevFetch;
  }
});
