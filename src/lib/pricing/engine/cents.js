// Integer-cent arithmetic. No floating-point accumulation: every amount is a safe
// integer and every division uses explicit round-half-up on exact integer ratios.

export function isSafeNonNegativeInt(n) {
  return Number.isSafeInteger(n) && n >= 0;
}

/** round(num / den) half-up, for safe integers num >= 0, den > 0. */
export function divHalfUp(num, den) {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || num < 0 || den <= 0) {
    throw new RangeError(`divHalfUp: invalid operands ${num}/${den}`);
  }
  const twice = 2 * num + den;
  if (!Number.isSafeInteger(twice)) throw new RangeError('divHalfUp: overflow');
  const d = 2 * den;
  return (twice - (twice % d)) / d; // exact integer floor (twice >= 0)
}

/** pct % of cents, half-up. pct must be an integer percentage 0..100. */
export function percentOf(cents, pct) {
  if (!isSafeNonNegativeInt(cents) || !Number.isInteger(pct) || pct < 0 || pct > 100) {
    throw new RangeError(`percentOf: invalid ${cents} @ ${pct}%`);
  }
  return divHalfUp(cents * pct, 100);
}

/**
 * Split totalCents across weights (non-negative integers, at least one > 0) so the parts
 * sum exactly to totalCents: floor shares, then remaining cents by largest remainder,
 * ties broken by lower index (deterministic).
 */
export function allocateLargestRemainder(totalCents, weights) {
  if (!isSafeNonNegativeInt(totalCents)) throw new RangeError('allocate: invalid total');
  const sum = weights.reduce((s, w) => {
    if (!isSafeNonNegativeInt(w)) throw new RangeError('allocate: invalid weight');
    return s + w;
  }, 0);
  if (sum <= 0) throw new RangeError('allocate: zero weight');
  if (!weights.every(w => Number.isSafeInteger(totalCents * w))) throw new RangeError('allocate: overflow');
  const parts = weights.map(w => { const p = totalCents * w; return (p - (p % sum)) / sum; });
  let rest = totalCents - parts.reduce((s, p) => s + p, 0);
  const order = weights
    .map((w, i) => ({ i, rem: (totalCents * w) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; rest > 0; k += 1, rest -= 1) parts[order[k % order.length].i] += 1;
  return parts;
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Decimal euro string from integer cents (presentation only). */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) return null;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
