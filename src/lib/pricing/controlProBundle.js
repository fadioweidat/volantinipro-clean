// P1 PRICING ENGINE — sezione 14, bundle "Controllo Pro".
//
// Implementato come funzione di PREZZO pura e testabile, non ancora
// collegata alla UI di selezione extra di Step4 (extraServicesRegistry.js/
// normalizeSelectedExtras). Motivo, dichiarato esplicitamente come la
// sezione 14 permette ("Se il modello extra corrente rende questa cosa
// pericolosa: NON forzare. Riportare prima il problema"): il registro
// extra attuale (extraServicesRegistry.js) non ha alcun concetto di
// "bundle"/gruppo — ogni extra e' una riga indipendente sommata in
// extraCost (quotePricing.js:24). Introdurre un vero dedup live
// richiederebbe modificare normalizeSelectedExtras() e la UI di selezione
// extra dentro Step4.jsx (~9800 righe, componente centrale del
// configuratore) per capire quali id sono "inclusi in un bundle" e
// nasconderli/escluderli dal totale — un cambiamento strutturale che
// rischia di rompere flussi extra esistenti se fatto senza un audit UI
// dedicato. La logica di prezzo/dedup qui sotto e' pero' gia' corretta e
// pronta per essere collegata quando quell'audit UI verra' fatto.
export const CONTROL_PRO_BUNDLE_ID = "control_pro";
export const CONTROL_PRO_PRICE = 99;

// Extra id (registro attuale, extraServicesRegistry.js) considerati
// "inclusi" nel bundle Controllo Pro: GPS live (tracking_gps), foto proof
// (photo_proof). "Mappa copertura" e "report finale PDF" non esistono oggi
// come extra id indipendenti nel registro (sono funzionalita' incluse
// nella piattaforma, non voci a pagamento separate) — quindi non c'e'
// nulla da deduplicare per quelle due voci, il bundle le aggiunge come
// contenuto incluso nel prezzo €99 senza doverle escludere da altrove.
export const CONTROL_PRO_INCLUDED_EXTRA_IDS = ["tracking_gps", "photo_proof"];

/**
 * Dato un elenco di extra selezionati (stessa forma di
 * normalizeSelectedExtras: {id, price, ...}[]) e se il Cliente ha
 * selezionato Controllo Pro, restituisce il totale extra corretto SENZA
 * doppio addebito delle voci incluse nel bundle (sezione 14: "NON deve
 * pagare nuovamente i singoli extra inclusi").
 * @param {{id:string, price:number}[]} selectedExtras
 * @param {boolean} controlProSelected
 * @returns {{extraCost: number, dedupedIds: string[]}}
 */
export function calculateExtrasWithControlPro(selectedExtras, controlProSelected) {
  const list = Array.isArray(selectedExtras) ? selectedExtras : [];
  if (!controlProSelected) {
    const extraCost = list.reduce((sum, item) => sum + (Number(item?.price) || 0), 0);
    return { extraCost, dedupedIds: [] };
  }

  const dedupedIds = list
    .filter((item) => CONTROL_PRO_INCLUDED_EXTRA_IDS.includes(item?.id))
    .map((item) => item.id);
  const remaining = list.filter((item) => !CONTROL_PRO_INCLUDED_EXTRA_IDS.includes(item?.id));
  const remainingCost = remaining.reduce((sum, item) => sum + (Number(item?.price) || 0), 0);
  const extraCost = CONTROL_PRO_PRICE + remainingCost;
  return { extraCost, dedupedIds };
}
