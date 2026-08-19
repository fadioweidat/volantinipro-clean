// P1 PRICING ENGINE — griglia territoriale Door-to-Door.
//
// STAMPA: questo modulo non calcola MAI il prezzo stampa. La griglia sotto
// riguarda esclusivamente la distribuzione D2D. Il prezzo stampa resta
// esattamente dov'era (extraServicesRegistry.js, voce "printing",
// Math.ceil(flyerQty/1000)*12) — invariato, non importato ne' referenziato
// qui.
//
// Funzioni pure e testabili (nessun accesso a rete/DB/React qui dentro).

export const TERRITORY_TIERS = {
  MILANO_CORE: "MILANO_CORE",
  HINTERLAND_DENSE: "HINTERLAND_DENSE",
  COMO_LECCO: "COMO_LECCO",
  LOW_DENSITY_MOUNTAIN: "LOW_DENSITY_MOUNTAIN",
};

export const TERRITORY_LABELS = {
  [TERRITORY_TIERS.MILANO_CORE]: "Milano",
  [TERRITORY_TIERS.HINTERLAND_DENSE]: "Hinterland denso",
  [TERRITORY_TIERS.COMO_LECCO]: "Como/Lecco",
  [TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN]: "Montagna",
};

// Griglia commerciale V1 (sezione 3 del ticket), IVA esclusa — nessuna
// modifica al trattamento IVA, il sistema gia' lavora IVA esclusa a monte
// (QUOTE_PRICES in appConstants.js non applica IVA).
const GRID_QUANTITIES = [1000, 2500, 5000, 10000, 20000, 30000, 50000];
const DISTRIBUTION_GRID = {
  [TERRITORY_TIERS.MILANO_CORE]: [120, 150, 210, 350, 660, 960, 1500],
  [TERRITORY_TIERS.HINTERLAND_DENSE]: [140, 180, 260, 420, 800, 1170, 1850],
  [TERRITORY_TIERS.COMO_LECCO]: [170, 230, 330, 520, 1000, 1450, 2300],
  [TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN]: [220, 320, 450, 750, 1450, 2100, 3350],
};

// Minimo economico per campagna (sezione 5) — stesso valore del primo tier
// (1.000 pz) di ciascun territorio, per costruzione: max(prezzo, minimo)
// garantisce che nessuna quantita' piccola scenda sotto il costo minimo
// commerciale di quel territorio.
export const TERRITORY_MINIMUMS = {
  [TERRITORY_TIERS.MILANO_CORE]: 120,
  [TERRITORY_TIERS.HINTERLAND_DENSE]: 140,
  [TERRITORY_TIERS.COMO_LECCO]: 170,
  [TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN]: 220,
};

/**
 * Arrotondamento monetario unico e coerente (sezione 23): centesimi interi
 * via Math.round su valore*100, per evitare incoerenze da floating point
 * (0.1+0.2 style) — nessuna seconda rappresentazione monetaria introdotta,
 * si resta in euro float ma con un solo punto di arrotondamento condiviso.
 */
