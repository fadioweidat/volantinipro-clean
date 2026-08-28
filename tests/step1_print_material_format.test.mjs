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

test("Uso mano = REQUIRES_REVIEW, nessun prezzo (fornitore reale: solo 90g)", () => {
  const r = price({ quantity: 10000, grammage: "130", paperType: "uso_mano" });
  assert.equal(r.priceStatus, "REQUIRES_REVIEW");
  assert.equal(r.customerPrice, null);
  assert.ok(r.reviewReasons.some((x) => x.startsWith("paper:")));
  // anche uso mano + 90g (fuori matrice A5) resta REQUIRES_REVIEW
  assert.equal(price({ quantity: 10000, grammage: "90", paperType: "uso_mano" }).priceStatus, "REQUIRES_REVIEW");
});

// ---------------------------------------------------------------------------
// 7. Lati
// ---------------------------------------------------------------------------

test("lati: solo fronte/retro differenti confermato; solo fronte e f/r uguali = REQUIRES_REVIEW", () => {
  assert.equal(price({ quantity: 10000, grammage: "130", sides: "fronte_retro" }).priceStatus, "AUTO_CONFIRMED");
  for (const s of ["fronte", "fronte_retro_eq"]) {
    const r = price({ quantity: 10000, grammage: "130", sides: s });
    assert.equal(r.priceStatus, "REQUIRES_REVIEW", `sides ${s}`);
    assert.equal(r.customerPrice, null, `sides ${s} price`);
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

test("A6 = REQUIRES_REVIEW (nessun prezzo, vecchio listino rimosso); A4 = NOT_CONFIGURED", () => {
  assert.equal(PRINT_FORMAT_STATUS.A5, "CONFIGURED");
  assert.equal(PRINT_FORMAT_STATUS.A6, "REQUIRES_REVIEW");
  assert.equal(PRINT_FORMAT_STATUS.A4, "NOT_CONFIGURED");
  assert.equal(isPrintFormatConfigured("A5"), true);
  assert.equal(isPrintFormatConfigured("A6"), false);
  assert.equal(isPrintFormatConfigured("A4"), false);
  const a6 = price({ quantity: 10000, grammage: "130", printFormat: "A6" });
  assert.equal(a6.priceStatus, "REQUIRES_REVIEW");
  assert.equal(a6.customerPrice, null);
  const a4 = price({ quantity: 10000, grammage: "130", printFormat: "A4" });
  assert.equal(a4.priceStatus, "NOT_CONFIGURED");
  assert.equal(a4.customerPrice, null);
  // niente vecchi benchmark A6 nel motore
  assert.doesNotMatch(engineSrc, /A6:\s*\[/);
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
  seen.add(price({ quantity: 10000, grammage: "130", sides: "fronte" }).priceStatus); // REQUIRES_REVIEW
  seen.add(price({ quantity: 10000, grammage: "130", printFormat: "A4" }).priceStatus); // NOT_CONFIGURED
  assert.deepEqual([...seen].sort(), ["AUTO_CONFIRMED", "INTERPOLATED", "NOT_CONFIGURED", "REQUIRES_REVIEW"]);
});

// ---------------------------------------------------------------------------
// computePrintEstimate + registry
// ---------------------------------------------------------------------------

test("computePrintEstimate: 0 se non attiva / config non coperta; prezzo reale coi default", () => {
  assert.equal(computePrintEstimate({ quantity: 10000, enabled: false }), 0);
  assert.equal(computePrintEstimate({ quantity: 10000 }), 187.12); // default A5/130/opaca/f-r/colori/nessuna
  assert.equal(computePrintEstimate({ quantity: 10000, grammage: "250" }), 296.4);
  assert.equal(computePrintEstimate({ quantity: 10000, sides: "fronte" }), 0);      // REQUIRES_REVIEW -> 0
  assert.equal(computePrintEstimate({ quantity: 10000, printFormat: "A6" }), 0);
});

test("extraServicesRegistry 'printing' usa computePrintEstimate (matrice reale)", () => {
  const reg = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "130", sides: "fronte_retro", color: "colori", paperType: "patinata_opaca", folding: "nessuna" } });
  assert.equal(buildExtraServicesById(reg).printing.price, 187.12);
  const reg250 = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "250", sides: "fronte_retro", color: "colori", paperType: "patinata_opaca", folding: "nessuna" } });
  assert.equal(buildExtraServicesById(reg250).printing.price, 296.4);
  const regReview = buildExtraServicesRegistry({ flyerQty: 10000, printConfig: { format: "A5", grammage: "130", sides: "fronte", color: "colori", paperType: "patinata_opaca", folding: "nessuna" } });
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

test("grafica: nessuna regressione — artwork flow separato dal prezzo stampa", () => {
  // il motore non ha parametri artwork/graphic
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*artwork/i);
  assert.doesNotMatch(step1Src, /calculatePrintPrice\(\{[^}]*graphic/i);
  assert.match(step1Src, /File per la stampa/);
  assert.match(step1Src, /Servizio grafico VolantiniPro/);
  assert.match(step1Src, /graphicPriceStatus = artworkNeedsDesign \? "REQUIRES_QUOTE" : "NOT_REQUIRED"/);
  assert.match(step4Src, /graphicPrice: null/);
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
