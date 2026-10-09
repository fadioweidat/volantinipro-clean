// Maps a submit-campaign-request body (as sent today by Production Step4 and Quick Quote
// to the deployed v11) into the P0 engine contract. Pure, no I/O.
//
// Everything price-like in the body (total_amount, grand_total, pricing.*, discounts,
// smart_pairing_discount, extra prices, densities) is a CLIENT CLAIM: it is only copied
// into `clientClaims` for comparison and never used to compute the server quote.
// Customer CHOICES (service, urgency level, plan, extras, quantities, territories,
// printing spec, artwork) are taken from the body; where today's payload does not carry a
// choice explicitly the adapter infers it and records an adapter note, so the shadow
// record shows exactly how each input was obtained.

export const ADAPTER_VERSION = 'v11-payload-adapter-1';

const SERVICE_MAP = Object.freeze({
  d2d: 'd2d', 'Door to Door': 'd2d', door_to_door: 'd2d',
  h2h: 'h2h', 'Hand to Hand': 'h2h',
  b2b: 'b2b', business: 'b2b', 'business-distribution': 'b2b', 'Business Distribution': 'b2b',
});
// Step4 metadata.piano labels (Step4 subL map) -> current plan codes.
export const PLAN_LABELS = Object.freeze({ Singola: 'single', '3 mesi': 'monthly3', '6 mesi': 'monthly6', '12 mesi': 'monthly12' });
// Quick Quote sends extra *labels* (registry `head`); tests pin this map to the registry.
export const EXTRA_HEADS = Object.freeze({
  'Tracking GPS Live': 'tracking_gps', 'Foto Proof Base': 'photo_proof', 'Report Fotografico Completo': 'photo_report_advanced',
  'GPS + Report Finale': 'gps_plus_report', 'Video Proof': 'video_proof', 'Controllo PRO': 'control_pro', Grafica: 'graphic_design',
  'Supervisione Dedicata': 'dedicated_supervision', 'Account Manager Dedicato': 'account_manager', 'QR / Landing Analytics': 'qr_analytics',
  'Report Avanzato Copertura': 'advanced_report', 'Punti Vetrina': 'puntiVetrina', 'Stampa Materiale': 'printing',
  'Preparazione Grafica': 'design', 'Controllo Qualità': 'quality_control', 'Supporto Operatore': 'operator_support',
  'Distribuzione Urgente': 'urgent_distribution',
});

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = v => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
export const normalizeName = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

function inferUrgency(body, meta, notes) {
  const explicit = str(body.urgency) ?? str(meta.urgency);
  if (explicit) { notes.push('URGENCY_EXPLICIT'); return explicit; }
  if (meta.source === 'quick_quote') {
    if (str(meta.timing) === 'Urgente') { notes.push('URGENCY_FROM_QUICK_QUOTE_TIMING'); return 'urgent'; }
    notes.push('URGENCY_FROM_QUICK_QUOTE_TIMING'); return 'normal';
  }
  // Step4 does not send the urgency level: derive the customer's choice from the ratio
  // between the client-declared surcharge and base (claims). Only 0/20/35 % are accepted.
  const pricing = isObj(meta.pricing) ? meta.pricing : {};
  const surcharge = num(pricing.urgencySurcharge);
  const base = num(pricing.subtotal);
  if (surcharge === 0) { notes.push('URGENCY_INFERRED_FROM_CLIENT_PRICING'); return 'normal'; }
  if (surcharge !== null && base !== null && base > 0) {
    const ratio = (surcharge / base) * 100;
    for (const [level, pct] of [['urgent', 20], ['express', 35]]) {
      if (Math.abs(ratio - pct) < 0.5) { notes.push('URGENCY_INFERRED_FROM_CLIENT_PRICING'); return level; }
    }
  }
  const extras = Array.isArray(meta.extra_services) ? meta.extra_services : [];
  if (extras.includes('urgent_distribution') || extras.includes('urgent')) { notes.push('URGENCY_FROM_EXTRA_MARKER'); return 'urgent'; }
  notes.push('URGENCY_UNKNOWN');
  return null;
}

function inferPlan(body, meta, notes) {
  const explicit = str(body.plan) ?? str(meta.plan_code);
  if (explicit) { notes.push('PLAN_EXPLICIT'); return explicit; }
  if (meta.source === 'quick_quote') { notes.push('PLAN_QUICK_QUOTE_SINGLE'); return 'single'; }
  const label = str(meta.piano);
  if (label && PLAN_LABELS[label]) { notes.push('PLAN_FROM_LABEL'); return PLAN_LABELS[label]; }
  notes.push('PLAN_UNKNOWN');
  return null;
}

function extrasFrom(meta, notes) {
  if (Array.isArray(meta.extra_services)) { notes.push('EXTRAS_FROM_IDS'); return meta.extra_services.filter(x => typeof x === 'string'); }
  if (Array.isArray(meta.servizi_extra)) {
    const ids = [];
    for (const e of meta.servizi_extra) {
      const label = typeof e === 'string' ? e : e?.label;
      const id = typeof e === 'object' && typeof e?.id === 'string' ? e.id : EXTRA_HEADS[label] ?? null;
      if (id) ids.push(id); else notes.push('EXTRA_LABEL_UNMAPPED');
    }
    notes.push('EXTRAS_FROM_LABELS');
    return ids;
  }
  return [];
}

