import { AI_TOOL_NAMES } from "../../contracts.js";
import { AiToolAdapterError } from "../../tools/AiToolRegistry.js";

export const CUSTOMER_TOOL_DATA_STATES = Object.freeze({ AVAILABLE: "available", EMPTY: "empty" });

const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const same = (left, right) => text(left)?.toLowerCase() === text(right)?.toLowerCase();
const metadataOf = (row) => {
  if (row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) return row.metadata;
  if (typeof row?.metadata === "string") { try { return JSON.parse(row.metadata) || {}; } catch { return {}; } }
  return {};
};
const dateValue = (value) => text(value) && !Number.isNaN(Date.parse(value)) ? value : null;
const newestFirst = (left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0);

function campaignBelongsToScope(row, snapshot, scope) {
  const metadata = metadataOf(row);
  const customerId = String(scope.customerId);
  const email = snapshot.authUser?.email;
  if (row?.cliente_id != null && String(row.cliente_id) === customerId) return true;
  return [row?.email, row?.client_email, row?.cliente_email, metadata.client_email, metadata.email, metadata.cliente_email].some((candidate) => same(candidate, email));
}

function safeCampaign(row) {
  const metadata = metadataOf(row);
  const selectedMunicipalities = Array.isArray(metadata.selected_comuni)
    ? metadata.selected_comuni.map(text).filter(Boolean)
    : Array.isArray(row?.comuni ?? row?.comuni_selezionati)
      ? (row.comuni ?? row.comuni_selezionati).map(text).filter(Boolean)
      : [];
  return Object.freeze({
    id: text(row?.id),
    status: text(row?.stato ?? row?.status),
    paymentStatus: text(row?.stato_pagamento ?? row?.payment_status),
    service: text(row?.servizio ?? row?.service_type),
    quantity: number(row?.quantita ?? row?.flyer_quantity ?? metadata.volantini_inseriti),
    zone: text(metadata.zona ?? row?.zona ?? row?.city_name ?? row?.comune_principale),
    municipalities: Object.freeze(selectedMunicipalities),
    startDate: dateValue(row?.data_inizio ?? row?.start_date),
    endDate: dateValue(row?.data_fine ?? row?.end_date),
    totalAmount: number(row?.totale_euro ?? row?.total_amount),
    createdAt: dateValue(row?.created_at),
    updatedAt: dateValue(row?.updated_at),
    hasQuoteSummary: Boolean(metadata.quote_summary),
    reportIndicator: ["completata", "report_pronto"].includes(text(row?.stato ?? row?.status)),
  });
}

function envelope(source, state, data, missing = []) {
  return Object.freeze({ source, state, data, missing: Object.freeze([...missing]) });
}

function validEnvelope(value) {
  return Boolean(value && Object.values(CUSTOMER_TOOL_DATA_STATES).includes(value.state) && typeof value.source === "string" && Array.isArray(value.missing));
}

function rejectForeignIdentity(arguments_, scope) {
  for (const key of ["customerId", "clienteId", "ownerId"]) {
    if (arguments_?.[key] != null && String(arguments_[key]) !== String(scope.customerId)) throw new AiToolAdapterError("access_denied");
  }
}

