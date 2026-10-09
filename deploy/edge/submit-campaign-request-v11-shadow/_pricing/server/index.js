// P1 server-side pricing adapters (pure; consumed by the v11-based shadow Edge Function).
export { adaptSubmissionPayload, normalizeName, PLAN_LABELS, EXTRA_HEADS, ADAPTER_VERSION } from './payloadAdapter.js';
export { resolveTerritories, RESOLVER_VERSION } from './territoryResolver.js';
export { computeShadowPricing, buildShadowRecord, classify, SHADOW_RECORD_VERSION } from './shadowPricing.js';
