// Famiglie uniche multi-punto vendita (2026-11-04).
// La somma dei PV non e' mai presentata come famiglie uniche: o le famiglie
// sono deduplicate con la metodologia del backend (ripartizione per area
// dentro il territorio, verificata sui valori di ogni raggio), o lo stato e'
// "Famiglie uniche non determinabili".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  computeCampaignUniqueHouseholds,
  territoryCircleCoverage,
  UNIQUE_HOUSEHOLDS_STATUS,
  UNIQUE_HOUSEHOLDS_NOT_DETERMINABLE_LABEL,
} from "../src/lib/step2/uniqueHouseholds.js";
import { summarizeCampaignZones, buildMultiZoneMetadata, buildPointOfSalePricing, buildMultiZoneDistributionZones } from "../src/lib/step2/campaignZonesModel.js";
import { generateQuotePdfBytes } from "../src/lib/pdf/generateQuotePdf.js";

const LAT0 = 45.5;
const LNG0 = 9.2;
const PHI = (LAT0 * Math.PI) / 180;
const KX = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI) + 0.118 * Math.cos(5 * PHI);
const KY = 111132.954 - 559.822 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
// spostamento in km -> gradi
const at = (dxKm, dyKm) => ({ lat: LAT0 + (dyKm * 1000) / KY, lng: LNG0 + (dxKm * 1000) / KX });
// quadrato di lato 4 km centrato in (LAT0, LNG0): 16 km2
function square(halfKm = 2, cx = 0, cy = 0) {
  const p = (x, y) => { const q = at(cx + x, cy + y); return [q.lng, q.lat]; };
  return { type: "Polygon", coordinates: [[p(-halfKm, -halfKm), p(halfKm, -halfKm), p(halfKm, halfKm), p(-halfKm, halfKm), p(-halfKm, -halfKm)]] };
}
const T = 10000; // famiglie del territorio
const P = 23000; // persone del territorio
const AREA = 16;
// "cerchio" del backend: ST_Buffer = poligono regolare di 32 lati inscritto
const BUFFER_AREA = r => 16 * r * r * Math.sin((2 * Math.PI) / 32);
const circleShare = r => BUFFER_AREA(r) / AREA;
const POLY_SCALE = BUFFER_AREA(1) / Math.PI;
const lensArea = (r, d) => 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);

function nilRow(code, name, families, extra = {}) {
  return { id: `nil_${code}`, name, isNil: true, nilCode: code, territory_type: "nil", requiredFlyers: Math.round(families * 1.1), assignedFlyers: Math.round(families * 1.1), families, ...extra };
}
function comuneRow(code, name, families, extra = {}) {
  return { id: `api_${code}`, name, isNil: false, municipality_code: code, territory_type: "comune", requiredFlyers: Math.round(families * 1.1), assignedFlyers: Math.round(families * 1.1), families, ...extra };
}
function radiusPv(id, center, rKm, rows) {
  const families = rows.reduce((a, r) => a + (r.families ?? 0), 0);
  const population = rows.every(r => r.population != null) ? rows.reduce((a, r) => a + r.population, 0) : null;
  const qty = Math.round(families * 1.1);
  return {
    id, searchMode: "address", radiusKm: rKm, radius: rKm, city: { name: "Milano", label: "Milano", lat: center.lat, lng: center.lng }, cityName: "Milano",
    selectedSearchPoint: { label: `Punto ${id}`, ...center }, selectedComuni: [{ name: "Milano", label: "Milano" }],
    assigned_flyers: qty, finalFlyers: qty, readyForQuote: true, allocation: rows,
    kpiSnapshot: { families, population, requiredFlyers: qty, analysisLevel: "nil", areaMode: "radius", center: { ...center }, radiusKm: rKm },
  };
}
function unitsPv(id, rows, extra = {}) {
  const families = rows.reduce((a, r) => a + (r.families ?? 0), 0);
  const qty = Math.round(families * 1.1);
  return {
    id, searchMode: "municipality", city: { name: "Milano", label: "Milano", lat: LAT0, lng: LNG0 }, cityName: "Milano", selectedComuni: [{ name: "Milano", label: "Milano" }],
    assigned_flyers: qty, finalFlyers: qty, readyForQuote: true, allocation: rows,
    kpiSnapshot: { families, population: null, requiredFlyers: qty, analysisLevel: "nil", areaMode: "municipality" }, ...extra,
  };
}
// riga NIL "come dal backend" per un raggio r centrato in c dentro il quadrato
function backendNilRow(r, extra = {}) {
  const share = circleShare(r);
  return nilRow("71", "QUADRATO", Math.round(T * share), { familiesTotal: T, population: Math.round(P * share), populationTotal: P, coveragePct: Math.round(share * 10000) / 100, geometry: square(), ...extra });
}

