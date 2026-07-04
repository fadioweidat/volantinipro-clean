const EMPTY = "Dato non disponibile";

const MONEY_FIELDS = [
  "total_budget",
  "total_amount",
  "amount",
  "importo",
  "totale",
  "total",
  "price",
  "prezzo",
  "budget",
  "preventivo",
  "costo",
];

const COST_FIELDS = ["cost", "costo", "total_cost", "costo_totale", "supplier_cost", "operating_cost"];
const VAT_FIELDS = ["vat", "iva", "vat_amount", "importo_iva", "tax_amount"];
const EXTRA_FIELDS = ["extras", "extra", "servizi_extra", "additional_services", "metadata.extras"];

export const QUOTE_STATUS_LABELS = {
  draft: "Bozza",
  sent: "Inviato",
  viewed: "Visualizzato",
  accepted: "Accettato",
  refused: "Rifiutato",
  expired: "Scaduto",
  cancelled: "Annullato",
  converted: "Convertito in ordine",
  pending: "In attesa",
};

export const PAYMENT_STATUS_LABELS = {
  due: "Da pagare",
  pending: "In attesa",
  authorized: "Autorizzato",
  paid: "Incassato",
  partial: "Parziale",
  overdue: "Scaduto",
  refunded: "Rimborsato",
  disputed: "Contestato",
  cancelled: "Annullato",
};

export function buildEconomicDashboard({
  campaigns = [],
  quoteRows = [],
  paymentRows = [],
  invoiceRows = [],
  supplierRows = [],
  activityRows = [],
  availability = {},
} = {}) {
  const quoteRecords = uniqueById([
    ...campaigns.map((row) => normalizeQuote(row, row.source || "campaigns")),
    ...quoteRows.map((row) => normalizeQuote(row, row.source || "quote_requests")),
  ]).filter(Boolean);

  const paymentRecords = paymentRows.map((row) => normalizePayment(row)).filter(Boolean);
  const invoiceRecords = invoiceRows.map((row) => normalizeInvoice(row)).filter(Boolean);
  const supplierRecords = supplierRows.map((row) => normalizeSupplier(row)).filter(Boolean);

  const revenueQuotes = quoteRecords.filter((item) => Number.isFinite(item.total));
  const now = new Date();
  const revenue = {
    today: sumByPeriod(revenueQuotes, "today", now),
    week: sumByPeriod(revenueQuotes, "week", now),
    month: sumByPeriod(revenueQuotes, "month", now),
    year: sumByPeriod(revenueQuotes, "year", now),
    total: revenueQuotes.reduce((sum, item) => sum + item.total, 0),
    available: revenueQuotes.length > 0,
    reason: revenueQuotes.length ? "" : "Nessun campo economico configurato nel database",
  };

  const totalCosts = sumAvailable(quoteRecords.map((item) => item.cost));
  const margin = Number.isFinite(totalCosts)
    ? { value: revenue.total - totalCosts, available: revenue.available, reason: "" }
    : { value: null, available: false, reason: "Campi costo non configurati nel database" };

  const statuses = countStatuses(quoteRecords, "status", Object.keys(QUOTE_STATUS_LABELS));
  const paymentStatuses = paymentRecords.length
    ? countStatuses(paymentRecords, "status", Object.keys(PAYMENT_STATUS_LABELS))
    : Object.fromEntries(Object.keys(PAYMENT_STATUS_LABELS).map((key) => [key, 0]));

  return {
    quotes: quoteRecords,
    payments: paymentRecords,
    invoices: invoiceRecords,
    suppliers: supplierRecords,
    activities: normalizeActivities(activityRows),
    revenue,
    margin,
    stats: {
      quoteStatuses: statuses,
      paymentStatuses,
      refunds: paymentRecords.filter((item) => item.status === "refunded").reduce((sum, item) => sum + (item.amount || 0), 0),
      credits: sumAvailable(invoiceRecords.map((item) => item.credit)),
      debts: sumAvailable(supplierRecords.map((item) => item.debt)),
      averageOrder: revenueQuotes.length ? revenue.total / revenueQuotes.length : null,
      conversionRate: quoteRecords.length ? (statuses.accepted + statuses.converted) / quoteRecords.length : null,
      topClients: buildTopClients(quoteRecords),
      topServices: buildTopServices(quoteRecords),
    },
    availability: {
      quotes: availability.quotes || quoteRecords.length > 0,
      payments: availability.payments || false,
      invoices: availability.invoices || false,
      suppliers: availability.suppliers || false,
      activities: availability.activities || false,
    },
  };
}

