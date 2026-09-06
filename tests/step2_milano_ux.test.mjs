// TICKET — STEP 2 MILANO UX UPGRADE (UX/UI only, firewall-strict).
// I helper sono PURI e presentazionali: nessun calcolo territoriale, nessuna
// nuova source of truth, nessun numero Milano hardcoded. Questo test copre i
// casi A-G del ticket.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import {
  summariseNilCoverage,
  nilModeCountLabel,
  nilStatusSummaryLine,
  neutralPriorityLabel,
  filterNilRows,
  lowCoverageMilanoCopy,
} from "../src/lib/step2/milanoNilView.js";

const step2 = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
const guidance = readFileSync(new URL("../src/pages/public/configurator/step2/MilanoGuidance.jsx", import.meta.url), "utf8");
const helper = readFileSync(new URL("../src/lib/step2/milanoNilView.js", import.meta.url), "utf8");

// ── C: ricerca NIL locale (filter-only, accent/case insensitive, no side effects)
test("C. filterNilRows: filtra per nome, accent+case insensitive, query vuota = passthrough", () => {
  const rows = [
    { type: "zone", zone: { id: "n1", name: "BRUZZANO" } },
    { type: "zone", zone: { id: "n2", name: "Affori" } },
    { type: "zone", zone: { id: "n3", name: "Città Studi" } },
    { type: "marginal-summary" },
  ];
  assert.strictEqual(filterNilRows(rows, ""), rows, "query vuota -> stesso array");
  assert.strictEqual(filterNilRows(rows, "   "), rows, "solo spazi -> passthrough");
  assert.deepEqual(filterNilRows(rows, "bruzzano").map(r => r.zone.id), ["n1"]);
  assert.deepEqual(filterNilRows(rows, "BRUZ").map(r => r.zone.id), ["n1"]);
  assert.deepEqual(filterNilRows(rows, "citta studi").map(r => r.zone.id), ["n3"], "accento tollerato");
  assert.deepEqual(filterNilRows(rows, "città").map(r => r.zone.id), ["n3"]);
  assert.deepEqual(filterNilRows(rows, "zzz"), [], "nessun match");
  // i separatori/marginal-summary spariscono durante la ricerca
  assert.ok(!filterNilRows(rows, "a").some(r => r.type === "marginal-summary"));
});

test("C. filterNilRows: NON muta gli oggetti riga (nessun effetto su selected/selZones)", () => {
  const rows = [{ type: "zone", zone: { id: "n1", name: "Niguarda", picked: true } }];
  const out = filterNilRows(rows, "nig");
  assert.strictEqual(out[0], rows[0], "stesso riferimento riga");
  assert.equal(out[0].zone.picked, true);
});

// ── D: guida bassa copertura usa quantita' e copertura REALI (no hardcoded)
test("D. lowCoverageMilanoCopy: usa i valori passati, nessun 10.000 / 1.2% hardcoded", () => {
  // NB: Node minimal-ICU non raggruppa le migliaia in it-IT ("7500" vs "7.500")
  const a = lowCoverageMilanoCopy({ quantity: 7500, coveragePct: 3.4 });
  assert.match(a, /7\.?500 volantini/);
  assert.match(a, /3\.4%/);
  assert.doesNotMatch(a, /10\.?000/);
  assert.doesNotMatch(a, /1\.2%/);
  const b = lowCoverageMilanoCopy({ quantity: 25000, coveragePct: 12 });
  assert.match(b, /25\.?000 volantini/);
  assert.match(b, /\b12%/);
  // valori mancanti -> fallback prudente, nessun crash
  const c = lowCoverageMilanoCopy({});
  assert.match(c, /la quantità attuale/);
  assert.match(c, /scegliere uno o più NIL/);
});

// ── E: label NIL mode-aware
test("E. nilModeCountLabel: Comune completo / Raggio / NIL manuale", () => {
  assert.equal(nilModeCountLabel({ availableCount: 88 }), "NIL disponibili nel Comune: 88");
  assert.equal(nilModeCountLabel({ isRadiusMode: true, intersectedCount: 12 }), "NIL intercettati dal raggio: 12");
  assert.equal(nilModeCountLabel({ nilManualMode: true, selectedCount: 3 }), "NIL selezionati: 3");
});

