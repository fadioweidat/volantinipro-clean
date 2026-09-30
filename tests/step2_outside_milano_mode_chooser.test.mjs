// STEP 2 — UX FUORI MILANO: due card d'ingresso (Comuni / Raggio).
// Gate SOLO presentazionale: le card chiamano gli handler canonici di Step2
// (switchToComuneMode / switchToRadiusMode) e la modalità è derivata da stati
// esistenti. Milano, CAP, Hand to Hand/Business e il riepilogo con "Continua"
// non devono cambiare. SSR reale di <Step2/> (stesso harness di
// tests/step2_milano_ux.test.mjs).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";
import { createServer } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const step2Src = read("../src/pages/public/configurator/Step2.jsx");
const chooserSrc = read("../src/pages/public/configurator/step2/OutsideMilanoCoverageModeChooser.jsx");
const controlsSrc = read("../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx");

// ── DOM minimo + Vite SSR (Step2Map e framer-motion stubbati) ────────────────
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
  configFile: false,
  esbuild: { jsx: "automatic" },
  server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: "stub-step2-heavy", enforce: "pre",
    resolveId(s) { return s === "framer-motion" ? "\0fm" : null; },
    load(id) { if (id === "\0fm") return STUB_MOTION; const n = id.replace(/\\/g, "/"); return n.endsWith("/components/Step2Map.jsx") ? STUB_MAP : null; },
  }],
});
const Step2 = (await vite.ssrLoadModule("/src/pages/public/configurator/Step2.jsx")).Step2;
const chooserModule = await vite.ssrLoadModule("/src/pages/public/configurator/step2/OutsideMilanoCoverageModeChooser.jsx");
const { OutsideMilanoCoverageModeChooser, deriveOutsideMilanoMode, isOutsideMilanoGuidedView } = chooserModule;

const origLog = console.log;
const renderStep2 = (data) => {
  console.log = noop; // silenzia i diagnostici POI di Step2 durante l'SSR
  try { return renderToStaticMarkup(React.createElement(Step2, { data, setData: noop, onNext: noop, onBack: noop, onAssistantContextChange: noop })); }
  finally { console.log = origLog; }
};

const common = { activeService: "d2d", selectedService: "d2d", type: "d2d", qty: 10000, flyerQuantity: 10000, flyerQuantityFromStep1: 10000, searchMode: "municipality", campaignZones: [], distributionTargets: ["all"], activityType: "retail" };
const milano = () => ({ ...common, cityName: "Milano", city: { name: "Milano", label: "Milano", comune: "Milano", municipality_code: "015146", istat_code: "015146", lat: 45.4642, lng: 9.19, provincia: "MI" } });
const seveso = () => ({ ...common, cityName: "Seveso", city: { name: "Seveso", label: "Seveso (MB)", comune: "Seveso", municipality_code: "108040", lat: 45.6475, lng: 9.1417, provincia: "MB" } });

