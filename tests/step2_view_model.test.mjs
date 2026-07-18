import assert from "node:assert/strict";
import { buildStep2ViewModel } from "../src/lib/step2/buildStep2ViewModel.js";

const common = {
  areaMode: "radius",
  cityName: "Varedo",
  radiusKm: 3,
  radiusCenterSource: "operational_point",
  selectedSearchPoint: {
    label: "Varedo, Piazzale Stazione",
    lat: 45.5955439,
    lng: 9.1534112,
    type: "operational_point",
  },
  requiredFlyers: 180,
  flyerQuantityFromStep1: 10000,
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
};

const h2h = buildStep2ViewModel({
  ...common,
  isResidentialStep2: false,
  isMovementStep2: true,
  serviceKpis: { poi: 90, area: 28.3, coverage: 100, recommendedFlyers: 180 },
});

assert.equal(h2h.primaryFamiliesValue, 90, "H2H deve usare i POI come KPI primario");
assert.match(h2h.primaryAreaLabel, /Varedo, Piazzale Stazione/, "il punto operativo completo deve restare nella label");
assert.equal(h2h.isGeographicCoverageValid, true, "i POI reali devono rendere valida la copertura H2H");
assert.equal(h2h.ctaDisabled, false, "la CTA H2H non deve restare bloccata con POI e geometria validi");
assert.equal(h2h.ctaLabel, "Continua allo Step 3");

const b2b = buildStep2ViewModel({
  ...common,
  isResidentialStep2: false,
  isMovementStep2: false,
  requiredFlyers: 84,
  serviceKpis: { businesses: 28, area: 28.3, coverage: 100, recommendedFlyers: 84 },
});

assert.equal(b2b.primaryFamiliesValue, 28, "Business deve usare le aziende come KPI primario");
assert.equal(b2b.ctaDisabled, false, "la CTA Business non deve restare bloccata con aziende e geometria validi");

const unavailableD2d = buildStep2ViewModel({
  ...common,
  areaMode: "full_municipality",
  radiusCenterSource: "municipality",
  isResidentialStep2: true,
  isMovementStep2: false,
  requiredFlyers: 0,
  serviceKpis: { families: 0, area: 0, coverage: 0, recommendedFlyers: 0 },
  hasCalculationError: true,
  allocationStatus: "pending",
});

assert.equal(unavailableD2d.hasUsableCoverageData, false, "zero senza fonte territoriale non deve essere un risultato utilizzabile");
assert.equal(unavailableD2d.isCoverageConfigurationValid, false, "dati territoriali mancanti devono bloccare la configurazione");
assert.equal(unavailableD2d.ctaLabel, "Impossibile completare il calcolo");

console.log("PASS Step2 view model: KPI H2H/Business, label punto operativo e CTA");
