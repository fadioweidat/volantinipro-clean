const finiteNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function resolveQuoteQuantity(data) {
  return finiteNumber(data?.flyerQuantity ?? data?.qty);
}

export function calculateQuotePricing({ quantity, pricePerThousand, smartPairingDiscountPct = 0, urgency = "normal", planDiscountPct = 0, extras = [] }) {
  const normalizedQuantity = finiteNumber(quantity);
  const normalizedRate = finiteNumber(pricePerThousand);
  if (normalizedQuantity === null || normalizedRate === null) {
    return { quantity: normalizedQuantity, baseCost: null, smartPairingDiscount: null, urgencySurcharge: null, subtotalBeforePlan: null, planDiscountAmount: null, extraCost: null, total: null };
  }
  const smartPct = Math.max(0, Math.min(40, finiteNumber(smartPairingDiscountPct) ?? 0));
  const planPct = Math.max(0, Math.min(100, finiteNumber(planDiscountPct) ?? 0));
  const baseCost = normalizedQuantity * (normalizedRate / 1000);
  const smartPairingDiscount = baseCost * (smartPct / 100);
  const urgencySurcharge = urgency === "urgent" ? baseCost * 0.3 : 0;
  const subtotalBeforePlan = baseCost - smartPairingDiscount + urgencySurcharge;
  const planDiscountAmount = subtotalBeforePlan * (planPct / 100);
  const extraCost = (Array.isArray(extras) ? extras : []).reduce((sum, item) => sum + (finiteNumber(item?.price ?? item?.amount) ?? 0), 0);
  const total = subtotalBeforePlan - planDiscountAmount + extraCost;
  return { quantity: normalizedQuantity, baseCost, smartPairingDiscount, urgencySurcharge, subtotalBeforePlan, planDiscountAmount, extraCost, total };
}

export function formatQuoteCurrency(value, decimals = 2) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  return `€${number.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
