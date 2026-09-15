// TICKET — "UPGRADE FATTIBILITÀ DELLA MIA ATTIVITÀ: FULL TERRITORIAL +
// ECONOMIC FEASIBILITY STUDY". Sintesi territorio+economia, verdetto
// finale, report/PDF esteso, fix QA (località canonica, enum umano, data,
// nome attività/cliente), SWOT a 4 quadranti, nessuna fuga di dati
// fornitore/admin, scenario realistico "palestra Milano" del ticket (§18).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildBusinessAnalysis } from '../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js';
import { buildBusinessFinancialAnalysis } from '../src/pages/customer/feasibility/business/feasibilityBusinessFinancialEngine.js';
import {
  computeEconomicScore,
  computeRiskScore,
  computeFinalVerdict,
  buildBusinessSynthesis,
} from '../src/pages/customer/feasibility/business/feasibilityBusinessSynthesis.js';
import { buildBusinessNarrative } from '../src/pages/customer/feasibility/business/feasibilityBusinessNarrative.js';
import { buildBusinessRecommendations } from '../src/pages/customer/feasibility/business/feasibilityBusinessRecommendations.js';
import { businessGoalLabel } from '../src/pages/customer/feasibility/business/feasibilityBusinessSchemas.js';
import FeasibilityBusinessReport from '../src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx';

function territorialFixture(overrides = {}) {
  return buildBusinessAnalysis({
    center: { lat: 45.4642, lng: 9.19 },
    location: { displayAddress: 'Milano, Lombardia', city: 'Milano', nilName: 'DUOMO' },
    radiusKm: 3,
    pois: [{ id: 1, lat: 45.465, lng: 9.191, category: 'Palestra' }],
    poisAvailable: true,
    targets: ['fitness'],
    territorial: { available: true, population: 17652, households: 9589 },
    inputsComplete: true,
    ...overrides,
  });
}

function inputsFixture(overrides = {}) {
  return {
    businessType: 'Palestra / Centro Fitness', location: 'Milano', businessStatus: 'new',
    targetCustomer: 'sportivi', averagePrice: '59', businessGoal: 'should_open',
    radiusKm: '3', knownCompetitors: '', priceRange: '', notes: '',
    businessName: 'FitLife Palestra', referenceName: 'Mario Rossi',
    initialInvestment: '80000', monthlyRent: '4500', staffCount: '4', monthlyStaffCost: '',
    otherFixedCostsMonthly: '', variableCostPct: '', averageCustomerRevenue: '',
    grossMarginPct: '', launchCustomers: '150', targetCustomers12mo: '350', monthlyGrowthPct: '',
    otherMonthlyRevenue: '800', availableCapital: '90000',
    ...overrides,
  };
}

// ── §9-B: enum umano, mai il token interno ─────────────────────────────────
test('businessGoalLabel: mostra sempre l\'etichetta umana, mai il token interno', () => {
  assert.equal(businessGoalLabel('should_open'), 'Capire se aprire');
  assert.equal(businessGoalLabel('zone_fit'), 'Capire se la zona è adatta');
  assert.equal(businessGoalLabel(''), null);
  assert.equal(businessGoalLabel('valore-non-noto'), 'valore-non-noto'); // mai "Dato non disponibile" per un valore realmente fornito
});