const CHOOSER = /data-testid="outside-milano-mode-chooser"/;
const pressed = (html, which) => (html.match(new RegExp(`aria-pressed="(true|false)"[^>]*data-testid="outside-milano-mode-${which}"`)) || [])[1];
const stripChooser = (html) => html.replace(/<section class="vp-milano-mode"[^>]*data-testid="outside-milano-mode-chooser"[\s\S]*?<\/section>/, "");
// Blocco avanzato (riepilogo zone + Auto/Priorità/Manuale) e riepilogo finale.
const ADVANCED = /vp-selected-zones-summary/;
const SUMMARY_TAIL = /Assicurati che tutte le zone abbiano un(&#x27;|')area geografica e una quantità di volantini valida\./;

// ── Derivazione pura della modalità ──────────────────────────────────────────
test("perimetro: solo residenziale, fuori Milano, vista cliente, non CAP, con comune", () => {
  const base = { isResidentialStep2: true, hasMilanoTerritory: false, isAdminView: false, isCapMode: false, hasCity: true };
  assert.equal(isOutsideMilanoGuidedView(base), true);
  assert.equal(isOutsideMilanoGuidedView({ ...base, hasMilanoTerritory: true }), false, "Milano: mai la UX Comuni");
  assert.equal(isOutsideMilanoGuidedView({ ...base, isCapMode: true }), false, "modalità CAP invariata");
  assert.equal(isOutsideMilanoGuidedView({ ...base, isAdminView: true }), false, "report avanzato invariato");
  assert.equal(isOutsideMilanoGuidedView({ ...base, isResidentialStep2: false }), false, "H2H/Business invariati");
  assert.equal(isOutsideMilanoGuidedView({ ...base, hasCity: false }), false, "nessun comune: niente card");
});

test("modalità derivata: Seveso comune / raggio / Seveso+Meda / rientro da Step 3", () => {
  const none = { isRadiusMode: false, addressFullCoverageConfirmed: false, selectedComuniCount: 1, coverageDecision: null };
  assert.equal(deriveOutsideMilanoMode(none), null, "comune appena scelto: nessuna modalità -> solo le due card");
  assert.equal(deriveOutsideMilanoMode({ ...none, addressFullCoverageConfirmed: true }), "comuni", "dopo «Scegli comuni» (switchToComuneMode)");
  assert.equal(deriveOutsideMilanoMode({ ...none, isRadiusMode: true }), "radius", "dopo «Usa un raggio» (switchToRadiusMode)");
  assert.equal(deriveOutsideMilanoMode({ ...none, isRadiusMode: true, addressFullCoverageConfirmed: true, selectedComuniCount: 3 }), "radius", "il raggio non diventa mai comune completo");
  assert.equal(deriveOutsideMilanoMode({ ...none, selectedComuniCount: 2 }), "comuni", "Seveso + Meda");
  for (const decision of ["keepCurrent", "useRecommended", "manual"]) {
    assert.equal(deriveOutsideMilanoMode({ ...none, coverageDecision: decision }), "comuni", `rientro da Step 3 con decisione ${decision}`);
  }
});

// ── Componente: due sole card, nessuna logica ────────────────────────────────
test("card: esattamente due, testi approvati, nessuna terza card «Tutto il comune»", () => {
  const html = renderToStaticMarkup(React.createElement(OutsideMilanoCoverageModeChooser, { mode: null, comuneLabel: "Seveso", onChooseComuni: noop, onChooseRadius: noop }));
  assert.equal((html.match(/<button\b/g) || []).length, 2);
  for (const text of [
    "Come vuoi distribuire a Seveso?",
    "Scegli uno o più comuni", "Seleziona uno o più comuni da coprire completamente o in sequenza.", "Esempio: Seveso, Meda, Seregno", "Scegli comuni →",
    "Distribuisci intorno a un punto", "Partiamo dall&#x27;indirizzo scelto e copriamo l&#x27;area entro una distanza selezionata.", "500 m · 1 km · 2 km · 3 km", "Usa un raggio →",
  ]) assert.ok(html.includes(text), text);
  // Solo testo visibile (la classe CSS condivisa "is-nil" non è contenuto).
  const visibleText = html.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visibleText, /Tutto il comune|tutto il comune|Distribuisci in tutto|quartier|\bNIL\b/);
  assert.equal(pressed(html, "comuni"), "false");
  assert.equal(pressed(html, "radius"), "false");
});

test("card: stato selezionato e click -> SOLO gli handler ricevuti, una volta", () => {
  const calls = [];
  const props = { comuneLabel: "Seveso", onChooseComuni: () => calls.push("comuni"), onChooseRadius: () => calls.push("radius") };
  const comuni = renderToStaticMarkup(React.createElement(OutsideMilanoCoverageModeChooser, { ...props, mode: "comuni" }));
  assert.equal(pressed(comuni, "comuni"), "true"); assert.equal(pressed(comuni, "radius"), "false");
  assert.match(comuni, /✓ Comuni selezionato/); assert.match(comuni, /Usa un raggio →/);
  const radius = renderToStaticMarkup(React.createElement(OutsideMilanoCoverageModeChooser, { ...props, mode: "radius" }));
  assert.equal(pressed(radius, "radius"), "true"); assert.equal(pressed(radius, "comuni"), "false");
  assert.match(radius, /✓ Raggio selezionato/); assert.match(radius, /Scegli comuni →/);

  let tree;
  act(() => { tree = TestRenderer.create(React.createElement(OutsideMilanoCoverageModeChooser, { ...props, mode: null })); });
  const buttons = tree.root.findAllByType("button");
  assert.equal(buttons.length, 2);
  act(() => buttons[0].props.onClick());
  act(() => buttons[1].props.onClick());
  assert.deepEqual(calls, ["comuni", "radius"]);
  act(() => tree.unmount());
});

