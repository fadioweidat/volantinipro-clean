import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessGeocodeMatchesZone, parseBusinessMapAreas } from "../src/lib/business/businessMapAreas.js";
import { canContinueHandToHand } from "../src/lib/step2/operationalContinueGate.js";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Business multi-comune: Milano, Cormano e Bresso remain three distinct map choices", () => {
  const result = parseBusinessMapAreas("Milano, Cormano e Bresso");
  assert.deepEqual(result.map(city => city.name), ["Milano", "Cormano", "Bresso"]);
  assert.ok(result.every(city => Number.isFinite(city.lat) && Number.isFinite(city.lng)));
  assert.ok(!result.some(city => city.name === "Novate Milanese"));
  assert.deepEqual(parseBusinessMapAreas("Via Roma 12, Milano"), [], "street address is not a multi-comune selection");
  assert.deepEqual(parseBusinessMapAreas("Rho e Pero").map(city => city.name), ["Rho", "Pero"], "unknown communes remain explicit choices, not a fake geocoder result");
});

test("Business single comune: an unrelated geocoder result is rejected", () => {
  assert.equal(businessGeocodeMatchesZone("Milano", "Novate Milanese"), false);
  assert.equal(businessGeocodeMatchesZone("Milano, Cormano e Bresso", "Novate Milanese"), false);
  assert.equal(businessGeocodeMatchesZone("Via Roma 12, Bresso", "Bresso"), true);
  assert.equal(businessGeocodeMatchesZone("Bresso", "Bresso"), true);
  const step1 = read("src/pages/public/configurator/Step1.jsx");
  const step4 = read("src/pages/public/configurator/step4/Step4BusinessRequest.jsx");
  assert.match(step1, /parseBusinessMapAreas\(requestedZone\)/);
  assert.match(step1, /businessGeocodeMatchesZone\(requestedZone/);
  assert.match(step4, /mapAreas\.map\(area => <button/);
  assert.match(step1, /BUSINESS_MACRO_TARGETS\.filter\(macro => macro\.values\.some/);
});

test("Hand to Hand: five assigned station POIs in a valid 3km radius can reach Step 3", () => {
  const scenario = {
    hasTerritory: true,
    zoneReady: true,
    pointsFound: 54,
    pointsSelected: 5,
    step1Points: 5,
    radiusMode: true,
    radiusConfirmed: true,
    radiusKm: 3,
    radiusCenter: { lat: 45.486, lng: 9.204 },
    loading: false,
  };
  assert.equal(canContinueHandToHand(scenario), true);
  assert.equal(canContinueHandToHand({ ...scenario, pointsSelected: 0 }), false);
  assert.equal(canContinueHandToHand({ ...scenario, loading: true }), false);
  assert.equal(canContinueHandToHand({ ...scenario, radiusConfirmed: false }), false);
  assert.equal(canContinueHandToHand({ ...scenario, radiusCenter: null }), false);
  assert.equal(canContinueHandToHand({ ...scenario, hasTerritory: false }), false);
  assert.equal(canContinueHandToHand({ ...scenario, pointsFound: 0, pointsSelected: 0, step1Points: 1 }), true, "Step 1 point is a legitimate fallback when no POI exists");
});

test("Presentation keeps preferred Step 1 date and discloses distribution-only metrics", () => {
  const step4 = read("src/pages/public/configurator/Step4.jsx");
  const plan = read("src/pages/public/configurator/step4/Step4PlanningPanel.jsx");
  const pricing = read("src/pages/public/configurator/step4/Step4PricingSummaryPanel.jsx");
  assert.match(step4, /preferita, da confermare/);
  assert.match(plan, /preferredPeriodLabel/);
  assert.match(pricing, /stampa esclusa/);
  assert.match(pricing, /non deduplicata/);
});

test("Business POIs never inherit the chosen municipality label without spatial evidence", () => {
  const step2 = read("src/pages/public/configurator/Step2.jsx");
  assert.match(step2, /if \(isBusinessStep2\) return "Fuori dal comune selezionato"/);
  assert.match(step2, /return isBusinessStep2 \? null : singleComuneLabel/);
  const panel = read("src/pages/public/configurator/step2/Step2PoiAssignmentPanel.jsx");
  assert.match(panel, /poiLoading \? "Caricamento luoghi…"/);
});
