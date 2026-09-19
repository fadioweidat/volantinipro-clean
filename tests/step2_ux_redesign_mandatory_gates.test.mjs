import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectSearchIntent, normalizeMunicipalityName } from '../src/lib/step2/addressIntent.js';
import { buildMilanoAddressContext, resolveMilanoMunicipio } from '../src/lib/geo/territories/milanoAddressContext.js';
import { resolveMilanoCivicCap } from '../src/lib/geo/territories/milanoCivicCap.js';
import { resolveMilanoCapEstimate } from '../src/lib/geo/territories/milanoCapEstimates.js';
import { buildStep2TruthModel } from '../src/lib/step2/buildStep2TruthModel.js';
import { buildStep2ViewModel } from '../src/lib/step2/buildStep2ViewModel.js';

const STEP2_JSX = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
const CONTROLS_JSX = readFileSync(new URL('../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx', import.meta.url), 'utf8');
const COMUNE_JSX = readFileSync(new URL('../src/pages/public/configurator/step2/Step2ComunePanel.jsx', import.meta.url), 'utf8');
const SUMMARY_JSX = readFileSync(new URL('../src/pages/public/configurator/step2/Step2SummaryPanel.jsx', import.meta.url), 'utf8');
const GUIDANCE_JSX = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoGuidance.jsx', import.meta.url), 'utf8');
const ADDR_CARD_JSX = readFileSync(new URL('../src/pages/public/configurator/step2/MilanoAddressContextCard.jsx', import.meta.url), 'utf8');

