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
  "cologno-monzese": { name: "Cologno Monzese", province: "MI", households: 21600, population: 46994, areaKm2: 8.58, densityPerKm2: 5474.92 },
  "paderno-dugnano": { name: "Paderno Dugnano", province: "MI", households: 21245, population: 47594, areaKm2: 14.11, densityPerKm2: 3372.15 },
  bresso: { name: "Bresso", province: "MI", households: 12413, population: 26513, areaKm2: 3.38, densityPerKm2: 7838.55 },
  cormano: { name: "Cormano", province: "MI", households: 9297, population: 20744, areaKm2: 4.49, densityPerKm2: 4625.04 },
  bollate: { name: "Bollate", province: "MI", households: 16498, population: 36365, areaKm2: 12.91, densityPerKm2: 2816.74 },
  segrate: { name: "Segrate", province: "MI", households: 16921, population: 37078, areaKm2: 17.85, densityPerKm2: 2077.34 },
  pioltello: { name: "Pioltello", province: "MI", households: 15627, population: 37184, areaKm2: 12.86, densityPerKm2: 2890.4 },
  "cernusco-sul-naviglio": { name: "Cernusco sul Naviglio", province: "MI", households: 15216, population: 34786, areaKm2: 13.08, densityPerKm2: 2660.35 },
  "san-donato-milanese": { name: "San Donato Milanese", province: "MI", households: 14830, population: 32161, areaKm2: 12.89, densityPerKm2: 2494.91 },
  "san-giuliano-milanese": { name: "San Giuliano Milanese", province: "MI", households: 17303, population: 39910, areaKm2: 31.03, densityPerKm2: 1286.33 },
  rozzano: { name: "Rozzano", province: "MI", households: 18549, population: 41559, areaKm2: 12.06, densityPerKm2: 3445.37 },
  corsico: { name: "Corsico", province: "MI", households: 16334, population: 34694, areaKm2: 5.16, densityPerKm2: 6728.28 },
  assago: { name: "Assago", province: "MI", households: 4047, population: 9323, areaKm2: 8.29, densityPerKm2: 1125.28 },
  rho: { name: "Rho", province: "MI", households: 23897, population: 50879, areaKm2: 22.42, densityPerKm2: 2268.86 },
  pero: { name: "Pero", province: "MI", households: 5581, population: 11816, areaKm2: 5.04, densityPerKm2: 2344.03 },
  "settimo-milanese": { name: "Settimo Milanese", province: "MI", households: 8847, population: 19922, areaKm2: 10.67, densityPerKm2: 1867.03 },
};

/** Numeri derivati per una citta', tutti dal dato ISTAT e dal motore prezzi. */
// Nomi che chiedono "ad" invece di "a".
const AT_OVERRIDES = { assago: "ad Assago" };

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
    // Comuni densi come Milano: stessa fascia, ma non sono "Milano città".
    tierLabel: tier === TERRITORY_TIERS.MILANO_CORE && slug !== "milano" ? "Alta densità, come Milano città" : PUBLIC_TIER_LABELS[tier],
    at: AT_OVERRIDES[slug] || `a ${city.name}`,
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

// Mai promettere piu' famiglie di quelle del comune, ne' prezzi oltre il comune intero.
export function cityReachSentence(f) {
  const reach = [2500, 5000, 10000].filter((qty) => qty / RECOMMENDED_FLYERS_PER_HOUSEHOLD < f.households).slice(-2);
  const [first, second] = reach.map((qty) => ({ qty: formatInt(qty), families: formatInt(qty / RECOMMENDED_FLYERS_PER_HOUSEHOLD) }));
  const start = `Di solito si sceglie una zona: con ${first.qty} volantini raggiungi circa ${first.families} famiglie`;
  return second ? `${start}, con ${second.qty} circa ${second.families}.` : `${start}.`;
}

