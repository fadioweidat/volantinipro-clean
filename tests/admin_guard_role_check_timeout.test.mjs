// TICKET — FIX ADMIN PAGE STUCK ON "VERIFICA RUOLO ADMIN IN CORSO...".
//
// ROOT CAUSE reale: restoreSupabaseSession()/verifySupabaseAdminRole()
// venivano solo await-ati senza alcun timeout in AdminGuard.jsx. Se una
// delle due richieste di rete restava sospesa (visto dal vivo durante un
// incidente Supabase: 504/errori JWT intermittenti), roleStatus restava
// "checking" per sempre — MAI un errore, MAI un modo per uscire dallo
// spinner. Fix: withTimeout() + nuovo stato "error" con pulsante "Riprova".
//
// Stessa infrastruttura di mock di tests/admin_guard_fail_closed.test.mjs
// (non duplicata: stesse funzioni helper riscritte qui per isolare i test
// dei timer finti, che richiedono un setup diverso — enable/tick/reset).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { AdminGuard } from "../src/auth/guards/AdminGuard.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  return {
    location: { hash: "", search: "", pathname: "/admin" },
    history: { pushState: () => {}, replaceState: () => {} },
  };
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

const adminGuardSource = readFileSync(new URL("../src/auth/guards/AdminGuard.jsx", import.meta.url), "utf8");

// TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com: AdminGuard ora
// legge il claim 'email' dal JWT PRIMA di chiamare jwt_is_admin(). Serve un
// token con l'email autorizzata perche' questo test eserciti davvero il
// timeout su verifySupabaseAdminRole, non il nuovo blocco email (che ha la
// propria copertura in tests/admin_email_allowlist.test.mjs).
function makeFakeJwt(email) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64url({ alg: "none" })}.${b64url({ email })}.signature`;
}

test("STATICO — withTimeout() esiste, timeout ragionevole, mai roleStatus bloccato su 'checking'", () => {
  assert.match(adminGuardSource, /const ADMIN_ROLE_CHECK_TIMEOUT_MS = 15000;/);
  assert.match(adminGuardSource, /function withTimeout\(promise, ms\)/);
  assert.match(adminGuardSource, /withTimeout\(restoreSupabaseSession\(\), ADMIN_ROLE_CHECK_TIMEOUT_MS\)/);
  assert.match(adminGuardSource, /withTimeout\(verifySupabaseAdminRole\(restoredSession\), ADMIN_ROLE_CHECK_TIMEOUT_MS\)/);
  assert.match(adminGuardSource, /setRoleStatus\("error"\)/);
  // Il timeout non deve MAI concedere l'accesso: nessun ramo imposta
  // roleStatus="admin" nel .catch().
  const catchBlock = adminGuardSource.slice(adminGuardSource.indexOf(".catch((err)"), adminGuardSource.indexOf(".catch((err)") + 500);
  assert.doesNotMatch(catchBlock, /setRoleStatus\("admin"\)/);
});

test("RUNTIME — verifySupabaseAdminRole che non risponde entro il timeout => pannello errore + 'Riprova', mai spinner infinito", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("fenice.sp@gmail.com"), expiresAt: String(future) }));
  globalThis.window = makeWindow();

  const prevFetch = globalThis.fetch;
  let fetchCalls = 0;
  // fetch che non risolve MAI (simula il gateway/JWT hang visto dal vivo):
  // ogni chiamata resta pendente per sempre, esattamente lo scenario reale.
  globalThis.fetch = async () => { fetchCalls += 1; return new Promise(() => {}); };

  t.mock.timers.enable({ apis: ["setTimeout"] });
  let renderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AdminGuard, { onNav: () => {} }, React.createElement("div", null, "SECRET ADMIN CONTENT"))
      );
    });

    // Subito dopo il mount: ancora "checking", mai bloccato prima del timeout.
    let text = JSON.stringify(renderer.toJSON());
    assert.match(text, /Verifica ruolo Admin in corso/);

    // Avanza oltre ADMIN_ROLE_CHECK_TIMEOUT_MS (15000ms).
    await act(async () => {
      t.mock.timers.tick(16000);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    text = JSON.stringify(renderer.toJSON());
    assert.match(text, /Impossibile verificare l'accesso Admin\. Riprova\./);
    assert.doesNotMatch(text, /Verifica ruolo Admin in corso/);
    assert.doesNotMatch(text, /SECRET ADMIN CONTENT/, "un timeout non deve MAI concedere l'accesso Admin");

    const callsBeforeRetry = fetchCalls;

    // Click "Riprova": deve ritentare la verifica (nuova chiamata fetch),
    // non restare bloccato sullo stesso errore per sempre.
    const buttons = renderer.root.findAllByType("button");
    await act(async () => {
      buttons[0].props.onClick();
    });
    assert.ok(fetchCalls > callsBeforeRetry, "Riprova deve ritentare la verifica del ruolo Admin");

    text = JSON.stringify(renderer.toJSON());
    assert.match(text, /Verifica ruolo Admin in corso/, "dopo Riprova torna a 'checking', non resta sull'errore precedente");
  } finally {
    t.mock.timers.reset();
    globalThis.fetch = prevFetch;
  }
});
