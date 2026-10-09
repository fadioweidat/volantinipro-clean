// VolantiniPro canonical pricing catalog: P0 (pure data, integer cents, EUR, ex VAT).
//
// Source of every value:
// * distribution grid, minimums, urgency, flat rates, Control PRO contents, extra prices
//   are copied 1:1 from the Production modules at 047a764 (distributionPricing.js,
//   quotePricing.js, appConstants.js, extraServicesRegistry.js, graphicPricing.js);
//   tests/pricing_engine_p0_parity.test.mjs proves the copy against those modules;
// * the five user-approved rules of 2026-10-09 (supervision 120/campaign, Control PRO 99
//   with no double charge, graphics 79 canonical, per-PV operational vs per-campaign
//   central extras, verified-date-only pairing).
// Nothing here is a new tariff. Unresolved items are marked and the engine refuses to
// price them instead of guessing (see docs/pricing/phase3b4p0-engine-foundation.md).

export const PRICING_VERSION = 'vp-2026.10-p0';

// --- Distribution: D2D territorial grid (Production DISTRIBUTION_GRID x 100) ----------
export const TIERS = Object.freeze(['MILANO_CORE', 'HINTERLAND_DENSE', 'COMO_LECCO', 'LOW_DENSITY_MOUNTAIN']);
export const GRID_QUANTITIES = Object.freeze([1000, 2500, 5000, 10000, 20000, 30000, 50000]);
export const GRID_CENTS = Object.freeze({
  MILANO_CORE: Object.freeze([12000, 15000, 21000, 35000, 66000, 96000, 150000]),
  HINTERLAND_DENSE: Object.freeze([14000, 18000, 26000, 42000, 80000, 117000, 185000]),
  COMO_LECCO: Object.freeze([17000, 23000, 33000, 52000, 100000, 145000, 230000]),
  LOW_DENSITY_MOUNTAIN: Object.freeze([22000, 32000, 45000, 75000, 145000, 210000, 335000]),
});
export const MINIMUM_CENTS = Object.freeze({ MILANO_CORE: 12000, HINTERLAND_DENSE: 14000, COMO_LECCO: 17000, LOW_DENSITY_MOUNTAIN: 22000 });

// Tier classification (Production classifyTerritory), applied ONLY to server-resolved data.
export const TIER_NAME_ANCHORS = Object.freeze({
  milano: 'MILANO_CORE',
  seveso: 'HINTERLAND_DENSE', meda: 'HINTERLAND_DENSE', cormano: 'HINTERLAND_DENSE',
  sesto: 'HINTERLAND_DENSE', 'sesto san giovanni': 'HINTERLAND_DENSE',
  como: 'COMO_LECCO', lecco: 'COMO_LECCO',
  sondrio: 'LOW_DENSITY_MOUNTAIN',
});
export const TIER_DENSITY_THRESHOLDS = Object.freeze([
  Object.freeze({ min: 6000, tier: 'MILANO_CORE' }),
  Object.freeze({ min: 2500, tier: 'HINTERLAND_DENSE' }),
  Object.freeze({ min: 800, tier: 'COMO_LECCO' }),
  Object.freeze({ min: 0, tier: 'LOW_DENSITY_MOUNTAIN' }),
]);

// --- Distribution: flat services (Production QUOTE_PRICES, cents per 1000 flyers) ------
export const FLAT_RATE_CENTS_PER_1000 = Object.freeze({ h2h: 2200, b2b: 3500 });
export const SERVICES = Object.freeze(['d2d', 'h2h', 'b2b']);

// --- Urgency (Production URGENCY_SURCHARGE_PCT; input enum as in Step1 data.urgency) ----
export const URGENCY_PCT = Object.freeze({ normal: 0, urgent: 20, express: 35 });

// --- Plans: CURRENT Production UI codes and percentages (Step1 planOptions / Step4).
// Canonical plan codes and display names are an UNRESOLVED business decision: this
// table is the current behaviour, not a new canonical scheme. Unknown codes (including
// the unused engine codes quarterly/semiannual/annual) are rejected, never mapped.
export const PLAN_PCT = Object.freeze({ single: 0, monthly3: 3, monthly6: 5, monthly12: 8 });
export const PLAN_CODES_STATUS = 'current-production-ui-codes; canonical naming pending decision';

// --- Smart Pairing caps (Production Step4: same <= 40, nearby <= 20) -------------------
export const PAIRING_CAP_PCT = Object.freeze({ same: 40, nearby: 20 });

// --- Graphics: single canonical price (approved rule 3) -------------------------------
export const GRAPHICS = Object.freeze({
  id: 'graphics', cents: 7900, scope: 'campaign',
  // Production checkout: graphics is in grandTotal but NOT in total_amount (payable).
  payable: false,
  aliases: Object.freeze(['graphic_design', 'grafica_progetto', 'design', 'grafica', 'preparazione_grafica']),
});