export function normalizeQuote(row, source = "campaigns") {
  if (!row) return null;
  const raw = row.raw || row;
  const metadata = raw.metadata || row.metadata || {};
  const total = readMoney(raw, row);
  const qty = readNumber(raw.total_flyers, raw.flyer_quantity, raw.qty, raw.quantita, raw.quantity, row.qty);
  const issuedAt = firstDate(raw.issue_date, raw.issued_at, raw.created_at, row.date, raw.updated_at);
  const expiresAt = firstDate(raw.expiry_date, raw.expires_at, raw.valid_until, raw.scadenza, raw.due_date);
  const client = firstText(raw.client_name, raw.customer_name, raw.nome_cliente, raw.nome, raw.email, row.client);
  const zone = firstText(raw.zone_name, raw.city_name, raw.zone_label, raw.zona, raw.zone, raw.municipality_name, row.zone);
  const service = normalizeService(firstText(raw.service_type, raw.campaign_type, raw.type, raw.servizio, raw.selected_service, raw.service, row.service));
  const status = normalizeQuoteStatus(firstText(raw.quote_status, raw.status, raw.stato, raw.state, row.rawStatus, row.status));
  const vat = readNumber(...VAT_FIELDS.map((field) => readPath(raw, field)));
  const cost = readNumber(...COST_FIELDS.map((field) => raw[field]));
  const extras = firstText(...EXTRA_FIELDS.map((field) => readPath(raw, field)), metadata.extra_services, metadata.extras);
  const version = firstText(raw.version, raw.quote_version, raw.revision, metadata.version) || "n/d";
  const operator = firstText(raw.operator_name, raw.operatore, raw.created_by, raw.admin_email, metadata.operator) || "n/d";
  const history = Array.isArray(raw.history) ? raw.history : Array.isArray(metadata.history) ? metadata.history : [];

  return {
    id: firstText(raw.quote_id, raw.preventivo_id, raw.id, row.id) || "n/d",
    source,
    client: client || EMPTY,
    service,
    serviceLabel: serviceLabel(service),
    zone: zone || EMPTY,
    qty: Number.isFinite(qty) ? qty : null,
    price: Number.isFinite(total) && Number.isFinite(qty) && qty > 0 ? total / qty : null,
    extras: formatExtras(extras),
    vat: Number.isFinite(vat) ? vat : null,
    total: Number.isFinite(total) ? total : null,
    cost: Number.isFinite(cost) ? cost : null,
    issuedAt,
    expiresAt,
    version,
    history,
    operator,
    status,
    statusLabel: QUOTE_STATUS_LABELS[status] || QUOTE_STATUS_LABELS.pending,
    rawStatus: firstText(raw.quote_status, raw.status, raw.stato, raw.state, row.rawStatus) || "",
    paymentStatus: normalizePaymentStatus(firstText(raw.payment_status, raw.stato_pagamento, raw.payment_state)),
  };
}

export function normalizePayment(row) {
  if (!row) return null;
  const amount = readNumber(row.amount, row.importo, row.totale, row.total, row.paid_amount, row.payment_amount);
  return {
    id: firstText(row.id, row.payment_id, row.pagamento_id) || "n/d",
    quoteId: firstText(row.quote_id, row.preventivo_id, row.campaign_id) || "n/d",
    client: firstText(row.client_name, row.customer_name, row.nome_cliente, row.email) || EMPTY,
    amount: Number.isFinite(amount) ? amount : null,
    residual: readNumber(row.residual_amount, row.importo_residuo, row.remaining_amount),
    method: normalizePaymentMethod(firstText(row.method, row.metodo, row.payment_method)),
    status: normalizePaymentStatus(firstText(row.status, row.stato, row.payment_status)),
    date: firstDate(row.paid_at, row.payment_date, row.data_pagamento, row.created_at),
    dueDate: firstDate(row.due_date, row.scadenza, row.expires_at),
  };
}

