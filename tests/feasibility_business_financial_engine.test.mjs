// TICKET — "UPGRADE FATTIBILITÀ DELLA MIA ATTIVITÀ: FULL TERRITORIAL +
// ECONOMIC FEASIBILITY STUDY". Motore economico deterministico: break-even,
// margine di contribuzione, ROI, payback, scenari, edge case margine
// zero/negativo, campi opzionali mancanti -> stima etichettata.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildBusinessFinancialAnalysis,
  computeBreakEven,
  computePaybackMonths,
  buildCustomerTrajectory,
  monthlyEconomics,
  normalizeFinancialInputs,
} from '../src/pages/customer/feasibility/business/feasibilityBusinessFinancialEngine.js';

// ── A. Break-even math (hand-verified) ─────────────────────────────────────
test('computeBreakEven: clienti per pareggio = costi fissi / margine di contribuzione per cliente, arrotondato per eccesso', () => {
  const inputs = { monthlyRent: 500, monthlyStaffCost: 500, otherFixedCostsMonthly: 0, averageCustomerRevenue: 100, grossMarginPct: 50 };
  const be = computeBreakEven(inputs);
  assert.equal(be.fixedCosts, 1000);
  assert.equal(be.contributionMarginPerCustomer, 50);
  assert.equal(be.customers, 20);
  assert.equal(be.revenue, 2000);
  assert.equal(be.totalRevenue, 2000); // nessun altro ricavo -> totale = ricavo clienti
  assert.equal(be.reachable, true);
});

test('computeBreakEven: arrotonda per eccesso quando la divisione non è intera', () => {
  const inputs = { monthlyRent: 1000, monthlyStaffCost: 700, otherFixedCostsMonthly: 0, averageCustomerRevenue: 59, grossMarginPct: 60 };
  const be = computeBreakEven(inputs);
  // fixedCosts=1700, contributionPerCustomer=59*0.6=35.4, 1700/35.4=48.02... -> 49
  assert.equal(be.fixedCosts, 1700);
  assert.equal(be.contributionMarginPerCustomer, 35.4);
  assert.equal(be.customers, 49);
});

// ── F. Zero/negative margin edge case: pareggio non raggiungibile ─────────
test('computeBreakEven: margine di contribuzione nullo o negativo -> pareggio non raggiungibile, mai un numero inventato', () => {
  const zero = computeBreakEven({ monthlyRent: 500, monthlyStaffCost: 0, otherFixedCostsMonthly: 0, averageCustomerRevenue: 100, grossMarginPct: 0 });
  assert.equal(zero.reachable, false);
  assert.equal(zero.customers, null);
  assert.equal(zero.revenue, null);
  assert.equal(zero.totalRevenue, null); // §5-B: ricavo totale al pareggio non disponibile se il pareggio non è raggiungibile
});

// ── TICKET "FINAL BUSINESS FEASIBILITY ECONOMIC CLARITY FIX" §10 ──────────
// Break-even deve sottrarre gli altri ricavi mensili ricorrenti dai costi
// fissi PRIMA di dividere per il margine di contribuzione per cliente.
test('§10-A: FitLife — costi fissi 11700, altri ricavi 800, margine 35.40 -> pareggio 308 clienti', () => {
  const inputs = { monthlyRent: 4500, monthlyStaffCost: 4 * 1800, otherFixedCostsMonthly: 0, averageCustomerRevenue: 59, grossMarginPct: 60, otherMonthlyRevenue: 800 };
  const be = computeBreakEven(inputs);
  assert.equal(be.fixedCosts, 11700);
  assert.equal(be.otherMonthlyRevenue, 800);
  assert.equal(be.residualFixedCosts, 10900);
  assert.equal(be.contributionMarginPerCustomer, 35.4);
  assert.equal(be.customers, 308);
  assert.equal(be.reachable, true);
  assert.equal(be.revenue, 18172); // ricavo generato solo dai 308 clienti
});

