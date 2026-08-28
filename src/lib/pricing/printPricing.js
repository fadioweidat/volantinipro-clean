/* STAMPA — motore prezzi stampa centralizzato (unica fonte).
 *
 * PREZZO REALE, non ipotetico. Le matrici A5, A6 e A4 sotto sono compilate con
 * prezzi effettivamente letti dal configuratore Pixartprinting.it (IT),
 * 2026-08-28, CAP 30020, colonna consegna standard/economy, IVA esclusa, per
 * la configurazione:
 *   format = A5 (14,8 x 21 cm)  /  A6 (10,5 x 14,8 cm)  /  A4 (21 x 29,7 cm)
 *   carta  = Patinata opaca (Classic demimatt) / Patinata lucida (Classic gloss)
 *            -> prezzo IDENTICO per le due carte (verificato sui punti reali)
 *   lati   = solo fronte + fronte/retro uguali + fronte/retro differenti sono
 *            TUTTI allo stesso prezzo reale su A4, A5 E A6 — equivalenza
 *            VERIFICATA dal vivo sul configuratore per OGNI formato e OGNI
 *            grammatura in matrice, layout confermato in UI e nel body API.
 *            NON un moltiplicatore: il lato non muove il prezzo.
 *   colore = 4/4 (quadricromia — Pixart volantini non offre B/N)
 *   piega  = nessuna
 *   grammature: 100 / 130 / 170 / 250 / 300 / 350 g/m2
 * Le tre matrici sono INDIPENDENTI: nessuna deriva da un'altra con
 * moltiplicatori, ogni cella e' un prezzo letto direttamente per quel formato.
 *
 * customerPrice = baseMarketPrice * 1.20  (markup VolantiniPro 20%, INTERNO,
 * mai mostrato come voce separata).
 *
 * Ogni chiamata ritorna priceStatus:
 *   AUTO_CONFIRMED  — A5/A6/A4 + carta opaca/lucida + grammatura in matrice +
 *                     lati (uno qualsiasi dei 3, stesso prezzo) + colori +
 *                     nessuna piega + quantita' = punto benchmark esatto
 *   INTERPOLATED    — come sopra ma quantita' tra due benchmark della STESSA
 *                     identica configurazione (25.000 incluso)
 *   REQUIRES_REVIEW — configurazione non coperta da dati reali (uso mano,
 *                     bianco/nero, piega, grammatura fuori matrice, ...)
 *   NOT_CONFIGURED  — stampa disattivata (enabled: false)
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

// A5, A6 e A4 hanno matrici di prezzi reali dedicate e indipendenti.
export const PRINT_FORMAT_STATUS = Object.freeze({
  A5: "CONFIGURED",
  A6: "CONFIGURED",
  A4: "CONFIGURED",
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

// ---------------------------------------------------------------------------
// Matrice A6 — prezzi BASE di mercato letti DIRETTAMENTE da Pixartprinting.it
// (endpoint /product/quote/, IT, CAP 30020, 2026-08-28, ex IVA, tier consegna
// "Fast 120" = produzione 120h = standard/economy, la colonna piu' economica).
// Config: A6 (105 x 148 mm), Classic Demimatt / Classic Gloss (prezzo identico
// verificato su 100/130/350 g), Front & back side different, 4/4, Fold None.
// NESSUN valore derivato dalla matrice A5. [quantita', prezzoBase] crescente.
// 25.000 NON e' un punto benchmark Pixart -> interpolazione lineare 20k<->30k.
// ---------------------------------------------------------------------------

export const PRINT_A6_BENCHMARK_SOURCE = "Pixartprinting.it (2026-08-28, ex IVA, consegna standard/economy)";

export const PRINT_A6_BENCHMARK_CONFIG = Object.freeze({
  format: "A6",
  paper: ["patinata_opaca", "patinata_lucida"],
  sides: "fronte_retro", // fronte e retro differenti
  color: "colori", // 4/4
  fold: "nessuna",
  delivery: "standard",
});

export const PRINT_A6_BENCHMARKS = Object.freeze({
  "100": [
    [1000, 37.22], [2500, 44.67], [5000, 50.26], [7500, 69.53], [10000, 72.28],
    [15000, 117.85], [20000, 141.98], [30000, 197.53], [40000, 236.51], [50000, 283.18],
  ],
  "130": [
    [1000, 37.9], [2500, 46.27], [5000, 59.8], [7500, 73.4], [10000, 82.98],
    [15000, 133.12], [20000, 159.93], [30000, 222.29], [40000, 274.65], [50000, 327.01],
  ],
  "170": [
    [1000, 39.24], [2500, 49.47], [5000, 64.95], [7500, 81.13], [10000, 97.5],
    [15000, 149.18], [20000, 188.59], [30000, 264.11], [40000, 335.54], [50000, 406.97],
  ],
  "250": [
    [1000, 49.29], [2500, 62.55], [5000, 85.05], [7500, 110.38], [10000, 131.91],
    [15000, 201.36], [20000, 253.34], [30000, 375.0], [40000, 480.82], [50000, 586.65],
  ],
  "300": [
    [1000, 44.39], [2500, 69.16], [5000, 101.2], [7500, 129.55], [10000, 153.62],
    [15000, 232.47], [20000, 299.64], [30000, 441.11], [40000, 571.53], [50000, 701.96],
  ],
  "350": [
    [1000, 54.17], [2500, 81.67], [5000, 110.52], [7500, 149.95], [10000, 176.86],
    [15000, 273.28], [20000, 341.98], [30000, 520.12], [40000, 669.2], [50000, 825.96],
  ],
});

export const PRINT_A6_GRAMMAGES = Object.keys(PRINT_A6_BENCHMARKS);

// ---------------------------------------------------------------------------
// Matrice A4 — prezzi BASE di mercato letti DIRETTAMENTE da Pixartprinting.it
// (endpoint /product/quote/, IT, CAP 30020, 2026-08-28, ex IVA, tier consegna
// "Fast 120" = produzione 120h = standard/economy, la colonna piu' economica).
// Config: A4 (210 x 297 mm), Classic Demimatt / Classic Gloss (prezzo identico
// verificato su 100/130/350 g), 4/4, Fold None. LATI: solo fronte, fronte/retro
// uguali e fronte/retro differenti risultano TUTTI allo stesso prezzo — verificato
// dal vivo sul configuratore reale (130 g e 250 g, ricalcolo forzato). Vale SOLO
// per A4. NESSUN valore derivato da A5/A6. [quantita', prezzoBase] crescente.
// 25.000 NON e' un punto benchmark Pixart -> interpolazione lineare 20k<->30k.
// ---------------------------------------------------------------------------

export const PRINT_A4_BENCHMARK_SOURCE = "Pixartprinting.it (2026-08-28, ex IVA, consegna standard/economy)";

export const PRINT_A4_BENCHMARK_CONFIG = Object.freeze({
  format: "A4",
  paper: ["patinata_opaca", "patinata_lucida"],
  sides: ["fronte", "fronte_retro_eq", "fronte_retro"], // A4: tutti e 3 allo stesso prezzo (dato reale)
  color: "colori", // 4/4
  fold: "nessuna",
  delivery: "standard",
});

export const PRINT_A4_BENCHMARKS = Object.freeze({
  "100": [
    [1000, 65.67], [2500, 101.56], [5000, 150.86], [7500, 197.53], [10000, 250.42],
    [15000, 349.25], [20000, 464.39], [30000, 664.44], [40000, 864.49], [50000, 1064.54],
  ],
  "130": [
    [1000, 68.79], [2500, 115.89], [5000, 169.92], [7500, 222.29], [10000, 290.8],
    [15000, 401.68], [20000, 541.04], [30000, 775.12], [40000, 1009.2], [50000, 1243.28],
  ],
  "170": [
    [1000, 84.08], [2500, 129.16], [5000, 200.37], [7500, 264.11], [10000, 355.28],
    [15000, 498.4], [20000, 685.75], [30000, 987.89], [40000, 1298.62], [50000, 1609.36],
  ],
  "250": [
    [1000, 98.75], [2500, 168.01], [5000, 269.17], [7500, 375.0], [10000, 509.11],
    [15000, 733.21], [20000, 1010.5], [30000, 1475.01], [40000, 1948.12], [50000, 2412.63],
  ],
  "300": [
    [1000, 108.03], [2500, 195.43], [5000, 318.37], [7500, 448.79], [10000, 605.15],
    [15000, 881.35], [20000, 1213.26], [30000, 1787.75], [40000, 2353.65], [50000, 2928.13],
  ],
  "350": [
    [1000, 127.32], [2500, 224.88], [5000, 363.36], [7500, 520.12], [10000, 708.56],
    [15000, 1032.39], [20000, 1431.57], [30000, 2115.21], [40000, 2798.85], [50000, 3482.49],
  ],
});

export const PRINT_A4_GRAMMAGES = Object.keys(PRINT_A4_BENCHMARKS);

// Tabelle benchmark per formato di stampa configurato.
const BENCHMARK_TABLES = Object.freeze({ A5: PRINT_A5_BENCHMARKS, A6: PRINT_A6_BENCHMARKS, A4: PRINT_A4_BENCHMARKS });
const BENCHMARK_SOURCES = Object.freeze({ A5: PRINT_A5_BENCHMARK_SOURCE, A6: PRINT_A6_BENCHMARK_SOURCE, A4: PRINT_A4_BENCHMARK_SOURCE });
const BENCHMARK_GRAMMAGES = Object.freeze({ A5: PRINT_A5_GRAMMAGES, A6: PRINT_A6_GRAMMAGES, A4: PRINT_A4_GRAMMAGES });

export function grammagesForPrintFormat(id) {
  return BENCHMARK_GRAMMAGES[String(id || "").toUpperCase()] || [];
}

// Valori di configurazione coperti dai dati reali. Carta / colore / piega sono
// identici per A5, A6 e A4: stessa famiglia carta "Classic" (opaca == lucida),
// stesso colore (4/4), stessa piega (nessuna). "Uso mano" resta fuori (su A6 e
// A4 il fornitore usa solo 90 g/m², incompatibile con la matrice).
const A5_PAPER_CONFIRMED = new Set([
  "patinata_opaca", "patinata_lucida", "classic_demimatt", "classic_gloss",
  "couche", "couché", "patinata",
]);
// LATI — su A4, A5 e A6 (prodotto "Volantini e Flyer" Pixartprinting) il
// prezzo NON varia col tipo di stampa: solo fronte, fronte/retro uguali e
// fronte/retro differenti risultano allo stesso identico prezzo reale.
// Equivalenza VERIFICATA dal vivo sul configuratore (endpoint /product/quote/,
// 2026-08-28, CAP 30020, tier 144-120-Fast) per OGNI formato e OGNI grammatura
// in matrice: A5 {100,130,170,250,300,350}g e A6 {100,130,170,250,300,350}g,
// layout confermato sia nella gallery UI sia nel body della richiesta.
// NESSUN moltiplicatore: il prezzo continua a venire SOLO da
// (formato -> tabella) + quantita' + grammatura.
const SIDES_CONFIRMED_DIFF_ONLY = new Set([
  "fronte_retro", "front_back_different", "fronte_retro_diff", "fronte_retro_differenti",
]);
const SIDES_CONFIRMED_ALL = new Set([
  ...SIDES_CONFIRMED_DIFF_ONLY,
  "fronte", "solo_fronte", "front_only", "front_side_only", "solo fronte",
  "fronte_retro_eq", "fronte_retro_uguali", "fronte_retro_uguale", "front_back_same", "fronte retro uguali",
]);
// Tutti i formati con matrice reale coprono i 3 tipi di lati allo stesso prezzo.
const SIDES_CONFIRMED_BY_FORMAT = Object.freeze({
  A5: SIDES_CONFIRMED_ALL,
  A6: SIDES_CONFIRMED_ALL,
  A4: SIDES_CONFIRMED_ALL,
});
function sidesConfirmedFor(fmt, sides) {
  const set = SIDES_CONFIRMED_BY_FORMAT[String(fmt || "").toUpperCase()] || SIDES_CONFIRMED_DIFF_ONLY;
  return set.has(normKey(sides));
}
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
 * Prezzo BASE di mercato per (formato stampa, grammatura, quantita') —
 * interpolazione lineare tra i punti della STESSA grammatura e dello STESSO
 * formato. Formati coperti: A5, A6, A4 (matrici indipendenti). Altro -> null.
 * @returns {{ price:number|null, exact:boolean, belowMin:boolean, aboveMax:boolean }}
 */
