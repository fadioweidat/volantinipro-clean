/* GRAFICA — motore prezzi servizio grafico, SEPARATO da printPricing.js.
 *
 * Regole (ticket "STAMPA E GRAFICA DEVONO ESSERE SEPARATE"):
 * - La grafica NON e' mai inclusa automaticamente nella stampa.
 * - Opzione A "Si', ho gia' il file"      -> costo grafica = 0.
 * - Opzione B "No, ho bisogno della grafica" -> si MOSTRA il prezzo; il cliente
 *   sceglie se aggiungerla (artworkSelected) o no.
 * - Nessun mix col prezzo di stampa: questo modulo non importa printPricing.
 *
 * Prezzo: EUR 79 fisso (stesso valore gia' usato dall'extra "graphic_design"
 * in extraServicesRegistry.js: "2 bozze incluse, consegna 48h, file pronto per
 * la stampa"). Unica fonte per il nuovo flusso Step1/Step4.
 */

export const GRAPHIC_SERVICE_PRICE = 79;

/**
 * Costo grafica da mostrare/sommare nel preventivo.
 * @param {{ artworkRequired?: boolean, artworkSelected?: boolean }} p
 *   artworkRequired  - true = opzione B ("mi serve la grafica")
 *   artworkSelected  - true = il cliente ha scelto di aggiungerla al preventivo
 * @returns {number} GRAPHIC_SERVICE_PRICE se richiesta E accettata, altrimenti 0.
 */
export function computeGraphicEstimate({ artworkRequired = false, artworkSelected = false } = {}) {
  return artworkRequired && artworkSelected ? GRAPHIC_SERVICE_PRICE : 0;
}

/**
 * Etichetta di riepilogo per la riga "Grafica" (Step4PricingSummaryPanel).
 * @param {{ artworkRequired?: boolean, artworkSelected?: boolean, eur?: (n:number)=>string }} p
 * @returns {string}
 */
export function graphicSummaryLabel({ artworkRequired = false, artworkSelected = false, eur } = {}) {
  const fmt = typeof eur === "function" ? eur : (n) => `${Number(n).toFixed(2)} €`;
  if (artworkRequired && artworkSelected) return fmt(GRAPHIC_SERVICE_PRICE);
  if (artworkRequired) return "Non inclusa";
  return "Non inclusa / €0";
}
