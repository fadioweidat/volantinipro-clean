/* STAMPA — motore prezzi stampa centralizzato (unica fonte).
 *
 * PREZZO REALE, non ipotetico. La matrice A5 sotto e' compilata con prezzi
 * effettivamente letti dal configuratore Pixartprinting.it (IT), 2026-08-28,
 * colonna consegna standard/economy, IVA esclusa, per la configurazione:
 *   format = A5 (14,8 x 21 cm)
 *   carta  = Patinata opaca (Classic demimatt) / Patinata lucida (Classic gloss)
 *            -> prezzo IDENTICO per le due carte (stessa famiglia "Classic")
 *   lati   = Fronte e retro differenti
 *   colore = 4/4 (quadricromia — Pixart volantini non offre B/N)
 *   piega  = nessuna
 *   grammature: 100 / 130 / 170 / 250 / 300 / 350 g/m2
 *
 * customerPrice = baseMarketPrice * 1.20  (markup VolantiniPro 20%, INTERNO,
 * mai mostrato come voce separata).
 *
 * Ogni chiamata ritorna priceStatus:
 *   AUTO_CONFIRMED  — A5 + carta opaca/lucida + grammatura in matrice +
 *                     fronte/retro differenti + colori + nessuna piega +
 *                     quantita' = punto benchmark esatto
 *   INTERPOLATED    — come sopra ma quantita' tra due benchmark della STESSA
 *                     identica configurazione (25.000 incluso)
 *   REQUIRES_REVIEW — configurazione non coperta da dati reali (A6, uso mano,
 *                     solo fronte, fronte/retro uguali, bianco/nero, piega,
 *                     grammatura fuori matrice, ...)
 *   NOT_CONFIGURED  — A4 (nessun dato)
 *
 * Quando priceStatus != AUTO_CONFIRMED/INTERPOLATED -> customerPrice = null
 * (la UI mostra "Prezzo da verificare"). Nessun moltiplicatore inventato.
 *
 * DL: NON e' un formato di stampa. Resta solo come materialFormat (logistica).
 */

// ---------------------------------------------------------------------------
// Formati
// ---------------------------------------------------------------------------

export const PRINT_FORMAT_OPTIONS = [
  { id: "A6", label: "A6", size: "10,5×14,8 cm" },
  { id: "A5", label: "A5", size: "14,8×21 cm" },
  { id: "A4", label: "A4", size: "21×29,7 cm" },
];

export const PRINT_FORMAT_IDS = PRINT_FORMAT_OPTIONS.map((o) => o.id);

export const MATERIAL_FORMAT_OPTIONS = [
  { id: "A6", label: "A6", size: "10,5×14,8 cm" },
  { id: "A5", label: "A5", size: "14,8×21 cm" },
  { id: "A4", label: "A4", size: "21×29,7 cm" },
  { id: "DL", label: "DL", size: "10×21 cm" },
];

export function isPrintableFormat(id) {
  return PRINT_FORMAT_IDS.includes(String(id || "").toUpperCase());
}

export function toPrintableFormat(id) {
  const upper = String(id || "").toUpperCase();
  return PRINT_FORMAT_IDS.includes(upper) ? upper : "A5";
}

// Solo A5 ha dati reali. A6 = da riverificare, A4 = nessun dato.
export const PRINT_FORMAT_STATUS = Object.freeze({
  A5: "CONFIGURED",
  A6: "REQUIRES_REVIEW",
  A4: "NOT_CONFIGURED",
});

export function isPrintFormatConfigured(id) {
  return PRINT_FORMAT_STATUS[String(id || "").toUpperCase()] === "CONFIGURED";
}

// ---------------------------------------------------------------------------
// Matrice A5 — prezzi BASE di mercato (Pixartprinting.it, 2026-08-28, ex IVA,
// consegna standard). [quantita', prezzoBase] in ordine crescente.
// ---------------------------------------------------------------------------

export const PRINT_A5_BENCHMARK_SOURCE = "Pixartprinting.it (2026-08-28, ex IVA, consegna standard)";

