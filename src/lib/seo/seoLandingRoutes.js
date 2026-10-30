// Indirizzi delle pagine SEO prezzi e citta' (2026-10-25). Solo dati, nessun
// import: lo usano router, footer e routePolicy senza tirarsi dentro il motore
// prezzi o i contenuti delle pagine.
export const PRICES_PATH = "/prezzi-distribuzione-volantini";
export const PRICES_PAGE_KEY = "prices";

// Milano ha gia' la sua pagina (milano-landing): qui solo le citta' nuove.
export const CITY_SLUGS = [
  "monza", "bergamo", "brescia", "como", "varese", "sesto-san-giovanni", "cinisello-balsamo",
  "cologno-monzese",
  "paderno-dugnano",
  "bresso",
  "cormano",
  "bollate",
  "segrate",
  "pioltello",
  "cernusco-sul-naviglio",
  "san-donato-milanese",
  "san-giuliano-milanese",
  "rozzano",
  "corsico",
  "assago",
  "rho",
  "pero",
  "settimo-milanese",
];
export const CITY_NAMES = {
  milano: "Milano",
  monza: "Monza",
  bergamo: "Bergamo",
  brescia: "Brescia",
  como: "Como",
  varese: "Varese",
  "sesto-san-giovanni": "Sesto San Giovanni",
  "cinisello-balsamo": "Cinisello Balsamo",
  "cologno-monzese": "Cologno Monzese",
  "paderno-dugnano": "Paderno Dugnano",
  bresso: "Bresso",
  cormano: "Cormano",
  bollate: "Bollate",
  segrate: "Segrate",
  pioltello: "Pioltello",
  "cernusco-sul-naviglio": "Cernusco sul Naviglio",
  "san-donato-milanese": "San Donato Milanese",
  "san-giuliano-milanese": "San Giuliano Milanese",
  rozzano: "Rozzano",
  corsico: "Corsico",
  assago: "Assago",
  rho: "Rho",
  pero: "Pero",
  "settimo-milanese": "Settimo Milanese",
};
export const ALL_CITY_SLUGS = ["milano", ...CITY_SLUGS];

export const cityPath = (slug) => `/distribuzione-volantini-${slug}`;
export const cityPageKey = (slug) => (slug === "milano" ? "milano-landing" : `city-${slug}`);
export const CITY_PAGE_KEYS = CITY_SLUGS.map(cityPageKey);

/** Pagina SEO prezzi/citta' per un path, o null. */
export function seoLandingPageForPath(path) {
  if (path === PRICES_PATH) return PRICES_PAGE_KEY;
  const slug = CITY_SLUGS.find((s) => path === cityPath(s));
  return slug ? cityPageKey(slug) : null;
}

/** Path di una pagina SEO prezzi/citta', o null. */
export function seoLandingPathForPage(page) {
  if (page === PRICES_PAGE_KEY) return PRICES_PATH;
  const slug = CITY_SLUGS.find((s) => cityPageKey(s) === page);
  return slug ? cityPath(slug) : null;
}

export const SERVED_CITIES = ALL_CITY_SLUGS.map((slug) => ({ slug, name: CITY_NAMES[slug], href: cityPath(slug), pageKey: cityPageKey(slug) }));

// Footer "Zone servite": raggruppate per zona rispetto a Milano.
const ZONE_GROUPS = [
  ["Milano", ["milano"]],
  ["Nord", ["sesto-san-giovanni", "cinisello-balsamo", "bresso", "cormano", "paderno-dugnano", "bollate", "monza", "como", "varese"]],
  ["Est", ["cologno-monzese", "segrate", "pioltello", "cernusco-sul-naviglio", "bergamo", "brescia"]],
  ["Sud", ["san-donato-milanese", "san-giuliano-milanese", "rozzano", "assago"]],
  ["Ovest", ["corsico", "rho", "pero", "settimo-milanese"]],
];
export const SERVED_ZONE_GROUPS = ZONE_GROUPS.map(([title, slugs]) => ({ title, cities: slugs.map((slug) => SERVED_CITIES.find((city) => city.slug === slug)) }));