// ── Step 2 reale (SSR) ───────────────────────────────────────────────────────
test("SEVESO appena scelto: solo le due card, configurazione avanzata nascosta, riepilogo invariato", () => {
  const html = renderStep2(seveso());
  assert.match(html, CHOOSER);
  assert.match(html, /Come vuoi distribuire a Seveso\?/);
  assert.equal(pressed(html, "comuni"), "false");
  assert.equal(pressed(html, "radius"), "false");
  assert.doesNotMatch(html, /data-testid="milano-mode-chooser"|Scegli uno o più quartieri|Distribuisci in tutto Milano/);
  assert.doesNotMatch(html, ADVANCED, "riepilogo zone + Auto/Priorità/Manuale non ancora mostrati");
  assert.match(html, SUMMARY_TAIL, "il riepilogo con le azioni di avanzamento resta quello di prima");
  assert.doesNotMatch(html, /Impossibile caricare la pagina/);
});

test("SEVESO → Raggio: modalità raggio esistente, mai trasformata in comune completo", () => {
  const html = renderStep2({ ...seveso(), searchMode: "address" });
  assert.match(html, CHOOSER);
  assert.equal(pressed(html, "radius"), "true");
  assert.equal(pressed(html, "comuni"), "false");
  assert.doesNotMatch(html, /✓ Comuni selezionato/);
  assert.match(html, SUMMARY_TAIL);
  assert.match(stripChooser(html), /Raggio/, "UI raggio esistente presente sotto le card");
});

test("RIENTRO da Step 3 (decisione quantità già presa): Comuni già scelto, UI completa", () => {
  for (const coverageDecision of ["keepCurrent", "useRecommended"]) {
    const html = renderStep2({ ...seveso(), coverageDecision });
    assert.match(html, CHOOSER);
    assert.equal(pressed(html, "comuni"), "true", coverageDecision);
    assert.match(html, ADVANCED, "configurazione avanzata visibile senza dover riscegliere");
    assert.match(html, /Quantità inserita[^<]*<[^>]*>\s*10\.?000|10\.?000 volantini/, "quantità 10.000 conservata");
    assert.match(html, SUMMARY_TAIL);
  }
});

test("dopo la scelta, tolte le card, l'HTML contiene TUTTA la UI esistente (nessun pannello perso)", () => {
  const awaiting = renderStep2(seveso());
  const chosen = renderStep2({ ...seveso(), coverageDecision: "keepCurrent" });
  const rest = stripChooser(chosen);
  assert.doesNotMatch(rest, CHOOSER);
  assert.ok(rest.length > stripChooser(awaiting).length, "il blocco avanzato ricompare dopo la scelta");
  assert.match(rest, ADVANCED);
  for (const label of ["Auto", "Priorità", "Manuale"]) assert.ok(rest.includes(label), label);
});

test("modalità CAP fuori Milano: nessuna card, invariata", () => {
  const html = renderStep2({ ...seveso(), searchMode: "cap" });
  assert.doesNotMatch(html, CHOOSER);
  assert.doesNotMatch(html, /Scegli uno o più comuni/);
});

test("Hand to Hand fuori Milano: nessuna card (perimetro solo residenziale, come la UX Milano)", () => {
  const html = renderStep2({ ...seveso(), activeService: "h2h", selectedService: "h2h", type: "h2h" });
  assert.doesNotMatch(html, CHOOSER);
});

test("MILANO invariata: Quartieri + Raggio + «tutto Milano», mai la UX Comuni", () => {
  const variants = {
    comune: milano(),
    oroboni: { ...milano(), selectedSearchPoint: { label: "Via Antonio Oroboni, 20161 Milano", lat: 45.525, lng: 9.176, type: "address", parentComune: "Milano" } },
    raggio: { ...milano(), searchMode: "address" },
  };
  for (const [name, data] of Object.entries(variants)) {
    const html = renderStep2(data);
    assert.match(html, /data-testid="milano-mode-chooser"/, name);
    assert.match(html, /Scegli uno o più quartieri/, name);
    assert.match(html, /Distribuisci intorno a un punto/, name);
    assert.match(html, /Distribuisci in tutto Milano/, name);
    assert.doesNotMatch(html, CHOOSER, name);
    assert.doesNotMatch(html, /Scegli uno o più comuni|Scegli comuni →/, name);
    assert.match(html, /data-testid="milano-territory-summary"/, name);
  }
  assert.match(renderStep2(variants.oroboni), /data-testid="milano-address-context"/, "riferimento indirizzo via Oroboni");
  assert.doesNotMatch(renderStep2({ ...milano(), searchMode: "cap" }), /outside-milano|milano-mode-chooser/, "Milano CAP invariata");
});

