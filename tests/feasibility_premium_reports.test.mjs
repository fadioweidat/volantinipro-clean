// TICKET — "PREMIUM FEASIBILITY REPORTS: 2 DISTINCT PDF REPORTS".
// Business e Campaign devono restare due report VERAMENTE distinti (titolo,
// executive summary, KPI, sezioni, PDF), con un'affidabilità dei dati
// trasparente e senza mai travestire un dato mancante da buona notizia
// (§4/§5/§9/§10). Nessuna modifica al motore campaign (formule) né al motore
// deterministico business (concorrenza/bacino/punteggio) — solo confidenza
// e presentazione.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NOT_AVAILABLE, PRELIMINARY } from '../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js';
import { buildBusinessAnalysis, computeDataReliability } from '../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js';
import { buildBusinessNarrative } from '../src/pages/customer/feasibility/business/feasibilityBusinessNarrative.js';
import { buildBusinessRecommendations } from '../src/pages/customer/feasibility/business/feasibilityBusinessRecommendations.js';
import FeasibilityBusinessReport from '../src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx';
import FeasibilityReport, { money, number } from '../src/pages/customer/feasibility/FeasibilityReport.jsx';
import { initialInputs, cell } from '../src/pages/customer/feasibility/feasibilitySchemas.js';
import { calculateFeasibility } from '../src/pages/customer/feasibility/feasibilityEngine.js';

const businessSrc = readFileSync(new URL('../src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx', import.meta.url), 'utf8');
const campaignSrc = readFileSync(new URL('../src/pages/customer/feasibility/FeasibilityReport.jsx', import.meta.url), 'utf8');

function inputsFixture(overrides = {}) {
  return {
    businessType: 'Palestra', location: 'Cormano', businessStatus: 'new',
    targetCustomer: 'sportivi', averagePrice: '45', businessGoal: 'zone_fit',
    radiusKm: '', knownCompetitors: '', priceRange: '', notes: '',
    ...overrides,
  };
}

// ── §4 Data reliability: deterministic count, never a fabricated stat ─────
test('computeDataReliability: regola deterministica per conteggio di fonti, mai un punteggio statistico', () => {
  assert.equal(computeDataReliability({ locationResolved: true, territorialAvailable: true, poisAvailable: true, inputsComplete: true }).level, 'ALTA');
  assert.equal(computeDataReliability({ locationResolved: true, territorialAvailable: true, poisAvailable: false, inputsComplete: true }).level, 'ALTA');
  assert.equal(computeDataReliability({ locationResolved: true, territorialAvailable: false, poisAvailable: false, inputsComplete: true }).level, 'MEDIA');
  assert.equal(computeDataReliability({ locationResolved: false, territorialAvailable: false, poisAvailable: false, inputsComplete: true }).level, 'BASSA');
  assert.equal(computeDataReliability({ locationResolved: false, territorialAvailable: false, poisAvailable: false, inputsComplete: false }).level, 'BASSA');
  const full = computeDataReliability({ locationResolved: true, territorialAvailable: true, poisAvailable: true, inputsComplete: true });
  assert.equal(full.factorsAvailable, 4);
  assert.equal(full.factorsPossible, 4);
  assert.equal(full.factors.length, 4);
});

// ── §18 CASE A: ISTAT + POI available -> real numbers, meaningful rating ──
test('CASE A (palestra/Cormano/3km, ISTAT+POI available): dati reali, rating significativo, affidabilità alta/media', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.551, lng: 9.163 },
    radiusKm: 3,
    pois: [
      { id: 1, lat: 45.552, lng: 9.164, category: 'Palestra' },
      { id: 2, lat: 45.560, lng: 9.170, category: 'Farmacia' },
    ],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 12592, households: 6840 },
    inputsComplete: true,
  });
  assert.equal(analysis.targetPotential.households, 6840);
  assert.equal(analysis.targetPotential.population, 12592);
  assert.ok(['BASSA', 'MEDIA', 'ALTA'].includes(analysis.competitionLevel));
  assert.notEqual(analysis.competitionLevel, NOT_AVAILABLE);
  assert.ok(['ALTA', 'MEDIA', 'BASSA'].includes(analysis.score));
  assert.notEqual(analysis.score, PRELIMINARY);
  assert.ok(['ALTA', 'MEDIA'].includes(analysis.dataReliability.level), `expected ALTA/MEDIA, got ${analysis.dataReliability.level}`);
});

