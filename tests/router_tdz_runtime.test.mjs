// HOTFIX PRODUZIONE — "Cannot access 'c' before initialization" (TDZ) in
// src/app/AppRouter.jsx. Test RUNTIME REALE (non source-contract): esegue il
// corpo di <AppRouter/> via renderToStaticMarkup su piu' route e verifica che
// non lanci ReferenceError da temporal dead zone.
//
// Prima del fix, l'useEffect "Eventi commerciali dal configuratore" leggeva
// `data.*` nella propria dependency array (valutata durante il render) PRIMA
// della dichiarazione `const [data, setData] = useState(...)` -> TDZ, che nel
// bundle minificato diventa "Cannot access 'c' before initialization" e fa
// scattare RouteErrorBoundary in produzione.
//
// AppRouter + routeResolution + auth/session + configuratorState + analytics
// restano REALI (il bug vive nel corpo di AppRouter). I soli figli pesanti
// (PublicRoutes, layout, guard) sono sostituiti da stub via plugin Vite,
// cosi' il mount e' deterministico e veloce e non dipende dalla SSR
// dell'intero albero SPA.
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const STUB_SOURCE = `import React from "react";
const N = () => null;
const Pass = (props) => (props && props.children) ? props.children : null;
export const PublicRoutes = N;
export const Bootstrap = N;
export const SeoMeta = N;
export const Navbar = N;
export const StepperBar = N;
export const RouteLoadingFallback = N;
export const CustomerGuard = N;
export const AdminGuard = N;
export const SupplierGuard = N;
export default N;
export { Pass };
`;

const STUB_ENDINGS = [
  "/app/PublicRoutes.jsx",
  "/layouts/public/Bootstrap.jsx",
  "/layouts/public/SeoMeta.jsx",
  "/layouts/public/Navbar.jsx",
  "/layouts/public/StepperBar.jsx",
  "/layouts/public/RouteLoadingFallback.jsx",
  "/auth/guards/CustomerGuard.jsx",
  "/auth/guards/AdminGuard.jsx",
  "/auth/guards/SupplierGuard.jsx",
];

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  logLevel: "silent",
  // Nessuna env VITE_* esposta a import.meta.env: cosi' src/supabaseClient.js
  // vede url/key undefined e NON chiama createClient() -> nessun timer di
  // auto-refresh token di supabase-js che tenga vivo l'event loop a fine test.
  envPrefix: "VP_TDZ_TEST_NO_ENV_",
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: "stub-approuter-children",
      enforce: "pre",
      load(id) {
        const norm = id.replace(/\\/g, "/");
        return STUB_ENDINGS.some((s) => norm.endsWith(s)) ? STUB_SOURCE : null;
      },
    },
  ],
});

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}

const noop = () => {};

function installDom() {
  const ls = memoryStorage();
  const ss = memoryStorage();
  const win = {
    location: { href: "https://www.volantinipro.it/", pathname: "/", search: "", hash: "", origin: "https://www.volantinipro.it", assign: noop, replace: noop, reload: noop },
    localStorage: ls,
    sessionStorage: ss,
    history: { state: null, pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: false, media: "", onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => true }),
    scrollTo: noop,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    navigator: { userAgent: "node-test", language: "it-IT", languages: ["it-IT"] },
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
  };
  const doc = {
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: { style: {}, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop } },
    head: { appendChild: noop, removeChild: noop },
    body: { appendChild: noop, removeChild: noop, style: {}, classList: { add: noop, remove: noop } },
    cookie: "",
    title: "",
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, remove: noop, classList: { add: noop, remove: noop } }),
    createTextNode: () => ({}),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  const define = (key, value) => {
    try { Object.defineProperty(globalThis, key, { value, writable: true, configurable: true }); }
    catch { try { globalThis[key] = value; } catch { /* read-only host global */ } }
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = ls;
  globalThis.sessionStorage = ss;
  define("navigator", win.navigator);
  define("location", win.location);
  define("history", win.history);
  class FakeObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  globalThis.IntersectionObserver = globalThis.IntersectionObserver || FakeObserver;
  globalThis.ResizeObserver = globalThis.ResizeObserver || FakeObserver;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;

  return { win };
}

function setLocation(win, rawUrl) {
  const u = new URL(rawUrl, "https://www.volantinipro.it");
  win.location.href = u.href;
  win.location.pathname = u.pathname;
  win.location.search = u.search;
  win.location.hash = u.hash;
  win.location.origin = u.origin;
}

const TDZ_RE = /Cannot access '[^']+' before initialization/;

const { win } = installDom();
try {
  const { AppRouter, resolveAppRoute } = await vite.ssrLoadModule("/src/app/AppRouter.jsx");

  test("route resolution: /, /preventivo, /configuratore step1/step2, /admin/analytics", () => {
    assert.equal(resolveAppRoute("/"), "home");
    assert.equal(resolveAppRoute("/preventivo"), "preventivo");
    assert.equal(resolveAppRoute("/configuratore", { step: "1" }), "step1");
    assert.equal(resolveAppRoute("/configuratore", { step: "2" }), "step2");
    assert.equal(resolveAppRoute("/admin/analytics"), "admin-analytics");
  });

  const ROUTES = [
    ["/", "/"],
    ["/preventivo", "/preventivo"],
    ["step1", "/configuratore?step=1"],
    ["step2", "/configuratore?step=2"],
    ["/admin/analytics", "/admin/analytics"],
  ];

  for (const [label, url] of ROUTES) {
    test(`mount <AppRouter/> su ${label} — nessun ReferenceError e markup prodotto`, () => {
      setLocation(win, url);
      let err = null;
      let html = null;
      try {
        html = renderToStaticMarkup(React.createElement(AppRouter));
      } catch (e) {
        err = e;
      }
      assert.equal(err, null, `mount fallito su ${label}: ${err && err.stack}`);
      assert.doesNotMatch(String(html), TDZ_RE);
      assert.equal(typeof html, "string");
      assert.ok(html.length > 0, `markup vuoto su ${label}`);
    });
  }
} finally {
  await vite.close();
}
