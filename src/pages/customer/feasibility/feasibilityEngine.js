import { SCENARIO_KEYS, validationErrors } from './feasibilitySchemas.js';

export const ENGINE_VERSION = '1.0.0';
export const CLASSIFICATION_RULES = 'GO: contributo realistico ≥ costo e perdita prudente ≤ 50% del costo. GO WITH CONDITIONS: contributo realistico ≥ 80% del costo. Altrimenti HIGH RISK. Con costo e margine nulli: HIGH RISK; con costo zero e margine positivo: GO.';
export function calculateFeasibility(inputs, { unusualMargin = false } = {}) {
  const errors = validationErrors(inputs, unusualMargin);
  if (Object.keys(errors).length) throw new Error('INVALID_INPUT: ' + Object.keys(errors).join(', '));
  const v = key => inputs[key]?.value;
  const cost = v('campaignCost'), margin = v('averageCustomerMargin'), quantity = v('flyerQuantity');
  const costCents = Math.round(cost * 100), marginCents = Math.round(margin * 100), revenueCents = Math.round(v('averageCustomerRevenue') * 100);
  const scenario = (name, rate) => {
    const customers = quantity * rate;
    const contributionCents = customers * marginCents;
    const contribution = contributionCents / 100;
    const netResult = (contributionCents - costCents) / 100;
    return { name, conversionRate: rate, expectedCustomers: customers, practicalRange: [Math.floor(customers), Math.ceil(customers)], revenueGenerated: customers * revenueCents / 100, contribution, campaignCost: cost, netResult, roi: costCents > 0 ? (contributionCents - costCents) / costCents * 100 : null, cac: customers > 0 ? cost / customers : null, breakEvenAchieved: contributionCents >= costCents };
  };
  const scenarios = SCENARIO_KEYS.map((key, i) => scenario(['Prudente', 'Realistico', 'Crescita'][i], v(key)));
  const breakEvenCustomers = costCents === 0 ? 0 : marginCents > 0 ? Math.ceil(costCents / marginCents) : null;
  const classification = margin === 0 ? 'HIGH RISK' : scenarios[1].contribution >= cost && scenarios[0].netResult >= -cost * 0.5 ? 'GO' : scenarios[1].contribution >= cost * 0.8 ? 'GO WITH CONDITIONS' : 'HIGH RISK';
  const result = { engineVersion: ENGINE_VERSION, campaignCost: cost, breakEvenCustomers, breakEvenConversion: breakEvenCustomers === null ? null : breakEvenCustomers / quantity, targetConversion: v('targetNewCustomers') / quantity, target: scenario('Obiettivo', v('targetNewCustomers') / quantity), scenarios, firstPurchaseCACCeiling: margin, ltvRevenueCeiling: v('customerLifetimeValue'), classification, classificationRules: CLASSIFICATION_RULES };
  // Never leak non-finite arithmetic even with pathological subnormal margins.
  function finite(value) { if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new Error('CALCULATION_RANGE'); if (value && typeof value === 'object') Object.values(value).forEach(finite); }
  finite(result);
  return result;
}