test("geometria: la quota cerchio/territorio riproduce l'area analitica", () => {
  const cov = territoryCircleCoverage(square(), [{ ...at(0, 0), rKm: 1 }, { ...at(1, 0), rKm: 1 }]);
  assert.ok(Math.abs(cov.area / 1e6 - AREA) < 0.05, `area ${cov.area / 1e6}`);
  assert.ok(Math.abs(cov.ratios[0] - circleShare(1)) < 0.002);
  assert.ok(Math.abs(cov.ratios[0] - (Math.PI / AREA) * POLY_SCALE) < 0.0005, "forma del backend (32 lati), non il cerchio ideale");
  const unionExpected = (2 * BUFFER_AREA(1) - lensArea(1, 1) * POLY_SCALE) / AREA;
  assert.ok(Math.abs(cov.unionRatio - unionExpected) < 0.002, `${cov.unionRatio} vs ${unionExpected}`);
  // cerchio che esce dal territorio: conta solo la parte interna (meta' cerchio)
  const half = territoryCircleCoverage(square(), [{ ...at(2, 0), rKm: 1 }]);
  assert.ok(Math.abs(half.ratios[0] - circleShare(1) / 2) < 0.002);
});

test("raggi identici: famiglie uniche = un solo raggio (esatto)", () => {
  const a = radiusPv("a", at(0, 0), 1, [backendNilRow(1)]);
  const b = radiusPv("b", at(0, 0), 1, [backendNilRow(1)]);
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.DEDUPLICATED);
  assert.equal(r.uniqueFamilies, Math.round(T * circleShare(1)));
  assert.equal(r.summedFamilies, 2 * Math.round(T * circleShare(1)));
  assert.equal(r.estimated, false);
  assert.equal(r.details[0].method, "raggio_contenuto");
});

test("raggio contenuto in un altro: conta il raggio piu' grande (esatto)", () => {
  const big = radiusPv("big", at(0, 0), 1.5, [backendNilRow(1.5)]);
  const small = radiusPv("small", at(0.3, 0), 1, [backendNilRow(1)]);
  const r = computeCampaignUniqueHouseholds([big, small]);
  assert.equal(r.uniqueFamilies, Math.round(T * circleShare(1.5)));
});

test("raggi parzialmente sovrapposti: inclusione-esclusione verificata = area analitica", () => {
  const a = radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1)]);
  const b = radiusPv("b", at(0.5, 0), 1, [backendNilRow(1)]);
  const r = computeCampaignUniqueHouseholds([a, b]);
  const expected = T * (2 * BUFFER_AREA(1) - lensArea(1, 1) * POLY_SCALE) / AREA;
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.DEDUPLICATED);
  assert.equal(r.estimated, true);
  assert.ok(Math.abs(r.uniqueFamilies - expected) <= expected * 0.005, `${r.uniqueFamilies} vs ${expected}`);
  assert.ok(r.uniqueFamilies < r.summedFamilies);
  assert.ok(r.uniqueFamilies >= r.lowerBound && r.uniqueFamilies <= r.upperBound);
  // persone con la stessa regola
  const expectedPop = P * (2 * BUFFER_AREA(1) - lensArea(1, 1) * POLY_SCALE) / AREA;
  assert.ok(Math.abs(r.uniquePopulation - expectedPop) <= expectedPop * 0.005);
});

