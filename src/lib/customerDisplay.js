// Customer dashboard: readable labels instead of technical codes, Italian
// number/money format, and the few state-dependent wordings. Pure functions,
// shared by the campaign list, the campaign page and its panels.
import { buildExtraServicesRegistry } from './extraServicesRegistry.js';

// Intl it-IT does not group 4-digit numbers (1524 -> "1524"): group always.
function groupThousands(intString) {
  return intString.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 3353 -> "3.353"; null/invalid -> null. */
export function formatIntIT(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const sign = n < 0 ? '-' : '';
  return sign + groupThousands(String(Math.round(Math.abs(n))));
}

/** 1524.44 -> "€1.524,44"; -60 -> "-€60,00"; null/invalid -> null. */
export function formatEuroIT(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}€${groupThousands(int)},${dec}`;
}

const key = (value) => String(value ?? '').trim().toLowerCase();

const SERVICE_LABELS = {
  d2d: 'Door to Door', door_to_door: 'Door to Door', 'door to door': 'Door to Door', doortodoor: 'Door to Door',
  h2h: 'Hand to Hand', hand_to_hand: 'Hand to Hand', 'hand to hand': 'Hand to Hand',
  b2b: 'Distribuzione Business', business: 'Distribuzione Business', 'business distribution': 'Distribuzione Business',
};
const AREA_MODE_LABELS = {
  radius: 'Raggio', raggio: 'Raggio', address: 'Indirizzo', comune: 'Comune intero', municipality: 'Comune intero',
  nil: 'Quartieri (NIL)', cap: 'CAP', multi: 'Più comuni', multi_zone: 'Più punti vendita', custom_zone: 'Zona personalizzata',
};
const PRINT_SIDES_LABELS = {
  fronte: 'Solo fronte', solo_fronte: 'Solo fronte', front: 'Solo fronte',
  fronte_retro: 'Fronte e retro', fronte_retro_diff: 'Fronte e retro', fronte_retro_differenti: 'Fronte e retro', front_back_different: 'Fronte e retro',
  fronte_retro_eq: 'Fronte e retro uguali', fronte_retro_uguali: 'Fronte e retro uguali', front_back_same: 'Fronte e retro uguali',
};
const PRINT_COLOR_LABELS = {
  cmyk: 'A colori', colori: 'A colori', colore: 'A colori', color: 'A colori', full_color: 'A colori', '4/4': 'A colori', quadricromia: 'A colori',
  bn: 'Bianco e nero', bw: 'Bianco e nero', bianco_nero: 'Bianco e nero', 'b/n': 'Bianco e nero', '1/1': 'Bianco e nero',
};
const GRAPHIC_STATUS_LABELS = { ready: 'File pronto', pronto: 'File pronto', needs_design: 'Grafica da realizzare', da_creare: 'Grafica da realizzare' };
const VARIANT_LABELS = { single: 'Campagna singola', singola: 'Campagna singola', continuous: 'Continuativa', continuativa: 'Continuativa', subscription: 'Continuativa' };
const STATUS_LABELS = {
  confermata: 'Confermata', in_preparazione: 'In preparazione', in_distribuzione: 'In distribuzione', completata: 'Completata',
  annullata: 'Annullata', problema: 'Problema segnalato',
};

// Unknown values are shown as they are (never invented), only tidied up.
const fallback = (value) => (value == null || String(value).trim() === '' ? null : String(value).trim());

export const serviceLabel = (code) => SERVICE_LABELS[key(code)] || fallback(code);
export const areaModeLabel = (code) => AREA_MODE_LABELS[key(code)] || fallback(code);
export const printSidesLabel = (code) => PRINT_SIDES_LABELS[key(code)] || fallback(code);
export const printColorLabel = (code) => PRINT_COLOR_LABELS[key(code)] || fallback(code);
export const graphicStatusLabel = (code) => GRAPHIC_STATUS_LABELS[key(code)] || fallback(code);
export const variantLabel = (code) => VARIANT_LABELS[key(code)] || fallback(code);
export const campaignStatusLabel = (code) => STATUS_LABELS[key(code)] || fallback(code);
export const formatLabel = (code) => (fallback(code) ? String(code).trim().toUpperCase() : null);

let extraLabels = null;
/** "tracking_gps" -> "Tracking GPS" (names from the extra services registry). */
export function extraServiceLabel(id) {
  if (!extraLabels) {
    extraLabels = new Map();
    for (const ext of buildExtraServicesRegistry({ flyerQty: 0 })) {
      const label = ext.mappingLabel || ext.head;
      if (!label) continue;
      for (const k of [ext.id, ext.addId, ...(ext.legacyIds || [])]) if (k) extraLabels.set(key(k), label);
    }
  }
  return extraLabels.get(key(id)) || fallback(id);
}

/** "A5 · Fronte e retro · A colori" from the saved print specs. */
export function printSpecsLabel(specs) {
  if (!specs?.format) return null;
  return [formatLabel(specs.format), printSidesLabel(specs.sides), printColorLabel(specs.color)].filter(Boolean).join(' · ');
}

export const zonesCountLabel = (n) => (n === 1 ? '1 zona' : `${formatIntIT(n)} zone`);

/** Paid only when the payment is recorded (or the balance is settled). */
export function isCampaignPaid(campagna) {
  // Same settled states as isCreditSettled (campaignSettlement.js, kept out to
  // avoid loading the Supabase client here).
  return campagna?.stato_pagamento === 'pagato' || ['settled_by_credit', 'settled_by_verified_receipt'].includes(campagna?.settlement?.settlement_status);
}

/** Distribution statistics exist only once the distribution has started. */
export function isDistributionStarted(campagna) {
  return ['in_distribuzione', 'completata'].includes(campagna?.stato);
}
export const DISTRIBUTION_STATS_PENDING = 'Disponibile durante la distribuzione';

export const NO_SMART_PAIRING_DISCOUNT = 'Nessuno sconto Smart Pairing per questa campagna';
/** "20%" when a discount applies; the no-discount sentence otherwise. */
export function smartPairingLabel(discountPct) {
  const n = Number(discountPct);
  return discountPct != null && Number.isFinite(n) && n > 0 ? `${formatIntIT(n)}%` : NO_SMART_PAIRING_DISCOUNT;
}

// Italian small words kept lowercase inside place names ("Cassina de' Pecchi").
const PLACE_SMALL_WORDS = new Set(['di', 'del', 'della', 'dei', 'delle', 'degli', 'dello', 'da', 'de', "de'", 'e', 'sul', 'sulla', 'al', 'alla', 'in']);
/** NIL names come in capitals (COMASINA): same style as comuni (Comasina). Mixed-case names are kept. */
export function formatPlaceName(name) {
  const text = fallback(name);
  if (!text || /[a-zà-ÿ]/.test(text)) return text;
  return text.toLowerCase().replace(/[\p{L}']+/gu, (word, offset) => {
    if (offset > 0 && PLACE_SMALL_WORDS.has(word)) return word;
    if (word.length <= 2 && !PLACE_SMALL_WORDS.has(word)) return word.toUpperCase(); // acronyms such as "QT 8"
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** "Abbiategrasso + 2 comuni" / "Comasina + 1 quartiere" from the campaign zones; single zone -> its name. */
export function campaignAreaTitle(campagna) {
  const names = [...new Set((campagna?.comuni || []).map(formatPlaceName).filter(Boolean))];
  if (names.length <= 1) return names[0] || formatPlaceName(campagna?.zona);
  const saved = Array.isArray(campagna?.metadata?.campaign_zones) ? campagna.metadata.campaign_zones : [];
  const allNil = saved.length > 0 && saved.every((z) => z?.territory_type === 'nil');
  const others = names.length - 1;
  const noun = allNil ? (others === 1 ? 'quartiere' : 'quartieri') : (others === 1 ? 'comune' : 'comuni');
  return `${names[0]} + ${others} ${noun}`;
}

/** "2026-11-12" -> "12/11/2026"; invalid -> null. */
export function formatDateIT(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Campaign period in words; says what is missing instead of a bare placeholder. */
export function campaignDatesLabel(start, end) {
  const a = formatDateIT(start);
  const b = formatDateIT(end);
  if (a && b) return a === b ? `Il ${a}` : `Dal ${a} al ${b}`;
  if (a) return `Dal ${a}`;
  if (b) return `Entro il ${b}`;
  return 'Date da definire';
}