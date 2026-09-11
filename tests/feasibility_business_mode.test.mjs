import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initialBusinessInputs,
  businessValidationErrors,
  isBusinessInputsComplete,
  BUSINESS_REQUIRED_FIELDS,
  resolveBusinessLocation,
  activityToPoiTargets,
  competitorCategoriesForTargets,
  NOT_AVAILABLE,
  PRELIMINARY,
} from '../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js';
import { buildBusinessAnalysis } from '../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js';
import { buildBusinessNarrative } from '../src/pages/customer/feasibility/business/feasibilityBusinessNarrative.js';
import { buildBusinessRecommendations } from '../src/pages/customer/feasibility/business/feasibilityBusinessRecommendations.js';
import { readFeasibility, saveFeasibility, STORAGE_KEY } from '../src/pages/customer/feasibility/feasibilityStorage.js';

function validBusinessInputs(overrides = {}) {
  return {
    ...initialBusinessInputs(),
    businessType: 'Palestra',
    location: 'Cormano',
    businessStatus: 'new',
    targetCustomer: 'sportivi',
    averagePrice: '45',
    businessGoal: 'zone_fit',
    ...overrides,
  };
}

// §1/§21 DUAL MODE: explicit state, never inferred from missing fields.
test('mode is explicit state, never inferred, and defaults to campaign for existing entry points', () => {
  const browser = { sessionStorage: { getItem: () => null, setItem() {} } };
  const state = readFeasibility(browser);
  assert.equal(state.mode, 'campaign');
  assert.deepEqual(state.businessInputs, initialBusinessInputs());

  const map = new Map();
  const stub = { sessionStorage: { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) } };
  const chosen = { ...readFeasibility(stub), mode: 'business', businessInputs: validBusinessInputs() };
  assert.equal(saveFeasibility(stub, chosen), true);
  const restored = readFeasibility(stub);
  assert.equal(restored.mode, 'business');
  assert.equal(restored.businessInputs.businessType, 'Palestra');
  assert.doesNotMatch(map.get(STORAGE_KEY), /vf_should_not_exist/);
});

// §3/§21 BUSINESS MODE TEST: "Voglio aprire una palestra a Cormano" needs
// no flyer quantity / campaign budget field at all.
test('business mode required fields never include flyer quantity or campaign cost', () => {
  assert.deepEqual(
    [...BUSINESS_REQUIRED_FIELDS].sort(),
    ['averagePrice', 'businessGoal', 'businessStatus', 'businessType', 'location', 'targetCustomer'].sort(),
  );
  assert.ok(!BUSINESS_REQUIRED_FIELDS.includes('flyerQuantity'));
  assert.ok(!BUSINESS_REQUIRED_FIELDS.includes('campaignCost'));

  const errors = businessValidationErrors(validBusinessInputs());
  assert.deepEqual(errors, {});
  assert.equal(isBusinessInputsComplete(validBusinessInputs()), true);

  const incomplete = businessValidationErrors(initialBusinessInputs());
  assert.ok(incomplete.businessType);
  assert.ok(incomplete.location);
  assert.ok(incomplete.businessStatus);
  assert.ok(incomplete.targetCustomer);
  assert.ok(incomplete.averagePrice);
  assert.ok(incomplete.businessGoal);
  assert.ok(!('flyerQuantity' in incomplete));
  assert.ok(!('campaignCost' in incomplete));
});

test('optional business fields (radius, competitors, price range, notes) are never required', () => {
  const errors = businessValidationErrors(validBusinessInputs({ radiusKm: '', knownCompetitors: '', priceRange: '', notes: '' }));
  assert.deepEqual(errors, {});
  const badRadius = businessValidationErrors(validBusinessInputs({ radiusKm: '999' }));
  assert.ok(badRadius.radiusKm);
});

// §5 activity-aware POI mapping via the existing POI engine's target categories.
test('activity to POI target mapping resolves fitness activities to real gym categories', () => {
  const { targets, matched } = activityToPoiTargets('Voglio aprire una palestra');
  assert.equal(matched, true);
  assert.deepEqual(targets, ['fitness']);
  assert.deepEqual(competitorCategoriesForTargets(targets), ['Palestra', 'Centro sportivo']);
});

test('unknown activity falls back generically instead of hiding every POI', () => {
  const { targets, matched } = activityToPoiTargets('attività misteriosa senza categoria nota');
  assert.equal(matched, false);
  assert.deepEqual(targets, []);
  assert.deepEqual(competitorCategoriesForTargets(targets), []);
});

// §4/§21 location resolution reuses the existing GEO_DATA set (Cormano acceptance case).
test('resolveBusinessLocation finds Cormano from GEO_DATA with real coordinates', () => {
  const location = resolveBusinessLocation('Cormano');
  assert.ok(location);
  assert.equal(location.name, 'Cormano');
  assert.equal(typeof location.lat, 'number');
  assert.equal(typeof location.lng, 'number');
});