/** Territory key of a payload zone row: NIL rows are priced under their parent comune. */
function zoneKey(row) {
  const type = str(row.territory_type) ?? 'comune';
  const name = type === 'nil' ? str(row.parent_municipality) : str(row.municipality);
  return { type, name };
}

/**
 * @returns {{ ok: boolean, request: object, territoryClaims: object[], notes: string[], source: string }}
 */
export function adaptSubmissionPayload(body) {
  const notes = [];
  const b = isObj(body) ? body : {};
  const meta = isObj(b.metadata) ? b.metadata : {};
  const source = meta.source === 'quick_quote' ? 'quick_quote' : str(meta.source) ?? 'configurator';
  const service = SERVICE_MAP[b.service_type ?? b.type] ?? null;
  if (!service) notes.push('SERVICE_UNKNOWN');
  const rows = Array.isArray(b.campaignZones) ? b.campaignZones.slice(0, 100) : [];
  const flyerQuantity = num(b.total_flyers ?? b.flyer_quantity);
  const pvMeta = isObj(meta.multi_zone) && Array.isArray(meta.multi_zone.zones) ? meta.multi_zone.zones : [];

  // Group rows into points of sale: campaign_zone_id (multi-PV) or one implicit PV.
  const groups = new Map();
  for (const row of rows) {
    if (!isObj(row)) continue;
    const pvId = str(row.campaign_zone_id) ?? 'pv-1';
    if (!groups.has(pvId)) groups.set(pvId, []);
    groups.get(pvId).push(row);
  }
  if (groups.size > 1 || (groups.size === 1 && !groups.has('pv-1'))) notes.push('MULTI_PV_PAYLOAD');

  const territoryClaims = [];
  const pvs = [];
  for (const [pvId, pvRows] of groups) {
    if (service !== 'd2d') continue;
    const byName = new Map();
    for (const row of pvRows) {
      const { type, name } = zoneKey(row);
      const qty = num(row.quantity);
      const ref = name ? `t:${normalizeName(name)}` : `t:missing:${pvId}:${byName.size}`;
      if (!byName.has(ref)) byName.set(ref, { territoryRef: ref, quantity: 0, claim: { territoryRef: ref, municipalityName: name, kinds: new Set(), points: [], nilNames: [] } });
      const entry = byName.get(ref);
      entry.quantity += qty && qty > 0 ? Math.round(qty) : 0;
      entry.claim.kinds.add(type);
      if (type === 'nil' && str(row.municipality)) entry.claim.nilNames.push(str(row.municipality));
      const lat = num(row.lat); const lng = num(row.lng);
      if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) entry.claim.points.push([lng, lat]);
    }
    const zones = [...byName.values()];
    // Production prices a single-territory PV on the PV quantity (finalFlyers /
    // flyer_quantity), not on the sum of its allocation rows.
    if (zones.length === 1) {
      const declared = pvId === 'pv-1' ? flyerQuantity : num(pvMeta.find(z => z?.id === pvId)?.quantity);
      if (declared && declared > 0 && Math.round(declared) !== zones[0].quantity) { zones[0].quantity = Math.round(declared); notes.push('SINGLE_TERRITORY_PV_USES_PV_QUANTITY'); }
    }
    pvs.push({ pvId, zones: zones.map(z => ({ territoryRef: z.territoryRef, quantity: z.quantity })) });
    for (const z of zones) territoryClaims.push({ ...z.claim, kinds: [...z.claim.kinds], pvId });
  }
  if (service && service !== 'd2d') {
    pvs.push({ pvId: 'pv-1', quantity: flyerQuantity && flyerQuantity > 0 ? Math.round(flyerQuantity) : flyerQuantity });
  }

  const printingMeta = isObj(meta.printing) ? meta.printing : {};
  const specs = isObj(printingMeta.specs) ? printingMeta.specs : {};
  const printing = printingMeta.printing_selected === true
    ? { enabled: true, format: specs.format ?? null, grammage: specs.grammage ?? null, sides: specs.sides ?? null, color: specs.color ?? null,
      paperType: specs.paperType ?? null, fold: specs.fold ?? null, orientation: specs.orientation ?? null }
    : null;
  const graphics = { required: printingMeta.artwork_required === true, selected: printingMeta.artwork_selected === true };

  const urgency = inferUrgency(b, meta, notes);
  const plan = inferPlan(b, meta, notes);
  const request = {
    service,
    urgency: urgency ?? undefined,
    plan: plan ?? undefined,
    pvs,
    extras: extrasFrom(meta, notes),
    printing,
    graphics,
    clientClaims: {
      totalAmount: num(b.total_budget ?? b.total_amount),
      grandTotal: num(meta.grand_total),
      smartPairingDiscountPct: num(b.smart_pairing_discount),
    },
  };
  const ok = Boolean(service) && urgency !== null && plan !== null && pvs.length > 0;
  return { ok, adapterVersion: ADAPTER_VERSION, source, request, territoryClaims, notes: [...new Set(notes)].sort() };
}
