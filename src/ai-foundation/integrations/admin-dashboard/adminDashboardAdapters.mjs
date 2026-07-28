import { AI_TOOL_NAMES } from "../../contracts.js";
import { AiToolAdapterError } from "../../tools/AiToolRegistry.js";

export const ADMIN_TOOL_DATA_STATES = Object.freeze({ AVAILABLE: "available", EMPTY: "empty" });

const clean = (value) => typeof value === "string" && value.trim() && value !== "Dato non disponibile" ? value.trim() : null;
const validDate = (value) => clean(value) && !Number.isNaN(Date.parse(value)) ? value : null;
const done = (row) => row.status === "done";
const active = (row) => row.status === "active";
const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };
const isLate = (row) => !done(row) && validDate(row.endDate) && new Date(row.endDate) < startOfToday();
const safeLabel = (value) => {
  const label = clean(value);
  if (!label || label.includes("@") || /(?:\+?39)?[\s.-]*\d(?:[\s.-]*\d){7,}/.test(label)) return "Cliente non nominato";
  return label.slice(0, 80);
};
const reference = (value) => clean(String(value ?? ""))?.slice(0, 8) ?? "n/d";

function safeCampaign(row) {
  const operationalProblems = Number.isFinite(Number(row?.ops?.problems)) ? Math.max(0, Number(row.ops.problems)) : null;
  const rules = [];
  if (isLate(row)) rules.push("fine prevista antecedente a oggi e stato non completato");
  if (row.quality === "incomplete") rules.push(`record incompleto: ${clean(row.qualityReason) ?? "motivo documentato non disponibile"}`);
  if (row.quality === "real" && operationalProblems > 0) rules.push("almeno un problema operativo conteggiato dalla Dashboard");
  return Object.freeze({
    reference: reference(row.id),
    clientLabel: safeLabel(row.client),
    status: clean(row.status),
    service: clean(row.service),
    zone: clean(row.zone),
    quantity: Number(row.qty) > 0 ? Number(row.qty) : null,
    startDate: validDate(row.date),
    endDate: validDate(row.endDate),
    source: clean(row.source),
    quality: clean(row.quality),
    qualityReason: row.quality === "incomplete" ? clean(row.qualityReason) : null,
    operational: Object.freeze({
      groups: Number.isFinite(Number(row?.ops?.groups)) ? Number(row.ops.groups) : null,
      operators: Number.isFinite(Number(row?.ops?.operators)) ? Number(row.ops.operators) : null,
      problems: operationalProblems,
      progress: Number.isFinite(Number(row?.ops?.progress)) ? Number(row.ops.progress) : null,
    }),
    attentionRules: Object.freeze(rules),
  });
}

function envelope(source, data, missing = []) {
  const state = Array.isArray(data) && data.length === 0 ? ADMIN_TOOL_DATA_STATES.EMPTY : ADMIN_TOOL_DATA_STATES.AVAILABLE;
  return Object.freeze({ source, state, data, missing: Object.freeze([...missing]) });
}

function validEnvelope(value) {
  return Boolean(value && Object.values(ADMIN_TOOL_DATA_STATES).includes(value.state) && typeof value.source === "string" && Array.isArray(value.missing));
}

