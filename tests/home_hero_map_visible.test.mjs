// HOTFIX HOMEPAGE — la mappa hero deve restare SEMPRE visibile anche quando i
// dati territoriali (useServiceAnalysis) sono in loading, in errore o a zero
// zone. Prima del fix `Step2Map` era montata solo con `{!unavailable && ...}`,
// quindi al termine di un'analisi in errore/zero-zone veniva SMONTATA e la
// meta' destra della hero restava vuota.
//
// Test RUNTIME (react-test-renderer + act): Step2Map e useServiceAnalysis sono
// stub controllabili; il resto di VolantiniProHeroMap e' reale.
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STEP2MAP_STUB = `import React from "react";
let mounts = 0;
export const Step2Map = (props) => {
  React.useEffect(() => {
    mounts += 1;
    globalThis.__S2M_MOUNTS__ = mounts;
    return () => { globalThis.__S2M_UNMOUNTS__ = (globalThis.__S2M_UNMOUNTS__ || 0) + 1; };
  }, []);
  return React.createElement("div", {
    "data-step2map": "1",
    "data-zones": String((props.zonesWithCoords || []).length),
    "data-selected": String((props.selected || []).length),
    "data-radius": String(props.radius),
    "data-interactive": String(props.interactive),
  });
};
export default Step2Map;
`;

const USE_SA_STUB = `export function useServiceAnalysis() {
  return globalThis.__HERO_SA__ || { data: null, loading: true, error: null };
}
export default useServiceAnalysis;
`;

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  logLevel: "silent",
  envPrefix: "VP_HERO_TEST_NO_ENV_",
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: "stub-hero-deps",
      enforce: "pre",
      load(id) {
        const norm = id.replace(/\\/g, "/");
        if (norm.endsWith("/components/Step2Map.jsx")) return STEP2MAP_STUB;
        if (norm.endsWith("/hooks/useServiceAnalysis.js")) return USE_SA_STUB;
        return null;
      },
    },
  ],
});

const noop = () => {};
function installDom() {
  const listeners = {};
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    location: { href: "https://www.volantinipro.it/", pathname: "/", search: "", hash: "" },
    scrollTo: noop,
  };
  const styleEls = new Map();
  const doc = {
    getElementById: (id) => styleEls.get(id) || null,
    createElement: () => {
      const el = { id: "", textContent: "", setAttribute: noop, appendChild: noop };
      return el;
    },
    head: { appendChild: (el) => { if (el && el.id) styleEls.set(el.id, el); } },
    body: { appendChild: noop, removeChild: noop },
    addEventListener: noop,
    removeEventListener: noop,
  };
  const define = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch { try { globalThis[k] = v; } catch {} } };
  globalThis.window = win;
  globalThis.document = doc;
  define("navigator", { userAgent: "node-test" });
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  // IntersectionObserver lasciato undefined: useInViewOnce fa setVisible(true).
}

function geoJsonPolygon() {
  return JSON.stringify({ type: "Polygon", coordinates: [[[9.16, 45.55], [9.19, 45.55], [9.19, 45.57], [9.16, 45.57], [9.16, 45.55]]] });
}

function validData() {
  return {
    data: {
      comuni_breakdown: [
        { comune_name: "Cormano", comune_code: "015086", households_in_radius: 1200, pct_copertura: 82, geometry_geojson: geoJsonPolygon() },
        { comune_name: "Bresso", comune_code: "015036", households_in_radius: 900, pct_copertura: 74, geometry_geojson: geoJsonPolygon() },
      ],
      values: { copertura_stimata: 78 },
    },
    loading: false,
    error: null,
  };
}

function countMaps(renderer) {
  return renderer.root.findAll((n) => n.props && n.props["data-step2map"] === "1");
}
function textOf(renderer) {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string") { out.push(n); return; }
    if (!n) return;
    const kids = n.children || [];
    for (const k of kids) walk(k);
  };
  walk(renderer.toJSON());
  return out.join(" ");
}

