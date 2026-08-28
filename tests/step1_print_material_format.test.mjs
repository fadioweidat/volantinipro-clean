import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  calculatePrintPrice,
  benchmarkBasePrice,
  computePrintEstimate,
  PRINT_FORMAT_OPTIONS,
  PRINT_FORMAT_IDS,
  MATERIAL_FORMAT_OPTIONS,
  PRINT_BENCHMARKS,
  PRINT_FORMAT_STATUS,
  VOLANTINIPRO_MARKUP_PCT,
  isPrintFormatConfigured,
  isPrintableFormat,
  toPrintableFormat,
} from "../src/lib/pricing/printPricing.js";
import { buildExtraServicesRegistry, buildExtraServicesById, normalizeSelectedExtras } from "../src/lib/extraServicesRegistry.js";

const root = path.resolve(import.meta.dirname, "..");
const step1Src = fs.readFileSync(path.join(root, "src/pages/public/configurator/Step1.jsx"), "utf8");
const summarySrc = fs.readFileSync(path.join(root, "src/components/Step1Summary.jsx"), "utf8");

const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const BASE = { grammage: "130", sides: "fronte_retro", color: "colori", fold: "nessuna", urgency: "standard" };

// ---------------------------------------------------------------------------
// Benchmark A6 / A5 — valori BASE realmente osservati (interni).
// ---------------------------------------------------------------------------

test("A6 — benchmark base ai punti osservati", () => {
  const b = (q) => benchmarkBasePrice("A6", q).price;
  assert.equal(b(1000), 49.0);
  assert.equal(b(2500), 55.5);
  assert.equal(b(10000), 76.0);
  assert.equal(b(15000), 112.87);
  assert.equal(b(20000), 149.83);
  assert.equal(b(30000), 223.7);
  assert.equal(b(40000), 297.37);
  assert.equal(b(50000), 371.44);
});

test("A5 — benchmark base ai punti osservati", () => {
  const b = (q) => benchmarkBasePrice("A5", q).price;
  assert.equal(b(1000), 55.0);
  assert.equal(b(2500), 70.0);
  assert.equal(b(10000), 110.0);
  assert.equal(b(15000), 160.0);
  assert.equal(b(20000), 210.67);
  assert.equal(b(30000), 311.67);
  assert.equal(b(40000), 412.67);
  assert.equal(b(50000), 513.67);
});

test("calculatePrintPrice — A6/A5 base = benchmark osservato (config base)", () => {
  assert.equal(calculatePrintPrice({ quantity: 1000, printFormat: "A6", ...BASE }).basePrintPrice, 49.0);
  assert.equal(calculatePrintPrice({ quantity: 2500, printFormat: "A6", ...BASE }).basePrintPrice, 55.5);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A6", ...BASE }).basePrintPrice, 76.0);
  assert.equal(calculatePrintPrice({ quantity: 20000, printFormat: "A6", ...BASE }).basePrintPrice, 149.83);
  assert.equal(calculatePrintPrice({ quantity: 50000, printFormat: "A6", ...BASE }).basePrintPrice, 371.44);
  assert.equal(calculatePrintPrice({ quantity: 1000, printFormat: "A5", ...BASE }).basePrintPrice, 55.0);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE }).basePrintPrice, 110.0);
  assert.equal(calculatePrintPrice({ quantity: 20000, printFormat: "A5", ...BASE }).basePrintPrice, 210.67);
  assert.equal(calculatePrintPrice({ quantity: 50000, printFormat: "A5", ...BASE }).basePrintPrice, 513.67);
});

// ---------------------------------------------------------------------------
// Margine VolantiniPro (interno, 20%) — customerPrice
// ---------------------------------------------------------------------------