test("regressione runtime: 'coverage' 100 sulla riga del PV attivo non rende intero il territorio", () => {
  // Preview 2026-11-04: dopo "Adatta" le righe del PV attivo portavano
  // coverage 100 anche con famiglie < totale (BRUZZANO 6049/6840): il
  // territorio veniva preso per intero e le famiglie uniche crollavano.
  const a = radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1)]);
  const b = radiusPv("b", at(0.5, 0), 1, [backendNilRow(1, { coveragePct: 100, coverage: 100 })]);
  const r = computeCampaignUniqueHouseholds([a, b]);
  const expected = T * (2 * BUFFER_AREA(1) - lensArea(1, 1) * POLY_SCALE) / AREA;
  assert.equal(r.details[0].method, "stima_area_verificata");
  assert.ok(Math.abs(r.uniqueFamilies - expected) <= expected * 0.005, `${r.uniqueFamilies} vs ${expected}`);
  const step2 = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(step2, /coveragePct: allocationRowNumber\(z\.coverage\)/, "Step 2 non salva la copertura inaffidabile");
});

test("raggi disgiunti: somma esatta, nessuna geometria necessaria", () => {
  const a = radiusPv("a", at(-1.5, 0), 0.5, [backendNilRow(0.5, { geometry: null })]);
  const b = radiusPv("b", at(1.5, 0), 0.5, [backendNilRow(0.5, { geometry: null })]);
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.DISJOINT);
  assert.equal(r.uniqueFamilies, r.summedFamilies);
  // anche con righe senza dati (bozza vecchia): disgiunti per geometria
  const legacy = computeCampaignUniqueHouseholds([
    { ...a, allocation: [{ id: "x", name: "QUADRATO", nilCode: "71", requiredFlyers: 2000 }] },
    { ...b, allocation: [{ id: "x", name: "QUADRATO", nilCode: "71", requiredFlyers: 2000 }] },
  ]);
  assert.equal(legacy.status, UNIQUE_HOUSEHOLDS_STATUS.DISJOINT);
  assert.equal(legacy.uniqueFamilies, a.kpiSnapshot.families + b.kpiSnapshot.families);
});

test("raggi sovrapposti ma territori diversi: le famiglie non si sovrappongono (somma)", () => {
  const a = radiusPv("a", at(-0.5, 0), 1, [nilRow("1", "NIL UNO", 3000, { familiesTotal: 9000, coveragePct: 33 })]);
  const b = radiusPv("b", at(0.5, 0), 1, [nilRow("2", "NIL DUE", 2500, { familiesTotal: 9000, coveragePct: 28 })]);
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.DISJOINT);
  assert.equal(r.uniqueFamilies, 5500);
});

test("NIL scelto per intero + raggio che lo tocca: il NIL conta una volta, il resto del raggio si somma", () => {
  const nilPv = unitsPv("nil", [nilRow("71", "QUADRATO", T, { familiesTotal: T, coveragePct: 100 })], { nilManualMode: true, selected: ["nil_71"] });
  const radius = radiusPv("r", at(1.5, 0), 1, [
    backendNilRow(1, { families: 1200 }),
    nilRow("72", "VICINO", 800, { familiesTotal: 6000, coveragePct: 13 }),
  ]);
  const r = computeCampaignUniqueHouseholds([nilPv, radius]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.DEDUPLICATED);
  assert.equal(r.uniqueFamilies, T + 800);
  assert.equal(r.summedFamilies, T + 1200 + 800);
  assert.equal(r.details.find(d => d.unit === "QUADRATO").method, "territorio_intero");
});

test("Comune di Milano intero + raggio con NIL di Milano: Milano conta una volta", () => {
  const milano = unitsPv("mi", [comuneRow("015146", "Milano", 700000, { familiesTotal: 700000, coveragePct: 100 })], { kpiSnapshot: { families: 700000, analysisLevel: "comune" } });
  const radius = radiusPv("r", at(0, 0), 2, [
    nilRow("10", "NIL A", 9000, { familiesTotal: 15000, coveragePct: 60 }),
    comuneRow("015077", "Cormano", 2000, { familiesTotal: 9000, coveragePct: 22 }),
  ]);
  const r = computeCampaignUniqueHouseholds([milano, radius]);
  assert.equal(r.uniqueFamilies, 700000 + 2000);
});

