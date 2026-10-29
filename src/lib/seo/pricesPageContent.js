// SEO — pagina "Prezzi distribuzione volantini" (approvata 2026-10-25).
// Ogni prezzo viene dal motore reale (distributionPricing.js), stessa fonte di
// configuratore e homepage: nessun importo scritto a mano.
// Hand to Hand: tariffa in attesa di conferma, quindi "Prezzo calcolato sulla
// tua zona" (come in homepage). Business: "Su progetto".
import {
  GRID_QUANTITIES,
  PLAN_CODES,
  PLAN_DISCOUNT_PCT,
  TERRITORY_MINIMUMS,
  TERRITORY_TIERS,
  URGENCY_LEVELS,
  URGENCY_SURCHARGE_PCT,
  calculateDistributionZonePrice,
} from "../pricing/distributionPricing.js";
import { getStartingPricePerThousand } from "../pricing/homepagePricing.js";
import { H2H_FLYERS_ESTIMATE_NOTE, H2H_HOURLY_RATE_EUR, H2H_MIN_HOURS_PER_OUTING, calculateHandToHandPricing } from "../pricing/handToHandPricing.js";
import { ALL_CITY_SLUGS, PUBLIC_TIER_LABELS, cityFacts, cityPageKey, cityPath, formatEuro, formatInt } from "./cityPagesData.js";

const TIERS = [
  TERRITORY_TIERS.MILANO_CORE,
  TERRITORY_TIERS.HINTERLAND_DENSE,
  TERRITORY_TIERS.COMO_LECCO,
  TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN,
];

const perThousand = (tier, qty) => calculateDistributionZonePrice(tier, qty) / qty * 1000;
const lowestRate = getStartingPricePerThousand("d2d");
const lowestRatePoint = TIERS.flatMap((tier) => GRID_QUANTITIES.map((qty) => ({ tier, qty })))
  .find(({ tier, qty }) => perThousand(tier, qty) === lowestRate);
const milano5000 = cityFacts("milano").price5000;