export function normalizeInvoice(row) {
  if (!row) return null;
  const amount = readNumber(row.amount, row.importo, row.totale, row.total);
  const credit = normalizePaymentStatus(firstText(row.status, row.stato)) === "paid" ? 0 : amount;
  return {
    id: firstText(row.id, row.invoice_id, row.fattura_id) || "n/d",
    number: firstText(row.invoice_number, row.numero_fattura, row.number) || "n/d",
    client: firstText(row.client_name, row.customer_name, row.nome_cliente, row.email) || EMPTY,
    amount: Number.isFinite(amount) ? amount : null,
    vat: readNumber(row.vat, row.iva, row.vat_amount),
    date: firstDate(row.date, row.data, row.created_at),
    dueDate: firstDate(row.due_date, row.scadenza),
    paymentId: firstText(row.payment_id, row.pagamento_id) || "n/d",
    pdf: firstText(row.pdf_url, row.pdf_path, row.file_url) || "",
    credit: Number.isFinite(credit) ? credit : null,
  };
}

export function normalizeSupplier(row) {
  if (!row) return null;
  const due = readNumber(row.amount_due, row.importo_dovuto, row.debt, row.debito, row.totale);
  const paid = readNumber(row.amount_paid, row.importo_pagato, row.paid);
  return {
    id: firstText(row.id, row.supplier_id, row.fornitore_id) || "n/d",
    name: firstText(row.name, row.nome, row.supplier_name, row.fornitore) || EMPTY,
    due: Number.isFinite(due) ? due : null,
    paid: Number.isFinite(paid) ? paid : null,
    debt: Number.isFinite(due) ? Math.max(0, due - (Number.isFinite(paid) ? paid : 0)) : null,
    dueDate: firstDate(row.due_date, row.scadenza),
  };
}

export function buildEconomicCsv(records) {
  const rows = [
    ["id", "cliente", "servizio", "comune", "quantita", "prezzo_unitario", "extra", "iva", "totale", "emissione", "scadenza", "versione", "operatore", "stato"],
    ...records.map((item) => [
      item.id,
      item.client,
      item.serviceLabel,
      item.zone,
      item.qty ?? "",
      item.price ?? "",
      item.extras,
      item.vat ?? "",
      item.total ?? "",
      item.issuedAt || "",
      item.expiresAt || "",
      item.version,
      item.operator,
      item.statusLabel,
    ]),
  ];
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function euro(value) {
  return Number.isFinite(value) ? `€${Number(value).toLocaleString("it-IT", { maximumFractionDigits: 2 })}` : EMPTY;
}

export function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : EMPTY;
}

export function matchesEconomicSearch(item, query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return true;
  return [item.id, item.client, item.serviceLabel, item.zone, item.total, item.statusLabel, item.operator]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase()
    .includes(text);
}

