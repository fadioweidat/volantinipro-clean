// REGRESSIONE PRODUZIONE — "ReferenceError: cityName is not defined" (Step 2).
// Il commit 9a16aef (feat step2-ai-assistant) ha aggiunto a Step2.jsx un 3°
// argomento a buildQuoteAssistantStep2Context({...}) che referenziava 5
// identificatori MAI dichiarati nello scope del componente: cityName,
// province, selectedFrazione, selectedZones, priorityMode. `vite build` non
// fallisce sugli identificatori liberi -> in produzione, appena la catena `||`
// raggiungeva `cityName` (es. entrando in Step 2 senza comune risolto), Step 2
// crashava e RouteErrorBoundary mostrava "Impossibile caricare la pagina.".
//
// Questo test ESEGUE davvero il corpo di <Step2/> via renderToStaticMarkup su
// piu' varianti di stato (nessun comune / Cormano / Varedo, modalita' comune)
// e verifica che NON venga lanciato alcun ReferenceError.
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

// Stub dei figli "pesanti" (Leaflet / mappa / framer-motion) di Step 2: il bug
// vive nel CORPO di Step2.jsx (chiamata a buildQuoteAssistantStep2Context con
// identificatori liberi), non nella mappa. Stubbandoli il mount SSR e'
// deterministico e non trascina Leaflet (che al load legge navigator.platform).
const STUB_NULL = `import React from "react";
const N = () => null;
export const Step2Map = N;
export default N;
`;
const STUB_MOTION = `import React from "react";
const passthrough = (tag) => React.forwardRef((props, ref) => React.createElement(tag, { ...props, ref }));
export const motion = new Proxy({}, { get: (_, k) => passthrough(typeof k === "string" ? k : "div") });
export const AnimatePresence = ({ children }) => children ?? null;
export default { motion, AnimatePresence };
`;
const STUB_ENDINGS = [
  { ends: ["/components/Step2Map.jsx"], src: STUB_NULL },
];

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { external: [], noExternal: ["framer-motion"] },
  plugins: [
    {
      name: "stub-step2-heavy-children",
      enforce: "pre",
      resolveId(source) {
        if (source === "framer-motion") return "\0virtual:framer-motion-stub";
        return null;
      },
      load(id) {
        if (id === "\0virtual:framer-motion-stub") return STUB_MOTION;
        const norm = id.replace(/\\/g, "/");
        const hit = STUB_ENDINGS.find((s) => s.ends.some((e) => norm.endsWith(e)));
        return hit ? hit.src : null;
      },
    },
  ],
});

const REFERENCE_ERROR_RE = /is not defined|ReferenceError|Cannot access '[^']+' before initialization/;
const CITYNAME_RE = /cityName is not defined/;

function makeData(overrides = {}) {
  return {
    activeService: "d2d",
    selectedService: "d2d",
    type: "d2d",
    qty: 12000,
    flyerQuantity: 12000,
    flyerQuantityFromStep1: 12000,
    searchMode: "municipality",
    campaignZones: [],
    distributionTargets: ["all"],
    activityType: "retail",
    ...overrides,
  };
}

try {
  const mod = await vite.ssrLoadModule("/src/pages/public/configurator/Step2.jsx");
  const Step2 = mod.Step2 || mod.default;
  assert.ok(typeof Step2 === "function", "Step2 deve essere esportato come componente");

  const scenarios = [
    ["modalita' comune, nessun comune risolto (path del crash)", makeData()],
    ["modalita' comune, Cormano", makeData({
      cityName: "Cormano",
      city: { name: "Cormano", label: "Cormano", lat: 45.5438, lng: 9.1724, municipality_code: "015086", provincia: "MI" },
    })],
    ["modalita' comune, Varedo", makeData({
      cityName: "Varedo",
      city: { name: "Varedo", label: "Varedo", lat: 45.5986, lng: 9.1497, municipality_code: "108048", provincia: "MB" },
    })],
  ];

  for (const [label, data] of scenarios) {
    test(`Step 2 render — ${label} — nessun ReferenceError`, () => {
      let err = null;
      let html = null;
      try {
        html = renderToStaticMarkup(
          React.createElement(Step2, {
            data,
            setData: noop,
            onNext: noop,
            onBack: noop,
            onAssistantContextChange: noop,
          })
        );
      } catch (e) {
        err = e;
      }
      assert.ok(!err || !CITYNAME_RE.test(String(err && (err.message || err))), `crash "cityName is not defined": ${err && err.stack}`);
      assert.ok(!err || !REFERENCE_ERROR_RE.test(String(err && (err.message || err))), `ReferenceError al render di Step 2 (${label}): ${err && err.stack}`);
      assert.equal(typeof html, "string", `Step 2 deve produrre markup (${label})`);
      assert.ok(html.length > 0, `markup vuoto (${label})`);
    });
  }
} finally {
  await vite.close();
}
