// Semantic submission identity for submit-campaign-request idempotency (v2).
//
// The v1 fingerprint (email, city, quantity, amount, zone name:quantity) let a
// retry window return a previous campaign whose persisted snapshot did not
// match the current request: different dates, PV identities, radius/centre,
// address, Smart Pairing evidence or economic lines all collided.
//
// v2 is a canonical, order-independent description of WHAT was requested.
// It is computed from a field whitelist so that volatile values
// (verification timestamps, generatedAt, generation counters, display text)
// never create false differences, and so that the same value can be rebuilt
// from a persisted campaign row: the function stores the raw campaignZones and
// the client metadata verbatim. A candidate campaign is reused only when the
// fingerprint rebuilt FROM THE STORED ROW equals the request's fingerprint, so
// legacy rows (v1 only, or missing metadata) are matched on what they really
// contain, never on a stored hash.
//
// This is request identity only. It does not validate or authorize prices or
// Smart Pairing discounts: snapshot flags such as serverAuthorized are hashed
// as plain data and never trusted.
//
// No imports: the module runs unchanged in Deno (Edge runtime) and Node tests.

export const SUBMISSION_FINGERPRINT_VERSION = 2;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const integer = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const fixed = (value: unknown, digits: number): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
};

const cents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

// `date` columns come back as YYYY-MM-DD; a client may have sent a datetime.
const isoDay = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
};

const dayList = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.map(isoDay).filter((d): d is string => d !== null))].sort() : [];

const textList = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.map(text).filter((t): t is string => t !== null))].sort() : [];

/** Stable JSON: object keys sorted, undefined dropped, non-finite numbers -> null. */
export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): Json => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (isRecord(v)) {
      const out: { [key: string]: Json } = {};
      for (const key of Object.keys(v).sort()) {
        if (v[key] !== undefined) out[key] = normalize(v[key]);
      }
      return out;
    }
    return null;
  };
  return JSON.stringify(normalize(value));
}

// polygon_geojson may arrive as an object or a JSON string; both are the same shape.
function canonicalPolygon(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    try {
      return canonicalJson(JSON.parse(value));
    } catch {
      return canonicalJson(value);
    }
  }
  return canonicalJson(value);
}

// One raw campaignZones item (Step4 payload; also stored verbatim in metadata.campaign_zones).
function canonicalZone(raw: unknown) {
  const z = isRecord(raw) ? raw : {};
  return {
    name: text(z.municipality),
    quantity: integer(z.quantity),
    priority: integer(z.priority),
    lat: fixed(z.lat, 7),
    lng: fixed(z.lng, 7),
    radius_m: integer(z.radius_m),
    territory_type: text(z.territory_type),
    parent_municipality: text(z.parent_municipality),
    address_label: text(z.address_label),
    polygon: canonicalPolygon(z.polygon_geojson),
    pv_id: text(z.campaign_zone_id),
    pv_index: integer(z.campaign_zone_index),
    pv_mode: text(z.campaign_zone_mode),
    store_name: text(z.store_name),
  };
}

// Per-PV Smart Pairing evidence. observedAt/expiresAt/lastCheckedAt/generation
// and the context object (period derived from "today") are volatile and
// excluded; contextSignature carries the context identity.
function canonicalSmartPairing(raw: unknown) {
  if (!isRecord(raw)) return null;
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).filter(isRecord).map((r) => ({
    pv_id: text(r.pvId),
    quantity: integer(r.quantity),
    context_signature: text(r.contextSignature),
    selected_dates: dayList(r.selectedDates),
    selected_valid_dates: dayList(r.selectedValidDates),
    eligibility_status: text(r.eligibilityStatus),
    eligible_percent: fixed(r.eligiblePercent, 4),
    verified: r.verified === true,
    reason: text(r.reason),
    base_cents: integer(r.baseCents),
    discount_cents: integer(r.discountCents),
    net_cents: integer(r.netCents),
  }));
  rows.sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0));
  const totals = isRecord(raw.totals) ? raw.totals : null;
  return {
    version: integer(raw.version),
    contract: text(raw.contract),
    server_authorized: raw.serverAuthorized === true,
    reserves_capacity: raw.reservesCapacity === true,
    rows,
    totals: totals ? {
      quantity: integer(totals.quantity),
      base_cents: integer(totals.baseCents),
      discount_cents: integer(totals.discountCents),
      net_cents: integer(totals.netCents),
    } : null,
  };
}

