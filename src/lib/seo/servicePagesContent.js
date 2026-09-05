// Contenuto reale delle 3 pagine SEO servizio (/servizi/door-to-door,
// /servizi/hand-to-hand, /servizi/business), separato dal template di
// rendering (src/pages/public/ServicePages.jsx) cosi' SeoMeta.jsx (importato
// SEMPRE, non lazy, da AppRouter.jsx) puo' leggere qui i dati per il JSON-LD
// senza tirarsi dentro l'intero bundle delle pagine servizio nel bundle
// principale — nessuna regressione sul code-splitting esistente.
//
// Stessi servizi realmente offerti gia' descritti altrove nel sito
// (ServicesSection.jsx, src/lib/constants.js "z"): nessun testo nuovo
// inventato, solo riorganizzato per una pagina dedicata.

export const doorToDoorContent = {
  pageKey: "service-door-to-door",
  shortName: "Door to Door",
  eyebrow: "Distribuzione residenziale",
  h1: "Distribuzione Volantini Door to Door",
  intro: "Distribuzione nelle cassette postali di condomini, palazzi, villette e zone residenziali, con analisi territoriale, tracking GPS e report finale.",
  ctaLabel: "Calcola il tuo preventivo Door to Door →",
  sections: [
    {
      h2: "Cos'è il Door to Door",
      paragraphs: [
        "Il Door to Door è la distribuzione di volantini nelle cassette postali di una zona selezionata: condomini, palazzi, ville e abitazioni residenziali.",
      ],
    },
    {
      h2: "Come funziona",
      paragraphs: [
        "La campagna parte da un'analisi del territorio (dati ISTAT su famiglie e densità abitativa), prosegue con la definizione delle zone da coprire e si conclude con la distribuzione tracciata via GPS e un report finale con foto come prova di consegna.",
      ],
    },
    {
      h2: "Ideale per",
      paragraphs: [],
      bullets: ["Attività locali", "Promozioni di zona", "Grande copertura territoriale", "Cassette, condomini, ville"],
    },
    {
      h2: "Cosa ricevi",
      paragraphs: [
        "Al termine della campagna ricevi lo stato di avanzamento, il percorso GPS degli operatori, le foto geolocalizzate come prova di consegna e un report finale con mappa delle zone servite.",
      ],
    },
    {
      h2: "Come viene calcolato il preventivo",
      paragraphs: [
        "Il preventivo viene calcolato in base a zona selezionata, quantità di volantini e servizi aggiuntivi come stampa e grafica — lo stesso motore di calcolo del configuratore online, senza sorprese.",
      ],
    },
  ],
  faqs: [
    { q: "Cos'è la distribuzione Door to Door?", a: "È la distribuzione di volantini nelle cassette postali di condomini, palazzi e abitazioni di una zona selezionata." },
    { q: "Come viene verificata la distribuzione?", a: "Ogni operatore è tracciato via GPS durante il giro e il cliente riceve un report con percorso, zone coperte e foto come prova di consegna." },
    { q: "Qual è la differenza tra Door to Door e Hand to Hand?", a: "Il Door to Door distribuisce nelle cassette postali di zone residenziali, mentre l'Hand to Hand consegna a mano in punti ad alto passaggio pedonale." },
  ],
};

