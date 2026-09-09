import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { buildStep2TruthModel } from "../src/lib/step2/buildStep2TruthModel.js";
import { buildStep2ViewModel } from "../src/lib/step2/buildStep2ViewModel.js";

test("1. Truth Model & View Model for Milano Address Preview (BRUZZANO)", () => {
  const bruzzanoZone = {
    id: "nil_bruzzano",
    name: "BRUZZANO",
    nilCode: "81",
    isNil: true,
    families: 6840,
    pop: 12592,
    area: 1.7,
    coverage: 100,
    flyersMin: 7524,
    flyersMax: 8276,
  };

  const truthModel = buildStep2TruthModel({
    rawData: {
      territorialAnalysis: {
        nil_breakdown: [bruzzanoZone]
      }
    },
    userSelections: {
      areaMode: "unconfirmed_address",
      searchMode: "municipality",
      selectedNils: [],
    },
    availability: {
      territorialData: true,
      coverage: true,
    },
    service: { key: "d2d", title: "Door to Door" },
    serviceData: {
      available: true,
      kpis: {
        families: 6840,
        pop: 12592,
        area: 1.7,
        coverage: 100,
        recommendedFlyers: 7524,
      }
    },
    insertedQuantity: 10000,
    currentQuantity: 10000,
    baseRequirement: 6840,
    recommendedRequirement: 7524,
    allocation: [{
      id: "nil_bruzzano",
      name: "BRUZZANO",
      requiredQuantity: 7524,
      assignedQuantity: 7524,
      coveragePct: 100,
      status: "full"
    }],
    zones: [bruzzanoZone],
    availableZoneCount: 1,
    calculationStatus: "ready",
  });

  assert.equal(truthModel.calculation.status, "ready");
  assert.equal(truthModel.quantity.current, 10000);
  assert.equal(truthModel.quantity.recommendedRequirement, 7524);
  assert.equal(truthModel.quantity.surplus, 2476);
  assert.equal(truthModel.coverage.operationalPct, 100);
  assert.equal(truthModel.zones.available, 1);
  assert.equal(truthModel.zones.involved, 1);

  const viewModel = buildStep2ViewModel({
    truthModel,
    areaMode: "unconfirmed_address",
    cityName: "Milano",
    isNilAnalysis: true,
    territoryPluralLabel: "Zone NIL",
    usingMunicipalityFullCoverage: false,
    hasConfirmedZone: true,
    hasValidGeometry: true,
    isCalculationComplete: true,
    hasCalculationError: false,
    hasConfirmedCoverageMode: false,
    selectedSearchPoint: { label: "Via Antonio Oroboni, 20161 Milano", lat: 45.525, lng: 9.176, type: "address" },
    coverageDecision: "keepCurrent",
    step2ZonesReady: true,
    coverageDecisionReady: true,
    availableNilCount: 1,
    containingNil: { name: "BRUZZANO", code: "81" },
  });

  // Verify Single Source of Truth
  assert.equal(viewModel.hasUsableCoverageData, true, "hasUsableCoverageData must be true when calculation is ready");
  assert.equal(viewModel.primaryFamiliesValue, 6840);
  assert.equal(viewModel.recommendedFlyersValue, 7524);
  assert.equal(viewModel.insertedFlyersValue, 10000);
  assert.equal(viewModel.surplusFlyersValue, 2476);
  assert.match(viewModel.primaryAreaLabel, /Via Antonio Oroboni \(BRUZZANO\)/);

  // Verify Preview gating (user cannot skip selecting coverage mode)
  assert.equal(viewModel.isGeographicCoverageValid, false);
  assert.equal(viewModel.isCoverageConfigurationValid, false);
  assert.equal(viewModel.ctaDisabled, true);
  assert.equal(viewModel.ctaLabel, "Seleziona una modalita di copertura");
});

// SSR Tests for Step 2 with Address Context
const noop = () => {};
function memStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; }
(function installDom() {
  const media = { matches: false, media: "", addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => true };
  const win = {
    location: { href: "https://www.volantinipro.it/configuratore?step=2", pathname: "/configuratore", search: "?step=2", hash: "", origin: "https://www.volantinipro.it", assign: noop, replace: noop, reload: noop },
    localStorage: memStorage(), sessionStorage: memStorage(),
    history: { state: null, pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true, matchMedia: () => media,
    scrollTo: noop, requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    navigator: { userAgent: "node-test", language: "it-IT", languages: ["it-IT"] }, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  };
  const elStub = () => ({ style: {}, setAttribute: noop, appendChild: noop, removeChild: noop, remove: noop, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, removeEventListener: noop });
  const doc = { addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop } }, head: { appendChild: noop, removeChild: noop }, body: { appendChild: noop, removeChild: noop, style: {}, classList: { add: noop, remove: noop } }, cookie: "", title: "", createElement: elStub, createElementNS: elStub, createTextNode: () => ({}), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const def = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch { try { globalThis[k] = v; } catch {} } };
  globalThis.window = win; globalThis.document = doc; globalThis.localStorage = win.localStorage; globalThis.sessionStorage = win.sessionStorage;
  def("navigator", win.navigator); def("location", win.location); def("history", win.history);
  class FO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  globalThis.IntersectionObserver = globalThis.IntersectionObserver || FO;
  globalThis.ResizeObserver = globalThis.ResizeObserver || FO;
  globalThis.requestAnimationFrame = win.requestAnimationFrame; globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
})();

const STUB_MAP = `import React from "react";const N=()=>null;export const Step2Map=N;export default N;`;
const STUB_MOTION = `import React from "react";const p=(t)=>React.forwardRef((props,ref)=>React.createElement(t,{...props,ref}));export const motion=new Proxy({},{get:(_,k)=>p(typeof k==="string"?k:"div")});export const AnimatePresence=({children})=>children??null;export default {motion,AnimatePresence};`;
const vite = await createServer({
  server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: "stub-step2-heavy", enforce: "pre",
    resolveId(s) { return s === "framer-motion" ? "\0fm" : null; },
    load(id) { if (id === "\0fm") return STUB_MOTION; const n = id.replace(/\\/g, "/"); return n.endsWith("/components/Step2Map.jsx") ? STUB_MAP : null; },
  }],
});

test("2. SSR Render of Step 2 with Address Context", async () => {
  try {
    const mod = await vite.ssrLoadModule("/src/pages/public/configurator/Step2.jsx");
    const Step2 = mod.Step2 || mod.default;

    const addressData = {
      activeService: "d2d", selectedService: "d2d", type: "d2d",
      qty: 10000, flyerQuantity: 10000, flyerQuantityFromStep1: 10000,
      searchMode: "municipality", campaignZones: [], distributionTargets: ["all"], activityType: "retail",
      cityName: "Milano",
      city: { name: "Milano", label: "Milano", comune: "Milano", municipality_code: "015146", istat_code: "015146", lat: 45.4642, lng: 9.19, provincia: "MI" },
      selectedSearchPoint: {
        label: "Via Antonio Oroboni, 20161 Milano",
        lat: 45.525,
        lng: 9.176,
        type: "address",
        parentComune: "Milano"
      }
    };

    const html = renderToStaticMarkup(React.createElement(Step2, {
      data: addressData,
      setData: noop,
      onNext: noop,
      onBack: noop,
      onAssistantContextChange: noop
    }));

    // Check that there is no crash and basic structure renders
    assert.ok(html.length > 0);
    assert.doesNotMatch(html, /Impossibile caricare la pagina/);
  } finally {
    await vite.close();
  }
});
