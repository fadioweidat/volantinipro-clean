// P0 server-authoritative pricing engine. Pure, deterministic, integer cents.
// No database, browser, Supabase or network access. NOT wired into Step1/3/4, the PDF,
// the payload or any Edge Function (that is P1, separate approval).
//
// Input contract (all plain data):
//   A. request        customer-requested configuration (claims to validate)
//   B. territory      server-resolved territory records keyed by territoryRef
//   C. authorizations server-issued pairing eligibility (P0: mode 'disabled' by default)
//   D. catalog        versioned tariff catalog (defaults to the P0 catalog)
// Output E: an immutable quote with per-PV / per-date / per-component breakdown, payable
// vs quoted-not-payable vs indicative totals, issues, and the client claims that were
// ignored. Client totals, percentages, densities and verification flags never change it.
import * as P0 from './catalog.js';
import { percentOf, allocateLargestRemainder, deepFreeze } from './cents.js';
import { tierFromResolvedTerritory } from './distribution.js';
import { roundingStrategy } from './rounding.js';
import { calculatePrintPrice } from '../printPricing.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = d => typeof d === 'string' && DATE_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const isQuantity = (q, max) => Number.isSafeInteger(q) && q > 0 && q <= max;

function issue(list, severity, code, path, detail) {
  list.push({ severity, code, path, ...(detail === undefined ? {} : { detail }) });
}

/**
 * @param {{request: object, territory?: object, authorizations?: object, catalog?: object}} input
 */
