import { URGENCY_SURCHARGE_PCT, calculateMultiZoneDistributionPrice, roundMoney } from './pricing/distributionPricing.js';

const finiteNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function resolveQuoteQuantity(data) {
  return finiteNumber(data?.flyerQuantity ?? data?.qty);
}

// P1 PRICING ENGINE — mappa i valori "normal"/"urgent"/"express" gia' usati
// in tutto il configuratore (Step1.jsx data.urgency) sulle percentuali
// centralizzate (distributionPricing.js). Prima qui c'era solo un check
// binario `urgency === "urgent" ? baseCost*0.3 : 0` — "express" non
// applicava ALCUN sovrapprezzo nel totale finale (bug reale gia' presente,
// indipendente da questo ticket: Step1 mostrava un'anteprima con +35% ma
// Step4/QuickQuote non lo applicavano mai davvero).
function urgencySurchargePct(urgency) {
  const key = urgency === "urgent" ? "urgent" : urgency === "express" ? "express" : "standard";
  return URGENCY_SURCHARGE_PCT[key] ?? 0;
}

// P0 WIRING REALE — `distributionZones`, se presente e non vuoto,
// sostituisce SOLO la fonte di baseCost: invece di quantity*(rate/1000)
// (tariffa flat, mai territoriale), si usa la somma reale delle zone
// {territory, quantity} via il motore a griglia (distributionPricing.js).
// Tutto il resto della pipeline (smart pairing, urgenza, sconto piano,
// extra) resta ESATTAMENTE la stessa formula/ordine gia' in uso — nessuna
// funzione nuova introdotta qui, solo la sorgente di baseCost cambia
// quando c'e' un dato territoriale reale da usare (mai per h2h/b2b, che
// non passano mai distributionZones).
export function calculateQuotePricing({ quantity, pricePerThousand, smartPairingDiscountPct = 0, urgency = "normal", planDiscountPct = 0, extras = [], distributionZones = null }) {
  const normalizedQuantity = finiteNumber(quantity);
  const normalizedRate = finiteNumber(pricePerThousand);
  if (normalizedQuantity === null || normalizedRate === null) {
    return { quantity: normalizedQuantity, baseCost: null, smartPairingDiscount: null, urgencySurcharge: null, subtotalBeforePlan: null, planDiscountAmount: null, extraCost: null, total: null };
  }
  const smartPct = Math.max(0, Math.min(40, finiteNumber(smartPairingDiscountPct) ?? 0));
  const planPct = Math.max(0, Math.min(100, finiteNumber(planDiscountPct) ?? 0));
  const territorialSubtotal = Array.isArray(distributionZones) && distributionZones.length > 0
    ? calculateMultiZoneDistributionPrice(distributionZones).distributionSubtotal
    : null;
  // P0 WIRING REALE — roundMoney (gia' esistente in distributionPricing.js,
  // nessuna funzione nuova) applicato ad ogni campo calcolato: prima questa
  // pipeline restava float non arrotondato (es. 350*0.35 = 122.49999999999999
  // in JS), innocuo finche' il risultato passava solo per formatQuoteCurrency
  // (que arrotonda solo in visualizzazione) ma ora che baseCost puo' arrivare
  // dal motore a griglia (gia' arrotondato al centesimo) l'incoerenza tra un
  // numero "pulito" e uno con coda float diventa visibile — un solo punto di
  // arrotondamento per l'intera pipeline, come richiesto dal ticket pricing.
  const baseCost = roundMoney(territorialSubtotal !== null ? territorialSubtotal : normalizedQuantity * (normalizedRate / 1000));
  const smartPairingDiscount = roundMoney(baseCost * (smartPct / 100));
  const urgencySurcharge = roundMoney(baseCost * (urgencySurchargePct(urgency) / 100));
  const subtotalBeforePlan = roundMoney(baseCost - smartPairingDiscount + urgencySurcharge);
  const planDiscountAmount = roundMoney(subtotalBeforePlan * (planPct / 100));
  const extraCost = roundMoney((Array.isArray(extras) ? extras : []).reduce((sum, item) => sum + (finiteNumber(item?.price ?? item?.amount) ?? 0), 0));
  const total = roundMoney(subtotalBeforePlan - planDiscountAmount + extraCost);
  return { quantity: normalizedQuantity, baseCost, smartPairingDiscount, urgencySurcharge, subtotalBeforePlan, planDiscountAmount, extraCost, total };
}

export function formatQuoteCurrency(value, decimals = 2) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  return `€${number.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
