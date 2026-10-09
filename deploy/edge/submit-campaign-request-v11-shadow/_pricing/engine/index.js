// P0 pricing engine public surface (pure; not wired into the app or any Edge Function).
export * as catalog from './catalog.js';
export { PRICING_VERSION } from './catalog.js';
export { priceQuote, describeHistoricalPricingSnapshot, repriceHistorical } from './priceQuote.js';
export { zoneBaseCents, zoneRational, flatBaseCents, tierFromResolvedTerritory } from './distribution.js';
export { roundingStrategy, EXACT, LEGACY_FLOAT } from './rounding.js';
export { divHalfUp, percentOf, allocateLargestRemainder, formatCents } from './cents.js';