// ── §18 Scenario realistico del ticket: palestra Milano ────────────────────
test('SCENARIO REALISTICO §18: palestra Milano, investimento 80k, 150->350 iscritti, break-even/ROI/scenari coerenti', () => {
  const inputs = inputsFixture();
  const financial = buildBusinessFinancialAnalysis(inputs);
  const fi = financial.inputs;

  // Stime prudenti etichettate per i campi non forniti dal ticket.
  assert.equal(fi.estimatedFields.monthlyStaffCost.estimated, true);
  assert.equal(fi.monthlyStaffCost, 4 * 1800);
  assert.equal(fi.estimatedFields.grossMarginPct.estimated, true);
  assert.equal(fi.grossMarginPct, 60);
  assert.equal(fi.estimatedFields.averageCustomerRevenue.estimated, true);
  assert.equal(fi.averageCustomerRevenue, 59);

  // Break-even: fixedCosts = 4500 + 7200 = 11700; contribution/cliente = 59*0.6 = 35.4
  assert.equal(financial.breakEven.fixedCosts, 11700);
  assert.equal(financial.breakEven.contributionMarginPerCustomer, 35.4);
  assert.equal(financial.breakEven.customers, 331); // ceil(11700/35.4)
  assert.equal(financial.breakEven.reachable, true);

  // Break-even (331) supera i clienti al lancio (150) ma resta sotto i 350 a 12 mesi -> economia MEDIA.
  const economic = computeEconomicScore(financial);
  assert.equal(economic.label, 'MEDIA');

  // I 3 scenari esistono e sono internamente ordinati (crescita > realistico > prudente).
  assert.ok(financial.scenarios.crescita.annualResult12mo > financial.scenarios.realistico.annualResult12mo);
  assert.ok(financial.scenarios.realistico.annualResult12mo > financial.scenarios.prudente.annualResult12mo);

  // Sintesi territorio + economia -> verdetto esplicito, mai un colore a caso.
  const territorial = territorialFixture();
  const synthesis = buildBusinessSynthesis({ territorialAnalysis: territorial, financialAnalysis: financial });
  assert.ok(['GO', 'GO CON CONDIZIONI', 'ATTENZIONE', 'ALTO RISCHIO', 'NO-GO'].includes(synthesis.finalVerdict));
  assert.equal(typeof synthesis.finalVerdictWhy, 'string');
  assert.ok(synthesis.finalVerdictWhy.length > 10);
});

// ── §6 Sintesi: punteggio economico deterministico rispetto alla traiettoria clienti ─
test('computeEconomicScore: ALTA se il pareggio è già raggiunto al lancio, BASSA se supera anche l\'obiettivo a 12 mesi', () => {
  const alta = buildBusinessFinancialAnalysis({
    initialInvestment: '0', monthlyRent: '100', staffCount: '0', averagePrice: '50', grossMarginPct: '50',
    launchCustomers: '10', targetCustomers12mo: '10',
  }); // fixedCosts=100, contrib/cliente=25, breakEven=4 <= 10 lancio
  assert.equal(computeEconomicScore(alta).label, 'ALTA');

  const bassa = buildBusinessFinancialAnalysis({
    initialInvestment: '0', monthlyRent: '10000', staffCount: '0', averagePrice: '10', grossMarginPct: '50',
    launchCustomers: '5', targetCustomers12mo: '10',
  }); // breakEven enormemente sopra 10
  assert.equal(computeEconomicScore(bassa).label, 'BASSA');
});

test('computeEconomicScore: pareggio non raggiungibile (margine nullo) -> BASSA con motivazione esplicita', () => {
  const noMargin = buildBusinessFinancialAnalysis({
    initialInvestment: '0', monthlyRent: '100', staffCount: '0', averagePrice: '50', grossMarginPct: '0',
    launchCustomers: '10', targetCustomers12mo: '10',
  });
  const economic = computeEconomicScore(noMargin);
  assert.equal(economic.label, 'BASSA');
  assert.match(economic.reason, /non è raggiungibile/i);
});

// ── §6 Rischio: combina concorrenza territoriale + payback + capitale ──────
test('computeRiskScore: concorrenza alta + payback non raggiunto + capitale insufficiente -> ALTO', () => {
  const risk = computeRiskScore({ competitionLevel: 'ALTA', payback: { reached: false, months: null }, capitalAdequate: false });
  assert.equal(risk.label, 'ALTO');
});

test('computeRiskScore: concorrenza bassa + payback rapido + capitale sufficiente -> BASSO', () => {
  const risk = computeRiskScore({ competitionLevel: 'BASSA', payback: { reached: true, months: 3 }, capitalAdequate: true });
  assert.equal(risk.label, 'BASSO');
});

// ── §7 Verdetto finale: regola esplicita, mai un singolo numero opaco ──────
test('computeFinalVerdict: GO quando territorio non sfavorevole ed economia ALTA con rischio basso/medio', () => {
  const v = computeFinalVerdict({ territorialScore: 'ALTA', economicScore: { label: 'ALTA' }, riskScore: { label: 'BASSO' } });
  assert.equal(v.verdict, 'GO');
  assert.ok(v.why.length > 5);
  assert.ok(v.rules.length > 20);
});

