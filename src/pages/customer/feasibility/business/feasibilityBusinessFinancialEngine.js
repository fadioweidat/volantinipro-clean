// Motore economico deterministico — ticket "UPGRADE FATTIBILITÀ DELLA MIA
// ATTIVITÀ: FULL TERRITORIAL + ECONOMIC FEASIBILITY STUDY". Nessuna chiamata
// di rete: prende SOLO i dati economici forniti/stimati e produce
// break-even, ROI, payback, proiezioni 12/24/36 mesi e 3 scenari con
// formule ispezionabili (mai un punteggio arbitrario nascosto). Ogni stima
// del modello (quando un campo opzionale manca) è etichettata
// esplicitamente `estimated: true` — il chiamante la mostra come "Stima del
// modello", mai come "Dato fornito da te".
export const ENGINE_VERSION = 'business-financial-v1';

const DEFAULT_STAFF_MONTHLY_COST = 1800; // Stima prudente costo mensile per addetto (RAL+contributi), usata SOLO se l'utente non indica un costo personale reale.
const DEFAULT_GROSS_MARGIN_PCT = 60; // Stima prudente in assenza di indicazioni su margine/costi variabili.

function toNum(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Normalizzazione input con stime esplicitamente etichettate ────────────
export function normalizeFinancialInputs(raw = {}) {
  const initialInvestment = toNum(raw.initialInvestment, 0);
  const monthlyRent = toNum(raw.monthlyRent, 0);
  const staffCount = toNum(raw.staffCount, 0);
  const otherFixedCostsMonthly = toNum(raw.otherFixedCostsMonthly, 0);
  const averagePrice = toNum(raw.averagePrice, null);
  const otherMonthlyRevenue = toNum(raw.otherMonthlyRevenue, 0);
  const availableCapital = toNum(raw.availableCapital, null);
  const launchCustomers = toNum(raw.launchCustomers, 0);
  const targetCustomers12mo = toNum(raw.targetCustomers12mo, launchCustomers);
  const monthlyGrowthPct = toNum(raw.monthlyGrowthPct, null);

  const fields = {};

  const monthlyStaffCostGiven = toNum(raw.monthlyStaffCost, null);
  const monthlyStaffCost = monthlyStaffCostGiven != null ? monthlyStaffCostGiven : staffCount * DEFAULT_STAFF_MONTHLY_COST;
  fields.monthlyStaffCost = { value: monthlyStaffCost, estimated: monthlyStaffCostGiven == null };

  const averageCustomerRevenueGiven = toNum(raw.averageCustomerRevenue, null);
  const averageCustomerRevenue = averageCustomerRevenueGiven != null ? averageCustomerRevenueGiven : (averagePrice || 0);
  fields.averageCustomerRevenue = { value: averageCustomerRevenue, estimated: averageCustomerRevenueGiven == null };

  const variableCostPctGiven = toNum(raw.variableCostPct, null);
  const grossMarginPctGiven = toNum(raw.grossMarginPct, null);
  let grossMarginPct;
  let grossMarginEstimated;
  if (grossMarginPctGiven != null) {
    grossMarginPct = grossMarginPctGiven;
    grossMarginEstimated = false;
  } else if (variableCostPctGiven != null) {
    grossMarginPct = 100 - variableCostPctGiven;
    grossMarginEstimated = false;
  } else {
    grossMarginPct = DEFAULT_GROSS_MARGIN_PCT;
    grossMarginEstimated = true;
  }
  grossMarginPct = Math.min(100, Math.max(0, grossMarginPct));
  fields.grossMarginPct = { value: grossMarginPct, estimated: grossMarginEstimated };

  return {
    initialInvestment, monthlyRent, staffCount, otherFixedCostsMonthly,
    averagePrice, otherMonthlyRevenue, availableCapital,
    launchCustomers, targetCustomers12mo, monthlyGrowthPct,
    monthlyStaffCost: fields.monthlyStaffCost.value,
    averageCustomerRevenue: fields.averageCustomerRevenue.value,
    grossMarginPct: fields.grossMarginPct.value,
    estimatedFields: fields,
  };
}

// ── Traiettoria clienti mese-per-mese (1..36) ──────────────────────────────
// Se è indicata una crescita mensile (%), si usa una crescita composta a
// partire dai clienti al lancio. Altrimenti si interpola linearmente tra
// "al lancio" e "dopo 12 mesi", poi si mantiene costante dal mese 13 al 36
// (nessuna crescita futura inventata senza un'ipotesi esplicita dell'utente).
export function buildCustomerTrajectory({ launchCustomers, targetCustomers12mo, monthlyGrowthPct }, months = 36, multiplier = 1) {
  const trajectory = [];
  const launch = Math.max(0, launchCustomers || 0) * multiplier;
  const target12 = Math.max(0, targetCustomers12mo ?? launchCustomers ?? 0) * multiplier;
  for (let m = 1; m <= months; m++) {
    let customers;
    if (monthlyGrowthPct != null && monthlyGrowthPct !== 0) {
      customers = launch * Math.pow(1 + monthlyGrowthPct / 100, m - 1);
    } else if (m <= 12) {
      customers = launch + ((target12 - launch) * (m - 1)) / 11;
    } else {
      customers = target12;
    }
    trajectory.push(Math.max(0, customers));
  }
  return trajectory;
}

// ── Economia mensile per un dato numero di clienti ─────────────────────────
export function monthlyEconomics(customers, inputs) {
  const revenue = customers * inputs.averageCustomerRevenue + (inputs.otherMonthlyRevenue || 0);
  const contributionMarginPerCustomer = inputs.averageCustomerRevenue * (inputs.grossMarginPct / 100);
  const contribution = customers * contributionMarginPerCustomer + (inputs.otherMonthlyRevenue || 0);
  const fixedCosts = inputs.monthlyRent + inputs.monthlyStaffCost + inputs.otherFixedCostsMonthly;
  const variableCosts = customers * inputs.averageCustomerRevenue * (1 - inputs.grossMarginPct / 100);
  const operatingProfit = contribution - fixedCosts;
  return { revenue: round2(revenue), fixedCosts: round2(fixedCosts), variableCosts: round2(variableCosts), contribution: round2(contribution), operatingProfit: round2(operatingProfit) };
}

// ── Pareggio (§4, corretto dal ticket "FINAL BUSINESS FEASIBILITY ECONOMIC
// CLARITY FIX") — formula sempre ispezionabile nel report. Gli "altri ricavi
// mensili" (es. personal training) sono ricorrenti e già usati altrove nel
// motore (monthlyEconomics) per calcolare il risultato operativo: prima di
// questo fix il pareggio li ignorava, creando un'incoerenza metodologica
// interna (l'operating profit al break-even NON tornava esattamente a zero).
// Formula: clienti per pareggio = max(0, ceil((costi fissi − altri ricavi
// mensili ricorrenti) ÷ margine di contribuzione per cliente)).
export function computeBreakEven(inputs) {
  const fixedCosts = inputs.monthlyRent + inputs.monthlyStaffCost + inputs.otherFixedCostsMonthly;
  const otherMonthlyRevenue = inputs.otherMonthlyRevenue || 0; // (§3-D) mancante -> 0
  const contributionMarginPerCustomer = inputs.averageCustomerRevenue * (inputs.grossMarginPct / 100);
  const residualFixedCosts = round2(fixedCosts - otherMonthlyRevenue);
  const base = {
    fixedCosts: round2(fixedCosts),
    otherMonthlyRevenue: round2(otherMonthlyRevenue),
    residualFixedCosts,
    contributionMarginPerCustomer: round2(contributionMarginPerCustomer),
  };
  if (contributionMarginPerCustomer <= 0) {
    // (§3-C) margine di contribuzione nullo o negativo: pareggio non
    // raggiungibile in ogni caso, indipendentemente da altri ricavi.
    return { ...base, customers: null, revenue: null, totalRevenue: null, reachable: false };
  }
  if (residualFixedCosts <= 0) {
    // (§3-B) gli altri ricavi ricorrenti coprono già da soli i costi fissi:
    // il pareggio è già raggiunto con zero clienti, mai un numero negativo.
    // Ricavo mensile totale al pareggio = 0 (da clienti) + altri ricavi
    // ricorrenti: mai un €0 fuorviante quando gli altri ricavi coprono già
    // il pareggio economicamente (ticket "FINAL BREAK-EVEN REVENUE LABEL").
    return { ...base, customers: 0, revenue: 0, totalRevenue: round2(otherMonthlyRevenue), reachable: true };
  }
  const customers = Math.ceil(residualFixedCosts / contributionMarginPerCustomer);
  const revenue = round2(customers * inputs.averageCustomerRevenue);
  // Ricavo mensile totale al pareggio = ricavo generato dai clienti + altri
  // ricavi mensili ricorrenti già inclusi nella formula del pareggio stesso
  // (§4): mostrare solo `revenue` sarebbe incoerente con la formula che ha
  // sottratto `otherMonthlyRevenue` dai costi fissi per arrivarci.
  const totalRevenue = round2(revenue + otherMonthlyRevenue);
  return { ...base, customers, revenue, totalRevenue, reachable: true };
}

// ── Payback period sull'investimento iniziale, mese in cui il profitto
// operativo cumulato (sulla traiettoria clienti) recupera l'investimento.
export function computePaybackMonths(trajectory, inputs, { horizonMonths = 36 } = {}) {
  if (!inputs.initialInvestment || inputs.initialInvestment <= 0) return { months: 0, reached: true };
  let cumulative = 0;
  for (let i = 0; i < Math.min(trajectory.length, horizonMonths); i++) {
    const { operatingProfit } = monthlyEconomics(trajectory[i], inputs);
    cumulative += operatingProfit;
    if (cumulative >= inputs.initialInvestment) return { months: i + 1, reached: true };
  }
  return { months: null, reached: false };
}

function sumOperatingProfit(trajectory, inputs, fromMonth, toMonth) {
  let total = 0;
  for (let i = fromMonth - 1; i < toMonth && i < trajectory.length; i++) {
    total += monthlyEconomics(trajectory[i], inputs).operatingProfit;
  }
  return round2(total);
}

// ── Uno scenario completo (§5) ─────────────────────────────────────────────
function buildScenario(name, multiplier, inputs) {
  const trajectory = buildCustomerTrajectory(inputs, 36, multiplier);
  const avgCustomersYear1 = round2(trajectory.slice(0, 12).reduce((s, v) => s + v, 0) / 12);
  const month1 = monthlyEconomics(trajectory[0], inputs);
  const month12 = monthlyEconomics(trajectory[11], inputs);
  const profit12mo = sumOperatingProfit(trajectory, inputs, 1, 12);
  const profit24mo = sumOperatingProfit(trajectory, inputs, 1, 24);
  const profit36mo = sumOperatingProfit(trajectory, inputs, 1, 36);
  const breakEven = computeBreakEven(inputs);
  const payback = computePaybackMonths(trajectory, inputs);
  const roi12mo = inputs.initialInvestment > 0 ? round2((profit12mo - inputs.initialInvestment) / inputs.initialInvestment * 100) : null;

  // Primo mese della traiettoria in cui i clienti dello scenario raggiungono
  // il pareggio (null se non raggiunto nell'orizzonte di 36 mesi).
  let breakEvenMonth = null;
  if (breakEven.reachable) {
    for (let i = 0; i < trajectory.length; i++) {
      if (trajectory[i] >= breakEven.customers) { breakEvenMonth = i + 1; break; }
    }
  }

  return {
    name, multiplier,
    customersMonth1: round2(trajectory[0]), customersMonth12: round2(trajectory[11]), avgCustomersYear1,
    monthlyRevenueMonth1: month1.revenue, monthlyRevenueMonth12: month12.revenue,
    monthlyCostsMonth1: round2(month1.fixedCosts + month1.variableCosts), monthlyCostsMonth12: round2(month12.fixedCosts + month12.variableCosts),
    operatingProfitMonth1: month1.operatingProfit, operatingProfitMonth12: month12.operatingProfit,
    annualResult12mo: profit12mo, cumulativeResult24mo: profit24mo, cumulativeResult36mo: profit36mo,
    breakEvenMonth, breakEvenReachedWithinYear1: breakEvenMonth != null && breakEvenMonth <= 12,
    roi12mo, payback,
  };
}

export const SCENARIO_ASSUMPTIONS = {
  prudente: { label: 'Prudente', multiplier: 0.7, note: 'Ipotesi di scenario: 70% della traiettoria clienti indicata.' },
  realistico: { label: 'Realistico', multiplier: 1, note: 'Ipotesi di scenario: traiettoria clienti indicata dall’utente, senza correzioni.' },
  crescita: { label: 'Crescita', multiplier: 1.3, note: 'Ipotesi di scenario: 130% della traiettoria clienti indicata.' },
};

// ── Sensitivity analysis (§8/§20) — variazione margine e costi fissi ──────
export function buildSensitivityAnalysis(inputs) {
  const baseline = computeBreakEven(inputs);
  const variants = [
    { label: 'Margine −10 p.p.', input: { ...inputs, grossMarginPct: Math.max(1, inputs.grossMarginPct - 10) } },
    { label: 'Margine base', input: inputs },
    { label: 'Margine +10 p.p.', input: { ...inputs, grossMarginPct: Math.min(100, inputs.grossMarginPct + 10) } },
    { label: 'Costi fissi +10%', input: { ...inputs, monthlyRent: inputs.monthlyRent * 1.1, monthlyStaffCost: inputs.monthlyStaffCost * 1.1, otherFixedCostsMonthly: inputs.otherFixedCostsMonthly * 1.1 } },
    { label: 'Costi fissi −10%', input: { ...inputs, monthlyRent: inputs.monthlyRent * 0.9, monthlyStaffCost: inputs.monthlyStaffCost * 0.9, otherFixedCostsMonthly: inputs.otherFixedCostsMonthly * 0.9 } },
  ];
  return {
    baseline,
    rows: variants.map(v => ({ label: v.label, breakEven: computeBreakEven(v.input) })),
  };
}

// ── Punto d'ingresso principale ─────────────────────────────────────────────
export function buildBusinessFinancialAnalysis(rawInputs) {
  const inputs = normalizeFinancialInputs(rawInputs);
  const trajectory = buildCustomerTrajectory(inputs, 36, 1);
  const breakEven = computeBreakEven(inputs);
  const payback = computePaybackMonths(trajectory, inputs);
  const roi12mo = inputs.initialInvestment > 0
    ? round2((sumOperatingProfit(trajectory, inputs, 1, 12) - inputs.initialInvestment) / inputs.initialInvestment * 100)
    : null;

  const scenarios = {
    prudente: buildScenario(SCENARIO_ASSUMPTIONS.prudente.label, SCENARIO_ASSUMPTIONS.prudente.multiplier, inputs),
    realistico: buildScenario(SCENARIO_ASSUMPTIONS.realistico.label, SCENARIO_ASSUMPTIONS.realistico.multiplier, inputs),
    crescita: buildScenario(SCENARIO_ASSUMPTIONS.crescita.label, SCENARIO_ASSUMPTIONS.crescita.multiplier, inputs),
  };

  const capitalAdequate = inputs.availableCapital == null ? null : inputs.availableCapital >= inputs.initialInvestment;

  return {
    engineVersion: ENGINE_VERSION,
    inputs,
    month1: monthlyEconomics(trajectory[0], inputs),
    month12: monthlyEconomics(trajectory[11], inputs),
    projections: {
      months12: { profit: sumOperatingProfit(trajectory, inputs, 1, 12), revenue: round2(trajectory.slice(0, 12).reduce((s, c) => s + monthlyEconomics(c, inputs).revenue, 0)) },
      months24: { profit: sumOperatingProfit(trajectory, inputs, 1, 24), revenue: round2(trajectory.slice(0, 24).reduce((s, c) => s + monthlyEconomics(c, inputs).revenue, 0)) },
      months36: { profit: sumOperatingProfit(trajectory, inputs, 1, 36), revenue: round2(trajectory.slice(0, 36).reduce((s, c) => s + monthlyEconomics(c, inputs).revenue, 0)) },
    },
    breakEven,
    payback,
    roi12mo,
    scenarios,
    sensitivity: buildSensitivityAnalysis(inputs),
    capitalAdequate,
  };
}
