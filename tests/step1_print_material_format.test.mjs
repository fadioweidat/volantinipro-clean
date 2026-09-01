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
  PRINT_A5_BENCHMARKS,
  PRINT_A5_GRAMMAGES,
  PRINT_A6_BENCHMARKS,
  PRINT_A6_GRAMMAGES,
  PRINT_A4_BENCHMARKS,
  PRINT_A4_GRAMMAGES,
  PRINT_UNCOATED_90_BENCHMARKS,
  PRINT_UNCOATED_90_SOURCE,
  isUsoManoPaper,
  PRINT_FORMAT_STATUS,
  VOLANTINIPRO_MARKUP_PCT,
  isPrintFormatConfigured,
  isPrintableFormat,
  toPrintableFormat,
} from "../src/lib/pricing/printPricing.js";
import { buildExtraServicesRegistry, buildExtraServicesById, normalizeSelectedExtras } from "../src/lib/extraServicesRegistry.js";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, HAS_SUPPORT_WHATSAPP, buildGraphicRequestText, buildGraphicWhatsAppUrl, buildGraphicMailtoUrl } from "../src/lib/contactConfig.js";

const root = path.resolve(import.meta.dirname, "..");
const step1Src = fs.readFileSync(path.join(root, "src/pages/public/configurator/Step1.jsx"), "utf8");
const step4Src = fs.readFileSync(path.join(root, "src/pages/public/configurator/Step4.jsx"), "utf8");
const engineSrc = fs.readFileSync(path.join(root, "src/lib/pricing/printPricing.js"), "utf8");
const summarySrc = fs.readFileSync(path.join(root, "src/components/Step1Summary.jsx"), "utf8");

const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// Configurazione coperta dai dati reali A5 (patinata opaca, fronte/retro differenti, colori, nessuna piega).
const A5 = { printFormat: "A5", paperType: "patinata_opaca", sides: "fronte_retro", color: "colori", fold: "nessuna" };
const price = (over) => calculatePrintPrice({ ...A5, ...over });

// ---------------------------------------------------------------------------
// 1. Matrice A5 reale — numeri obbligatori @ 10.000
// ---------------------------------------------------------------------------

test("A5 10k — prezzi obbligatori per grammatura (base / customer +20%)", () => {
  const cases = [
    ["100", 126.01, 151.21],
    ["130", 155.93, 187.12],
    ["170", 174.44, 209.33],
    ["250", 247.0, 296.4],
    ["300", 277.17, 332.6],
    ["350", 333.43, 400.12],
  ];
  for (const [g, base, customer] of cases) {
    const r = price({ quantity: 10000, grammage: g });
    assert.equal(r.basePrintPrice, base, `base ${g}g`);
    assert.equal(r.customerPrice, customer, `customer ${g}g`);
    assert.equal(r.priceStatus, "AUTO_CONFIRMED", `status ${g}g`);
  }
});

test("A5 — l'intera matrice benchmark = customerPrice esatto (base × 1.20) e AUTO_CONFIRMED", () => {
  for (const g of PRINT_A5_GRAMMAGES) {
    for (const [qty, base] of PRINT_A5_BENCHMARKS[g]) {
      const r = price({ quantity: qty, grammage: g });
      assert.equal(r.basePrintPrice, base, `A5 ${g}g ${qty} base`);
      assert.equal(r.customerPrice, round2(base * 1.2), `A5 ${g}g ${qty} customer`);
      assert.equal(r.priceStatus, "AUTO_CONFIRMED", `A5 ${g}g ${qty} status`);
      assert.equal(r.volantiniProMarkupPct, 20);
    }
  }
});

