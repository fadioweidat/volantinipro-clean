export const SITE_URL = 'https://www.volantinipro.it';
export const metaByPage = {
  home: [
    "Volantinaggio e distribuzione volantini | VolantiniPro",
    "Distribuzione volantini: calcola subito il preventivo online e scarica il PDF. Scegli anche il preventivo rapido o il ricontatto telefonico.",
  ],
  quick: [
    "Preventivo rapido distribuzione volantini | VolantiniPro",
    "Richiedi una stima rapida per la tua campagna di distribuzione volantini: servizio, zona e quantità in pochi passaggi.",
  ],
  consultant: [
    "Parla con un consulente VolantiniPro",
    "Lascia un messaggio: un consulente VolantiniPro ti ricontatta per preparare al telefono il preventivo della tua campagna di distribuzione volantini.",
  ],
  preventivo: [
    "Configura il tuo preventivo | VolantiniPro",
    "Configura zona, servizio e quantità per la distribuzione volantini, ottieni il preventivo online e scarica il PDF.",
  ],
  login: ["Login cliente | VolantiniPro", "Accedi alla dashboard VolantiniPro con magic link sicuro via email."],
  dashboard: ["Dashboard cliente | VolantiniPro", "Monitora campagne, tracking GPS, Smart Pairing e report finali."],
  campaign: ["Dashboard campagna | VolantiniPro", "Stato campagna, percorso GPS, statistiche di distribuzione, proof foto e report PDF."],
  privacy: ["Privacy Policy | VolantiniPro", "Informativa privacy per clienti e utenti VolantiniPro."],
  terms: ["Termini e condizioni | VolantiniPro", "Condizioni d'uso del servizio VolantiniPro."],
  cookie: ["Cookie Policy | VolantiniPro", "Informazioni sui cookie tecnici, analytics e preferenze del sito VolantiniPro."],
  "service-door-to-door": [
    "Distribuzione Volantini Door to Door | VolantiniPro",
    "Distribuzione volantini nelle cassette postali di condomini e zone residenziali, con analisi territoriale, tracking GPS e report finale.",
  ],
  "service-hand-to-hand": [
    "Distribuzione Volantini Hand to Hand | VolantiniPro",
    "Distribuzione volantini a mano in punti ad alto passaggio pedonale, con POI strategici, tracking GPS e report finale.",
  ],
  "service-business": [
    "Distribuzione Volantini Business | VolantiniPro",
    "Distribuzione volantini mirata ad aziende, negozi e uffici, con coordinamento multi-sede, tracking GPS e report finale.",
  ],
  "milano-landing": [
    "Volantinaggio Milano e distribuzione volantini | VolantiniPro",
    "Servizio di distribuzione volantini a Milano con Door to Door, Hand to Hand e soluzioni Business. Analisi territoriale, tracking GPS, prove fotografiche e preventivo online.",
  ],
};
export const SEO_ROUTES = [
 ['/', 'home'], ['/servizi/door-to-door','service-door-to-door'], ['/servizi/hand-to-hand','service-hand-to-hand'], ['/servizi/business','service-business'], ['/distribuzione-volantini-milano','milano-landing'], ['/preventivo','preventivo'], ['/preventivo-rapido','quick'], ['/consulente','consultant'], ['/privacy','privacy'], ['/termini','terms'], ['/cookie-policy','cookie']
];
export function getRouteMetadata(path) {
 const normalized = path === '/' ? '/' : path.replace(/\/+$/, '');
 const match = SEO_ROUTES.find(([route]) => route === normalized);
 const page = match?.[1];
 const [title, description] = metaByPage[page] || ['VolantiniPro — applicazione', 'Accedi agli strumenti VolantiniPro.'];
 return {path: normalized, page, title, description, canonical: match ? SITE_URL + normalized : null, robots: match ? 'index, follow' : 'noindex, nofollow', indexable: !!match};
}
