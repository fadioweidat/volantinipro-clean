// Citazione unica della fonte famiglie/popolazione (report fonte dati Milano,
// 2026-11-13): sempre "Fonte: ISTAT, famiglie al 31/12/2024" (Bilancio
// demografico e popolazione residente al 31 dicembre 2024, P2_2024).
// Le date degli snapshot sono date di calcolo, mai "aggiornamento ISTAT".
// Nessun claim assoluto sui numeri.

export const ISTAT_REFERENCE_DATE = "31/12/2024";

/** Citazione breve, identica su homepage, Preventivo Rapido e PDF. */
export const ISTAT_HOUSEHOLDS_SHORT = `Fonte: ISTAT, famiglie al ${ISTAT_REFERENCE_DATE}`;

/** Riga di metodo per la quantita' consigliata. */
export const RECOMMENDED_QUANTITY_METHOD = "Quantità consigliata = famiglie + 10% di margine operativo";

/** "Calcolo del 23/10/2026 su dati ISTAT al 31/12/2024" (null senza data). */
export function snapshotCalculationLabel(dateLabel) {
  return dateLabel ? `Calcolo del ${dateLabel} su dati ISTAT al ${ISTAT_REFERENCE_DATE}` : null;
}

/** Nota fonte e metodo della sezione dati del PDF preventivo. */
export const PDF_HOUSEHOLDS_SOURCE_NOTE =
  `${ISTAT_HOUSEHOLDS_SHORT} (Bilancio demografico e popolazione residente). Per un raggio o un singolo quartiere le famiglie sono stimate in proporzione alla superficie. ${RECOMMENDED_QUANTITY_METHOD}.`;
