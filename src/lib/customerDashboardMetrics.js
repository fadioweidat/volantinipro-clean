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

// Partial observations are explanatory text, never authoritative KPI totals.
export function buildCustomerDashboardNotes(campaigns, { loading = false, error = null } = {}) {
  if (loading || error || !Array.isArray(campaigns)) return {};
  const notes = {};
  const missingPayments = campaigns.filter(row => getCustomerPaymentState(row.stato_pagamento) === CUSTOMER_PAYMENT_STATE.UNAVAILABLE).length;
  if (missingPayments) {
    const pending = campaigns.filter(row => getCustomerPaymentState(row.stato_pagamento) === CUSTOMER_PAYMENT_STATE.PENDING).length;
    notes.payment = `${pending} in attesa confermati · ${missingPayments} ${missingPayments === 1 ? "stato mancante" : "stati mancanti"}`;
  }
  for (const [key, field] of [['amount', 'totale_euro'], ['flyers', 'volantini_distribuiti']]) {
    const values = campaigns.map(row => row[field]).filter(value => value != null && value !== '' && Number.isFinite(Number(value)));
    const missing = campaigns.length - values.length;
    if (!missing) continue;
    if (!values.length) {
      notes[key] = `Dato mancante per ${missing} campagne`;
    } else {
      const total = values.reduce((sum, value) => sum + Number(value), 0);
      const formatted = key === 'amount' ? `€${total.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : total.toLocaleString('it-IT');
      notes[key] = `Somma parziale: ${formatted} · ${missing} ${missing === 1 ? "campagna senza dato" : "campagne senza dato"}`;
    }
  }
  return notes;
}
