// ISOLAMENTO PV (multi punto vendita). Ogni campaignZone e' l'unica fonte del
// proprio territorio / indirizzo / modalita' / quantita'. Regressioni coperte
// (accettazione runtime locale 2026-10-06, fallita con la suite verde):
//  A. elimina PV attivo -> il territorio del PV eliminato finiva nel nuovo
//     attivo (Rho con NIL di Milano; ISOLA -> Milano intero 88 NIL / 818.723).
//  B. switch Milano NIL -> Milano Raggio riscriveva il Raggio (14.127 ->
//     10.548 -> 8.209, solo DUOMO): analisi del PV precedente usata dal nuovo.
//  C. coverage.address top-level usato come fallback: "Raggio da <indirizzo di
//     un altro PV>" e tab Raggio che copiava l'indirizzo altrui.
//  + rimontaggio Step2 (indietro da Step4) che scriveva allocazione vuota /
//    10.000 sul PV NIL prima dell'arrivo dell'analisi.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  activatePointOfSale,
  buildActivePointOfSaleState,
  deleteAndActivatePointOfSale,
  isZoneAnalysisDataUsable,
  nextZoneAnalysisOwner,
  resolvePointOfSaleCoverageAddress,
  shouldAdoptZoneAnalysis,
  summarizeCampaignZones,
} from "../src/lib/step2/campaignZonesModel.js";
import { useServiceAnalysis } from "../src/hooks/useServiceAnalysis.js";

const step2 = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");

const MILANO = { name: "Milano", label: "Milano", lat: 45.4641943, lng: 9.1896346 };
const MONZA = { name: "Monza", label: "Monza (MB)", lat: 45.5845, lng: 9.2749 };
const CORMANO = { name: "Cormano", label: "Cormano (MI)", lat: 45.544, lng: 9.1708 };
const RHO = { name: "Rho", label: "Rho (MI)", lat: 45.531, lng: 9.0463 };
const VIA_TORINO = { label: "Via Torino, Duomo, Cerchia dei Navigli", lat: 45.4609464, lng: 9.184435, type: "address" };
const CORSO_COMO = { label: "Corso Como, GARIBALDI REPUBBLICA, Municipio 9", lat: 45.4817426, lng: 9.1872468, type: "address" };
const alloc = (...names) => names.map((name, i) => ({ id: `nil_${name}`, name, assignedFlyers: 1000 + i, requiredFlyers: 1000 + i }));