export class AdminDashboardDataProvider {
  #snapshot = null;
  update(snapshot) { this.#snapshot = structuredClone(snapshot); }
  clear() { this.#snapshot = null; }
  read() { return this.#snapshot ? structuredClone(this.#snapshot) : null; }
}

function authorizedSnapshot(provider, scope, arguments_) {
  if (scope?.kind !== "admin" || scope.unrestricted !== true || !scope.subjectId) throw new AiToolAdapterError("access_denied");
  for (const key of ["adminId", "subjectId", "userId"]) {
    if (arguments_?.[key] != null && String(arguments_[key]) !== String(scope.subjectId)) throw new AiToolAdapterError("access_denied");
  }
  if (arguments_?.role != null && !["admin", "super_admin"].includes(String(arguments_.role))) throw new AiToolAdapterError("access_denied");
  const snapshot = provider.read();
  if (!snapshot || snapshot.loading || snapshot.error) throw new AiToolAdapterError("backend_error");
  if (snapshot.availability?.campaigns !== true) throw new AiToolAdapterError("backend_error");
  const identity = snapshot.adminIdentity;
  if (!identity?.user?.id || !["admin", "super_admin"].includes(identity.role) || String(identity.user.id) !== String(scope.subjectId)) throw new AiToolAdapterError("access_denied");
  return snapshot;
}

const nonTestCampaigns = (snapshot) => (Array.isArray(snapshot.campaigns) ? snapshot.campaigns : []).filter((row) => row?.quality !== "test");
const safeCampaigns = (snapshot) => nonTestCampaigns(snapshot).map(safeCampaign);
const realCampaigns = (snapshot) => safeCampaigns(snapshot).filter((row) => row.quality === "real");
const openQuotes = (snapshot) => safeCampaigns(snapshot).filter((row) => row.source === "quote_requests" && !done(row));
const attention = (snapshot) => safeCampaigns(snapshot).filter((row) => row.attentionRules.length > 0);

export function createAdminCampaignToolAdapter(provider) {
  const operations = new Set(["active", "late", "attention", "incomplete", "open_quotes"]);
  return Object.freeze({ timeoutMs: 2_000, validateOutput: validEnvelope, async execute({ arguments: args, scope }) {
    const snapshot = authorizedSnapshot(provider, scope, args);
    const operation = clean(args?.operation);
    if (!operations.has(operation)) throw new AiToolAdapterError("invalid_input");
    const rows = operation === "active" ? realCampaigns(snapshot).filter(active)
      : operation === "late" ? realCampaigns(snapshot).filter(isLate)
        : operation === "attention" ? attention(snapshot)
          : operation === "incomplete" ? safeCampaigns(snapshot).filter((row) => row.quality === "incomplete")
            : openQuotes(snapshot);
    return envelope(AI_TOOL_NAMES.CAMPAIGN, Object.freeze(rows.slice(0, 20)));
  }});
}

export function createAdminCustomerToolAdapter(provider) {
  return Object.freeze({ timeoutMs: 2_000, validateOutput: validEnvelope, async execute({ arguments: args, scope }) {
    const snapshot = authorizedSnapshot(provider, scope, args);
    if (clean(args?.operation) !== "recent") throw new AiToolAdapterError("invalid_input");
    const seen = new Set();
    const customers = realCampaigns(snapshot)
      .sort((left, right) => Date.parse(right.startDate || 0) - Date.parse(left.startDate || 0))
      .filter((campaign) => campaign.clientLabel !== "Cliente non nominato" && !seen.has(campaign.clientLabel) && seen.add(campaign.clientLabel))
      .slice(0, 10)
      .map((campaign) => Object.freeze({ label: campaign.clientLabel, latestCampaignReference: campaign.reference, latestCampaignDate: campaign.startDate }));
    return envelope(AI_TOOL_NAMES.CUSTOMER, Object.freeze(customers));
  }});
}

function missingSources(snapshot) {
  return Object.entries(snapshot.availability ?? {}).filter(([, available]) => available !== true).map(([name]) => name);
}

export function createAdminDashboardToolAdapter(provider) {
  const operations = new Set(["overview", "missing", "kpis"]);
  return Object.freeze({ timeoutMs: 2_000, validateOutput: validEnvelope, async execute({ arguments: args, scope }) {
    const snapshot = authorizedSnapshot(provider, scope, args);
    const operation = clean(args?.operation);
    if (!operations.has(operation)) throw new AiToolAdapterError("invalid_input");
    const real = realCampaigns(snapshot);
    const incomplete = safeCampaigns(snapshot).filter((row) => row.quality === "incomplete");
    const counts = Object.freeze({
      realCampaigns: real.length,
      activeCampaigns: real.filter(active).length,
      lateCampaigns: real.filter(isLate).length,
      attentionCampaigns: attention(snapshot).length,
      incompleteRecords: incomplete.length,
      openQuotes: openQuotes(snapshot).length,
    });
    if (operation === "overview") return envelope(AI_TOOL_NAMES.DASHBOARD, counts, missingSources(snapshot));
    if (operation === "kpis") return envelope(AI_TOOL_NAMES.DASHBOARD, Object.freeze({
      values: counts,
      definitions: Object.freeze({
        activeCampaigns: "record reali con stato normalizzato active",
        lateCampaigns: "record reali non completati con data fine precedente a oggi",
        attentionCampaigns: "unione di ritardi, record incompleti e problemi operativi conteggiati",
        openQuotes: "record non test provenienti da quote_requests e non completati",
      }),
    }), missingSources(snapshot));
    return envelope(AI_TOOL_NAMES.DASHBOARD, Object.freeze({
      unavailableSources: Object.freeze(missingSources(snapshot)),
      incompleteRecords: Object.freeze(incomplete.map((row) => ({ reference: row.reference, reason: row.qualityReason }))),
    }), missingSources(snapshot));
  }});
}