export const PRINT_A5_BENCHMARK_CONFIG = Object.freeze({
  format: "A5",
  paper: ["patinata_opaca", "patinata_lucida"],
  sides: "fronte_retro", // fronte e retro differenti
  color: "colori", // 4/4
  fold: "nessuna",
  delivery: "standard",
});

export const PRINT_A5_BENCHMARKS = Object.freeze({
  "100": [
    [1000, 46.18], [2500, 59.97], [5000, 87.16], [7500, 120.8], [10000, 126.01],
    [15000, 197.53], [20000, 236.51], [30000, 349.25], [40000, 439.94], [50000, 538.78],
  ],
  "130": [
    [1000, 47.6], [2500, 70.58], [5000, 100.06], [7500, 136.45], [10000, 155.93],
    [15000, 222.29], [20000, 274.65], [30000, 401.68], [40000, 512.56], [50000, 623.44],
  ],
  "170": [
    [1000, 52.66], [2500, 76.99], [5000, 111.04], [7500, 152.91], [10000, 174.44],
    [15000, 264.11], [20000, 335.54], [30000, 498.4], [40000, 649.66], [50000, 792.78],
  ],
  "250": [
    [1000, 62.76], [2500, 101.0], [5000, 158.3], [7500, 213.95], [10000, 247.0],
    [15000, 375.0], [20000, 480.82], [30000, 733.21], [40000, 957.31], [50000, 1173.28],
  ],
  "300": [
    [1000, 64.03], [2500, 108.95], [5000, 176.15], [7500, 249.91], [10000, 277.17],
    [15000, 441.11], [20000, 571.53], [30000, 873.21], [40000, 1149.4], [50000, 1417.46],
  ],
  "350": [
    [1000, 81.57], [2500, 131.1], [5000, 212.23], [7500, 290.36], [10000, 333.43],
    [15000, 520.12], [20000, 669.2], [30000, 1032.39], [40000, 1356.22], [50000, 1680.05],
  ],
});

export const PRINT_A5_GRAMMAGES = Object.keys(PRINT_A5_BENCHMARKS);

// Valori di configurazione coperti dai dati reali (A5).
const A5_PAPER_CONFIRMED = new Set([
  "patinata_opaca", "patinata_lucida", "classic_demimatt", "classic_gloss",
  "couche", "couché", "patinata",
]);
const A5_SIDES_CONFIRMED = new Set([
  "fronte_retro", "front_back_different", "fronte_retro_diff", "fronte_retro_differenti",
]);
const A5_COLOR_CONFIRMED = new Set([
  "colori", "colore", "full_color", "color", "cmyk", "4/4", "quadricromia",
]);
const A5_FOLD_CONFIRMED = new Set(["nessuna", "none", "no", ""]);

// ---------------------------------------------------------------------------
// Margine VolantiniPro (INTERNO).
// ---------------------------------------------------------------------------
export const VOLANTINIPRO_MARKUP_PCT = 20;

