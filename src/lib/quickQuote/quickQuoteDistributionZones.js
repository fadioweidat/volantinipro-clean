// Preventivo Rapido — zone di prezzo Door to Door (2026-11-14).
//
// Con piu' comuni il Preventivo Rapido applicava una tariffa fissa
// (QUOTE_PRICES.d2d, 18,50 €/1.000) all'intera quantita', invece del listino:
// Milano + Cormano + Bresso costava meno di Milano da sola. Lo Step 4 del
// configuratore invece prezza ogni comune con il listino sulla sua quantita' e
// somma (calculateMultiZoneDistributionPrice). Qui si costruiscono le stesse
// zone {territory, quantity} con la stessa funzione dello Step 4
// (resolveConfiguratorDistributionZones), a partire dalla ripartizione per
// comune che il Preventivo Rapido mostra gia' (computeTerritorialCampaign).
//
// Regole:
// - quantita' per comune proporzionale al fabbisogno di ciascun comune, con il
//   resto maggiore: la somma e' sempre la quantita' richiesta (anche oltre il
//   fabbisogno, dove l'eccedenza va ripartita invece di essere persa);
// - se un comune non ha dati territoriali, nessun prezzo: mai una tariffa
//   forfettaria al posto del listino.
import { largestRemainder } from "../istat/largestRemainder.js";
import { resolveConfiguratorDistributionZones } from "../pricing/resolveConfiguratorDistributionZones.js";
import { withIstatDensity } from "../step2/municipalityPricingTier.js";

// 2026-11-17: la fascia di prezzo usa la densita' ISTAT del comune, come lo
// Step 4 e le pagine citta' (prima solo il nome: i comuni sotto 2.500 ab/km²,
// es. Rho, Segrate, Brescia, ricadevano su Hinterland €260 invece di €330).
const forPricing = (list) => list.map(withIstatDensity);

/**
 * @param {{
 *   comuni: Array<{name: string}>,
 *   breakdown: Array<{municipality: string, recommendedQuantity: number|null}>,
 *   quantity: number|null,
 *   allMatched: boolean,
 * }} input
 * @returns {{ zones: Array<{territory: string, quantity: number}>|null, perComune: Array<{name: string, quantity: number, territory: string}>, multi: boolean, priceable: boolean }}
 */
export function buildQuickQuoteDistributionZones({ comuni, breakdown, quantity, allMatched }) {
  const list = Array.isArray(comuni) ? comuni.filter((c) => c && c.name) : [];
  const total = Math.round(Number(quantity));
  if (list.length === 0 || !(total > 0)) return { zones: null, perComune: [], multi: list.length > 1, priceable: false };

  if (list.length === 1) {
    const zones = resolveConfiguratorDistributionZones({ selectedComuni: forPricing(list) }, total).zones;
    return {
      zones,
      perComune: zones.map((z) => ({ name: list[0].name, quantity: z.quantity, territory: z.territory })),
      multi: false,
      priceable: zones.length > 0,
    };
  }

  const rows = Array.isArray(breakdown) ? breakdown : [];
  const weights = list.map((c) => {
    const row = rows.find((r) => String(r?.municipality || "").trim().toLowerCase() === String(c.name).trim().toLowerCase());
    return { key: c.name, weight: Number(row?.recommendedQuantity) };
  });
  if (!allMatched || weights.some((w) => !(w.weight > 0))) return { zones: null, perComune: [], multi: true, priceable: false };

  const shares = largestRemainder(total, weights);
  const pricingList = forPricing(list);
  const zonesAllocation = list.map((c, i) => ({ name: pricingList[i].name, assignedFlyers: shares.get(c.name) || 0 }));
  if (zonesAllocation.some((a) => !(a.assignedFlyers > 0))) return { zones: null, perComune: [], multi: true, priceable: false };

  const resolved = resolveConfiguratorDistributionZones({ selectedComuni: pricingList, zonesAllocation }, total);
  if (!resolved.multiZone || resolved.zones.length !== list.length) return { zones: null, perComune: [], multi: true, priceable: false };

  return {
    zones: resolved.zones,
    perComune: list.map((c, i) => ({ name: c.name, quantity: zonesAllocation[i].assignedFlyers, territory: resolved.zones[i].territory })),
    multi: true,
    priceable: true,
  };
}