// --- Extras (prices = Production extraServicesRegistry) --------------------------------
// scope: 'pv' = operational, charged per point of sale; 'campaign' = centralised, once;
// 'ambiguous' = catalogue evidence does not settle it -> unresolved for >1 PV.
// status: 'active' | 'blocked' (business decision pending) | 'legacy_unpriced'
// (hidden legacy item not in the canonical contract).
export const EXTRAS = Object.freeze({
  control_pro: Object.freeze({ cents: 9900, scope: 'ambiguous', status: 'active', payable: true,
    includes: Object.freeze(['tracking_gps', 'photo_proof', 'photo_report_advanced']),
    evidence: 'registry bundleIncludesIds (3 ids); "a prezzo fisso"; scope not stated by rule 2' }),
  tracking_gps: Object.freeze({ cents: 6000, scope: 'pv', status: 'active', payable: true, evidence: '"Segui in tempo reale gli operatori"; "Monitoraggio operativo della distribuzione"' }),
  photo_proof: Object.freeze({ cents: 3000, scope: 'pv', status: 'active', payable: true, evidence: '"Conferma visiva zona per zona"' }),
  photo_report_advanced: Object.freeze({ cents: 5000, scope: 'ambiguous', status: 'active', payable: true, evidence: '"Report fotografico" (deliverable) vs "riferimento operativo" (field photos)' }),
  video_proof: Object.freeze({ cents: 6000, scope: 'pv', status: 'active', payable: true, evidence: '"Video delle operazioni in campo"' }),
  qr_analytics: Object.freeze({ cents: 5000, scope: 'campaign', status: 'active', payable: true, evidence: '"Codice QR univoco"; "Landing page dedicata"' }),
  advanced_report: Object.freeze({ cents: 4000, scope: 'campaign', status: 'active', payable: true, evidence: '"Documentazione completa post-campagna"' }),
  account_manager: Object.freeze({ cents: 8000, scope: 'campaign', status: 'active', payable: true, evidence: '"per tutto il ciclo di vita della campagna"' }),
  dedicated_supervision: Object.freeze({ cents: 12000, scope: 'campaign', status: 'active', payable: true, evidence: 'approved rule 1: EUR 120 per campaign, not per day, not per PV' }),
  puntiVetrina: Object.freeze({ cents: 3500, scope: 'ambiguous', status: 'active', payable: true, services: Object.freeze(['d2d']), evidence: '"Fino a 5 punti vetrina inclusi" (per campaign or per area not stated)' }),
  gps_plus_report: Object.freeze({ cents: 9000, scope: 'ambiguous', status: 'blocked', payable: true, evidence: 'premium GPS/report outside Control PRO: equivalence not confirmed (decision pending)' }),
  quality_control: Object.freeze({ cents: 2500, scope: 'pv', status: 'legacy_unpriced', payable: true, evidence: 'hidden legacy item, not offered, not in the approved contract' }),
  operator_support: Object.freeze({ cents: 3900, scope: 'campaign', status: 'legacy_unpriced', payable: true, evidence: 'hidden legacy item, not offered, not in the approved contract' }),
});

// Legacy / UI aliases (Production registry legacyIds) -> canonical id or special class.
export const EXTRA_ALIASES = Object.freeze({
  gps: 'tracking_gps', gps_default: 'tracking_gps',
  foto: 'photo_proof', foto_localizzate: 'photo_proof',
  control_pro_99: 'control_pro',
  qr: 'qr_analytics', report_avanzato: 'advanced_report',
  supervisione_dedicata: 'dedicated_supervision',
  quality: 'quality_control', controllo_qualita: 'quality_control',
  operator: 'operator_support', supporto_operatore: 'operator_support',
});
// Ids that are not priced as extras: printing comes from the printing spec, urgency from
// the urgency enum (Production: printing excluded from extras; urgent_distribution = 0).
export const NON_EXTRA_MARKERS = Object.freeze({
  stampa: 'printing', printing: 'printing',
  urgent: 'urgency', urgent_distribution: 'urgency', distribuzione_urgente: 'urgency',
});

// Printing: Production printPricing.js (Pixartprinting matrices + 20 % internal markup) is
// reused as-is; the line is INDICATIVE and never payable (Production checkout semantics).
export const PRINTING = Object.freeze({ payable: false, indicative: true });

export const VAT = Object.freeze({ included: false, note: 'all amounts ex VAT (Production: "IVA esclusa")' });
export const LIMITS = Object.freeze({ maxQuantityPerZone: 5_000_000, maxPvs: 20, maxZonesPerPv: 200 });
