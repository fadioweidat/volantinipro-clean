/* STAMPA — motore prezzi stampa centralizzato (unica fonte).
 *
 * BENCHMARK INTERNI (non "listino fisso Pixartprinting"): valori BASE stampa
 * osservati su schermate reali del configuratore di un fornitore terzo e usati
 * come riferimento interno. Possono cambiare nel tempo — non vanno mostrati al
 * cliente come "prezzi fornitore".
 *
 * Configurazione dei benchmark A6/A5 (BASE):
 *   carta patinata · ~130/135 g · fronte/retro differenti · colore · nessuna
 *   piega · consegna standard
 *
 * PREZZO VERIFICATO = SOLO:
 *   quantity + printFormat (A6/A5) + interpolazione lineare + markup 20%.
 *   customerPrice = benchmarkBasePrice(quantity, printFormat) * 1.20
 * con volantiniProMarkupPct = 20 (INTERNO, mai esposto come voce separata).
 *
 * grammage / sides / color / paperType / fold / orientation / urgency: NON
 * hanno benchmark reali distinti -> moltiplicatore 1.00 (nessun effetto sul
 * prezzo). Vengono comunque salvati nella specifica/preventivo e ognuno espone
 * un flag `*Calibrated` (true solo per il valore = config benchmark).
 *
 * A4: nessun benchmark reale sufficiente -> NOT_CONFIGURED. Non si inventa un
 * listino: il motore ritorna formatConfigured=false e customerPrice=null.
 *
 * DL: NON e' un formato di stampa. Resta solo come materialFormat (logistica).
 */

// ---------------------------------------------------------------------------
// Formati
// ---------------------------------------------------------------------------

// Formati disponibili per la PRODUZIONE di stampa (A4 incluso nella UI ma
// senza benchmark: vedi PRINT_FORMAT_STATUS).
export const PRINT_FORMAT_OPTIONS = [
  { id: "A6", label: "A6", size: "10,5×14,8 cm" },
  { id: "A5", label: "A5", size: "14,8×21 cm" },
  { id: "A4", label: "A4", size: "21×29,7 cm" },
];

export const PRINT_FORMAT_IDS = PRINT_FORMAT_OPTIONS.map((o) => o.id);

// Formati disponibili come MATERIALE da distribuire (dimensione/peso/logistica).
export const MATERIAL_FORMAT_OPTIONS = [
  { id: "A6", label: "A6", size: "10,5×14,8 cm" },
  { id: "A5", label: "A5", size: "14,8×21 cm" },
  { id: "A4", label: "A4", size: "21×29,7 cm" },
  { id: "DL", label: "DL", size: "10×21 cm" },
];

export function isPrintableFormat(id) {
  return PRINT_FORMAT_IDS.includes(String(id || "").toUpperCase());
}

// Normalizza un formato materiale al formato stampa piu' vicino (DL -> A5,
// sconosciuto -> A5). Usato quando la stampa viene attivata e il formato
// materiale/logistico deve sincronizzarsi con quello di stampa.
export function toPrintableFormat(id) {
  const upper = String(id || "").toUpperCase();
  return PRINT_FORMAT_IDS.includes(upper) ? upper : "A5";
}

// ---------------------------------------------------------------------------
// Benchmark base (euro, IVA esclusa) — SOLO valori realmente osservati.
// ---------------------------------------------------------------------------

export const PRINT_BENCHMARK_CONFIG = Object.freeze({
  grammage: "135",
  sides: "front_back_different",
  color: "full_color",
  fold: "none",
  urgency: "standard",
});

// [quantita', prezzo BASE €] in ordine crescente di quantita'.
export const PRINT_BENCHMARKS = Object.freeze({
  A6: [
    [1000, 49.0],
    [2500, 55.5],
    [10000, 76.0],
    [15000, 112.87],
    [20000, 149.83],
    [30000, 223.7],
    [40000, 297.37],
    [50000, 371.44],
  ],
  A5: [
    [1000, 55.0],
    [2500, 70.0],
    [10000, 110.0],
    [15000, 160.0],
    [20000, 210.67],
    [30000, 311.67],
    [40000, 412.67],
    [50000, 513.67],
  ],
  // A4: nessun benchmark reale -> gestito come NOT_CONFIGURED.
});

export const PRINT_FORMAT_STATUS = Object.freeze({
  A6: "CONFIGURED",
  A5: "CONFIGURED",
  A4: "NOT_CONFIGURED",
});

export function isPrintFormatConfigured(id) {
  return PRINT_FORMAT_STATUS[String(id || "").toUpperCase()] === "CONFIGURED";
}

// ---------------------------------------------------------------------------
// Margine VolantiniPro (INTERNO — mai mostrato come voce separata al cliente).
// ---------------------------------------------------------------------------
export const VOLANTINIPRO_MARKUP_PCT = 20;

