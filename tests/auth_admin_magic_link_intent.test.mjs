// Bug: il Magic Link Admin autentica ma atterra nella dashboard Cliente.
//
// Causa: l'intento Admin viveva solo in localStorage (vp_pending_auth_context),
// che esiste solo nel browser che ha RICHIESTO il link. Il redirect_to era
// "/auth/callback" senza ?context=admin, quindi un link aperto su un altro
// browser/dispositivo (telefono) perdeva l'intento e, per la regola
// "il ruolo autorizza, l'intento instrada" (f6d102f), finiva su /dashboard.
//
// Fix: l'intento viaggia nel redirect_to (?context=admin, valore fisso). Non
// concede privilegi: /admin richiede sempre jwt_is_admin() verificato dal backend.
//
// Nessuna rete: solo funzioni pure, window/localStorage finti e sorgenti.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildAuthCallbackPath,
  resolveLoginContext,
} from "../src/auth/loginIntent.js";
import {
  consumeSupabaseAuthHash,
  hasSupabaseAuthHashError,
  parseSupabaseAuthHashError,
  readPendingAuthContext,
  rememberPendingAuthContext,
} from "../src/auth/session.js";

const FINAL_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const APPROUTER_SRC = readFileSync(new URL("../src/app/AppRouter.jsx", import.meta.url), "utf8");
const loginBlock = FINAL_SRC.slice(
  FINAL_SRC.indexOf("export function LoginPage"),
  FINAL_SRC.indexOf("export function DashboardPage"),
);

function installFakeWindow(url) {
  const u = new URL(url);
  const store = new Map();
  const fake = {
    location: { pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    history: {
      replaceState: (_s, _t, path) => {
        const next = new URL(path, u.origin);
        fake.location.pathname = next.pathname;
        fake.location.search = next.search;
        fake.location.hash = next.hash;
      },
    },
  };
  globalThis.window = fake;
  globalThis.localStorage = fake.localStorage;
  return fake;
}
test.afterEach(() => { delete globalThis.window; delete globalThis.localStorage; });

// Ricostruisce cio' che AppRouter legge dalla pagina di callback.
function contextSeenByCallback(callbackUrl, { pending = null } = {}) {
  const win = installFakeWindow(callbackUrl);
  if (pending) rememberPendingAuthContext(pending);
  const queryContext = new URLSearchParams(win.location.search).get("context");
  return resolveLoginContext({ queryContext, pendingContext: readPendingAuthContext() });
}

// La decisione /admin della callback, letta dal sorgente reale di LoginPage:
// deve essere esattamente "ruolo verificato dal backend E intento Admin".
const ADMIN_GATE = /if \(isAdmin && loginIntentIsAdmin\) \{\s*onNav\("admin"\);/;
function callbackGoesToAdmin({ isAdminRole, loginContext }) {
  assert.match(loginBlock, ADMIN_GATE, "gate di callback modificato");
  return isAdminRole === true && loginContext === "admin";
}

const HASH = "#access_token=tok&refresh_token=ref&expires_at=9999999999&token_type=bearer";

// --- il link generato porta l'intento -------------------------------------

test("F: il redirect del link Admin porta ?context=admin, Cliente/altri restano invariati", () => {
  assert.equal(buildAuthCallbackPath("admin"), "/auth/callback?context=admin");
  for (const other of ["customer", "driver", "supplier", undefined, null, "", "ADMIN", "admin ", "x&y", "//evil.example", "https://evil.example"]) {
    assert.equal(buildAuthCallbackPath(other), "/auth/callback", `context ${JSON.stringify(other)}`);
  }
});

test("F: LoginPage costruisce emailRedirectTo con buildAuthCallbackPath(context), non con un path fisso", () => {
  assert.match(loginBlock, /emailRedirectTo:\s*`\$\{getAuthRedirectBase\(\)\}\$\{buildAuthCallbackPath\(context\)\}`/);
  assert.match(FINAL_SRC, /import\s*\{\s*buildAuthCallbackPath\s*\}\s*from\s*["']\.\/src\/auth\/loginIntent\.js["']/);
});

// --- A: link Admin valido -> Admin ----------------------------------------

test("A: link Admin aperto in un ALTRO browser (nessun localStorage) atterra su Admin", () => {
  const link = `https://www.volantinipro.it${buildAuthCallbackPath("admin")}${HASH}`;
  const ctx = contextSeenByCallback(link, { pending: null });
  assert.equal(ctx, "admin");
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: ctx }), true);
});

test("A: link Admin aperto nello stesso browser (localStorage) atterra su Admin", () => {
  const ctx = contextSeenByCallback(`https://www.volantinipro.it/auth/callback${HASH}`, { pending: "admin" });
  assert.equal(ctx, "admin");
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: ctx }), true);
});

// --- B: link Cliente -> dashboard cliente ----------------------------------