// ---------------------------------------------------------------------------
// Costanti di configurazione — nessun moltiplicatore inventato: il prezzo
// varia SOLO per (grammatura -> tabella benchmark dedicata) + quantita'.
// Le altre opzioni non muovono il prezzo; se non coperte dai dati reali
// portano priceStatus = REQUIRES_REVIEW e customerPrice = null.
// ---------------------------------------------------------------------------
export const GRAMMAGE_MULTIPLIER = 1.0;
export const SIDES_MULTIPLIER = 1.0;
export const COLOR_MULTIPLIER = 1.0;
export const PAPER_MULTIPLIER = 1.0;
export const FOLD_MULTIPLIER = 1.0;
export const ORIENTATION_MULTIPLIER = 1.0;
export const PRINT_URGENCY_MULTIPLIER = 1.0;
export const PRINT_URGENCY_CALIBRATED_VALUES = Object.freeze(["standard", "normal"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normKey(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

// "130 g/m²" | "130g" | 130 | "130" -> "130"
function normGrammage(v) {
  const digits = String(v == null ? "" : v).replace(/[^\d]/g, "");
  return digits;
}

/**
 * Prezzo BASE di mercato per (A5, grammatura, quantita') — interpolazione
 * lineare tra i punti della STESSA grammatura.
 * @returns {{ price:number|null, exact:boolean, belowMin:boolean, aboveMax:boolean }}
 */
export function benchmarkBasePrice(printFormat, quantity, grammage) {
  if (String(printFormat || "").toUpperCase() !== "A5") {
    return { price: null, exact: false, belowMin: false, aboveMax: false };
  }
  const table = PRINT_A5_BENCHMARKS[normGrammage(grammage)];
  if (!table) return { price: null, exact: false, belowMin: false, aboveMax: false };

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { price: null, exact: false, belowMin: false, aboveMax: false };
  }

  const [minQty, minPrice] = table[0];
  const [maxQty, maxPrice] = table[table.length - 1];

  if (qty <= minQty) {
    return { price: minPrice, exact: qty === minQty, belowMin: qty < minQty, aboveMax: false };
  }
  if (qty >= maxQty) {
    if (qty === maxQty) return { price: maxPrice, exact: true, belowMin: false, aboveMax: false };
    const [prevQty, prevPrice] = table[table.length - 2];
    const slope = (maxPrice - prevPrice) / (maxQty - prevQty);
    return { price: maxPrice + (qty - maxQty) * slope, exact: false, belowMin: false, aboveMax: true };
  }
  for (let i = 0; i < table.length - 1; i += 1) {
    const [lo, loP] = table[i];
    const [hi, hiP] = table[i + 1];
    if (qty === lo) return { price: loP, exact: true, belowMin: false, aboveMax: false };
    if (qty === hi) return { price: hiP, exact: true, belowMin: false, aboveMax: false };
    if (qty > lo && qty < hi) {
      const ratio = (qty - lo) / (hi - lo);
      return { price: loP + (hiP - loP) * ratio, exact: false, belowMin: false, aboveMax: false };
    }
  }
  return { price: maxPrice, exact: false, belowMin: false, aboveMax: false };
}

/**
 * Motore prezzi stampa.
 * @param {Object} p
 * @param {number} p.quantity
 * @param {string} p.printFormat  "A5" | "A6" | "A4"
 * @param {string} [p.grammage]   "100"|"130"|"170"|"250"|"300"|"350" (o "130 g/m²")
 * @param {string} [p.sides]      "fronte_retro" (differenti) coperto; altri -> review
 * @param {string} [p.color]      "colori" coperto; "bianco_nero" -> review
 * @param {string} [p.paperType]  "patinata_opaca" / "patinata_lucida" coperti; "uso_mano" -> review
 * @param {string} [p.fold]       "nessuna" coperto; "meta"/"tre" -> review
 * @param {string} [p.orientation] nessun effetto sul prezzo
 * @param {string} [p.urgency]    nessun effetto sul prezzo stampa
 * @param {boolean} [p.enabled=true]
 */
export function calculatePrintPrice({
  quantity,
  printFormat,
  grammage,
  sides,
  color,
  paperType,
  fold,
  orientation,
  urgency,
  enabled = true,
} = {}) {
  const fmt = String(printFormat || "").toUpperCase();
  const urgencyKey = normKey(urgency) || "standard";
  const gKey = normGrammage(grammage);

  const configurationMultipliers = {
    grammage: GRAMMAGE_MULTIPLIER, sides: SIDES_MULTIPLIER, color: COLOR_MULTIPLIER,
    paper: PAPER_MULTIPLIER, fold: FOLD_MULTIPLIER, orientation: ORIENTATION_MULTIPLIER,
    urgency: PRINT_URGENCY_MULTIPLIER,
  };
  const calibration = {
    grammage: PRINT_A5_GRAMMAGES.includes(gKey),
    sides: A5_SIDES_CONFIRMED.has(normKey(sides)),
    color: A5_COLOR_CONFIRMED.has(normKey(color)),
    paper: A5_PAPER_CONFIRMED.has(normKey(paperType)),
    fold: A5_FOLD_CONFIRMED.has(normKey(fold)),
    orientation: true,
    urgency: PRINT_URGENCY_CALIBRATED_VALUES.includes(urgencyKey),
  };

  const base = {
    format: fmt,
    priceStatus: "REQUIRES_REVIEW",
    reviewReasons: [],
    formatConfigured: false,
    grammageUsed: null,
    source: null,
    baseBenchmarkPrice: null,
    basePrintPrice: null,
    volantiniProMarkupPct: VOLANTINIPRO_MARKUP_PCT,
    volantiniProMarkup: null,
    customerPrice: null,
    estimatedBeyondBenchmark: false,
    belowMinBenchmark: false,
    configurationAdjustment: 1.0,
    configurationMultipliers,
    calibration,
    urgencyCalibrated: calibration.urgency,
  };

  if (enabled === false) return { ...base, priceStatus: "NOT_CONFIGURED", reviewReasons: ["disabled"] };
  if (fmt === "A4") return { ...base, priceStatus: "NOT_CONFIGURED", reviewReasons: ["format:A4"] };
  if (fmt !== "A5") return { ...base, reviewReasons: ["format:" + (fmt || "?")] };

  // A5 — verifica che ogni dimensione sia coperta dai dati reali
  const reasons = [];
  if (!PRINT_A5_GRAMMAGES.includes(gKey)) reasons.push("grammage:" + (gKey || "?"));
  if (!A5_SIDES_CONFIRMED.has(normKey(sides))) reasons.push("sides:" + (normKey(sides) || "?"));
  if (!A5_COLOR_CONFIRMED.has(normKey(color))) reasons.push("color:" + (normKey(color) || "?"));
  if (!A5_PAPER_CONFIRMED.has(normKey(paperType))) reasons.push("paper:" + (normKey(paperType) || "?"));
  if (!A5_FOLD_CONFIRMED.has(normKey(fold))) reasons.push("fold:" + (normKey(fold) || "?"));

  if (reasons.length > 0) return { ...base, reviewReasons: reasons, grammageUsed: PRINT_A5_GRAMMAGES.includes(gKey) ? gKey : null };

  const bench = benchmarkBasePrice("A5", quantity, gKey);
  if (bench.price == null) {
    return { ...base, reviewReasons: ["quantity:" + String(quantity)], grammageUsed: gKey };
  }

  const basePrintPrice = round2(bench.price);
  const customerPrice = round2(bench.price * (1 + VOLANTINIPRO_MARKUP_PCT / 100));
  const priceStatus = bench.exact && !bench.belowMin && !bench.aboveMax ? "AUTO_CONFIRMED" : "INTERPOLATED";

  return {
    ...base,
    priceStatus,
    formatConfigured: true,
    grammageUsed: gKey,
    source: PRINT_A5_BENCHMARK_SOURCE,
    baseBenchmarkPrice: basePrintPrice,
    basePrintPrice,
    volantiniProMarkup: round2(customerPrice - basePrintPrice),
    customerPrice,
    estimatedBeyondBenchmark: bench.aboveMax,
    belowMinBenchmark: bench.belowMin,
  };
}

/**
 * Stima del costo stampa mostrata al cliente (customerPrice del motore).
 * Compat con extraServicesRegistry / Step1 / Step4. Ritorna 0 quando la stampa
 * non e' attiva, la config non e' coperta (REQUIRES_REVIEW / NOT_CONFIGURED) o
 * la quantita' non e' valida. I default si applicano solo ai campi ASSENTI
 * (usati dal Preventivo Rapido, che non ha un pannello stampa dettagliato).
 * @returns {number}
 */
export function computePrintEstimate({
  quantity,
  enabled = true,
  format,
  printFormat,
  grammage,
  sides,
  color,
  paperType,
  fold,
  orientation,
  urgency,
} = {}) {
  if (enabled === false) return 0;
  const res = calculatePrintPrice({
    quantity,
    printFormat: printFormat || format || "A5",
    grammage: grammage ?? "130",
    sides: sides ?? "fronte_retro",
    color: color ?? "colori",
    paperType: paperType ?? "patinata_opaca",
    fold: fold ?? "nessuna",
    orientation,
    urgency,
  });
  return res.customerPrice == null ? 0 : res.customerPrice;
}
