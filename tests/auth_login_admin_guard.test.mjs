import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import {
  isStoredSupabaseSessionValid,
  consumeSupabaseAuthHash,
  getStoredSupabaseSession,
  verifySupabaseAdminRole,
} from "../src/auth/session.js";
import { AdminGuard } from "../src/auth/guards/AdminGuard.jsx";
import { CustomerGuard } from "../src/auth/guards/CustomerGuard.jsx";

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
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return responder(url, options);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = prevFetch;
    },
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

test("CustomerGuard", async (t) => {
  withSupabaseConfig(t);

  await t.test("non reindirizza se un figlio salva la sessione nel proprio effect di mount (race del magic link al primo caricamento)", async () => {
    globalThis.localStorage = makeMemoryStorage();
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];

    function ChildThatSavesSessionOnMount() {
      React.useEffect(() => {
        // Simula DashboardPage: consuma l'hash del magic link e salva la
        // sessione nel proprio effect, che React esegue PRIMA di quello del
        // genitore (CustomerGuard) nello stesso giro di commit.
        globalThis.localStorage.setItem("vp_supabase_session", JSON.stringify({ accessToken: "just-saved" }));
      }, []);
      return React.createElement("div", null, "CHILD");
    }

    await act(async () => {
      TestRenderer.create(
        React.createElement(
          CustomerGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement(ChildThatSavesSessionOnMount)
        )
      );
    });

    assert.deepEqual(navCalls, []);
  });

  await t.test("reindirizza a /login se non c'e' ne' sessione ne' hash", async () => {
    globalThis.localStorage = makeMemoryStorage();
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];

    await act(async () => {
      TestRenderer.create(
        React.createElement(
          CustomerGuard,
          { onNav: (page, ctx) => navCalls.push([page, ctx]) },
          React.createElement("div", null, "CHILD")
        )
      );
    });

    assert.deepEqual(navCalls, [["login", undefined]]);
  });
});

test("verifySupabaseAdminRole", async (t) => {
  withSupabaseConfig(t);

  await t.test("nessun token -> false, nessuna chiamata di rete", async () => {
    const fetchMock = mockFetchOnce(() => {
      throw new Error("fetch non doveva essere chiamato");
    });
    try {
      assert.equal(await verifySupabaseAdminRole(null), false);
      assert.equal(fetchMock.calls.length, 0);
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("RPC jwt_is_admin risponde true -> autorizzato", async () => {
    const fetchMock = mockFetchOnce(async (url) => {
      assert.match(url, /\/rest\/v1\/rpc\/jwt_is_admin$/);
      return { ok: true, json: async () => true };
    });
    try {
      assert.equal(await verifySupabaseAdminRole({ accessToken: "real-admin-token" }), true);
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("RPC jwt_is_admin risponde false -> non autorizzato", async () => {
    const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => false }));
    try {
      assert.equal(await verifySupabaseAdminRole({ accessToken: "customer-token" }), false);
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("RPC risponde 401/permission denied -> fail closed (nega)", async () => {
    const fetchMock = mockFetchOnce(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    try {
      assert.equal(await verifySupabaseAdminRole({ accessToken: "bad-token" }), false);
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("errore di rete -> fail closed (nega), nessuna eccezione propagata", async () => {
    const fetchMock = mockFetchOnce(async () => {
      throw new Error("network down");
    });
    try {
      assert.equal(await verifySupabaseAdminRole({ accessToken: "any-token" }), false);
    } finally {
      fetchMock.restore();
    }
  });
});

test("AdminGuard", async (t) => {
  withSupabaseConfig(t);

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

  await t.test("cliente autenticato ma non admin (RPC=false) -> pannello Accesso negato, nessun redirect", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const future = Math.floor(Date.now() / 1000) + 3600;
    globalThis.localStorage.setItem(
      "vp_supabase_session",
      JSON.stringify({ accessToken: "customer-token", expiresAt: String(future) })
    );
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];
    const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => false }));

    try {
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

      const text = JSON.stringify(renderer.toJSON());
      assert.match(text, /Accesso negato/);
      assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
      assert.deepEqual(navCalls, []);
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("RPC fallisce (errore di rete) -> fail closed, Accesso negato invece di Dashboard Admin", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const future = Math.floor(Date.now() / 1000) + 3600;
    globalThis.localStorage.setItem(
      "vp_supabase_session",
      JSON.stringify({ accessToken: "customer-token", expiresAt: String(future) })
    );
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const fetchMock = mockFetchOnce(async () => {
      throw new Error("network down");
    });

    try {
      let renderer;
      await act(async () => {
        renderer = TestRenderer.create(
          React.createElement(
            AdminGuard,
            { onNav: () => {} },
            React.createElement("div", null, "SECRET ADMIN CONTENT")
          )
        );
      });

      const text = JSON.stringify(renderer.toJSON());
      assert.match(text, /Accesso negato/);
      assert.doesNotMatch(text, /SECRET ADMIN CONTENT/);
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("admin verificato (RPC=true) -> renderizza i children senza redirect", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const future = Math.floor(Date.now() / 1000) + 3600;
    globalThis.localStorage.setItem(
      "vp_supabase_session",
      JSON.stringify({ accessToken: "real-admin-token", expiresAt: String(future) })
    );
    globalThis.window = makeWindow({ hash: "", search: "" }).win;
    const navCalls = [];
    const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => true }));

    try {
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
    } finally {
      fetchMock.restore();
    }
  });

  await t.test("hash con access_token valido + RPC=true -> consuma il magic link e autorizza senza redirect", async () => {
    globalThis.localStorage = makeMemoryStorage();
    const { win } = makeWindow({
      hash: "#access_token=fresh-admin-token&refresh_token=r1&expires_at=9999999999&token_type=bearer",
    });
    globalThis.window = win;
    const navCalls = [];
    const fetchMock = mockFetchOnce(async () => ({ ok: true, json: async () => true }));

    try {
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
      assert.equal(getStoredSupabaseSession().accessToken, "fresh-admin-token");
    } finally {
      fetchMock.restore();
    }
  });
});
