// Citazione unica della fonte famiglie (report fonte dati Milano, 2026-11-13):
// ISTAT al 31/12/2024, data dello snapshot = data di calcolo, nessun claim assoluto.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ISTAT_HOUSEHOLDS_COMPACT,
  ISTAT_HOUSEHOLDS_SHORT,
  PDF_HOUSEHOLDS_SOURCE_NOTE,
  snapshotCalculationLabel,
} from "../src/lib/istatCitation.js";
import { ISTAT_SOURCE, MILANO_NIL_SOURCE_NOTE } from "../src/lib/seo/cityPagesData.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("citazioni brevi: fonte ISTAT con data di riferimento", () => {
  assert.equal(ISTAT_HOUSEHOLDS_SHORT, "Fonte: ISTAT, famiglie al 31/12/2024");
  assert.equal(ISTAT_HOUSEHOLDS_COMPACT, "ISTAT, famiglie al 31/12/2024");
  assert.equal(snapshotCalculationLabel("22/10/2026"), "Calcolo del 22/10/2026 su dati ISTAT al 31/12/2024");
  assert.equal(snapshotCalculationLabel(null), null);
});

test("PDF e SEO citano lo stesso bilancio demografico 2024", () => {
  assert.match(PDF_HOUSEHOLDS_SOURCE_NOTE, /ISTAT, Bilancio demografico e popolazione residente al 31 dicembre 2024/);
  assert.match(PDF_HOUSEHOLDS_SOURCE_NOTE, /famiglie \+ 10% di margine operativo/);
  assert.match(ISTAT_SOURCE, /^ISTAT, Bilancio demografico e popolazione residente al 31 dicembre 2024/);
  assert.match(MILANO_NIL_SOURCE_NOTE, /proporzionale alla superficie/);
});

test("nessuna data snapshot presentata come aggiornamento ISTAT, nessun claim assoluto", () => {
  const files = [
    "src/components/home/HomeQuoteCalculator.jsx",
    "src/components/home/HomepageTerritoryMap.jsx",
    "src/pages/public/QuickQuotePage.jsx",
    "src/pages/public/SeoLandingPages.jsx",
    "src/lib/pdf/printQuotePdf.js",
    "src/lib/istatCitation.js",
    "src/lib/seo/cityPagesData.js",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /ISTAT aggiornati al/i, f);
    assert.doesNotMatch(src, /ISTAT esatt|certificat/i, f);
  }
});
