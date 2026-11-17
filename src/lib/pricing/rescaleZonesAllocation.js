// Quantita' cambiata nello Step 4 ("Aumenta quantita'", 2026-11-17).
//
// La ripartizione per comune (data.zonesAllocation) viene calcolata nello
// Step 2 sulla quantita' di quel momento. Se nello Step 4 il cliente alza la
// quantita', le righe restano quelle vecchie: alcuni comuni hanno 0 volantini,
// resolveConfiguratorDistributionZones non trova una quantita' per ogni comune
// e ricade su UNA zona con la fascia del primo comune per tutta la quantita'
// (es. Cormano + Bresso + Milano intera a 839.957 pz = €28.708,54 invece di
// circa €23.000).
//
// Qui la nuova quantita' viene ripartita in proporzione al fabbisogno reale di
// ogni riga (requiredFlyers, dato dello Step 2), con il metodo dei resti piu'
// grandi: la somma e' sempre esattamente la quantita' richiesta. Se la somma
// delle righe coincide gia' con la quantita' la ripartizione dello Step 2 resta
// quella scelta (nessun cambiamento). Senza fabbisogno utilizzabile non si
// inventa nulla: le righe restano invariate.

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {Array<{assignedFlyers?: number, requiredFlyers?: number}>} rows
 * @param {number} quantity
 * @returns {Array} righe con assignedFlyers ricalcolato, oppure le righe originali
 */
export function rescaleZonesAllocationToQuantity(rows, quantity) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;
  const target = Math.round(Number(quantity));
  if (!(target > 0)) return rows;
  const currentTotal = rows.reduce((sum, r) => sum + toCount(r?.assignedFlyers ?? r?.requiredFlyers), 0);
  if (currentTotal === target) return rows;
  const weights = rows.map((r) => toCount(r?.requiredFlyers));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  if (!(weightTotal > 0)) return rows;
  const raw = weights.map((w) => (target * w) / weightTotal);
  const alloc = raw.map(Math.floor);
  let remainder = target - alloc.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) alloc[order[k].index] += 1;
  return rows.map((r, i) => ({ ...r, assignedFlyers: alloc[i] }));
}

/** Stesso input del resolver, con la ripartizione allineata alla quantita' del preventivo. */
export function withAllocationForQuantity(input, quantity) {
  if (!input || !Array.isArray(input.zonesAllocation)) return input;
  const zonesAllocation = rescaleZonesAllocationToQuantity(input.zonesAllocation, quantity);
  return zonesAllocation === input.zonesAllocation ? input : { ...input, zonesAllocation };
}