test('§10-B: stessi costi fissi ma senza altri ricavi (0) -> comportamento esistente, pareggio 331 clienti', () => {
  const inputs = { monthlyRent: 4500, monthlyStaffCost: 4 * 1800, otherFixedCostsMonthly: 0, averageCustomerRevenue: 59, grossMarginPct: 60, otherMonthlyRevenue: 0 };
  const be = computeBreakEven(inputs);
  assert.equal(be.fixedCosts, 11700);
  assert.equal(be.otherMonthlyRevenue, 0);
  assert.equal(be.residualFixedCosts, 11700);
  assert.equal(be.customers, 331);
});

// ── TICKET "FINAL BREAK-EVEN REVENUE LABEL / CONSISTENCY FIX" §6 ──────────
// Il ricavo mensile TOTALE al pareggio deve includere sia il ricavo generato
// dai clienti sia gli altri ricavi mensili ricorrenti già sottratti nella
// formula del pareggio — mostrare solo il ricavo clienti come "di pareggio"
// era un'incongruenza terminologica (18.172 € non è il ricavo totale reale).
test('§6-A: FitLife — 308 clienti × 59 € + 800 € altri ricavi -> ricavo mensile totale al pareggio 18.972 €', () => {
  const inputs = { monthlyRent: 4500, monthlyStaffCost: 4 * 1800, otherFixedCostsMonthly: 0, averageCustomerRevenue: 59, grossMarginPct: 60, otherMonthlyRevenue: 800 };
  const be = computeBreakEven(inputs);
  assert.equal(be.customers, 308);
  assert.equal(be.revenue, 18172);
  assert.equal(be.totalRevenue, 18972);
});

test('§6-B: senza altri ricavi mensili -> ricavo totale al pareggio = 331 clienti × 59 € = 19.529 €', () => {
  const inputs = { monthlyRent: 4500, monthlyStaffCost: 4 * 1800, otherFixedCostsMonthly: 0, averageCustomerRevenue: 59, grossMarginPct: 60, otherMonthlyRevenue: 0 };
  const be = computeBreakEven(inputs);
  assert.equal(be.customers, 331);
  assert.equal(be.revenue, 19529);
  assert.equal(be.totalRevenue, 19529);
});

test('§10-B bis: altri ricavi mensili mancanti (undefined) -> trattati come 0, stesso risultato', () => {
  const inputs = { monthlyRent: 4500, monthlyStaffCost: 4 * 1800, otherFixedCostsMonthly: 0, averageCustomerRevenue: 59, grossMarginPct: 60 };
  const be = computeBreakEven(inputs);
  assert.equal(be.otherMonthlyRevenue, 0);
  assert.equal(be.customers, 331);
});

test('§10-C: altri ricavi mensili >= costi fissi -> pareggio raggiunto con 0 clienti, mai negativo', () => {
  const inputs = { monthlyRent: 500, monthlyStaffCost: 500, otherFixedCostsMonthly: 0, averageCustomerRevenue: 100, grossMarginPct: 50, otherMonthlyRevenue: 5000 };
  const be = computeBreakEven(inputs);
  assert.equal(be.fixedCosts, 1000);
  assert.equal(be.residualFixedCosts, -4000);
  assert.equal(be.customers, 0);
  assert.equal(be.revenue, 0);
  assert.equal(be.reachable, true);
  // §5-C: 0 clienti ma altri ricavi > 0 -> il ricavo totale riflette gli
  // altri ricavi ricorrenti, mai uno 0 € fuorviante.
  assert.equal(be.totalRevenue, 5000);
});

test('§10-D: margine di contribuzione <= 0 con altri ricavi presenti -> resta non raggiungibile (mai un numero inventato)', () => {
  const inputs = { monthlyRent: 500, monthlyStaffCost: 0, otherFixedCostsMonthly: 0, averageCustomerRevenue: 100, grossMarginPct: 0, otherMonthlyRevenue: 800 };
  const be = computeBreakEven(inputs);
  assert.equal(be.reachable, false);
  assert.equal(be.customers, null);
  assert.equal(be.revenue, null);
  assert.equal(be.totalRevenue, null);
});

