// TICKET — SEO LOCAL PAGE PILOTA MILANO: contenuto della pagina locale
// /distribuzione-volantini-milano, separato dal template di rendering
// (src/pages/public/MilanoLandingPage.jsx) con lo stesso pattern gia' usato
// per le 3 pagine servizio (src/lib/seo/servicePagesContent.js) — cosi'
// SeoMeta.jsx (importato sempre, non lazy) legge qui i dati per il JSON-LD
// senza tirarsi dentro il bundle della pagina nel chunk principale.
//
// Vincoli del ticket, rispettati in tutto il contenuto sotto:
// - NON inventare numeri di famiglie, percentuali o coperture.
// - NON dichiarare copertura garantita o disponibilità automatica delle zone.
// - NON inserire prezzi inventati.
// - Nessun indirizzo fisico, recensione, rating, numero di clienti, anni di
//   esperienza, certificazione o tempo di consegna garantito.
// - Zone di Milano citate solo come esempi geografici, mai come lista SEO
//   di quartieri con copertura promessa.

export const milanoLandingContent = {
  pageKey: "milano-landing",
  h1: "Distribuzione volantini a Milano",
  intro:
    "VolantiniPro organizza campagne di distribuzione volantini a Milano con pianificazione territoriale, tracking GPS e report di attività, per Door to Door, Hand to Hand e progetti Business.",
  ctaLabel: "Calcola il preventivo",

  sections: [
    {
      h2: "Come distribuiamo a Milano",
      paragraphs: [
        "A Milano la distribuzione viene organizzata con uno dei tre servizi reali di VolantiniPro, scelto in base a obiettivo e zona della campagna.",
      ],
      services: [
        {
          title: "Door to Door",
          text: "Distribuzione nelle cassette postali di condomini, palazzi e abitazioni residenziali.",
          pageKey: "service-door-to-door",
        },
        {
          title: "Hand to Hand",
          text: "Consegna a mano in punti ad alto passaggio pedonale, come vie commerciali o zone con eventi.",
          pageKey: "service-hand-to-hand",
        },
        {
          title: "Business",
          text: "Distribuzione mirata a negozi, uffici e attività commerciali, con possibilità di coordinare più zone.",
          pageKey: "service-business",
        },
      ],
    },
    {
      h2: "Pianificazione territoriale",
      paragraphs: [
        "Ogni campagna a Milano parte dalla selezione delle zone e dalla quantità di volantini da distribuire, in base all'obiettivo indicato.",
        "L'analisi territoriale nel configuratore aiuta a organizzare la campagna in modo coerente con la zona scelta: la distribuzione viene poi monitorata durante lo svolgimento, con gli stessi strumenti di tracciamento usati per tutte le campagne VolantiniPro.",
      ],
    },
    {
      h2: "GPS e prove",
      paragraphs: [
        "Quando previsto dal servizio scelto, gli operatori sono tracciati via GPS durante la distribuzione e puoi seguire l'avanzamento della campagna.",
        "Al termine ricevi foto come prova di consegna e un report finale della campagna, con le stesse modalità descritte nelle pagine dei singoli servizi.",
      ],
    },
    {
      h2: "Zone di Milano",
      paragraphs: [
        "È possibile pianificare campagne in diverse aree della città in funzione dell'obiettivo, della quantità e del servizio scelto.",
        "Alcuni esempi di aree in cui è possibile organizzare una campagna: Milano Centro, Affori, Bovisa, Dergano, Niguarda, Città Studi, Porta Romana, Navigli. La disponibilità effettiva per zona, quantità e tempistiche viene verificata nel configuratore al momento della richiesta.",
      ],
    },
    {
      h2: "Quanto costa distribuire volantini a Milano?",
      paragraphs: [
        "Il prezzo non è fisso: dipende da zona, quantità, servizio scelto, tempistiche ed eventuali servizi aggiuntivi come stampa e grafica.",
        "Il preventivo viene calcolato online sulla tua campagna, con lo stesso motore di calcolo del configuratore usato per tutte le campagne VolantiniPro.",
      ],
      priceCta: "Calcola il prezzo sulla tua zona",
    },
    {
      h2: "Per chi è utile",
      paragraphs: [
        "La distribuzione volantini a Milano è pensata per esigenze diverse, in base al servizio e alla zona scelti.",
      ],
      bullets: [
        "Apertura di un nuovo negozio o attività",
        "Promozioni locali su una zona specifica",
        "Eventi e iniziative a Milano",
        "Attività commerciali con più sedi",
        "Aziende con campagne multi-zona",
      ],
    },
  ],

  faqs: [
    {
      q: "Quanto costa distribuire volantini a Milano?",
      a: "Il prezzo dipende da zona, quantità, servizio, tempistiche ed eventuali servizi aggiuntivi: si calcola direttamente nel configuratore in base alla tua campagna.",
    },
    {
      q: "Posso scegliere la zona di Milano?",
      a: "Sì, puoi selezionare l'area di Milano su cui distribuire durante la configurazione della campagna; la disponibilità viene verificata in quella fase.",
    },
    {
      q: "Posso controllare la distribuzione con GPS?",
      a: "Sì, quando previsto dal servizio scelto gli operatori sono tracciati via GPS e puoi seguire l'avanzamento della campagna.",
    },
    {
      q: "Ricevo prove fotografiche?",
      a: "Sì, ricevi foto come prova di consegna insieme a un report finale della campagna.",
    },
    {
      q: "Posso richiedere una campagna per più zone?",
      a: "Sì, è possibile pianificare una campagna Business su più zone di Milano; il progetto viene organizzato in base agli obiettivi indicati.",
    },
  ],
};