const ISOLA = {
  id: "pv_isola", store_name: "Negozio Isola", service_type: "d2d", service_variant: "a5", searchMode: "municipality",
  city: MILANO, cityName: "Milano", selected: ["nil_17_11"], selectedSearchPoint: CORSO_COMO, nilManualMode: true,
  addressFullCoverageConfirmed: true, assigned_flyers: 5959, finalFlyers: 5959, availableFlyers: 10000,
  coverageDecision: "useRecommended", zonesAllocation: alloc("ISOLA"), readyForQuote: true,
  coverage: { address: { label: CORSO_COMO.label, lat: CORSO_COMO.lat, lng: CORSO_COMO.lng, municipality: "Milano" } },
  kpiSnapshot: { analysisLevel: "nil", areaMode: "custom_zone", families: 5417 },
};
const CENTRO = {
  id: "pv_centro", store_name: "Negozio Centro", service_type: "d2d", service_variant: "a5", searchMode: "address",
  city: MILANO, cityName: "Milano", radius: 1, radiusKm: 1, selectedSearchPoint: VIA_TORINO,
  selected: ["nil_0_1", "nil_4_7", "nil_1_6", "nil_3_5", "nil_2_2", "nil_5_4", "nil_6_44"],
  assigned_flyers: 14127, finalFlyers: 14127, availableFlyers: 10000, coverageDecision: "useRecommended",
  radiusSelectionConfirmed: true, readyForQuote: true,
  zonesAllocation: alloc("DUOMO", "MAGENTA - S. VITTORE", "PORTA TICINESE - CONCA DEL NAVIGLIO", "PORTA VIGENTINA - PORTA LODOVICA", "BRERA", "GUASTALLA", "PORTA TICINESE - CONCHETTA"),
  coverage: { address: { label: VIA_TORINO.label, lat: VIA_TORINO.lat, lng: VIA_TORINO.lng, municipality: "Milano" } },
  kpiSnapshot: { analysisLevel: "nil", areaMode: "radius", families: 12843 },
};
const MONZA_PV = {
  id: "pv_monza", store_name: "Filiale Monza", service_type: "d2d", searchMode: "municipality", city: MONZA, cityName: "Monza (MB)",
  selected: ["api_0_108033"], addressFullCoverageConfirmed: true, assigned_flyers: 10000, finalFlyers: 10000,
  availableFlyers: 10000, coverageDecision: "keepCurrent", zonesAllocation: alloc("Monza"), readyForQuote: true,
};
const CORMANO_PV = {
  id: "pv_cormano", store_name: "Negozio Cormano", service_type: "d2d", searchMode: "address", city: CORMANO, cityName: "Cormano (MI)",
  radius: 2, radiusKm: 2, assigned_flyers: 10000, finalFlyers: 10000, availableFlyers: 10000, coverageDecision: "keepCurrent",
  zonesAllocation: alloc("Cormano", "Cusano Milanino", "Bresso"), readyForQuote: true,
};
const RHO_PV = {
  id: "pv_rho", store_name: "Negozio Rho", service_type: "d2d", searchMode: "municipality", city: RHO, cityName: "Rho (MI)",
  addressFullCoverageConfirmed: true, assigned_flyers: 24304, finalFlyers: 24304, availableFlyers: 10000,
  coverageDecision: "useRecommended", zonesAllocation: alloc("Rho"), readyForQuote: true,
};
const FIVE = [ISOLA, CENTRO, MONZA_PV, CORMANO_PV, RHO_PV];

// Stato "di lavoro" top-level come lo lascia Step2 quando `activeZoneId` e' attivo.
function workingStateOf(zone, zones = FIVE, extra = {}) {
  return { campaignBaseQuantity: 10000, ...activatePointOfSale({ campaignZones: zones, activeZoneId: zone.id, ...extra }, zone.id), ...extra };
}
const snapshot = zones => JSON.parse(JSON.stringify(zones));
const ACTIVE_FIELDS = ["city", "cityName", "searchMode", "radiusKm", "selectedSearchPoint", "zones", "qty", "finalFlyers", "coverageDecision", "nilManualMode", "addressFullCoverageConfirmed"];
function assertTopLevelIs(state, zone) {
  const expected = buildActivePointOfSaleState(zone);
  for (const f of ACTIVE_FIELDS) assert.deepEqual(state[f], expected[f], `top-level ${f} deve venire SOLO da ${zone.id}`);
  assert.deepEqual(state.coverage?.address || null, zone.coverage?.address || null, "coverage.address = solo quello del PV attivo");
  assert.equal(state.activeZoneId, zone.id);
}

// ---------------------------------------------------------------- A. delete
for (const [label, deleted, survivor] of [
  ["Radius -> NIL", CENTRO, ISOLA],
  ["NIL -> Radius", ISOLA, CENTRO],
  ["Comune -> Radius", RHO_PV, CORMANO_PV],
  ["Radius -> Comune", CORMANO_PV, MONZA_PV],
]) {
  test(`A. delete active ${label}: survivor hydrated only from itself, other PV byte-identical`, () => {
    // il superstite e' il precedente dell'eliminato -> diventa attivo
    const zones = [survivor, deleted, ...FIVE.filter(z => z !== survivor && z !== deleted)];
    const before = snapshot(zones);
    const prev = workingStateOf(deleted, zones);
    const next = deleteAndActivatePointOfSale(prev, deleted.id);
    assert.ok(next, "eliminazione consentita");
    assert.equal(next.activeZoneId, survivor.id, "superstite deterministico = precedente");
    assertTopLevelIs(next, survivor);
    assert.ok(!next.campaignZones.some(z => z.id === deleted.id));
    for (const z of next.campaignZones) {
      assert.deepEqual(z, before.find(b => b.id === z.id), `${z.id} identico allo snapshot pre-eliminazione`);
    }
  });
}

