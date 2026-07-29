// Step3 preview pricing (per 1000 flyers - simplified estimate formula)
export const BASE_PRICES = {
  d2d: 1.85,
  h2h: 2.20,
  b2b: 3.50
};

// Step4 canonical pricing (per 1000 flyers - final quote formula, denominator differs)
export const QUOTE_PRICES = {
  d2d: 18.5,
  h2h: 22.0,
  b2b: 35.0
};

export const MONTHS_FULL = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
