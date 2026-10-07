// HOTFIX — QUANTITA' PV SUPERSTITE DOPO ELIMINAZIONE MULTI-PV.
//
// Riprodotto a runtime su 1e25732: PV1 Milano NIL ISOLA 5.959 + PV2 Via
// Torino raggio 1 km 14.127; "Continua" con PV2 attivo; ritorno a Step2;
// eliminazione di PV2. campaignZones = [PV1 5.959] ma, senza un nuovo
// "Continua", Step3 mostrava 14.127 e Step4 quotava 14.127 pz / €477,94.
// Cause:
//  A. AppRouter applicava sempre la URL di prefill (qty=14127 dell'ultimo
//     "Continua") sopra il draft persistito.
//  B. Step4 single-PV leggeva i mirror top-level (flyerQuantity,
//     fullCoverageFlyers con coverageDecision "useRecommended",
//     zonesAllocation) rimasti del PV eliminato.
// Test RUNTIME REALI: <AppRouter/> e <Step4/> renderizzati via Vite SSR.
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFileSync } from "node:fs";
import { buildMultiZoneDistributionZones, buildZoneKpiSnapshot, deleteAndActivatePointOfSale, summarizeCampaignZones } from "../src/lib/step2/campaignZonesModel.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";

const step4Source = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");
const DRAFT_KEY = "volantinipro_configurator_draft_v1";

