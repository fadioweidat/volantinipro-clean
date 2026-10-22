import { CUSTOMER_PAYMENT_STATE, getCustomerPaymentState } from './customerCampaigns.js';

const isKnownNumber = (value) => value != null && value !== '' && Number.isFinite(Number(value));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Flyers: a total is authoritative only when every campaign supplies the metric.
// An explicitly successful empty response sums to zero; unavailable data never does.
function completeTotal(rows, field) {
  let total = 0;
  for (const row of rows) {
    const value = row[field];
    if (!isKnownNumber(value)) return null;
    total += Number(value);
  }
  return total;
}

// Amount and payment count: the sum of the campaigns that have the figure, with
// a note naming how many do not (e.g. 1 of 52). Unavailable only when no
// campaign has it; never a zero for missing data.
function knownSum(rows, field) {
  const values = rows.map((row) => row[field]).filter(isKnownNumber);
  return values.length ? values.reduce((sum, value) => sum + Number(value), 0) : (rows.length ? null : 0);
}

export function buildCustomerDashboardMetrics(campaigns, { loading = false, error = null } = {}) {
  if (loading || error || !Array.isArray(campaigns)) {
    return { activeCount: null, waitingPaymentCount: null, totalSpent: null, flyersDone: null };
  }
  const paymentStates = campaigns.map((row) => getCustomerPaymentState(row.stato_pagamento));
  const knownPayments = paymentStates.filter((state) => state !== CUSTOMER_PAYMENT_STATE.UNAVAILABLE);
  return {
    activeCount: campaigns.some(row => !row.stato) ? null : campaigns.filter(row => ['confermata', 'in_preparazione', 'in_distribuzione'].includes(row.stato)).length,
    waitingPaymentCount: campaigns.length && !knownPayments.length ? null : knownPayments.filter((state) => state === CUSTOMER_PAYMENT_STATE.PENDING).length,
    totalSpent: knownSum(campaigns, 'totale_euro'),
    flyersDone: completeTotal(campaigns, 'volantini_distribuiti'),
  };
}

// Notes say which figure is missing and for how many campaigns.
export function buildCustomerDashboardNotes(campaigns, { loading = false, error = null } = {}) {
  if (loading || error || !Array.isArray(campaigns)) return {};
  const notes = {};
  const missingPayments = campaigns.filter(row => getCustomerPaymentState(row.stato_pagamento) === CUSTOMER_PAYMENT_STATE.UNAVAILABLE).length;
  if (missingPayments) notes.payment = plural(missingPayments, 'campagna senza stato di pagamento', 'campagne senza stato di pagamento');
  const missingAmounts = campaigns.filter(row => !isKnownNumber(row.totale_euro)).length;
  if (missingAmounts) notes.amount = plural(missingAmounts, 'campagna senza importo', 'campagne senza importo');
  const knownFlyers = campaigns.map(row => row.volantini_distribuiti).filter(isKnownNumber);
  const missingFlyers = campaigns.length - knownFlyers.length;
  if (missingFlyers) {
    notes.flyers = knownFlyers.length
      ? `Somma parziale: ${knownFlyers.reduce((sum, value) => sum + Number(value), 0).toLocaleString('it-IT')} · ${plural(missingFlyers, 'campagna senza dato', 'campagne senza dato')}`
      : `Dato mancante per ${missingFlyers} campagne`;
  }
  return notes;
}