let VolantiniProHeroMap;
try {
  ({ VolantiniProHeroMap } = await vite.ssrLoadModule("/src/components/home/VolantiniProHeroMap.jsx"));
  installDom();

  const mount = () => {
    let r;
    act(() => { r = TestRenderer.create(React.createElement(VolantiniProHeroMap, {})); });
    return r;
  };

  test("A) loading=true → la mappa e' presente", () => {
    globalThis.__HERO_SA__ = { data: null, loading: true, error: null };
    const r = mount();
    assert.equal(countMaps(r).length, 1, "Step2Map deve essere montata durante il loading");
    act(() => r.unmount());
  });

  test("B) loading=false + dati validi → mappa presente con poligoni (zone passate)", () => {
    globalThis.__HERO_SA__ = validData();
    const r = mount();
    const maps = countMaps(r);
    assert.equal(maps.length, 1);
    assert.equal(maps[0].props["data-zones"], "2", "le 2 zone devono arrivare a Step2Map");
    assert.equal(maps[0].props["data-selected"], "2");
    assert.equal(maps[0].props["data-radius"], "3");
    act(() => r.unmount());
  });

  test("C) loading=false + error → mappa presente, KPI fallback n/d, nessuna meta' vuota", () => {
    globalThis.__HERO_SA__ = { data: null, loading: false, error: new Error("boom") };
    const r = mount();
    assert.equal(countMaps(r).length, 1, "Step2Map non deve sparire in errore");
    const txt = textOf(r);
    assert.match(txt, /n\/d/, "i KPI devono mostrare il fallback n/d");
    assert.match(txt, /momentaneamente non disponibili/i, "badge dati non tecnico");
    assert.match(txt, /GPS, prove fotografiche/i, "la card benefici statica resta montata");
    act(() => r.unmount());
  });

  test("D) loading=false + zones=[] → mappa presente + fallback, nessun blank", () => {
    globalThis.__HERO_SA__ = { data: { comuni_breakdown: [] }, loading: false, error: null };
    const r = mount();
    const maps = countMaps(r);
    assert.equal(maps.length, 1);
    assert.equal(maps[0].props["data-zones"], "0");
    const txt = textOf(r);
    assert.match(txt, /Dati comune non disponibili|momentaneamente non disponibili/i);
    act(() => r.unmount());
  });

  test("E) refresh/transition loading→error: la mappa NON viene smontata/rimontata", () => {
    // I contatori del modulo stub sono cumulativi tra i test: misuro i DELTA
    // all'interno di questo caso, non i valori assoluti.
    const mountsBefore = globalThis.__S2M_MOUNTS__ || 0;
    const unmountsBefore = globalThis.__S2M_UNMOUNTS__ || 0;

    globalThis.__HERO_SA__ = { data: null, loading: true, error: null };
    let r;
    act(() => { r = TestRenderer.create(React.createElement(VolantiniProHeroMap, {})); });
    assert.equal(countMaps(r).length, 1);
    assert.equal((globalThis.__S2M_MOUNTS__ || 0) - mountsBefore, 1, "un solo mount iniziale");

    // l'analisi termina in errore (era il caso che prima smontava la mappa)
    globalThis.__HERO_SA__ = { data: null, loading: false, error: new Error("late error") };
    act(() => { r.update(React.createElement(VolantiniProHeroMap, {})); });

    assert.equal(countMaps(r).length, 1, "mappa ancora presente dopo la transizione");
    assert.equal((globalThis.__S2M_MOUNTS__ || 0) - mountsBefore, 1, "nessun remount di Step2Map");
    assert.equal((globalThis.__S2M_UNMOUNTS__ || 0) - unmountsBefore, 0, "Step2Map mai smontata durante la vita della pagina");

    // e ancora presente dopo un ulteriore ciclo (zero-zone)
    globalThis.__HERO_SA__ = { data: { comuni_breakdown: [] }, loading: false, error: null };
    act(() => { r.update(React.createElement(VolantiniProHeroMap, {})); });
    assert.equal(countMaps(r).length, 1);
    assert.equal((globalThis.__S2M_MOUNTS__ || 0) - mountsBefore, 1);
    assert.equal((globalThis.__S2M_UNMOUNTS__ || 0) - unmountsBefore, 0);
    act(() => r.unmount());
  });
} finally {
  await vite.close();
}