// --- PublicRoutes stub: cattura lo stato `data` iniziale reale di AppRouter.
const STUB_SOURCE = `import React from "react";
const N = () => null;
export const PublicRoutes = (props) => { globalThis.__capturedRouterData = props.data; return null; };
export const Bootstrap = N;
export const SeoMeta = N;
export const Navbar = N;
export const StepperBar = N;
export const RouteLoadingFallback = N;
export const CustomerGuard = N;
export const AdminGuard = N;
export const SupplierGuard = N;
export default N;
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
  envPrefix: "VP_SURVIVOR_TEST_NO_ENV_",
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: "stub-approuter-children",
    enforce: "pre",
    load(id) {
      const norm = id.replace(/\\/g, "/");
      return STUB_ENDINGS.some(s => norm.endsWith(s)) ? STUB_SOURCE : null;
    },
  }],
});

function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}
const noop = () => {};
function installDom() {
  const ls = memoryStorage();
  const win = {
    location: { href: "https://www.volantinipro.it/", pathname: "/", search: "", hash: "", origin: "https://www.volantinipro.it", assign: noop, replace: noop, reload: noop },
    localStorage: ls,
    sessionStorage: memoryStorage(),
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
    catch { try { globalThis[key] = value; } catch { /* read-only */ } }
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = ls;
  globalThis.sessionStorage = win.sessionStorage;
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
  Object.assign(win.location, { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin });
}

// --- Fixture: valori reali osservati a runtime (UI, harness zero-write).
const MILANO = { id: "place.32655472", name: "Milano", label: "Milano (MI)", comune: "Milano", provincia: "MI", lat: 45.463945, lng: 9.188558, type: "comune" };
const TORINO = { label: "Via Torino,  Duomo,  Cerchia dei Navigli", lat: 45.4609464, lng: 9.184435, type: "address" };
const row = (id, name, n, extra = {}) => ({ id, name, requiredFlyers: n, assignedFlyers: n, ...extra });
const ISOLA_ROWS = [row("nil_18_11", "ISOLA", 5959, { isNil: true, territory_type: "nil", parent_municipality: "Milano", address_label: null })];
const TORINO_ROWS = [
  row("nil_0_1", "DUOMO", 8209), row("nil_4_7", "MAGENTA - S. VITTORE", 1193), row("nil_1_6", "PORTA TICINESE - CONCA DEL NAVIGLIO", 2210),
  row("nil_3_5", "PORTA VIGENTINA - PORTA LODOVICA", 1063), row("nil_2_2", "BRERA", 1065), row("nil_5_4", "GUASTALLA", 320), row("nil_6_44", "PORTA TICINESE - CONCHETTA", 67),
].map(r => ({ ...r, address_label: TORINO.label }));

function zone(id, o) {
  const q = o.finalFlyers;
  return {
    id, store_name: "", service_type: "d2d", service_variant: "a5", readyForQuote: true, calculationStatus: "success",
    assigned_flyers: q, recommended_flyers: o.required ?? q, recommendedFlyers: o.required ?? q, availableFlyers: 10000,
    coverageDecision: o.coverageDecision || "useRecommended", selectedCaps: [], capDataMap: {}, manualAssignments: {},
    allocationMode: "auto", city: MILANO, cityName: "Milano (MI)", selectedComuni: [MILANO], selectedMunicipalities: [MILANO],
    zonesAllocation: o.allocation,
    kpiSnapshot: buildZoneKpiSnapshot({ serviceKpis: { families: o.families, population: o.population }, requiredFlyers: o.required ?? q, finalFlyers: q, areaMode: o.searchMode === "address" ? "radius" : "custom_zone", analysisLevel: "nil", radiusCenter: o.selectedSearchPoint || null, radiusKm: o.radiusKm ?? null }),
    ...o,
  };
}
const PV1 = zone("pv1", { searchMode: "municipality", nilManualMode: true, finalFlyers: 5959, selected: ["nil_18_11"], selectedSearchPoint: null, radius: null, radiusKm: null, allocation: ISOLA_ROWS, families: 5417, population: 9972 });
const PV2 = zone("pv2", { searchMode: "address", cityName: "Milano", finalFlyers: 14127, selected: TORINO_ROWS.map(r => r.id), selectedSearchPoint: TORINO, radius: 1, radiusKm: 1, radiusSelectionConfirmed: true, allocation: TORINO_ROWS, families: 12843, population: 23500 });
const PV_A = zone("pa", { searchMode: "address", cityName: "Milano", finalFlyers: 10000, required: 126543, coverageDecision: "keepCurrent", selected: ["nil_x"], selectedSearchPoint: { label: "Corso Buenos Aires 10, 20124 Milano", lat: 45.47627, lng: 9.2071 }, radius: 3, radiusKm: 3, allocation: [row("nil_x", "BUENOS AIRES - VENEZIA", 10000)], families: 115039, population: 210000 });
const PV_B = zone("pb", { searchMode: "address", cityName: "Milano", finalFlyers: 12000, required: 126000, coverageDecision: "keepCurrent", selected: ["nil_y"], selectedSearchPoint: { label: "Piazza del Duomo, 20122 Milano", lat: 45.46468, lng: 9.19041 }, radius: 3, radiusKm: 3, allocation: [row("nil_y", "DUOMO", 12000)], families: 115038, population: 210000 });

// Stato dopo "Continua" con `active` attivo: mirror top-level + snapshot legacy di quel PV.
function afterContinue(zones, active) {
  return {
    type: "d2d", selectedService: "d2d", activeService: "d2d", flyerFormat: "a5", hasFlyers: "yes", alreadyPrinted: true, urgency: "normal",
    campaignZones: zones, activeZoneId: active.id,
    qty: active.finalFlyers, flyerQuantity: active.finalFlyers, flyerQuantityFromStep1: active.finalFlyers,
    coverageDecision: active.coverageDecision, fullCoverageFlyers: active.recommended_flyers, requiredTotalFlyers: active.recommended_flyers,
    searchMode: active.searchMode, cityName: active.cityName, city: MILANO, selectedComuni: [MILANO],
    selectedSearchPoint: active.selectedSearchPoint, radiusKm: active.radiusKm, zones: active.selected,
    zonesAllocation: active.allocation, addressLabel: active.selectedSearchPoint?.label || null,
    serviceKpis: { families: active.kpiSnapshot.families, population: active.kpiSnapshot.population, recommendedFlyers: active.recommended_flyers },
  };
}
// Eliminazione reale (modello Step2) del PV attivo: i mirror tornano al superstite,
// gli snapshot legacy (fullCoverageFlyers, zonesAllocation, serviceKpis...) no.
const deleteActive = state => deleteAndActivatePointOfSale(state, state.activeZoneId);

const pricePerThousand = QUOTE_PRICES.d2d;
const priceFor = z => calculateQuotePricing({ quantity: z.finalFlyers, pricePerThousand, distributionZones: resolveConfiguratorDistributionZones({ selectedComuni: z.selectedComuni, zonesAllocation: z.allocation, cityName: z.cityName, searchedLocation: z.selectedSearchPoint?.label || null }, z.finalFlyers).zones }).baseCost;
const eur = n => `€${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = n => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const textOf = html => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");

const { win } = installDom();
try {
  const { AppRouter } = await vite.ssrLoadModule("/src/app/AppRouter.jsx");
  const { Step4 } = await vite.ssrLoadModule("/src/pages/public/configurator/Step4.jsx");

  const routerInitialData = (url, draftData) => {
    win.localStorage.clear();
    if (draftData) win.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, updatedAt: "2026-10-07T00:00:00.000Z", data: draftData }));
    setLocation(win, url);
    globalThis.__capturedRouterData = null;
    renderToStaticMarkup(React.createElement(AppRouter));
    assert.ok(globalThis.__capturedRouterData, "AppRouter did not render PublicRoutes");
    return globalThis.__capturedRouterData;
  };
  const step4Text = data => textOf(renderToStaticMarkup(React.createElement(Step4, { data, setData: noop, onBack: noop, onHome: noop, goTo: noop })));

  test("1. new session: URL prefill still applies (no draft)", () => {
    const d = routerInitialData("/configuratore?service=d2d&comune=Monza&qty=10000&printed=true&format=A5&step=2", null);
    assert.equal(d.qty, 10000);
    assert.equal(d.flyerQuantity, 10000);
    assert.equal(d.cityName, "Monza");
    assert.equal(d.type, "d2d");
    assert.equal(d.flyerFormat, "a5");
  });

  test("1b. draft with only an unconfigured default PV: URL prefill still applies", () => {
    const empty = { type: "d2d", qty: 10000, campaignZones: [{ id: "z0", searchMode: "municipality", selected: [], selectedCaps: [], city: null, selectedSearchPoint: null, finalFlyers: 10000 }] };
    const d = routerInitialData("/configuratore?service=d2d&qty=20000&step=2", empty);
    assert.equal(d.qty, 20000);
    assert.equal(d.flyerQuantity, 20000);
  });

  test("2/4. existing configured 1-PV draft + stale URL qty: canonical PV wins, also on repeated loads (refresh)", () => {
    const draft = deleteActive(afterContinue([PV1, PV2], PV2));
    assert.deepEqual(draft.campaignZones.map(z => z.id), ["pv1"]);
    assert.equal(draft.qty, 5959);
    for (let load = 0; load < 2; load++) {
      const d = routerInitialData("/configuratore?service=d2d&comune=Milano&qty=14127&printed=true&format=A4&urgency=normal&step=3", draft);
      assert.equal(d.qty, 5959);
      assert.equal(d.flyerQuantity, 5959);
      assert.equal(d.flyerQuantityFromStep1, 5959);
      assert.equal(d.cityName, "Milano (MI)");
      assert.equal(d.campaignZones[0].finalFlyers, 5959);
      // i campi non posseduti dai PV restano governati dalla URL come prima
      assert.equal(d.flyerFormat, "a4");
      assert.equal(d.urgency, "normal");
    }
  });

  test("3. 2 PV -> delete active PV2 -> 1 survivor: Step4 quotes PV1 only even with polluted mirrors", () => {
    const afterDelete = deleteActive(afterContinue([PV1, PV2], PV2));
    // stato peggiore osservato: anche qty/flyerQuantity inquinati (URL pre-fix)
    const polluted = { ...afterDelete, qty: 14127, flyerQuantity: 14127, flyerQuantityFromStep1: 14127 };
    assert.equal(polluted.fullCoverageFlyers, 14127);
    assert.equal(polluted.coverageDecision, "useRecommended");
    assert.equal(polluted.zonesAllocation[0].name, "DUOMO");
    const pv1Price = priceFor(PV1);
    const pv2Price = priceFor(PV2);
    assert.notEqual(pv1Price, pv2Price);
    for (const state of [afterDelete, polluted]) {
      const t = step4Text(state);
      assert.match(t, new RegExp(`${fmtQty(5959)} pz`));
      assert.ok(t.includes(eur(pv1Price)), `missing PV1 price ${eur(pv1Price)}`);
      assert.ok(!t.includes(fmtQty(14127)), "deleted PV quantity leaked into Step4");
      assert.ok(!t.includes(eur(pv2Price)), "deleted PV price leaked into Step4");
      assert.ok(!/Via Torino|DUOMO|BRERA|GUASTALLA/.test(t), "deleted PV allocation leaked into Step4");
      // KPI e fabbisogno del superstite, non del PV eliminato
      assert.match(t, /\b5\.?417 famiglie|FAMIGLIE[^0-9]*5\.?417|\b5\.?417\b/i, "survivor families missing");
      assert.ok(!t.includes(fmtQty(12843)), "deleted PV families leaked into Step4");
      assert.ok(!t.includes(fmtQty(14127 - 5959)), "deleted PV requirement leaked into Step4");
    }
  });

  test("5. reverse ownership: PV1 radius A survives PV2 radius B deletion with A quantity/pricing only", () => {
    const afterDelete = deleteActive(afterContinue([PV_A, PV_B], PV_B));
    const t = step4Text(afterDelete);
    assert.match(t, new RegExp(`${fmtQty(10000)} pz`));
    assert.ok(t.includes(eur(priceFor(PV_A))));
    assert.ok(!t.includes(fmtQty(12000)), "PV B quantity leaked");
    assert.ok(!/Piazza del Duomo|\bDUOMO\b/.test(t), "PV B territory leaked");
  });

  test("6. normal single PV: canonical read == legacy read (no regression)", () => {
    const single = afterContinue([PV1], PV1);
    const legacy = { ...single, campaignZones: undefined };
    const canonical = step4Text(single);
    const legacyText = step4Text(legacy);
    for (const probe of [`${fmtQty(5959)} pz`, eur(priceFor(PV1))]) {
      assert.ok(canonical.includes(probe), `canonical missing ${probe}`);
      assert.ok(legacyText.includes(probe), `legacy missing ${probe}`);
    }
    // stessa pagina, stesso testo: la lettura canonica non cambia nulla quando i mirror sono coerenti
    assert.equal(canonical, legacyText);
  });

  test("7/8. normal 2-PV and 5-PV aggregates unchanged (multi path)", () => {
    const five = [PV1, PV2, PV_A, PV_B, { ...PV_A, id: "pc", finalFlyers: 7000, assigned_flyers: 7000, allocation: [row("nil_z", "ISOLA", 7000)] }];
    for (const zones of [[PV1, PV2], five]) {
      const s = summarizeCampaignZones(zones);
      const expected = calculateQuotePricing({ quantity: s.totalQuantity, pricePerThousand, distributionZones: buildMultiZoneDistributionZones(s) }).baseCost;
      const t = step4Text(afterContinue(zones, zones[zones.length - 1]));
      assert.match(t, new RegExp(`${fmtQty(s.totalQuantity)} pz`));
      assert.ok(t.includes(eur(expected)), `missing aggregate ${eur(expected)}`);
    }
  });

  test("Step4 increase-quantity keeps campaignZones[0] the owner", () => {
    assert.match(step4Source, /campaignZones: d\.campaignZones\.map\(z => z\.id === singlePointOfSale\.id \? \{ \.\.\.z, finalFlyers: target, assigned_flyers: target \} : z\)/);
    assert.match(step4Source, /const rawFlyerQty = singlePointOfSale \? singlePointOfSale\.quantity : resolveQuoteQuantity\(data\);/);
    assert.match(step4Source, /resolveConfiguratorDistributionZones\(singlePointOfSaleDistributionInput \|\| data, flyerQty\)/);
  });
} finally {
  await vite.close();
}