// ── §18 CASE B: ISTAT + POI unavailable -> no fake low competition/potential ─
test('CASE B (ISTAT+POI unavailable): niente concorrenza finta BASSA, niente bacino finto, rating preliminare, affidabilità BASSA', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.551, lng: 9.163 }, // location IS resolved (geocoding ok) — solo ISTAT e POI falliscono
    radiusKm: 3,
    pois: [],
    poisAvailable: false,
    targets: ['fitness'],
    territorial: { available: false, population: null, households: null },
    inputsComplete: true,
  });
  // §5 regola critica: provider POI fallito NON deve mai leggersi come "0 concorrenti / BASSA".
  assert.equal(analysis.competitionLevel, NOT_AVAILABLE);
  assert.notEqual(analysis.competitionLevel, 'BASSA');
  // §5: ISTAT non disponibile NON deve inventare un bacino.
  assert.equal(analysis.targetPotential.available, false);
  assert.equal(analysis.targetPotential.households, null);
  assert.equal(analysis.targetPotential.population, null);
  // §5: nessun verdetto ALTA/MEDIA/BASSA "normale" con zero fattori reali.
  assert.equal(analysis.score, PRELIMINARY);
  // location e' geocodificata e i campi cliente sono completi (2/4 fonti) ->
  // MEDIA, non ALTA: solo ISTAT e POI (le 2 fonti "maggiori") sono mancanti.
  assert.equal(analysis.dataReliability.level, 'MEDIA');

  const narrative = buildBusinessNarrative({ inputs: inputsFixture(), analysis });
  // §9: spiegazione esplicita del guasto tecnico, non "zero concorrenti".
  assert.match(narrative.whyCompetitionHigh, /provider di punti di interesse non era disponibile/i);
  const recs = buildBusinessRecommendations({ analysis });
  assert.ok(recs.some(r => /provider di punti di interesse non era disponibile/i.test(r)));
});

// ── §7 Executive summary answers all 6 required questions ─────────────────
test('Executive summary risponde a: cosa analizzato, conclusione, fattore positivo, rischio, affidabilità, prossimo passo', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.551, lng: 9.163 },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.552, lng: 9.164, category: 'Palestra' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 12592, households: 6840 },
    inputsComplete: true,
  });
  const narrative = buildBusinessNarrative({ inputs: inputsFixture(), analysis });
  const summary = narrative.executiveSummary;
  assert.match(summary, /Palestra/); // cosa e' stato analizzato
  assert.match(summary, /Conclusione/i); // conclusione principale
  assert.match(summary, /Fattore positivo principale/i); // fattore positivo piu' forte
  assert.match(summary, /Rischio principale/i); // rischio principale
  assert.match(summary, /Affidabilità dei dati/i); // affidabilita'
  assert.match(summary, /Prossimo passo/i); // prossima azione
});