test('computeFinalVerdict: NO-GO quando il pareggio non è raggiungibile e il territorio è sfavorevole', () => {
  const v = computeFinalVerdict({ territorialScore: 'BASSA', economicScore: { label: 'BASSA' }, riskScore: { label: 'ALTO' } });
  assert.equal(v.verdict, 'NO-GO');
});

test('computeFinalVerdict: GO CON CONDIZIONI quando l\'economia è MEDIA (pareggio solo a 12 mesi)', () => {
  const v = computeFinalVerdict({ territorialScore: 'MEDIA', economicScore: { label: 'MEDIA' }, riskScore: { label: 'BASSO' } });
  assert.equal(v.verdict, 'GO CON CONDIZIONI');
});

// ── Report esteso: sezioni economiche, SWOT 4Q, data, nomi, nessuna fuga dati ─
function fullReportHtml(overrides = {}) {
  const inputs = inputsFixture(overrides);
  const analysis = territorialFixture();
  const financial = buildBusinessFinancialAnalysis(inputs);
  const synthesis = buildBusinessSynthesis({ territorialAnalysis: analysis, financialAnalysis: financial });
  const narrative = buildBusinessNarrative({ inputs, analysis });
  const recommendations = buildBusinessRecommendations({ analysis });
  return renderToStaticMarkup(React.createElement(FeasibilityBusinessReport, {
    inputs, analysis, narrative, recommendations, financial, synthesis, loading: false, onEdit: () => {}, onCta: () => {},
  }));
}

test('Report esteso: sezioni economiche 15-29 presenti (break-even, scenari, ROI, payback, SWOT, verdetto)', () => {
  const html = fullReportHtml();
  for (let i = 1; i <= 29; i += 1) assert.match(html, new RegExp(`>${i}\\. `), `sezione ${i} mancante`);
  assert.match(html, /Analisi del pareggio</);
  assert.match(html, /Analisi degli scenari</);
  assert.match(html, />23\. ROI</);
  assert.match(html, /Periodo di recupero \(payback\)</);
  assert.match(html, /SWOT — matrice a 4 quadranti</);
  assert.match(html, /Sintesi territorio \+ economia e verdetto finale</);
});

test('Report esteso: SWOT mostra 4 quadranti espliciti (Punti di forza / Debolezze / Opportunità / Minacce)', () => {
  const html = fullReportHtml();
  assert.match(html, /<dt>Punti di forza<\/dt>/);
  assert.match(html, /<dt>Debolezze<\/dt>/);
  assert.match(html, /<dt>Opportunità<\/dt>/);
  assert.match(html, /<dt>Minacce<\/dt>/);
});

test('Report esteso: verdetto finale esplicito visibile above-the-fold e nella sezione di sintesi', () => {
  const html = fullReportHtml();
  assert.match(html, /data-testid="vfb-verdict"/);
  assert.match(html, /data-testid="vfb-final-verdict"/);
  assert.match(html, /Punteggio territoriale/);
  assert.match(html, /Punteggio economico/);
  assert.match(html, /Punteggio di rischio/);
});

// ── §9-C/§9-D: data analisi, nome attività, nome referente ─────────────────
test('Report: data dell\'analisi, nome attività e referente compaiono nel report/PDF', () => {
  const html = fullReportHtml();
  const today = new Date().toLocaleDateString('it-IT');
  assert.match(html, new RegExp(`Data analisi: ${today.replace(/\//g, '\\/')}`));
  assert.match(html, /FitLife Palestra/);
  assert.match(html, /Mario Rossi/);
});

