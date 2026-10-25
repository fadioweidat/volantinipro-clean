// SEO — pagine città (approvate 2026-10-25). Numeri ISTAT reali e prezzi dal
// motore reale, mai scritti a mano:
// - famiglie e popolazione: ISTAT, "Bilancio demografico e popolazione
//   residente al 31 dicembre 2024" (P2_2024_it_Comuni);
// - superficie e densita': confini ISTAT al 1° gennaio 2026. Stessi valori di
//   public.geo_municipalities in produzione (verificati il 2026-10-25), quindi
//   la fascia di prezzo e' la stessa che usa il configuratore;
// - quantita' consigliata: famiglie x 1,1, la formula dello Step 2
//   (analysis-istat, volantini_consigliati);
// - prezzi: classifyTerritory + calculateDistributionZonePrice, solo
//   distribuzione Door to Door, IVA esclusa.
// Nessuna recensione, nessun cliente, nessuna promessa di risultato: i testi
// parlano solo di numeri ISTAT e di come si usa il configuratore.
import {
  TERRITORY_MINIMUMS,
  TERRITORY_TIERS,
  calculateDistributionZonePrice,
  classifyTerritory,
} from "../pricing/distributionPricing.js";
import { ALL_CITY_SLUGS, CITY_SLUGS, SERVED_CITIES, cityPageKey, cityPath } from "./seoLandingRoutes.js";

export { ALL_CITY_SLUGS, CITY_SLUGS, SERVED_CITIES, cityPageKey, cityPath };

export const ISTAT_SOURCE =
  "ISTAT, Bilancio demografico e popolazione residente al 31 dicembre 2024; superficie dai confini ISTAT al 1° gennaio 2026.";

// Formula dello Step 2: famiglie x 1,1 (margine operativo del 10%).
export const RECOMMENDED_FLYERS_PER_HOUSEHOLD = 1.1;

// Nomi pubblici delle fasce: mai "Como/Lecco" (comprende anche Brescia e
// Varese), descrivono solo la densita'.
export const PUBLIC_TIER_LABELS = {
  [TERRITORY_TIERS.MILANO_CORE]: "Milano città",
  [TERRITORY_TIERS.HINTERLAND_DENSE]: "Comuni densi",
  [TERRITORY_TIERS.COMO_LECCO]: "Città meno dense",
  [TERRITORY_TIERS.LOW_DENSITY_MOUNTAIN]: "Bassa densità",
};

const nf = (n, digits = 0) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
// it-IT non raggruppa i numeri a 4 cifre ("5000"): sulle pagine sempre "5.000".
export const formatInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const formatEuro = (n) => (Number.isInteger(Number(n)) ? `€${formatInt(n)}` : `€${formatInt(Math.trunc(n))},${String(Math.round((n % 1) * 100)).padStart(2, "0")}`);

const CITY_ISTAT = {
  milano: { name: "Milano", province: "MI", households: 741887, population: 1365698, areaKm2: 181.17, densityPerKm2: 7538.2 },
  monza: { name: "Monza", province: "MB", households: 57702, population: 123032, areaKm2: 32.77, densityPerKm2: 3754.9 },
  bergamo: { name: "Bergamo", province: "BG", households: 59638, population: 120389, areaKm2: 39.86, densityPerKm2: 3020 },
  brescia: { name: "Brescia", province: "BS", households: 97803, population: 199853, areaKm2: 90.66, densityPerKm2: 2204.3 },
  como: { name: "Como", province: "CO", households: 40487, population: 83135, areaKm2: 37.33, densityPerKm2: 2227.3 },
  varese: { name: "Varese", province: "VA", households: 37318, population: 78992, areaKm2: 54.86, densityPerKm2: 1440 },
  "sesto-san-giovanni": { name: "Sesto San Giovanni", province: "MI", households: 39580, population: 78792, areaKm2: 11.95, densityPerKm2: 6595.2 },
  "cinisello-balsamo": { name: "Cinisello Balsamo", province: "MI", households: 34563, population: 74702, areaKm2: 12.83, densityPerKm2: 5820.6 },
};

/** Numeri derivati per una citta', tutti dal dato ISTAT e dal motore prezzi. */
export function cityFacts(slug) {
  const city = CITY_ISTAT[slug];
  if (!city) return null;
  const { tier } = classifyTerritory({ name: city.name, densityPerKm2: city.densityPerKm2 });
  const householdsPerKm2 = city.households / city.areaKm2;
  const price = (qty) => calculateDistributionZonePrice(tier, qty);
  return {
    slug,
    ...city,
    tier,
    tierLabel: PUBLIC_TIER_LABELS[tier],
    minimum: TERRITORY_MINIMUMS[tier],
    wholeCityFlyers: Math.round(city.households * RECOMMENDED_FLYERS_PER_HOUSEHOLD),
    householdsPerKm2,
    // Superficie media coperta da N volantini: (N / 1,1) famiglie / famiglie per km².
    areaForFlyersKm2: (qty) => qty / RECOMMENDED_FLYERS_PER_HOUSEHOLD / householdsPerKm2,
    // Quota delle famiglie della citta' raggiunte da N volantini.
    householdShareForFlyers: (qty) => qty / RECOMMENDED_FLYERS_PER_HOUSEHOLD / city.households,
    price,
    price5000: price(5000),
    price10000: price(10000),
  };
}