export function roundMoney(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Interpolazione lineare a tratti tra i tier della griglia (sezione 4:
 * "NON fare scalini brutali... implementare interpolazione o pricing
 * progressivo coerente"). Pura, deterministica, monotona per costruzione
 * (ogni tier della griglia sorgente e' >= del precedente in tutti i
 * territori). Sotto il primo tier e sopra l'ultimo si estrapola con la
 * pendenza del segmento piu' vicino, poi il chiamante applica comunque il
 * minimo economico (vedi calculateDistributionZonePrice).
 * @returns {number|null}
 */
export function interpolateGridPrice(territory, quantity) {
  const prices = DISTRIBUTION_GRID[territory];
  if (!prices || !Number.isFinite(quantity) || quantity <= 0) return null;

  if (quantity <= GRID_QUANTITIES[0]) {
    // Estrapolazione verso il basso con la pendenza del primo segmento,
    // mai sotto zero — il minimo economico (applicato a monte) e' comunque
    // la garanzia reale per quantita' molto piccole.
    const slope = (prices[1] - prices[0]) / (GRID_QUANTITIES[1] - GRID_QUANTITIES[0]);
    return Math.max(0, prices[0] + slope * (quantity - GRID_QUANTITIES[0]));
  }
  const lastIdx = GRID_QUANTITIES.length - 1;
  if (quantity >= GRID_QUANTITIES[lastIdx]) {
    const slope = (prices[lastIdx] - prices[lastIdx - 1]) / (GRID_QUANTITIES[lastIdx] - GRID_QUANTITIES[lastIdx - 1]);
    return prices[lastIdx] + slope * (quantity - GRID_QUANTITIES[lastIdx]);
  }
  for (let i = 0; i < lastIdx; i += 1) {
    const qLo = GRID_QUANTITIES[i];
    const qHi = GRID_QUANTITIES[i + 1];
    if (quantity >= qLo && quantity <= qHi) {
      const pLo = prices[i];
      const pHi = prices[i + 1];
      const ratio = (quantity - qLo) / (qHi - qLo);
      return pLo + (pHi - pLo) * ratio;
    }
  }
  return null; // irraggiungibile, solo per completezza
}

/**
 * Prezzo distribuzione per UNA zona/comune (sezione 5: max(calcolato,
 * minimo)).
 */
export function calculateDistributionZonePrice(territory, quantity) {
  const interpolated = interpolateGridPrice(territory, quantity);
  if (interpolated === null) return null;
  const minimum = TERRITORY_MINIMUMS[territory] ?? 0;
  return roundMoney(Math.max(interpolated, minimum));
}

/**
 * Sezione 7 — campagna multi-comune: somma dei prezzi di zona, MAI la
 * tariffa del primo comune applicata all'intera quantita'. Ogni zona porta
 * la propria quantita' e il proprio territorio (gia' risolto a monte, es.
 * da campaign_zones se disponibile — questa funzione non decide la fonte
 * dati, riceve solo {territory, quantity} gia' pronti).
 * @param {{territory: string, quantity: number}[]} zones
 * @returns {{zonePrices: {territory:string, quantity:number, price:number}[], distributionSubtotal: number}}
 */
export function calculateMultiZoneDistributionPrice(zones) {
  const list = Array.isArray(zones) ? zones : [];
  const zonePrices = list.map((z) => ({
    territory: z.territory,
    quantity: z.quantity,
    price: calculateDistributionZonePrice(z.territory, z.quantity),
  }));
  const distributionSubtotal = roundMoney(
    zonePrices.reduce((sum, z) => sum + (z.price ?? 0), 0)
  );
  return { zonePrices, distributionSubtotal };
}

// ---------------------------------------------------------------------
// Classificazione territoriale (sezione 6)
// ---------------------------------------------------------------------
//
// V1, dichiarato esplicitamente: la pipeline dati reale a runtime (Step2 /
// analysis-istat edge function, vedi src/lib/step2/zoneGeoHelpers.js)
// espone densita' reale per comune (density_per_km2) ma NON espone oggi
// provincia ne' una classificazione altimetrica/montana — verificato via
// audit di questo ticket (grep su zoneGeoHelpers.js/zoneData.js/
// buildServiceAnalysisRequest.js, zero occorrenze di provincia/is_mountain/
// zona_altimetrica). Costruire un secondo canale dati (parsing dei CSV
// ISTAT grezzi in data/istat/raw/, non ancora collegati a runtime) e'
// fuori scope per questo V1.
//
// Classificazione quindi a DUE livelli, entrambi onesti (nessun dato
// inventato):
//   1. ANCORE ESPLICITE: i comuni che il ticket stesso nomina come esempio
//      per ciascun tier (sezione 6: Milano; Seveso/Meda/Cormano/Sesto;
//      Como/Lecco; Sondrio) — non e' "hardcodare quattro nomi di citta'",
//      e' codificare testualmente gli esempi che la specifica stessa da'
//      come riferimento commerciale, cosi' i casi test della sezione 22
//      sono deterministici senza bisogno di una chiamata di rete.
//   2. FALLBACK PRUDENTE (qualunque comune non nell'elenco sopra): soglie
//      di densita' reale (density_per_km2, dato gia' disponibile a runtime)
//      calibrate sui riferimenti di produttivita' operativa dati dal
//      ticket stesso (sezione 2: Milano 2500-3000/operatore/giorno,
//      hinterland ~2000, Como/Lecco 1000-1500, montagna 500-1000) — piu'
//      alta la densita' abitativa, piu' alta la produttivita' di consegna
//      porta a porta, che e' esattamente la giustificazione di business
//      data nel ticket per far scendere il prezzo. Se la densita' non e'
//      disponibile (comune sconosciuto, dato mancante), fallback finale a
//      HINTERLAND_DENSE (il tier centrale, ne' il piu' economico ne' il
//      piu' caro) con un flag `confidence: 'low'` esplicito da mostrare in
//      UI/log — MAI un default silenzioso spacciato per certo.
const EXPLICIT_TERRITORY_ANCHORS = {
  milano: TERRITORY_TIERS.MILANO_CORE,
  seveso: TERRITORY_TIERS.HINTERLAND_DENSE,
  meda: TERRITORY_TIERS.HINTERLAND_DENSE,
  cormano: TERRITORY_TIERS.HINTERLAND_DENSE,
  sesto: TERRITORY_TIERS.HINTERLAND_DENSE,
  "sesto san giovanni": TERRITORY_TIERS.HINTERLAND_DENSE,
  como: TERRITORY_TIERS.COMO_LECCO,
  lecco: TERRITORY_TIERS.COMO_LECCO,
  sondrio: TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN,
};

// Soglie calibrate sulle fasce di produttivita' del ticket (flyer/operatore/
// giorno): valori piu' alti -> tier piu' economico. Confini scelti a meta'
// tra le fasce indicate per evitare bias verso l'uno o l'altro estremo.
const DENSITY_THRESHOLDS = [
  { min: 6000, tier: TERRITORY_TIERS.MILANO_CORE },
  { min: 2500, tier: TERRITORY_TIERS.HINTERLAND_DENSE },
  { min: 800, tier: TERRITORY_TIERS.COMO_LECCO },
  { min: 0, tier: TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN },
];

function normalizeComuneName(name) {
  return String(name || "").trim().toLowerCase();
}

/**
 * @param {{name?: string, densityPerKm2?: number}} comune
 * @returns {{tier: string, confidence: 'explicit'|'density'|'low', reason: string}}
 */
export function classifyTerritory(comune) {
  const name = normalizeComuneName(comune?.name);
  if (name && EXPLICIT_TERRITORY_ANCHORS[name]) {
    return {
      tier: EXPLICIT_TERRITORY_ANCHORS[name],
      confidence: "explicit",
      reason: `Comune "${comune.name}" presente nell'elenco di riferimento esplicito del ticket.`,
    };
  }

  const density = Number(comune?.densityPerKm2);
  if (Number.isFinite(density) && density >= 0) {
    const match = DENSITY_THRESHOLDS.find((t) => density >= t.min);
    return {
      tier: match.tier,
      confidence: "density",
      reason: `Classificato da densita' reale (${density} ab/km²), nessun dato di provincia/morfologia disponibile in questo V1.`,
    };
  }

  return {
    tier: TERRITORY_TIERS.HINTERLAND_DENSE,
    confidence: "low",
    reason: "Nessun dato territoriale affidabile disponibile (ne' comune noto ne' densita'): fallback prudente al tier centrale, non un dato certo.",
  };
}

// ---------------------------------------------------------------------
// Urgenza (sezioni 9-10)
// ---------------------------------------------------------------------
export const URGENCY_LEVELS = { STANDARD: "standard", URGENT: "urgent", EXPRESS: "express" };
export const URGENCY_SURCHARGE_PCT = {
  [URGENCY_LEVELS.STANDARD]: 0,
  [URGENCY_LEVELS.URGENT]: 20,
  [URGENCY_LEVELS.EXPRESS]: 35,
};

// ---------------------------------------------------------------------
// Piani continuativi (sezioni 11-12)
// ---------------------------------------------------------------------
export const PLAN_CODES = { SINGLE: "single", QUARTERLY: "quarterly", SEMIANNUAL: "semiannual", ANNUAL: "annual" };
export const PLAN_DISCOUNT_PCT = {
  [PLAN_CODES.SINGLE]: 0,
  [PLAN_CODES.QUARTERLY]: 3,
  [PLAN_CODES.SEMIANNUAL]: 5,
  [PLAN_CODES.ANNUAL]: 8,
};

/**
 * Calcolo prezzo distribuzione completo per il servizio D2D (sezioni 9-12):
 *   distributionSubtotal (somma zone, gia' con minimo applicato)
 *   + urgency surcharge (SOLO sulla distribuzione — mai su stampa/extra
 *     non accelerabili, sezione 10: "STAMPA: NON TOCCARE")
 *   = preDiscountSubtotal
 *   - plan discount (sulla distribuzione base + urgenza, sezione 12: "NON
 *     applicarlo automaticamente a stampa/trasporto straordinario/
 *     autorizzazioni/Express surcharge stesso/extra a costo fisso/costi
 *     terzi" — qui infatti si applica SOLO a preDiscountSubtotal, che
 *     contiene solo distribuzione+urgenza, mai gli extra)
 *   = distributionTotal
 * Gli extra (incl. stampa) vanno sommati DOPO da chi chiama, esattamente
 * come gia' fa calculateQuotePricing in quotePricing.js.
 * @param {{zones: {territory:string, quantity:number}[], urgency?: string, planCode?: string}} params
 */
export function calculateDoorToDoorPricing({ zones, urgency = URGENCY_LEVELS.STANDARD, planCode = PLAN_CODES.SINGLE }) {
  const { zonePrices, distributionSubtotal } = calculateMultiZoneDistributionPrice(zones);
  if (distributionSubtotal === null || zonePrices.some((z) => z.price === null)) {
    return { zonePrices, distributionSubtotal: null, urgencySurcharge: null, preDiscountSubtotal: null, planDiscountAmount: null, distributionTotal: null };
  }

  const urgencyPct = URGENCY_SURCHARGE_PCT[urgency] ?? 0;
  const urgencySurcharge = roundMoney(distributionSubtotal * (urgencyPct / 100));
  const preDiscountSubtotal = roundMoney(distributionSubtotal + urgencySurcharge);

  const planPct = PLAN_DISCOUNT_PCT[planCode] ?? 0;
  const planDiscountAmount = roundMoney(preDiscountSubtotal * (planPct / 100));
  const distributionTotal = roundMoney(preDiscountSubtotal - planDiscountAmount);

  return { zonePrices, distributionSubtotal, urgencySurcharge, preDiscountSubtotal, planDiscountAmount, distributionTotal };
}

// ---------------------------------------------------------------------
// Sezione 16-17 — KPI interno Admin, MAI mostrato al Cliente. Nessun costo
// del personale inventato (sezione 17): solo giornate/uomo stimate dalla
// produttivita' territoriale data dal ticket, nessun euro di costo interno.
// ---------------------------------------------------------------------
export const PRODUCTIVITY_FLYERS_PER_OPERATOR_DAY = {
  [TERRITORY_TIERS.MILANO_CORE]: 2750,
  [TERRITORY_TIERS.HINTERLAND_DENSE]: 2000,
  [TERRITORY_TIERS.COMO_LECCO]: 1250,
  [TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN]: 750,
};

/**
 * @returns {{operatorDays:number, assumedTeamSize:number, teamDays:number}|null}
 */
export function estimateOperatorDays(territory, quantity, assumedTeamSize = 3) {
  const perDay = PRODUCTIVITY_FLYERS_PER_OPERATOR_DAY[territory];
  if (!perDay || !Number.isFinite(quantity) || quantity <= 0) return null;
  const operatorDays = quantity / perDay;
  const teamSize = Number.isFinite(assumedTeamSize) && assumedTeamSize > 0 ? assumedTeamSize : 3;
  return {
    operatorDays: Math.round(operatorDays * 100) / 100,
    assumedTeamSize: teamSize,
    teamDays: Math.round((operatorDays / teamSize) * 100) / 100,
  };
}

// ---------------------------------------------------------------------
// Sezione 8 — costo di dispersione: NON implementato in V1.
// ---------------------------------------------------------------------
// Il ticket permette esplicitamente di ometterlo se non sostenibile col
// modello corrente ("Per V1 implementare, solo se sostenibile... NON
// inventare un prezzo senza documentarlo"). Non esiste nel codice attuale
// alcun dato che leghi in modo affidabile "numero di comuni coinvolti" a
// un costo aggiuntivo reale (nessun costo furgone/trasferta/tempo di
// spostamento tracciato oggi, vedi sezione 17) — introdurre un coefficiente
// ora significherebbe inventare un numero non documentato, esplicitamente
// vietato. Il modello multi-comune sopra (somma delle zonePrice_i) GIA'
// riflette correttamente la dispersione nel senso che il ticket richiede
// come minimo ("NON usare automaticamente la tariffa del primo comune"):
// una quantita' divisa su 8 comuni piccoli paga 8 minimi economici
// potenzialmente, invece di un unico prezzo per la quantita' totale — un
// effetto di dispersione GIA' presente strutturalmente, senza bisogno di
// un coefficiente esplicito aggiuntivo.
export const DISPERSION_MODEL = "not_implemented_v1_structural_only";
