import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import {
  isStoredSupabaseSessionValid,
  consumeSupabaseAuthHash,
  getStoredSupabaseSession,
} from "../src/auth/session.js";
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
  const historyCalls = [];
  return {
    win: {
      location: { hash, search, pathname: "/admin" },
      history: {
        pushState: (_s, _t, url) => historyCalls.push(["push", url]),
        replaceState: (_s, _t, url) => historyCalls.push(["replace", url]),
      },
    },
    historyCalls,
  };
}

test("isStoredSupabaseSessionValid", async (t) => {
  await t.test("nessuna sessione -> non valida", () => {
    assert.equal(isStoredSupabaseSessionValid(null), false);
  });

  await t.test("sessione senza accessToken -> non valida", () => {
    assert.equal(isStoredSupabaseSessionValid({}), false);
  });

  await t.test("sessione con scadenza futura -> valida", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    assert.equal(isStoredSupabaseSessionValid({ accessToken: "tok", expiresAt: String(future) }), true);
  });

  await t.test("sessione scaduta -> non valida", () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    assert.equal(isStoredSupabaseSessionValid({ accessToken: "tok", expiresAt: String(past) }), false);
  });

  await t.test("sessione senza expiresAt -> valida (comportamento storico invariato)", () => {
    assert.equal(isStoredSupabaseSessionValid({ accessToken: "tok" }), true);
  });
});

test("consumeSupabaseAuthHash", async (t) => {
  await t.test("nessun hash -> nessun effetto, ritorna null", () => {
    globalThis.localStorage = makeMemoryStorage();
    const { win } = makeWindow({ hash: "" });
    globalThis.window = win;
    assert.equal(consumeSupabaseAuthHash("/admin"), null);
  });

  await t.test("hash con access_token -> persiste sessione e ripulisce l'URL", () => {
    globalThis.localStorage = makeMemoryStorage();
    const { win, historyCalls } = makeWindow({
      hash: "#access_token=abc123&refresh_token=r1&expires_at=9999999999&token_type=bearer",
    });
    globalThis.window = win;
    const result = consumeSupabaseAuthHash("/admin");
    assert.equal(result.accessToken, "abc123");
    assert.deepEqual(historyCalls, [["replace", "/admin"]]);
    assert.equal(getStoredSupabaseSession().accessToken, "abc123");
  });
});

test("AdminGuard", async (t) => {
  const prevUrl = process.env.VITE_SUPABASE_URL;
  const prevKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
  t.after(() => {
    process.env.VITE_SUPABASE_URL = prevUrl;
    process.env.VITE_SUPABASE_ANON_KEY = prevKey;
  });

  await t.test("blocca l'accesso anonimo e reindirizza a /login con contesto admin", async () => {
    globalThis.localStorage = makeMemoryStorage();
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];

    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AdminGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement("div", null, "SECRET ADMIN CONTENT")
        )
      );
    });

    assert.equal(renderer.toJSON(), null);
    assert.deepEqual(navCalls, [["login", { context: "admin" }]]);
  });

  await t.test("sessione scaduta -> trattata come anonima, sessione rimossa", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const past = Math.floor(Date.now() / 1000) - 3600;
    globalThis.localStorage.setItem(
      "vp_supabase_session",
      JSON.stringify({ accessToken: "old-token", expiresAt: String(past) })
    );
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];

    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AdminGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement("div", null, "SECRET ADMIN CONTENT")
        )
      );
    });

    assert.equal(renderer.toJSON(), null);
    assert.deepEqual(navCalls, [["login", { context: "admin" }]]);
    assert.equal(getStoredSupabaseSession(), null);
  });

  await t.test("sessione valida -> renderizza i children senza redirect", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const future = Math.floor(Date.now() / 1000) + 3600;
    globalThis.localStorage.setItem(
      "vp_supabase_session",
      JSON.stringify({ accessToken: "valid-token", expiresAt: String(future) })
    );
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];

    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AdminGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement("div", null, "SECRET ADMIN CONTENT")
        )
      );
    });

    assert.equal(renderer.toJSON().children[0], "SECRET ADMIN CONTENT");
    assert.deepEqual(navCalls, []);
  });

  await t.test("hash con access_token valido -> consuma il magic link e autorizza senza redirect", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const { win } = makeWindow({
      hash: "#access_token=fresh-token&refresh_token=r1&expires_at=9999999999&token_type=bearer",
    });
    globalThis.window = win;
    const navCalls = [];

    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AdminGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement("div", null, "SECRET ADMIN CONTENT")
        )
      );
    });

    assert.equal(renderer.toJSON().children[0], "SECRET ADMIN CONTENT");
    assert.deepEqual(navCalls, []);
    assert.equal(getStoredSupabaseSession().accessToken, "fresh-token");
  });
});