const pct = (x) => `${nf(x * 100, x * 100 < 10 ? 1 : 0)}%`;
const km2 = (x) => `${nf(x, 1)} km²`;
const famPerKm2 = (slug) => formatInt(cityFacts(slug).householdsPerKm2);

// Testo specifico per citta': ogni pagina parte dai SUOI numeri e da un tema
// diverso (densita', estensione, confronto con la citta' vicina).
function cityAngle(f) {
  const a5 = km2(f.areaForFlyersKm2(5000));
  const a10 = km2(f.areaForFlyersKm2(10000));
  const s10 = pct(f.householdShareForFlyers(10000));
  const famKm2 = formatInt(f.householdsPerKm2);
  const angles = {
    monza: {
      h2: "Monza: tante famiglie in poco spazio",
      paragraphs: [
        `Monza ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}: in media ${famKm2} famiglie per km². Quasi le stesse famiglie di Bergamo, ma in una superficie più piccola.`,
        `In media 5.000 volantini coprono circa ${a5} di città: un'area raccolta intorno a un negozio o a una sede. Nel configuratore puoi partire da un indirizzo e scegliere il raggio.`,
      ],
    },
    bergamo: {
      h2: "Bergamo: stessa fascia di Monza",
      paragraphs: [
        `Bergamo ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)} (${famKm2} famiglie per km² in media). Rientra nella stessa fascia di prezzo di Monza: a parità di quantità il prezzo della distribuzione è lo stesso.`,
        `Con 10.000 volantini raggiungi circa il ${s10} delle famiglie della città, su circa ${a10} in media. Per una prima campagna conviene scegliere le zone più vicine alla tua attività.`,
      ],
    },
    brescia: {
      h2: "Brescia: una città estesa",
      paragraphs: [
        `Brescia si estende su ${km2(f.areaKm2)}, molto più di Monza (${km2(cityFacts("monza").areaKm2)}) o Bergamo (${km2(cityFacts("bergamo").areaKm2)}), con ${formatInt(f.households)} famiglie. La densità media è di ${famKm2} famiglie per km², contro ${famPerKm2("monza")} a Monza e ${famPerKm2("bergamo")} a Bergamo.`,
        `Meno densità significa più strada per ogni volantino, e infatti Brescia è nella fascia «${f.tierLabel}». Per tutta la città servirebbero circa ${formatInt(f.wholeCityFlyers)} volantini: di solito conviene una zona mirata, per esempio 5.000 volantini su circa ${a5}.`,
      ],
    },
    como: {
      h2: "Como: zone mirate in una città compatta",
      paragraphs: [
        `Como ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}. La densità media (${famKm2} famiglie per km²) è simile a quella di Brescia, ma la città è molto più piccola.`,
        `Una campagna da 2.500 volantini costa ${formatEuro(f.price(2500))} e copre in media circa ${km2(f.areaForFlyersKm2(2500))}: un buon punto di partenza per un'attività di quartiere.`,
      ],
    },
    varese: {
      h2: "Varese: una città poco densa",
      paragraphs: [
        `Varese ha ${formatInt(f.households)} famiglie distribuite su ${km2(f.areaKm2)}: in media ${famKm2} famiglie per km², meno di Como (${famPerKm2("como")}) e di Brescia (${famPerKm2("brescia")}).`,
        `Per lo stesso numero di volantini l'operatore percorre più strada: 5.000 volantini coprono in media circa ${a5}. Per questo conviene scegliere un raggio stretto intorno all'attività, invece di puntare a tutta la città.`,
      ],
    },
    "sesto-san-giovanni": {
      h2: "Sesto San Giovanni: densità quasi da Milano",
      paragraphs: [
        `Sesto San Giovanni ha ${formatInt(f.households)} famiglie in soli ${km2(f.areaKm2)}: ${famKm2} famiglie per km², non lontano dalle ${famPerKm2("milano")} di Milano.`,
        `5.000 volantini coprono in media circa ${a5}: un'area piccola e molto abitata. Il prezzo è quello della fascia «${f.tierLabel}».`,
      ],
    },
    "cinisello-balsamo": {
      h2: "Cinisello Balsamo: coprire metà città",
      paragraphs: [
        `Cinisello Balsamo ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)} (${famKm2} famiglie per km²). Per tutta la città servirebbero circa ${formatInt(f.wholeCityFlyers)} volantini.`,
        `Metà città sono circa ${formatInt(f.wholeCityFlyers / 2)} volantini, per ${formatEuro(f.price(Math.round(f.wholeCityFlyers / 2)))} di sola distribuzione. In alternativa 10.000 volantini raggiungono circa il ${s10} delle famiglie.`,
      ],
    },
  };
  return angles[f.slug];
}

