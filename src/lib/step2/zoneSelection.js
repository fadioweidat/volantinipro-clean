// P1-A — auto-selezione zone Step 2, preservando le selezioni manuali.
//
// La selezione di default in Step 2 è "tutte le zone disponibili" (Comune
// completo, tutti i comuni di una multi-selezione, tutte le zone nel raggio,
// tutte le NIL). L'effect che la applica girava però ad OGNI ricompute di
// `zonesInRadius` (nuova identità array anche a contenuto invariato: refresh
// apiData, tweak raggio, cambio tab), sovrascrivendo la scelta manuale
// dell'utente (NIL singola, sottoinsieme custom, multi-zona parziale).
//
// Questa funzione pura decide il prossimo `selected` a partire da:
//  - hasUsefulApiZones: se false → nessuna zona utile, selezione vuota;
//  - availableIds:      id delle zone attualmente disponibili (zonesInRadius);
//  - prevAvailableIds:  id disponibili all'ultima esecuzione (ref, per capire
//                       se la lista è cambiata davvero / si è ampliata);
//  - currentSelected:   `selected` corrente.
//
// Regole:
//  1. Se `currentSelected` (filtrato agli id ancora esistenti) è un
//     sottoinsieme PROPRIO non vuoto della lista corrente e NON copriva tutta
//     la lista precedente → è una scelta manuale: si preserva, scartando solo
//     gli id spariti. Nessuna espansione.
//  2. Altrimenti (vuoto / copriva tutta la lista precedente / copre già tutta
//     la lista corrente) → default = tutte le zone correnti. Si riscrive SOLO
//     se il set diverge davvero (un refresh apiData a parità di id non causa
//     né clobber né re-render).
//
// Ritorna SEMPRE `currentSelected` per riferimento quando non serve cambiare,
// così `setSelected(prev => resolveZoneAutoSelection(...))` fa short-circuit in
// React senza re-render.
export function resolveZoneAutoSelection({
  hasUsefulApiZones,
  availableIds,
  prevAvailableIds,
  currentSelected,
}) {
  const prevArr = Array.isArray(currentSelected) ? currentSelected : [];

  if (!hasUsefulApiZones) {
    return prevArr.length > 0 ? [] : currentSelected;
  }

  const avail = Array.isArray(availableIds) ? availableIds : [];
  const availableSet = new Set(avail);
  const prevAvail = Array.isArray(prevAvailableIds) ? prevAvailableIds : [];

  const validPrev = prevArr.filter((id) => availableSet.has(id));

  const coveredAllPrevious =
    prevAvail.length > 0 &&
    validPrev.length === prevAvail.length &&
    prevAvail.every((id) => availableSet.has(id));

  const isManualSubset =
    validPrev.length > 0 &&
    validPrev.length < avail.length &&
    !coveredAllPrevious;

  if (isManualSubset) {
    return validPrev.length === prevArr.length ? currentSelected : validPrev;
  }

  const nextKey = avail.slice().sort().join("|");
  const prevKey = validPrev.slice().sort().join("|");
  return prevKey === nextKey ? currentSelected : avail;
}