test("Milano come comune solo in parte + NIL di Milano: non determinabile", () => {
  const milanoPartial = radiusPv("mi", at(0, 0), 2, [comuneRow("015146", "Milano", 20000, { familiesTotal: 700000, coveragePct: 3 })]);
  const radius = radiusPv("r", at(1, 0), 2, [nilRow("10", "NIL A", 9000, { familiesTotal: 15000, coveragePct: 60 })]);
  const r = computeCampaignUniqueHouseholds([milanoPartial, radius]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.NOT_DETERMINABLE);
  assert.equal(r.uniqueFamilies, null);
  assert.equal(r.reasons[0].code, "milano_cross_level_partial");
});

test("comuni: stesso comune in due PV per intero = una volta; comuni diversi = somma", () => {
  const a = unitsPv("a", [comuneRow("108033", "Monza", 50000, { familiesTotal: 50000, coveragePct: 100 })]);
  const b = unitsPv("b", [comuneRow("108033", "Monza", 50000, { familiesTotal: 50000, coveragePct: 100 }), comuneRow("015182", "Rho", 22000, { familiesTotal: 22000, coveragePct: 100 })]);
  assert.equal(computeCampaignUniqueHouseholds([a, b]).uniqueFamilies, 72000);
});

test("bozza vecchia (righe senza famiglie) con PV sovrapposti: non determinabile, mai la somma", () => {
  const legacy = row => { const { families, familiesTotal, population, populationTotal, coveragePct, ...rest } = row; return rest; };
  const a = radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1)]);
  const b = radiusPv("b", at(0.5, 0), 1, [backendNilRow(1)]);
  a.allocation = a.allocation.map(legacy);
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.NOT_DETERMINABLE);
  assert.equal(r.uniqueFamilies, null);
  assert.equal(r.summedFamilies, a.kpiSnapshot.families + b.kpiSnapshot.families);
  assert.equal(r.reasons[0].code, "zone_rows_without_households");
  assert.equal(r.lowerBound, Math.max(a.kpiSnapshot.families, b.kpiSnapshot.families));
});

test("geometria che non riproduce il backend: non determinabile (nessuna stima non verificata)", () => {
  const a = radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1, { families: 4000 })]);
  const b = radiusPv("b", at(0.5, 0), 1, [backendNilRow(1)]);
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.NOT_DETERMINABLE);
  assert.equal(r.reasons[0].code, "geometry_verification_failed");
});

test("sovrapposizione parziale senza geometria o senza totale: non determinabile", () => {
  const noGeom = computeCampaignUniqueHouseholds([radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1, { geometry: null })]), radiusPv("b", at(0.5, 0), 1, [backendNilRow(1, { geometry: null })])]);
  assert.equal(noGeom.reasons[0].code, "territory_geometry_missing");
  const noTotal = computeCampaignUniqueHouseholds([radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1, { familiesTotal: null })]), radiusPv("b", at(0.5, 0), 1, [backendNilRow(1, { familiesTotal: null })])]);
  assert.equal(noTotal.reasons[0].code, "territory_total_missing");
});

test("totale PV diverso dalla somma delle sue righe (KPI corretto in Step 2): non determinabile", () => {
  const a = radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1)]);
  const b = radiusPv("b", at(0.5, 0), 1, [backendNilRow(1)]);
  a.kpiSnapshot.families += 500;
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.reasons[0].code, "zone_rows_inconsistent");
});

test("CAP insieme a comuni/NIL: non confrontabili, non determinabile", () => {
  const cap = { ...unitsPv("cap", [{ id: "cap_20161", name: "20161", families: 8000 }]), searchMode: "cap", selectedCaps: ["20161"] };
  const nil = unitsPv("nil", [nilRow("71", "QUADRATO", T, { familiesTotal: T, coveragePct: 100 })]);
  assert.equal(computeCampaignUniqueHouseholds([cap, nil]).status, UNIQUE_HOUSEHOLDS_STATUS.NOT_DETERMINABLE);
});