test('Report: senza nome attività/referente (facoltativi) il report resta valido, nessun "undefined"', () => {
  const html = fullReportHtml({ businessName: '', referenceName: '' });
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

// ── §9-A: località canonica invece del display_name grezzo ────────────────
test('Report: mostra la località canonica risolta (city/region), mai il grezzo se non c\'è una via reale', () => {
  const analysis = territorialFixture({ location: { displayAddress: 'Milano, Lombardia', city: 'Milano', nilName: 'DUOMO' } });
  const inputs = inputsFixture();
  const financial = buildBusinessFinancialAnalysis(inputs);
  const synthesis = buildBusinessSynthesis({ territorialAnalysis: analysis, financialAnalysis: financial });
  const narrative = buildBusinessNarrative({ inputs, analysis });
  const html = renderToStaticMarkup(React.createElement(FeasibilityBusinessReport, {
    inputs, analysis, narrative, recommendations: [], financial, synthesis, loading: false, onEdit: () => {}, onCta: () => {},
  }));
  assert.match(html, /Milano, Lombardia/);
  assert.doesNotMatch(html, /Milano, Rodano, Milano/);
});

// ── §9-B nel report reale: mai il token "should_open" grezzo ──────────────
test('Report: obiettivo principale mostra l\'etichetta umana, mai il token "should_open"', () => {
  const html = fullReportHtml();
  assert.match(html, /Obiettivo principale: Capire se aprire/);
  assert.doesNotMatch(html, />should_open</);
});

// ── §15/§9-N: nessuna fuga di dati fornitore/operatore/admin ──────────────
test('Report: nessun dato fornitore, operatore o admin-only nel report cliente', () => {
  const html = fullReportHtml();
  for (const forbidden of ['supplier_', 'operator_', 'access_token', 'admin_', 'gps_tracking', 'compenso fornitore']) {
    assert.doesNotMatch(html, new RegExp(forbidden, 'i'));
  }
});

// ── §16 Mobile: le sezioni economiche riusano le classi responsive esistenti ─
test('Report source: le nuove sezioni riusano vf-table-wrap/vf-swot/vf-metrics (già responsive), nessuna griglia nuova non gestita', () => {
  const src = fs.readFileSync(new URL('../src/pages/customer/feasibility/business/FeasibilityBusinessReport.jsx', import.meta.url), 'utf8');
  const financialBlockStart = src.indexOf('15. Modello di business');
  const financialBlock = src.slice(financialBlockStart);
  assert.match(financialBlock, /vf-table-wrap/);
  assert.match(financialBlock, /vf-swot/);
  assert.match(financialBlock, /vf-metrics/);
});

// ── §13 Disclaimer finanziario esplicito ───────────────────────────────────
test('Report: disclaimer finanziario esplicito presente quando i dati economici sono disponibili', () => {
  const html = fullReportHtml();
  assert.match(html, /Le proiezioni economiche sono stime basate sui dati forniti e sulle ipotesi indicate\. Non costituiscono consulenza finanziaria, fiscale o garanzia di risultati\./);
});

// ── Retrocompatibilità: senza financial/synthesis il report resta quello di prima (14 sezioni) ─
test('Report: senza financial/synthesis (chiamante legacy) resta esattamente il report territoriale di 14 sezioni', () => {
  const inputs = inputsFixture();
  const analysis = territorialFixture();
  const narrative = buildBusinessNarrative({ inputs, analysis });
  const recommendations = buildBusinessRecommendations({ analysis });
  const html = renderToStaticMarkup(React.createElement(FeasibilityBusinessReport, {
    inputs, analysis, narrative, recommendations, loading: false, onEdit: () => {}, onCta: () => {},
  }));
  for (let i = 1; i <= 14; i += 1) assert.match(html, new RegExp(`>${i}\\. `));
  assert.doesNotMatch(html, />15\. /);
  assert.doesNotMatch(html, /SWOT — matrice a 4 quadranti/);
});

// ── Firewall: motore territoriale/campaign invariati ───────────────────────
test('firewall: il motore territoriale esistente non importa nulla dal nuovo motore economico/sintesi', async () => {
  const engineSrc = fs.readFileSync(new URL('../src/pages/customer/feasibility/business/feasibilityBusinessEngine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(engineSrc, /feasibilityBusinessFinancialEngine|feasibilityBusinessSynthesis/);
  const campaignEngineSrc = fs.readFileSync(new URL('../src/pages/customer/feasibility/feasibilityEngine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(campaignEngineSrc, /feasibilityBusinessFinancialEngine|feasibilityBusinessSynthesis|feasibilityBusiness/);
});
