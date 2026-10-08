import { roundMoney } from '../pricing/distributionPricing.js';

// Pure domain only: no network, clock, storage, geography matching or booking.
// A verified response means the caller verified transport AND territory mapping.
// The current city-only endpoint cannot establish precise NIL/CAP/radius matching.
export const PAIRING_STATES = Object.freeze(['loading', 'match', 'no_match', 'unavailable', 'error', 'stale', 'skipped']);
export const DATE_POLICIES = Object.freeze(['single_date_only', 'disabled']);
const record = x => x && typeof x === 'object' && !Array.isArray(x);
const id = x => typeof x === 'string' && x.trim() ? x : null;
const finite = x => x !== null && x !== undefined && x !== '' && typeof x !== 'boolean' && Number.isFinite(Number(x));
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const stable = x => JSON.stringify(x, (_, v) => record(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const identity = x => {
  const value = typeof x === 'string' ? x : x?.istat_code ?? x?.istatCode ?? x?.code ?? x?.name ?? x?.label;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : id(value);
};

function coordinates(x) {
  if (!x || (x.lat == null && x.lng == null)) return { valid: true, value: null };
  if (!finite(x.lat) || !finite(x.lng) || Math.abs(Number(x.lat)) > 90 || Math.abs(Number(x.lng)) > 180) return { valid: false, value: null };
  return { valid: true, value: { lat: Number(x.lat), lng: Number(x.lng) } };
}

/** Signature excludes quantity, base price, display name, active PV and array order. */
export function buildPairingContext(zone, { service, period, mappingPolicyVersion } = {}) {
  const fail = reason => ({ pvId: id(zone?.id), valid: false, signature: null, reason });
  if (!id(zone?.id)) return fail('missing_pv_id');
  if (!['d2d', 'h2h', 'b2b'].includes(service) || !id(mappingPolicyVersion)) return fail('invalid_mapping');
  if (!date(period?.start) || (period.end != null && (!date(period.end) || period.end < period.start))) return fail('invalid_period');
  const parentRows = zone.selectedComuni?.length ? zone.selectedComuni : zone.city ? [zone.city] : [];
  const parents = [...new Set(parentRows.map(identity).filter(Boolean))].sort();
  if (!parents.length) return fail('missing_territory');
  const parentCenters = parentRows.map(row => ({ identity: identity(row), ...coordinates(row) }));
  if (parentCenters.some(row => !row.identity || !row.valid)) return fail('invalid_territory_coordinates');
  const mode = zone.searchMode;
  const point = mode === 'address' ? zone.selectedSearchPoint : zone.city;
  const center = coordinates(point);
  if (!center.valid) return fail('invalid_coordinates');
  let territory;
  if (mode === 'address') {
    const radius = zone.radiusKm ?? zone.radius;
    if (!center.value || !finite(radius) || Number(radius) <= 0) return fail('invalid_radius');
    territory = { type: 'radius', parents, radiusKm: Number(radius) };
  } else if (mode === 'cap') {
    const caps = [...new Set(zone.selectedCaps || [])].sort();
    if (!caps.length || caps.some(c => typeof c !== 'string' || !/^\d{5}$/.test(c))) return fail('invalid_cap');
    territory = { type: 'cap', parents, units: caps };
  } else if (mode === 'municipality') {
    if (zone.nilManualMode || zone.kpiSnapshot?.analysisLevel === 'nil') {
      const units = (zone.allocation || zone.zonesAllocation || []).map(r => r.nil_code ?? r.nilCode);
      if (!units.length || units.some(v => v == null || String(v).trim() === '')) return fail('missing_nil_identity');
      territory = { type: 'nil', parents, units: [...new Set(units.map(String))].sort() };
    } else territory = { type: 'comune', parents };
  } else return fail('invalid_territory_mode');
  const value = { pvId: zone.id, service, territory, center: center.value, parentCenters: parentCenters.map(row => ({ identity: row.identity, center: row.value })).sort((a,b) => stable(a).localeCompare(stable(b))), period: { start: period.start, end: period.end ?? period.start }, mappingPolicyVersion };
  return { ...value, valid: true, signature: stable(value), reason: null };
}

function assertIds(zones) {
  const ids = (zones || []).map(z => id(z?.id));
  if (ids.some(x => !x) || new Set(ids).size !== ids.length) throw new Error('INVALID_OR_DUPLICATE_PV_ID');
  return ids;
}

/** Call when starting a request or explicitly marking unavailable/error/skipped. */
export function beginPairingRequest(context, generation, status = 'loading') {
  if (!Number.isSafeInteger(generation) || generation < 1 || !PAIRING_STATES.includes(status)) throw new Error('INVALID_PAIRING_STATE');
  return { pvId: context.pvId, contextSignature: context.signature, generation, status: context.valid ? status : 'unavailable', verified: false, slots: [], availableDates: [], verifiedAt: null, expiresAt: null };
}

/** Ownership guards are independent of cancellation, active PV and ordering. */
export function ownsPairingResponse({ campaignZones, context, state, response }) {
  const ids = assertIds(campaignZones);
  const zone = campaignZones.find(z => z.id === context?.pvId);
  const current = zone && context ? buildPairingContext(zone, context) : null;
  return Boolean(context?.valid && current?.signature === context.signature && ids.includes(context.pvId) && state && response &&
    state.status === 'loading' && state.pvId === context.pvId && response.pvId === context.pvId &&
    state.generation === response.generation &&
    state.contextSignature === context.signature && response.contextSignature === context.signature);
}

/** Immutable rejection leaves current state intact; prunes deleted owners. */
export function applyPairingResponse(states, { campaignZones, context, response, now, expiresAt }) {
  const ids = assertIds(campaignZones);
  const next = Object.fromEntries(Object.entries(states || {}).filter(([key]) => ids.includes(key)));
  const state = next[context?.pvId];
  if (!ownsPairingResponse({ campaignZones, context, state, response })) return { states: next, accepted: false };
  let status = 'error';
  let slots = [];
  let availableDates = [];
  const payload = response.payload;
  if (response.status === 'unavailable') status = 'unavailable';
  else if (response.status === 'success' && response.verified === true && Number.isFinite(now) && Number.isFinite(expiresAt) && expiresAt > now &&
    payload?.source === 'campaign_capacity' && Array.isArray(payload.smartPairingSlots) && Array.isArray(payload.availableDates)) {
    const validSlot = s => date(s?.date) && ['same', 'nearby'].includes(s.type) &&
      s.discountPercent === (s.type === 'same' ? 40 : 20) && finite(s.placesAvailable) && Number(s.placesAvailable) > 0 && s.source === 'campaign_capacity';
    if (payload.smartPairingSlots.every(validSlot)) {
      slots = payload.smartPairingSlots.map(s => ({ ...s }));
      availableDates = payload.availableDates.filter(d => date(d?.date) && finite(d.placesAvailable) && Number(d.placesAvailable) > 0).map(d => ({ ...d }));
      status = slots.length ? 'match' : 'no_match';
    }
  }
  next[context.pvId] = { ...state, status, verified: ['match', 'no_match'].includes(status), slots, availableDates, verifiedAt: now, expiresAt };
  return { states: next, accepted: true };
}

export function evaluatePairingSelection({ context, state, generation, selectedDates = [], now, datePolicy = 'single_date_only' }) {
  const no = (status, reason) => ({ status, reason, eligiblePercent: 0, policyDecisionRequired: reason === 'multiple_date_policy_required' });
  if (!context?.valid || !state) return no('unavailable', 'unverified');
  if (!Number.isSafeInteger(generation) || generation < 1 || state.pvId !== context.pvId || state.contextSignature !== context.signature || state.generation !== generation) return no('stale', 'owner_or_context_changed');
  if (!PAIRING_STATES.includes(state.status)) return no('error', 'invalid_state');
  if (state.status !== 'match') return no(state.status, state.status);
  if (!state.verified || !Number.isFinite(now) || !Number.isFinite(state.verifiedAt) || !Number.isFinite(state.expiresAt) || now < state.verifiedAt || now >= state.expiresAt) return no('stale', 'verification_expired');
  if (!DATE_POLICIES.includes(datePolicy)) return no('unavailable', 'unsupported_date_policy');
  if (datePolicy === 'disabled') return no('skipped', 'policy_disabled');
  if (!Array.isArray(selectedDates) || selectedDates.some(d => !date(d))) return no('unavailable', 'invalid_selection');
  const dates = [...new Set(selectedDates)];
  if (dates.length > 1) return no('match', 'multiple_date_policy_required');
  if (dates.length !== 1 || dates[0] < context.period.start || dates[0] > context.period.end || dates[0] < new Date(now).toISOString().slice(0, 10)) return no('match', 'no_eligible_selection');
  const slots = (state.slots || []).filter(s => s.date === dates[0]);
  if (slots.length !== 1) return no('match', 'missing_or_ambiguous_slot');
  const slot = slots[0];
  const percent = slot.type === 'same' ? 40 : slot.type === 'nearby' ? 20 : 0;
  if (!percent || slot.discountPercent !== percent || slot.source !== 'campaign_capacity' || !finite(slot.placesAvailable) || Number(slot.placesAvailable) <= 0) return no('match', 'invalid_slot');
  return { status: 'match', reason: 'eligible', eligiblePercent: percent, policyDecisionRequired: false };
}

/** basePrices MUST be existing engine output [{id, distributionPrice}].
 * Economic inputs are separate from availability context. No rate calculations.
 * Legacy's rounded average of positive dates is intentionally not reproduced.
 */
export function calculateCampaignPairing({ campaignZones, basePrices, contexts = {}, states = {}, generations = {}, selectedDatesByPv = {}, now, datePolicy }) {
  const ids = assertIds(campaignZones);
  const rows = ids.map(pvId => {
    const prices = (basePrices || []).filter(p => p.id === pvId);
    if (prices.length !== 1 || typeof prices[0].distributionPrice !== 'number' || !Number.isFinite(prices[0].distributionPrice) || prices[0].distributionPrice < 0) throw new Error('INVALID_PV_BASE_PRICE');
    const base = roundMoney(prices[0].distributionPrice);
    const provided = contexts[pvId];
    const current = provided ? buildPairingContext(campaignZones.find(z => z.id === pvId), provided) : null;
    const context = provided?.pvId === pvId && current?.signature === provided.signature ? current : null;
    const eligibility = evaluatePairingSelection({ context, state: states[pvId], generation: generations[pvId], selectedDates: selectedDatesByPv[pvId], now, datePolicy });
    const discount = roundMoney(base * eligibility.eligiblePercent / 100);
    return { pvId, base, discount, net: roundMoney(base - discount), ...eligibility };
  });
  const sum = key => rows.reduce((n, r) => n + Math.round(r[key] * 100), 0) / 100;
  const base = sum('base');
  const discount = sum('discount');
  return { rows, base, discount, net: roundMoney(base - discount), reservesCapacity: false };
}
