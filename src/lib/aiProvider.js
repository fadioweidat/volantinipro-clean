/**
 * VolantiniPro AI Consultant Provider Service
 * Architettura modulare con separazione netta tra fallbackRuleBasedProvider, futureLLMProvider e AIConsultantService.
 */

const ORIENTATIVE_NOTE = "Indicazione orientativa basata sulle informazioni inserite. Il preventivo definitivo viene calcolato nel configuratore.";

/**
 * 1. Fallback Rule-Based Provider
 * Genera risposte consulenziali chiare, brevi e prive di tecnicismi in assenza di LLM esterno.
 * Utilizza termini corretti (stima, consiglia, suggerisce, spiega).
 */
export const fallbackRuleBasedProvider = {
  async analyzeZone({ comune = "Milano", quartiere = "Centro", cap = "" }) {
    const areaName = quartiere ? `${quartiere} (${comune})` : comune;
    return {
      title: `Analisi Zona: ${areaName}`,
      summary: `L'assistente stima che la zona di ${areaName} presenti un'ottima densità abitativa per la distribuzione in cassetta postale.`,
      metrics: [
        { label: "Copertura stimata", value: "85%" },
        { label: "Famiglie raggiungibili (stima)", value: "circa 12.500" },
      ],
      criticalities: "Nelle aree storiche o con portinerie rigorose, la consegna a mano (Hand to Hand) può risultare più efficace rispetto al classico volantinaggio in cassetta.",
      opportunities: "Presenza elevata di famiglie residenti e attività commerciali locali ad alto tasso di lettura nei giorni infrasettimanali.",
      note: ORIENTATIVE_NOTE,
    };
  },

  async optimizeBudget({ inputType = "budget", value = 500 }) {
    const numValue = Number(value) || 500;
    if (inputType === "budget") {
      const estimatedQty = Math.round((numValue / 0.04) / 500) * 500; // Stima ~0.04€/volantino
      const suggestedQty = estimatedQty + 2000;
      return {
        title: "Ottimizzazione del Budget",
        summary: `Con un investimento stimato di circa ${numValue}€, consigliamo una tiratura di partenza di ${estimatedQty.toLocaleString("it-IT")} volantini.`,
        details: [
          { label: "Quantità consigliata", value: `${estimatedQty.toLocaleString("it-IT")} volantini` },
          { label: "Copertura stimata", value: "65% del target zonale" },
          { label: "Incremento suggerito", value: `+2.000 volantini per superare l'80% di copertura` },
          { label: "Possibile risparmio", value: "Scegliendo giorni flessibili puoi abbattere i costi logistici del 10%" },
        ],
        explanation: "Stampare e distribuire un quantitativo leggermente superiore permette di ottimizzare il costo di uscita delle squadre operative, riducendo il costo unitario per volantino.",
        note: ORIENTATIVE_NOTE,
      };
    } else {
      // inputType === "qty"
      const estBudget = Math.round(numValue * 0.042);
      return {
        title: "Ottimizzazione Quantitativa",
        summary: `Per una distribuzione di ${numValue.toLocaleString("it-IT")} volantini, stiamo stimando un investimento di circa ${estBudget}€.`,
        details: [
          { label: "Quantità analizzata", value: `${numValue.toLocaleString("it-IT")}` },
          { label: "Copertura stimata", value: numValue > 10000 ? "Elevata (>75%)" : "Mirata (~45%)" },
          { label: "Consiglio operativo", value: "Abbinare il servizio Door to Door per i quartieri residenziali" },
          { label: "Possibile risparmio", value: "Attivando lo Smart Pairing (condivisione zona) risparmi fino al 15%" },
        ],
        explanation: "Concentrare la quantità scelta sulle vie ad alta densità abitativa evita disperdersi in zone periferiche a basso riscontro commerciale.",
        note: ORIENTATIVE_NOTE,
      };
    }
  },

  async suggestBestZones() {
    return {
      title: "Zone Consigliate ad Alta Efficacia",
      summary: "L'assistente suggerisce queste aree in base alla concentrazione di famiglie compatibili con le promozioni locali.",
      zones: [
        { rank: "1° Priorità", name: "Quartieri Residenziali Densamente Popolati", motivation: "Elevata presenza di condomini con cassette postali accessibili. Ottimo per spesa, servizi per la casa e cura della persona." },
        { rank: "2° Priorità", name: "Aree Adiacenti a Scuole e Uffici", motivation: "Ideale per pause pranzo, palestre e corsi. Consigliata la distribuzione a mano nelle fasce di uscita." },
        { rank: "3° Priorità", name: "Vie Commerciali di Quartiere", motivation: "Forte passaggio pedonale durante il fine settimana, perfetto per lanci di nuove attività e negozi al dettaglio." },
      ],
      note: ORIENTATIVE_NOTE,
    };
  },

  async suggestSchedule() {
    return {
      title: "Pianificazione e Tempistiche",
      summary: "La scelta del giorno giusto aumenta significativamente l'attenzione del cliente verso il tuo volantino.",
      schedule: [
        { label: "Periodo consigliato", value: "Metà settimana (Martedì - Giovedì)" },
        { label: "Motivazione", value: "Nei giorni centrali della settimana le cassette postali sono meno affollate di materiale pubblicitario rispetto al weekend." },
        { label: "Opportunità Smart Pairing", value: "Condividendo la data di uscita con campagne stagionali compatibili puoi ottenere uno sconto immediato sul preventivo." },
      ],
      note: ORIENTATIVE_NOTE,
    };
  },

  async explainEstimate(data = {}) {
    const qty = data.qty || "10.000";
    const service = data.service || "Door to Door";
    return {
      title: "Spiegazione Semplice del Preventivo",
      summary: `Con la configurazione attuale (${service}, circa ${qty} volantini), l'assistente stima che raggiungerai un ampio bacino di famiglie nel territorio selezionato.`,
      advice: "Per espandere la copertura in modo capillare su tutti i quartieri limitrofi e superare una quota del 70%, consigliamo di valutare un'aggiunta di circa 5.000 volantini.",
      explanation: "Il preventivo include la pianificazione del percorso, la distribuzione certificata sul campo e il report di verifica finale.",
      note: ORIENTATIVE_NOTE,
    };
  },

  async analyzeReport() {
    return {
      title: "Analisi Guida del Report Finale",
      summary: "Terminata la distribuzione, l'assistente traduce il report operativo in indicazioni pratiche per il futuro.",
      findings: [
        "Completamento: La distribuzione nelle zone principali si svolge regolarmente secondo i percorsi pianificati.",
        "Verifica sulle mappe: Il tracciamento sul campo permette di confermare le strade coperte con precisione.",
        "Consiglio per il futuro: Nelle aree periferiche o a bassa densità, suggeriamo un secondo passaggio a distanza di 15 giorni per rafforzare il ricordo del marchio.",
      ],
      note: ORIENTATIVE_NOTE,
    };
  },

  async explainKpi(kpiType = "Copertura") {
    const dictionary = {
      "Copertura": "Indica la stima percentuale delle famiglie che riceveranno il volantino rispetto al totale delle abitazioni presenti nella zona selezionata.",
      "Famiglie": "Rappresenta il numero stimato di nuclei familiari residenti nell'area. Ti aiuta a capire quante persone reali leggeranno la tua offerta (dati statistici territoriali semplificati).",
      "Zone": "Sono la suddivisione del territorio in quartieri o aree operative per organizzare il lavoro di consegna strada per strada in modo ordinato.",
      "GPS": "È il sistema di verifica satellitare: gli operatori hanno un dispositivo che registra il percorso effettuato, dandoti la prova concreta che la zona è stata percorsa.",
      "ISTAT": "Sono i dati statistici ufficiali italiani sulla popolazione. Li usiamo per capire quante case e famiglie ci sono in un comune senza che tu debba fare calcoli complicati.",
      "Report": "È il documento finale che ti consegniamo a fine lavoro: riassume dove abbiamo distribuito, i tempi impiegati e la mappa dei passaggi.",
      "Smart Pairing": "È la nostra funzione di condivisione intelligente: se un'altra azienda non concorrente distribuisce nella stessa zona e negli stessi giorni, uniamo le uscite e facciamo risparmiare entrambi.",
    };
    const explanation = dictionary[kpiType] || "Questo dato ti aiuta a misurare e pianificare la tua campagna di volantinaggio in modo trasparente e senza sprechi.";
    return {
      title: `Cosa significa: ${kpiType}`,
      summary: explanation,
      whyItMatters: "Conoscere questo indicatore ti permette di scegliere con sicurezza quanto investire e in quali quartieri concentrare la comunicazione.",
      note: ORIENTATIVE_NOTE,
    };
  },
};

