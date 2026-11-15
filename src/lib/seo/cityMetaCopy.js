// SEO — title e meta description delle pagine città (tabella v2 approvata
// dal titolare il 2026-11-15). Nessun numero scritto a mano: prezzi da
// classifyTerritory + calculateDistributionZonePrice (via cityFacts), famiglie
// e superficie dai dati ISTAT di cityPagesData.js.
//
// Regole approvate:
// - title "Volantinaggio e distribuzione volantini a [Comune] | VolantiniPro"
//   se sta in 60 caratteri, altrimenti senza "| VolantiniPro"; il nome del
//   comune non si accorcia mai (Cernusco, San Donato, San Giuliano > 60);
// - description <= 155 caratteri, con comune, prezzo per 5.000 volantini della
//   fascia del comune, citazione "ISTAT, famiglie al 31/12/2024";
// - Assago: 5.000 volantini superano le famiglie del comune, quindi prezzo del
//   comune intero (famiglie x 1,1) dal motore;
// - ogni description ha una struttura diversa (apertura x dato x chiusura,
//   combinazione fissata per comune in DESCRIPTION_VARIANT).
import { cityFacts, formatEuro, formatInt } from "./cityPagesData.js";

export const CITY_META_ISTAT_CITATION = "ISTAT, famiglie al 31/12/2024";
export const CITY_META_QUANTITY = 5000;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const BRAND_SUFFIX = " | VolantiniPro";

export function cityMetaTitle(slug) {
  const f = cityFacts(slug);
  const base = `Volantinaggio e distribuzione volantini ${f.at}`;
  return `${base}${BRAND_SUFFIX}`.length <= TITLE_MAX ? `${base}${BRAND_SUFFIX}` : base;
}

const nf1 = (x) => Number(x).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x) => `${(x * 100).toLocaleString("it-IT", { maximumFractionDigits: x * 100 < 10 ? 1 : 0 })}%`;
// "lo 0,6%", "l'81%", "l'11%", "il 21%".
const withArticle = (p) => (/^(8|11)/.test(p) ? `l'${p}` : /^0/.test(p) ? `lo ${p}` : `il ${p}`);

const OPENERS = [
  (v) => `Volantinaggio ${v.at}: 5.000 volantini porta a porta ${v.P} + IVA.`,
  (v) => `Distribuzione volantini ${v.at} (${v.T}): 5.000 volantini ${v.P} + IVA.`,
  (v) => `${v.P} + IVA per 5.000 volantini nelle cassette ${v.at}.`,
  (v) => `Quanto costa il volantinaggio ${v.at}? 5.000 volantini ${v.P} + IVA.`,
  (v) => `Porta a porta ${v.at}: 5.000 volantini a ${v.P}, IVA esclusa.`,
];
const FACTS = [
  (v) => `Circa ${withArticle(v.S)} delle ${v.N} famiglie (${CITY_META_ISTAT_CITATION}).`,
  (v) => `${v.N} famiglie (${CITY_META_ISTAT_CITATION}), ${v.D} per km².`,
  (v) => `Circa ${v.A} km² serviti, ${v.N} famiglie (${CITY_META_ISTAT_CITATION}).`,
];
const CLOSINGS = ["Preventivo online.", "Preventivo e PDF online.", ""];

// [apertura, dato, chiusura] per comune: tutte diverse fra loro.
export const DESCRIPTION_VARIANT = {
  milano: [0, 0, 0], monza: [0, 1, 0], bergamo: [2, 0, 0], brescia: [2, 1, 0], como: [0, 2, 0],
  varese: [2, 2, 0], "sesto-san-giovanni": [4, 1, 0], "cinisello-balsamo": [2, 1, 1],
  "cologno-monzese": [0, 0, 2], "paderno-dugnano": [0, 1, 2], bresso: [3, 0, 0], cormano: [3, 1, 0],
  bollate: [4, 0, 0], segrate: [4, 2, 0], pioltello: [2, 0, 1], "cernusco-sul-naviglio": [0, 2, 2],
  "san-donato-milanese": [2, 0, 2], "san-giuliano-milanese": [2, 1, 2], rozzano: [0, 1, 1],
  corsico: [2, 2, 1], rho: [3, 2, 0], pero: [0, 0, 1], "settimo-milanese": [1, 1, 2],
};

function descriptionValues(f) {
  return {
    at: f.at,
    P: formatEuro(f.price(CITY_META_QUANTITY)),
    T: f.tierLabel,
    N: formatInt(f.households),
    S: pct(Math.min(1, f.householdShareForFlyers(CITY_META_QUANTITY))),
    D: formatInt(f.householdsPerKm2),
    A: nf1(f.areaForFlyersKm2(CITY_META_QUANTITY)),
  };
}

/** Il comune intero richiede meno di 5.000 volantini (oggi solo Assago). */
export const coversWholeCityBelowQuantity = (f) => f.wholeCityFlyers < CITY_META_QUANTITY;

export function cityMetaDescription(slug) {
  const f = cityFacts(slug);
  const v = descriptionValues(f);
  if (coversWholeCityBelowQuantity(f)) {
    return `Volantinaggio ${f.at}: tutto il comune con ${formatInt(f.wholeCityFlyers)} volantini a ${formatEuro(f.price(f.wholeCityFlyers))} + IVA. ${FACTS[1](v)}`;
  }
  const [o, k, c] = DESCRIPTION_VARIANT[slug];
  return `${OPENERS[o](v)} ${FACTS[k](v)} ${CLOSINGS[c]}`.trim();
}