test("B: link Cliente -> dashboard, anche se l'account e' admin (regola f6d102f invariata)", () => {
  const ctx = contextSeenByCallback(`https://www.volantinipro.it${buildAuthCallbackPath("customer")}${HASH}`);
  assert.equal(ctx, "customer");
  assert.equal(callbackGoesToAdmin({ isAdminRole: false, loginContext: ctx }), false);
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: ctx }), false);
  assert.match(loginBlock, /onNav\(pendingReturnToStep4 \? "step4" : "dashboard"\);/);
});

// --- C: non-admin + context=admin forgiato ---------------------------------

test("C: account non-admin con ?context=admin forgiato NON raggiunge Admin", () => {
  const ctx = contextSeenByCallback(`https://www.volantinipro.it/auth/callback?context=admin${HASH}`);
  assert.equal(ctx, "admin", "il context e' solo intento");
  for (const isAdminRole of [false, undefined, null, "true", 1, {}]) {
    assert.equal(
      callbackGoesToAdmin({ isAdminRole, loginContext: ctx }),
      false,
      `isAdminRole=${JSON.stringify(isAdminRole)} non deve dare Admin`,
    );
  }
});

test("C: /admin resta raggiungibile solo dopo verifySupabaseAdminRole (nessuna decisione dal solo context)", () => {
  const call = loginBlock.search(ADMIN_GATE);
  const verify = loginBlock.indexOf("await verifySupabaseAdminRole(restoredSession)");
  assert.ok(verify > 0 && call > verify, "il ruolo va verificato prima di decidere la destinazione");
  // l'unico onNav("admin") del ramo callback con hash e' quello dietro ruolo+intento
  const callbackBranch = loginBlock.slice(loginBlock.indexOf('includes("access_token")'), loginBlock.indexOf("const hashError"));
  assert.equal((callbackBranch.match(/onNav\("admin"\)/g) || []).length, 1);
});

// --- D: context mancante -> comportamento esistente -------------------------

test("D: senza context ne' localStorage -> Cliente; con localStorage o query si comporta come prima", () => {
  assert.equal(resolveLoginContext({}), "customer");
  assert.equal(resolveLoginContext(), "customer");
  assert.equal(resolveLoginContext({ pendingContext: "admin" }), "admin");
  assert.equal(resolveLoginContext({ pendingContext: "driver" }), "driver");
  assert.equal(resolveLoginContext({ pendingContext: "supplier" }), "supplier");
  assert.equal(resolveLoginContext({ pendingContext: "customer" }), "customer");
  assert.equal(resolveLoginContext({ queryContext: "supplier" }), "supplier");
  assert.equal(resolveLoginContext({ queryContext: "customer", pendingContext: "admin" }), "customer");
  assert.equal(resolveLoginContext({ queryContext: "admin", pendingContext: "driver" }), "admin");
  assert.equal(resolveLoginContext({ queryContext: "root", pendingContext: "root" }), "customer");
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: "customer" }), false);
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: "supplier" }), false);
  assert.match(loginBlock, /if \(loginIntentIsSupplier\) \{\s*onNav\("supplier-dashboard"\);/);
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: "admin" }), true);
});

test("D: AppRouter usa resolveLoginContext (unica fonte dell'intento)", () => {
  assert.match(APPROUTER_SRC, /resolveLoginContext\(\{\s*queryContext,\s*pendingContext: pendingAuthContext\s*\}\)/);
  assert.match(APPROUTER_SRC, /from\s*["']\.\.\/auth\/loginIntent\.js["']/);
});

// --- E: callback non valido / senza sessione --------------------------------

test("E: callback scaduto/errore o senza token non crea sessione e non porta a Admin", () => {
  const win = installFakeWindow("https://www.volantinipro.it/auth/callback?context=admin#error=access_denied&error_code=otp_expired&error_description=expired");
  assert.equal(hasSupabaseAuthHashError(), true);
  assert.ok(parseSupabaseAuthHashError());
  assert.equal(consumeSupabaseAuthHash("/auth/callback"), null);
  assert.equal(win.localStorage.getItem("vp_supabase_session"), null, "nessuna sessione salvata");

  installFakeWindow("https://www.volantinipro.it/auth/callback?context=admin");
  assert.equal(consumeSupabaseAuthHash("/auth/callback"), null);

  // senza ruolo verificato (nessuna sessione => nessuna verifica) mai Admin
  assert.equal(callbackGoesToAdmin({ isAdminRole: undefined, loginContext: "admin" }), false);
});

test("F: la sessione dal callback viene consumata e l'URL ripulito; l'intento e' gia' stato letto", () => {
  const win = installFakeWindow(`https://www.volantinipro.it/auth/callback?context=admin${HASH}`);
  const ctx = resolveLoginContext({ queryContext: new URLSearchParams(win.location.search).get("context") });
  const session = consumeSupabaseAuthHash("/auth/callback");
  assert.equal(session.accessToken, "tok");
  assert.equal(win.location.hash, "");
  assert.equal(ctx, "admin");
  assert.equal(callbackGoesToAdmin({ isAdminRole: true, loginContext: ctx }), true);
});
