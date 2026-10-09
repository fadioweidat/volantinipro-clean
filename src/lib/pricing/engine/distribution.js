// Distribution base prices in integer cents (exact rational interpolation, half-up).
import { GRID_CENTS, GRID_QUANTITIES, MINIMUM_CENTS, FLAT_RATE_CENTS_PER_1000, TIER_NAME_ANCHORS, TIER_DENSITY_THRESHOLDS } from './catalog.js';
import { divHalfUp } from './cents.js';

/** Exact zone price as a rational num/den cents (before minimum and rounding). */
export function zoneRational(tier, quantity) {
  const prices = GRID_CENTS[tier];
  if (!prices) throw new RangeError(`unknown tier ${tier}`);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError(`invalid quantity ${quantity}`);
  const q = GRID_QUANTITIES;
  const last = q.length - 1;
  let i;
  if (quantity <= q[0]) i = 0;
  else if (quantity >= q[last]) i = last - 1;
  else i = q.findIndex((x, k) => k < last && quantity >= q[k] && quantity <= q[k + 1]);
  const den = q[i + 1] - q[i];
  return { num: prices[i] * den + (prices[i + 1] - prices[i]) * (quantity - q[i]), den, minimum: MINIMUM_CENTS[tier] };
}

/**
 * D2D zone price: piecewise-linear interpolation between grid points, linear
 * extrapolation outside [1000, 50000] with the nearest segment, then max(price, minimum),
 * rounded half-up to the cent. Mirrors Production calculateDistributionZonePrice, but on
 * exact integers (price = num / den cents).
 */
export function zoneBaseCents(tier, quantity) {
  const { num, den, minimum } = zoneRational(tier, quantity);
  if (num <= minimum * den) return minimum; // includes every extrapolation below 1000
  return divHalfUp(num, den);
}

/** Flat services (h2h/b2b): quantity x rate / 1000, half-up. */
export function flatBaseCents(service, quantity) {
  const rate = FLAT_RATE_CENTS_PER_1000[service];
  if (!rate) throw new RangeError(`no flat rate for ${service}`);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError(`invalid quantity ${quantity}`);
  return divHalfUp(quantity * rate, 1000);
}

/**
 * Tier from a SERVER-RESOLVED territory record (never from client names/densities):
 * explicit name anchor first, then density thresholds. Missing density -> null
 * (the caller reports DENSITY_UNAVAILABLE instead of Production's silent fallback).
 */
export function tierFromResolvedTerritory(record) {
  const name = String(record?.municipalityName || '').trim().toLowerCase();
  if (name && TIER_NAME_ANCHORS[name]) return { tier: TIER_NAME_ANCHORS[name], basis: 'name_anchor' };
  const density = record?.densityPerKm2;
  if (typeof density === 'number' && Number.isFinite(density) && density >= 0) {
    return { tier: TIER_DENSITY_THRESHOLDS.find(t => density >= t.min).tier, basis: 'density' };
  }
  return null;
}
