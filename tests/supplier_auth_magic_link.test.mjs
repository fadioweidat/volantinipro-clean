// BUG REALE — Magic Link Fornitore torna alla pagina di login invece di
// entrare in /supplier.
//
// Causa: SupplierGuard usa il client REST leggero (localStorage
// vp_supabase_session), il cui getSession() restituisce SOLO i token, mai un
// oggetto `user`. Subito dopo un Magic Link il blob ha l'access_token ma non
// `user`, quindi il vecchio `if (!s || !s.user)` rimbalzava sempre a
// /login?context=supplier. Prima il bug era mascherato perche' il Fornitore
// passava dalla Dashboard Cliente (che idratava `user` nel blob via
// ensureRestSessionFromSdk); il fix del redirect post-Magic-Link lo manda
// dritto in /supplier e ha scoperto il difetto.
//
// Test di INTEGRAZIONE runtime (react-test-renderer + act): sessione valida
// nel blob SENZA `user` + /auth/v1/user che risolve l'utente reale + profilo
// supplier verified  ->  SupplierGuard DEVE renderizzare i children, MAI
// navigare a login. Fallisce prima del fix, passa dopo.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// SupplierGuard.jsx importa solo { useState, useEffect } da 'react' (nessun
// default import). Sotto Vite il runtime JSX automatico lo copre; sotto il
// transform classic del test runner il suo JSX emette React.createElement,
// che risolve l'identificatore libero `React` da globalThis.
globalThis.React = React;

// Le env vanno impostate PRIMA di importare il modulo: src/lib/supabaseClient.js
// valuta `export const supabase = hasSupabaseConfig() ? {...} : null` a load time.
process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
const { SupplierGuard } = await import("../src/auth/guards/SupplierGuard.jsx");

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function installWindow() {
  const storage = makeMemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    location: { pathname: "/supplier", hash: "", search: "" },
    history: { pushState() {}, replaceState() {} },
  };
  return storage;
}