test("il vecchio benchmark A5 ipotetico (55 / 70 / 110) non esiste piu'", () => {
  assert.equal(PRINT_A5_BENCHMARKS["130"][0][1], 47.6);   // 1.000 reale, non 55
  assert.equal(PRINT_A5_BENCHMARKS["130"][4][1], 155.93); // 10.000 reale, non 110
  assert.doesNotMatch(engineSrc, /\[10000, 110\b/);
  assert.doesNotMatch(engineSrc, /\[1000, 55\b/);
});

// ---------------------------------------------------------------------------
// 2. +20% VolantiniPro
// ---------------------------------------------------------------------------

test("markup 20% esatto e interno (mai voce separata)", () => {
  assert.equal(VOLANTINIPRO_MARKUP_PCT, 20);
  for (const g of PRINT_A5_GRAMMAGES) {
    const r = price({ quantity: 10000, grammage: g });
    assert.ok(close(r.customerPrice / r.basePrintPrice, 1.2, 0.0005), `ratio ${g}g`);
  }
  assert.doesNotMatch(step1Src, /[Mm]argine VolantiniPro/);
  assert.doesNotMatch(summarySrc, /markup|margine/i);
});

// ---------------------------------------------------------------------------
// 3-4. Interpolazione
// ---------------------------------------------------------------------------

test("25.000 = INTERPOLATED (lineare tra 20k e 30k, stessa grammatura)", () => {
  for (const g of PRINT_A5_GRAMMAGES) {
    const t = PRINT_A5_BENCHMARKS[g];
    const at20 = t.find((r) => r[0] === 20000)[1];
    const at30 = t.find((r) => r[0] === 30000)[1];
    const expBase = at20 + (at30 - at20) * 0.5;
    const r = price({ quantity: 25000, grammage: g });
    assert.equal(r.priceStatus, "INTERPOLATED", `25k ${g}g status`);
    assert.ok(close(r.baseBenchmarkPrice, round2(expBase), 0.01), `25k ${g}g base`);
    assert.equal(r.customerPrice, round2(expBase * 1.2), `25k ${g}g customer`);
  }
});

test("quantità intermedia = INTERPOLATED, solo tra benchmark della STESSA grammatura", () => {
  const r = price({ quantity: 12500, grammage: "130" });
  assert.equal(r.priceStatus, "INTERPOLATED");
  // 10k=155.93, 15k=222.29 -> 12.5k = media
  assert.ok(close(r.baseBenchmarkPrice, round2((155.93 + 222.29) / 2), 0.01));
  // benchmarkBasePrice non mescola mai grammature diverse
  assert.equal(benchmarkBasePrice("A5", 10000, "130").price, 155.93);
  assert.equal(benchmarkBasePrice("A5", 10000, "170").price, 174.44);
  assert.notEqual(benchmarkBasePrice("A5", 10000, "130").price, benchmarkBasePrice("A5", 10000, "170").price);
});

test("sotto il minimo (1.000) = clamp; sopra 50.000 = estensione lineare, entrambi INTERPOLATED", () => {
  const below = price({ quantity: 500, grammage: "130" });
  assert.equal(below.baseBenchmarkPrice, 47.6);
  assert.equal(below.belowMinBenchmark, true);
  assert.equal(below.priceStatus, "INTERPOLATED");
  const above = price({ quantity: 60000, grammage: "130" });
  assert.equal(above.estimatedBeyondBenchmark, true);
  assert.equal(above.priceStatus, "INTERPOLATED");
  assert.ok(above.customerPrice > price({ quantity: 50000, grammage: "130" }).customerPrice);
});

test("prezzo mai decrescente al crescere della quantità (ogni grammatura)", () => {
  for (const g of PRINT_A5_GRAMMAGES) {
    let prev = -1;
    for (let q = 500; q <= 55000; q += 250) {
      const c = price({ quantity: q, grammage: g }).customerPrice;
      assert.ok(c >= prev - 1e-6, `${g}g q=${q}: ${c} < ${prev}`);
      prev = c;
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Confronto grammature @ 10.000 (analisi, non moltiplicatori)
// ---------------------------------------------------------------------------

test("confronto @10k: crescente con la grammatura, ratio vs 130g", () => {
  const ref = price({ quantity: 10000, grammage: "130" }).basePrintPrice;
  const ratios = PRINT_A5_GRAMMAGES.map((g) => price({ quantity: 10000, grammage: g }).basePrintPrice / ref);
  for (let i = 1; i < ratios.length; i += 1) assert.ok(ratios[i] > ratios[i - 1], `ratio non crescente @ idx ${i}`);
  assert.ok(close(price({ quantity: 10000, grammage: "130" }).basePrintPrice / ref, 1.0));
});

// ---------------------------------------------------------------------------
// 6. Carta
// ---------------------------------------------------------------------------

test("Patinata opaca e Patinata lucida = stesso prezzo (dato reale identico)", () => {
  for (const g of PRINT_A5_GRAMMAGES) {
    const opaca = price({ quantity: 10000, grammage: g, paperType: "patinata_opaca" });
    const lucida = price({ quantity: 10000, grammage: g, paperType: "patinata_lucida" });
    assert.equal(lucida.customerPrice, opaca.customerPrice, `carta ${g}g`);
    assert.equal(lucida.priceStatus, "AUTO_CONFIRMED");
  }
});

test("Uso mano: 90g coperto (AUTO_CONFIRMED); grammatura patinata su uso mano = incompatibile", () => {
  // uso mano + 90g -> prezzo reale dalla matrice uncoated dedicata
  const ok = price({ quantity: 10000, grammage: "90", paperType: "uso_mano" });
  assert.equal(ok.priceStatus, "AUTO_CONFIRMED");
  assert.equal(ok.customerPrice, 145.13); // A5 uso mano 10k
  // uso mano + 130g -> stato incompatibile (uso mano ha solo 90g)
  const bad = price({ quantity: 10000, grammage: "130", paperType: "uso_mano" });
  assert.equal(bad.priceStatus, "REQUIRES_REVIEW");
  assert.equal(bad.customerPrice, null);
  assert.ok(bad.reviewReasons.some((x) => x.startsWith("grammage:")));
  // patinata + 90g -> stato incompatibile (patinata non ha 90g)
  const bad2 = price({ quantity: 10000, grammage: "90", paperType: "patinata_opaca" });
  assert.equal(bad2.priceStatus, "REQUIRES_REVIEW");
  assert.equal(bad2.customerPrice, null);
});

// ---------------------------------------------------------------------------
// 7. Lati
// ---------------------------------------------------------------------------

test("lati: solo fronte / f/r uguali / f/r differenti tutti confermati allo stesso prezzo (A5)", () => {
  const df = price({ quantity: 10000, grammage: "130", sides: "fronte_retro" });
  assert.equal(df.priceStatus, "AUTO_CONFIRMED");
  for (const s of ["fronte", "fronte_retro_eq"]) {
    const r = price({ quantity: 10000, grammage: "130", sides: s });
    assert.equal(r.priceStatus, "AUTO_CONFIRMED", `sides ${s}`);
    assert.equal(r.customerPrice, df.customerPrice, `sides ${s} == f/r differenti`);
    assert.equal(r.customerPrice, 187.12, `sides ${s} price`);
  }
});

// ---------------------------------------------------------------------------
// 8. Colore
// ---------------------------------------------------------------------------

test("colore: colori (4/4) confermato; bianco/nero = REQUIRES_REVIEW, nessuno sconto inventato", () => {
  assert.equal(price({ quantity: 10000, grammage: "130", color: "colori" }).priceStatus, "AUTO_CONFIRMED");
  const bn = price({ quantity: 10000, grammage: "130", color: "bianco_nero" });
  assert.equal(bn.priceStatus, "REQUIRES_REVIEW");
  assert.equal(bn.customerPrice, null);
});

// ---------------------------------------------------------------------------
// 9. Piega
// ---------------------------------------------------------------------------

test("piega: nessuna confermata; metà e tre = REQUIRES_REVIEW (SKU separato)", () => {
  assert.equal(price({ quantity: 10000, grammage: "130", fold: "nessuna" }).priceStatus, "AUTO_CONFIRMED");
  for (const f of ["meta", "tre"]) {
    assert.equal(price({ quantity: 10000, grammage: "130", fold: f }).priceStatus, "REQUIRES_REVIEW", `fold ${f}`);
    assert.equal(price({ quantity: 10000, grammage: "130", fold: f }).customerPrice, null);
  }
});

// ---------------------------------------------------------------------------
// 10. Formati
// ---------------------------------------------------------------------------

test("formati: A5, A6 e A4 = CONFIGURED (matrici reali dedicate e indipendenti)", () => {
  assert.equal(PRINT_FORMAT_STATUS.A5, "CONFIGURED");
  assert.equal(PRINT_FORMAT_STATUS.A6, "CONFIGURED");
  assert.equal(PRINT_FORMAT_STATUS.A4, "CONFIGURED");
  assert.equal(isPrintFormatConfigured("A5"), true);
  assert.equal(isPrintFormatConfigured("A6"), true);
  assert.equal(isPrintFormatConfigured("A4"), true);
  // A4 con config coperta -> prezzo reale, mai NOT_CONFIGURED
  const a4 = price({ quantity: 10000, grammage: "130", printFormat: "A4" });
  assert.equal(a4.priceStatus, "AUTO_CONFIRMED");
  assert.equal(a4.customerPrice, 348.96);
  assert.equal(benchmarkBasePrice("A4", 10000, "130").price, 290.8);
  // NOT_CONFIGURED resta solo per stampa disattivata
  assert.equal(price({ quantity: 10000, grammage: "130", printFormat: "A4", enabled: false }).priceStatus, "NOT_CONFIGURED");
  // formato ignoto -> REQUIRES_REVIEW (non NOT_CONFIGURED), nessun benchmark
  assert.equal(price({ quantity: 10000, grammage: "130", printFormat: "A3" }).priceStatus, "REQUIRES_REVIEW");
  assert.equal(benchmarkBasePrice("A3", 10000, "130").price, null);
});

// ---------------------------------------------------------------------------
// 10-bis. Matrice A6 reale (Pixartprinting /product/quote/, 2026-08-28, ex IVA,
// standard/economy). Indipendente da A5, nessun moltiplicatore derivato.
// ---------------------------------------------------------------------------

const A6 = { printFormat: "A6", paperType: "patinata_opaca", sides: "fronte_retro", color: "colori", fold: "nessuna" };
const priceA6 = (over) => calculatePrintPrice({ ...A6, ...over });

test("A6 10k — prezzi obbligatori per grammatura (base / customer +20%)", () => {
  const cases = [
    ["100", 72.28, 86.74],
    ["130", 82.98, 99.58],
    ["170", 97.5, 117.0],
    ["250", 131.91, 158.29],
    ["300", 153.62, 184.34],
    ["350", 176.86, 212.23],
  ];
  for (const [g, base, customer] of cases) {
    const r = priceA6({ quantity: 10000, grammage: g });
    assert.equal(r.basePrintPrice, base, `A6 base ${g}g`);
    assert.equal(r.customerPrice, customer, `A6 customer ${g}g`);
    assert.equal(r.priceStatus, "AUTO_CONFIRMED", `A6 status ${g}g`);
    assert.equal(r.format, "A6");
  }
});

test("A6 — intera matrice benchmark = customerPrice esatto (base × 1.20) e AUTO_CONFIRMED", () => {
  for (const g of PRINT_A6_GRAMMAGES) {
    for (const [qty, base] of PRINT_A6_BENCHMARKS[g]) {
      const r = priceA6({ quantity: qty, grammage: g });
      assert.equal(r.basePrintPrice, base, `A6 ${g}g ${qty} base`);
      assert.equal(r.customerPrice, round2(base * 1.2), `A6 ${g}g ${qty} customer`);
      assert.equal(r.priceStatus, "AUTO_CONFIRMED", `A6 ${g}g ${qty} status`);
    }
  }
});

test("A6 matrice != A5 matrice (dati indipendenti, nessuna derivazione)", () => {
  assert.deepEqual(PRINT_A6_GRAMMAGES, PRINT_A5_GRAMMAGES); // stesse grammature
  for (const g of PRINT_A6_GRAMMAGES) {
    assert.notEqual(
      PRINT_A6_BENCHMARKS[g][4][1], PRINT_A5_BENCHMARKS[g][4][1],
      `A6 e A5 @10k coincidono per ${g}g (sospetto di derivazione)`,
    );
    // A6 e' piu' economico di A5 a pari grammatura/quantita' (formato piu' piccolo)
    assert.ok(PRINT_A6_BENCHMARKS[g][4][1] < PRINT_A5_BENCHMARKS[g][4][1], `A6 >= A5 @10k ${g}g`);
  }
});

test("A6 25.000 = INTERPOLATED (lineare 20k↔30k, stessa grammatura A6)", () => {
  for (const g of PRINT_A6_GRAMMAGES) {
    const t = PRINT_A6_BENCHMARKS[g];
    const at20 = t.find((r) => r[0] === 20000)[1];
    const at30 = t.find((r) => r[0] === 30000)[1];
    const expBase = at20 + (at30 - at20) * 0.5;
    const r = priceA6({ quantity: 25000, grammage: g });
    assert.equal(r.priceStatus, "INTERPOLATED", `A6 25k ${g}g status`);
    assert.ok(close(r.baseBenchmarkPrice, round2(expBase), 0.01), `A6 25k ${g}g base`);
    assert.equal(r.customerPrice, round2(expBase * 1.2), `A6 25k ${g}g customer`);
  }
  // benchmarkBasePrice non mescola mai A5 e A6
  assert.equal(benchmarkBasePrice("A6", 10000, "130").price, 82.98);
  assert.equal(benchmarkBasePrice("A5", 10000, "130").price, 155.93);
  // interpolazione 25k: ogni formato usa SOLO la propria tabella (20k/30k adiacenti)
  assert.ok(close(benchmarkBasePrice("A6", 25000, "130").price, (159.93 + 222.29) / 2, 1e-9)); // 191.11
  assert.ok(close(benchmarkBasePrice("A5", 25000, "130").price, (274.65 + 401.68) / 2, 1e-9)); // 338.165
  assert.equal(round2(benchmarkBasePrice("A6", 25000, "130").price), 191.11);
  assert.equal(round2(benchmarkBasePrice("A5", 25000, "130").price), 338.17);
  assert.notEqual(
    priceA6({ quantity: 25000, grammage: "130" }).customerPrice,
    price({ quantity: 25000, grammage: "130" }).customerPrice,
    "A6 25k 130g deve differire da A5 25k 130g (tabelle indipendenti)",
  );
  assert.equal(priceA6({ quantity: 25000, grammage: "130" }).customerPrice, 229.33);
  assert.equal(priceA6({ quantity: 25000, grammage: "130" }).source, "Pixartprinting.it (2026-08-28, ex IVA, consegna standard/economy)");
});

test("A6 carta: patinata opaca == patinata lucida (dato reale identico), AUTO_CONFIRMED", () => {
  for (const g of PRINT_A6_GRAMMAGES) {
    const opaca = priceA6({ quantity: 10000, grammage: g, paperType: "patinata_opaca" });
    const lucida = priceA6({ quantity: 10000, grammage: g, paperType: "patinata_lucida" });
    assert.equal(lucida.customerPrice, opaca.customerPrice, `A6 carta ${g}g`);
    assert.equal(lucida.priceStatus, "AUTO_CONFIRMED");
  }
});

test("A6 config non coperte = REQUIRES_REVIEW, customerPrice null (nessuno sconto/mapping inventato)", () => {
  const bad = [
    { paperType: "uso_mano" }, // uso mano + 130g (default) = incompatibile
    { grammage: "90" }, // patinata + 90g = incompatibile
    { color: "bianco_nero" },
    { fold: "meta" },
    { fold: "tre" },
    { grammage: "115" },
  ];
  for (const over of bad) {
    const r = priceA6({ quantity: 10000, grammage: "130", ...over });
    assert.equal(r.priceStatus, "REQUIRES_REVIEW", `A6 ${JSON.stringify(over)}`);
    assert.equal(r.customerPrice, null, `A6 ${JSON.stringify(over)} price`);
  }
});

test("A6 prezzo mai decrescente al crescere della quantità (ogni grammatura)", () => {
  for (const g of PRINT_A6_GRAMMAGES) {
    let prev = -1;
    for (let q = 500; q <= 55000; q += 500) {
      const c = priceA6({ quantity: q, grammage: g }).customerPrice;
      assert.ok(c >= prev - 1e-6, `A6 ${g}g q=${q}: ${c} < ${prev}`);
      prev = c;
    }
  }
});

// ---------------------------------------------------------------------------
// 10-ter. Matrice A4 reale (Pixartprinting /product/quote/, 2026-08-28, CAP
// 30020, ex IVA, standard/economy). Indipendente da A5 e A6. NOVITA': su A4
// solo fronte + fronte/retro uguali + fronte/retro differenti sono TUTTI allo
// stesso prezzo reale (equivalenza verificata, non un moltiplicatore).
// ---------------------------------------------------------------------------

const A4 = { printFormat: "A4", paperType: "patinata_opaca", sides: "fronte_retro", color: "colori", fold: "nessuna" };
const priceA4 = (over) => calculatePrintPrice({ ...A4, ...over });

test("A4 10k — prezzi obbligatori per grammatura (base / customer +20%)", () => {
  const cases = [
    ["100", 250.42, 300.5],
    ["130", 290.8, 348.96],
    ["170", 355.28, 426.34],
    ["250", 509.11, 610.93],
    ["300", 605.15, 726.18],
    ["350", 708.56, 850.27],
  ];
  for (const [g, base, customer] of cases) {
    const r = priceA4({ quantity: 10000, grammage: g });
    assert.equal(r.basePrintPrice, base, `A4 base ${g}g`);
    assert.equal(r.customerPrice, customer, `A4 customer ${g}g`);
    assert.equal(r.priceStatus, "AUTO_CONFIRMED", `A4 status ${g}g`);
    assert.equal(r.format, "A4");
  }
});

test("A4 — intera matrice benchmark = customerPrice esatto (base × 1.20) e AUTO_CONFIRMED", () => {
  for (const g of PRINT_A4_GRAMMAGES) {
    for (const [qty, base] of PRINT_A4_BENCHMARKS[g]) {
      const r = priceA4({ quantity: qty, grammage: g });
      assert.equal(r.basePrintPrice, base, `A4 ${g}g ${qty} base`);
      assert.equal(r.customerPrice, round2(base * 1.2), `A4 ${g}g ${qty} customer`);
      assert.equal(r.priceStatus, "AUTO_CONFIRMED", `A4 ${g}g ${qty} status`);
    }
  }
});

// ---------------------------------------------------------------------------
// LATI — A4/A5/A6: i 3 tipi (solo fronte / f/r uguali / f/r differenti) sono
// coperti allo STESSO prezzo reale su OGNI formato e OGNI grammatura in matrice
// (equivalenza verificata dal vivo su Pixartprinting, layout confermato in UI e
// nel body /product/quote/). Nessun SIDES_MULTIPLIER: il lato non muove il prezzo.
// ---------------------------------------------------------------------------

const SIDES_3 = ["fronte", "fronte_retro_eq", "fronte_retro"];
const cfg = (fmt) => ({ printFormat: fmt, paperType: "patinata_opaca", color: "colori", fold: "nessuna" });

test("LATI: A4/A5/A6 — i 3 tipi allo stesso customerPrice e AUTO_CONFIRMED, ogni grammatura", () => {
  const GR = { A4: PRINT_A4_GRAMMAGES, A5: PRINT_A5_GRAMMAGES, A6: PRINT_A6_GRAMMAGES };
  for (const fmt of ["A4", "A5", "A6"]) {
    for (const g of GR[fmt]) {
      const prices = SIDES_3.map((s) => calculatePrintPrice({ ...cfg(fmt), quantity: 10000, grammage: g, sides: s }));
      for (const r of prices) {
        assert.equal(r.priceStatus, "AUTO_CONFIRMED", `${fmt} ${g}g sides status`);
        assert.equal(r.customerPrice, prices[2].customerPrice, `${fmt} ${g}g sides stesso prezzo`);
        assert.equal(r.customerPrice, prices[0].customerPrice, `${fmt} ${g}g sides stesso prezzo`);
      }
    }
  }
  // equivalenza reale, non moltiplicatore: SIDES_MULTIPLIER resta 1.0 e il
  // prezzo non dipende da `sides` (dimostrato sopra: 3 lati -> stesso customerPrice).
  assert.match(engineSrc, /SIDES_MULTIPLIER = 1\.0/);
});

test("LATI — esempi obbligatori A5 (10k, tutti e 3 i lati = stesso customerPrice)", () => {
  for (const [g, base, customer] of [["130", 155.93, 187.12], ["250", 247.0, 296.4]]) {
    for (const s of SIDES_3) {
      const r = calculatePrintPrice({ ...cfg("A5"), quantity: 10000, grammage: g, sides: s });
      assert.equal(r.basePrintPrice, base, `A5 10k ${g}g ${s} base`);
      assert.equal(r.customerPrice, customer, `A5 10k ${g}g ${s} customer`);
      assert.equal(r.priceStatus, "AUTO_CONFIRMED");
    }
  }
});

test("LATI — esempi obbligatori A6 (10k, tutti e 3 i lati = stesso customerPrice)", () => {
  for (const [g, base, customer] of [["130", 82.98, 99.58], ["250", 131.91, 158.29]]) {
    for (const s of SIDES_3) {
      const r = calculatePrintPrice({ ...cfg("A6"), quantity: 10000, grammage: g, sides: s });
      assert.equal(r.basePrintPrice, base, `A6 10k ${g}g ${s} base`);
      assert.equal(r.customerPrice, customer, `A6 10k ${g}g ${s} customer`);
      assert.equal(r.priceStatus, "AUTO_CONFIRMED");
    }
  }
});

test("LATI — cambiare lato NON cambia il customerPrice (A5/A6, su interpolazione 25k inclusa)", () => {
  for (const fmt of ["A5", "A6"]) {
    for (const q of [10000, 25000, 12345]) {
      const cs = SIDES_3.map((s) => calculatePrintPrice({ ...cfg(fmt), quantity: q, grammage: "250", sides: s }).customerPrice);
      assert.equal(cs[0], cs[1], `${fmt} q=${q} solo fronte == f/r uguali`);
      assert.equal(cs[1], cs[2], `${fmt} q=${q} f/r uguali == f/r differenti`);
    }
  }
});

test("A4 25.000 = INTERPOLATED (lineare 20k↔30k, tabella A4)", () => {
  for (const g of PRINT_A4_GRAMMAGES) {
    const t = PRINT_A4_BENCHMARKS[g];
    const at20 = t.find((r) => r[0] === 20000)[1];
    const at30 = t.find((r) => r[0] === 30000)[1];
    const expBase = at20 + (at30 - at20) * 0.5;
    const r = priceA4({ quantity: 25000, grammage: g });
    assert.equal(r.priceStatus, "INTERPOLATED", `A4 25k ${g}g status`);
    assert.ok(close(r.baseBenchmarkPrice, round2(expBase), 0.01), `A4 25k ${g}g base`);
    assert.equal(r.customerPrice, round2(expBase * 1.2), `A4 25k ${g}g customer`);
  }
});

test("A4 carta: patinata opaca == patinata lucida (dato reale identico), AUTO_CONFIRMED", () => {
  for (const g of PRINT_A4_GRAMMAGES) {
    const opaca = priceA4({ quantity: 10000, grammage: g, paperType: "patinata_opaca" });
    const lucida = priceA4({ quantity: 10000, grammage: g, paperType: "patinata_lucida" });
    assert.equal(lucida.customerPrice, opaca.customerPrice, `A4 carta ${g}g`);
    assert.equal(lucida.priceStatus, "AUTO_CONFIRMED");
  }
});

test("A4 config non coperte = REQUIRES_REVIEW, customerPrice null", () => {
  const bad = [
    { paperType: "uso_mano" }, // uso mano + 130g (base) = incompatibile
    { grammage: "90" }, // patinata + 90g = incompatibile
    { color: "bianco_nero" },
    { fold: "meta" },
    { fold: "tre" },
    { grammage: "115" },
  ];
  for (const over of bad) {
    const r = priceA4({ quantity: 10000, grammage: "130", ...over });
    assert.equal(r.priceStatus, "REQUIRES_REVIEW", `A4 ${JSON.stringify(over)}`);
    assert.equal(r.customerPrice, null, `A4 ${JSON.stringify(over)} price`);
  }
});

test("A4/A5/A6 — nessuna cross-contamination: ogni formato legge SOLO la propria tabella", () => {
  assert.deepEqual(PRINT_A4_GRAMMAGES, PRINT_A5_GRAMMAGES);
  assert.deepEqual(PRINT_A4_GRAMMAGES, PRINT_A6_GRAMMAGES);
  for (const g of PRINT_A4_GRAMMAGES) {
    const a4 = benchmarkBasePrice("A4", 10000, g).price;
    const a5 = benchmarkBasePrice("A5", 10000, g).price;
    const a6 = benchmarkBasePrice("A6", 10000, g).price;
    assert.equal(new Set([a4, a5, a6].map((n) => round2(n))).size, 3, `@10k ${g}g A4/A5/A6 devono differire`);
    assert.ok(a4 > a5 && a5 > a6, `@10k ${g}g atteso A4 > A5 > A6`);
  }
  // 25k interpolato: A4 usa i propri 20k/30k, non quelli di A5/A6
  const a4_25 = round2(benchmarkBasePrice("A4", 25000, "130").price);
  assert.equal(a4_25, round2((541.04 + 775.12) / 2)); // 658.08
  assert.notEqual(priceA4({ quantity: 25000, grammage: "130" }).customerPrice, priceA6({ quantity: 25000, grammage: "130" }).customerPrice);
  assert.notEqual(priceA4({ quantity: 25000, grammage: "130" }).customerPrice, price({ quantity: 25000, grammage: "130" }).customerPrice);
});

test("A4 prezzo mai decrescente al crescere della quantità (ogni grammatura)", () => {
  for (const g of PRINT_A4_GRAMMAGES) {
    let prev = -1;
    for (let q = 500; q <= 55000; q += 500) {
      const c = priceA4({ quantity: q, grammage: g }).customerPrice;
      assert.ok(c >= prev - 1e-6, `A4 ${g}g q=${q}: ${c} < ${prev}`);
      prev = c;
    }
  }
});

test("A5 regressione: matrice e numeri A5 invariati dopo l'aggiunta di A6/A4", () => {
  assert.equal(price({ quantity: 10000, grammage: "130" }).customerPrice, 187.12);
  assert.equal(price({ quantity: 10000, grammage: "250" }).customerPrice, 296.4);
  assert.equal(price({ quantity: 10000, grammage: "130" }).priceStatus, "AUTO_CONFIRMED");
  assert.equal(PRINT_A5_BENCHMARKS["130"][4][1], 155.93);
  assert.equal(PRINT_A5_BENCHMARKS["350"][9][1], 1680.05);
  assert.equal(benchmarkBasePrice("A5", 10000, "170").price, 174.44);
});

test("A6 regressione: matrice e numeri A6 invariati dopo l'aggiunta di A4", () => {
  assert.equal(priceA6({ quantity: 10000, grammage: "130" }).customerPrice, 99.58);
  assert.equal(priceA6({ quantity: 10000, grammage: "250" }).customerPrice, 158.29);
  assert.equal(PRINT_A6_BENCHMARKS["130"][4][1], 82.98);
  assert.equal(benchmarkBasePrice("A6", 10000, "170").price, 97.5);
});

// ---------------------------------------------------------------------------
// USO MANO 90 g/m² — matrice dedicata PRINT_UNCOATED_90_BENCHMARKS per formato
// (Pixartprinting /product/quote/, 2026-08-28, CAP 30020, ex IVA, standard/
// economy). Contratto fornitore: uso mano espone SOLO 90g; patinata SOLO
// 100..350. Combinazioni incrociate -> REQUIRES_REVIEW.
// ---------------------------------------------------------------------------

const um = (fmt, over) => calculatePrintPrice({ printFormat: fmt, paperType: "uso_mano", grammage: "90", sides: "fronte_retro", color: "colori", fold: "nessuna", quantity: 10000, ...over });

test("USO MANO 90g — prezzi obbligatori 10k (base / customer +20%) per formato", () => {
  for (const [fmt, base, customer] of [["A4", 218.18, 261.82], ["A5", 120.94, 145.13], ["A6", 74.7, 89.64]]) {
    const r = um(fmt);
    assert.equal(r.basePrintPrice, base, `${fmt} um base`);
    assert.equal(r.customerPrice, customer, `${fmt} um customer`);
    assert.equal(r.priceStatus, "AUTO_CONFIRMED", `${fmt} um status`);
    assert.equal(r.source, PRINT_UNCOATED_90_SOURCE, `${fmt} um source`);
    assert.equal(r.format, fmt);
  }
});

test("USO MANO 90g — intera matrice uncoated = customerPrice esatto (base × 1.20) e AUTO_CONFIRMED", () => {
  for (const fmt of ["A4", "A5", "A6"]) {
    for (const [qty, base] of PRINT_UNCOATED_90_BENCHMARKS[fmt]["90"]) {
      const r = um(fmt, { quantity: qty });
      assert.equal(r.basePrintPrice, base, `${fmt} um ${qty} base`);
      assert.equal(r.customerPrice, round2(base * 1.2), `${fmt} um ${qty} customer`);
      assert.equal(r.priceStatus, "AUTO_CONFIRMED", `${fmt} um ${qty} status`);
    }
  }
});

test("USO MANO 90g — i 3 lati allo stesso customerPrice, AUTO_CONFIRMED (A4/A5/A6)", () => {
  for (const fmt of ["A4", "A5", "A6"]) {
    const cs = ["fronte", "fronte_retro_eq", "fronte_retro"].map((s) => um(fmt, { sides: s }));
    for (const r of cs) {
      assert.equal(r.priceStatus, "AUTO_CONFIRMED", `${fmt} um sides`);
      assert.equal(r.customerPrice, cs[0].customerPrice, `${fmt} um sides stesso prezzo`);
      assert.equal(r.customerPrice, cs[2].customerPrice, `${fmt} um sides stesso prezzo`);
    }
  }
});

test("USO MANO 90g — 25.000 = INTERPOLATED (lineare 20k↔30k, tabella uncoated del formato)", () => {
  for (const fmt of ["A4", "A5", "A6"]) {
    const t = PRINT_UNCOATED_90_BENCHMARKS[fmt]["90"];
    const at20 = t.find((r) => r[0] === 20000)[1];
    const at30 = t.find((r) => r[0] === 30000)[1];
    const expBase = at20 + (at30 - at20) * 0.5;
    const r = um(fmt, { quantity: 25000 });
    assert.equal(r.priceStatus, "INTERPOLATED", `${fmt} um 25k status`);
    assert.ok(close(r.baseBenchmarkPrice, round2(expBase), 0.01), `${fmt} um 25k base`);
    assert.equal(r.customerPrice, round2(expBase * 1.2), `${fmt} um 25k customer`);
  }
});

test("USO MANO — stati incompatibili carta/grammatura = REQUIRES_REVIEW, customerPrice null", () => {
  for (const fmt of ["A4", "A5", "A6"]) {
    // uso mano + grammatura patinata
    for (const g of ["100", "130", "170", "250", "300", "350"]) {
      const r = um(fmt, { grammage: g });
      assert.equal(r.priceStatus, "REQUIRES_REVIEW", `${fmt} uso mano + ${g}g`);
      assert.equal(r.customerPrice, null);
    }
    // patinata + 90g
    const p90 = calculatePrintPrice({ printFormat: fmt, paperType: "patinata_opaca", grammage: "90", sides: "fronte_retro", color: "colori", fold: "nessuna", quantity: 10000 });
    assert.equal(p90.priceStatus, "REQUIRES_REVIEW", `${fmt} patinata + 90g`);
    assert.equal(p90.customerPrice, null);
  }
});

test("USO MANO 90g — B/N e piega restano REQUIRES_REVIEW", () => {
  for (const fmt of ["A4", "A5", "A6"]) {
    assert.equal(um(fmt, { color: "bianco_nero" }).priceStatus, "REQUIRES_REVIEW");
    assert.equal(um(fmt, { fold: "meta" }).priceStatus, "REQUIRES_REVIEW");
    assert.equal(um(fmt, { fold: "tre" }).priceStatus, "REQUIRES_REVIEW");
  }
});

test("USO MANO — nessuna cross-contamination con le matrici patinata né tra formati", () => {
  // uso mano != patinata, stesso formato/quantità
  for (const fmt of ["A4", "A5", "A6"]) {
    const umC = um(fmt).customerPrice;
    const patC = calculatePrintPrice({ printFormat: fmt, paperType: "patinata_opaca", grammage: "130", sides: "fronte_retro", color: "colori", fold: "nessuna", quantity: 10000 }).customerPrice;
    assert.notEqual(umC, patC, `${fmt} um != patinata`);
  }
  // uso mano A4 != A5 != A6 (tabelle indipendenti)
  const [a4, a5, a6] = ["A4", "A5", "A6"].map((f) => um(f).customerPrice);
  assert.equal(new Set([a4, a5, a6]).size, 3);
  assert.ok(a4 > a5 && a5 > a6, "atteso A4 > A5 > A6 anche per uso mano @10k");
  // benchmarkBasePrice: 4° arg paperType instrada sulla tabella giusta; 3-arg = patinata (compat)
  assert.equal(round2(benchmarkBasePrice("A5", 10000, "90", "uso_mano").price), 120.94);
  assert.equal(benchmarkBasePrice("A5", 10000, "90").price, null); // patinata non ha 90g
  assert.equal(benchmarkBasePrice("A5", 10000, "130").price, 155.93); // 3-arg invariato
});

test("USO MANO — helper isUsoManoPaper riconosce le varianti; patinata invariata", () => {
  for (const v of ["uso_mano", "Uso mano", "Classic Usomano", "classic_uncoated", "UNCOATED"]) {
    assert.equal(isUsoManoPaper(v), true, `isUsoManoPaper(${v})`);
  }
  for (const v of ["patinata_opaca", "patinata_lucida", "classic_demimatt", "", null, undefined]) {
    assert.equal(isUsoManoPaper(v), false, `isUsoManoPaper(${v})`);
  }
});

test("USO MANO — regressione patinata: A4/A5/A6 @10k 130g invariati; lati/25k patinata invariati", () => {
  assert.equal(calculatePrintPrice({ ...A4, quantity: 10000, grammage: "130" }).customerPrice, 348.96);
  assert.equal(price({ quantity: 10000, grammage: "130" }).customerPrice, 187.12);
  assert.equal(priceA6({ quantity: 10000, grammage: "130" }).customerPrice, 99.58);
  // lati patinata: 3 tipi stesso prezzo (invariato)
  for (const s of ["fronte", "fronte_retro_eq", "fronte_retro"]) {
    assert.equal(price({ quantity: 10000, grammage: "250", sides: s }).customerPrice, 296.4);
  }
  // 25k patinata invariato
  assert.equal(price({ quantity: 25000, grammage: "130" }).priceStatus, "INTERPOLATED");
});

test("grammatura fuori matrice (90/115/135) = REQUIRES_REVIEW", () => {
  for (const g of ["90", "115", "135"]) {
    assert.equal(price({ quantity: 10000, grammage: g }).priceStatus, "REQUIRES_REVIEW", `g ${g}`);
    assert.equal(price({ quantity: 10000, grammage: g }).customerPrice, null);
  }
  // formati grammatura accettati anche come "130 g/m²"
  assert.equal(price({ quantity: 10000, grammage: "130 g/m²" }).customerPrice, 187.12);
});

// ---------------------------------------------------------------------------
// 11. priceStatus
// ---------------------------------------------------------------------------

test("priceStatus copre i 4 valori del contratto", () => {
  const seen = new Set();
  seen.add(price({ quantity: 10000, grammage: "130" }).priceStatus);            // AUTO_CONFIRMED
  seen.add(price({ quantity: 12345, grammage: "130" }).priceStatus);            // INTERPOLATED
  seen.add(price({ quantity: 10000, grammage: "130", color: "bianco_nero" }).priceStatus); // REQUIRES_REVIEW (B/N non coperto)
  seen.add(price({ quantity: 10000, grammage: "130", enabled: false }).priceStatus);  // NOT_CONFIGURED
  assert.deepEqual([...seen].sort(), ["AUTO_CONFIRMED", "INTERPOLATED", "NOT_CONFIGURED", "REQUIRES_REVIEW"]);
});

// ---------------------------------------------------------------------------
// computePrintEstimate + registry
// ---------------------------------------------------------------------------

test("computePrintEstimate: 0 se non attiva / config non coperta; prezzo reale coi default", () => {
  assert.equal(computePrintEstimate({ quantity: 10000, enabled: false }), 0);
  assert.equal(computePrintEstimate({ quantity: 10000 }), 187.12); // default A5/130/opaca/f-r/colori/nessuna
  assert.equal(computePrintEstimate({ quantity: 10000, grammage: "250" }), 296.4);
  assert.equal(computePrintEstimate({ quantity: 10000, sides: "fronte" }), 187.12); // A5 solo fronte = f/r differenti (dato reale)
  assert.equal(computePrintEstimate({ quantity: 10000, sides: "fronte_retro_eq" }), 187.12);
  assert.equal(computePrintEstimate({ quantity: 10000, color: "bianco_nero" }), 0);  // B/N non coperto -> 0
  // A6 / A4 hanno matrice reale: coi default (130/opaca/f-r/colori/nessuna) -> prezzo del formato
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A6" }), 99.58);
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A6", grammage: "250" }), 158.29);
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A4" }), 348.96);
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A4", grammage: "250" }), 610.93);
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A4", enabled: false }), 0);
});

test("extraServicesRegistry 'printing' usa computePrintEstimate (matrice reale)", () => {
  const reg = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "130", sides: "fronte_retro", color: "colori", paperType: "patinata_opaca", folding: "nessuna" } });
  assert.equal(buildExtraServicesById(reg).printing.price, 187.12);
  const reg250 = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "250", sides: "fronte_retro", color: "colori", paperType: "patinata_opaca", folding: "nessuna" } });
  assert.equal(buildExtraServicesById(reg250).printing.price, 296.4);
  // A5 solo fronte = stesso prezzo reale di f/r differenti (dato verificato)
  const regSolo = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "130", sides: "fronte", color: "colori", paperType: "patinata_opaca", folding: "nessuna" } });
  assert.equal(buildExtraServicesById(regSolo).printing.price, 187.12);
  // config davvero non coperta (B/N) -> 0
  const regReview = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "130", sides: "fronte_retro", color: "bianco_nero", paperType: "patinata_opaca", folding: "nessuna" } });
  assert.equal(buildExtraServicesById(regReview).printing.price, 0);
});

