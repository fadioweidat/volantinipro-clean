// Shadow pricing: recompute the quote server-side and compare it with what the client
// declared, WITHOUT changing anything about the submission (no rejection, no 409, no
// change to total_amount). Binding decision: shadow mode only.
//
// The record is safe to persist in campaigns.metadata.price_authorization: it holds
// cents, codes, tiers and municipality codes, never names, e-mails, phones or free text.
import { priceQuote, PRICING_VERSION } from '../engine/index.js';
import { adaptSubmissionPayload, ADAPTER_VERSION } from './payloadAdapter.js';
import { resolveTerritories, RESOLVER_VERSION } from './territoryResolver.js';

export const SHADOW_RECORD_VERSION = 1;

const toCents = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : null);

/** Classify a priced comparison (exact server cents vs client total). */
export function classify({ exactPayable, legacyPayable, clientCents }) {
  if (clientCents === null) return 'no_client_total';
  if (exactPayable === clientCents) return 'match';
  if (legacyPayable === clientCents && Math.abs(exactPayable - clientCents) <= 2) return 'rounding_half_cent';
  return 'mismatch';
}

export function buildShadowRecord({ adapted, exact, legacy, evidence, computedAt }) {
  const clientCents = toCents(adapted.request.clientClaims.totalAmount);
  const clientGrossCents = toCents(adapted.request.clientClaims.grandTotal);
  const base = {
    version: SHADOW_RECORD_VERSION, mode: 'shadow', enforcement: 'none', computedAt,
    pricingVersion: PRICING_VERSION, adapterVersion: ADAPTER_VERSION, resolverVersion: RESOLVER_VERSION,
    source: adapted.source, adapterNotes: adapted.notes, status: exact.status,
    pvCount: exact.pvs.length,
    issueCodes: [...new Set(exact.issues.map(i => i.code))].sort(),
    territory: evidence,
    clientTotalCents: clientCents, clientGrossCents,
    ignoredClientClaims: exact.ignoredClientClaims,
  };
  if (exact.status !== 'priced') {
    // Unresolved / invalid: no definitive quote and no payable amount (binding decision 1).
    return { ...base, classification: exact.status, serverPayableCents: null, serverGrossCents: null, deltaCents: null };
  }
  const exactPayable = exact.totals.payableCents;
  const legacyPayable = legacy?.status === 'priced' ? legacy.totals.payableCents : null;
  return {
    ...base,
    classification: classify({ exactPayable, legacyPayable, clientCents }),
    serverPayableCents: exactPayable,
    serverGrossCents: exact.totals.grossQuoteCents,
    serverLegacyFloatPayableCents: legacyPayable,
    deltaCents: clientCents === null ? null : exactPayable - clientCents,
    grossDeltaCents: clientGrossCents === null ? null : exact.totals.grossQuoteCents - clientGrossCents,
    components: {
      baseCents: exact.campaign.baseCents, urgency: { level: exact.campaign.urgency.level, cents: exact.campaign.urgency.cents },
      plan: { code: exact.campaign.plan.code, cents: exact.campaign.plan.cents }, payableExtrasCents: exact.campaign.payableExtrasCents,
      graphicsCents: exact.graphics.cents, printing: { status: exact.printing.status, cents: exact.printing.cents },
      perPv: exact.pvs.map(p => ({ pvId: p.pvId, baseCents: p.baseCents, tiers: p.zones.map(z => z.tier) })),
    },
  };
}

/**
 * Never throws. Returns a shadow record (status 'error' + code on any failure).
 * @param {object} body  raw request body
 * @param {{ lookup: object, now?: () => number }} deps
 */
export async function computeShadowPricing(body, { lookup, now = () => Date.now() } = {}) {
  const computedAt = new Date(now()).toISOString();
  try {
    const adapted = adaptSubmissionPayload(body);
    const { territory, evidence } = await resolveTerritories(adapted.territoryClaims, lookup);
    const input = { request: adapted.request, territory };
    const exact = priceQuote(input);
    const legacy = exact.status === 'priced' ? priceQuote({ ...input, rounding: 'legacy-float' }) : null;
    const record = buildShadowRecord({ adapted, exact, legacy, evidence, computedAt });
    if (!adapted.ok && record.classification !== 'invalid') record.classification = 'unresolved';
    return record;
  } catch (err) {
    return { version: SHADOW_RECORD_VERSION, mode: 'shadow', enforcement: 'none', computedAt, pricingVersion: PRICING_VERSION,
      status: 'error', classification: 'error', errorCode: err && err.name === 'RangeError' ? 'ENGINE_RANGE_ERROR' : 'SHADOW_EXCEPTION' };
  }
}
