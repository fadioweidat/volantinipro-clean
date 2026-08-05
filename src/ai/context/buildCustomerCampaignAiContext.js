import { aiField, unavailableField, AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from "./fieldTypes.js";
import { campaignBelongsToScope, safeCampaign } from "../../ai-foundation/integrations/customer-dashboard/customerDashboardAdapters.mjs";

const SOURCE = "customer_dashboard_snapshot";
const PRICE_SOURCE = "quotePricing_engine_record";
const now = () => new Date().toISOString();
const same = (left, right) => typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();

/**
 * Costruisce il contesto AI Cliente per una singola campagna (o l'elenco
 * recente). `scope` deve arrivare dall'identita' autenticata gia' verificata
 * a monte (mai da un parametro nel messaggio dell'utente) — qui viene
 * comunque ri-controllato: nessuna campagna di un altro cliente puo' entrare
 * nel contesto, anche se lo `snapshot` passato ne contenesse per errore.
 */
export function buildCustomerCampaignAiContext(scope, snapshot) {
  const customerId = scope?.customerId;
  const subjectId = scope?.subjectId;
  if (!customerId || !subjectId) return null;
  if (!snapshot?.authUser?.id || !snapshot?.authUser?.email || !snapshot?.customer?.id) return null;
  if (String(snapshot.customer.id) !== String(customerId) || String(snapshot.authUser.id) !== String(subjectId)) return null;
  if (!same(snapshot.customer.email, snapshot.authUser.email)) return null;

  const owned = (Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [])
    .filter((row) => campaignBelongsToScope(row, snapshot, { customerId }))
    .map(safeCampaign)
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));

  const latest = owned[0] || null;
  const available = !snapshot.loading && !snapshot.error;

  const field = (value, opts) => (available && value !== null && value !== undefined) ? aiField(value, opts) : unavailableField(opts?.source || SOURCE);

  return Object.freeze({
    scope: "customer_campaign",
    generatedAt: now(),
    identity: Object.freeze({ subjectId: String(subjectId), customerId: String(customerId) }),
    latestCampaign: latest ? Object.freeze({
      id: field(latest.id, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      status: field(latest.status, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      paymentStatus: field(latest.paymentStatus, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      service: field(latest.service, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      quantity: field(latest.quantity, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      zone: field(latest.zone, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      startDate: field(latest.startDate, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      endDate: field(latest.endDate, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      // Prezzo: letto dal record campagna (gia' scritto dal motore
      // quotePricing al momento del preventivo/conferma), mai ricalcolato qui.
      totalAmount: field(latest.totalAmount, { type: AI_FIELD_TYPES.REAL, source: PRICE_SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      reportIndicator: field(latest.reportIndicator, { type: AI_FIELD_TYPES.DERIVED, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.MEDIUM }),
      // Foto/documenti: fonte non collegata a questo assistente, coerente con
      // il comportamento gia' esistente (photosReason: "source_not_connected").
      approvedPhotos: unavailableField("proof_photos_source_not_connected"),
      // GPS granulare: non e' una fonte di questo contesto Cliente (evita di
      // esporre dati operatore sensibili nel canale Cliente).
      latestGps: unavailableField("gps_source_not_connected_customer_scope"),
    }) : null,
    recentCampaigns: Object.freeze(owned.slice(0, 5).map((row) => ({
      id: row.id, status: row.status, service: row.service, zone: row.zone, quantity: row.quantity, startDate: row.startDate,
    }))),
    counts: Object.freeze({
      total: field(owned.length, { type: AI_FIELD_TYPES.REAL, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.HIGH }),
      active: field(owned.filter((row) => ["confermata", "in_preparazione", "in_distribuzione"].includes(row.status)).length, { type: AI_FIELD_TYPES.DERIVED, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.MEDIUM }),
      completed: field(owned.filter((row) => ["completata", "report_pronto"].includes(row.status)).length, { type: AI_FIELD_TYPES.DERIVED, source: SOURCE, confidence: AI_CONFIDENCE_LEVELS.MEDIUM }),
    }),
  });
}