/**
 * 2. Future LLM Provider
 * Predisposizione modulare per collegare API esterne (es. Google Gemini, OpenAI).
 * Mantiene la stessa identica interfaccia di fallbackRuleBasedProvider.
 */
export const futureLLMProvider = {
  async analyzeZone(params) {
    // Quando sarà disponibile una chiave API LLM, inserire qui la chiamata di rete (es. fetch verso endpoint API)
    return fallbackRuleBasedProvider.analyzeZone(params);
  },
  async optimizeBudget(params) {
    return fallbackRuleBasedProvider.optimizeBudget(params);
  },
  async suggestBestZones(params) {
    return fallbackRuleBasedProvider.suggestBestZones(params);
  },
  async suggestSchedule(params) {
    return fallbackRuleBasedProvider.suggestSchedule(params);
  },
  async explainEstimate(params) {
    return fallbackRuleBasedProvider.explainEstimate(params);
  },
  async analyzeReport(params) {
    return fallbackRuleBasedProvider.analyzeReport(params);
  },
  async explainKpi(params) {
    return fallbackRuleBasedProvider.explainKpi(params);
  },
};

/**
 * 3. AIConsultantService
 * Servizio principale esportato verso l'interfaccia utente.
 * Seleziona dinamicamente il provider (attualmente fallbackRuleBasedProvider per garantire operatività 100% offline e priva di errori).
 */
class AIConsultantServiceClass {
  constructor() {
    // Di default utilizziamo il provider rule-based ad alta fedeltà
    this.provider = fallbackRuleBasedProvider;
  }

  setProvider(newProvider) {
    if (newProvider) {
      this.provider = newProvider;
    }
  }

  async analyzeZone(params) {
    return this.provider.analyzeZone(params);
  }

  async optimizeBudget(params) {
    return this.provider.optimizeBudget(params);
  }

  async suggestBestZones(params) {
    return this.provider.suggestBestZones(params);
  }

  async suggestSchedule(params) {
    return this.provider.suggestSchedule(params);
  }

  async explainEstimate(params) {
    return this.provider.explainEstimate(params);
  }

  async analyzeReport(params) {
    return this.provider.analyzeReport(params);
  }

  async explainKpi(params) {
    return this.provider.explainKpi(params);
  }
}

export const AIConsultantService = new AIConsultantServiceClass();