export const pricesPageContent = {
  pageKey: "prices",
  h1: "Prezzi della distribuzione volantini",
  intro:
    "I prezzi di questa pagina sono quelli del motore di calcolo del configuratore: solo distribuzione Door to Door, IVA esclusa. Il preventivo finale si calcola sulla tua zona e aggiunge stampa, urgenza ed eventuali extra.",
  tierColumns: TIERS.map((tier) => ({ tier, label: PUBLIC_TIER_LABELS[tier] })),

  // Quantita' tipiche, in evidenza.
  typical: [5000, 10000].map((qty) => ({
    qty,
    label: `${formatInt(qty)} volantini`,
    prices: TIERS.map((tier) => formatEuro(calculateDistributionZonePrice(tier, qty))),
    perThousand: TIERS.map((tier) => formatEuro(Math.round(perThousand(tier, qty)))),
  })),

  // Tabella completa, una riga per gradino della griglia.
  grid: GRID_QUANTITIES.map((qty) => ({
    qty,
    label: formatInt(qty),
    prices: TIERS.map((tier) => formatEuro(calculateDistributionZonePrice(tier, qty))),
  })),
  minimums: TIERS.map((tier) => formatEuro(TERRITORY_MINIMUMS[tier])),

  largeVolumesNote:
    `Da ${formatEuro(lowestRate)} ogni 1.000 volantini solo per grandi quantità: è il prezzo di ${formatInt(lowestRatePoint.qty)} volantini nella fascia «${PUBLIC_TIER_LABELS[lowestRatePoint.tier]}». ` +
    `Per 5.000 volantini a Milano il prezzo è ${formatEuro(milano5000)}, cioè ${formatEuro(Math.round(milano5000 / 5))} ogni 1.000. Tra un gradino e l'altro della tabella il prezzo cresce in modo continuo, senza salti.`,

  tierExplanation: [
    "La fascia dipende dalla densità abitativa del comune, con i dati ISTAT: dove le famiglie sono più vicine l'operatore consegna più volantini all'ora e il prezzo per 1.000 scende.",
    "Alcuni comuni hanno una fascia assegnata direttamente nel motore di calcolo. Il configuratore applica la fascia giusta in automatico quando scegli la zona.",
    "In una campagna su più comuni il prezzo è la somma delle zone: ogni comune con la propria quantità e la propria fascia.",
  ],

  cityExamples: ALL_CITY_SLUGS.map((slug) => {
    const f = cityFacts(slug);
    return { slug, name: f.name, href: cityPath(slug), pageKey: cityPageKey(slug), tierLabel: f.tierLabel, price5000: formatEuro(f.price5000), price10000: formatEuro(f.price10000) };
  }),

  adjustments: [
    `Urgente: +${URGENCY_SURCHARGE_PCT[URGENCY_LEVELS.URGENT]}% sulla distribuzione.`,
    `Express: +${URGENCY_SURCHARGE_PCT[URGENCY_LEVELS.EXPRESS]}% sulla distribuzione.`,
    `Piano trimestrale: −${PLAN_DISCOUNT_PCT[PLAN_CODES.QUARTERLY]}%, semestrale: −${PLAN_DISCOUNT_PCT[PLAN_CODES.SEMIANNUAL]}%, annuale: −${PLAN_DISCOUNT_PCT[PLAN_CODES.ANNUAL]}% sulla distribuzione.`,
    "Stampa e grafica si calcolano a parte nel configuratore, in base a formato e quantità.",
  ],

  otherServices: [
    { title: "Hand to Hand (a mano)", price: `${formatEuro(H2H_HOURLY_RATE_EUR)} l'ora per operatore, minimo ${H2H_MIN_HOURS_PER_OUTING} ore per uscita (IVA esclusa)`, pageKey: "service-hand-to-hand", href: "/servizi/hand-to-hand" },
    { title: "Business (aziende e negozi)", price: "Su progetto", pageKey: "service-business", href: "/servizi/business" },
  ],

  // Hand to Hand a tariffa oraria (handToHandPricing.js): esempi calcolati dal motore.
  handToHand: {
    rate: `${formatEuro(H2H_HOURLY_RATE_EUR)} l'ora per operatore`,
    minimum: `Minimo ${H2H_MIN_HOURS_PER_OUTING} ore per uscita, IVA esclusa.`,
    flyers: `Volantini stimati: ${H2H_FLYERS_ESTIMATE_NOTE}. È una stima, non un numero garantito.`,
    travel: "Fuori da Milano città lo spostamento è calcolato nel preventivo.",
    adjustments: "Urgenza e piani continuativi come per il Door to Door. Lo Smart Pairing non si applica all'Hand to Hand.",
    examples: [[1, 3], [2, 4], [3, 8]].map(([operators, hours]) => {
      const p = calculateHandToHandPricing({ operatorHours: Array.from({ length: operators }, () => hours) });
      return { label: `${operators} ${operators === 1 ? "operatore" : "operatori"} × ${hours} ore`, price: formatEuro(p.total), flyers: `circa ${formatInt(p.flyersRange.min)}–${formatInt(p.flyersRange.max)}` };
    }),
  },

  faqs: [
    {
      q: "Quanto costa distribuire 5.000 volantini?",
      a: `Solo distribuzione Door to Door, IVA esclusa: ${TIERS.map((tier) => `${formatEuro(calculateDistributionZonePrice(tier, 5000))} (${PUBLIC_TIER_LABELS[tier]})`).join(", ")}.`,
    },
    {
      q: "Qual è il prezzo minimo di una campagna?",
      a: `Il minimo a campagna va da ${formatEuro(Math.min(...TIERS.map((t) => TERRITORY_MINIMUMS[t])))} a ${formatEuro(Math.max(...TIERS.map((t) => TERRITORY_MINIMUMS[t])))} secondo la fascia del comune, IVA esclusa.`,
    },
    {
      q: `Il prezzo di ${formatEuro(lowestRate)} ogni 1.000 vale sempre?`,
      a: `No: vale per grandi quantità (${formatInt(lowestRatePoint.qty)} volantini nella fascia «${PUBLIC_TIER_LABELS[lowestRatePoint.tier]}»). Per quantità tipiche guarda la tabella con 5.000 e 10.000 volantini.`,
    },
    {
      q: "Quanto costa la distribuzione a mano (Hand to Hand)?",
      a: `${formatEuro(H2H_HOURLY_RATE_EUR)} l'ora per operatore, IVA esclusa, con un minimo di ${H2H_MIN_HOURS_PER_OUTING} ore per uscita. Fuori da Milano città lo spostamento è calcolato nel preventivo.`,
    },
    {
      q: "I prezzi includono la stampa?",
      a: "No: sono solo distribuzione. La stampa, se ti serve, si aggiunge nel configuratore.",
    },
  ],
};
