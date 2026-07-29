import assert from "node:assert/strict";
import { buildStep2TruthModel } from "../src/lib/step2/buildStep2TruthModel.js";
import { buildStep2ViewModel } from "../src/lib/step2/buildStep2ViewModel.js";

const common = {
  areaMode: "radius",
  cityName: "Varedo",
  radiusKm: 3,
  radiusCenterSource: "operational_point",
  selectedSearchPoint: { label: "Varedo, Piazzale Stazione", lat: 45.5955439, lng: 9.1534112, type: "operational_point" },
  selectedComuniCount: 1,
  selectedMunicipalities: [{ name: "Varedo" }],
  hasConfirmedZone: true,
  hasValidGeometry: true,
  isCalculationComplete: true,
  hasCalculationError: false,
  hasConfirmedCoverageMode: true,
  hasConfirmedRadius: true,
  coverageDecision: "keepCurrent",
  step2ZonesReady: true,
  allocationStatus: "success",
};

function truth(serviceKey, kpis, recommended = 180) {
  return buildStep2TruthModel({
    service: { key: serviceKey },
    serviceData: { kpis },
    insertedQuantity: 10000,
    currentQuantity: 10000,
    baseRequirement: recommended,
    recommendedRequirement: recommended,
    allocation: [{ id: "x", requiredQuantity: recommended, assignedQuantity: recommended }],
    availability: { territorialData: true, coverage: true },
    calculationStatus: "ready",
  });
}

const h2hTruth = truth("h2h", { poi: 90, area: 28.3 });
const h2h = buildStep2ViewModel({ ...common, truthModel: h2hTruth });
assert.equal(h2h.primaryFamiliesValue, 90);
assert.equal(h2h.primaryCoverageValue, h2hTruth.coverage.operationalPct, "coverage deve provenire solo dal Truth Model");
assert.equal(h2h.recommendedFlyersValue, h2hTruth.quantity.recommendedRequirement);
assert.equal(h2h.missingFlyersValue, h2hTruth.quantity.shortage);
assert.equal(h2h.surplusFlyersValue, h2hTruth.quantity.surplus);
assert.match(h2h.primaryAreaLabel, /Varedo, Piazzale Stazione/);
assert.equal(h2h.ctaDisabled, false);
assert.equal(h2h.ctaLabel, "Continua allo Step 3");

const businessTruth = truth("b2b", { businesses: 28, area: 28.3 }, 84);
const business = buildStep2ViewModel({ ...common, truthModel: businessTruth });
assert.equal(business.primaryFamiliesValue, 28);
assert.equal(business.ctaDisabled, false);

const unavailableTruth = buildStep2TruthModel({
  service: { key: "d2d" },
  serviceData: { available: false, kpis: { families: null, area: null } },
  insertedQuantity: 10000,
  currentQuantity: 10000,
  recommendedRequirement: null,
  availability: { territorialData: false, coverage: false },
  calculationStatus: "unavailable",
  unavailableReason: "Dati territoriali mancanti",
});
const unavailable = buildStep2ViewModel({ ...common, areaMode: "full_municipality", truthModel: unavailableTruth, hasCalculationError: false, allocationStatus: "pending" });
assert.equal(unavailable.primaryFamiliesValue, null);
assert.equal(unavailable.recommendedFlyersValue, null);
assert.equal(unavailable.missingFlyersValue, null);
assert.equal(unavailable.surplusFlyersValue, null);
assert.equal(unavailable.hasUsableCoverageData, false);
assert.equal(unavailable.isCoverageConfigurationValid, false);
assert.equal(unavailable.coverageStatusReason, "unavailable");

console.log("PASS Step2 view model: presentazione esclusiva del Truth Model e CTA Step 3");
