// Milano: NIL riproporzionati sul dato ISTAT del comune (741.887 famiglie,
// 1.365.698 abitanti) e "tutto Milano" = 816.076 volantini nello Step 2.
// Fixture = risposte reali di analysis-istat (geometrie rimosse):
// home_calculator/milano_intera (2026-10-22), milano_nil_istat/r1 e multi (2026-11-13).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { largestRemainder } from "../src/lib/istat/largestRemainder.js";
import { normalizeMilanoNilAnalysis } from "../src/lib/istat/normalizeMilanoNilAnalysis.js";
import { MILANO_ISTAT_HOUSEHOLDS, MILANO_ISTAT_POPULATION, MILANO_ISTAT_RECOMMENDED_FLYERS } from "../src/lib/istat/milanoIstatTotals.js";
import { apiToZones } from "../src/lib/step2/zoneGeoHelpers.js";
import { getZoneFullCoverageFlyers } from "../src/lib/doorToDoorCoverage.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fixture = (p) => JSON.parse(read(`tests/fixtures/${p}.json`)).body;
const shares = JSON.parse(read("src/lib/istat/milanoNilIstatShares.json"));
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

test("resto maggiore: somma esatta, ordine stabile", () => {
  const m = largestRemainder(10, [{ key: "a", weight: 1 }, { key: "b", weight: 1 }, { key: "c", weight: 1 }]);
  assert.deepEqual([...m.values()].reduce((s, v) => s + v, 0), 10);
  assert.deepEqual(Object.fromEntries(m), { a: 4, b: 3, c: 3 });
  assert.equal(largestRemainder(0, [{ key: "a", weight: 1 }]).get("a"), 0);
});

test("tabella NIL: 88 quartieri, somma = dato ISTAT del comune", () => {
  const nils = Object.values(shares.nils);
  assert.equal(nils.length, 88);
  assert.equal(sum(nils, "households"), MILANO_ISTAT_HOUSEHOLDS);
  assert.equal(sum(nils, "population"), MILANO_ISTAT_POPULATION);
  assert.equal(shares.totals.households, 741887);
  assert.equal(shares.totals.population, 1365698);
});

test("Milano intera: 741.887 famiglie, 816.076 volantini, anche sommando le zone dello Step 2", () => {
  const before = fixture("home_calculator/milano_intera");
  assert.equal(before.values.famiglie_stimate, 744299, "fixture = risposta reale non normalizzata");
  const after = normalizeMilanoNilAnalysis(before);
  assert.equal(after.values.famiglie_stimate, 741887);
  assert.equal(after.values.popolazione_stimata, 1365698);
  assert.equal(after.values.volantini_consigliati, MILANO_ISTAT_RECOMMENDED_FLYERS);
  assert.equal(sum(after.comuni_breakdown, "households_total"), 741887);
  assert.equal(sum(after.comuni_breakdown, "households_in_radius"), 741887);
  assert.equal(sum(after.comuni_breakdown, "volantini_nel_raggio"), 816076);
  const zones = apiToZones(after, null).filter((z) => z.isNil);
  assert.equal(zones.length, 88);
  assert.equal(zones.reduce((s, z) => s + z.families, 0), 741887);
  assert.equal(zones.reduce((s, z) => s + getZoneFullCoverageFlyers(z), 0), 816076);
  assert.equal(after.metadata.milano_nil_istat_normalized, 1);
  assert.equal(before.values.famiglie_stimate, 744299, "input non modificato");
});

test("idempotente: due volte = una volta (anche dopo la migration SQL)", () => {
  const once = normalizeMilanoNilAnalysis(fixture("home_calculator/milano_intera"));
  assert.deepEqual(normalizeMilanoNilAnalysis(once), once);
  const r1 = normalizeMilanoNilAnalysis(fixture("milano_nil_istat/r1"));
  assert.deepEqual(normalizeMilanoNilAnalysis(r1), r1);
});

test("raggio 1 km dal Duomo: quota nel raggio conservata, famiglie ~ -0,3%", () => {
  const before = fixture("milano_nil_istat/r1");
  const after = normalizeMilanoNilAnalysis(before);
  for (const [i, row] of after.comuni_breakdown.entries()) {
    const old = before.comuni_breakdown[i];
    assert.equal(row.households_total, shares.nils[row.nil_code].households);
    assert.equal(row.pct_copertura, old.pct_copertura);
    const oldRatio = old.households_in_radius / old.households_total;
    assert.ok(Math.abs(row.households_in_radius - row.households_total * oldRatio) <= 1);
  }
  const ratio = after.values.famiglie_stimate / before.values.famiglie_stimate;
  assert.ok(ratio > 0.995 && ratio < 0.9985, `rapporto ${ratio}`);
  assert.equal(after.values.volantini_consigliati, Math.round(after.values.famiglie_stimate * 1.1));
  assert.equal(sum(after.comuni_breakdown, "volantini_nel_raggio"), after.values.volantini_consigliati);
});

