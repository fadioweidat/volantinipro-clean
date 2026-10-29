// Step 1 — stima distribuzione Door to Door PRIMA della scelta della zona
// (2026-10-29). La zona si sceglie nello Step 2, quindi qui non esiste un
// prezzo unico: si mostra l'intervallo reale della griglia territoriale, dalla
// fascia piu' economica alla piu' cara, mai un valore sotto la griglia.
// Prima lo Step 1 usava una tariffa fissa di 18,50 €/1.000 (10.000 pz =
// 185 €), piu' bassa di qualunque fascia della griglia.
// Urgenza e sconto piano: stesso ordine di calculateQuotePricing (prima
// l'urgenza, poi lo sconto piano), solo sulla distribuzione.
import { TERRITORY_TIERS, URGENCY_SURCHARGE_PCT, calculateDistributionZonePrice, roundMoney } from "./distributionPricing.js";

const urgencyPct = (urgency) =>
  URGENCY_SURCHARGE_PCT[urgency === "urgent" ? "urgent" : urgency === "express" ? "express" : "standard"] ?? 0;

/**
 * @param {number} quantity
 * @param {{urgency?: string, planDiscountPct?: number}} options
 * @returns {{min: number, max: number}|null}
 */
export function doorToDoorRangeBeforeZone(quantity, { urgency = "normal", planDiscountPct = 0 } = {}) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const prices = Object.values(TERRITORY_TIERS)
    .map((tier) => calculateDistributionZonePrice(tier, qty))
    .filter((p) => Number.isFinite(p));
  if (!prices.length) return null;
  const plan = Math.max(0, Math.min(100, Number(planDiscountPct) || 0));
  const adjust = (base) => {
    const withUrgency = roundMoney(base + roundMoney(base * (urgencyPct(urgency) / 100)));
    return roundMoney(withUrgency - roundMoney(withUrgency * (plan / 100)));
  };
  return { min: adjust(Math.min(...prices)), max: adjust(Math.max(...prices)) };
}
