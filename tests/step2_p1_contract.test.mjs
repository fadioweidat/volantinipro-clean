import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = fs.readFileSync(path.join(root, "volantinipro-final.jsx"), "utf8");
const truthSource = fs.readFileSync(path.join(root, "src/lib/step2/buildStep2TruthModel.js"), "utf8");
const viewSource = fs.readFileSync(path.join(root, "src/lib/step2/buildStep2ViewModel.js"), "utf8");
const reportSource = fs.readFileSync(path.join(root, "src/pages/TerritorialReport.jsx"), "utf8");

assert.ok(app.indexOf("const step2TruthModel = buildStep2TruthModel") < app.indexOf("const step2ViewModel = buildStep2ViewModel"), "Truth Model deve essere costruito prima del View Model");
assert.match(app, /buildStep2ToStep3Payload\(step2TruthModel\)/);
assert.match(app, /\[STEP2_TO_STEP3_PAYLOAD\]/);
assert.doesNotMatch(app, /STEP2_TO_STEP4_PAYLOAD/);

assert.equal((truthSource.match(/recommended - current/g) || []).length, 1, "shortage deve essere calcolata una sola volta");
assert.equal((truthSource.match(/current - recommended/g) || []).length, 1, "surplus deve essere calcolato una sola volta");
assert.doesNotMatch(viewSource, /recommendedFlyersValue\s*-|insertedFlyersValue\s*-/);
assert.match(viewSource, /truthModel\.coverage\?\.operationalPct/);
assert.match(viewSource, /truthModel\.quantity\?\.shortage/);
assert.match(viewSource, /truthModel\.quantity\?\.surplus/);

assert.doesNotMatch(app, /liveServicePointCount\s*\*\s*2/);
assert.doesNotMatch(app, /liveServicePointCount\s*\*\s*3/);
assert.match(app, /businessMaterialPlan\?\.materialsRequired \?\? null/);

const truthConstruction = app.slice(app.indexOf("const step2TruthModel = buildStep2TruthModel"), app.indexOf("const step2ViewModel = buildStep2ViewModel"));
assert.doesNotMatch(truthConstruction, /ZONE_DATA|SERVICE_META/);
assert.doesNotMatch(app.slice(app.indexOf("function handleNext"), app.indexOf("const coverageStatus =", app.indexOf("function handleNext"))), /Math\.max\(0, requiredFlyers - finalFlyerQuantity\)|Math\.max\(0, finalFlyerQuantity - requiredFlyers\)/);

assert.match(reportSource, /requires truthModel/);
assert.match(reportSource, /zoneRows: truthModel\.allocation\.rows/);
assert.match(reportSource, /"demografia"[^\n]+services: \["d2d"\]/);
assert.match(reportSource, /"mobilita"[^\n]+services: \["h2h"\]/);
assert.match(reportSource, /"imprese"[^\n]+services: \["b2b"\]/);
assert.match(viewSource, /Continua allo Step 3/);

console.log("PASS Step2 P1 contract: ordine pipeline, singola fonte, payload, servizi e isolamento demo");