test("Milano + altro comune: solo i NIL cambiano, l'altro comune resta identico", () => {
  const before = fixture("milano_nil_istat/multi");
  const after = normalizeMilanoNilAnalysis(before);
  const others = (rows) => rows.filter((r) => r.territory_level !== "nil");
  assert.ok(others(before.comuni_breakdown).length >= 1);
  assert.deepEqual(others(after.comuni_breakdown), others(before.comuni_breakdown));
  const nils = after.comuni_breakdown.filter((r) => r.territory_level === "nil");
  assert.equal(nils.length, 88);
  assert.equal(sum(nils, "households_in_radius"), 741887);
  assert.equal(sum(nils, "volantini_nel_raggio"), 816076);
  const otherFamilies = sum(others(before.comuni_breakdown), "households_in_radius");
  assert.equal(after.values.famiglie_stimate, 741887 + otherFamilies);
});

test("comuni senza NIL, errori e POI: risposta restituita invariata", () => {
  const monza = fixture("home_calculator/monza");
  assert.equal(normalizeMilanoNilAnalysis(monza), monza);
  const err = { error: "TERRITORIAL_DATA_NOT_AVAILABLE" };
  assert.equal(normalizeMilanoNilAnalysis(err), err);
  assert.equal(normalizeMilanoNilAnalysis(null), null);
});

test("wiring: hook D2D normalizza, Step 2 mostra fonte leggibile e nota stima NIL", () => {
  const hook = read("src/hooks/useServiceAnalysis.js");
  assert.match(hook, /setData\(normalizeMilanoNilAnalysis\(result\)\);/);
  const summary = read("src/pages/public/configurator/step2/MilanoTerritorySummary.jsx");
  assert.match(summary, /<dt>Fonte famiglie<\/dt><dd>\{householdsSourceLabel\(mode\)\}<\/dd>/);
  assert.doesNotMatch(summary, /viewModel\.primarySource \|\|/);
  const panel = read("src/pages/public/configurator/step2/Step2ComunePanel.jsx");
  assert.match(panel, /\{NIL_HOUSEHOLDS_LABEL\}: \{NIL_HOUSEHOLDS_SOURCE\}/);
  const pdf = read("src/lib/pdf/generateQuotePdf.js");
  assert.match(pdf, /paragraph\(w, PDF_HOUSEHOLDS_SOURCE_NOTE\)/);
});

test("valori NIL diversi da quelli attesi (es. nuovo anno nel database) non vengono sovrascritti", () => {
  const row = { territory_level: "nil", nil_code: "77", nil_name: "BRUZZANO", municipality_code: "015146", pct_copertura: 100, households_in_radius: 5885, households_total: 5885, population_total: 9000, population_in_radius: 9000, volantini_nel_raggio: 5885 };
  const data = { values: { famiglie_stimate: 5885, volantini_consigliati: 6474 }, comuni_breakdown: [row], metadata: {} };
  const out = normalizeMilanoNilAnalysis(data);
  assert.deepEqual(out.comuni_breakdown, data.comuni_breakdown);
  assert.deepEqual(out.values, data.values);
  assert.equal(out.metadata.milano_nil_istat_mismatch, 1);
});

test("PDF Step 4 'tutto Milano': 741.887 famiglie, 816.076 volantini e fonte ISTAT", async () => {
  const { generateQuotePdfBytes } = await import("../src/lib/pdf/generateQuotePdf.js");
  const bytes = generateQuotePdfBytes({
    quoteId: "VP-TEST-MILANO", generatedAt: "2026-11-13T10:00:00.000Z", service: "Door to Door", status: "Bozza",
    client: { name: "Cliente Test", email: "cliente@example.org" },
    campaign: { quantity: 816076, format: "A5" },
    area: { mainArea: "Milano", selectedMunicipalities: ["Milano"], selectionMode: "Tutto Milano" },
    outputs: { estimatedFamilies: 741887, insertedFlyers: 816076, recommendedFlyers: 816076, coverageStatus: "sufficient" },
    municipalities: [{ name: "Milano", status: "Selezionato", estimatedFlyers: 816076 }],
    pricing: { lines: [{ label: "Distribuzione Door to Door", quantity: 816076, unitPrice: 0.0272, total: 22184.05 }], subtotal: 22184.05, extras: [], discounts: [], total: 22184.05, grandTotal: 22184.05 },
  });
  const pdf = Buffer.from(bytes).toString("latin1");
  assert.match(pdf, /741\.887/);
  assert.match(pdf, /816\.076/);
  assert.match(pdf, /Fonte: ISTAT, famiglie al 31\/12\/2024/);
  assert.match(pdf, /dati ISTAT al 31\/12\/2024/);
  assert.doesNotMatch(pdf, /744\.299|818\.734/);
});
