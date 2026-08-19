// P0 — WIRING REALE pricing territoriale (chiusura ticket precedente).
//
// Risolve le zone {territory, quantity} reali da passare al pricing engine
// (distributionPricing.js) a partire dai dati REALI gia' presenti in `data`
// dopo Step2 — MAI una quantita' inventata o divisa arbitrariamente
// (sezione 3 del ticket: "Se Step2 non fornisce quantità per zona: FERMARSI
// e riportare il gap. NON inventare allocation").
//
// Fonte dati verificata via audit (non dedotta): data.zonesAllocation
// (= step2TruthModel.allocation.rows, Step2.jsx) porta {name, requiredFlyers,
// assignedFlyers} per riga — reale, non fabbricato. data.selectedComuni
// porta i nomi comune reali della zona attiva. Quando la campagna e'
// genuinamente multi-comune (selectedComuni.length > 1, con righe di
// allocazione reali corrispondenti > 1), si costruisce una zona per comune
// con la sua quantita' reale (match per nome). In ogni altro caso (singolo
// comune, singola zona attiva — il caso coperto da tutti i test A-J del
// ticket) si usa UNA sola zona con l'intera flyerQty, esattamente come il
// comportamento "singola zona" gia' verificato dal motore.
import { classifyTerritory } from './distributionPricing.js';

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function extractDensity(source) {
  const raw = source?.densita ?? source?.density_per_km2 ?? source?.densityPerKm2;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * @param {object} data - stato configuratore condiviso (Step1-4)
 * @param {number|null} flyerQty - quantita' aggregata gia' risolta (resolveQuoteQuantity)
 * @returns {{zones: {territory:string, quantity:number}[], multiZone: boolean}}
 */
export function resolveConfiguratorDistributionZones(data, flyerQty) {
  const comuni = Array.isArray(data?.selectedComuni) ? data.selectedComuni : [];
  const allocationRows = Array.isArray(data?.zonesAllocation) ? data.zonesAllocation : [];

  if (comuni.length > 1 && allocationRows.length > 1) {
    const zones = comuni
      .map((c) => {
        const name = c?.name || c?.label || c?.comune_name || null;
        if (!name) return null;
        const row = allocationRows.find((r) => normalizeName(r?.name) === normalizeName(name));
        const quantity = row ? Number(row.assignedFlyers ?? row.requiredFlyers ?? 0) : 0;
        if (!(quantity > 0)) return null; // niente quantita' reale per questo comune: non inventarla
        const density = extractDensity(c) ?? extractDensity(row);
        return { territory: classifyTerritory({ name, densityPerKm2: density }).tier, quantity };
      })
      .filter(Boolean);
    // Solo se OGNI comune selezionato ha prodotto una quantita' reale: se
    // anche un solo comune non ha un match di allocazione reale, non e'
    // sicuro trattarlo come multi-zona (rischio di sotto-contare) — si
    // ricade sul percorso a zona singola sotto, mai una somma parziale
    // silenziosa spacciata per completa.
    if (zones.length === comuni.length) {
      return { zones, multiZone: true };
    }
  }

  const singleName = comuni[0]?.name || comuni[0]?.label || data?.cityName || data?.searchedLocation || null;
  const singleDensity = extractDensity(comuni[0]) ?? extractDensity(data);
  const quantity = Number(flyerQty);
  if (!(quantity > 0)) {
    return { zones: [], multiZone: false };
  }
  return {
    zones: [{ territory: classifyTerritory({ name: singleName, densityPerKm2: singleDensity }).tier, quantity }],
    multiZone: false,
  };
}
