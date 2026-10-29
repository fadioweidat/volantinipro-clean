// Tempi quando nel preventivo c'e' la stampa (approvato 2026-10-29, versione
// semplice, niente stampa veloce): la distribuzione parte solo dopo produzione e
// spedizione della stampa.
// - Produzione: 5 giorni lavorativi = tariffa "Fast 120" (120 h) di
//   Pixartprinting, la stessa dei prezzi in printPricing.js.
// - Spedizione: 2 giorni lavorativi (confermato il 2026-10-29).
// Giorni lavorativi = lunedi'-venerdi' (festivita' non considerate).
export const PRINT_PRODUCTION_WORKING_DAYS = 5;
export const PRINT_SHIPPING_WORKING_DAYS = 2;

export const PRINT_TIMING_NOTE = "Stampa: circa 5 giorni lavorativi + spedizione, poi distribuzione.";

const pad = (n) => String(n).padStart(2, "0");
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addWorkingDays(from, days) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return d;
}

/** Prima data utile di inizio distribuzione con la stampa (ISO yyyy-mm-dd). */
export function earliestStartWithPrint(today = new Date()) {
  return toIso(addWorkingDays(today, PRINT_PRODUCTION_WORKING_DAYS + PRINT_SHIPPING_WORKING_DAYS));
}

// "Entro 7/15 giorni" (giorni di calendario da oggi): con la stampa la scelta
// non e' disponibile se la prima data utile cade oltre la finestra.
export const PERIOD_PRESET_WINDOW_DAYS = { within7: 7, within15: 15 };

export function isPeriodPresetUnavailableWithPrint(presetId, minStartIso, today = new Date()) {
  const days = PERIOD_PRESET_WINDOW_DAYS[presetId];
  if (!days || !minStartIso) return false;
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return minStartIso > toIso(limit);
}