// ── F: priorita' — wording NEUTRO, nessun "zona migliore" / claim AI
test("F. neutralPriorityLabel: neutrale, riflette l'ordine reale, nessun claim di merito", () => {
  const auto = neutralPriorityLabel({ allocationMode: "auto", firstZoneName: "DUOMO" });
  assert.equal(auto.label, "Prima zona nell'ordine di allocazione: DUOMO");
  assert.match(auto.criterion, /allocazione automatica/i);
  const prio = neutralPriorityLabel({ allocationMode: "priority", firstZoneName: "BOVISA" });
  assert.match(prio.label, /ordine di priorità scelto: BOVISA/);
  const man = neutralPriorityLabel({ allocationMode: "manual", firstZoneName: "X" });
  assert.match(man.label, /Assegnazione manuale/);
  assert.equal(neutralPriorityLabel({ allocationMode: "auto", firstZoneName: "" }), null);
  // nessun linguaggio di raccomandazione / superiorita'
  for (const s of [auto.label, prio.label, man.label]) {
    assert.doesNotMatch(s, /miglior|consigliat|raccomand|ottimale|best|top area/i);
  }
});

test("summariseNilCoverage: conta da zonesAllocation, excluded = available - full - partial", () => {
  const alloc = [
    { allocationStatus: "full" },
    { allocationStatus: "partial" },
    { allocationStatus: "none" },
    { allocationStatus: "none" },
  ];
  assert.deepEqual(
    summariseNilCoverage({ availableCount: 88, zonesAllocation: alloc }),
    { available: 88, full: 1, partial: 1, excluded: 86, reached: 2 }
  );
  // status derivato se allocationStatus assente
  const alloc2 = [
    { assignedFlyers: 500, requiredFlyers: 500 },
    { assignedFlyers: 100, requiredFlyers: 500 },
    { assignedFlyers: 0, requiredFlyers: 500 },
  ];
  const s2 = summariseNilCoverage({ availableCount: 10, zonesAllocation: alloc2 });
  assert.deepEqual(s2, { available: 10, full: 1, partial: 1, excluded: 8, reached: 2 });
  // difensivo: piu' righe del totale -> clamp, mai negativo
  const s3 = summariseNilCoverage({ availableCount: 1, zonesAllocation: [{ allocationStatus: "full" }, { allocationStatus: "full" }] });
  assert.equal(s3.excluded, 0);
  assert.ok(s3.full <= 1);
});

test("nilStatusSummaryLine: 'N completi · N parziali · N esclusi' (§9), singolare/plurale", () => {
  assert.equal(nilStatusSummaryLine({ full: 2, partial: 1, excluded: 10 }), "2 completi · 1 parziale · 10 esclusi");
  assert.equal(nilStatusSummaryLine({ full: 1, partial: 0, excluded: 1 }), "1 completo · 1 escluso");
  assert.equal(nilStatusSummaryLine({ full: 0, partial: 0, excluded: 0 }), "");
});

// ── A/B: gating su Milano, nessuna regressione altri comuni
test("A/B. MilanoGuidance renderizzata SOLO se municipio = Milano; nessun impatto altrove", () => {
  // in Step2.jsx: visible gated su isResidentialStep2 && hasMilanoTerritory
  assert.match(step2, /const milanoUxVisible = isResidentialStep2 && hasMilanoTerritory;/);
  assert.match(step2, /<MilanoGuidance\s+visible=\{milanoUxVisible\}/);
  // il componente esce subito se !visible -> zero markup per Varedo & co.
  assert.match(guidance, /if \(!visible\) return null;/);
});

