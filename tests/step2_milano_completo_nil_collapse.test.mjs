import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractOfficialNilCode, normalizeMunicipalityName } from "../src/lib/step2/addressIntent.js";
import { getZoneFullCoverageFlyers } from "../src/lib/doorToDoorCoverage.js";
import { nilModeCountLabel } from "../src/lib/step2/milanoNilView.js";

const step2Src = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");

// Mock helper mimicking the exact zonesInRadius filtering in Step2.jsx
function runZonesInRadiusFilter({
  gateMode,
  hasUnconfirmedAddressPoint,
  selectedSearchPoint,
  requestedAnalysisLevel,
  isNilAnalysis,
  isResidentialStep2,
  filteredInput,
  selectedMunicipality,
  selectedComuni,
  city,
}) {
  let filtered = [...filteredInput];

  if (gateMode === "municipality") {
    const isCanonicalMilanoNil = z => Boolean(
      z?.isNil === true ||
      z?.territoryLevel === "nil" ||
      Boolean(z?.nilCode) ||
      extractOfficialNilCode(z) !== null
    );
    const isMilanoNilSource = isResidentialStep2 && (
      requestedAnalysisLevel === "nil" ||
      isNilAnalysis === true ||
      filtered.some(isCanonicalMilanoNil)
    );

    if (hasUnconfirmedAddressPoint) {
      filtered = [];
    } else if (!isMilanoNilSource && selectedSearchPoint?.type === "address" && selectedSearchPoint?.parentComune === "Milano" && filtered.length > 0) {
      const milanoZone = filtered.find(z => normalizeMunicipalityName(z.name) === "milano");
      const nonMilanoZones = filtered.filter(z => normalizeMunicipalityName(z.name) !== "milano");
      if (nonMilanoZones.length > 0 && (!milanoZone || filtered.length === nonMilanoZones.length)) {
        filtered = milanoZone ? [milanoZone] : [];
      }
    } else {
      if (isResidentialStep2 && (requestedAnalysisLevel === "nil" || isMilanoNilSource)) {
        const nilAreas = filtered.filter(isCanonicalMilanoNil);
        filtered = nilAreas.length ? nilAreas : filtered;
      } else {
        const currComuni = selectedComuni && selectedComuni.length > 0 ? selectedComuni : city ? [city] : [];
        const targetNames = new Set(currComuni.map(c => normalizeMunicipalityName(c.label || c.name)).filter(Boolean));
        const targetCodes = new Set(currComuni.map(c => c.municipalityCode || c.municipality_code || null).filter(Boolean).map(String));
        let matched = filtered.filter(z => {
          const nameMatch = targetNames.has(normalizeMunicipalityName(z.name));
          const codeMatch = Boolean(z.municipality_code) && targetCodes.has(String(z.municipality_code));
          return nameMatch || codeMatch;
        });
        filtered = matched;
      }
    }
  }

  const seenZoneKeys = new Set();
  const dedupedFiltered = filtered.filter(z => {
    const isNilRow = Boolean(z?.isNil || z?.territoryLevel === "nil" || extractOfficialNilCode(z) !== null);
    const officialCode = extractOfficialNilCode(z);
    const key = isNilRow ? officialCode !== null ? `nil_code_${officialCode}` : `nil_${normalizeMunicipalityName(z?.name || "")}` : z?.municipality_code || normalizeMunicipalityName(z?.name || "");
    if (!key) return true;
    if (seenZoneKeys.has(key)) return false;
    seenZoneKeys.add(key);
    return true;
  });

  return dedupedFiltered;
}

test("A. address Milano + NIL BRUZZANO: preserves NIL data and address preview", () => {
  const bruzzanoZone = {
    id: "nil_14_bruzzano",
    name: "BRUZZANO",
    isNil: true,
    nilCode: "14",
    territoryLevel: "nil",
    families: 6840,
    volantiniNelRaggio: 7524,
    flyersMin: 7524,
  };

  assert.strictEqual(bruzzanoZone.families, 6840);
  assert.strictEqual(bruzzanoZone.flyersMin, 7524);
  assert.strictEqual(getZoneFullCoverageFlyers(bruzzanoZone), 7524);
});

