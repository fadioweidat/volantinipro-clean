// Regola Fadi 2026-11-22 per tutto il sito: nessun numero fisso o inventato
// presentato come dato. Questo test blocca il ritorno delle voci tolte.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const step4 = read("src/pages/public/configurator/Step4.jsx");
const panel4 = read("src/pages/public/configurator/step4/Step4TechnicalAnalysisPanel.jsx");
const step2 = read("src/pages/public/configurator/Step2.jsx");
const mapPanel = read("src/pages/public/configurator/step2/Step2MapPanel.jsx");
const reportSection = read("src/pages/public/configurator/step2/Step2TerritorialReportSection.jsx");
const report = read("src/pages/TerritorialReport.jsx");
const serviceMeta = read("src/lib/services/serviceMeta.js");
const zoneGeo = read("src/lib/step2/zoneGeoHelpers.js");
const quotePdf = read("src/lib/pdf/generateQuotePdf.js");

test("1. Step 4 e PDF: nessun punteggio /100 (Qualita area, Potenziale, Efficienza, Affidabilita)", () => {
  assert.match(step4, /const d2dScores = \[\];/);
  assert.equal((step4.match(/scores: \[\],/g) || []).length, 2, "H2H e Business senza punteggi");
  for (const label of ["Qualità area", "Potenziale copertura", "Efficienza campagna", "Affidabilità stima"]) {
    assert.doesNotMatch(step4, new RegExp(`l: "${label}"`), label);
  }
  assert.doesNotMatch(quotePdf, /section\(w, "4\. Indicatori servizio"/);
  assert.doesNotMatch(quotePdf, /\$\{s\.value\}\/100/);
});

test("2. Step 2 mappa: niente 'NN/100', famiglie ISTAT reali", () => {
  assert.doesNotMatch(mapPanel, /r\.strength\}\/100/);
  assert.match(mapPanel, /formatIntegerIT\(r\.families\)\} fam\./);
});

test("3. Hand to Hand: niente 'Competitor rilevati' (x0,28) ne' 'Densita passaggio /100'", () => {
  assert.doesNotMatch(serviceMeta, /nearbyBiz \* \.28/);
  assert.doesNotMatch(serviceMeta, /commDens \+ "\/100"/);
});

test("4/9. Report territoriale: niente score /100 ne' tabelle su valori inventati", () => {
  assert.doesNotMatch(reportSection, /label: "Score (D2D|H2H)"/);
  assert.match(reportSection, /score: null,\n\s*recommendation,/);
  assert.doesNotMatch(report, />Poli con maggiore potenziale/);
  assert.doesNotMatch(report, />Zone con maggiore concentrazione B2B/);
  assert.doesNotMatch(report, /\{s\.pct\} \/ 100/);
  assert.match(report, /label: "Raccomandazioni"/);
});

test("5. niente 'Forza hotspot N/100' (era un conteggio)", () => {
  assert.doesNotMatch(step4, /l: "Forza hotspot"/);
});

test("6. nessun profilo uomini/donne 49/51 di default", () => {
  assert.doesNotMatch(zoneGeo, /genderM: 49/);
  assert.doesNotMatch(step2, /genderM: 49|z\.genderM \|\| 49/);
  assert.doesNotMatch(step4, /z\.genderM \|\| 49/);
  assert.doesNotMatch(serviceMeta, /n\.genderM \+ "%/);
});

test("7. riquadri GPS e foto marcati come esempio illustrativo", () => {
  assert.match(step4, /tracking_gps: "Esempio illustrativo · Tracking GPS"/);
  assert.match(step4, /Esempio illustrativo · non sono foto reali/);
  assert.doesNotMatch(step4, /Demo - \{time\}/);
});

test("8. fonte POI: OpenStreetMap, non Google Places (fornitori a pagamento spenti)", () => {
  assert.doesNotMatch(serviceMeta, /src: "Google Places"/);
  assert.doesNotMatch(serviceMeta, /"Google Places", "Google Places"/);
  assert.doesNotMatch(step4, /src: "Google Places"/);
});

test("10. 'Quantita consigliata' solo con fabbisogno calcolato", () => {
  assert.match(step4, /v: Number\(requiredQty\) > 0 \? formatNumber\(requiredQty\) : null,/);
});

test("11. comuni dei preventivi vecchi: niente copertura 100% ne' ripartizione inventata", () => {
  assert.doesNotMatch(step4, /kpis\.coverage \?\? \(svcType === "d2d" \? 100 : null\)/);
  assert.doesNotMatch(step4, /contributionPct: Math\.round\(100 \/ muns\.length\)/);
});

test("12. famiglie ricavate dal fabbisogno etichettate come stima", () => {
  assert.match(step2, /familiesEstimated: Boolean\(isOutOfScale\)/);
  assert.match(step2, /familiesEstimated: isResidentialStep2 \? Boolean\(step2FamiliesCalc\.familiesEstimated\) : false,/);
  assert.match(step4, /FAMILIES_ESTIMATE_SOURCE_LABEL = "Stima dal fabbisogno operativo/);
  assert.match(panel4, /sub: familiesSourceLabel,/);
});