// ── Contratto sorgente: gate UX, nessun motore duplicato ─────────────────────
test("le card chiamano SOLO switchToComuneMode / switchToRadiusMode (gli stessi delle linguette)", () => {
  assert.match(step2Src, /onChooseComuni=\{switchToComuneMode\}/);
  assert.match(step2Src, /onChooseRadius=\{switchToRadiusMode\}/);
  assert.match(step2Src, /const switchToComuneMode = \(\) => \{/);
  assert.match(step2Src, /const switchToRadiusMode = \(\) => \{/);
  assert.match(controlsSrc, /<button onClick=\{switchToComuneMode\}/);
  assert.match(controlsSrc, /<button onClick=\{switchToRadiusMode\}/);
});

test("nessuno state, effetto, fetch o calcolo nel componente card", () => {
  assert.doesNotMatch(chooserSrc, /useState|useEffect|useMemo|useRef|useReducer|fetch\(|supabase|import\.meta/);
  assert.doesNotMatch(chooserSrc, /pricing|allocation|coverage_percent|requiredFlyers|families|zonesAllocation/i);
  const imports = [...chooserSrc.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["react", "../../../../components/Step1Icon.jsx"]);
  assert.doesNotMatch(step2Src, /useState\([^)]*\)[^\n]*outsideMilano|\[outsideMilano\w*, set/);
});

test("il gate nasconde SOLO la configurazione avanzata: riepilogo e «Continua» non toccati", () => {
  assert.equal((step2Src.match(/outsideMilanoAwaitingChoice/g) || []).length, 3, "definizione + 2 punti di rendering");
  assert.match(step2Src, /\{!milanoClientView && !outsideMilanoAwaitingChoice && <SelectedZonesSummary/);
  assert.match(step2Src, /\{!milanoClientView && !outsideMilanoAwaitingChoice && renderComunePanel\(\)\}/);
  // Step2SummaryPanel (contiene Step2BottomActions / "Continua") resta nel
  // ramo "non Milano" senza alcuna condizione aggiuntiva.
  assert.match(step2Src, /\/> : <Step2SummaryPanel\n/);
  assert.doesNotMatch(step2Src, /outsideMilano[^\n]*Step2SummaryPanel|outsideMilano[^\n]*Step2BottomActions|outsideMilano[^\n]*handleNext|outsideMilano[^\n]*canContinue/);
  // Il selettore Milano usa ancora la propria condizione, non quella nuova.
  assert.match(step2Src, /const milanoClientView = milanoUxVisible && !isAdminView && !isCapMode;/);
  assert.match(step2Src, /const milanoClientMode = nilManualMode \? "nil" : isRadiusMode \? "radius" : addressFullCoverageConfirmed \? "municipality" : null;/);
});

test("raggio POI invariato (15 km in analisi NIL): fuori dal perimetro di questo ticket", () => {
  assert.match(step2Src, /requestedAnalysisLevel === "nil" \? Math\.max\(15, numericRadiusKm\)/);
  assert.match(step2Src, /usePoi\(poiCenterLat, poiCenterLng, poiEffectiveRadiusKm, svcType, distributionTargetSelection\)/);
});

after(async () => {
  try {
    await vite.close();
    await vite.watcher?.close();
  } catch (e) {}
  setTimeout(() => {
    const handles = process._getActiveHandles?.() || [];
    for (const h of handles) {
      if (typeof h.unref === "function") h.unref();
      if (typeof h.close === "function" && h.constructor?.name !== "WriteStream" && h.constructor?.name !== "ReadStream") {
        try { h.close(); } catch (e) {}
      }
    }
  }, 50);
});
