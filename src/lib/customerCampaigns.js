export const CUSTOMER_DATA_UNAVAILABLE = 'Dato non disponibile';
export const CUSTOMER_PAYMENT_STATE = Object.freeze({
  PAID: 'paid',
  PENDING: 'pending',
  UNAVAILABLE: 'unavailable',
});

const PAID_PAYMENT_STATUSES = new Set(['pagato', 'paid', 'completed']);
const PENDING_PAYMENT_STATUSES = new Set(['in_attesa', 'in_attesa_pagamento', 'pending']);

export function getCustomerPaymentState(value) {
  const normalized = nullableText(value)?.toLowerCase() ?? null;
  if (normalized && PAID_PAYMENT_STATUSES.has(normalized)) return CUSTOMER_PAYMENT_STATE.PAID;
  if (normalized && PENDING_PAYMENT_STATUSES.has(normalized)) return CUSTOMER_PAYMENT_STATE.PENDING;
  return CUSTOMER_PAYMENT_STATE.UNAVAILABLE;
}

const STATUS_TO_CUSTOMER = {
  draft: 'confermata', pending_review: 'confermata', approved: 'confermata',
  scheduled: 'in_preparazione', in_progress: 'in_distribuzione', completed: 'completata',
  cancelled: 'annullata', problem: 'problema',
};

export function normalizeCustomerCampaign(row, zones = []) {
  if (!row || typeof row !== 'object') return null;
  const metadata = objectValue(row.metadata);
  const zoneRows = Array.isArray(zones) ? zones : [];
  const zoneNames = zoneRows.map((zone) => nullableText(zone.zone_name ?? zone.zone_label ?? zone.municipality_name)).filter(Boolean);
  return {
    ...row,
    campaignZones: zoneRows,
    titolo: nullableText(row.campaign_name ?? row.title),
    servizio: nullableText(row.service_type),
    stato: STATUS_TO_CUSTOMER[row.status] ?? nullableText(row.status),
    quantita: nullableNumber(row.quantity ?? row.target_quantity),
    totale_euro: nullableNumber(row.total_amount ?? row.estimated_price),
    data_inizio: nullableText(row.start_date ?? row.distribution_start_date),
    data_fine: nullableText(row.end_date ?? row.distribution_end_date),
    zona: nullableText(row.zone_name ?? row.city ?? row.address ?? row.address_input) ?? zoneNames[0] ?? null,
    comuni: zoneNames,
    stato_pagamento: nullableText(metadata.payment_status ?? metadata.stato_pagamento),
    causale_bonifico: nullableText(metadata.payment_reference ?? metadata.causale_bonifico),
    smart_pairing_sconto: nullableNumber(metadata.smart_pairing_discount),
    volantini_distribuiti: nullableNumber(metadata.distributed_quantity ?? metadata.volantini_distribuiti),
    copertura_pct: null, // Dato deprecato/legacy, iniettato a runtime da getFinalCoverage
    selected_dates: Array.isArray(metadata.selected_dates) ? metadata.selected_dates : [],
    pricing: objectValue(metadata.pricing),
  };
}

export function customerValue(value) {
  return value == null || value === '' ? CUSTOMER_DATA_UNAVAILABLE : value;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nullableText(value) {
  if (value == null) return null;
  const clean = String(value).trim();
  return clean || null;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