export function benchmarkBasePrice(printFormat, quantity, grammage) {
  const tables = BENCHMARK_TABLES[String(printFormat || "").toUpperCase()];
  if (!tables) {
    return { price: null, exact: false, belowMin: false, aboveMax: false };
  }
  const table = tables[normGrammage(grammage)];
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
 * @param {string} [p.sides]      "fronte" (solo fronte) / "fronte_retro_eq"
 *                                (f/r uguali) / "fronte_retro" (f/r differenti):
 *                                su A4/A5/A6 tutti coperti allo stesso prezzo
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
  // Lista grammature del formato richiesto (A5/A6 hanno matrici dedicate).
  const gramList = BENCHMARK_GRAMMAGES[fmt] || PRINT_A5_GRAMMAGES;

  const configurationMultipliers = {
    grammage: GRAMMAGE_MULTIPLIER, sides: SIDES_MULTIPLIER, color: COLOR_MULTIPLIER,
    paper: PAPER_MULTIPLIER, fold: FOLD_MULTIPLIER, orientation: ORIENTATION_MULTIPLIER,
    urgency: PRINT_URGENCY_MULTIPLIER,
  };
  const calibration = {
    grammage: gramList.includes(gKey),
    sides: sidesConfirmedFor(fmt, sides),
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
  if (fmt !== "A5" && fmt !== "A6" && fmt !== "A4") return { ...base, reviewReasons: ["format:" + (fmt || "?")] };

  // A5 / A6 / A4 — verifica che ogni dimensione sia coperta dai dati reali del
  // formato. LATI: su tutti e 3 i formati i tre tipi (solo fronte / f/r uguali /
  // f/r differenti) sono coperti allo stesso prezzo reale (verificato dal vivo).
  const reasons = [];
  if (!gramList.includes(gKey)) reasons.push("grammage:" + (gKey || "?"));
  if (!sidesConfirmedFor(fmt, sides)) reasons.push("sides:" + (normKey(sides) || "?"));
  if (!A5_COLOR_CONFIRMED.has(normKey(color))) reasons.push("color:" + (normKey(color) || "?"));
  if (!A5_PAPER_CONFIRMED.has(normKey(paperType))) reasons.push("paper:" + (normKey(paperType) || "?"));
  if (!A5_FOLD_CONFIRMED.has(normKey(fold))) reasons.push("fold:" + (normKey(fold) || "?"));

  if (reasons.length > 0) return { ...base, reviewReasons: reasons, grammageUsed: gramList.includes(gKey) ? gKey : null };

  const bench = benchmarkBasePrice(fmt, quantity, gKey);
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
    source: BENCHMARK_SOURCES[fmt] || PRINT_A5_BENCHMARK_SOURCE,
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