// Economic lines in cents only; labels/detail strings are display text.
function canonicalPricing(raw: unknown) {
  if (!isRecord(raw)) return null;
  const amount = (v: unknown) => (isRecord(v) ? cents(v.amount) : null);
  return {
    subtotal_cents: cents(raw.subtotal),
    total_cents: cents(raw.total),
    grand_total_cents: cents(raw.grandTotal),
    urgency_surcharge_cents: cents(raw.urgencySurcharge),
    lines: (Array.isArray(raw.lines) ? raw.lines : []).filter(isRecord).map((l) => ({
      quantity: integer(l.quantity), total_cents: cents(l.total),
    })),
    extras: (Array.isArray(raw.extras) ? raw.extras : []).filter(isRecord).map((e) => ({
      label: text(e.label), amount_cents: cents(e.amount), status: text(e.status),
    })),
    discounts: (Array.isArray(raw.discounts) ? raw.discounts : []).filter(isRecord).map((d) => ({
      percentage: fixed(d.percentage, 4), amount_cents: cents(d.amount),
    })),
    printing_line_cents: amount(raw.printingLine),
    graphic_line_cents: amount(raw.graphicLine),
    smart_pairing: canonicalSmartPairing(raw.smart_pairing),
  };
}

export type SubmissionIdentityInput = {
  clientEmail: unknown;
  serviceType: unknown;
  cityName: unknown;
  quantity: unknown;
  totalAmount: unknown;
  startDate: unknown;
  endDate: unknown;
  rawZones: unknown;
  metadata: unknown;
};

/** Canonical semantic description of a submission (request or persisted row). */
export function canonicalSubmission(input: SubmissionIdentityInput) {
  const meta = isRecord(input.metadata) ? input.metadata : {};
  const printing = isRecord(meta.printing) ? meta.printing : {};
  const zones = (Array.isArray(input.rawZones) ? input.rawZones.slice(0, 100) : []).map(canonicalZone);
  zones.sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0));
  return {
    v: SUBMISSION_FINGERPRINT_VERSION,
    client_email: typeof input.clientEmail === "string" ? input.clientEmail.trim().toLowerCase() : null,
    service_type: text(input.serviceType),
    city: text(input.cityName),
    quantity: integer(input.quantity),
    total_cents: cents(input.totalAmount),
    start_date: isoDay(input.startDate),
    end_date: isoDay(input.endDate),
    zones,
    meta: {
      mode: text(meta.mode),
      grand_total_cents: cents(meta.grand_total),
      selected_dates: dayList(meta.selected_dates),
      formato: text(meta.formato),
      materiale: text(meta.materiale),
      piano: text(meta.piano),
      extra_services: textList(meta.extra_services),
      printing_selected: printing.printing_selected === true,
      artwork_selected: printing.artwork_selected === true,
      pricing: canonicalPricing(meta.pricing),
      smart_pairing: canonicalSmartPairing(meta.smart_pairing),
    },
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeSemanticFingerprint(input: SubmissionIdentityInput): Promise<string> {
  return `v${SUBMISSION_FINGERPRINT_VERSION}:${await sha256Hex(canonicalJson(canonicalSubmission(input)))}`;
}

/** Rebuilds the identity of a persisted campaigns row (legacy rows included). */
export async function fingerprintFromStoredCampaign(row: unknown): Promise<string | null> {
  if (!isRecord(row)) return null;
  const metadata = isRecord(row.metadata) ? row.metadata : null;
  // Only rows this function created can be idempotent hits.
  if (!metadata || metadata.is_public_request !== true) return null;
  return computeSemanticFingerprint({
    clientEmail: row.client_email,
    serviceType: row.service_type,
    cityName: row.city,
    quantity: row.quantity,
    totalAmount: row.total_amount,
    startDate: row.start_date,
    endDate: row.end_date,
    rawZones: metadata.campaign_zones,
    metadata,
  });
}