test("summarize: famiglie uniche separate da fabbisogno, quantita' e prezzo (invariati)", () => {
  const a = radiusPv("a", at(-0.5, 0), 1, [backendNilRow(1)]);
  const b = radiusPv("b", at(0.5, 0), 1, [backendNilRow(1)]);
  const s = summarizeCampaignZones([a, b]);
  assert.equal(s.hasOverlap, true);
  assert.equal(s.capacityDeduplicated, true);
  assert.equal(s.capacityStatus, "overlap_deduplicated");
  assert.ok(s.totalFamilies < s.summedFamilies);
  assert.equal(s.totalQuantity, a.assigned_flyers + b.assigned_flyers, "quantita' = somma dei PV");
  assert.equal(s.totalRequiredFlyers, a.kpiSnapshot.requiredFlyers + b.kpiSnapshot.requiredFlyers, "fabbisogno = somma dei PV");
  // prezzo identico a quello dei due PV presi singolarmente
  const single = buildPointOfSalePricing(summarizeCampaignZones([a])).distributionTotal + buildPointOfSalePricing(summarizeCampaignZones([b])).distributionTotal;
  assert.equal(buildPointOfSalePricing(s).distributionTotal, Math.round(single * 100) / 100);
  assert.equal(buildMultiZoneDistributionZones(s).reduce((x, z) => x + z.quantity, 0), s.totalQuantity);
  const meta = buildMultiZoneMetadata(s);
  assert.equal(meta.unique_families, s.totalFamilies);
  assert.equal(meta.summed_families_not_deduplicated, s.summedFamilies);
  assert.equal(meta.unique_families_status, "deduplicated");
  assert.equal(meta.capacity_deduplicated, true);

  const legacyB = { ...b, allocation: b.allocation.map(({ families, population, ...r }) => r) };
  const u = summarizeCampaignZones([a, legacyB]);
  assert.equal(u.totalFamilies, null, "mai la somma come famiglie");
  assert.equal(u.totalPopulation, null);
  assert.equal(u.capacityStatus, "overlap_not_deduplicated");
  assert.equal(buildMultiZoneMetadata(u).total_families, null);
});

test("PDF: stato esplicito al posto del numero quando non determinabili", () => {
  const pdf = Buffer.from(generateQuotePdfBytes({ outputs: { estimatedFamilies: null, estimatedFamiliesNote: UNIQUE_HOUSEHOLDS_NOT_DETERMINABLE_LABEL, insertedFlyers: 20000, recommendedFlyers: 19000 } })).toString("latin1");
  assert.match(pdf, /Famiglie uniche non determinabili/);
  const withNumber = Buffer.from(generateQuotePdfBytes({ outputs: { estimatedFamilies: 31590, insertedFlyers: 20000, recommendedFlyers: 19000 } })).toString("latin1");
  assert.match(withNumber, /31\.590/);
  assert.doesNotMatch(withNumber, /non determinabili/);
});

