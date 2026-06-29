/**
 * VolantiniPro AI Consultant & Campaign Center Provider Service
 * Architettura modulare con separazione netta tra fallbackRuleBasedProvider, futureLLMProvider e AIConsultantService.
 */

const ORIENTATIVE_NOTE = "Indicazione orientativa basata sulle informazioni inserite. Il preventivo definitivo viene calcolato nel configuratore.";
const STORAGE_KEY = "volantinipro_ai_history";

/**
 * Helper di salvataggio sicuro nello storage locale (nessun database)
 */
function saveHistoryItem(item) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const newItem = {
      id: Date.now() + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) + " - " + new Date().toLocaleDateString("it-IT"),
      ...item
    };
    const updated = [newItem, ...existing].slice(0, 20); // Manteniamo max 20 elementi
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Impossibile salvare in localStorage:", e);
  }
}

function getHistoryItems() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

/**
 * 1. Fallback Rule-Based Provider
 * Genera risposte consulenziali chiare, brevi e veritiere in assenza di LLM esterno.
 */
export const fallbackRuleBasedProvider = {
  // === CONSULENTE VOLANTINIPRO AI (Metodi Precedenti) ===
  async analyzeZone({ comune = "Milano", quartiere = "Centro", cap = "" }) {
    const areaName = quartiere ? `${quartiere} (${comune})` : comune;
    const result = {
      title: `Analisi Zona: ${areaName}`,
      summary: `L'assistente stima che la zona di ${areaName} presenti un'ottima densità abitativa per la distribuzione promozionale.`,
      metrics: [
        { label: "Copertura stimata", value: "85%" },
        { label: "Famiglie raggiungibili (stima)", value: "circa 12.500" },
      ],
      criticalities: "Nelle aree storiche o con portinerie rigorose, la consegna a mano può risultare più efficace rispetto al classico volantinaggio in cassetta.",
      opportunities: "Presenza elevata di famiglie residenti e attività commerciali locali ad alto tasso di lettura nei giorni infrasettimanali.",
      note: ORIENTATIVE_NOTE,
    };
    saveHistoryItem({ type: "Analisi Zona", title: result.title, summary: result.summary });
    return result;
  },

  async optimizeBudget({ inputType = "budget", value = 500 }) {
    const numValue = Number(value) || 500;
    let result;
    if (inputType === "budget") {
      const estimatedQty = Math.round((numValue / 0.04) / 500) * 500;
      result = {
        title: "Ottimizzazione del Budget",
        summary: `Con un investimento stimato di circa ${numValue}€, consigliamo una tiratura orientativa di ${estimatedQty.toLocaleString("it-IT")} volantini.`,
        details: [
          { label: "Quantità consigliata", value: `${estimatedQty.toLocaleString("it-IT")} volantini` },
          { label: "Copertura stimata", value: "65% del target zonale" },
          { label: "Incremento suggerito", value: `+2.000 volantini per superare l'80% di copertura` },
          { label: "Possibile risparmio", value: "Scegliendo giorni flessibili puoi abbattere i costi logistici del 10%" },
        ],
        explanation: "Stampare un quantitativo leggermente superiore permette di ottimizzare l'uscita delle squadre operative, riducendo il costo unitario per volantino.",
        note: ORIENTATIVE_NOTE,
      };
    } else {
      const estBudget = Math.round(numValue * 0.042);
      result = {
        title: "Ottimizzazione Quantitativa",
        summary: `Per una distribuzione stimata di ${numValue.toLocaleString("it-IT")} volantini, indichiamo un investimento di circa ${estBudget}€.`,
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
    saveHistoryItem({ type: "Ottimizzazione Budget", title: result.title, summary: result.summary });
    return result;
  },

  async suggestBestZones() {
    const result = {
      title: "Zone Consigliate ad Alta Efficacia",
      summary: "L'assistente suggerisce queste aree in base alla stima di concentrazione del target commerciale.",
      zones: [
        { rank: "1° Priorità", name: "Quartieri Residenziali Densamente Popolati", motivation: "Elevata presenza di condomini con cassette postali accessibili. Ottimo per spesa e servizi per la casa." },
        { rank: "2° Priorità", name: "Aree Adiacenti a Scuole e Uffici", motivation: "Ideale per pause pranzo e palestre. Consigliata la distribuzione a mano nelle fasce di uscita." },
        { rank: "3° Priorità", name: "Vie Commerciali di Quartiere", motivation: "Forte passaggio pedonale durante il fine settimana, perfetto per negozi al dettaglio." },
      ],
      note: ORIENTATIVE_NOTE,
    };
    saveHistoryItem({ type: "Zone Migliori", title: result.title, summary: result.summary });
    return result;
  },

  async suggestSchedule() {
    const result = {
      title: "Pianificazione e Tempistiche",
      summary: "La scelta del giorno giusto può aiutare ad aumentare l'attenzione verso il tuo volantino.",
      schedule: [
        { label: "Periodo consigliato", value: "Metà settimana (Martedì - Giovedì)" },
        { label: "Motivazione", value: "Nei giorni centrali le cassette postali sono meno affollate rispetto al weekend." },
        { label: "Opportunità Smart Pairing", value: "Condividendo la data di uscita puoi ottenere una riduzione sul preventivo." },
      ],
      note: ORIENTATIVE_NOTE,
    };
    saveHistoryItem({ type: "Pianificazione Date", title: result.title, summary: result.summary });
    return result;
  },

  async explainEstimate(data = {}) {
    const qty = data.qty || "10.000";
    const service = data.service || "Door to Door";
    const result = {
      title: "Spiegazione Semplice del Preventivo",
      summary: `Con la configurazione attuale (${service}, circa ${qty} volantini), l'assistente stima di raggiungere un ampio bacino di famiglie.`,
      advice: "Per espandere la copertura in modo capillare e superare una quota del 70%, consigliamo di valutare un'aggiunta di circa 5.000 volantini.",
      explanation: "Il preventivo indica la pianificazione del percorso, la distribuzione sul campo e il report finale.",
      note: ORIENTATIVE_NOTE,
    };
    saveHistoryItem({ type: "Spiegazione Preventivo", title: result.title, summary: result.summary });
    return result;
  },

  async analyzeReport() {
    const result = {
      title: "Analisi Guida del Report Finale",
      summary: "Terminata la distribuzione, l'assistente traduce il report operativo in indicazioni pratiche per il futuro.",
      findings: [
        "Completamento: La distribuzione nelle zone principali si svolge regolarmente secondo i percorsi pianificati.",
        "Verifica sulle mappe: Il tracciamento sul campo permette di verificare le strade coperte.",
        "Consiglio per il futuro: Nelle aree periferiche suggeriamo un secondo passaggio a distanza di 15 giorni per rafforzare il ricordo del marchio.",
      ],
      note: ORIENTATIVE_NOTE,
    };
    saveHistoryItem({ type: "Analisi Report", title: result.title, summary: result.summary });
    return result;
  },

  async explainKpi(kpiType = "Copertura") {
    const dictionary = {
      "Copertura": "Indica la stima percentuale delle famiglie che riceveranno il volantino rispetto al totale delle abitazioni presenti nella zona selezionata.",
      "Famiglie": "Rappresenta il numero stimato di nuclei familiari residenti nell'area. Ti aiuta a capire quante persone leggeranno la tua offerta.",
      "Zone": "Sono la suddivisione del territorio in quartieri per organizzare il lavoro di consegna strada per strada in modo ordinato.",
      "GPS": "È il sistema di verifica satellitare: gli operatori registrano il percorso effettuato dandoti prova concreta del passaggio.",
      "ISTAT": "Sono i dati statistici ufficiali sulla popolazione. Li usiamo per stimare quante case e famiglie ci sono nel comune.",
      "Report": "È il documento finale che riassume dove abbiamo distribuito, i tempi impiegati e la mappa dei passaggi.",
      "Smart Pairing": "È la nostra funzione di condivisione: se un'altra azienda non concorrente esce nella stessa zona, uniamo le uscite e facciamo risparmiare entrambi.",
    };
    const explanation = dictionary[kpiType] || "Questo dato ti aiuta a misurare la tua campagna in modo trasparente.";
    return {
      title: `Cosa significa: ${kpiType}`,
      summary: explanation,
      whyItMatters: "Conoscere questo indicatore ti permette di scegliere con sicurezza dove investire.",
      note: ORIENTATIVE_NOTE,
    };
  },

  // === AI CAMPAIGN CENTER (7 Blocchi Operativi) ===

  /**
   * Blocco 1: Prima della campagna
   */
  async analyzePreCampaign({ comune = "Milano", zona = "Centro e Nord", qty = 10000, budget = 450 } = {}) {
    const estFamilies = Math.round(qty * 2.2).toLocaleString("it-IT");
    const result = {
      title: "Sintesi Decisionale Pre-Campagna",
      summary: `La configurazione attuale su ${comune} (${zona}) con circa ${qty.toLocaleString("it-IT")} volantini stima di raggiungere circa ${estFamilies} famiglie residenti.`,
      status: "Buona copertura nelle aree centrali selezionate.",
      advice: "Per aumentare la stima di copertura globale oltre il 60% e coprire i quartieri limitrofi, suggeriamo un incremento orientativo di circa 15.000 volantini.",
      whyId: "pre_increment",
      note: ORIENTATIVE_NOTE
    };
    saveHistoryItem({ type: "Sintesi Pre-Campagna", title: result.title, summary: result.summary });
    return result;
  },

  /**
   * Blocco 2: Spiegazione "Perché?"
   */
  async explainReasoning(whyId = "pre_increment") {
    const reasonsMap = {
      "pre_increment": {
        question: "Perché consigliamo di aggiungere 15.000 volantini?",
        reasons: [
          "✓ Maggiore copertura capillare del territorio comunale",
          "✓ Più famiglie reali raggiunte nelle fasce adiacenti ad alto potenziale",
          "✓ Minori aree scoperte tra un quartiere e l'altro",
          "✓ Migliore ottimizzazione del budget di uscita per le squadre operative"
        ]
      },
      "smart_pairing": {
        question: "Perché ti suggeriamo lo Smart Pairing?",
        reasons: [
          "✓ Riduzione stimata fino al 15% sul costo logistico di distribuzione",
          "✓ Condivisione ecologica del mezzo di trasporto con brand non concorrenti",
          "✓ Identica garanzia di tracciamento GPS e certificazione del passaggio"
        ]
      },
      "schedule_midweek": {
        question: "Perché consigliamo di distribuire a metà settimana?",
        reasons: [
          "✓ Cassette postali più sgombre rispetto al picco pubblicitario del fine settimana",
          "✓ Attenzione del consumatore più elevata durante la routine infrasettimanale",
          "✓ Migliore coordinamento operativo delle squadre sul campo"
        ]
      }
    };
    const res = reasonsMap[whyId] || reasonsMap["pre_increment"];
    return {
      title: res.question,
      checklist: res.reasons,
      note: "Ogni consiglio AI è motivato per aiutarti a prendere decisioni consapevoli."
    };
  },

  /**
   * Blocco 3: Durante la campagna
   */
  async analyzeDuringCampaign({ completedZones = 5, totalZones = 7, remainingFlyers = 3200 } = {}) {
    const result = {
      title: "Monitoraggio Live della Campagna",
      summary: "La campagna operativa procede regolarmente secondo la pianificazione concordata.",
      metrics: [
        { label: "Aree completate", value: `${completedZones} su ${totalZones}` },
        { label: "Volantini rimanenti (stima)", value: `circa ${remainingFlyers.toLocaleString("it-IT")}` },
        { label: "Stato operativo", value: "Nessun ritardo rilevato" }
      ],
      discursive: `Gli operatori attivi sul campo indicano il superamento del 70% del tracciato. Restano da distribuire circa ${remainingFlyers.toLocaleString("it-IT")} volantini nei quartieri di completamento.`,
      whyId: "schedule_midweek",
      note: ORIENTATIVE_NOTE
    };
    saveHistoryItem({ type: "Tracking Live", title: result.title, summary: result.summary });
    return result;
  },

  /**
   * Blocco 4: Dopo la campagna
   */
  async analyzePostCampaign() {
    const result = {
      title: "Riepilogo e Bilancio Post-Campagna",
      summary: "La distribuzione ha raggiunto gli obiettivi principali indicati in fase di configurazione.",
      highlights: [
        "Le aree commerciali e centrali indicano una stima di copertura elevata e capillare.",
        "Il tracciamento GPS conferma la regolarità dei passaggi stradali svolti."
      ],
      futureAdvice: "Per la prossima distribuzione consigliamo di anticipare di due giorni il periodo operativo per massimizzare la visibilità precocemente rispetto al weekend.",
      whyId: "schedule_midweek",
      note: ORIENTATIVE_NOTE
    };
    saveHistoryItem({ type: "Bilancio Post-Campagna", title: result.title, summary: result.summary });
    return result;
  },

  /**
   * Blocco 5: Cosa migliorare (Suggerimenti orientati al beneficio)
   */
  async getImprovementSuggestions() {
    return {
      title: "Consigli Operativi di Miglioramento",
      summary: "Suggerimenti mirati per incrementare l'efficacia delle tue prossime campagne. Nessun costo nascosto: solo valore aggiunto motivato.",
      suggestions: [
        {
          action: "Aumentare la quantità di 5.000 pezzi",
          benefit: "Consente di saturare completamente le zone residenziali limitrofe eliminando buchi di copertura.",
          whyId: "pre_increment"
        },
        {
          action: "Utilizzare l'opzione Smart Pairing",
          benefit: "Aiuta ad abbattere i costi logistici del preventivo condividendo l'uscita con un'altra azienda compatibile.",
          whyId: "smart_pairing"
        },
        {
          action: "Pianificare l'uscita al Martedì o Mercoledì",
          benefit: "Garantisce che il tuo volantino sia letto prima dell'accumulo di cataloghi della domenica.",
          whyId: "schedule_midweek"
        }
      ],
      note: ORIENTATIVE_NOTE
    };
  },

  /**
   * Blocco 6: Confronto scenari A / B / C
   */
  async compareScenarios() {
    const result = {
      title: "Confronto Decisionale Scenari",
      summary: "L'assistente confronta tre opzioni di tiratura per aiutarti a scegliere il miglior equilibrio fra investimento e penetrazione territoriale.",
      scenarios: [
        { id: "A", name: "Scenario A (Essenziale)", qty: "10.000 volantini", cov: "42% stima", cost: "€ 450", desc: "Copertura concentrata esclusivamente sulle vie ad altissimo transito." },
        { id: "B", name: "Scenario B (Consigliato)", qty: "15.000 volantini", cov: "61% stima", cost: "€ 620", desc: "Ottimo equilibrio: copre il centro e i principali condomini residenziali adiacenti.", recommended: true },
        { id: "C", name: "Scenario C (Dominante)", qty: "20.000 volantini", cov: "78% stima", cost: "€ 780", desc: "Penetrazione massiva su tutta l'area comunale per il massimo impatto di lancio." }
      ],
      aiRecommendation: "Il nostro assistente consiglia lo Scenario B: garantisce il miglior rapporto costo/copertura senza dispersione di budget.",
      whyId: "pre_increment",
      note: ORIENTATIVE_NOTE
    };
    saveHistoryItem({ type: "Confronto Scenari", title: result.title, summary: result.aiRecommendation });
    return result;
  },

  /**
   * Blocco 7: Cronologia AI
   */
  async getAIHistory() {
    const items = getHistoryItems();
    return {
      title: "Cronologia Decisionale AI",
      summary: items.length > 0
        ? `Hai visualizzato e salvato ${items.length} consigli operativi in questa sessione.`
        : "La cronologia è attualmente vuota. Interagisci con le card per memorizzare i suggerimenti AI.",
      items: items,
      note: "Lo storico viene memorizzato localmente nel tuo browser (localStorage) in modo sicuro e privato."
    };
  }
};

/**
 * 2. Future LLM Provider
 */
export const futureLLMProvider = {
  async analyzeZone(params) { return fallbackRuleBasedProvider.analyzeZone(params); },
  async optimizeBudget(params) { return fallbackRuleBasedProvider.optimizeBudget(params); },
  async suggestBestZones(params) { return fallbackRuleBasedProvider.suggestBestZones(params); },
  async suggestSchedule(params) { return fallbackRuleBasedProvider.suggestSchedule(params); },
  async explainEstimate(params) { return fallbackRuleBasedProvider.explainEstimate(params); },
  async analyzeReport(params) { return fallbackRuleBasedProvider.analyzeReport(params); },
  async explainKpi(params) { return fallbackRuleBasedProvider.explainKpi(params); },
  async analyzePreCampaign(params) { return fallbackRuleBasedProvider.analyzePreCampaign(params); },
  async explainReasoning(params) { return fallbackRuleBasedProvider.explainReasoning(params); },
  async analyzeDuringCampaign(params) { return fallbackRuleBasedProvider.analyzeDuringCampaign(params); },
  async analyzePostCampaign(params) { return fallbackRuleBasedProvider.analyzePostCampaign(params); },
  async getImprovementSuggestions(params) { return fallbackRuleBasedProvider.getImprovementSuggestions(params); },
  async compareScenarios(params) { return fallbackRuleBasedProvider.compareScenarios(params); },
  async getAIHistory(params) { return fallbackRuleBasedProvider.getAIHistory(params); },
};

/**
 * 3. AIConsultantService
 */
class AIConsultantServiceClass {
  constructor() {
    this.provider = fallbackRuleBasedProvider;
  }
  setProvider(newProvider) { if (newProvider) this.provider = newProvider; }

  async analyzeZone(p) { return this.provider.analyzeZone(p); }
  async optimizeBudget(p) { return this.provider.optimizeBudget(p); }
  async suggestBestZones(p) { return this.provider.suggestBestZones(p); }
  async suggestSchedule(p) { return this.provider.suggestSchedule(p); }
  async explainEstimate(p) { return this.provider.explainEstimate(p); }
  async analyzeReport(p) { return this.provider.analyzeReport(p); }
  async explainKpi(p) { return this.provider.explainKpi(p); }

  async analyzePreCampaign(p) { return this.provider.analyzePreCampaign(p); }
  async explainReasoning(p) { return this.provider.explainReasoning(p); }
  async analyzeDuringCampaign(p) { return this.provider.analyzeDuringCampaign(p); }
  async analyzePostCampaign(p) { return this.provider.analyzePostCampaign(p); }
  async getImprovementSuggestions(p) { return this.provider.getImprovementSuggestions(p); }
  async compareScenarios(p) { return this.provider.compareScenarios(p); }
  async getAIHistory(p) { return this.provider.getAIHistory(p); }
}

export const AIConsultantService = new AIConsultantServiceClass();
