// PDF preventivo (2026-11-23): "Popolazione stimata 0" nel PDF multi-PV.
// Regola: se il dato c'e' si stampa quello vero, se manca la riga non si stampa.
// Nessun "0", "—" o "dato non disponibile" presentato come dato.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateQuotePdfBytes, isPrintableKvValue } from "../src/lib/pdf/generateQuotePdf.js";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pdfStrings = bytes => [...new TextDecoder("windows-1252").decode(bytes).matchAll(/\((.*?)\)\s*Tj/g)].map(m => m[1]);
const valueAfter = (strs, label) => { const i = strs.indexOf(label); return i < 0 ? undefined : strs[i + 1]; };

test("i segnaposto non sono valori stampabili", () => {
  for (const v of [null, undefined, "", "-", "—", "–", "n/d", "Dato non disponibile", "dato non disponibile", " - "]) {
    assert.equal(isPrintableKvValue(v), false, String(v));
  }
  for (const v of ["154.770", "27,9 km²", "6", "Milano"]) assert.equal(isPrintableKvValue(v), true, v);
});

test("PDF senza popolazione reale: nessuna riga Popolazione, nessun segnaposto", () => {
  const bytes = generateQuotePdfBytes({
    service: "Door to Door", generatedAt: "2026-11-23T12:00:00Z", campaign: { quantity: 20000 },
    outputs: { estimatedFamilies: 154770, estimatedPopulation: null, recommendedFlyers: null, insertedFlyers: 20000 },
    area: { mainArea: "Milano + Segrate", coveredAreaKm2: 27.9 },
    adminInfo: [
      { label: "Famiglie stimate", value: "154.770" },
      { label: "Superficie analizzata", value: "27,9 km²" },
      { label: "Densita media", value: "—" },
      { label: "Zone NIL nel raggio", value: "dato non disponibile" },
    ],
    pricing: { lines: [{ label: "Distribuzione", quantity: 20000, total: 789.33 }], total: 789.33 },
  });
  const strs = pdfStrings(bytes);
  assert.equal(strs.includes("Popolazione stimata"), false);
  assert.equal(strs.includes("Densita media"), false);
  assert.equal(strs.includes("Zone NIL nel raggio"), false);
  assert.equal(strs.includes("Volantini consigliati per copertura stimata"), false);
  assert.equal(valueAfter(strs, "Superficie analizzata"), "27,9 km²".replace("²", "\xb2"));
  assert.ok(strs.filter(s => s === "Famiglie stimate").length >= 1);
});

test("PDF con popolazione reale: la riga c'e' con il valore vero", () => {
  const bytes = generateQuotePdfBytes({
    service: "Door to Door", generatedAt: "2026-11-23T12:00:00Z", campaign: { quantity: 10000 },
    outputs: { estimatedFamilies: 7042, estimatedPopulation: 15321, recommendedFlyers: 7746, insertedFlyers: 10000 },
    area: { mainArea: "Milano" },
    adminInfo: [{ label: "Popolazione stimata", value: "15.321" }],
    pricing: { lines: [{ label: "Distribuzione", quantity: 10000, total: 350 }], total: 350 },
  });
  const strs = pdfStrings(bytes);
  assert.equal(valueAfter(strs, "Popolazione stimata"), "15.321");
});

test("Step 4: popolazione, famiglie e consigliati vanno al PDF solo se reali", () => {
  const s4 = read("src/pages/public/configurator/Step4.jsx");
  assert.match(s4, /const populationForPdf = Number\(kpisPopulation\) > 0 \? Number\(kpisPopulation\) : null;/);
  const admin = s4.slice(s4.indexOf("serviceSummaryConfig.admin = [{"), s4.indexOf("serviceSummaryConfig.sources = d2dSummarySources;"));
  assert.match(admin, /v: populationForPdf != null \? formatNumber\(populationForPdf\) : null,/);
  assert.doesNotMatch(admin, /dato non disponibile|"—"/);
  assert.match(s4, /estimatedPopulation: svcType === "d2d" \? populationForPdf : null,/);
  assert.match(s4, /recommendedFlyers: svcType === "d2d" && Number\(requiredQty\) > 0 \? requiredQty : null,/);
});

test("PDF Quick Quote: niente 0 e niente 'Parziale' senza dato", () => {
  const p = read("src/lib/pdf/printQuotePdf.js");
  assert.match(p, /kv\("Popolazione stimata", Number\(outputs\.estimatedPopulation\) > 0 \?/);
  assert.match(p, /kv\("Famiglie stimate", Number\(outputs\.estimatedFamilies\) > 0 \?/);
  assert.match(p, /outputs\.coverageStatus === "partial" \? "Parziale" : null/);
});

test("quote in tabella: positive sotto l'1% scritte '<1%', mai '0%'", async () => {
  const { formatShareIT } = await import("../src/lib/pdf/generateQuotePdf.js");
  assert.equal(formatShareIT(0.05), "<1%");
  assert.equal(formatShareIT(0.39), "<1%");
  assert.equal(formatShareIT(0), "0%");
  assert.equal(formatShareIT(26.3), "26%");
  assert.equal(formatShareIT(null), null);
  const s4 = read("src/pages/public/configurator/Step4.jsx");
  assert.match(s4, /contributionPct: pv\.quantity > 0 \? c\.quantity \/ pv\.quantity \* 100 : null,/);
});