test("Step 4 e Step 2: nessun ripiego sulla somma o sul PV attivo", () => {
  const step4 = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");
  const summaryUi = readFileSync(new URL("../src/pages/public/configurator/step4/Step4MultiZoneSummary.jsx", import.meta.url), "utf8");
  const step2 = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
  assert.match(step4, /families: multiZoneSummary\.totalFamilies,\r?\n/);
  assert.doesNotMatch(step4, /multiZoneSummary\.totalFamilies \?\? data\.serviceKpis/);
  assert.match(step4, /isMultiZoneQuote \? kpis\.families \?\? null : kpis\.families \?\? \(selZ\.length \? totF : null\)/);
  assert.match(step4, /const kpisPopulation = isMultiZoneQuote \? kpis\.population \?\? null :/);
  assert.match(step4, /estimatedFamiliesNote: uniqueFamiliesUndetermined \? UNIQUE_HOUSEHOLDS_NOT_DETERMINABLE_LABEL : null/);
  assert.doesNotMatch(step4, /somma non deduplicata, zone sovrapposte/);
  // frase iniziale: mai "comprende circa famiglie uniche non determinabili"
  assert.match(step4, /\{uniqueFamiliesUndetermined \? <>Territori dei punti vendita sovrapposti:/);
  assert.match(summaryUi, /summary\.totalFamilies == null \?/);
  // La griglia hero mobile ammette lo shrink sotto il min-content dei KPI a sei cifre.
  assert.match(step4, /gridTemplateColumns: isMobile \? "repeat\(2, minmax\(0, 1fr\)\)"/);
  assert.match(step4, /fontSize: isMobile \? 26 : 34,[\s\S]{0,120}overflowWrap: "anywhere",[\s\S]{0,60}color: C\.green/);
  // riquadro FAMIGLIE in alto: lo stato testuale non usa il corpo 34 px (mobile 360-412 px)
  assert.match(step4, /data-testid="step4-hero-families" style=\{uniqueFamiliesUndetermined \? \{/);
  // "Punto vendita 2. Le famiglie": spazio esplicito dopo l'elenco dei PV sovrapposti
  assert.match(summaryUi, /\.join\("; "\)\}\.\{" "\}/);
  // Step 2 salva i dati del backend sulla riga (mai uno 0 inventato)
  assert.match(step2, /families: allocationRowNumber\(z\.families\),/);
  assert.match(step2, /familiesTotal: allocationRowNumber\(z\.familiesTotal, \{ positive: true \}\),/);
  assert.match(step2, /if \(value === null \|\| value === undefined \|\| value === ""\) return null;/);
});

// ------------------------------------------------------------ dati reali
// Risposte reali di analysis-istat (GET in sola lettura, 2026-11-04): via
// Oroboni (centro Mapbox) 2 km e un secondo PV 1,5 km a est, 2 km.
import { apiToZones } from "../src/lib/step2/zoneGeoHelpers.js";
const REAL = JSON.parse(readFileSync(new URL("./fixtures/analysis-istat-oroboni-2km-a-b.json", import.meta.url), "utf8"));
const MILANO_CITY = { name: "Milano", label: "Milano", lat: 45.4642, lng: 9.19, municipality_code: "015146" };
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
function realPv(name) {
  const res = REAL.responses[name];
  const zones = apiToZones(res, MILANO_CITY, "nil", "d2d", 2);
  // stessi campi che Step 2 salva sulle righe zonesAllocation
  const rows = zones.map(z => ({ id: z.id, name: z.name, requiredFlyers: Math.round(z.families * 1.1), geometry: z.geometry, isNil: z.isNil, nilCode: z.nilCode, municipality_code: z.municipality_code, families: num(z.families), familiesTotal: num(z.familiesTotal), population: num(z.pop), populationTotal: num(z.populationTotal), coveragePct: num(z.coverage), territory_type: z.isNil ? "nil" : "radius" }));
  const families = zones.reduce((a, z) => a + z.families, 0);
  const population = zones.reduce((a, z) => a + z.pop, 0);
  return { zones, pv: { id: name, searchMode: "address", radiusKm: 2, radius: 2, city: MILANO_CITY, cityName: "Milano", selectedSearchPoint: { label: name, ...res.center }, assigned_flyers: Math.round(families * 1.1), readyForQuote: true, allocation: rows, kpiSnapshot: { families, population, center: res.center, radiusKm: 2, analysisLevel: "nil", areaMode: "radius" } } };
}

test("dati reali: la geometria del client riproduce la quota del backend per ogni riga", () => {
  for (const name of ["A", "B"]) {
    const { zones } = realPv(name);
    const raw = REAL.responses[name].comuni_breakdown;
    for (const z of zones) {
      const pct = Number(raw.find(r => (r.nil_name || r.comune_name) === z.name)?.pct_copertura);
      if (pct <= 1) continue; // il backend porta le coperture sotto l'1% all'1%
      const cov = territoryCircleCoverage(z.geometry, [{ ...REAL.responses[name].center, rKm: 2 }]);
      const dev = Math.abs(cov.ratios[0] - z.families / z.familiesTotal);
      assert.ok(dev <= 0.0025, `${name} ${z.name}: scarto ${dev}`);
    }
  }
});

test("dati reali: due raggi di 2 km a 1,5 km = famiglie uniche verificate, quantita' invariate", () => {
  const a = realPv("A").pv;
  const b = realPv("B").pv;
  const r = computeCampaignUniqueHouseholds([a, b]);
  assert.equal(r.status, UNIQUE_HOUSEHOLDS_STATUS.DEDUPLICATED);
  assert.equal(r.estimated, true);
  assert.equal(r.summedFamilies, 88589);
  assert.equal(r.uniqueFamilies, 63831);
  assert.ok(r.details.every(d => d.deviation == null || d.deviation <= 0.0025));
  const same = computeCampaignUniqueHouseholds([a, { ...a, id: "A2" }]);
  assert.equal(same.uniqueFamilies, a.kpiSnapshot.families);
  const s = summarizeCampaignZones([a, b]);
  assert.equal(s.totalQuantity, a.assigned_flyers + b.assigned_flyers);
});
