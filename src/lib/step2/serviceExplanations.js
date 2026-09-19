/**
 * Service explanations, primary KPIs, and Help FAQ copy for Step 2.
 * Pure configuration module — no business logic mutations.
 */

export const SERVICE_EXPLANATIONS = {
  d2d: {
    key: "d2d",
    name: "Door to Door (Casellario)",
    shortTitle: "Distribuzione nelle cassette postali",
    summary: "Distribuzione dei volantini direttamente nelle cassette postali di abitazioni e condomini.",
    step2ChoiceDescription: "Nello Step 2 scegli il Comune, i quartieri/NIL, il CAP o il raggio geografico di consegna.",
    bullets: [
      "Consegna puntuale porta a porta nelle cassette postali",
      "Stima accurata del numero di famiglie e abitazioni",
      "Copertura calcolata sul fabbisogno reale della zona"
    ],
    kpiHouseholdLabel: "Famiglie / Cassette stimate",
    kpiHouseholdDescription: "Numero di cassette postali e nuclei familiari stimati nell'area selezionata.",
    quantityExplanation: "La quantità consigliata indica quanti volantini servono per coprire l'area selezionata secondo i dati ISTAT e territoriali.",
    helpFaq: [
      {
        q: "Dove vengono distribuiti i volantini?",
        a: "I volantini vengono recapitati direttamente nelle cassette postali di case singole, villette e condomini dell'area selezionata."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Puoi selezionare l'intero comune, uno o più quartieri specifici (NIL), un raggio chilometrico attorno a un indirizzo o specifici codici postali (CAP)."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "Il sistema calcola il fabbisogno esatto incrociando i dati demografici ISTAT, il numero di famiglie e i punti di recapito dell'area."
      },
      {
        q: "Cosa significa copertura?",
        a: "La copertura indica la percentuale di famiglie della zona che riceveranno il volantino rispetto al totale delle cassette presenti."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 visualizzi il riepilogo economico trasparente e puoi personalizzare la data e le opzioni operative prima della conferma."
      }
    ]
  },

  h2h: {
    key: "h2h",
    name: "Hand to Hand (A mano)",
    shortTitle: "Distribuzione a mano pedonale",
    summary: "Distribuzione a mano direttamente alle persone in strade, piazze, eventi, stazioni o aree ad alta presenza pedonale.",
    step2ChoiceDescription: "Nello Step 2 scegli il punto o indirizzo di partenza, il raggio operativo e le zone di maggior passaggio pedonale.",
    bullets: [
      "Contatto diretto con i passanti tramite promoter qualificati",
      "Focus su aree ad alto passaggio pedonale, nodi di transito e piazze",
      "Pianificazione oraria calibrata sulla capacità operativa"
    ],
    kpiHouseholdLabel: "Passaggi pedonali stimati",
    kpiHouseholdDescription: "Flusso pedonale stimato nell'area e nelle fasce orarie selezionate.",
    quantityExplanation: "La quantità consigliata è calibrata sulla capacità distributiva oraria dei promoter nell'area prescelta.",
    helpFaq: [
      {
        q: "Dove vengono distribuiti i volantini?",
        a: "I promoter consegnano i volantini a mano a passanti e clienti target nei punti nevralgici e nelle vie più frequentate dell'area."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Individuiamo le zone a più alta concentrazione pedonale attorno al tuo indirizzo o nei punti di interesse prescelti."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "La quantità si basa sulla capacità oraria media per promoter (tipicamente 120-180 volantini/ora) moltiplicata per i turni previsti."
      },
      {
        q: "Cosa significa copertura?",
        a: "Rappresenta l'intensità del presidio sul territorio e la quota stimata di contatti utili generati nel periodo di campagna."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 definisci il calendario operativo, gli orari e il numero di promoter dedicati."
      }
    ]
  },

  business: {
    key: "business",
    name: "Business / Attività commerciali",
    shortTitle: "Distribuzione presso attività e imprese",
    summary: "Distribuzione presso negozi, uffici, attività commerciali e altre imprese presenti nell'area selezionata.",
    step2ChoiceDescription: "Nello Step 2 selezioni il comune, il raggio di interesse e le categorie di attività commerciali target.",
    bullets: [
      "Consegna mirata presso negozi, studi professionali e aziende",
      "Filtro per categorie merceologiche e densità d'impresa",
      "Tracciamento puntuale delle attività commerciali coperte"
    ],
    kpiHouseholdLabel: "Attività commerciali censite",
    kpiHouseholdDescription: "Imprese e negozi censiti nell'area appartenenti alle categorie selezionate.",
    quantityExplanation: "La quantità consigliata corrisponde al numero totale di attività target censite nell'area operativa.",
    helpFaq: [
      {
        q: "Dove vengono distribuiti i volantini?",
        a: "Gli operatori consegnano il materiale promozionale direttamente al personale o alla cassa delle attività commerciali target."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Definisci il raggio attorno alla tua sede o i quartieri dove risiede la maggior densità di aziende clienti o partner."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "Il conteggio riflette le attività registrate e verificate nel database commerciale per l'area selezionata."
      },
      {
        q: "Cosa significa copertura?",
        a: "È la percentuale di imprese e negozi target effettivamente raggiunti dalla distribuzione rispetto al totale censito."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 puoi perfezionare i settori merceologici e i dettagli operativi del servizio B2B."
      }
    ]
  },

  schools: {
    key: "schools",
    name: "Scuole e Università",
    shortTitle: "Presidio poli scolastici e universitari",
    summary: "Distribuzione vicino a scuole, università e poli di formazione, in aree e orari adatti al pubblico studentesco.",
    step2ChoiceDescription: "Nello Step 2 scegli gli istituti di interesse, il raggio circostante e le vie d'accesso primarie.",
    bullets: [
      "Presidio agli ingressi e uscite negli orari di maggior afflusso",
      "Targeting accurato per fasce d'età studentesche",
      "Pianificazione sincronizzata con i calendari scolastici"
    ],
    kpiHouseholdLabel: "Istituti e audience stimata",
    kpiHouseholdDescription: "Poli didattici e bacino di studenti gravitanti nell'area operativa.",
    quantityExplanation: "La quantità consigliata è dimensionata sulla popolazione studentesca e sul numero di accessi monitorati.",
    helpFaq: [
      {
        q: "Dove vengono distribuiti i volantini?",
        a: "In prossimità degli accessi principali di scuole superiori, atenei universitari e centri di formazione negli orari di entrata e uscita."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Puoi selezionare gli istituti presenti sulla mappa e impostare il raggio di presidio attorno ad essi."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "La quantità tiene conto del numero stimato di iscritti e della frequenza dei flussi di ingresso."
      },
      {
        q: "Cosa significa copertura?",
        a: "Percentuale di studenti e visitatori raggiunti rispetto al bacino complessivo dei poli selezionati."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 configuri le date, le fasce orarie e il coordinamento logistico."
      }
    ]
  },

  metro: {
    key: "metro",
    name: "Metro e Stazioni",
    shortTitle: "Presidio nodi di trasporto",
    summary: "Distribuzione in prossimità di stazioni ferroviarie, metropolitane e principali nodi di trasporto.",
    step2ChoiceDescription: "Nello Step 2 selezioni le stazioni, gli accessi e il raggio operativo attorno agli hub di trasporto.",
    bullets: [
      "Massima visibilità sui flussi di pendolari e viaggiatori",
      "Copertura ad alta intensità nelle ore di punta",
      "Posizionamento strategico vicino alle uscite consentite"
    ],
    kpiHouseholdLabel: "Stazioni e flussi passeggeri",
    kpiHouseholdDescription: "Nodi di trasporto e transiti stimati nell'area operativa.",
    quantityExplanation: "La quantità consigliata è proporzionata ai flussi di transito della stazione e alla durata del presidio.",
    helpFaq: [
      {
        q: "Dove vengono distribuiti i volantini?",
        a: "All'esterno delle uscite e negli snodi pedonali adiacenti alle stazioni metropolitane e ferroviarie."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Selezioni direttamente sulla mappa le stazioni della linea o del territorio di tuo interesse."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "In base al volume di passeggeri orario tipico della stazione e al numero di promoter schierati."
      },
      {
        q: "Cosa significa copertura?",
        a: "Quota stimata di viaggiatori intercettati nelle fasce orarie di presidio."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 imposti le fasce orarie (mattina, sera o giornata intera) e il preventivo finale."
      }
    ]
  },

  cars: {
    key: "cars",
    name: "Su Auto (Parcheggi)",
    shortTitle: "Distribuzione su veicoli parcheggiati",
    summary: "Distribuzione di materiale promozionale su veicoli parcheggiati nelle aree consentite e selezionate.",
    step2ChoiceDescription: "Nello Step 2 selezioni le vie, le aree di sosta e i poli commerciali con ampi parcheggi.",
    bullets: [
      "Posizionamento accurato sotto il tergicristallo dei veicoli",
      "Selezione di parcheggi pubblici e aree a sosta prolungata",
      "Rispetto rigoroso delle normative comunali locali"
    ],
    kpiHouseholdLabel: "Veicoli stimati nell'area",
    kpiHouseholdDescription: "Capienza e posti auto stimati nelle aree di sosta dell'area prescelta.",
    quantityExplanation: "La quantità consigliata riflette i posti auto disponibili e il tasso di rotazione dei parcheggi.",
    helpFaq: [
      {
        q: "Dove vengono posizionati i volantini?",
        a: "Sui veicoli in sosta nelle aree consentite, con applicazione ordinata sotto la spazzola tergicristallo."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Selezioni i parcheggi e le zone a forte concentrazione veicolare sulla mappa."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "In base alla capienza dei parcheggi censiti e al turnover veicolare previsto."
      },
      {
        q: "Cosa significa copertura?",
        a: "Percentuale di veicoli presidiati rispetto alla capacità totale delle aree di sosta selezionate."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 confermi i dettagli operativi e procedi al preventivo trasparente."
      }
    ]
  },

  posters: {
    key: "posters",
    name: "Locandine e Affissioni",
    shortTitle: "Posizionamento locandine e manifesti",
    summary: "Posizionamento di locandine o materiale promozionale nei punti e nelle aree previste dal servizio.",
    step2ChoiceDescription: "Nello Step 2 selezioni i punti strategici, le vie commerciali e le aree territoriali da coprire.",
    bullets: [
      "Esposizione in vetrine ed esercizi convenzionati",
      "Presidio delle vie commerciali a massimo impatto visivo",
      "Tracciamento fotografico di ogni locandina esposta"
    ],
    kpiHouseholdLabel: "Punti espositivi stimati",
    kpiHouseholdDescription: "Numero di punti e attività disponibili per l'esposizione nell'area selezionata.",
    quantityExplanation: "La quantità consigliata è calibrata sul numero di punti espositivi idonei censiti nel perimetro.",
    helpFaq: [
      {
        q: "Dove vengono esposte le locandine?",
        a: "All'interno di vetrine, bacheche ed esercizi commerciali autorizzati lungo le vie principali."
      },
      {
        q: "Come scegliamo la zona?",
        a: "Scegli l'area geografica e le strade ad alto passaggio commerciale dove concentrare le affissioni."
      },
      {
        q: "Come viene calcolata la quantità?",
        a: "In base alla densità di attività commerciali disponibili a ospitare le locandine nell'area."
      },
      {
        q: "Cosa significa copertura?",
        a: "Quota di punti espositivi raggiunti rispetto al potenziale massimo dell'area prescelta."
      },
      {
        q: "Cosa succede dopo Step 2?",
        a: "Nello Step 3 visualizzi il piano espositivo e confermi la pianificazione economica."
      }
    ]
  }
};

/**
 * Helper to get the explanation object for any service code (with fallback to d2d).
 */
export function getServiceExplanation(serviceType) {
  const norm = String(serviceType || "d2d").toLowerCase().trim();
  if (norm.includes("h2h") || norm.includes("hand")) return SERVICE_EXPLANATIONS.h2h;
  if (norm.includes("biz") || norm.includes("business") || norm.includes("b2b")) return SERVICE_EXPLANATIONS.business;
  if (norm.includes("school") || norm.includes("scuol")) return SERVICE_EXPLANATIONS.schools;
  if (norm.includes("metro") || norm.includes("station") || norm.includes("stazion") || norm.includes("transit")) return SERVICE_EXPLANATIONS.metro;
  if (norm.includes("car") || norm.includes("auto")) return SERVICE_EXPLANATIONS.cars;
  if (norm.includes("poster") || norm.includes("locandin") || norm.includes("affission")) return SERVICE_EXPLANATIONS.posters;
  return SERVICE_EXPLANATIONS.d2d;
}