test("markup VolantiniPro esattamente 20% (interno, non esposto)", () => {
  assert.equal(VOLANTINIPRO_MARKUP_PCT, 20);
  const a6 = calculatePrintPrice({ quantity: 10000, printFormat: "A6", ...BASE });
  assert.equal(a6.customerPrice, 91.2); // 76 * 1.2
  assert.equal(a6.volantiniProMarkupPct, 20);

  const a5_10 = calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE });
  assert.equal(a5_10.customerPrice, 132.0); // 110 * 1.2

  const a5_20 = calculatePrintPrice({ quantity: 20000, printFormat: "A5", ...BASE });
  assert.ok(close(a5_20.customerPrice, 252.8)); // 210.67 * 1.2

  const a5_50 = calculatePrintPrice({ quantity: 50000, printFormat: "A5", ...BASE });
  assert.ok(close(a5_50.customerPrice, 616.4)); // 513.67 * 1.2

  // rapporto customer/base = 1.20 esatto
  for (const q of [1000, 7000, 12345, 33333, 50000]) {
    const r = calculatePrintPrice({ quantity: q, printFormat: "A5", ...BASE });
    assert.ok(close(r.customerPrice / r.basePrintPrice, 1.2, 0.0005), `q=${q}`);
  }
});

// ---------------------------------------------------------------------------
// Interpolazione lineare
// ---------------------------------------------------------------------------

test("interpolazione lineare tra due benchmark (A5 12.500 ≈ base 135, customer ≈ 162)", () => {
  const r = calculatePrintPrice({ quantity: 12500, printFormat: "A5", ...BASE });
  assert.ok(close(r.baseBenchmarkPrice, 135.0), `base ${r.baseBenchmarkPrice}`);
  assert.ok(close(r.customerPrice, 162.0), `customer ${r.customerPrice}`);
  // metà esatta tra 2500 (70) e 10000 (110) => 6250 -> 90
  assert.ok(close(benchmarkBasePrice("A5", 6250).price, 90.0));
});

// ---------------------------------------------------------------------------
// Sotto / sopra range
// ---------------------------------------------------------------------------

test("sotto il minimo: prezzo del benchmark minimo, mai sotto", () => {
  assert.equal(benchmarkBasePrice("A5", 500).price, 55.0);
  assert.equal(benchmarkBasePrice("A5", 999).price, 55.0);
  assert.equal(benchmarkBasePrice("A6", 200).price, 49.0);
});

test("sopra 50.000: estensione lineare + flag estimatedBeyondBenchmark", () => {
  const r = calculatePrintPrice({ quantity: 60000, printFormat: "A5", ...BASE });
  assert.equal(r.estimatedBeyondBenchmark, true);
  // pendenza ultimo intervallo A5: (513.67-412.67)/10000 = 0.0101 -> +101 a 60k
  assert.ok(close(r.baseBenchmarkPrice, 614.67, 0.02), `base ${r.baseBenchmarkPrice}`);
  assert.equal(calculatePrintPrice({ quantity: 40000, printFormat: "A5", ...BASE }).estimatedBeyondBenchmark, false);
});

test("il prezzo non diminuisce mai al crescere della quantità", () => {
  for (const fmt of ["A5", "A6"]) {
    let prev = -1;
    for (let q = 500; q <= 80000; q += 500) {
      const c = calculatePrintPrice({ quantity: q, printFormat: fmt, ...BASE }).customerPrice;
      assert.ok(c >= prev - 1e-6, `${fmt} q=${q}: ${c} < ${prev}`);
      prev = c;
    }
  }
});

// ---------------------------------------------------------------------------
// A4 — nessun prezzo inventato
// ---------------------------------------------------------------------------

test("A4 = NOT_CONFIGURED: nessun listino inventato", () => {
  assert.equal(PRINT_FORMAT_STATUS.A4, "NOT_CONFIGURED");
  assert.equal(isPrintFormatConfigured("A4"), false);
  assert.equal(PRINT_BENCHMARKS.A4, undefined);
  const r = calculatePrintPrice({ quantity: 10000, printFormat: "A4", ...BASE });
  assert.equal(r.formatConfigured, false);
  assert.equal(r.customerPrice, null);
  assert.equal(r.basePrintPrice, null);
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A4" }), 0);
});

// ---------------------------------------------------------------------------
// Configurazione — NESSUN moltiplicatore non verificato entra nel prezzo.
// Le opzioni si salvano nella specifica ma il prezzo resta invariato;
// ogni parametro espone un flag *Calibrated.
// ---------------------------------------------------------------------------

const priceOf = (over) => calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, ...over }).customerPrice;

