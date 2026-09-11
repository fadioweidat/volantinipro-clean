import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NOT_AVAILABLE, PRELIMINARY } from '../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js';
import { buildBusinessAnalysis } from '../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js';
import {
  buildBusinessNarrative,
  buildBusinessNarrativeFacts,
  validateBusinessNarrative,
} from '../src/pages/customer/feasibility/business/feasibilityBusinessNarrative.js';
import { buildBusinessRecommendations } from '../src/pages/customer/feasibility/business/feasibilityBusinessRecommendations.js';
import FeasibilityBusinessReport from '../src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx';

function defaultInputs(overrides = {}) {
  return {
    businessType: 'Palestra',
    location: 'Bruzzano, Milano',
    businessStatus: 'new',
    targetCustomer: 'Sportivi e residenti di quartiere',
    averagePrice: '50',
    businessGoal: 'zone_fit',
    ...overrides,
  };
}

// 1. Deterministic source of truth: AI narrative NEVER mutates or overrides score / rating
test('AI narrative does not override or mutate analysis score, competitionLevel or targetPotential', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 35000, households: 16000 },
    inputsComplete: true,
  });

  const originalScore = analysis.score;
  const originalCompetition = analysis.competitionLevel;
  const originalHouseholds = analysis.targetPotential.households;

  const narrative = buildBusinessNarrative({ inputs: defaultInputs(), analysis });

  // Source analysis must remain unchanged
  assert.equal(analysis.score, originalScore);
  assert.equal(analysis.competitionLevel, originalCompetition);
  assert.equal(analysis.targetPotential.households, originalHouseholds);

  // Executive summary accurately reflects the deterministic score
  assert.match(narrative.executiveSummary, new RegExp(`Conclusione: fattibilità ${originalScore}`));
});

// 2. POI failure does NOT become "low competition"
test('Technical POI provider failure is explained as unavailable, never as zero competition', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [],
    poisAvailable: false,
    targets: ['fitness'],
    territorial: { available: true, population: 35000, households: 16000 },
    inputsComplete: true,
  });

  assert.equal(analysis.competitionLevel, NOT_AVAILABLE);

  const narrative = buildBusinessNarrative({ inputs: defaultInputs(), analysis });
  assert.match(narrative.competitionInterpretation, /provider di punti di interesse non era disponibile/i);
  assert.match(narrative.competitionInterpretation, /non zero/i);
  assert.doesNotMatch(narrative.competitionInterpretation, /concorrenza diretta è bassa/i);
});

// 3. Demographic unavailability is explicitly acknowledged with mandatory disclaimer
test('Unavailable demographic data is explicitly stated and includes disclaimer without hallucinating numbers', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: false, population: null, households: null },
    inputsComplete: true,
  });

  const narrative = buildBusinessNarrative({ inputs: defaultInputs(), analysis });
  assert.match(narrative.potentialCustomerInterpretation, /Dato non disponibile/i);
  assert.match(narrative.potentialCustomerInterpretation, /La mancanza del dato demografico riduce la capacità del report/i);
  assert.doesNotMatch(narrative.potentialCustomerInterpretation, /\b\d{4,}\b/);
});

// 4. Tone adaptation across reliability levels (ALTA, MEDIA, BASSA)
test('Tone adapts appropriately across data reliability levels', () => {
  // ALTA reliability: 4/4 factors available
  const analysisHigh = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' }, { id: 2, lat: 45.528, lng: 9.178, category: 'Farmacia' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 35000, households: 16000 },
    inputsComplete: true,
  });
  const narrativeHigh = buildBusinessNarrative({ inputs: defaultInputs(), analysis: analysisHigh });
  assert.equal(analysisHigh.dataReliability.level, 'ALTA');
  assert.match(narrativeHigh.territoryInterpretation, /geocodificato con precisione|evidenzia/i);
  assert.match(narrativeHigh.dataReliabilityComment, /alta affidabilità/i);

  // BASSA reliability: 0/4 factors available
  const analysisLow = buildBusinessAnalysis({
    center: null,
    radiusKm: 3,
    pois: [],
    poisAvailable: false,
    targets: [],
    territorial: { available: false, population: null, households: null },
    inputsComplete: false,
  });
  const narrativeLow = buildBusinessNarrative({ inputs: defaultInputs(), analysis: analysisLow });
  assert.equal(analysisLow.dataReliability.level, 'BASSA');
  assert.match(narrativeLow.territoryInterpretation, /valutazione preliminare|non è stata geocodificata/i);
  assert.match(narrativeLow.dataReliabilityComment, /Affidabilità preliminare|Mancano alcune fonti/i);
});