test("A/B. il filtro NIL e' SOLO visivo: non tocca selected/selZones/allocazione", () => {
  // milanoFilteredZoneRows deriva da zoneRowsForList; passato SOLO al pannello lista
  assert.match(step2, /const milanoFilteredZoneRows = useMemo\(/);
  assert.match(step2, /milanoUxVisible && !isRadiusMode && nilQuery \? filterNilRows\(zoneRowsForList, nilQuery\) : zoneRowsForList/);
  assert.match(step2, /zoneRowsForList=\{milanoFilteredZoneRows\}/);
  // nilQuery NON compare in nessun setSelected / setSelZones / setData
  assert.doesNotMatch(step2, /setSelected\([^)]*nilQuery/);
  assert.doesNotMatch(step2, /nilQuery[\s\S]{0,40}setSelected/);
});

// ── G: no hardcoded Milano numbers, responsive markup
test("G. nessun numero Milano hardcoded nei nuovi file", () => {
  for (const [name, src] of [["MilanoGuidance.jsx", guidance], ["milanoNilView.js", helper]]) {
    assert.doesNotMatch(src, /\b88\b/, `${name}: 88 NIL hardcoded`);
    assert.doesNotMatch(src, /744[.,]?299|818[.,]?723/, `${name}: totali Milano hardcoded`);
    assert.doesNotMatch(src, /\bDUOMO\b/, `${name}: DUOMO hardcoded`);
    assert.doesNotMatch(src, /1[.,]2\s*%/, `${name}: copertura hardcoded`);
    assert.doesNotMatch(src, /10[.,]000/, `${name}: 10.000 hardcoded`);
  }
});

test("G. responsive: griglia summary si adatta a mobile, input NIL full-width, nessun overflow forzato", () => {
  assert.match(guidance, /gridTemplateColumns: isMobile \? "1fr 1fr" : "repeat\(4, 1fr\)"/);
  assert.match(guidance, /flex: "1 1 180px"[\s\S]{0,60}minWidth: 0/);
  assert.match(guidance, /flexWrap: "wrap"/);
  assert.match(guidance, /whiteSpace: "nowrap"/); // chip mode non vanno a capo dentro la pill
  assert.match(guidance, /boxSizing: "border-box"/);
});

test("Municipio: NON implementato (dati reali assenti) -> chip disabilitato 'Disponibile prossimamente'", () => {
  assert.match(guidance, /Municipio · Disponibile prossimamente/);
  assert.match(guidance, /chipBtn\(false, true\)\} disabled title="Suddivisione per Municipio/);
  // nessun mapping municipio->NIL inventato
  assert.doesNotMatch(guidance, /municipi?o[A-Za-z]*\s*[:=]\s*\[/i);
});

test("firewall: i nuovi file non importano core data/logic vietati", () => {
  for (const src of [guidance, helper]) {
    assert.doesNotMatch(src, /useServiceAnalysis|analysis-istat|sectors-api|useSectors|pricing|supabase|buildServiceAnalysisRequest/);
    assert.doesNotMatch(src, /fetch\(|createClient|\.rpc\(/);
  }
  // MilanoGuidance riusa SOLO handler esistenti (nessuna nuova mode-state logic)
  assert.match(step2, /onShowNil=\{switchToNilMode\}/);
  assert.match(step2, /onUseRadius=\{switchToRadiusMode\}/);
  assert.match(step2, /onKeepMilanoComplete=\{switchToComuneMode\}/);
});

// ── A/B runtime: SSR reale di <Step2/> — Milano mostra la guida, Varedo no ──
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

const milanoData = () => ({
  activeService: "d2d", selectedService: "d2d", type: "d2d",
  qty: 10000, flyerQuantity: 10000, flyerQuantityFromStep1: 10000,
  searchMode: "municipality", campaignZones: [], distributionTargets: ["all"], activityType: "retail",
  cityName: "Milano",
  city: { name: "Milano", label: "Milano", comune: "Milano", municipality_code: "015146", istat_code: "015146", lat: 45.4642, lng: 9.19, provincia: "MI" },
});
const varedoData = () => ({ ...milanoData(), cityName: "Varedo", city: { name: "Varedo", label: "Varedo", comune: "Varedo", municipality_code: "108048", lat: 45.5986, lng: 9.1497, provincia: "MB" } });

try {
  const mod = await vite.ssrLoadModule("/src/pages/public/configurator/Step2.jsx");
  const Step2 = mod.Step2 || mod.default;
  const renderStep2 = (data) => renderToStaticMarkup(React.createElement(Step2, { data, setData: noop, onNext: noop, onBack: noop, onAssistantContextChange: noop }));

  test("A. Milano: la guida UX Milano E' presente, con mode chips + Municipio disabilitato + ricerca NIL", () => {
    const html = renderStep2(milanoData());
    assert.match(html, /vp-step2-milano-guidance/, "container guida presente");
    assert.match(html, /Milano · scegli come distribuire/);
    assert.match(html, /Milano completo/);
    assert.match(html, /Municipio · Disponibile prossimamente/);
    assert.match(html, /Cerca NIL \/ quartiere/, "campo ricerca NIL presente");
    assert.match(html, /NIL disponibili nel Comune/, "label mode-aware presente");
    assert.doesNotMatch(html, /Impossibile caricare la pagina/);
  });

  test("B. Varedo: NESSUNA guida UX Milano; Step 2 normale, nessun crash", () => {
    const html = renderStep2(varedoData());
    assert.doesNotMatch(html, /vp-step2-milano-guidance/);
    assert.doesNotMatch(html, /Milano · scegli come distribuire/);
    assert.doesNotMatch(html, /Municipio · Disponibile prossimamente/);
    assert.doesNotMatch(html, /Impossibile caricare la pagina/);
    assert.ok(html.length > 0);
  });
} finally {
  await vite.close();
}
