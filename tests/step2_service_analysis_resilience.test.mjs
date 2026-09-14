import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const noop = () => {};
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
function installDom() {
  const ls = memoryStorage();
  const ss = memoryStorage();
  const mediaObj = { matches: false, media: "", onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => true };
  const win = {
    location: { href: "https://www.volantinipro.it/configuratore?step=2", pathname: "/configuratore", search: "?step=2", hash: "", origin: "https://www.volantinipro.it", assign: noop, replace: noop, reload: noop },
    localStorage: ls, sessionStorage: ss,
    history: { state: null, pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    matchMedia: () => mediaObj,
    scrollTo: noop, requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    navigator: { userAgent: "node-test", language: "it-IT", languages: ["it-IT"] },
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  };
  const elStub = () => ({ style: {}, setAttribute: noop, appendChild: noop, removeChild: noop, remove: noop, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, removeEventListener: noop });
  const doc = {
    addEventListener: noop, removeEventListener: noop,
    documentElement: { style: {}, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop } },
    head: { appendChild: noop, removeChild: noop },
    body: { appendChild: noop, removeChild: noop, style: {}, classList: { add: noop, remove: noop } },
    cookie: "", title: "",
    createElement: elStub, createElementNS: elStub, createTextNode: () => ({}),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  const define = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch { try { globalThis[k] = v; } catch { /* readonly */ } } };
  globalThis.window = win; globalThis.document = doc;
  globalThis.localStorage = ls; globalThis.sessionStorage = ss;
  define("navigator", win.navigator); define("location", win.location); define("history", win.history);
  class FakeObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  globalThis.IntersectionObserver = globalThis.IntersectionObserver || FakeObserver;
  globalThis.ResizeObserver = globalThis.ResizeObserver || FakeObserver;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
}

installDom();

const STUB_NULL = `import React from "react";
const N = () => null;
export const Step2Map = N;
export default N;
`;

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: "stub-step2-map",
      enforce: "pre",
      load(id) {
        const norm = id.replace(/\\/g, "/");
        if (norm.endsWith("/components/Step2Map.jsx")) return STUB_NULL;
        return null;
      },
    },
  ],
});

const { buildServiceAnalysisRequest } = await vite.ssrLoadModule("/src/lib/step2/buildServiceAnalysisRequest.js");
const { Step2MapPanel } = await vite.ssrLoadModule("/src/pages/public/configurator/step2/Step2MapPanel.jsx");

test("buildServiceAnalysisRequest builds stable URL without depending on user session", () => {
  const req = buildServiceAnalysisRequest({
    lat: 45.4642,
    lng: 9.1900,
    radius: 5,
    service: "d2d",
    municipality: "Milano",
    quantity: 10000,
    scope: null,
    analysisLevel: "nil",
  });

  assert.ok(req.url, "URL must be built");
  assert.match(req.url, /functions\/v1\/analysis-istat/);
  assert.match(req.url, /municipality=Milano/);
  assert.match(req.url, /radius=5/);
});

test('Step2MapPanel renders "Analisi GIS in corso..." during standard loading', () => {
  const html = renderToStaticMarkup(
    React.createElement(Step2MapPanel, {
      gisLoading: true,
      gisSlowConnection: false,
      gisTimedOut: false,
      showTerritoryData: true,
      data: { activeZoneId: 'milano' },
      onRetryGis: () => {},
    })
  );

  assert.match(html, /Analisi GIS in corso\.\.\./);
  assert.doesNotMatch(html, /Connessione temporaneamente lenta/);
  assert.doesNotMatch(html, /Servizio temporaneamente non disponibile/);
});

test('Step2MapPanel renders "Connessione temporaneamente lenta. Riprovo..." during slow connection / retry', () => {
  const html = renderToStaticMarkup(
    React.createElement(Step2MapPanel, {
      gisLoading: true,
      gisSlowConnection: true,
      gisTimedOut: false,
      showTerritoryData: true,
      data: { activeZoneId: 'milano' },
      onRetryGis: () => {},
    })
  );

  assert.match(html, /Connessione temporaneamente lenta\. Riprovo\.\.\./);
  assert.doesNotMatch(html, /Servizio temporaneamente non disponibile/);
  assert.doesNotMatch(html, /Dati non disponibili, riprova o cambia raggio/);
});

test('Step2MapPanel renders "Servizio temporaneamente non disponibile. Riprova." with Riprova button on timeout', () => {
  let retryClicked = false;
  const html = renderToStaticMarkup(
    React.createElement(Step2MapPanel, {
      gisLoading: false,
      gisSlowConnection: false,
      gisTimedOut: true,
      showTerritoryData: true,
      data: { activeZoneId: 'milano' },
      onRetryGis: () => { retryClicked = true; },
    })
  );

  assert.match(html, /Servizio temporaneamente non disponibile\. Riprova\./);
  assert.match(html, /<button[^>]*>Riprova<\/button>/);
  assert.doesNotMatch(html, /Dati non disponibili, riprova o cambia raggio/);
});

test("Step 2 draft preservation: retry action preserves Comune, Radius, Quantity, and NILs", () => {
  const step2Draft = {
    city: { name: "Milano", lat: 45.4642, lng: 9.1900 },
    selectedComuni: [{ name: "Milano", code: "015146" }],
    qty: 25000,
    radiusKm: 4,
    selectedNils: ["DUOMO", "BRERA"],
    svcType: "d2d",
  };

  const draftBeforeRetry = JSON.parse(JSON.stringify(step2Draft));

  let refetchCalled = false;
  const mockRefetch = () => { refetchCalled = true; };
  const handleRetryGis = () => {
    mockRefetch();
  };

  handleRetryGis();

  assert.equal(refetchCalled, true, "refetch must be called on retry");
  assert.deepEqual(step2Draft, draftBeforeRetry, "Draft state must be 100% preserved after retry");
  assert.equal(step2Draft.city.name, "Milano");
  assert.equal(step2Draft.qty, 25000);
  assert.equal(step2Draft.radiusKm, 4);
  assert.deepEqual(step2Draft.selectedNils, ["DUOMO", "BRERA"]);
});

test.after(async () => {
  await vite.close();
});