// Router fetch mock: instrada per URL. `routes` = { userEndpoint, profiles, supplierProfiles }.
function installFetch(routes) {
  const prev = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    const ok = (payload, status = 200) => ({
      ok: true,
      status,
      text: async () => (payload == null ? "" : JSON.stringify(payload)),
    });
    const fail = (status = 401) => ({ ok: false, status, text: async () => "unauthorized" });
    if (String(url).includes("/auth/v1/user")) {
      return routes.userEndpoint === "fail" ? fail() : ok(routes.userEndpoint);
    }
    if (String(url).includes("/rest/v1/profiles")) return routes.profiles === "fail" ? fail(500) : ok(routes.profiles);
    if (String(url).includes("/rest/v1/supplier_profiles")) {
      // supplierProfiles puo' essere una CODA di risposte: ogni SELECT consuma
      // la successiva (l'ultima resta). Serve a simulare "Aggiorna stato" che
      // rifà la query e stavolta trova status=verified.
      let val = routes.supplierProfiles;
      if (Array.isArray(routes.supplierProfilesQueue) && routes.supplierProfilesQueue.length) {
        val = routes.supplierProfilesQueue.length > 1 ? routes.supplierProfilesQueue.shift() : routes.supplierProfilesQueue[0];
      }
      return val === "fail" ? fail(500) : ok(val);
    }
    throw new Error(`fetch non mockata: ${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = prev; } };
}

async function renderGuard({ storedSession, routes, onNav, keepFetch = false }) {
  const storage = installWindow();
  if (storedSession) storage.setItem("vp_supabase_session", JSON.stringify(storedSession));
  const fetchMock = installFetch(routes);
  let renderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          SupplierGuard,
          { onNav },
          React.createElement("div", null, "SUPPLIER CONTENT"),
        ),
      );
    });
    // Lascia risolvere la catena di await dell'effect (getSession -> getUser ->
    // profiles -> supplier_profiles).
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
    return {
      text: JSON.stringify(renderer.toJSON()),
      calls: fetchMock.calls,
      renderer,
      // clicca il primo bottone il cui testo contiene `label`, poi lascia
      // risolvere la catena di await del nuovo effect.
      async click(label) {
        const flat = (c) => (Array.isArray(c) ? c.map(flat).join("") : String(c ?? ""));
        const btn = renderer.root.findAll((n) => n.type === "button" && flat(n.props.children).includes(label))[0];
        if (!btn) throw new Error(`bottone "${label}" non trovato`);
        await act(async () => { btn.props.onClick(); });
        for (let i = 0; i < 6; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        }
        return JSON.stringify(renderer.toJSON());
      },
      restore: fetchMock.restore,
    };
  } finally {
    if (!keepFetch) fetchMock.restore();
  }
}

const FUTURE = String(Math.floor(Date.now() / 1000) + 3600);

test("Magic Link Fornitore: blob con solo token (senza user) + /auth/v1/user valido -> entra in dashboard, NIENTE redirect a login", async () => {
  const navCalls = [];
  const { text, calls } = await renderGuard({
    // Esattamente cio' che producono consumeSupabaseAuthHash + toStoredSession:
    // access token, nessun campo `user`.
    storedSession: { accessToken: "fresh-supplier-token", expiresAt: FUTURE },
    routes: {
      userEndpoint: { id: "supplier-uid", email: "fornitore@example.com" },
      profiles: [{ role: "supplier" }],
      supplierProfiles: [{ status: "verified" }],
    },
    onNav: (page) => navCalls.push(page),
  });

  assert.deepEqual(navCalls, [], "non deve navigare da nessuna parte (nessun rimbalzo a login)");
  assert.match(text, /SUPPLIER CONTENT/, "i children del Fornitore devono essere renderizzati");
  assert.ok(calls.some((u) => u.includes("/auth/v1/user")), "l'utente reale va risolto dal token via /auth/v1/user");
});

test("Fornitore gia' idratato: se il blob ha gia' `user`, nessuna chiamata extra a /auth/v1/user", async () => {
  const navCalls = [];
  const { text, calls } = await renderGuard({
    storedSession: { accessToken: "tok", access_token: "tok", expiresAt: FUTURE, user: { id: "supplier-uid" } },
    routes: {
      userEndpoint: "fail", // non deve servire
      profiles: [{ role: "supplier" }],
      supplierProfiles: [{ status: "verified" }],
    },
    onNav: (page) => navCalls.push(page),
  });

  assert.deepEqual(navCalls, []);
  assert.match(text, /SUPPLIER CONTENT/);
  assert.ok(!calls.some((u) => u.includes("/auth/v1/user")), "con `user` gia' presente non serve /auth/v1/user");
});

test("Nessuna sessione: rimbalza a /login?context=supplier, children non renderizzati", async () => {
  const navCalls = [];
  const { text } = await renderGuard({
    storedSession: null,
    routes: { userEndpoint: "fail", profiles: [], supplierProfiles: [] },
    onNav: (page) => navCalls.push(page),
  });

  assert.deepEqual(navCalls, ["login?context=supplier"]);
  assert.doesNotMatch(text, /SUPPLIER CONTENT/);
});

// BUG "Area Fornitore apre Area Cliente": una sessione CLIENTE che apre
// /supplier NON deve mai finire nel portale cliente. Il guard non fa alcun
// redirect: se non c'e' un profilo fornitore mostra il form di candidatura.
test("C — sessione CLIENTE attiva + /supplier: NIENTE redirect all'Area Cliente, form 'Richiedi accesso come fornitore'", async () => {
  const navCalls = [];
  const { text } = await renderGuard({
    storedSession: { accessToken: "customer-token", expiresAt: FUTURE },
    routes: {
      userEndpoint: { id: "customer-uid" },
      supplierProfiles: [],
    },
    onNav: (page) => navCalls.push(page),
  });

  assert.ok(!navCalls.includes("dashboard"), "MAI onNav('dashboard') automatico");
  assert.deepEqual(navCalls, [], "nessuna navigazione automatica: si mostra il form di candidatura");
  assert.doesNotMatch(text, /SUPPLIER CONTENT/, "i children del Fornitore non devono comparire");
  assert.match(text, /Richiedi accesso come fornitore/);
  assert.match(text, /non è ancora registrato come fornitore/i);
});

test("C2 — utente autenticato senza profilo fornitore: form di candidatura, nessun redirect a /dashboard", async () => {
  const navCalls = [];
  const { text } = await renderGuard({
    storedSession: { accessToken: "tok", expiresAt: FUTURE },
    routes: { userEndpoint: { id: "uid-x" }, supplierProfiles: [] },
    onNav: (page) => navCalls.push(page),
  });
  assert.ok(!navCalls.includes("dashboard"));
  assert.doesNotMatch(text, /SUPPLIER CONTENT/);
  assert.match(text, /Richiedi accesso come fornitore/);
});

test("C3 — errore reale nella lettura di supplier_profiles: 'servizio non disponibile' + Riprova, MAI login loop", async () => {
  const navCalls = [];
  const { text } = await renderGuard({
    storedSession: { accessToken: "tok", expiresAt: FUTURE },
    routes: { userEndpoint: { id: "uid-x" }, supplierProfiles: "fail" },
    onNav: (page) => navCalls.push(page),
  });
  assert.deepEqual(navCalls, [], "un errore di query non deve rimbalzare al login");
  assert.match(text, /Servizio fornitori non disponibile/i);
  assert.match(text, /Riprova/);
});

test("E — refresh diretto di /supplier con sessione FORNITORE verificata: entra in dashboard", async () => {
  const navCalls = [];
  // installWindow() imposta location.pathname = "/supplier": simula il
  // refresh diretto della route, senza passare da un click nella SPA.
  const { text, calls } = await renderGuard({
    storedSession: { accessToken: "supplier-token", expiresAt: FUTURE },
    routes: {
      userEndpoint: { id: "supplier-uid", email: "f@ex.it" },
      profiles: [{ role: "supplier" }],
      supplierProfiles: [{ status: "verified" }],
    },
    onNav: (page) => navCalls.push(page),
  });
  assert.deepEqual(navCalls, []);
  assert.match(text, /SUPPLIER CONTENT/);
  assert.ok(calls.some((u) => u.includes("/rest/v1/supplier_profiles")));
});

test("F — role isolation: stesso mount, sessione fornitore -> dashboard; sessione cliente -> schermo fornitore (mai Area Cliente)", async () => {
  const supNav = [];
  const sup = await renderGuard({
    storedSession: { accessToken: "s1", expiresAt: FUTURE },
    routes: { userEndpoint: { id: "sup" }, profiles: [{ role: "supplier" }], supplierProfiles: [{ status: "verified" }] },
    onNav: (p) => supNav.push(p),
  });
  assert.match(sup.text, /SUPPLIER CONTENT/);
  assert.deepEqual(supNav, []);

  const custNav = [];
  const cust = await renderGuard({
    storedSession: { accessToken: "c1", expiresAt: FUTURE },
    routes: { userEndpoint: { id: "cust" }, profiles: [{ role: "customer" }], supplierProfiles: [] },
    onNav: (p) => custNav.push(p),
  });
  assert.doesNotMatch(cust.text, /SUPPLIER CONTENT/);
  assert.ok(!custNav.includes("dashboard"), "un cliente sul flusso fornitore non viene mai spinto nell'Area Cliente");
});

test("Fornitore non ancora verificato (status=pending): pannello 'Registrazione ricevuta / in attesa di approvazione', nessun redirect", async () => {
  const navCalls = [];
  const { text } = await renderGuard({
    storedSession: { accessToken: "pending-supplier-token", expiresAt: FUTURE },
    routes: {
      userEndpoint: { id: "supplier-uid" },
      supplierProfiles: [{ status: "pending" }],
    },
    onNav: (page) => navCalls.push(page),
  });

  assert.deepEqual(navCalls, []);
  assert.match(text, /in attesa di approvazione/i);
  assert.doesNotMatch(text, /SUPPLIER CONTENT/);
});

test("Fornitore sospeso (status=suspended): schermata dedicata 'Account sospeso', nessun redirect, nessun form", async () => {
  const navCalls = [];
  const { text } = await renderGuard({
    storedSession: { accessToken: "tok", expiresAt: FUTURE },
    routes: { userEndpoint: { id: "sup-uid" }, supplierProfiles: [{ status: "suspended" }] },
    onNav: (page) => navCalls.push(page),
  });
  assert.deepEqual(navCalls, []);
  assert.match(text, /sospeso/i);
  assert.doesNotMatch(text, /SUPPLIER CONTENT/);
  assert.doesNotMatch(text, /Richiedi accesso come fornitore/);
});

// BUG "Aggiorna stato non funziona": dopo che l'Admin verifica il fornitore,
// il click su "Aggiorna stato" nella schermata pending deve rifare la SELECT
// live di supplier_profiles.status e, se verified, entrare SUBITO nella
// dashboard — senza nuovo login, senza reload.
test("Aggiorna stato: da pending, dopo verifica Admin, il click rifà la SELECT e monta la Dashboard Fornitore", async () => {
  const navCalls = [];
  const h = await renderGuard({
    storedSession: { accessToken: "tok", expiresAt: FUTURE },
    routes: {
      userEndpoint: { id: "sup-uid" },
      // 1ª SELECT -> pending; ogni SELECT successiva -> verified
      supplierProfilesQueue: [[{ status: "pending" }], [{ status: "verified" }]],
    },
    onNav: (page) => navCalls.push(page),
    keepFetch: true,
  });
  try {
    assert.match(h.text, /in attesa di approvazione/i);
    assert.doesNotMatch(h.text, /SUPPLIER CONTENT/);
    const after = await h.click("Aggiorna stato");
    assert.match(after, /SUPPLIER CONTENT/, "status verified => children montati subito");
    assert.deepEqual(navCalls, [], "nessun redirect/login: solo un re-check");
  } finally {
    h.restore();
  }
});
