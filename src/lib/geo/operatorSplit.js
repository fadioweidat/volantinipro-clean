// Divisione delle vie "Admin automatiche" selezionate tra N operatori Admin
// simulati (P1, MAX 4). Nessun dato reale: AUTO-01..AUTO-04 sono
// identificativi neutrali, MAI nomi di persone reali inesistenti.
//
// P1 ROOT CAUSE (ticket "4 operatori nello stesso spazio"): la versione
// precedente usava un bilanciamento greedy "minor totale finora" su una
// lista gia' ordinata per distanza crescente dall'origine — questo fa
// ROUND-ROBIN tra gli operatori via per via (via 1 -> op1, via 2 -> op2, via
// 3 -> op3, via 4 -> op4, via 5 -> op1 di nuovo...), quindi ogni operatore
// finiva con vie interlacciate nella STESSA fascia di distanza dall'origine
// — visivamente sovrapposti, non separati. Sostituito con una partizione
// angolare a settori ("sweep"): si calcola il rilevamento (bearing 0-360°)
// di ogni via rispetto all'origine, si ordinano le vie per bearing, e si
// tagliano N archi CONTIGUI di bearing la cui lunghezza cumulativa e' circa
// 1/N del totale ciascuno — come fette di torta attorno al punto di
// partenza. Ogni operatore lavora quindi in una direzione/settore diverso,
// mai sovrapposto agli altri, e il bilanciamento per lunghezza e' un
// sottoprodotto naturale del taglio per lunghezza cumulativa (non serve un
// rebalance separato).
export const MAX_ADMIN_OPERATORS = 4;

export function operatorKeyFor(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

function bearingDegrees(fromLat, fromLng, toLat, toLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x = Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) - Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Partizione angolare a settori contigui, bilanciata per lunghezza.
 * `origin` e' richiesto per calcolare il bearing di ogni via — le stesse
 * vie gia' selezionate/ordinate da selectRoadsFromOrigin (che espone
 * `nearestPointFromOrigin` per ciascuna). Deterministico, MAI Math.random:
 * stessa origine + stesse vie + stesso N => stessa identica partizione.
 * @returns {Array<{operatorKey:string, ways:Array, lengthM:number}>}
 */
export function splitWaysByOperator(selectedWays, operatorCount, prefix = 'AUTO', origin = null) {
  const n = Math.max(1, Math.min(MAX_ADMIN_OPERATORS, Math.round(Number(operatorCount)) || 1));
  if (!selectedWays.length) {
    return Array.from({ length: n }, (_, i) => ({ operatorKey: operatorKeyFor(prefix, i), ways: [], lengthM: 0 }));
  }

  // Fallback (nessuna origine disponibile): mantiene il comportamento
  // precedente come ultima rete di sicurezza, mai un crash. In pratica
  // origin e' sempre disponibile perche' selectRoadsFromOrigin lo richiede
  // gia' per produrre `selectedWays`.
  if (!origin) {
    const totals = new Array(n).fill(0);
    const buckets = Array.from({ length: n }, () => []);
    for (const way of selectedWays) {
      let minIndex = 0;
      for (let i = 1; i < n; i += 1) if (totals[i] < totals[minIndex]) minIndex = i;
      buckets[minIndex].push(way);
      totals[minIndex] += way.lengthM;
    }
    return buckets.map((ways, i) => ({ operatorKey: operatorKeyFor(prefix, i), ways, lengthM: totals[i] }));
  }

  const withBearing = selectedWays.map((way) => {
    const point = way.nearestPointFromOrigin || way.geometry[0];
    return { way, bearing: bearingDegrees(origin.lat, origin.lng, point[0], point[1]) };
  });
  // Ordine per bearing crescente, tie-breaker OSM way id per determinismo
  // quando due vie condividono esattamente lo stesso bearing.
  withBearing.sort((a, b) => (a.bearing - b.bearing) || (a.way.id - b.way.id));

  const totalLengthM = selectedWays.reduce((sum, w) => sum + w.lengthM, 0);
  const targetPerOperator = totalLengthM / n;

  const buckets = Array.from({ length: n }, () => []);
  const totals = new Array(n).fill(0);
  let cumulative = 0;
  for (const { way } of withBearing) {
    // Indice settore = quanti "target" di lunghezza sono gia' stati
    // superati finora, clampato all'ultimo operatore per il resto in coda
    // dovuto ad arrotondamenti in virgola mobile.
    let idx = targetPerOperator > 0 ? Math.floor(cumulative / targetPerOperator) : 0;
    if (idx >= n) idx = n - 1;
    buckets[idx].push(way);
    totals[idx] += way.lengthM;
    cumulative += way.lengthM;
  }

  return buckets.map((ways, i) => ({ operatorKey: operatorKeyFor(prefix, i), ways, lengthM: totals[i] }));
}