test("grammatura: 100/130/170/250/300/350 stesso prezzo (nessun benchmark distinto)", () => {
  const ref = priceOf({ grammage: "130" });
  assert.equal(ref, 132.0);
  for (const g of ["100", "130", "170", "250", "300", "350", "90", "115"]) {
    assert.equal(priceOf({ grammage: g }), ref, `grammage ${g}`);
    assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, grammage: g }).configurationMultipliers.grammage, 1.0);
  }
  // calibrata solo 130g
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, grammage: "130" }).calibration.grammage, true);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, grammage: "170" }).calibration.grammage, false);
});

test("lati: solo fronte / fronte-retro uguali / differenti stesso prezzo; niente ×0.90", () => {
  const ref = priceOf({ sides: "fronte_retro" });
  for (const s of ["fronte", "fronte_retro_eq", "fronte_retro", "front_back_different"]) {
    assert.equal(priceOf({ sides: s }), ref, `sides ${s}`);
    assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, sides: s }).configurationMultipliers.sides, 1.0);
  }
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, sides: "fronte_retro" }).calibration.sides, true);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, sides: "fronte" }).calibration.sides, false);
});

test("colore: colori e bianco/nero stesso prezzo; niente ×0.90 per B/N", () => {
  const ref = priceOf({ color: "colori" });
  assert.equal(priceOf({ color: "bianco_nero" }), ref);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, color: "bianco_nero" }).configurationMultipliers.color, 1.0);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, color: "colori" }).calibration.color, true);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, color: "bianco_nero" }).calibration.color, false);
});

test("carta: opaca / lucida / usomano stesso prezzo (paperMultiplier 1.00)", () => {
  const ref = priceOf({});
  for (const p of ["patinata_opaca", "patinata_lucida", "uso_mano"]) {
    assert.equal(priceOf({ paperType: p }), ref, `paper ${p}`);
  }
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, paperType: "patinata_opaca" }).calibration.paper, true);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, paperType: "uso_mano" }).calibration.paper, false);
});

test("piega: nessuna / meta / tre stesso prezzo (foldMultiplier 1.00)", () => {
  const ref = priceOf({});
  for (const f of ["nessuna", "meta", "tre"]) {
    assert.equal(priceOf({ fold: f }), ref, `fold ${f}`);
    assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, fold: f }).configurationMultipliers.fold, 1.0);
  }
});

test("urgenza stampa: standard / urgent / express stesso prezzo; calibrated solo standard", () => {
  const std = calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, urgency: "standard" });
  const urg = calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, urgency: "urgent" });
  const exp = calculatePrintPrice({ quantity: 10000, printFormat: "A5", ...BASE, urgency: "express" });
  assert.equal(std.customerPrice, urg.customerPrice);
  assert.equal(std.customerPrice, exp.customerPrice);
  assert.equal(std.configurationMultipliers.urgency, 1.0);
  assert.equal(urg.configurationMultipliers.urgency, 1.0);
  assert.equal(std.urgencyCalibrated, true);
  assert.equal(urg.urgencyCalibrated, false);
  assert.equal(exp.urgencyCalibrated, false);
});

test("configurationAdjustment è sempre 1.00: nessun input non verificato nel prezzo", () => {
  const worst = calculatePrintPrice({
    quantity: 30000, printFormat: "A6",
    grammage: "350", sides: "fronte", color: "bianco_nero", paperType: "uso_mano", fold: "tre", urgency: "express",
  });
  const base = calculatePrintPrice({ quantity: 30000, printFormat: "A6", ...BASE });
  assert.equal(worst.configurationAdjustment, 1.0);
  assert.equal(worst.customerPrice, base.customerPrice); // stesse opzioni "estreme" -> stesso prezzo
  assert.ok(close(worst.customerPrice, 223.7 * 1.2)); // solo benchmark A6@30k * 1.20
  for (const k of Object.values(worst.configurationMultipliers)) assert.equal(k, 1.0);
});

// ---------------------------------------------------------------------------
// Separazione printFormat / materialFormat
// ---------------------------------------------------------------------------

test("printFormat A6/A5/A4 · materialFormat A6/A5/A4/DL · DL escluso dalla stampa", () => {
  assert.deepEqual(PRINT_FORMAT_IDS, ["A6", "A5", "A4"]);
  assert.deepEqual(PRINT_FORMAT_OPTIONS.map((o) => o.id), ["A6", "A5", "A4"]);
  assert.deepEqual(MATERIAL_FORMAT_OPTIONS.map((o) => o.id), ["A6", "A5", "A4", "DL"]);
  assert.equal(isPrintableFormat("DL"), false);
  assert.equal(isPrintableFormat("A4"), true);
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "DL", ...BASE }).customerPrice, null);
  assert.equal(toPrintableFormat("DL"), "A5");
});

