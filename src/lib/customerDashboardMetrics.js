import { CUSTOMER_PAYMENT_STATE, getCustomerPaymentState } from './customerCampaigns.js';

// A total is authoritative only when every campaign supplies the metric.
// An explicitly successful empty response sums to zero; unavailable data never does.
function completeTotal(rows, field) {
  let total = 0;
  for (const row of rows) {
    const value = row[field];
    if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
    total += Number(value);
  }
  return total;
}

export function buildCustomerDashboardMetrics(campaigns, { loading = false, error = null } = {}) {
  if (loading || error || !Array.isArray(campaigns)) {
    return { activeCount: null, waitingPaymentCount: null, totalSpent: null, flyersDone: null };
  }
  return {
    activeCount: campaigns.some(row => !row.stato) ? null : campaigns.filter(row => ['confermata', 'in_preparazione', 'in_distribuzione'].includes(row.stato)).length,
    waitingPaymentCount: campaigns.some(row => getCustomerPaymentState(row.stato_pagamento) === CUSTOMER_PAYMENT_STATE.UNAVAILABLE)
      ? null : campaigns.filter(row => getCustomerPaymentState(row.stato_pagamento) === CUSTOMER_PAYMENT_STATE.PENDING).length,
    totalSpent: completeTotal(campaigns, 'totale_euro'),
    flyersDone: completeTotal(campaigns, 'volantini_distribuiti'),
  };
}