export function cityPriceQuantities(f) {
  const quantities = [2500, 5000, 10000, 20000];
  const fitting = quantities.filter((qty) => qty <= f.wholeCityFlyers);
  return { quantities: fitting, wholeCity: fitting.length < quantities.length ? f.wholeCityFlyers : null };
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
    "cologno-monzese": {
      h2: "Cologno Monzese: compatta e molto abitata",
      paragraphs: [
        `Cologno Monzese ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}: in media ${famKm2} famiglie per km², vicino alle ${famPerKm2("cinisello-balsamo")} di Cinisello Balsamo.`,
        `5.000 volantini coprono in media circa ${a5}, cioè circa il ${pct(f.householdShareForFlyers(5000))} delle famiglie del comune. Con 10.000 si arriva a circa il ${s10}.`,
      ],
    },
    "paderno-dugnano": {
      h2: "Paderno Dugnano: tante famiglie su un territorio ampio",
      paragraphs: [
        `Paderno Dugnano ha quasi le stesse famiglie di Cologno Monzese (${formatInt(f.households)} contro ${formatInt(cityFacts("cologno-monzese").households)}), ma su ${km2(f.areaKm2)} invece di ${km2(cityFacts("cologno-monzese").areaKm2)}.`,
        `La densità media è quindi più bassa: ${famKm2} famiglie per km². 5.000 volantini coprono in media circa ${a5}: conviene partire da un indirizzo e scegliere il raggio.`,
      ],
    },
    bresso: {
      h2: "Bresso: più densa di Milano",
      paragraphs: [
        `Bresso ha ${formatInt(f.population)} abitanti in soli ${km2(f.areaKm2)}: ${formatInt(f.densityPerKm2)} abitanti per km², più dei ${formatInt(cityFacts("milano").densityPerKm2)} di Milano.`,
        `Per questo è nella stessa fascia di prezzo di Milano. Tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini: con 10.000 raggiungi circa il ${s10} delle famiglie.`,
      ],
    },
    cormano: {
      h2: "Cormano: tutto il comune con circa 10.000 volantini",
      paragraphs: [
        `Cormano ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}. Con il margine operativo del 10% tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini.`,
        `Una campagna da 10.000 volantini costa ${formatEuro(f.price10000)} e raggiunge circa il ${s10} delle famiglie. Se ti interessa solo una parte del comune, 5.000 volantini coprono in media circa ${a5}.`,
      ],
    },
    bollate: {
      h2: "Bollate: la superficie di Cinisello, meno della metà delle famiglie",
      paragraphs: [
        `Bollate si estende su ${km2(f.areaKm2)}, come Cinisello Balsamo (${km2(cityFacts("cinisello-balsamo").areaKm2)}), ma ha ${formatInt(f.households)} famiglie contro ${formatInt(cityFacts("cinisello-balsamo").households)}.`,
        `Con ${famKm2} famiglie per km² in media, 5.000 volantini coprono circa ${a5}. Il prezzo resta quello della fascia «${f.tierLabel}».`,
      ],
    },
    segrate: {
      h2: "Segrate: le famiglie di Corsico su oltre tre volte la superficie",
      paragraphs: [
        `Segrate ha ${formatInt(f.households)} famiglie, poche più di Corsico (${formatInt(cityFacts("corsico").households)}), ma su ${km2(f.areaKm2)} invece di ${km2(cityFacts("corsico").areaKm2)}.`,
        `Più superficie significa più strada per ogni volantino: Segrate è nella fascia «${f.tierLabel}» e 5.000 volantini coprono in media circa ${a5}.`,
      ],
    },
    pioltello: {
      h2: "Pioltello: fascia più conveniente di Segrate",
      paragraphs: [
        `Pioltello ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)} e ${formatInt(f.densityPerKm2)} abitanti per km², contro i ${formatInt(cityFacts("segrate").densityPerKm2)} di Segrate.`,
        `Per questo è nella fascia «${f.tierLabel}»: 5.000 volantini costano ${formatEuro(f.price5000)} di sola distribuzione, contro ${formatEuro(cityFacts("segrate").price5000)} a Segrate.`,
      ],
    },
    "cernusco-sul-naviglio": {
      h2: "Cernusco sul Naviglio: zone mirate intorno all'attività",
      paragraphs: [
        `Cernusco sul Naviglio ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}, in media ${famKm2} famiglie per km². Per tutto il comune servirebbero circa ${formatInt(f.wholeCityFlyers)} volantini.`,
        `Una campagna da 2.500 volantini costa ${formatEuro(f.price(2500))} di sola distribuzione e copre in media circa ${km2(f.areaForFlyersKm2(2500))}: un primo passo per un'attività locale.`,
      ],
    },
    "san-donato-milanese": {
      h2: "San Donato Milanese: quanto costa coprire metà comune",
      paragraphs: [
        `San Donato Milanese ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}. Tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini.`,
        `Metà comune sono circa ${formatInt(f.wholeCityFlyers / 2)} volantini, per ${formatEuro(f.price(Math.round(f.wholeCityFlyers / 2)))} di sola distribuzione nella fascia «${f.tierLabel}».`,
      ],
    },
    "san-giuliano-milanese": {
      h2: "San Giuliano Milanese: un comune molto esteso",
      paragraphs: [
        `San Giuliano Milanese si estende su ${km2(f.areaKm2)}, più del doppio di San Donato Milanese (${km2(cityFacts("san-donato-milanese").areaKm2)}) e di Rozzano (${km2(cityFacts("rozzano").areaKm2)}).`,
        `Le ${formatInt(f.households)} famiglie sono quindi più distanziate: in media ${famKm2} per km². 5.000 volantini coprono circa ${a5}, per questo conviene scegliere con cura la zona.`,
      ],
    },
    rozzano: {
      h2: "Rozzano: densità alta nel sud Milano",
      paragraphs: [
        `Rozzano ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)} e ${formatInt(f.densityPerKm2)} abitanti per km², molti più dei ${formatInt(cityFacts("assago").densityPerKm2)} di Assago.`,
        `È nella fascia «${f.tierLabel}»: 10.000 volantini costano ${formatEuro(f.price10000)} di sola distribuzione e raggiungono circa il ${s10} delle famiglie.`,
      ],
    },
    corsico: {
      h2: "Corsico: densità da Milano in 5 km²",
      paragraphs: [
        `Corsico ha ${formatInt(f.households)} famiglie in ${km2(f.areaKm2)}: ${famKm2} famiglie per km² e ${formatInt(f.densityPerKm2)} abitanti per km².`,
        `Con questa densità è nella stessa fascia di prezzo di Milano: 5.000 volantini costano ${formatEuro(f.price5000)} di sola distribuzione e coprono in media circa ${a5}.`,
      ],
    },
    assago: {
      h2: "Assago: tutto il comune con meno di 5.000 volantini",
      paragraphs: [
        `Assago ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}. Con il margine operativo del 10% tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini.`,
        `La densità è più bassa di quella di Rozzano, quindi la fascia è «${f.tierLabel}»: una campagna da 2.500 volantini costa ${formatEuro(f.price(2500))} di sola distribuzione.`,
      ],
    },
    rho: {
      h2: "Rho: un comune grande, meglio per zone",
      paragraphs: [
        `Rho ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}, in media ${famKm2} famiglie per km².`,
        `Tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini. Con 10.000 raggiungi circa il ${s10} delle famiglie, su circa ${a10} in media.`,
      ],
    },
    pero: {
      h2: "Pero: 5.000 volantini per gran parte del comune",
      paragraphs: [
        `Pero ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}. Tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini.`,
        `5.000 volantini raggiungono circa l'${pct(f.householdShareForFlyers(5000))} delle famiglie, per ${formatEuro(f.price5000)} di sola distribuzione nella fascia «${f.tierLabel}».`,
      ],
    },
    "settimo-milanese": {
      h2: "Settimo Milanese: metà comune con 5.000 volantini",
      paragraphs: [
        `Settimo Milanese ha ${formatInt(f.households)} famiglie su ${km2(f.areaKm2)}, in media ${famKm2} famiglie per km².`,
        `5.000 volantini raggiungono circa il ${pct(f.householdShareForFlyers(5000))} delle famiglie e coprono in media circa ${a5}. Per tutto il comune ne servono circa ${formatInt(f.wholeCityFlyers)}.`,
      ],
    },
  };
  return angles[f.slug];
}