export function priceQuote({ request, territory = {}, authorizations = {}, catalog = P0, rounding } = {}) {
  const R = roundingStrategy(rounding);
  const issues = [];
  const ignoredClientClaims = [];
  const r = request && typeof request === 'object' ? request : {};

  // ---- A. validate the requested configuration -------------------------------------
  const service = r.service;
  if (!catalog.SERVICES.includes(service)) issue(issues, 'error', 'INVALID_SERVICE', 'service', service);
  const urgency = r.urgency ?? 'normal';
  if (!Object.hasOwn(catalog.URGENCY_PCT, urgency)) issue(issues, 'error', 'INVALID_URGENCY', 'urgency', urgency);
  const plan = r.plan ?? 'single';
  if (!Object.hasOwn(catalog.PLAN_PCT, plan)) issue(issues, 'error', 'UNKNOWN_PLAN_CODE', 'plan', plan);

  const pvsIn = Array.isArray(r.pvs) ? r.pvs : [];
  if (pvsIn.length === 0) issue(issues, 'error', 'NO_POINTS_OF_SALE', 'pvs');
  if (pvsIn.length > catalog.LIMITS.maxPvs) issue(issues, 'error', 'TOO_MANY_POINTS_OF_SALE', 'pvs', pvsIn.length);
  const pvIds = pvsIn.map(p => p?.pvId);
  if (pvIds.some(id => typeof id !== 'string' || !id.trim())) issue(issues, 'error', 'INVALID_PV_ID', 'pvs');
  if (new Set(pvIds).size !== pvIds.length) issue(issues, 'error', 'DUPLICATE_PV_ID', 'pvs');

  // Client claims are recorded, never used (informational only).
  const claims = r.clientClaims && typeof r.clientClaims === 'object' ? r.clientClaims : {};
  for (const key of Object.keys(claims).sort()) ignoredClientClaims.push(key);

  // ---- B. per-PV distribution base -------------------------------------------------
  const pvs = [];
  for (const [i, pv] of pvsIn.entries()) {
    const path = `pvs[${i}]`;
    const out = { pvId: pv?.pvId ?? null, quantity: null, zones: [], baseCents: null, dates: [], pairing: { discountCents: 0, allocation: 'none' } };
    if (service === 'd2d') {
      const zones = Array.isArray(pv?.zones) ? pv.zones : [];
      if (zones.length === 0 || zones.length > catalog.LIMITS.maxZonesPerPv) issue(issues, 'error', 'INVALID_ZONES', `${path}.zones`);
      let qty = 0; let base = 0; let complete = zones.length > 0;
      for (const [k, z] of zones.entries()) {
        const zpath = `${path}.zones[${k}]`;
        for (const forged of ['density', 'densita', 'densityPerKm2', 'density_per_km2', 'tier', 'price', 'priceCents']) {
          if (z && Object.hasOwn(z, forged)) ignoredClientClaims.push(`${zpath}.${forged}`);
        }
        if (!isQuantity(z?.quantity, catalog.LIMITS.maxQuantityPerZone)) { issue(issues, 'error', 'INVALID_QUANTITY', `${zpath}.quantity`, z?.quantity); complete = false; continue; }
        const rec = territory[z?.territoryRef];
        if (!rec || rec.status !== 'resolved') {
          issue(issues, 'unresolved', 'TERRITORY_UNRESOLVED', `${zpath}.territoryRef`, rec?.reason ?? 'not resolved by server');
          out.zones.push({ territoryRef: z?.territoryRef ?? null, quantity: z.quantity, tier: null, baseCents: null });
          qty += z.quantity; complete = false; continue;
        }
        const t = tierFromResolvedTerritory(rec);
        if (!t) {
          issue(issues, 'unresolved', 'DENSITY_UNAVAILABLE', `${zpath}.territoryRef`, z.territoryRef);
          out.zones.push({ territoryRef: z.territoryRef, quantity: z.quantity, tier: null, baseCents: null });
          qty += z.quantity; complete = false; continue;
        }
        const cents = R.zone(t.tier, z.quantity);
        out.zones.push({ territoryRef: z.territoryRef, quantity: z.quantity, tier: t.tier, tierBasis: t.basis,
          evidence: { source: rec.source ?? null, municipalityCode: rec.municipalityCode ?? null, nilCode: rec.nilCode ?? null }, baseCents: cents });
        qty += z.quantity; base += cents;
      }
      out.quantity = qty;
      if (pv && Object.hasOwn(pv, 'quantity') && pv.quantity !== qty) issue(issues, 'error', 'PV_QUANTITY_MISMATCH', `${path}.quantity`, { claimed: pv.quantity, zones: qty });
      out.baseCents = complete ? base : null;
    } else if (catalog.SERVICES.includes(service)) {
      if (!isQuantity(pv?.quantity, catalog.LIMITS.maxQuantityPerZone)) issue(issues, 'error', 'INVALID_QUANTITY', `${path}.quantity`, pv?.quantity);
      else out.quantity = pv.quantity;
    }
    // Dates (allocation basis for pairing). Missing dates are allowed (no pairing).
    const dates = Array.isArray(pv?.dates) ? pv.dates : [];
    const seen = new Set();
    for (const [k, d] of dates.entries()) {
      if (!isValidDate(d?.date) || seen.has(d.date)) issue(issues, 'error', 'INVALID_DATE', `${path}.dates[${k}]`, d?.date);
      seen.add(d?.date);
    }
    out.dates = dates.map(d => ({ date: d?.date ?? null, quantity: Number.isSafeInteger(d?.quantity) ? d.quantity : null }));
    pvs.push(out);
  }

  // Flat services: production prices the campaign total (one rounding), then the base is
  // attributed to PVs by quantity (largest remainder) for per-PV evidence and pairing.
  if (service !== 'd2d' && catalog.SERVICES.includes(service) && pvs.every(p => p.quantity)) {
    const totalQty = pvs.reduce((s, p) => s + p.quantity, 0);
    const total = R.flat(service, totalQty);
    const parts = allocateLargestRemainder(total, pvs.map(p => p.quantity));
    pvs.forEach((p, k) => { p.baseCents = parts[k]; });
  }

  // ---- extras ------------------------------------------------------------------------
  const extrasIn = Array.isArray(r.extras) ? r.extras : [];
  const requested = new Map(); // canonical id -> {pvIds|null, aliases:Set}
  let graphicsFromLegacyAlias = false;
  for (const [i, e] of extrasIn.entries()) {
    const raw = typeof e === 'string' ? e : e?.id;
    const path = `extras[${i}]`;
    if (e && typeof e === 'object') for (const forged of ['price', 'priceCents', 'amount']) if (Object.hasOwn(e, forged)) ignoredClientClaims.push(`${path}.${forged}`);
    if (typeof raw !== 'string') { issue(issues, 'error', 'INVALID_EXTRA', path); continue; }
    if (catalog.NON_EXTRA_MARKERS[raw]) { issue(issues, 'info', 'EXTRA_MARKER_IGNORED', path, { id: raw, drivenBy: catalog.NON_EXTRA_MARKERS[raw] }); continue; }
    if (catalog.GRAPHICS.aliases.includes(raw)) { graphicsFromLegacyAlias = true; issue(issues, 'info', 'LEGACY_GRAPHICS_ALIAS_MAPPED', path, { id: raw, to: 'graphics', cents: catalog.GRAPHICS.cents }); continue; }
    const id = catalog.EXTRAS[raw] ? raw : catalog.EXTRA_ALIASES[raw];
    if (!id || !catalog.EXTRAS[id]) { issue(issues, 'error', 'UNKNOWN_EXTRA', path, raw); continue; }
    const pvScope = e && typeof e === 'object' && Array.isArray(e.pvIds) ? e.pvIds : null;
    if (pvScope && pvScope.some(id2 => !pvIds.includes(id2))) { issue(issues, 'error', 'EXTRA_UNKNOWN_PV', `${path}.pvIds`, pvScope); continue; }
    const prev = requested.get(id);
    requested.set(id, { pvIds: prev?.pvIds === null || pvScope === null ? null : [...new Set([...(prev?.pvIds ?? []), ...pvScope])], raw: [...(prev?.raw ?? []), raw] });
  }
  const extras = [];
  const hasControlPro = requested.has('control_pro');
  for (const [id, sel] of [...requested.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const item = catalog.EXTRAS[id];
    const units = item.scope === 'pv' ? (sel.pvIds ? sel.pvIds.length : pvs.length) : 1;
    const line = { id, requestedAs: sel.raw, scope: item.scope, status: item.status, unitCents: item.cents, units, cents: null, payable: item.payable, pvIds: item.scope === 'pv' ? (sel.pvIds ?? pvs.map(p => p.pvId)) : null };
    if (hasControlPro && catalog.EXTRAS.control_pro.includes.includes(id)) {
      line.cents = 0; line.includedIn = 'control_pro'; extras.push(line); continue;
    }
    if (item.status === 'blocked') { issue(issues, 'unresolved', 'EXTRA_DECISION_PENDING', `extras.${id}`, item.evidence); extras.push(line); continue; }
    if (item.status === 'legacy_unpriced') { issue(issues, 'unresolved', 'LEGACY_EXTRA_NOT_IN_CONTRACT', `extras.${id}`, item.evidence); extras.push(line); continue; }
    if (item.services && !item.services.includes(service)) { issue(issues, 'error', 'EXTRA_NOT_AVAILABLE_FOR_SERVICE', `extras.${id}`, service); extras.push(line); continue; }
    if (item.scope === 'ambiguous' && pvs.length > 1) { issue(issues, 'unresolved', 'EXTRA_SCOPE_UNDECIDED', `extras.${id}`, item.evidence); extras.push(line); continue; }
    line.cents = item.cents * units;
    extras.push(line);
  }

  // ---- graphics (single canonical price, once per campaign, quoted but not payable) --
  const g = r.graphics && typeof r.graphics === 'object' ? r.graphics : {};
  const graphicsSelected = Boolean((g.required && g.selected) || graphicsFromLegacyAlias);
  const graphics = { cents: graphicsSelected ? catalog.GRAPHICS.cents : 0, selected: graphicsSelected, payable: catalog.GRAPHICS.payable,
    source: graphicsSelected ? (g.required && g.selected ? 'artwork_selection' : 'legacy_alias') : null };

  // ---- printing (indicative, never payable) ----------------------------------------
  let printing = { status: 'NOT_SELECTED', cents: null, payable: false, indicative: true };
  const totalQuantity = pvs.every(p => Number.isSafeInteger(p.quantity)) ? pvs.reduce((s, p) => s + p.quantity, 0) : null;
  if (r.printing && r.printing.enabled !== false) {
    const res = calculatePrintPrice({ quantity: totalQuantity ?? 0, printFormat: r.printing.format, grammage: r.printing.grammage, sides: r.printing.sides,
      color: r.printing.color, paperType: r.printing.paperType, fold: r.printing.fold, orientation: r.printing.orientation, urgency, enabled: true });
    printing = { status: res.priceStatus, cents: res.customerPrice == null ? null : Math.round(res.customerPrice * 100), payable: false, indicative: true, reviewReasons: res.reviewReasons ?? [] };
  }

  // ---- C. pairing (verified PV x date portions only) ---------------------------------
  const pairingMode = authorizations?.pairing?.mode ?? 'disabled';
  const eligibility = Array.isArray(authorizations?.pairing?.eligibility) ? authorizations.pairing.eligibility : [];
  const now = authorizations?.pairing?.now;
  for (const p of pvs) {
    p.pairing = { discountCents: 0, allocation: 'none' };
    if (p.baseCents == null) continue;
    const dated = p.dates.filter(d => d.date);
    if (dated.length === 0) { p.dates = []; continue; }
    const reliable = dated.every(d => Number.isSafeInteger(d.quantity) && d.quantity > 0) && dated.reduce((s, d) => s + d.quantity, 0) === p.quantity;
    if (!reliable) {
      p.pairing.allocation = 'unreliable';
      p.dates = dated.map(d => ({ ...d, allocatedBaseCents: null, pairing: { pct: 0, discountCents: 0, reason: 'allocation_unreliable' } }));
      if (pairingMode !== 'disabled') issue(issues, 'warning', 'PAIRING_ALLOCATION_UNRELIABLE', `pvs.${p.pvId}.dates`, 'date quantities missing or not summing to the PV quantity: zero pairing for this PV');
      continue;
    }
    const parts = allocateLargestRemainder(p.baseCents, dated.map(d => d.quantity));
    p.pairing.allocation = 'proportional_to_date_quantity';
    p.dates = dated.map((d, k) => {
      const portion = { ...d, allocatedBaseCents: parts[k], pairing: { pct: 0, discountCents: 0, reason: pairingMode === 'disabled' ? 'pairing_disabled' : 'not_verified' } };
      if (pairingMode !== 'verified-only') return portion;
      const matches = eligibility.filter(e => e?.pvId === p.pvId && e?.date === d.date);
      if (matches.length !== 1) { if (matches.length > 1) portion.pairing.reason = 'ambiguous_eligibility'; return portion; }
      const e = matches[0];
      const cap = catalog.PAIRING_CAP_PCT[e.matchType];
      const ok = e.verification?.verified === true && e.verification?.issuer === 'server' && e.pricingVersion === catalog.PRICING_VERSION
        && Number.isInteger(e.discountPct) && cap !== undefined && e.discountPct > 0 && e.discountPct <= cap
        && Number.isSafeInteger(now) && Number.isSafeInteger(e.expiresAt) && now < e.expiresAt
        && p.zones.some(z => z.territoryRef === e.territoryRef);
      if (!ok) { portion.pairing.reason = 'eligibility_rejected'; return portion; }
      const discount = percentOf(parts[k], e.discountPct);
      portion.pairing = { pct: e.discountPct, discountCents: discount, reason: 'verified', matchType: e.matchType };
      return portion;
    });
    p.pairing.discountCents = p.dates.reduce((s, d) => s + d.pairing.discountCents, 0);
  }
  if (pairingMode === 'verified-only') {
    for (const e of eligibility) {
      if (!pvs.some(p => p.pvId === e?.pvId)) issue(issues, 'warning', 'PAIRING_ELIGIBILITY_FOR_UNKNOWN_PV', 'authorizations.pairing', e?.pvId ?? null);
    }
  } else if (pairingMode !== 'disabled') {
    issue(issues, 'error', 'INVALID_PAIRING_MODE', 'authorizations.pairing.mode', pairingMode);
  }

  // ---- totals (Production order: base - pairing + urgency(on base) -> - plan -> + extras)
  const hasError = issues.some(i => i.severity === 'error');
  const hasUnresolved = issues.some(i => i.severity === 'unresolved');
  const baseKnown = pvs.length > 0 && pvs.every(p => Number.isSafeInteger(p.baseCents));
  let campaign = null;
  if (!hasError && baseKnown) {
    const baseCents = service === 'd2d' ? R.sumZones(pvs.flatMap(p => p.zones.map(z => z.baseCents))) : pvs.reduce((s, p) => s + p.baseCents, 0);
    const pairingDiscountCents = pvs.reduce((s, p) => s + p.pairing.discountCents, 0);
    const urgencyPct = catalog.URGENCY_PCT[urgency];
    const urgencyCents = R.percent(baseCents, urgencyPct);
    const subtotalBeforePlanCents = R.subtotal(baseCents, pairingDiscountCents, urgencyCents);
    const planPct = catalog.PLAN_PCT[plan];
    const planCents = R.percent(subtotalBeforePlanCents, planPct);
    const payableExtrasCents = extras.every(x => x.cents !== null) ? extras.filter(x => x.payable).reduce((s, x) => s + x.cents, 0) : null;
    campaign = { baseCents, pairingDiscountCents, urgency: { level: urgency, pct: urgencyPct, cents: urgencyCents }, subtotalBeforePlanCents,
      plan: { code: plan, pct: planPct, cents: planCents, codesStatus: catalog.PLAN_CODES_STATUS }, payableExtrasCents };
  }
  const status = hasError ? 'invalid' : hasUnresolved || !campaign || campaign.payableExtrasCents === null ? 'unresolved' : 'priced';
  let totals = null;
  if (status === 'priced') {
    const payableCents = R.total(campaign.subtotalBeforePlanCents, campaign.plan.cents, campaign.payableExtrasCents);
    const quotedNotPayableCents = graphics.cents;
    const indicativeCents = printing.cents ?? 0;
    totals = { payableCents, quotedNotPayableCents, indicativeCents, grossQuoteCents: payableCents + quotedNotPayableCents + indicativeCents,
      printingPriceKnown: printing.status === 'NOT_SELECTED' || printing.cents !== null };
    const claimed = claims.totalAmount;
    if (claimed !== undefined) {
      const claimedCents = typeof claimed === 'number' && Number.isFinite(claimed) ? Math.round(claimed * 100) : null;
      totals.clientTotalComparison = { claimedCents, matches: claimedCents === payableCents };
    }
  }

  return deepFreeze({
    pricingVersion: catalog.PRICING_VERSION,
    status,
    currency: 'EUR',
    vatIncluded: false,
    serverAuthorized: false, // P0: computed by the engine, not yet issued by a server (P1)
    rounding: R.name,
    authoritativeRounding: R.name === 'exact',
    service: service ?? null,
    pvs,
    extras,
    graphics,
    printing,
    pairingMode,
    campaign,
    totals,
    issues,
    ignoredClientClaims: [...new Set(ignoredClientClaims)].sort(),
  });
}

/**
 * Historical pricing snapshots (metadata.pricing of stored campaigns) are immutable
 * evidence of the tariff version they were quoted with (e.g. "Piano -5%" on 3-month
 * plans before the -3/-5/-8 scale). They are never re-priced by this engine.
 */
export function describeHistoricalPricingSnapshot(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot ?? null));
  return deepFreeze({ kind: 'historical', pricingVersion: copy?.pricing_version ?? copy?.pricingVersion ?? 'legacy-unversioned', repriceable: false, snapshot: copy });
}

/** Re-pricing a stored campaign is refused by contract. */
export function repriceHistorical() {
  throw new Error('LEGACY_SNAPSHOT_IMMUTABLE: stored quotes keep their original pricing version');
}