export const handToHandContent = {
  pageKey: "service-hand-to-hand",
  shortName: "Hand to Hand",
  eyebrow: "Distribuzione a mano",
  h1: "Distribuzione Volantini Hand to Hand",
  intro: "Distribuzione a mano in punti ad alto passaggio pedonale, con selezione dei POI strategici e verifica operativa sul campo.",
  ctaLabel: "Calcola il tuo preventivo Hand to Hand →",
  sections: [
    {
      h2: "Cos'è l'Hand to Hand",
      paragraphs: [
        "L'Hand to Hand è la distribuzione di volantini a mano, consegnati direttamente alle persone in punti ad alto passaggio pedonale, invece che nelle cassette postali.",
      ],
    },
    {
      h2: "Differenza dal Door to Door",
      paragraphs: [
        "Il Door to Door copre zone residenziali tramite le cassette postali; l'Hand to Hand punta invece su un contatto diretto in luoghi ad alta frequentazione, utile quando conta l'immediatezza del messaggio.",
      ],
    },
    {
      h2: "Punti strategici e fasce orarie",
      paragraphs: [
        "I punti di distribuzione vengono scelti tra i POI rilevanti dell'area (fermate di metro/bus/treno, scuole, università, zone con eventi) e le fasce orarie operative vengono valutate in fase di pianificazione in base al punto scelto.",
      ],
      bullets: ["POI rilevanti", "Fermate metro/bus/treno", "Scuole, università, eventi", "Flusso potenziale", "Smart Pairing opzionale"],
    },
    {
      h2: "Prove operative",
      paragraphs: [
        "Anche per l'Hand to Hand ricevi tracking GPS degli operatori, foto come prova di consegna e un report finale al termine della campagna.",
      ],
    },
    {
      h2: "Come viene calcolato il preventivo",
      paragraphs: [
        "Il preventivo viene calcolato in base a zona/punti selezionati, quantità di volantini e servizi aggiuntivi come stampa e grafica — lo stesso motore di calcolo del configuratore online.",
      ],
    },
  ],
  faqs: [
    { q: "Cos'è la distribuzione Hand to Hand?", a: "È la distribuzione di volantini a mano, consegnati direttamente alle persone in punti ad alto passaggio pedonale come fermate, zone commerciali o eventi." },
    { q: "Come viene verificata la distribuzione?", a: "Gli operatori sono tracciati via GPS e il cliente riceve un report con percorso e foto come prova di consegna, come per tutti i servizi VolantiniPro." },
    { q: "Qual è la differenza tra Hand to Hand e Door to Door?", a: "L'Hand to Hand consegna a mano in punti ad alto passaggio pedonale, mentre il Door to Door distribuisce nelle cassette postali di zone residenziali." },
  ],
};

export const businessContent = {
  pageKey: "service-business",
  shortName: "Business",
  eyebrow: "Distribuzione B2B",
  h1: "Distribuzione Volantini per Aziende e Negozi",
  intro: "Distribuzione mirata ad attività commerciali, uffici e zone business, con possibilità di coordinamento su più sedi.",
  ctaLabel: "Calcola il tuo preventivo Business →",
  sections: [
    {
      h2: "Cos'è la Business Distribution",
      paragraphs: [
        "La Business Distribution è la distribuzione di volantini mirata ad attività commerciali, uffici e zone a vocazione business, pensata per un targeting B2B.",
      ],
    },
    {
      h2: "Negozi, uffici e categorie merceologiche",
      paragraphs: [
        "La zona di distribuzione viene definita in base a negozi e uffici mirati, con possibilità di ragionare per categorie merceologiche e zone commerciali specifiche.",
      ],
      bullets: ["Negozi e uffici mirati", "Categorie merceologiche", "Zone commerciali", "Attività locali e fornitori"],
    },
    {
      h2: "Multi-sede e coordinamento",
      paragraphs: [
        "Per attività con più sedi, VolantiniPro supporta il coordinamento centralizzato di campagne su più città, con report unificati per l'intero progetto.",
      ],
    },
    {
      h2: "Report e progetto personalizzato",
      paragraphs: [
        "Ogni campagna Business include tracking GPS, foto come prova di consegna e un report finale. Per esigenze specifiche (multi-sede, categorie merceologiche particolari) il team VolantiniPro costruisce un progetto su misura.",
      ],
    },
    {
      h2: "Come viene calcolato il preventivo",
      paragraphs: [
        "Il preventivo viene calcolato in base a zona/e selezionate, quantità di volantini e servizi aggiuntivi come stampa e grafica — lo stesso motore di calcolo del configuratore online.",
      ],
    },
  ],
  faqs: [
    { q: "Cos'è la distribuzione Business?", a: "È la distribuzione di volantini mirata ad attività commerciali, uffici e zone business, con targeting B2B su categorie merceologiche specifiche." },
    { q: "Come viene verificata la distribuzione?", a: "Come per gli altri servizi, gli operatori sono tracciati via GPS e il cliente riceve un report con percorso e foto come prova di consegna." },
    { q: "È adatta ad aziende con più sedi?", a: "Sì: per campagne su più città VolantiniPro coordina la distribuzione centralmente e fornisce report unificati per l'intero progetto." },
  ],
};

export const SERVICE_PAGE_CONTENT = {
  "service-door-to-door": doorToDoorContent,
  "service-hand-to-hand": handToHandContent,
  "service-business": businessContent,
};