function cityFaqs(f) {
  const n = f.name;
  const common = [
    {
      q: `Quanti volantini servono per coprire tutta ${n}?`,
      a: `Con i dati ISTAT (${formatInt(f.households)} famiglie) e il margine operativo del 10% usato dal configuratore servono circa ${formatInt(f.wholeCityFlyers)} volantini. Per una zona più piccola il configuratore calcola le famiglie nel raggio che scegli.`,
    },
    {
      q: `Quanto costa distribuire 10.000 volantini a ${n}?`,
      a: `La sola distribuzione Door to Door costa ${formatEuro(f.price10000)} IVA esclusa (fascia «${f.tierLabel}»). Stampa, urgenza ed extra si aggiungono nel preventivo; il prezzo finale si calcola sulla tua zona.`,
    },
  ];
  const specific = {
    monza: { q: "Posso distribuire solo intorno al mio negozio a Monza?", a: "Sì: nel configuratore inserisci l'indirizzo e scegli il raggio. Vedi subito le famiglie ISTAT nel raggio e i volantini consigliati." },
    bergamo: { q: "Bergamo e Monza hanno lo stesso prezzo?", a: `Sì, sono nella stessa fascia: ${formatEuro(f.price5000)} per 5.000 volantini e ${formatEuro(f.price10000)} per 10.000, IVA esclusa.` },
    brescia: { q: "Perché a Brescia il prezzo per 1.000 volantini è più alto che a Milano?", a: "Perché la densità è più bassa: per consegnare lo stesso numero di volantini l'operatore percorre più strada. Il motore di calcolo usa la densità ISTAT del comune." },
    como: { q: "Qual è la campagna minima a Como?", a: `La distribuzione Door to Door parte da ${formatEuro(f.minimum)} a campagna, IVA esclusa.` },
    varese: { q: "Conviene coprire tutta Varese?", a: `Dipende dall'obiettivo: tutta la città sono circa ${formatInt(f.wholeCityFlyers)} volantini. Per un'attività locale di solito basta una zona intorno alla sede, che scegli nel configuratore.` },
    "sesto-san-giovanni": { q: "Sesto San Giovanni ha lo stesso prezzo di Milano?", a: `No: è nella fascia «${f.tierLabel}». 5.000 volantini costano ${formatEuro(f.price5000)} contro ${formatEuro(cityFacts("milano").price5000)} a Milano, IVA esclusa.` },
    "cinisello-balsamo": { q: "Posso unire Cinisello Balsamo e Sesto San Giovanni in una campagna?", a: "Sì: nel configuratore puoi scegliere più comuni. Il prezzo è la somma delle zone, ognuna con la propria quantità." },
  };
  return [...common, specific[f.slug]].filter(Boolean);
}

// Citta' vicine per i link interni (solo link, nessuna affermazione).
const NEARBY = {
  monza: ["sesto-san-giovanni", "cinisello-balsamo", "milano"],
  bergamo: ["brescia", "monza", "milano"],
  brescia: ["bergamo", "milano"],
  como: ["varese", "monza", "milano"],
  varese: ["como", "milano"],
  "sesto-san-giovanni": ["milano", "cinisello-balsamo", "monza"],
  "cinisello-balsamo": ["sesto-san-giovanni", "monza", "milano"],
};

/** Contenuto completo di una pagina citta' (non Milano, che ha la sua pagina). */
export function cityPageContent(slug) {
  const f = cityFacts(slug);
  if (!f || slug === "milano") return null;
  return {
    pageKey: cityPageKey(slug),
    slug,
    facts: f,
    h1: `Distribuzione volantini a ${f.name}`,
    intro: `Volantinaggio e distribuzione volantini a ${f.name} con i numeri ISTAT del comune, il prezzo calcolato dal motore del configuratore, tracking GPS e foto di prova.`,
    angle: cityAngle(f),
    faqs: cityFaqs(f),
    nearby: NEARBY[slug].map((s) => ({ slug: s, name: CITY_ISTAT[s].name, href: cityPath(s), pageKey: cityPageKey(s) })),
  };
}

export const CITY_PAGES = Object.fromEntries(CITY_SLUGS.map((slug) => [cityPageKey(slug), cityPageContent(slug)]));