function uniqueById(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row) return false;
    const key = `${row.source || "row"}:${row.id || JSON.stringify(row).slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readMoney(...rows) {
  for (const row of rows) {
    if (!row) continue;
    const direct = readNumber(...MONEY_FIELDS.map((field) => readPath(row, field)));
    if (Number.isFinite(direct)) return direct;
    const metadata = row.metadata || {};
    const meta = readNumber(...MONEY_FIELDS.map((field) => readPath(metadata, field)));
    if (Number.isFinite(meta)) return meta;
  }
  return null;
}

function readNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = typeof value === "number" ? value : Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function readPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split(".").reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
}

function firstText(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (Array.isArray(value) || typeof value === "object") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function firstDate(...values) {
  const text = firstText(...values);
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? String(text).slice(0, 10) : date.toISOString().slice(0, 10);
}

function normalizeService(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("h2h") || text.includes("hand")) return "h2h";
  if (text.includes("b2b") || text.includes("business")) return "b2b";
  if (text.includes("door") || text.includes("d2d")) return "d2d";
  return text || "d2d";
}

function serviceLabel(value) {
  if (value === "h2h") return "Hand to Hand";
  if (value === "b2b") return "Distribuzione Business";
  return "Door to Door";
}

function normalizeQuoteStatus(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("draft") || text.includes("bozza")) return "draft";
  if (text.includes("view") || text.includes("visual")) return "viewed";
  if (text.includes("accept") || text.includes("accett") || text.includes("confirm") || text.includes("confer")) return "accepted";
  if (text.includes("refus") || text.includes("rifiut")) return "refused";
  if (text.includes("expir") || text.includes("scad")) return "expired";
  if (text.includes("cancel") || text.includes("annull")) return "cancelled";
  if (text.includes("convert") || text.includes("ordine")) return "converted";
  if (text.includes("sent") || text.includes("inviat")) return "sent";
  return "pending";
}

function normalizePaymentStatus(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("author") || text.includes("autoriz")) return "authorized";
  if (text.includes("paid") || text.includes("incass") || text.includes("pagato") || text.includes("ricev")) return "paid";
  if (text.includes("partial") || text.includes("parzial")) return "partial";
  if (text.includes("overdue") || text.includes("scad")) return "overdue";
  if (text.includes("refund") || text.includes("rimbors")) return "refunded";
  if (text.includes("disput") || text.includes("contest")) return "disputed";
  if (text.includes("cancel") || text.includes("annull")) return "cancelled";
  if (text.includes("pending") || text.includes("attesa")) return "pending";
  return text ? "due" : "pending";
}

function normalizePaymentMethod(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("bonifico")) return "Bonifico";
  if (text.includes("card") || text.includes("carta")) return "Carta";
  if (text.includes("paypal")) return "PayPal";
  if (text.includes("stripe")) return "Stripe";
  if (text.includes("cash") || text.includes("contanti")) return "Contanti";
  return value || "Altro";
}

function formatExtras(value) {
  if (!value) return "n/d";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "n/d";
  if (typeof value === "object") return Object.keys(value).filter((key) => value[key]).join(", ") || "n/d";
  return String(value);
}

function sumByPeriod(records, period, now) {
  return records.filter((item) => matchesPeriod(item.issuedAt, period, now)).reduce((sum, item) => sum + item.total, 0);
}

function matchesPeriod(value, period, now) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return false;
  if (period === "today") return date >= startOfDay(now);
  if (period === "week") return date >= addDays(now, -7);
  if (period === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === "year") return date.getFullYear() === now.getFullYear();
  return true;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function countStatuses(records, field, keys) {
  const out = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const record of records) {
    const key = record[field] || "pending";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function sumAvailable(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) : null;
}

function buildTopClients(records) {
  const map = new Map();
  for (const item of records) {
    const key = item.client || EMPTY;
    const prev = map.get(key) || { client: key, total: 0, quotes: 0 };
    map.set(key, { ...prev, total: prev.total + (item.total || 0), quotes: prev.quotes + 1 });
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 8);
}

function buildTopServices(records) {
  const map = new Map();
  for (const item of records) {
    const key = item.serviceLabel || EMPTY;
    const prev = map.get(key) || { service: key, total: 0, quotes: 0 };
    map.set(key, { ...prev, total: prev.total + (item.total || 0), quotes: prev.quotes + 1 });
  }
  return [...map.values()].sort((a, b) => b.quotes - a.quotes);
}

function normalizeActivities(rows) {
  return rows.slice(0, 20).map((row) => ({
    id: firstText(row.id, row.event_id) || cryptoFallbackId(row),
    action: firstText(row.action, row.event_type, row.type, row.message) || "Attivita registrata",
    user: firstText(row.user_email, row.actor_email, row.email, row.admin_email, row.user_id) || "Utente non disponibile",
    date: firstDate(row.created_at, row.timestamp, row.date),
  }));
}

function cryptoFallbackId(row) {
  return String(JSON.stringify(row)).slice(0, 40);
}