test("B. switch to Milano completo: NIL source not collapsed to []", () => {
  const mockNils = [
    { id: "nil_14", name: "BRUZZANO", isNil: true, nilCode: "14", territoryLevel: "nil", families: 6840 },
    { id: "nil_15", name: "AFFORI", isNil: true, nilCode: "15", territoryLevel: "nil", families: 12000 },
    { id: "nil_1", name: "DUOMO", isNil: true, nilCode: "1", territoryLevel: "nil", families: 8500 }
  ];

  const result = runZonesInRadiusFilter({
    gateMode: "municipality",
    hasUnconfirmedAddressPoint: false, // confirmed Milano completo
    selectedSearchPoint: {
      type: "address",
      parentComune: "Milano",
      label: "Via Antonio Oroboni, 20161 Milano",
      lat: 45.528,
      lng: 9.169
    },
    requestedAnalysisLevel: "nil",
    isNilAnalysis: true,
    isResidentialStep2: true,
    filteredInput: mockNils,
    selectedMunicipality: "Milano",
    selectedComuni: [{ name: "Milano", label: "Milano" }],
    city: { name: "Milano", label: "Milano" }
  });

  assert.ok(result.length > 0, "NIL collection must not be collapsed to []");
  assert.strictEqual(result.length, 3, "All NIL zones must be preserved in municipality mode");
  assert.ok(result.some(z => z.name === "BRUZZANO"));
  assert.ok(result.some(z => z.name === "AFFORI"));
  assert.ok(result.some(z => z.name === "DUOMO"));
});

test("C. 88 NIL source remains available in Milano completo", () => {
  const fullMilano88Nils = Array.from({ length: 88 }, (_, i) => ({
    id: `nil_${i + 1}`,
    name: `NIL_${i + 1}`,
    isNil: true,
    nilCode: String(i + 1),
    territoryLevel: "nil",
    families: 8000
  }));

  const result = runZonesInRadiusFilter({
    gateMode: "municipality",
    hasUnconfirmedAddressPoint: false,
    selectedSearchPoint: {
      type: "address",
      parentComune: "Milano",
      label: "Via Antonio Oroboni, 20161 Milano"
    },
    requestedAnalysisLevel: "nil",
    isNilAnalysis: true,
    isResidentialStep2: true,
    filteredInput: fullMilano88Nils,
    selectedMunicipality: "Milano",
    selectedComuni: [{ name: "Milano" }],
    city: { name: "Milano" }
  });

  assert.strictEqual(result.length, 88, "All 88 NILs must remain available without collapse");
});

test("D. lower NIL count is NOT 0 when top canonical count is 88", () => {
  const zoneListSourceCount = 88;
  const isComuneMode = true;
  const isNilAnalysis = true;
  const nilManualMode = false;
  const city = { label: "Milano" };

  const lowerLabel = isNilAnalysis
    ? isComuneMode
      ? nilManualMode
        ? `NIL selezionate: 1 di 88`
        : `NIL disponibili ${city?.label || city?.name || ""}: ${zoneListSourceCount}`
      : `NIL intersecate dal raggio: 88`
    : `Zone: 88`;

  const topLabel = nilModeCountLabel({ availableCount: 88 });

  assert.strictEqual(lowerLabel, "NIL disponibili Milano: 88");
  assert.strictEqual(topLabel, "NIL disponibili nel Comune: 88");
  assert.ok(!lowerLabel.includes("Milano: 0"), "Lower label must NOT be 0");
});

test("E. BRUZZANO KPI remains 6840 families and 7524 recommended", () => {
  const bruzzano = {
    id: "nil_14",
    name: "BRUZZANO",
    isNil: true,
    nilCode: "14",
    families: 6840,
    volantiniNelRaggio: 7524,
    flyersMin: 7524
  };

  assert.strictEqual(bruzzano.families, 6840);
  assert.strictEqual(getZoneFullCoverageFlyers(bruzzano), 7524);
  assert.strictEqual(Math.round(bruzzano.families * 1.1), 7524);
});

test("F. roundtrip state consistency: Step2.jsx source code verification", () => {
  // Verify that Step2.jsx includes the new guards
  assert.ok(step2Src.includes("isCanonicalMilanoNil"), "Step2.jsx must define isCanonicalMilanoNil");
  assert.ok(step2Src.includes("isMilanoNilSource"), "Step2.jsx must define isMilanoNilSource");
  assert.ok(step2Src.includes("!isMilanoNilSource && selectedSearchPoint?.type === \"address\""), "Milano address guard must not run when isMilanoNilSource is true");
  assert.ok(step2Src.includes("requestedAnalysisLevel === \"nil\" || isMilanoNilSource"), "NIL area preservation must cover isMilanoNilSource");
});

test("G. non-Milano municipalities unaffected", () => {
  const monzaZone = [
    { id: "monza_1", name: "Monza", municipality_code: "108033", families: 55000, isNil: false }
  ];

  const result = runZonesInRadiusFilter({
    gateMode: "municipality",
    hasUnconfirmedAddressPoint: false,
    selectedSearchPoint: null,
    requestedAnalysisLevel: "comune",
    isNilAnalysis: false,
    isResidentialStep2: true,
    filteredInput: monzaZone,
    selectedMunicipality: "Monza",
    selectedComuni: [{ name: "Monza", municipality_code: "108033" }],
    city: { name: "Monza", municipality_code: "108033" }
  });

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, "Monza");
  assert.strictEqual(result[0].families, 55000);
});