// ---------------------------------------------------------------------------
// 12. Step1 — wiring live
// ---------------------------------------------------------------------------

test("Step1 usa calculatePrintPrice e mostra 'Da verificare' quando customerPrice è null", () => {
  assert.match(step1Src, /const printPrice = calculatePrintPrice\(\{[\s\S]*quantity: activeQty[\s\S]*printFormat: printing\.format[\s\S]*grammage: printing\.grammage[\s\S]*sides: printing\.sides[\s\S]*color: printing\.color[\s\S]*paperType: printing\.paperType[\s\S]*enabled: printActive/);
  assert.match(step1Src, /const printEstUnknown = printActive && printPrice\.customerPrice == null/);
  assert.match(step1Src, /Prezzo da verificare|Da verificare/);
  assert.doesNotMatch(step1Src, /activeQty \/ 1000 \* 29/);
});

// ---------------------------------------------------------------------------
// 14. Step4 — prezzo coerente con la grammatura
// ---------------------------------------------------------------------------

test("Step4 calcola il prezzo stampa reale e mostra 'Da verificare' se REQUIRES_REVIEW; mai nel totale", () => {
  assert.match(step4Src, /import \{ calculatePrintPrice \} from "\.\.\/\.\.\/\.\.\/lib\/pricing\/printPricing\.js"/);
  assert.match(step4Src, /const printQuote = calculatePrintPrice\(\{[\s\S]*quantity: flyerQty[\s\S]*grammage: data\.printing\?\.grammage/);
  assert.match(step4Src, /const printPriceKnown = printQuote\.customerPrice != null/);
  assert.match(step4Src, /l: "Prezzo stampa",\s*\n\s*v: printPriceKnown \? .* : "Da verificare"/);
  // stampa resta esclusa dal totale distribuzione
  assert.match(step4Src, /const distributionExtras = selectedExtras\.filter\(e => e\.id !== "printing"\)/);
  assert.match(step4Src, /extras: distributionExtras/);
});

// ---------------------------------------------------------------------------
// Regressioni: separazione formati / grafica / contatti
// ---------------------------------------------------------------------------

test("printFormat A5/A6/A4 · materialFormat +DL · DL mai printFormat", () => {
  assert.deepEqual(PRINT_FORMAT_IDS, ["A6", "A5", "A4"]);
  assert.deepEqual(MATERIAL_FORMAT_OPTIONS.map((o) => o.id), ["A6", "A5", "A4", "DL"]);
  assert.equal(isPrintableFormat("DL"), false);
  assert.equal(toPrintableFormat("DL"), "A5");
  assert.equal(price({ quantity: 10000, grammage: "130", printFormat: "DL" }).customerPrice, null);
  // il formato materiale non è un input del motore prezzo stampa
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*flyerFormat/);
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*materialFormat/);
});

test("grafica: sezione INDIPENDENTE dalla stampa — prezzo separato, mai mescolato", () => {
  // Il motore stampa non ha parametri artwork/graphic (nessun mix).
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*artwork/i);
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*graphic/i);
  // printPricing.js non conosce la grafica.
  assert.doesNotMatch(engineSrc, /graphicPricing|GRAPHIC_SERVICE_PRICE|computeGraphicEstimate/);
  // Modulo grafica dedicato, prezzo unico (ticket: €79 fisso).
  const graphicSrc = fs.readFileSync(path.join(root, "src/lib/pricing/graphicPricing.js"), "utf8");
  assert.match(graphicSrc, /GRAPHIC_SERVICE_PRICE\s*=\s*79/);
  assert.doesNotMatch(graphicSrc, /^\s*import[^\n]*printPricing/m);
  // Step1: sezione Grafica indipendente, opzione B mostra il prezzo e la
  // scelta esplicita di aggiungerla.
  assert.match(step1Src, /GRAPHIC_SERVICE_PRICE/);
  assert.match(step1Src, /Aggiungi grafica al preventivo/);
  assert.match(step1Src, /setArtworkSelected/);
  // Step4: la grafica entra nel totale SOLO se richiesta e accettata, e
  // resta separata dal motore distribuzione (calculateQuotePricing).
  assert.match(step4Src, /computeGraphicEstimate\(\{ artworkRequired, artworkSelected \}\)/);
  assert.doesNotMatch(step4Src, /calculateQuotePricing\(\{[^}]*graphic/i);
  assert.match(step4Src, /artwork_required/);
  assert.match(step4Src, /artwork_selected/);
  assert.match(step4Src, /artwork_price/);
  assert.match(step4Src, /printing_selected/);
  assert.match(step4Src, /printing_price/);
});

test("contatti servizio grafico da config reale, nessun contatto inventato", () => {
  assert.equal(SUPPORT_EMAIL, "info@volantinipro.it");
  assert.equal(SUPPORT_WHATSAPP, null);
  assert.equal(HAS_SUPPORT_WHATSAPP, false);
  assert.equal(buildGraphicWhatsAppUrl({ format: "A5", quantity: 10000 }), null);
  assert.match(buildGraphicMailtoUrl({ format: "A5", quantity: 10000 }), /^mailto:info@volantinipro\.it\?subject=/);
  assert.match(buildGraphicRequestText({ format: "a5", quantity: 10000, printEnabled: true }), /Formato: A5[\s\S]*Quantità: 10\.000[\s\S]*Stampa: Sì/);
  assert.doesNotMatch(step1Src, /wa\.me\/\d/);
});