test("A. 5-PV delete of active PV2: PV1/3/4/5 semantically identical, totals recalculated", () => {
  const before = snapshot(FIVE);
  const next = deleteAndActivatePointOfSale(workingStateOf(CENTRO), CENTRO.id);
  assert.equal(next.activeZoneId, ISOLA.id);
  assertTopLevelIs(next, ISOLA);
  assert.deepEqual(next.campaignZones, before.filter(z => z.id !== CENTRO.id));
  assert.equal(summarizeCampaignZones(next.campaignZones).totalQuantity, 5959 + 10000 + 10000 + 24304);
});

test("A. last-PV protection and unknown id stay null (no state change)", () => {
  assert.equal(deleteAndActivatePointOfSale(workingStateOf(ISOLA, [ISOLA]), ISOLA.id), null);
  assert.equal(deleteAndActivatePointOfSale(workingStateOf(ISOLA), "nope"), null);
});

// ------------------------------------------------- B. NIL <-> Radius switch
test("B. NIL -> Radius -> NIL -> Radius: each activation hydrates only from the target PV", () => {
  const before = snapshot(FIVE);
  let state = workingStateOf(ISOLA);
  for (const target of [CENTRO, ISOLA, CENTRO]) {
    state = activatePointOfSale(state, target.id);
    assertTopLevelIs(state, target);
  }
  assert.deepEqual(state.campaignZones, before, "lo switch non modifica nessun PV salvato");
  assert.equal(state.finalFlyers, 14127);
  assert.equal(state.radiusKm, 1);
  assert.deepEqual(state.selectedSearchPoint, VIA_TORINO);
  assert.equal(state.nilManualMode, false);
});

test("B. Radius -> NIL: NIL PV keeps nilManualMode, ISOLA selection and quantity; no radius/point leak", () => {
  const state = activatePointOfSale(workingStateOf(CENTRO), ISOLA.id);
  assertTopLevelIs(state, ISOLA);
  assert.equal(state.nilManualMode, true);
  assert.deepEqual(state.zones, ["nil_17_11"]);
  assert.equal(state.qty, 5959);
  assert.deepEqual(state.selectedSearchPoint, CORSO_COMO);
});

// ------------------------------------------------------ async stale guard
test("async guard: analysis is adopted by a PV only once it answers THAT PV's request", () => {
  const base = { localZoneId: "pv_centro", activeZoneId: "pv_centro", armedZoneId: "pv_centro", fetchKey: "k_centro", dataKey: "k_centro", loading: false };
  assert.equal(shouldAdoptZoneAnalysis(base), true, "risposta corrente del PV attivo");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, dataKey: "k_isola" }), false, "dato del PV precedente (NIL -> Raggio)");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, dataKey: "k_deleted" }), false, "dato del PV eliminato");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, loading: true }), false, "richiesta in corso");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, localZoneId: "pv_isola" }), false, "PV non ancora idratato");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, armedZoneId: null }), false, "stesso commit dell'idratazione");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, dataKey: "" }), false, "rimontaggio: nessun dato ancora");
  assert.equal(shouldAdoptZoneAnalysis({ ...base, fetchKey: "", dataKey: "k_isola" }), true, "PV senza richiesta (vuoto/CAP): niente da attendere");
});

