// Rounding strategies. The engine is authoritative ONLY with 'exact' (integer cents,
// exact rationals, round half-up). 'legacy-float' replays the current Production float
// arithmetic (roundMoney = Math.round(x * 100) / 100 on euro floats, step by step) and is
// used ONLY to verify structural parity with Production and, in P2 shadow mode, to tell
// float half-cent artefacts apart from real mismatches. It is never authoritative.
import { GRID_CENTS, GRID_QUANTITIES, MINIMUM_CENTS, FLAT_RATE_CENTS_PER_1000 } from './catalog.js';
import { percentOf } from './cents.js';
import { zoneBaseCents, flatBaseCents } from './distribution.js';

const toCents = euros => Math.round(euros * 100);
const roundMoney = v => Math.round(v * 100) / 100;

function legacyZoneEuros(tier, quantity) {
  const p = GRID_CENTS[tier].map(c => c / 100);
  const q = GRID_QUANTITIES;
  const last = q.length - 1;
  let v;
  if (quantity <= q[0]) {
    v = Math.max(0, p[0] + ((p[1] - p[0]) / (q[1] - q[0])) * (quantity - q[0]));
  } else if (quantity >= q[last]) {
    v = p[last] + ((p[last] - p[last - 1]) / (q[last] - q[last - 1])) * (quantity - q[last]);
  } else {
    for (let i = 0; i < last; i += 1) {
      if (quantity >= q[i] && quantity <= q[i + 1]) { v = p[i] + (p[i + 1] - p[i]) * ((quantity - q[i]) / (q[i + 1] - q[i])); break; }
    }
  }
  return roundMoney(Math.max(v, MINIMUM_CENTS[tier] / 100));
}

export const EXACT = Object.freeze({
  name: 'exact',
  zone: zoneBaseCents,
  sumZones: list => list.reduce((s, c) => s + c, 0),
  flat: flatBaseCents,
  percent: percentOf,
  subtotal: (base, discount, surcharge) => base - discount + surcharge,
  total: (subtotal, plan, extras) => subtotal - plan + extras,
});

export const LEGACY_FLOAT = Object.freeze({
  name: 'legacy-float',
  zone: (tier, quantity) => toCents(legacyZoneEuros(tier, quantity)),
  // Production: distributionSubtotal = roundMoney(sum of zone euro prices); baseCost = roundMoney(that)
  sumZones: list => toCents(roundMoney(roundMoney(list.reduce((s, c) => s + c / 100, 0)))),
  flat: (service, quantity) => toCents(roundMoney(quantity * (FLAT_RATE_CENTS_PER_1000[service] / 100 / 1000))),
  percent: (cents, pct) => toCents(roundMoney((cents / 100) * (pct / 100))),
  subtotal: (base, discount, surcharge) => toCents(roundMoney(base / 100 - discount / 100 + surcharge / 100)),
  total: (subtotal, plan, extras) => toCents(roundMoney(subtotal / 100 - plan / 100 + extras / 100)),
});

export function roundingStrategy(name) {
  if (name === undefined || name === 'exact') return EXACT;
  if (name === 'legacy-float') return LEGACY_FLOAT;
  throw new RangeError(`unknown rounding strategy ${name}`);
}