// ── B. Contribution margin / monthly economics ─────────────────────────────
test('monthlyEconomics: ricavo, contribuzione e risultato operativo calcolati correttamente', () => {
  const inputs = { averageCustomerRevenue: 100, grossMarginPct: 50, otherMonthlyRevenue: 0, monthlyRent: 500, monthlyStaffCost: 500, otherFixedCostsMonthly: 0 };
  const m = monthlyEconomics(30, inputs);
  assert.equal(m.revenue, 3000);
  assert.equal(m.contribution, 1500); // 30 * (100*0.5)
  assert.equal(m.fixedCosts, 1000);
  assert.equal(m.variableCosts, 1500); // 3000 * (1 - 0.5)
  assert.equal(m.operatingProfit, 500); // 1500 - 1000
});

// ── D. Payback period ───────────────────────────────────────────────────────
test('computePaybackMonths: mese in cui il profitto cumulato recupera l\'investimento iniziale', () => {
  const inputs = { averageCustomerRevenue: 100, grossMarginPct: 50, otherMonthlyRevenue: 0, monthlyRent: 500, monthlyStaffCost: 500, otherFixedCostsMonthly: 0, initialInvestment: 1000 };
  const trajectory = buildCustomerTrajectory({ launchCustomers: 30, targetCustomers12mo: 30, monthlyGrowthPct: null }, 36, 1);
  const payback = computePaybackMonths(trajectory, inputs);
  // profitto/mese = 500 -> mese 2 cumulato 1000 >= 1000
  assert.equal(payback.reached, true);
  assert.equal(payback.months, 2);
});

test('computePaybackMonths: nessun investimento iniziale -> payback immediato (0 mesi)', () => {
  const inputs = { averageCustomerRevenue: 100, grossMarginPct: 50, otherMonthlyRevenue: 0, monthlyRent: 500, monthlyStaffCost: 500, otherFixedCostsMonthly: 0, initialInvestment: 0 };
  const trajectory = buildCustomerTrajectory({ launchCustomers: 30, targetCustomers12mo: 30, monthlyGrowthPct: null }, 36, 1);
  const payback = computePaybackMonths(trajectory, inputs);
  assert.equal(payback.reached, true);
  assert.equal(payback.months, 0);
});

test('computePaybackMonths: investimento mai recuperato in 36 mesi -> "Non raggiunto", mai un numero a caso', () => {
  const inputs = { averageCustomerRevenue: 50, grossMarginPct: 50, otherMonthlyRevenue: 0, monthlyRent: 5000, monthlyStaffCost: 5000, otherFixedCostsMonthly: 0, initialInvestment: 1000000 };
  const trajectory = buildCustomerTrajectory({ launchCustomers: 10, targetCustomers12mo: 10, monthlyGrowthPct: null }, 36, 1);
  const payback = computePaybackMonths(trajectory, inputs);
  assert.equal(payback.reached, false);
  assert.equal(payback.months, null);
});

// ── C/E. Full analysis: ROI + 3 scenarios ───────────────────────────────────
test('buildBusinessFinancialAnalysis: ROI 12 mesi e 3 scenari (prudente/realistico/crescita) con moltiplicatori espliciti', () => {
  const raw = {
    initialInvestment: '1000', monthlyRent: '500', staffCount: '1', monthlyStaffCost: '500',
    otherFixedCostsMonthly: '0', averagePrice: '100', averageCustomerRevenue: '100', grossMarginPct: '50',
    launchCustomers: '30', targetCustomers12mo: '30', monthlyGrowthPct: '', otherMonthlyRevenue: '0', availableCapital: '',
  };
  const result = buildBusinessFinancialAnalysis(raw);
  assert.equal(result.breakEven.customers, 20);
  assert.equal(result.month1.operatingProfit, 500);
  assert.equal(result.roi12mo, 500); // (12*500 - 1000) / 1000 * 100

  assert.equal(result.scenarios.realistico.customersMonth1, 30);
  assert.equal(result.scenarios.realistico.operatingProfitMonth1, 500);
  assert.equal(result.scenarios.realistico.breakEvenReachedWithinYear1, true);

  assert.equal(result.scenarios.prudente.customersMonth1, 21); // 30 * 0.7
  assert.equal(result.scenarios.prudente.operatingProfitMonth1, 50); // 21*50 - 1000
  assert.equal(result.scenarios.prudente.roi12mo, -40); // (600-1000)/1000*100

  assert.equal(result.scenarios.crescita.customersMonth1, 39); // 30 * 1.3
  assert.equal(result.scenarios.crescita.operatingProfitMonth1, 950); // 39*50 - 1000
  assert.equal(result.scenarios.crescita.roi12mo, 1040); // (11400-1000)/1000*100
});