function cityFaqs(f) {
  const n = f.name;
  const at = f.at;
  const common = [
    {
      q: `Quanti volantini servono per coprire tutta ${n}?`,
      a: `Con i dati ISTAT (${formatInt(f.households)} famiglie) e il margine operativo del 10% usato dal configuratore servono circa ${formatInt(f.wholeCityFlyers)} volantini. Per una zona più piccola il configuratore calcola le famiglie nel raggio che scegli.`,
    },
    {
      q: `Quanto costa distribuire 10.000 volantini ${at}?`,
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
    "cologno-monzese": { q: "Cologno Monzese è in provincia di Monza?", a: "No: nonostante il nome è nella città metropolitana di Milano. Nel configuratore lo trovi cercando direttamente il comune." },
    "paderno-dugnano": { q: "Posso scegliere solo una parte di Paderno Dugnano?", a: "Sì: inserisci l'indirizzo e scegli il raggio. Il configuratore calcola le famiglie ISTAT nell'area scelta e i volantini consigliati." },
    bresso: { q: "Bresso ha lo stesso prezzo di Milano?", a: `Sì, per densità è nella stessa fascia: ${formatEuro(f.price5000)} per 5.000 volantini e ${formatEuro(f.price10000)} per 10.000, IVA esclusa.` },
    cormano: { q: "Bastano 10.000 volantini per tutta Cormano?", a: `Quasi: ne servono circa ${formatInt(f.wholeCityFlyers)} con il margine operativo del 10%. Con 10.000 raggiungi circa il ${pct(f.householdShareForFlyers(10000))} delle famiglie.` },
    bollate: { q: "Qual è la campagna minima a Bollate?", a: `La distribuzione Door to Door parte da ${formatEuro(f.minimum)} a campagna, IVA esclusa.` },
    segrate: { q: "Perché Segrate costa più di Pioltello?", a: `Perché la densità è più bassa: ${formatInt(f.densityPerKm2)} abitanti per km² contro ${formatInt(cityFacts("pioltello").densityPerKm2)}. L'operatore percorre più strada per lo stesso numero di volantini.` },
    pioltello: { q: "Quanto costa una campagna da 5.000 volantini a Pioltello?", a: `${formatEuro(f.price5000)} di sola distribuzione Door to Door, IVA esclusa. Stampa, urgenza ed extra si aggiungono nel preventivo.` },
    "cernusco-sul-naviglio": { q: "Cernusco sul Naviglio e Pioltello hanno lo stesso prezzo?", a: `Sì, sono nella stessa fascia: ${formatEuro(f.price5000)} per 5.000 volantini e ${formatEuro(f.price10000)} per 10.000, IVA esclusa.` },
    "san-donato-milanese": { q: "Posso unire San Donato e San Giuliano Milanese in una campagna?", a: "Sì: nel configuratore puoi scegliere più comuni. Il prezzo è la somma delle zone, ognuna con la propria quantità e la propria fascia." },
    "san-giuliano-milanese": { q: "Conviene coprire tutta San Giuliano Milanese?", a: `Dipende dall'obiettivo: tutto il comune sono circa ${formatInt(f.wholeCityFlyers)} volantini. Per un'attività locale di solito basta una zona intorno alla sede, che scegli nel configuratore.` },
    rozzano: { q: "Rozzano e Assago hanno lo stesso prezzo?", a: `No: Rozzano è nella fascia «${f.tierLabel}», con ${formatEuro(f.price5000)} per 5.000 volantini contro ${formatEuro(cityFacts("assago").price5000)} ad Assago, IVA esclusa.` },
    corsico: { q: "Quanto costa coprire metà di Corsico?", a: `Metà comune sono circa ${formatInt(f.wholeCityFlyers / 2)} volantini, per ${formatEuro(f.price(Math.round(f.wholeCityFlyers / 2)))} di sola distribuzione, IVA esclusa.` },
    assago: { q: "Qual è la campagna minima ad Assago?", a: `La distribuzione Door to Door parte da ${formatEuro(f.minimum)} a campagna, IVA esclusa.` },
    rho: { q: "Posso distribuire solo in una zona di Rho?", a: "Sì: nel configuratore scegli un indirizzo e il raggio, oppure il comune intero. Vedi subito le famiglie ISTAT e i volantini consigliati." },
    pero: { q: "Pero e Rho hanno lo stesso prezzo?", a: `Sì, sono nella stessa fascia: ${formatEuro(f.price5000)} per 5.000 volantini e ${formatEuro(f.price10000)} per 10.000, IVA esclusa.` },
    "settimo-milanese": { q: "Perché Settimo Milanese non ha il prezzo di Milano?", a: `Perché il prezzo dipende dalla densità: ${formatInt(f.densityPerKm2)} abitanti per km² contro ${formatInt(cityFacts("milano").densityPerKm2)} di Milano, quindi più strada per ogni volantino.` },
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
  "sesto-san-giovanni": ["milano", "cinisello-balsamo", "monza", "bresso", "cologno-monzese"],
  "cinisello-balsamo": ["sesto-san-giovanni", "monza", "milano", "bresso", "paderno-dugnano"],
  "cologno-monzese": ["sesto-san-giovanni", "segrate", "cernusco-sul-naviglio", "milano"],
  "paderno-dugnano": ["cinisello-balsamo", "cormano", "bollate", "milano"],
  bresso: ["cinisello-balsamo", "sesto-san-giovanni", "cormano", "milano"],
  cormano: ["bresso", "paderno-dugnano", "bollate", "milano"],
  bollate: ["cormano", "paderno-dugnano", "rho", "milano"],
  segrate: ["pioltello", "cologno-monzese", "san-donato-milanese", "milano"],
  pioltello: ["segrate", "cernusco-sul-naviglio", "milano"],
  "cernusco-sul-naviglio": ["pioltello", "cologno-monzese", "segrate", "milano"],
  "san-donato-milanese": ["san-giuliano-milanese", "segrate", "milano"],
  "san-giuliano-milanese": ["san-donato-milanese", "rozzano", "milano"],
  rozzano: ["assago", "corsico", "milano"],
  corsico: ["assago", "rozzano", "settimo-milanese", "milano"],
  assago: ["rozzano", "corsico", "milano"],
  rho: ["pero", "settimo-milanese", "bollate", "milano"],
  pero: ["rho", "settimo-milanese", "milano"],
  "settimo-milanese": ["pero", "rho", "corsico", "milano"],
};

/** Contenuto completo di una pagina citta' (non Milano, che ha la sua pagina). */
export function cityPageContent(slug) {
  const f = cityFacts(slug);
  if (!f || slug === "milano") return null;
  return {
    pageKey: cityPageKey(slug),
    slug,
    facts: f,
    h1: `Distribuzione volantini ${f.at}`,
    intro: `Volantinaggio e distribuzione volantini ${f.at} con i numeri ISTAT del comune, il prezzo calcolato dal motore del configuratore, tracking GPS e foto di prova.`,
    angle: cityAngle(f),
    faqs: cityFaqs(f),
    nearby: NEARBY[slug].map((s) => ({ slug: s, name: CITY_ISTAT[s].name, at: cityFacts(s).at, href: cityPath(s), pageKey: cityPageKey(s) })),
  };
}

export const CITY_PAGES = Object.fromEntries(CITY_SLUGS.map((slug) => [cityPageKey(slug), cityPageContent(slug)]));