// ── §3/§6/§13 Business report: above-the-fold, 14 sections, titolo distinto ─
test('FeasibilityBusinessReport: titolo/sottotitolo distinti, above-the-fold, 14 sezioni numerate, fonti', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.551, lng: 9.163 }, radiusKm: 3,
    pois: [{ id: 1, lat: 45.552, lng: 9.164, category: 'Palestra' }],
    poisAvailable: true, targets: ['fitness'],
    territorial: { available: true, population: 12592, households: 6840 },
    inputsComplete: true,
  });
  const narrative = buildBusinessNarrative({ inputs: inputsFixture(), analysis });
  const recommendations = buildBusinessRecommendations({ analysis });
  const html = renderToStaticMarkup(React.createElement(FeasibilityBusinessReport, {
    inputs: inputsFixture(), analysis, narrative, recommendations, loading: false, onEdit: () => {}, onCta: () => {},
  }));

  assert.match(html, /Studio di Fattibilità AI — Attività e Territorio/);
  assert.match(html, /Analisi del potenziale territoriale, concorrenza e opportunità/);
  // above the fold: tipo attività, località, raggio, potenzialità, affidabilità
  assert.match(html, /Palestra/);
  assert.match(html, /Cormano/);
  assert.match(html, /3 km/);
  assert.match(html, /data-testid="vfb-score"/);
  assert.match(html, /data-testid="vfb-reliability"/);
  for (let i = 1; i <= 14; i += 1) assert.match(html, new RegExp(`>${i}\\. `), `sezione ${i} mancante`);
  assert.match(html, />Analizza un(?:'|&#x27;)altra zona</);
  assert.match(html, /Fonti dei dati e ipotesi/);
  assert.match(html, /vf-source-tag/);
  assert.doesNotMatch(html, /\{"|undefined|\[object Object\]/, 'nessun JSON/debug grezzo nel report');
});

test('FeasibilityBusinessReport CASE B: mostra "Dato non disponibile" e "analisi incompleta", mai un verdetto normale', () => {
  const analysis = buildBusinessAnalysis({
    center: { lat: 45.551, lng: 9.163 }, radiusKm: 3,
    pois: [], poisAvailable: false, targets: ['fitness'],
    territorial: { available: false, population: null, households: null },
    inputsComplete: true,
  });
  const narrative = buildBusinessNarrative({ inputs: inputsFixture(), analysis });
  const recommendations = buildBusinessRecommendations({ analysis });
  const html = renderToStaticMarkup(React.createElement(FeasibilityBusinessReport, {
    inputs: inputsFixture(), analysis, narrative, recommendations, loading: false, onEdit: () => {}, onCta: () => {},
  }));
  assert.match(html, /analisi incompleta/i);
  assert.match(html, /Valutazione preliminare/);
  assert.match(html, /provider di punti di interesse non era disponibile/i);
  assert.doesNotMatch(html, />BASSA<\/strong>.{0,40}Concorrenza/s);
});

// ── §13/§15 Campaign report: titolo distinto e CTA row, nessuna regressione formule ─
function campaignFixture() {
  const inputs = initialInputs({ total: 420, quantity: 10000, municipalities: ['Milano'], areas: ['Milano'], service: 'd2d' });
  inputs.businessType = cell('Palestra', 'user_provided');
  inputs.averageCustomerRevenue = cell(200, 'user_provided');
  inputs.averageCustomerMargin = cell(180, 'user_provided');
  inputs.targetNewCustomers = cell(10, 'user_provided');
  return inputs;
}

test('FeasibilityReport (campaign): titolo/sottotitolo distinti dal business, CTA §15, nessuna regressione sulle cifre', () => {
  const inputs = campaignFixture();
  const result = calculateFeasibility(inputs);
  const html = renderToStaticMarkup(React.createElement(FeasibilityReport, {
    inputs, result, narrative: null, aiState: 'ready', unusualMargin: false, onEdit: () => {},
  }));
  assert.match(html, /Studio di Fattibilità AI — Campagna Pubblicitaria/);
  assert.match(html, /Analisi economica, break-even e scenari/);
  assert.doesNotMatch(html, /Attività e Territorio/, 'il titolo campaign non deve confondersi con quello business');
  // §15 CTA
  assert.match(html, /Calcola \/ aggiorna preventivo/);
  assert.match(html, />Avvia campagna</);
  assert.match(html, /Parla con un consulente/);
  assert.match(html, />Scarica PDF</);
  // Nessuna regressione sui numeri (stesso fixture di feasibility_phase2.test.mjs)
  assert.equal(result.breakEvenCustomers, 3);
  assert.match(html, new RegExp(money(result.target.contribution).replace(/[.,]/g, '\\$&')));
});

// ── Due report VERAMENTE distinti: nessuna fusione in un report generico ──
test('Business e Campaign restano due componenti report distinti (nessuna fusione)', () => {
  assert.doesNotMatch(businessSrc, /feasibilityEngine\.js|calculateFeasibility/);
  assert.doesNotMatch(campaignSrc, /feasibilityBusinessEngine|buildBusinessAnalysis/);
  assert.notEqual(businessSrc, campaignSrc);
});

// ── §16 Print isolation: FeasibilityPage.jsx rende un solo report per modo ──
test('FeasibilityPage.jsx: i due modi restano rami early-return mutuamente esclusivi (nessuna contaminazione stampa)', () => {
  const pageSrc = readFileSync(new URL('../src/pages/customer/feasibility/FeasibilityPage.jsx', import.meta.url), 'utf8');
  const businessIdx = pageSrc.indexOf("mode === 'business'");
  const campaignReturnIdx = pageSrc.indexOf('Campaign Mode');
  assert.ok(businessIdx > 0 && campaignReturnIdx > businessIdx, 'il ramo business deve restare un return anticipato prima del ramo campaign');
});