test("no stampa => printPrice 0; materialFormat non modifica il print price", () => {
  assert.equal(calculatePrintPrice({ quantity: 10000, printFormat: "A5", enabled: false }).customerPrice, null);
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A5", enabled: false }), 0);
  // calculatePrintPrice non accetta materialFormat: cambiare formato materiale
  // in Step1 aggiorna data.flyerFormat ma il motore usa solo printFormat.
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*flyerFormat/);
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*materialFormat/);
});

// ---------------------------------------------------------------------------
// extraServicesRegistry riusa lo stesso motore
// ---------------------------------------------------------------------------

test("extraServicesRegistry 'printing' usa calculatePrintPrice (customerPrice)", () => {
  const registry = buildExtraServicesRegistry({ flyerQty: 10000, durationDays: 1, campaignDurationKnown: true, printConfig: { format: "A5", grammage: "130", sides: "fronte_retro", color: "colori", folding: "nessuna" } });
  const byId = buildExtraServicesById(registry);
  assert.equal(byId.printing.price, 132.0);
  const selected = normalizeSelectedExtras({ printServices: ["stampa"] }, byId);
  assert.equal(selected.find((e) => e.id === "printing").price, 132.0);
  // A4 nel registry -> 0 (nessun prezzo inventato)
  const regA4 = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A4" } });
  assert.equal(buildExtraServicesById(regA4).printing.price, 0);
});

// ---------------------------------------------------------------------------
// Step1 — wiring
// ---------------------------------------------------------------------------

test("Step1 usa il motore centralizzato calculatePrintPrice per il prezzo live", () => {
  assert.match(step1Src, /import \{ calculatePrintPrice, PRINT_FORMAT_OPTIONS, isPrintFormatConfigured, toPrintableFormat \}/);
  assert.match(step1Src, /const printPrice = calculatePrintPrice\(\{[\s\S]*quantity: activeQty[\s\S]*printFormat: printing\.format[\s\S]*urgency: data\.urgency[\s\S]*enabled: printActive/);
  assert.doesNotMatch(step1Src, /activeQty \/ 1000 \* 29/);
  assert.doesNotMatch(step1Src, /PRINT_PRICE_PER_THOUSAND/);
  // niente ×0.90 / ×1.12 / moltiplicatori non verificati nel motore
  const engineSrc = fs.readFileSync(path.join(root, "src/lib/pricing/printPricing.js"), "utf8");
  assert.doesNotMatch(engineSrc, /0\.9\b|0\.94\b|0\.97\b|1\.12\b/);
  assert.match(engineSrc, /customerPrice = round2\(bench\.price \* \(1 \+ VOLANTINIPRO_MARKUP_PCT \/ 100\)\)/);
  // A4 non blocca ma mostra "prezzo da verificare"
  assert.match(step1Src, /const printEstUnknown = printActive && !printFormatConfigured/);
  assert.match(step1Src, /Prezzo da verificare/);
});

test("Step1 default di stampa allineati alla config benchmark (130g, fronte/retro)", () => {
  assert.match(step1Src, /grammage: String\(data\.paperWeight \|\| data\.printGramm \|\| "130"\)/);
  assert.match(step1Src, /sides: data\.printSides \|\| data\.printSide \|\| "fronte_retro"/);
});

test("riepilogo Step1 distingue formato stampa / formato materiale / costo stampa; markup 20% non mostrato", () => {
  assert.match(step1Src, /label: "Formato materiale"/);
  assert.match(step1Src, /label: "Formato stampa"/);
  assert.match(step1Src, /label: "Costo stampa"/);
  assert.match(summarySrc, /printSpecLabel/);
  // il ricarico interno 20% non deve comparire come voce/testo mostrato al cliente
  assert.doesNotMatch(step1Src, /[Mm]argine VolantiniPro/);
  assert.doesNotMatch(step1Src, /markup 20%|ricarico 20%|VolantiniPro \+?20%/i);
  assert.doesNotMatch(summarySrc, /markup|margine/i);
});
