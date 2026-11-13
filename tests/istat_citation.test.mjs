// Citazione unica e dato unico per Milano intera (report fonte dati Milano,
// 2026-11-13): ISTAT al 31/12/2024, 741.887 famiglie, 816.076 volantini.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ISTAT_HOUSEHOLDS_SHORT,
  PDF_HOUSEHOLDS_SOURCE_NOTE,
  snapshotCalculationLabel,
} from "../src/lib/istatCitation.js";
import {
  MILANO_ISTAT_HOUSEHOLDS,
  MILANO_ISTAT_POPULATION,
  MILANO_ISTAT_RECOMMENDED_FLYERS,
} from "../src/lib/istat/milanoIstatTotals.js";
import { ISTAT_SOURCE, cityFacts } from "../src/lib/seo/cityPagesData.js";
import { validateMilanoSnapshot } from "../src/lib/quote/milanoSnapshot.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("citazione breve unica con data di riferimento", () => {
  assert.equal(ISTAT_HOUSEHOLDS_SHORT, "Fonte: ISTAT, famiglie al 31/12/2024");
  assert.equal(snapshotCalculationLabel("23/10/2026"), "Calcolo del 23/10/2026 su dati ISTAT al 31/12/2024");
  assert.equal(snapshotCalculationLabel(null), null);
  assert.ok(PDF_HOUSEHOLDS_SOURCE_NOTE.startsWith(ISTAT_HOUSEHOLDS_SHORT));
  assert.match(PDF_HOUSEHOLDS_SOURCE_NOTE, /famiglie \+ 10% di margine operativo/);
  assert.match(ISTAT_SOURCE, /^ISTAT, Bilancio demografico e popolazione residente al 31 dicembre 2024/);
});

test("Milano intera: un solo numero, SEO = calcolatore = Preventivo Rapido", () => {
  assert.equal(MILANO_ISTAT_HOUSEHOLDS, 741887);
  assert.equal(MILANO_ISTAT_POPULATION, 1365698);
  assert.equal(MILANO_ISTAT_RECOMMENDED_FLYERS, 816076);
  const seo = cityFacts("milano");
  assert.equal(seo.households, 741887);
  assert.equal(seo.wholeCityFlyers, 816076);
  const snapshot = validateMilanoSnapshot(JSON.parse(read("src/lib/quote/milanoWholeCitySnapshot.json")));
  assert.equal(snapshot.analysis.families, seo.households);
  assert.equal(snapshot.analysis.recommended, seo.wholeCityFlyers);
  assert.equal(snapshot.analysis.population, 1365698);
});

test("nessuna data snapshot come aggiornamento ISTAT, nessun claim assoluto, nessuna nota sulla differenza", () => {
  const files = [
    "src/components/home/HomeQuoteCalculator.jsx",
    "src/components/home/HomepageTerritoryMap.jsx",
    "src/pages/public/QuickQuotePage.jsx",
    "src/pages/public/SeoLandingPages.jsx",
    "src/lib/pdf/printQuotePdf.js",
    "src/lib/istatCitation.js",
    "src/lib/seo/cityPagesData.js",
    "src/pages/public/configurator/Step4.jsx",
    "src/pages/public/configurator/step4/Step4TechnicalAnalysisPanel.jsx",
    "src/pages/customer/AdvancedCoverageReport.jsx",
    "src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /ISTAT aggiornati al/i, f);
    assert.doesNotMatch(src, /ISTAT esatt|certificat/i, f);
    assert.doesNotMatch(src, /differire leggermente|stimate per superficie/i, f);
    // Mai "Fonte: ISTAT" o "ISTAT 2024" senza la data di riferimento.
    assert.doesNotMatch(src, /["'>]Fonte:? ISTAT["'.<]|ISTAT 2024|src: "ISTAT"|Stima territoriale GIS\/NIL/, f);
  }
});
