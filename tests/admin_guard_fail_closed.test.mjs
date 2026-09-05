// FASE SECURITY — AdminGuard fail-closed (config Supabase assente).
// Prima di questa fix, src/auth/guards/AdminGuard.jsx faceva:
//   if (!hasSupabaseConfig()) { setRoleStatus("admin"); return undefined; }
// cioe' concedeva Admin FAIL-OPEN quando VITE_SUPABASE_URL/ANON_KEY mancavano
// (deploy misconfigurato). Ora e' fail-closed: config assente => "config_error"
// => stesso pannello "Accesso negato" gia' usato per un ruolo non-Admin.
//
// Convenzioni riusate identiche a tests/auth_login_admin_guard.test.mjs
// (stesso file, stessa infrastruttura di mock — non duplicata qui: import
// diretto delle stesse funzioni).
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

function makeWindow({ hash = "", search = "" } = {}) {
  return {
    location: { hash, search, pathname: "/admin" },
    history: {
      pushState: () => {},
      replaceState: () => {},
    },
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

function withoutSupabaseConfig(t) {
  const prevUrl = process.env.VITE_SUPABASE_URL;
  const prevKey = process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  t.after(() => {
    if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = prevKey;
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

// TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com: AdminGuard ora
// decodifica il claim 'email' dal JWT PRIMA di chiamare jwt_is_admin() (vedi
// tests/admin_email_allowlist.test.mjs per la copertura dedicata). I token
// di test qui sotto ("admin-token" ecc.) non sono JWT reali — getSessionEmail()
// ritorna null per un token senza punti, che fallisce SEMPRE il controllo
// email indipendentemente da cosa risponde jwt_is_admin(). makeFakeJwt()
// costruisce un JWT minimo (header.payload.signature, nessuna firma reale
// necessaria: la verifica di firma resta lato Supabase, qui si testa solo
// la lettura del claim) con l'email autorizzata, per i test che devono
// ancora rappresentare "una sessione Admin valida".
function makeFakeJwt(email) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64url({ alg: "none" })}.${b64url({ email })}.signature`;
}

// 1. Supabase config mancante => DENIED
test("1. Config Supabase assente => 'Accesso negato' (config_error), MAI i children Admin", async (t) => {
  withoutSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  globalThis.window = makeWindow();
  const navCalls = [];

  const renderer = await renderAdminGuard({ onNav: (page, ctx) => navCalls.push([page, ctx]) });

  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /Accesso negato/);
  assert.match(text, /Configurazione autenticazione non disponibile/);
  assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
  // Nessun redirect: e' lo stesso comportamento "denied" gia' usato per un
  // ruolo non-Admin, non un anonimo che rimanda a /login.
  assert.deepEqual(navCalls, []);
});

test("1b. Config Supabase assente => nessuna variabile ambiente/stack trace esposta nel testo renderizzato", async (t) => {
  withoutSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  globalThis.window = makeWindow();

  const renderer = await renderAdminGuard();
  const text = JSON.stringify(renderer.toJSON());
  assert.doesNotMatch(text, /VITE_SUPABASE/);
  assert.doesNotMatch(text, /undefined/);
  assert.doesNotMatch(text, /at\s+\w+\s+\(/); // pattern tipico di uno stack trace
});

// 2. config presente + no session => DENIED (nessun accesso Admin: qui il
// comportamento e' "anonimo" -> redirect a /login, non il pannello, ma
// l'esito e' identico: children Admin mai renderizzati).
test("2. Config presente + nessuna sessione => nessun accesso Admin (redirect a /login, non 'admin')", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  globalThis.window = makeWindow();
  const navCalls = [];

  const renderer = await renderAdminGuard({ onNav: (page, ctx) => navCalls.push([page, ctx]) });

  assert.equal(renderer.toJSON(), null);
  assert.deepEqual(navCalls, [["login", { context: "admin" }]]);
});

// 3. sessione scaduta => DENIED
test("3. Config presente + sessione scaduta => nessun accesso Admin (trattata come anonima)", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const past = Math.floor(Date.now() / 1000) - 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: "old-token", expiresAt: String(past) }));
  globalThis.window = makeWindow();
  const navCalls = [];

  const renderer = await renderAdminGuard({ onNav: (page, ctx) => navCalls.push([page, ctx]) });

  assert.equal(renderer.toJSON(), null);
  assert.deepEqual(navCalls, [["login", { context: "admin" }]]);
});

// 4. role check error => DENIED
test("4. Config presente + sessione valida (email autorizzata) + jwt_is_admin() errore di rete => 'Accesso negato', mai Admin", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  // Email autorizzata nel token: cosi' questo test continua a esercitare
  // davvero il ramo "jwt_is_admin() lancia" e non viene intercettato prima
  // dal nuovo controllo email (quello ha il proprio test dedicato).
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("fenice.sp@gmail.com"), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  const fetchMock = mockFetchOnce(async () => { throw new Error("network down"); });

  try {
    const renderer = await renderAdminGuard();
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /Accesso negato/);
    assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
  } finally {
    fetchMock.restore();
  }
});

// 5. jwt_is_admin false => DENIED
test("5. Config presente + sessione valida (email autorizzata) + jwt_is_admin()=false => 'Accesso negato', mai Admin", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("fenice.sp@gmail.com"), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => false }));

  try {
    const renderer = await renderAdminGuard();
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /Accesso negato/);
    assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
  } finally {
    fetchMock.restore();
  }
});

// 6. jwt_is_admin true => ADMIN
test("6. Config presente + sessione valida (email autorizzata) + jwt_is_admin()=true => children Admin renderizzati", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: makeFakeJwt("fenice.sp@gmail.com"), expiresAt: String(future) }));
  globalThis.window = makeWindow();
  const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => true }));

  try {
    const renderer = await renderAdminGuard();
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /SECRET ADMIN CONTENT/);
    assert.doesNotMatch(text, /Accesso negato/);
  } finally {
    fetchMock.restore();
  }
});

// 7. nessun ramo può promuovere Admin senza verifica server-side
test("7. Contratto sorgente: 'admin' viene assegnato SOLO dentro il ternario post-verifySupabaseAdminRole, mai nel ramo config assente", () => {
  // Il ramo config-assente non deve mai contenere setRoleStatus("admin").
  const configBranch = adminGuardSource.match(/if \(!hasSupabaseConfig\(\)\) \{[\s\S]*?\n {4}\}/)[0];
  assert.doesNotMatch(configBranch, /setRoleStatus\("admin"\)/);
  assert.match(configBranch, /setRoleStatus\("config_error"\)/);
  // L'UNICA assegnazione di "admin" nel file deve dipendere dall'esito di
  // verifySupabaseAdminRole (isAdmin), non essere un valore fisso.
  const adminAssignments = [...adminGuardSource.matchAll(/setRoleStatus\((.*?)\)/g)].map((m) => m[1]);
  assert.ok(adminAssignments.includes('isAdmin ? "admin" : "denied"'), "l'assegnazione admin/denied basata su isAdmin deve esistere");
  assert.ok(!adminAssignments.some((expr) => expr === '"admin"'), "nessuna assegnazione letterale e incondizionata di \"admin\" deve esistere");
});

// 8. Login Health continua a PASSARE (authHealth.js non importa/dipende da
// AdminGuard.jsx, quindi e' strutturalmente non toccato da questa fix: qui
// verifichiamo solo che le due unita' coesistano senza interferenze quando
// eseguite nello stesso processo di test).
test("8. authHealth.checkAuthContract() continua a funzionare correttamente insieme ad AdminGuard nello stesso processo", async (t) => {
  withSupabaseConfig(t);
  const { checkAuthContract } = await import("../src/lib/monitoring/authHealth.js");
  const fetchMock = mockFetchOnce(async (url) => (String(url).includes("jwt_is_admin") ? { ok: true, json: async () => false } : { ok: true, json: async () => ({}) }));
  try {
    const contract = await checkAuthContract();
    assert.equal(contract.admin.status, "pass");
    assert.equal(contract.client.status, "pass");
  } finally {
    fetchMock.restore();
  }
});

// 9. Driver flow invariato: nessun file del percorso Driver importa/dipende
// da AdminGuard, e questa fix non ha toccato alcun file Driver/GPS.
test("9. Nessun file del percorso Driver referenzia AdminGuard (flusso Driver strutturalmente indipendente da questa fix)", async () => {
  const fs = await import("node:fs");
  const driverFiles = [
    "src/hooks/useGpsTracking.js",
    "src/pages/driver/DriverAssignmentPage.jsx",
    "src/pages/driver/TrackingPage.jsx",
    "src/lib/services/gps-api.js",
  ];
  for (const rel of driverFiles) {
    const source = fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /AdminGuard/, `${rel} non deve referenziare AdminGuard`);
  }
});

// 10. Cliente non viene promosso ad Admin
test("10. Cliente autenticato (jwt_is_admin=false) non viene mai promosso ad Admin, indipendentemente dallo stato config", async (t) => {
  withSupabaseConfig(t);
  globalThis.localStorage = makeMemoryStorage();
  const future = Math.floor(Date.now() / 1000) + 3600;
  globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: "customer-token", expiresAt: String(future) }));
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