// 5. Structured output contract completeness
test('Structured output contract satisfies all required fields and backward-compatibility aliases', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [
      { id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' },
      { id: 2, lat: 45.527, lng: 9.178, category: 'Farmacia' },
      { id: 3, lat: 45.528, lng: 9.179, category: 'Supermercato' },
    ],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 28000, households: 12000 },
    inputsComplete: true,
  });

  const narrative = buildBusinessNarrative({ inputs: defaultInputs(), analysis });

  // Core structured fields
  assert.equal(typeof narrative.executiveSummary, 'string');
  assert.equal(typeof narrative.territoryInterpretation, 'string');
  assert.equal(typeof narrative.potentialCustomerInterpretation, 'string');
  assert.equal(typeof narrative.competitionInterpretation, 'string');
  assert.ok(Array.isArray(narrative.strengths) && narrative.strengths.length >= 2);
  assert.ok(Array.isArray(narrative.risks) && narrative.risks.length >= 2);
  assert.ok(Array.isArray(narrative.opportunities) && narrative.opportunities.length >= 2);
  assert.ok(Array.isArray(narrative.recommendations) && narrative.recommendations.length >= 2);
  assert.equal(typeof narrative.nextAction, 'string');
  assert.equal(typeof narrative.dataReliabilityComment, 'string');

  // Legacy aliases
  assert.equal(narrative.whyPromising, narrative.potentialCustomerInterpretation);
  assert.equal(narrative.whyCompetitionHigh, narrative.competitionInterpretation);
  assert.deepEqual(narrative.riskFactors, narrative.risks);
  assert.equal(narrative.recommendedAction, narrative.nextAction);
  assert.equal(typeof narrative.strongestPositive, 'string');
  assert.equal(typeof narrative.biggestRisk, 'string');
});

// 6. Consulting report rendering: full markup check
test('FeasibilityBusinessReport renders structured strengths, risks, opportunities and recommendations cleanly', () => {
  const inputs = defaultInputs();
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [
      { id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' },
      { id: 2, lat: 45.527, lng: 9.178, category: 'Farmacia' },
      { id: 3, lat: 45.528, lng: 9.179, category: 'Supermercato' },
    ],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 28000, households: 12000 },
    inputsComplete: true,
  });

  const narrative = buildBusinessNarrative({ inputs, analysis });
  const recommendations = buildBusinessRecommendations({ analysis });

  const html = renderToStaticMarkup(React.createElement(FeasibilityBusinessReport, {
    inputs,
    analysis,
    narrative,
    recommendations,
    loading: false,
    onEdit: () => {},
    onCta: () => {},
  }));

  // Strengths section renders list items
  assert.match(html, /<h3>8\. Punti di forza<\/h3><ul><li>/);
  // Risks section renders list items
  assert.match(html, /<h3>9\. Rischi<\/h3><ul><li>/);
  // Opportunities section renders list items
  assert.match(html, /<h3>10\. Opportunità<\/h3><ul><li>/);
  // Recommendations section renders list items
  assert.match(html, /<h3>12\. Raccomandazioni pratiche<\/h3><ul><li>/);
  // Next action section renders nextAction text
  assert.match(html, /<h3>13\. Prossima azione consigliata<\/h3><p>/);
  // Data sources section renders reliability commentary
  assert.match(html, /Dati ad alta affidabilità/);
});

// 7. Truth firewall: facts payload extracts only real deterministic data
test('buildBusinessNarrativeFacts prepares structured verified facts without inventing values', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' }, { id: 2, lat: 45.528, lng: 9.178, category: 'Farmacia' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 35000, households: 16000 },
    inputsComplete: true,
  });

  const facts = buildBusinessNarrativeFacts({ inputs: defaultInputs(), analysis });
  assert.equal(facts.businessType, 'Palestra');
  assert.equal(facts.households, 16000);
  assert.equal(facts.population, 35000);
  assert.equal(facts.competitorCount, 1);
  assert.equal(facts.deterministicFinalRating, analysis.score);
  assert.equal(facts.radiusKm, 3);
  assert.ok(facts.demographicsAvailable);
  assert.ok(facts.poisAvailable);
});

// 8. Invalid or hallucinating AI candidate triggers safe fallback to deterministic narrative
test('Invalid or malicious AI output fails validation and falls back to deterministic narrative', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [],
    poisAvailable: false,
    targets: ['fitness'],
    territorial: { available: false, population: null, households: null },
    inputsComplete: true,
  });

  // Candidate with missing fields
  const invalidCandidate = {
    executiveSummary: 'Short summary',
    // Missing required fields
  };
  const narrativeFallback1 = buildBusinessNarrative({ inputs: defaultInputs(), analysis, customNarrative: invalidCandidate });
  assert.match(narrativeFallback1.executiveSummary, /preliminare/i);

  // Malicious candidate that tries to claim ALTA when data is PRELIMINARY
  const maliciousCandidate = {
    executiveSummary: 'Conclusione: fattibilità ALTA garantita con 1000000 euro di ricavi!',
    territoryInterpretation: 'Zona perfetta',
    competitionInterpretation: 'Zero concorrenti',
    potentialCustomerInterpretation: '100000 residenti',
    strengths: ['Ottimo'],
    risks: ['Nessuno'],
    opportunities: ['Moltissime'],
    recommendations: ['Compra subito'],
    nextAction: 'Inizia',
    dataReliabilityComment: 'Affidabile',
  };
  const narrativeFallback2 = buildBusinessNarrative({ inputs: defaultInputs(), analysis, customNarrative: maliciousCandidate });
  // Must reject malicious candidate and fallback to safe deterministic engine narrative
  assert.match(narrativeFallback2.executiveSummary, /valutazione preliminare/i);
  assert.match(narrativeFallback2.competitionInterpretation, /provider di punti di interesse non era disponibile/i);
});