// ---------------------------------------------------------------------------
// Configurazione: moltiplicatori di prezzo.
//
// STATO ATTUALE — nessun benchmark reale DISTINTO per grammatura, lati,
// colore, carta, piega, orientamento, urgenza-stampa. Finche' il business non
// fornisce listini reali per queste varianti, TUTTI i moltiplicatori restano
// 1.00: le opzioni scelte vengono salvate nella specifica/preventivo ma NON
// modificano il prezzo. Ogni parametro espone un flag `*Calibrated` che vale
// true solo per il valore che coincide con la configurazione dei benchmark.
//
// L'UNICO input di prezzo verificato e': QUANTITA' + PRINT FORMAT (A6/A5) +
// INTERPOLAZIONE + margine VolantiniPro 20%.
// ---------------------------------------------------------------------------

// Grammatura — la UI salva 100/130/170/250/300/350 (+ valori legacy). Prezzo
// invariato per tutte; calibrata solo 130 g (config benchmark ~130/135 g).
export const GRAMMAGE_MULTIPLIER = 1.0;
export const GRAMMAGE_CALIBRATED_VALUES = Object.freeze(["130"]);

// Lati — solo fronte / fronte-retro uguali / fronte-retro differenti. Prezzo
// invariato per tutti; calibrato solo fronte-retro (differenti) = benchmark.
export const SIDES_MULTIPLIER = 1.0;
export const SIDES_CALIBRATED_VALUES = Object.freeze([
  "fronte_retro",
  "front_back_different",
  "fronte_retro_diff",
]);

// Colore — colori / bianco-nero. Prezzo invariato per entrambi; calibrato solo
// full color = benchmark. NIENTE sconto ×0.90 per B/N (non verificato).
export const COLOR_MULTIPLIER = 1.0;
export const COLOR_CALIBRATED_VALUES = Object.freeze(["colori", "full_color", "color", "cmyk"]);

// Carta — patinata lucida/opaca/usomano. Prezzo invariato; calibrata patinata.
export const PAPER_MULTIPLIER = 1.0;
export const PAPER_CALIBRATED_VALUES = Object.freeze([
  "patinata_lucida",
  "patinata_opaca",
  "patinata",
  "couche",
]);

// Piega — nessun benchmark reale: 1.00 per ogni opzione.
export const FOLD_MULTIPLIER = 1.0;
export const FOLD_CALIBRATED_VALUES = Object.freeze(["nessuna", "none"]);

// Orientamento — verticale / orizzontale: 1.00 (salvato nel preventivo, nessuna
// variante di prezzo). Entrambi i valori sono "calibrati" (nessuna incognita).
export const ORIENTATION_MULTIPLIER = 1.0;
export const ORIENTATION_CALIBRATED_VALUES = Object.freeze([
  "verticale",
  "orizzontale",
  "vertical",
  "horizontal",
  "portrait",
  "landscape",
]);

// Urgenza / data consegna — nessuna maggiorazione sulla stampa (l'urgenza
// resta gestita solo sulla distribuzione, per non applicarla due volte).
// urgent/express: 1.00 + calibrated=false.
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

/**
 * Prezzo BASE benchmark per (formato, quantita'), interpolazione lineare.
 * - sotto il minimo benchmark: prezzo del minimo (non si scende sotto);
 * - tra due benchmark: interpolazione lineare;
 * - sopra il massimo benchmark: estensione lineare sull'ultimo intervallo
 *   disponibile + flag estimatedBeyondBenchmark.
 * Il prezzo non diminuisce mai al crescere della quantita'.
 * @returns {{ price: number|null, estimatedBeyondBenchmark: boolean, belowMinBenchmark: boolean, configured: boolean }}
 */
export function benchmarkBasePrice(printFormat, quantity) {
  const fmt = String(printFormat || "").toUpperCase();
  const table = PRINT_BENCHMARKS[fmt];
  if (!table || !isPrintFormatConfigured(fmt)) {
    return { price: null, estimatedBeyondBenchmark: false, belowMinBenchmark: false, configured: false };
  }
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { price: null, estimatedBeyondBenchmark: false, belowMinBenchmark: false, configured: true };
  }

  const [minQty, minPrice] = table[0];
  const [maxQty, maxPrice] = table[table.length - 1];

  if (qty <= minQty) {
    return { price: minPrice, estimatedBeyondBenchmark: false, belowMinBenchmark: qty < minQty, configured: true };
  }

  if (qty >= maxQty) {
    if (qty === maxQty) {
      return { price: maxPrice, estimatedBeyondBenchmark: false, belowMinBenchmark: false, configured: true };
    }
    // Estensione lineare sull'ultimo intervallo (pendenza dell'ultimo tratto).
    const [prevQty, prevPrice] = table[table.length - 2];
    const slope = (maxPrice - prevPrice) / (maxQty - prevQty);
    const price = maxPrice + (qty - maxQty) * slope;
    return { price, estimatedBeyondBenchmark: true, belowMinBenchmark: false, configured: true };
  }

  for (let i = 0; i < table.length - 1; i += 1) {
    const [lowerQty, lowerPrice] = table[i];
    const [upperQty, upperPrice] = table[i + 1];
    if (qty >= lowerQty && qty <= upperQty) {
      const ratio = (qty - lowerQty) / (upperQty - lowerQty);
      const price = lowerPrice + (upperPrice - lowerPrice) * ratio;
      return { price, estimatedBeyondBenchmark: false, belowMinBenchmark: false, configured: true };
    }
  }
  // Non dovrebbe accadere.
  return { price: maxPrice, estimatedBeyondBenchmark: false, belowMinBenchmark: false, configured: true };
}

