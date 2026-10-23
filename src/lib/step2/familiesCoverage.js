// Coverage weighted by families, the same rule as analysis-istat (copertura_stimata) and the
// homepage share: families inside / total families of the territories involved. Never a mean
// or a sum of per-zone percentages (a 5% slice of a large quartiere is not worth a whole small
// comune). Null when a zone lacks the figures: no invented value.

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Families of the zone inside the area (radius or selection). */
export function zoneFamiliesInside(zone) {
  const n = Number(zone?.familiesInRadius ?? zone?.families);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Total families of the zone's territory; derived from its own % only if the total is missing. */
export function zoneFamiliesTotal(zone) {
  const total = positive(zone?.familiesTotal);
  if (total != null) return total;
  const inside = zoneFamiliesInside(zone);
  const pct = positive(zone?.coverage);
  return inside != null && pct != null ? (inside * 100) / pct : null;
}

/** sum(families inside) / sum(total families), 0-100 rounded; null if not computable. */
export function familiesWeightedCoverage(zones) {
  const list = Array.isArray(zones) ? zones : [];
  if (!list.length) return null;
  let inside = 0;
  let total = 0;
  for (const zone of list) {
    const i = zoneFamiliesInside(zone);
    const t = zoneFamiliesTotal(zone);
    if (i == null || t == null) return null;
    inside += i;
    total += t;
  }
  return total > 0 ? Math.min(100, Math.round((inside / total) * 100)) : null;
}

/** Share of families: part / whole (e.g. marginal zones on the whole radius). */
export function familiesShare(partZones, wholeZones) {
  const sum = (zones) => {
    let s = 0;
    for (const zone of Array.isArray(zones) ? zones : []) {
      const n = zoneFamiliesInside(zone);
      if (n == null) return null;
      s += n;
    }
    return s;
  };
  const part = sum(partZones);
  const whole = sum(wholeZones);
  return part != null && whole != null && whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : null;
}

/** Share of a comune's families held by the selected zones (whole-territory totals). */
export function familiesShareOfTotal(selectedZones, allZones) {
  const totals = (zones) => {
    const list = Array.isArray(zones) ? zones : [];
    if (!list.length) return null;
    let s = 0;
    for (const zone of list) {
      const t = zoneFamiliesTotal(zone);
      if (t == null) return null;
      s += t;
    }
    return s;
  };
  const part = totals(selectedZones);
  const whole = totals(allZones);
  return part != null && whole != null && whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : null;
}