test("async guard: ownership is bound to data identity — a new PV never uses another PV's residual data", () => {
  const ctx = (o = {}) => ({ localZoneId: "pv_new", activeZoneId: "pv_new", armedZoneId: "pv_new", fetchKey: "", dataKey: "k_centro", loading: false, ...o });
  // PV appena aggiunto (nessuna richiesta): adotta subito ma SENZA il dato residuo.
  const owner = nextZoneAnalysisOwner({ zoneId: "pv_centro", dataKey: "k_centro" }, ctx());
  assert.deepEqual(owner, { zoneId: "pv_new", dataKey: null });
  assert.equal(isZoneAnalysisDataUsable({ owner, ...ctx() }), false, "nessuna richiesta -> nessun dato");
  // riceve un indirizzo (Via Padova): il dato e' ancora quello di Via Torino
  assert.equal(isZoneAnalysisDataUsable({ owner, ...ctx({ fetchKey: "k_padova", loading: true }) }), false, "runtime 2026-10-06: GUASTALLA|BRERA|DUOMO scritte in 600ms");
  // arriva la SUA risposta: usabile subito, poi registrata nel proprietario
  assert.equal(isZoneAnalysisDataUsable({ owner, ...ctx({ fetchKey: "k_padova", dataKey: "k_padova" }) }), true);
  assert.deepEqual(nextZoneAnalysisOwner(owner, ctx({ fetchKey: "k_padova", dataKey: "k_padova" })), { zoneId: "pv_new", dataKey: "k_padova" });
});