/**
 * Motore prezzi stampa centralizzato.
 *
 * L'UNICO input di prezzo verificato: quantity + printFormat (A6/A5) +
 * interpolazione + markup 20%. grammage/sides/color/paper/fold/orientation/
 * urgency vengono solo registrati (moltiplicatore 1.00) e ognuno ritorna un
 * flag `*Calibrated`.
 *
 * @param {Object} p
 * @param {number} p.quantity
 * @param {string} p.printFormat  "A6" | "A5" | "A4"
 * @param {string} [p.grammage]   valore salvato (nessun effetto sul prezzo)
 * @param {string} [p.sides]      valore salvato (nessun effetto sul prezzo)
 * @param {string} [p.color]      valore salvato (nessun effetto sul prezzo)
 * @param {string} [p.paperType]  valore salvato (nessun effetto sul prezzo)
 * @param {string} [p.fold]       valore salvato (nessun effetto sul prezzo)
 * @param {string} [p.orientation] valore salvato (nessun effetto sul prezzo)
 * @param {string} [p.urgency]    "standard" | "urgent" | "express"
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

  const calibration = {
    grammage: GRAMMAGE_CALIBRATED_VALUES.includes(normKey(grammage)),
    sides: SIDES_CALIBRATED_VALUES.includes(normKey(sides)),
    color: COLOR_CALIBRATED_VALUES.includes(normKey(color)),
    paper: PAPER_CALIBRATED_VALUES.includes(normKey(paperType)),
    fold: FOLD_CALIBRATED_VALUES.includes(normKey(fold)),
    orientation: orientation == null || ORIENTATION_CALIBRATED_VALUES.includes(normKey(orientation)),
    urgency: PRINT_URGENCY_CALIBRATED_VALUES.includes(urgencyKey),
  };
  // Tutti i moltiplicatori di configurazione sono 1.00 (nessun benchmark reale).
  const configurationMultipliers = {
    grammage: GRAMMAGE_MULTIPLIER,
    sides: SIDES_MULTIPLIER,
    color: COLOR_MULTIPLIER,
    paper: PAPER_MULTIPLIER,
    fold: FOLD_MULTIPLIER,
    orientation: ORIENTATION_MULTIPLIER,
    urgency: PRINT_URGENCY_MULTIPLIER,
  };
  const configurationAdjustment = 1.0;

  const empty = {
    formatConfigured: isPrintFormatConfigured(fmt),
    baseBenchmarkPrice: null,
    configurationAdjustment,
    configurationMultipliers,
    calibration,
    basePrintPrice: null,
    volantiniProMarkupPct: VOLANTINIPRO_MARKUP_PCT,
    volantiniProMarkup: null,
    customerPrice: null,
    estimatedBeyondBenchmark: false,
    belowMinBenchmark: false,
    urgencyCalibrated: calibration.urgency,
  };

  if (enabled === false) return empty;

  const bench = benchmarkBasePrice(fmt, quantity);
  if (!bench.configured || bench.price == null) {
    return { ...empty, formatConfigured: bench.configured };
  }

  // Prezzo verificato = SOLO benchmark(quantita', formato) * 1.20.
  const basePrintPrice = round2(bench.price);
  const customerPrice = round2(bench.price * (1 + VOLANTINIPRO_MARKUP_PCT / 100));
  const volantiniProMarkup = round2(customerPrice - basePrintPrice);

  return {
    formatConfigured: true,
    baseBenchmarkPrice: round2(bench.price),
    configurationAdjustment,
    configurationMultipliers,
    calibration,
    basePrintPrice,
    volantiniProMarkupPct: VOLANTINIPRO_MARKUP_PCT,
    volantiniProMarkup,
    customerPrice,
    estimatedBeyondBenchmark: bench.estimatedBeyondBenchmark,
    belowMinBenchmark: bench.belowMinBenchmark,
    urgencyCalibrated: calibration.urgency,
  };
}

/**
 * Stima del costo stampa mostrata al cliente (customerPrice del motore
 * centralizzato). Compat con il vecchio nome usato da extraServicesRegistry /
 * Step1. Ritorna 0 quando la stampa non e' attiva o il formato non e'
 * configurato (A4) o la quantita' non e' valida.
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
  fold,
  urgency,
} = {}) {
  if (enabled === false) return 0;
  const res = calculatePrintPrice({
    quantity,
    printFormat: printFormat || format || "A5",
    grammage,
    sides,
    color,
    fold,
    urgency,
  });
  return res.customerPrice == null ? 0 : res.customerPrice;
}
