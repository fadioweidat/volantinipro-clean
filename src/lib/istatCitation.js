// Citazione unica della fonte famiglie/popolazione (report fonte dati Milano,
// 2026-11-13). Il dato di base e' sempre ISTAT, Bilancio demografico e
// popolazione residente al 31 dicembre 2024 (P2_2024, public.geo_municipalities).
// Le date degli snapshot (homepage, Preventivo Rapido) sono date di calcolo,
// mai "aggiornamento ISTAT". Nessun claim assoluto sui numeri.

export const ISTAT_REFERENCE_DATE = "31/12/2024";

/** Etichetta breve sotto un numero di famiglie. */
export const ISTAT_HOUSEHOLDS_SHORT = `Fonte: ISTAT, famiglie al ${ISTAT_REFERENCE_DATE}`;

/** Versione compatta per le card strette del calcolatore. */
export const ISTAT_HOUSEHOLDS_COMPACT = `ISTAT, famiglie al ${ISTAT_REFERENCE_DATE}`;

/** Metodo dei quartieri di Milano: ripartizione per superficie del dato ISTAT. */
export const MILANO_NIL_METHOD_NOTE = "famiglie stimate per superficie";

/** Riga di metodo per la quantita' consigliata. */
export const RECOMMENDED_QUANTITY_METHOD = "Quantità consigliata = famiglie + 10% di margine operativo";

/** "Calcolo del 22/10/2026 su dati ISTAT al 31/12/2024" (null senza data). */
export function snapshotCalculationLabel(dateLabel) {
  return dateLabel ? `Calcolo del ${dateLabel} su dati ISTAT al ${ISTAT_REFERENCE_DATE}` : null;
}

/** Nota fonte e metodo della sezione dati del PDF preventivo. */
export const PDF_HOUSEHOLDS_SOURCE_NOTE =
  `Fonte famiglie e popolazione: ISTAT, Bilancio demografico e popolazione residente al 31 dicembre 2024. Per raggi parziali e per i quartieri (NIL) di Milano le famiglie sono stimate in proporzione alla superficie. ${RECOMMENDED_QUANTITY_METHOD}.`;