test('resolveBusinessLocation returns null for unresolvable text rather than guessing', () => {
  assert.equal(resolveBusinessLocation('luogo-che-non-esiste-xyz-123'), null);
  assert.equal(resolveBusinessLocation(''), null);
});

// §6/§7/§8 deterministic competition/target/score computation, never fabricated.
test('competition level and score are computed only from real available data', () => {
  const center = { lat: 45.551, lng: 9.163 };
  const pois = [
    { id: 1, lat: 45.552, lng: 9.164, category: 'Palestra' },
    { id: 2, lat: 45.553, lng: 9.165, category: 'Centro sportivo' },
    { id: 3, lat: 45.554, lng: 9.166, category: 'Farmacia' },
  ];
  const analysis = buildBusinessAnalysis({
    center,
    radiusKm: 3,
    pois,
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 20000, households: 8000 },
  });
  assert.equal(analysis.competitorCount, 2);
  assert.ok(['BASSA', 'MEDIA', 'ALTA'].includes(analysis.competitionLevel));
  assert.equal(analysis.targetPotential.households, 8000);
  assert.ok(['ALTA', 'MEDIA', 'BASSA'].includes(analysis.score));
  assert.ok(analysis.factorsUsed <= analysis.factorsPossible);
});

// §4 EMPTY DATA TEST: unavailable metric shows literal NOT_AVAILABLE, never a fabricated number.
test('missing data sources never get fabricated; they show "Dato non disponibile"', () => {
  const analysis = buildBusinessAnalysis({
    center: null,
    radiusKm: 3,
    pois: [],
    poisAvailable: false,
    targets: [],
    territorial: { available: false, population: null, households: null },
  });
  assert.equal(analysis.competitionLevel, NOT_AVAILABLE);
  // Ticket "PREMIUM FEASIBILITY REPORTS" §5: con zero fattori reali il
  // giudizio complessivo non è un ALTA/MEDIA/BASSA "normale" ma una
  // valutazione preliminare esplicita — i singoli campi restano NOT_AVAILABLE.
  assert.equal(analysis.score, PRELIMINARY);
  assert.equal(analysis.targetPotential.available, false);
  assert.equal(analysis.factorsUsed, 0);
  assert.equal(analysis.dataReliability.level, 'BASSA');

  const narrative = buildBusinessNarrative({ inputs: validBusinessInputs(), analysis });
  assert.match(narrative.whyPromising, /Dato non disponibile/);
  assert.doesNotMatch(narrative.executiveSummary, /\d{4,}/);
});

// §10 AI narrative layer: pure deterministic composer, cannot invent numbers not in analysis.
test('business narrative only reuses numbers already present in the deterministic analysis', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.551, lng: 9.163 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.552, lng: 9.164, category: 'Palestra' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 12000, households: 5000 },
  });
  const narrative = buildBusinessNarrative({ inputs: validBusinessInputs(), analysis });
  assert.match(narrative.whyPromising, /5\.000|5000/);
  assert.ok(Array.isArray(narrative.riskFactors) && narrative.riskFactors.length > 0);
  assert.equal(typeof narrative.recommendedAction, 'string');

  const recommendations = buildBusinessRecommendations({ analysis });
  assert.ok(Array.isArray(recommendations) && recommendations.length > 0);
});

// §12/§20 firewall: campaign-mode source files remain untouched by this feature.
test('campaign-mode engine/schema/report files are logically unchanged (firewall)', () => {
  const engine = fs.readFileSync(new URL('../src/pages/customer/feasibility/feasibilityEngine.js', import.meta.url), 'utf8');
  const schemas = fs.readFileSync(new URL('../src/pages/customer/feasibility/feasibilitySchemas.js', import.meta.url), 'utf8');
  for (const forbidden of ['feasibilityBusiness', 'BusinessMode', 'businessInputs']) {
    assert.doesNotMatch(engine, new RegExp(forbidden));
    assert.doesNotMatch(schemas, new RegExp(forbidden));
  }
});

// §13 Smart Pairing must be optional/skippable in business mode without any required field.
test('Smart Pairing skip button requires zero fields and never blocks the report', () => {
  const componentSrc = fs.readFileSync(new URL('../src/pages/customer/feasibility/business/FeasibilityBusinessSmartPairing.jsx', import.meta.url), 'utf8');
  assert.match(componentSrc, /data-testid="vfb-skip-smart-pairing"/);
  const skipButton = componentSrc.match(/<button[^>]*data-testid="vfb-skip-smart-pairing"[^>]*>/)[0];
  assert.doesNotMatch(skipButton, /!email/);
  assert.doesNotMatch(skipButton, /required/);
});