export class CustomerDashboardDataProvider {
  #snapshot = null;
  update(snapshot) { this.#snapshot = structuredClone(snapshot); }
  clear() { this.#snapshot = null; }
  read() { return this.#snapshot ? structuredClone(this.#snapshot) : null; }
}

function authorizedSnapshot(provider, scope, arguments_) {
  rejectForeignIdentity(arguments_, scope);
  const snapshot = provider.read();
  if (!snapshot) throw new AiToolAdapterError("backend_error");
  if (snapshot.loading) throw new AiToolAdapterError("backend_error");
  if (snapshot.error) throw new AiToolAdapterError("backend_error");
  if (!snapshot.authUser?.id || !snapshot.authUser?.email || !snapshot.customer?.id) throw new AiToolAdapterError("access_denied");
  if (String(snapshot.customer.id) !== String(scope.customerId) || String(snapshot.authUser.id) !== String(scope.subjectId)) throw new AiToolAdapterError("access_denied");
  if (!same(snapshot.customer.email, snapshot.authUser.email)) throw new AiToolAdapterError("access_denied");
  return snapshot;
}

export function createCustomerToolAdapter(provider) {
  return Object.freeze({
    timeoutMs: 2_000,
    validateOutput: validEnvelope,
    async execute({ arguments: arguments_, scope }) {
      const snapshot = authorizedSnapshot(provider, scope, arguments_);
      return envelope(AI_TOOL_NAMES.CUSTOMER, CUSTOMER_TOOL_DATA_STATES.AVAILABLE, Object.freeze({
        id: String(snapshot.customer.id),
        name: text(snapshot.customer.nome ?? snapshot.customer.name),
        email: text(snapshot.customer.email),
      }));
    },
  });
}

function ownedCampaigns(snapshot, scope) {
  return (Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [])
    .filter((row) => campaignBelongsToScope(row, snapshot, scope))
    .map(safeCampaign)
    .sort(newestFirst);
}

export function createCampaignToolAdapter(provider) {
  const operations = new Set(["latest_status", "recent", "latest_quote", "latest_details", "assets"]);
  return Object.freeze({
    timeoutMs: 2_000,
    validateOutput: validEnvelope,
    async execute({ arguments: arguments_, scope }) {
      const snapshot = authorizedSnapshot(provider, scope, arguments_);
      const operation = text(arguments_?.operation);
      if (!operations.has(operation)) throw new AiToolAdapterError("invalid_input");
      const campaigns = ownedCampaigns(snapshot, scope);
      if (operation === "recent") return envelope(AI_TOOL_NAMES.CAMPAIGN, campaigns.length ? CUSTOMER_TOOL_DATA_STATES.AVAILABLE : CUSTOMER_TOOL_DATA_STATES.EMPTY, Object.freeze(campaigns.slice(0, 5)));
      const selected = operation === "latest_quote"
        ? campaigns.find((campaign) => campaign.hasQuoteSummary || ["preventivo", "inviato", "in_preparazione"].includes(campaign.status))
        : campaigns[0];
      if (!selected) return envelope(AI_TOOL_NAMES.CAMPAIGN, CUSTOMER_TOOL_DATA_STATES.EMPTY, null);
      const missing = [
        ["status", selected.status], ["service", selected.service], ["quantity", selected.quantity],
        ["zone", selected.zone], ["startDate", selected.startDate], ["endDate", selected.endDate],
      ].filter(([, value]) => value === null).map(([field]) => field);
      if (operation === "assets") {
        return envelope(AI_TOOL_NAMES.CAMPAIGN, CUSTOMER_TOOL_DATA_STATES.AVAILABLE, Object.freeze({
          campaignId: selected.id,
          reportIndicator: selected.reportIndicator,
          reportBasis: "campaign_status",
          photos: null,
          photosReason: "source_not_connected",
        }), ["photos"]);
      }
      return envelope(AI_TOOL_NAMES.CAMPAIGN, CUSTOMER_TOOL_DATA_STATES.AVAILABLE, selected, missing);
    },
  });
}

export function createDashboardToolAdapter(provider) {
  const operations = new Set(["overview", "missing"]);
  return Object.freeze({
    timeoutMs: 2_000,
    validateOutput: validEnvelope,
    async execute({ arguments: arguments_, scope }) {
      const snapshot = authorizedSnapshot(provider, scope, arguments_);
      const operation = text(arguments_?.operation);
      if (!operations.has(operation)) throw new AiToolAdapterError("invalid_input");
      const campaigns = ownedCampaigns(snapshot, scope);
      const latest = campaigns[0] ?? null;
      const missing = latest ? [
        ["stato campagna", latest.status], ["servizio", latest.service], ["quantita", latest.quantity],
        ["zona", latest.zone], ["data inizio", latest.startDate], ["data fine", latest.endDate],
      ].filter(([, value]) => value === null).map(([label]) => label) : [];
      const data = operation === "missing"
        ? Object.freeze({ campaignId: latest?.id ?? null, fields: Object.freeze(missing), noCampaigns: campaigns.length === 0 })
        : Object.freeze({
            campaignCount: campaigns.length,
            activeCount: campaigns.filter((campaign) => ["confermata", "in_preparazione", "in_distribuzione"].includes(campaign.status)).length,
            completedCount: campaigns.filter((campaign) => ["completata", "report_pronto"].includes(campaign.status)).length,
            pendingPaymentCount: campaigns.filter((campaign) => campaign.paymentStatus && campaign.paymentStatus !== "pagato").length,
            reportIndicatorCount: campaigns.filter((campaign) => campaign.reportIndicator).length,
            latestCampaign: latest,
          });
      return envelope(AI_TOOL_NAMES.DASHBOARD, campaigns.length ? CUSTOMER_TOOL_DATA_STATES.AVAILABLE : CUSTOMER_TOOL_DATA_STATES.EMPTY, data, missing);
    },
  });
}