// 9. Valid custom AI narrative is accepted and normalized
test('Valid structured custom AI narrative is accepted and populates legacy aliases', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.525, lng: 9.176 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.526, lng: 9.177, category: 'Palestra' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 35000, households: 16000 },
    inputsComplete: true,
  });

  const validCustom = {
    executiveSummary: `Analisi per Palestra a Bruzzano, raggio 3 km. Conclusione: fattibilità ${analysis.score}.`,
    territoryInterpretation: 'Area urbana ben collegata.',
    competitionInterpretation: 'Un solo concorrente diretto rilevato.',
    potentialCustomerInterpretation: 'Bacino di 16000 famiglie.',
    strengths: ['Posizionamento chiaro', 'Bacino ampio'],
    risks: ['Presenza competitor a breve distanza', 'Necessità di validazione domanda'],
    opportunities: ['Eventi promozionali', 'Coupon di benvenuto'],
    recommendations: ['Test iniziale su 30 giorni', 'Monitorare conversioni'],
    nextAction: 'Lanciare test promozionale tracciabile.',
    dataReliabilityComment: 'Dati ISTAT e POI completi.',
  };

  const narrative = buildBusinessNarrative({ inputs: defaultInputs(), analysis, customNarrative: validCustom });
  assert.equal(narrative.executiveSummary, validCustom.executiveSummary);
  assert.equal(narrative.territoryInterpretation, validCustom.territoryInterpretation);
  assert.equal(narrative.whyPromising, validCustom.potentialCustomerInterpretation);
  assert.deepEqual(narrative.riskFactors, validCustom.risks);
  assert.equal(narrative.recommendedAction, validCustom.nextAction);
});

// 10. Production acceptance test case: Palestra, Via Antonio Oroboni Milano, 3 km
test('Production acceptance case: Palestra, Via Antonio Oroboni Milano, 3km radius', () => {
  const inputs = {
    businessType: 'Palestra',
    location: 'Via Antonio Oroboni, 20161 Milano',
    businessStatus: 'new',
    targetCustomer: 'Appassionati fitness e residenti Municipio 9',
    averagePrice: '55',
    businessGoal: 'zone_fit',
    radiusKm: '3',
  };

  const analysis = buildBusinessAnalysis({
    center: { lat: 45.5255, lng: 9.1762 }, // Bruzzano coordinates
    radiusKm: 3,
    pois: [
      { id: 1, lat: 45.526, lng: 9.177, category: 'Palestra', name: 'Palestra Bruzzano' },
      { id: 2, lat: 45.535, lng: 9.168, category: 'Centro sportivo', name: 'Centro Fitness Nord' },
      { id: 3, lat: 45.528, lng: 9.175, category: 'Farmacia', name: 'Farmacia Oroboni' },
      { id: 4, lat: 45.530, lng: 9.180, category: 'Supermercato', name: 'Supermercato Locale' },
    ],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 42000, households: 19500 },
    inputsComplete: true,
  });

  const narrative = buildBusinessNarrative({ inputs, analysis });
  const recommendations = buildBusinessRecommendations({ analysis });

  // 1. Executive summary answers all 6 questions in consulting style
  assert.match(narrative.executiveSummary, /Palestra/);
  assert.match(narrative.executiveSummary, /Via Antonio Oroboni/);
  assert.match(narrative.executiveSummary, new RegExp(`Conclusione: fattibilità ${analysis.score}`));
  assert.match(narrative.executiveSummary, /Fattore positivo principale/);
  assert.match(narrative.executiveSummary, /Rischio principale/);
  assert.match(narrative.executiveSummary, /Affidabilità dei dati/);
  assert.match(narrative.executiveSummary, /Prossimo passo/);

  // 2. Competition narrative uses real data
  assert.match(narrative.competitionInterpretation, /attività dello stesso tipo nel raggio/i);

  // 3. Potential customer has numbers from analysis + disclaimer
  assert.match(narrative.potentialCustomerInterpretation, /19\.500|19500/);
  assert.match(narrative.potentialCustomerInterpretation, /42\.000|42000/);
  assert.match(narrative.potentialCustomerInterpretation, /non una previsione di clienti/i);

  // 4. Strengths, risks, opportunities are evidence-based
  assert.ok(narrative.strengths.length >= 2);
  assert.ok(narrative.risks.length >= 2);
  assert.ok(narrative.opportunities.length >= 2);

  // 5. Next action is practical and concrete
  assert.ok(narrative.nextAction.length > 20);

  // 6. Final rating remains deterministic
  assert.ok(['ALTA', 'MEDIA', 'BASSA'].includes(analysis.score));
});

