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

// "Avanzamento distribuzione": real final coverage (calculate_campaign_final_coverage,
// final_operational_coverage_pct) of the campaigns already in distribution or
// completed, averaged by flyer quantity. No flyer estimate. `coverageById` maps
// campaign id -> percent (number), null when unavailable, undefined while loading.
export function buildDistributionProgress(campaigns, coverageById = {}, { loading = false, error = null } = {}) {
  if (loading || error || !Array.isArray(campaigns)) return { status: 'unavailable', pct: null, note: null };
  const started = campaigns.filter((row) => ['in_distribuzione', 'completata'].includes(row.stato));
  if (!started.length) return { status: 'not_started', pct: null, note: null };
  if (started.some((row) => coverageById[row.id] === undefined)) return { status: 'loading', pct: null, note: null };
  const known = started.filter((row) => isKnownNumber(coverageById[row.id]));
  const missing = started.length - known.length;
  const missingNote = missing ? plural(missing, 'campagna senza dato di copertura', 'campagne senza dato di copertura') : null;
  if (!known.length) return { status: 'unavailable', pct: null, note: missingNote };
  const weighted = known.every((row) => isKnownNumber(row.quantita) && Number(row.quantita) > 0);
  const weightOf = (row) => (weighted ? Number(row.quantita) : 1);
  const totalWeight = known.reduce((sum, row) => sum + weightOf(row), 0);
  const pct = Math.round(known.reduce((sum, row) => sum + Number(coverageById[row.id]) * weightOf(row), 0) / totalWeight);
  const scope = known.length === 1 ? '1 campagna in distribuzione o completata' : `${known.length} campagne in distribuzione o completate`;
  return { status: 'ready', pct: Math.min(100, Math.max(0, pct)), note: [`Copertura verificata su ${scope}`, missingNote].filter(Boolean).join(' · ') };
}