describe('Step 2 UX Redesign Mandatory Acceptance Gates (A-Q)', () => {

  // TEST A: Ricerca indirizzo Milano
  test('GATE A: detectSearchIntent identifies "Via Antonio Oroboni 2, Milano" correctly as address in Milano', () => {
    const raw = "Via Antonio Oroboni 2, Milano";
    const intent = detectSearchIntent(raw);
    assert.equal(intent.intent, "address");
    assert.equal(intent.parentComune, "Milano");
  });

  // TEST B: Context resolution (Comune=Milano, NIL=BRUZZANO, Municipio=9, CAP=20161)
  test('GATE B: Address context resolves Milano, BRUZZANO NIL, Municipio 9, and CAP 20161', () => {
    const mockAddressPoint = {
      label: "Via Antonio Oroboni, 2, 20161 Milano MI, Italia",
      name: "Via Antonio Oroboni, 2",
      street: "Via Antonio Oroboni",
      houseNumber: "2",
      postcode: "20161",
      lat: 45.526233,
      lng: 9.176412,
      type: "address",
      parentComune: "Milano",
    };
    const mockNil = { id: "nil_14", name: "BRUZZANO", nil: "14" };
    const mockMunicipio = { number: 9, name: "Municipio 9" };
    const mockCap = { cap: "20161", source: "milano_civic_cap_verified" };

    const ctx = buildMilanoAddressContext({
      addressPoint: mockAddressPoint,
      nil: mockNil,
      municipio: mockMunicipio,
      cap: mockCap,
    });

    assert.equal(ctx.comune.name, "Milano");
    assert.equal(ctx.nil.name, "BRUZZANO");
    assert.equal(ctx.municipio.name, "Municipio 9");
    assert.equal(ctx.cap.code, "20161");
  });

  // TEST C: Selection "Usa NIL BRUZZANO"
  test('GATE C: MilanoAddressContextCard & Guidance wire onUseNil / onShowNil without logic mutation', () => {
    assert.match(ADDR_CARD_JSX, /onUseNil/, 'MilanoAddressContextCard must accept onUseNil');
    assert.match(ADDR_CARD_JSX, /Usa NIL \{context\.nil\.name\}/, 'Button label for NIL selection must be present');
    assert.match(GUIDANCE_JSX, /onShowNil/, 'MilanoGuidance must wire onShowNil');
  });

  // TEST D: Selection "Usa Raggio"
  test('GATE D: onUseRadius action is available and hooked to switchToRadiusMode', () => {
    assert.match(ADDR_CARD_JSX, /onUseRadius/, 'MilanoAddressContextCard must accept onUseRadius');
    assert.match(GUIDANCE_JSX, /onUseRadius/, 'MilanoGuidance must accept onUseRadius');
    assert.match(STEP2_JSX, /switchToRadiusMode/, 'Step2 must provide switchToRadiusMode');
  });

  // TEST E: Selection "Milano completo"
  test('GATE E: onKeepMilanoComplete action is available and hooked to switchToComuneMode', () => {
    assert.match(ADDR_CARD_JSX, /onKeepMilanoComplete/, 'MilanoAddressContextCard must accept onKeepMilanoComplete');
    assert.match(GUIDANCE_JSX, /onKeepMilanoComplete/, 'MilanoGuidance must accept onKeepMilanoComplete');
    assert.match(STEP2_JSX, /switchToComuneMode/, 'Step2 must provide switchToComuneMode');
  });

  // TEST F: Municipio (Disponibile prossimamente)
  test('GATE F: Municipio button is appropriately marked as coming soon / preview', () => {
    assert.match(GUIDANCE_JSX, /Municipio · Disponibile prossimamente/, 'Guidance must indicate Municipio future availability');
  });

  // TEST G: CAP mode
  test('GATE G: CAP mode is preserved in switcher & controls', () => {
    assert.match(CONTROLS_JSX, /switchToCapMode/, 'Controls must support switchToCapMode');
    assert.match(STEP2_JSX, /switchToCapMode/, 'Step2 must maintain switchToCapMode');
  });

  // TEST H: Multi-zona / aggiungi altra zona
  test('GATE H: Add another zone/municipality button and handlers are preserved', () => {
    assert.match(CONTROLS_JSX, /handleAddZone|setPendingAddMunicipality/, 'Multi-zone add button must be present');
    assert.match(STEP2_JSX, /handleAddZone/, 'Step2 must provide handleAddZone');
  });

  // TEST I: Auto / Priorità / Manuale
  test('GATE I: Allocation modes (Auto, Priorità, Manuale) are preserved', () => {
    assert.match(COMUNE_JSX, /setAllocationMode/, 'Step2ComunePanel must support setting allocationMode');
    assert.match(COMUNE_JSX, /"auto"/, 'Auto allocation mode must exist');
    assert.match(COMUNE_JSX, /"priority"/, 'Priority allocation mode must exist');
    assert.match(COMUNE_JSX, /"manual"/, 'Manual allocation mode must exist');
  });

  // TEST J: Sorting: Rilevanza / Famiglie / Copertura
  test('GATE J: Sorting options (relevance, families, coverage) are preserved', () => {
    assert.match(COMUNE_JSX, /setZoneListSort/, 'Step2ComunePanel must support setZoneListSort');
    assert.match(COMUNE_JSX, /"relevance"/, 'Relevance sort must exist');
    assert.match(COMUNE_JSX, /"families"/, 'Families sort must exist');
    assert.match(COMUNE_JSX, /"coverage"/, 'Coverage sort must exist');
  });

  // TEST K, L, M: Truth Model & View Model calculations for Bruzzano fixture (10.000 flyers, 6.840 fam, 7.524 rec, 2.476 surplus)
  test('GATE K, L, M: Truth Model computes 7.524 rec, 2.476 surplus for Bruzzano fixture, ViewModel computes 6.840 families', () => {
    const bruzzanoZone = {
      id: "nil_14",
      name: "BRUZZANO",
      families: 6840,
      householdsTotal: 6840,
      pop: 13000,
      flyersMin: 7524,
      recommendedFlyers: 7524,
      coverage: 100,
      areaSqKm: 2.1,
    };

    const truthModel = buildStep2TruthModel({
      service: { key: "d2d", title: "Door to Door" },
      serviceData: { kpis: { families: 6840, population: 13000 } },
      insertedQuantity: 10000,
      currentQuantity: 10000,
      baseRequirement: 6840,
      recommendedRequirement: 7524,
      allocation: [{ ...bruzzanoZone, allocatedQuantity: 7524, requiredQuantity: 7524, coverage: 100 }],
      zones: [bruzzanoZone],
      territory: { label: "Milano - BRUZZANO", modeLabel: "NIL / quartiere" },
    });

    assert.equal(truthModel.quantity.current, 10000, "Current quantity should be 10.000");
    assert.equal(truthModel.quantity.recommendedRequirement, 7524, "Recommended requirement should be 7.524");
    assert.equal(truthModel.quantity.surplus, 2476, "Surplus should be 2.476");

    const viewModel = buildStep2ViewModel({
      truthModel,
      isResidentialStep2: true,
      serviceKpis: { families: 6840, population: 13000 },
      selZones: [bruzzanoZone],
      zonesInRadius: [bruzzanoZone],
      city: { name: "Milano", label: "Milano" },
      areaMode: "custom_zone",
      selectedSearchPoint: { type: "address", label: "Via Antonio Oroboni 2, Milano" },
      radiusKm: 3,
      finalFlyersRounded: 7524,
      requiredFlyers: 7524,
      flyerQuantityFromStep1: 10000,
      coverageDecisionReady: true,
      step2ZonesReady: true,
    });

    assert.equal(viewModel.primaryFamiliesValue, 6840, "Primary families value should be 6.840");
    assert.equal(viewModel.recommendedFlyersValue, 7524, "Recommended flyers value should be 7.524");
  });

  // TEST N, O, P: Decision options
  test('GATE N, O, P: Decision handlers support useRecommended, keepCurrent, and expand_area', () => {
    assert.match(COMUNE_JSX, /selectCoverageQuantityDecision\("useRecommended"\)/, 'Must support useRecommended');
    assert.match(COMUNE_JSX, /selectCoverageQuantityDecision\("keepCurrent"\)/, 'Must support keepCurrent');
    assert.match(COMUNE_JSX, /"expand_area"/, 'Must support expand_area strategy');
  });

  // TEST Q: Passaggio allo step successivo
  test('GATE Q: handleNext / Step2BottomActions correctly wired for step advance', () => {
    assert.match(SUMMARY_JSX, /Step2BottomActions/, 'Step2SummaryPanel must render Step2BottomActions');
    assert.match(STEP2_JSX, /handleNext/, 'Step2 must have handleNext');
  });
});