// ── G. Missing optional inputs -> estimated fields labeled ────────────────
test('normalizeFinancialInputs: campi opzionali mancanti -> stima esplicitamente etichettata `estimated: true`', () => {
  const n = normalizeFinancialInputs({
    initialInvestment: '80000', monthlyRent: '4500', staffCount: '4',
    averagePrice: '59', launchCustomers: '150', targetCustomers12mo: '350',
  });
  assert.equal(n.estimatedFields.monthlyStaffCost.estimated, true);
  assert.equal(n.monthlyStaffCost, 4 * 1800); // stima prudente documentata
  assert.equal(n.estimatedFields.grossMarginPct.estimated, true);
  assert.equal(n.grossMarginPct, 60); // stima prudente documentata
  assert.equal(n.estimatedFields.averageCustomerRevenue.estimated, true);
  assert.equal(n.averageCustomerRevenue, 59); // = prezzo medio
});

// ── H. Estimated vs user-provided: un valore fornito NON viene mai sovrascritto ─
test('normalizeFinancialInputs: valori forniti dall\'utente restano invariati e mai etichettati come stima', () => {
  const n = normalizeFinancialInputs({
    initialInvestment: '80000', monthlyRent: '4500', staffCount: '4', monthlyStaffCost: '9000',
    averagePrice: '59', averageCustomerRevenue: '65', grossMarginPct: '55',
    launchCustomers: '150', targetCustomers12mo: '350',
  });
  assert.equal(n.estimatedFields.monthlyStaffCost.estimated, false);
  assert.equal(n.monthlyStaffCost, 9000);
  assert.equal(n.estimatedFields.grossMarginPct.estimated, false);
  assert.equal(n.grossMarginPct, 55);
  assert.equal(n.estimatedFields.averageCustomerRevenue.estimated, false);
  assert.equal(n.averageCustomerRevenue, 65);
});

test('normalizeFinancialInputs: costi variabili (%) forniti -> margine lordo derivato per complemento, non stimato', () => {
  const n = normalizeFinancialInputs({
    initialInvestment: '0', monthlyRent: '0', staffCount: '0',
    averagePrice: '100', variableCostPct: '35',
    launchCustomers: '10', targetCustomers12mo: '10',
  });
  assert.equal(n.estimatedFields.grossMarginPct.estimated, false);
  assert.equal(n.grossMarginPct, 65);
});

// ── Traiettoria clienti: interpolazione lineare vs crescita composta ───────
test('buildCustomerTrajectory: interpolazione lineare tra lancio e 12 mesi, poi costante dal mese 13', () => {
  const trajectory = buildCustomerTrajectory({ launchCustomers: 150, targetCustomers12mo: 350, monthlyGrowthPct: null }, 36, 1);
  assert.equal(Math.round(trajectory[0]), 150);
  assert.equal(Math.round(trajectory[11]), 350);
  assert.equal(Math.round(trajectory[20]), 350); // mese 21: costante dal mese 13
  assert.equal(trajectory.length, 36);
});

test('buildCustomerTrajectory: con crescita mensile esplicita usa crescita composta dal lancio', () => {
  const trajectory = buildCustomerTrajectory({ launchCustomers: 100, targetCustomers12mo: 100, monthlyGrowthPct: 10 }, 3, 1);
  assert.equal(trajectory[0], 100);
  assert.equal(Math.round(trajectory[1] * 100) / 100, 110);
  assert.equal(Math.round(trajectory[2] * 100) / 100, 121);
});
