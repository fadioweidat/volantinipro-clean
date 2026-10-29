// HAND TO HAND — tariffa oraria (approvata 2026-10-29), unica fonte di verita'.
// - €25 l'ora per operatore, IVA esclusa, minimo 3 ore per uscita (per operatore).
// - Il cliente sceglie operatori e ore, non una quantita' di volantini.
// - Volantini stimati: 250–350 l'ora per operatore secondo luogo e orario,
//   mostrati SEMPRE come intervallo, mai come numero garantito.
// - Pianificazione interna (mappa/operazioni): 250 l'ora, mai mostrato al cliente.
// - Fuori da Milano citta' (almeno un operatore parte da un altro comune):
//   "Spostamento calcolato nel preventivo", nessun importo.
// - Urgenza e piani come il Door to Door (calculateQuotePricing); Smart Pairing NO.
// Sostituisce la vecchia tariffa di 22 €/1.000 volantini.
import { calculateQuotePricing } from "../quotePricing.js";
import { roundMoney } from "./distributionPricing.js";

export const H2H_HOURLY_RATE_EUR = 25;
export const H2H_MIN_HOURS_PER_OUTING = 3;
export const H2H_HOUR_OPTIONS = [3, 4, 5, 6, 7, 8];
export const H2H_FLYERS_PER_HOUR_RANGE = Object.freeze({ min: 250, max: 350 });
export const H2H_PLANNING_FLYERS_PER_HOUR = 250;
export const H2H_FLYERS_ESTIMATE_NOTE = "circa 250–350 volantini all'ora per operatore, secondo luogo e orario";
export const H2H_TRAVEL_NOTE = "Spostamento calcolato nel preventivo";

// it-IT non raggruppa i numeri di 4 cifre ("2000"): sempre "2.000".
export const formatFlyerCount = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const formatFlyersRange = (range) => `${formatFlyerCount(range?.min)}–${formatFlyerCount(range?.max)}`;

const finite = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

/** Ore fatturate per un'uscita: mai sotto il minimo. */
export function billableHours(hours) {
  const h = finite(hours);
  return Math.max(H2H_MIN_HOURS_PER_OUTING, h == null ? H2H_MIN_HOURS_PER_OUTING : Math.round(h));
}

/** Ore per operatore dai dati del configuratore (assegnazioni per promoter, altrimenti valori di squadra). */
export function handToHandOperatorHours(data = {}) {
  const count = Math.max(1, Math.round(finite(data.promoterCount) ?? 1));
  const fallback = finite(data.serviceDurationHours) ?? H2H_MIN_HOURS_PER_OUTING;
  const assignments = Array.isArray(data.promoterAssignments) ? data.promoterAssignments : [];
  return Array.from({ length: count }, (_, i) => billableHours(finite(assignments[i]?.serviceDurationHours) ?? fallback));
}

export function handToHandBaseCost(operatorHours) {
  const hours = (Array.isArray(operatorHours) ? operatorHours : []).map(billableHours);
  return roundMoney(hours.reduce((sum, h) => sum + h, 0) * H2H_HOURLY_RATE_EUR);
}

/** Volantini stimati come intervallo (mai un numero garantito). */
export function handToHandFlyersRange(operatorHours) {
  const total = (Array.isArray(operatorHours) ? operatorHours : []).map(billableHours).reduce((s, h) => s + h, 0);
  return { min: total * H2H_FLYERS_PER_HOUR_RANGE.min, max: total * H2H_FLYERS_PER_HOUR_RANGE.max };
}

/** Quantita' per la pianificazione interna (250/ora), mai mostrata come garantita. */
export function handToHandPlanningFlyers(hours) {
  return billableHours(hours) * H2H_PLANNING_FLYERS_PER_HOUR;
}

const normalizeComune = (v) => String(v || "").trim().toLowerCase();
/** true se almeno un operatore parte da un comune diverso da Milano. */
export function handToHandNeedsTravel(comuni) {
  const names = (Array.isArray(comuni) ? comuni : []).map((c) => normalizeComune(typeof c === "string" ? c : c?.name || c?.label || c?.comune)).filter(Boolean);
  return names.some((n) => n !== "milano");
}

/** Comuni di partenza degli operatori dai dati del configuratore. */
export function handToHandStartComuni(data = {}) {
  const fromAssignments = (Array.isArray(data.promoterAssignments) ? data.promoterAssignments : [])
    .map((a) => a?.parentComune?.name || a?.parentComune || a?.city?.name || a?.city || null)
    .filter(Boolean);
  if (fromAssignments.length) return fromAssignments;
  return (Array.isArray(data.selectedComuni) ? data.selectedComuni : []).map((c) => c?.name || c).filter(Boolean);
}

/**
 * Prezzo Hand to Hand completo, stesso ordine del Door to Door: base, urgenza,
 * piano, extra. Smart Pairing sempre 0.
 */
export function calculateHandToHandPricing({ operatorHours, urgency = "normal", planDiscountPct = 0, extras = [] }) {
  const hours = (Array.isArray(operatorHours) ? operatorHours : []).map(billableHours);
  const baseCost = handToHandBaseCost(hours);
  const pricing = calculateQuotePricing({ quantity: hours.reduce((s, h) => s + h, 0), baseCostOverride: baseCost, urgency, planDiscountPct, extras, smartPairingDiscountPct: 0 });
  return { ...pricing, operatorHours: hours, operators: hours.length, totalHours: hours.reduce((s, h) => s + h, 0), flyersRange: handToHandFlyersRange(hours) };
}

// Formula leggibile: "2 operatori × 4 ore = 8 ore totali × €25/ora = €200,00";
// con ore diverse: "Ore per operatore 4 + 6 = 10 ore totali × €25/ora = €250,00".
const euroCents = (n) => {
  const [int, dec] = Number(n || 0).toFixed(2).split(".");
  return `€${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};
export function describeHandToHandCalculation(operatorHours) {
  const hours = (Array.isArray(operatorHours) ? operatorHours : []).map(billableHours);
  const total = hours.reduce((s, h) => s + h, 0);
  const same = hours.every((h) => h === hours[0]);
  const team = same ? `${hours.length} ${hours.length === 1 ? "operatore" : "operatori"} × ${hours[0]} ore` : `Ore per operatore ${hours.join(" + ")}`;
  return `${team} = ${total} ore totali × €${H2H_HOURLY_RATE_EUR}/ora = ${euroCents(handToHandBaseCost(hours))}`;
}