test("async guard: same PV keeps stale-while-revalidate (single-PV behaviour unchanged)", () => {
  const owner = { zoneId: "pv_rho", dataKey: "k_rho_2km" };
  const ctx = { localZoneId: "pv_rho", activeZoneId: "pv_rho", armedZoneId: "pv_rho", fetchKey: "k_rho_3km", dataKey: "k_rho_2km", loading: true };
  assert.equal(isZoneAnalysisDataUsable({ owner, ...ctx }), true, "cambio raggio: il dato dello stesso PV resta visibile mentre ricarica");
  assert.equal(nextZoneAnalysisOwner(owner, ctx), owner, "nessun cambio finche' la nuova risposta non arriva");
  assert.deepEqual(nextZoneAnalysisOwner(owner, { ...ctx, dataKey: "k_rho_3km", loading: false }), { zoneId: "pv_rho", dataKey: "k_rho_3km" });
  // dopo uno switch, il dato del PV precedente non e' mai usabile
  assert.equal(isZoneAnalysisDataUsable({ owner, ...ctx, activeZoneId: "pv_monza", localZoneId: "pv_monza", armedZoneId: "pv_monza" }), false);
  assert.equal(isZoneAnalysisDataUsable({ owner: null, ...ctx }), false, "rimontaggio: nessun proprietario");
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const delay = ms => new Promise(r => setTimeout(r, ms));
function HookProbe({ probeRef, args }) { probeRef.current = useServiceAnalysis(...args); return null; }

test("async guard: useServiceAnalysis exposes dataKey, so stale data of the previous PV is detectable", async t => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  t.after(() => { global.fetch = originalFetch; process.env.VITE_SUPABASE_URL = originalUrl; });
  global.fetch = async url => ({ ok: true, json: async () => ({ values: { families: String(url).includes("Milano") ? 1 : 2 }, comuni_breakdown: [] }) });
  const probeRef = { current: null };
  let r;
  act(() => { r = TestRenderer.create(React.createElement(HookProbe, { probeRef, args: [45.46, 9.18, 1, "d2d", "Milano"] })); });
  await act(async () => { await delay(600); });
  const keyA = probeRef.current.fetchKey;
  assert.ok(keyA);
  assert.equal(probeRef.current.dataKey, keyA, "dato corrente per il PV A");
  const dataA = probeRef.current.data;
  act(() => { r.update(React.createElement(HookProbe, { probeRef, args: [45.531, 9.046, 3, "d2d", "Rho"] })); });
  assert.notEqual(probeRef.current.fetchKey, keyA);
  assert.equal(probeRef.current.data, dataA, "il dato resta quello di A finche' B non risponde...");
  assert.notEqual(probeRef.current.dataKey, probeRef.current.fetchKey, "...ma dataKey lo dichiara non corrente");
  await act(async () => { await delay(600); });
  assert.equal(probeRef.current.dataKey, probeRef.current.fetchKey, "risposta di B adottabile");
  act(() => r.unmount());
});

// ------------------------------------------------- C. address ownership
test("C. address ownership: a PV only ever sees its own coverage address", () => {
  const top = { address: CENTRO.coverage.address };
  assert.equal(resolvePointOfSaleCoverageAddress(MONZA_PV, FIVE, top), null, "PV senza indirizzo non eredita Via Torino");
  assert.equal(resolvePointOfSaleCoverageAddress(ISOLA, FIVE, top), ISOLA.coverage.address, "il PV usa il proprio");
  assert.equal(resolvePointOfSaleCoverageAddress({ id: "legacy" }, [{ id: "legacy" }], top), top.address, "single-PV legacy invariato");
  // switch / elimina riallineano il top-level al PV attivo
  assert.equal(activatePointOfSale(workingStateOf(CENTRO), MONZA_PV.id).coverage.address, null);
  assert.equal(deleteAndActivatePointOfSale(workingStateOf(CENTRO, [ISOLA, CENTRO]), CENTRO.id).coverage.address, ISOLA.coverage.address);
});

test("C. Step2 coverageAddress / Radius restore only read the active PV address", () => {
  assert.match(step2, /const coverageAddress = activeZoneForRadius \? resolvePointOfSaleCoverageAddress\(activeZoneForRadius, data\.campaignZones, data\.coverage\)/);
  assert.doesNotMatch(step2, /activeZoneForRadius\?\.coverage\?\.address \|\| data\.coverage\?\.address/);
  const restore = step2.slice(step2.indexOf("const restoreSearchPointFromCoverageAddress"), step2.indexOf("const switchToRadiusMode"));
  assert.match(restore, /coverageAddress/, "il ripristino Raggio usa solo coverageAddress (del PV)");
});

// ------------------------------------------------------- add clean state
for (const [label, from] of [["Comune", MONZA_PV], ["Radius", CENTRO], ["Milan NIL", ISOLA]]) {
  test(`add-from-${label}: new PV starts clean, previous PV untouched`, () => {
    const prev = workingStateOf(from);
    const before = snapshot(prev.campaignZones);
    const newZone = { id: "pv_new", searchMode: "municipality", city: null, cityName: "", selected: [], assigned_flyers: 10000, finalFlyers: 10000, availableFlyers: 10000, coverage: { address: null } };
    const next = activatePointOfSale({ ...prev, campaignZones: [...prev.campaignZones, newZone] }, "pv_new");
    assert.equal(next.activeZoneId, "pv_new");
    assert.equal(next.city, null);
    assert.equal(next.cityName, "");
    assert.equal(next.selectedSearchPoint, null);
    assert.deepEqual(next.zones, []);
    assert.equal(next.nilManualMode, false);
    assert.equal(next.addressFullCoverageConfirmed, false);
    assert.equal(next.coverageDecision, null);
    assert.equal(next.coverage.address, null, "nessun indirizzo ereditato");
    assert.equal(next.qty, 10000);
    assert.deepEqual(next.campaignZones.slice(0, -1), before);
  });
}

test("add: handleAddZone creates the PV with its own empty address and activates it via activatePointOfSale", () => {
  const fn = step2.slice(step2.indexOf("const handleAddZone = () =>"), step2.indexOf("const updateZoneField ="));
  assert.match(fn, /coverage: \{ address: null \}/);
  assert.match(fn, /setData\(prev => activatePointOfSale\(\{/);
});

// ------------------------------------------- one canonical activation path
test("one activation path: select / delete / legacy delete / hydration all use activatePointOfSale", () => {
  const select = step2.slice(step2.indexOf("const selectCampaignZone = useCallback"), step2.indexOf("const gisSkeleton"));
  assert.match(select, /activatePointOfSale\(prev, zoneId, \{ resolveCity: resolveCampaignZoneCity \}\)/);
  const del = step2.slice(step2.indexOf("const deletePointOfSale = useCallback"), step2.indexOf("const selectCampaignZone = useCallback"));
  assert.match(del, /deleteAndActivatePointOfSale\(prev, zoneId/);
  const legacy = step2.slice(step2.indexOf("const handleDeleteZone ="), step2.indexOf("const handleMoveZone ="));
  assert.match(legacy, /deleteAndActivatePointOfSale\(prev, zoneId/);
  const hydrate = step2.slice(step2.indexOf("// Load active zone to local states"), step2.indexOf("// Reciprocally update data.campaignZones"));
  assert.match(hydrate, /activatePointOfSale\(prev, activeZone\.id/);
  assert.doesNotMatch(hydrate, /prev\.selectedSearchPoint/, "nessun fallback al punto del PV precedente");
});

// ------------------------- analysis-derived writers gated on PV ownership
test("stale analysis never writes into a PV: every analysis-derived writer is gated", () => {
  assert.match(step2, /const \[analysisOwner, setAnalysisOwner\] = useState\(null\)/, "rimontaggio: nessun proprietario finche' l'analisi non risponde");
  assert.match(step2, /const apiData = isZoneAnalysisDataUsable\(\{ owner: analysisOwner, \.\.\.analysisOwnershipInput \}\) \? rawApiData : null;/);
  assert.match(step2, /nextZoneAnalysisOwner\(analysisOwner, analysisOwnershipInput\)/);
  const guards = step2.match(/if \(!analysisOwnedByActiveZone\) return;/g) || [];
  assert.ok(guards.length >= 4, `attese >=4 guardie (auto-selezione, allocazione, readiness, NIL vicina), trovate ${guards.length}`);
  const autoSel = step2.slice(step2.indexOf("const prevAvailableZoneIdsRef = useRef([])"), step2.indexOf("const addressPreviewNilZones"));
  assert.ok(autoSel.indexOf("prevAvailableZoneIdsRef.current = availableIds") < autoSel.indexOf("if (!analysisOwnedByActiveZone) return;"));
  assert.ok(autoSel.indexOf("if (!analysisOwnedByActiveZone) return;") < autoSel.indexOf("setSelected(prev => resolveZoneAutoSelection"));
});

// ------------------------------------------------- back / forward NIL remount
test("back/forward NIL: remount restores ISOLA mode and waits for its own analysis before any write", () => {
  // Rimontaggio: lo stato iniziale viene dal PV attivo...
  assert.match(step2, /useState\(\(\) => Boolean\(mountActiveZone\?\.nilManualMode\)\)/);
  assert.match(step2, /useState\(\(\) => Boolean\(mountActiveZone\?\.addressFullCoverageConfirmed\)\)/);
  // ...e senza risposta dell'analisi il PV non adotta nulla (niente
  // allocazione vuota / 10.000 di default scritte su ISOLA).
  assert.equal(shouldAdoptZoneAnalysis({ localZoneId: "pv_isola", activeZoneId: "pv_isola", armedZoneId: "pv_isola", fetchKey: "k_isola", dataKey: "", loading: true }), false);
  const state = activatePointOfSale(workingStateOf(CENTRO), ISOLA.id);
  assert.equal(state.qty, 5959, "mai il 10.000 di default");
  assert.deepEqual(state.zones, ["nil_17_11"], "mai tutta Milano / 88 NIL");
});
