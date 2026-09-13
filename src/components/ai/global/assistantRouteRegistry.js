/**
 * Central Route Registry for the Global VolantiniPro AI Assistant.
 *
 * Maps routes to assistant configurations with strict role and route gating.
 * Phase 1: Only configurator steps 1-4 are enabled.
 * All other routes are disabled by default.
 */

export const ASSISTANT_ROLES = Object.freeze({
  GUEST: "guest",
  CUSTOMER: "customer",
  ADMIN: "admin",
  DRIVER: "driver",
  SUPPLIER: "supplier",
});

export const CONFIGURATOR_STEP_ROUTES = new Set(["step1", "step2", "step3", "step4"]);

/**
 * Returns the assistant configuration for a given route/page.
 *
 * @param {string} page - The current page identifier from router
 * @param {object} [options]
 * @param {object} [options.data] - Configurator data
 * @param {object} [options.context] - Dynamic context for the step/page
 * @returns {object} Route configuration
 */
export function getAssistantRouteConfig(page, { data = {}, context = null } = {}) {
  const normalizedPage = String(page || "").trim().toLowerCase();

  // Configurator steps 1-4
  if (CONFIGURATOR_STEP_ROUTES.has(normalizedPage)) {
    const stepNumber = Number(normalizedPage.replace("step", "")) || 1;
    return {
      enabled: true,
      role: ASSISTANT_ROLES.GUEST,
      page: normalizedPage,
      stepNumber,
      eyebrow: `Preventivo · Step ${stepNumber}`,
      title: "Assistente VolantiniPro",
      subtitle: "Risposte brevi basate sui dati reali di questo Step.",
      disclaimer: "Solo dati del preventivo. Nessuna modifica automatica.",
      inputPlaceholder: "Scrivi una domanda sul preventivo",
      allowAnonymous: true,
      contextType: normalizedPage,
    };
  }

  // Phase 2: Authenticated Customer Dashboard & Subviews
  if (normalizedPage === "dashboard") {
    return {
      enabled: true,
      role: ASSISTANT_ROLES.CUSTOMER,
      page: normalizedPage,
      eyebrow: "Area Cliente · Dashboard",
      title: "Assistente VolantiniPro",
      subtitle: "Informazioni e riepilogo delle tue campagne.",
      disclaimer: "Sola consultazione dati autorizzati. Nessuna modifica automatica.",
      inputPlaceholder: "Chiedi informazioni sulle tue campagne",
      allowAnonymous: false,
      contextType: "customer_dashboard",
      quickQuestions: [
        "Quante campagne ho attive?",
        "Qual è la mia ultima campagna?",
        "Ci sono pagamenti da completare?",
        "Come posso contattare l'assistenza?",
      ],
    };
  }

  if (normalizedPage.startsWith("campaign:")) {
    const campaignId = normalizedPage.split(":")[1];
    return {
      enabled: true,
      role: ASSISTANT_ROLES.CUSTOMER,
      page: normalizedPage,
      campaignId,
      eyebrow: "Area Cliente · Dettaglio Campagna",
      title: "Assistente VolantiniPro",
      subtitle: "Stato, date e dettagli della campagna selezionata.",
      disclaimer: "Sola consultazione dati autorizzati. Nessuna modifica automatica.",
      inputPlaceholder: "Chiedi informazioni su questa campagna",
      allowAnonymous: false,
      contextType: "customer_dashboard",
      quickQuestions: [
        "A che punto è la mia campagna?",
        "Qual è la quantità programmata?",
        "In quale periodo è prevista la distribuzione?",
        "Qual è lo stato del pagamento?",
      ],
    };
  }

  if (normalizedPage.startsWith("customer-tracking:")) {
    const campaignId = normalizedPage.split(":")[1];
    return {
      enabled: true,
      role: ASSISTANT_ROLES.CUSTOMER,
      page: normalizedPage,
      campaignId,
      eyebrow: "Area Cliente · Tracking Live",
      title: "Assistente VolantiniPro",
      subtitle: "Avanzamento e monitoraggio della distribuzione.",
      disclaimer: "Dati operativi autorizzati. Nessun dato personale o GPS non aggregato.",
      inputPlaceholder: "Chiedi informazioni sul tracking",
      allowAnonymous: false,
      contextType: "customer_dashboard",
      quickQuestions: [
        "La distribuzione è iniziata?",
        "Come procedono le zone assegnate?",
        "A che punto è la copertura?",
        "Come posso parlare con un operatore?",
      ],
    };
  }

  if (normalizedPage.startsWith("customer-report:")) {
    const campaignId = normalizedPage.split(":")[1];
    return {
      enabled: true,
      role: ASSISTANT_ROLES.CUSTOMER,
      page: normalizedPage,
      campaignId,
      eyebrow: "Area Cliente · Report Finale",
      title: "Assistente VolantiniPro",
      subtitle: "Dati consuntivi e certificazione della distribuzione.",
      disclaimer: "Sola consultazione dati verificati. Nessuna modifica ai report.",
      inputPlaceholder: "Chiedi informazioni sul report finale",
      allowAnonymous: false,
      contextType: "customer_dashboard",
      quickQuestions: [
        "Il report finale è pronto?",
        "Quanti volantini risultano distribuiti?",
        "Qual è la percentuale di copertura raggiunta?",
        "Come posso scaricare il documento?",
      ],
    };
  }

  if (normalizedPage.startsWith("customer-payment:")) {
    const campaignId = normalizedPage.split(":")[1];
    return {
      enabled: true,
      role: ASSISTANT_ROLES.CUSTOMER,
      page: normalizedPage,
      campaignId,
      eyebrow: "Area Cliente · Pagamento",
      title: "Assistente VolantiniPro",
      subtitle: "Stato del pagamento e istruzioni per il bonifico.",
      disclaimer: "L'assistente è in sola lettura e non registra né conferma pagamenti.",
      inputPlaceholder: "Chiedi informazioni sul pagamento",
      allowAnonymous: false,
      contextType: "customer_dashboard",
      quickQuestions: [
        "Qual è l'importo totale da saldare?",
        "Quali sono le coordinate bancarie per il bonifico?",
        "Lo stato del bonifico è già confermato?",
        "Chi posso contattare per l'amministrazione?",
      ],
    };
  }

  // Phase 3: Global Admin Copilot across all Admin routes
  if (normalizedPage === "admin" || normalizedPage.startsWith("admin-")) {
    let eyebrow = "Pannello Admin · Operatività";
    let subtitle = "Analisi operativa, preventivi e monitoraggio in tempo reale.";
    let quickQuestions = [
      "Quali preventivi sono arrivati oggi?",
      "Quali campagne non sono assegnate?",
      "Quali clienti devono ancora pagare?",
      "Ci sono problemi GPS?",
      "Chi aspetta una risposta?",
    ];
    let campaignId = null;

    if (normalizedPage.includes(":")) {
      campaignId = normalizedPage.split(":")[1];
    }

    if (normalizedPage === "admin") {
      eyebrow = "Pannello Admin · Dashboard";
      subtitle = "Panoramica operativa su preventivi, campagne, pagamenti e anomalie.";
      quickQuestions = [
        "Quali preventivi sono arrivati oggi?",
        "Quali campagne non sono ancora assegnate?",
        "Quali clienti devono ancora pagare?",
        "Quali campagne hanno problemi GPS?",
        "Chi aspetta una risposta?",
      ];
    } else if (normalizedPage === "admin-clients-quotes") {
      eyebrow = "Pannello Admin · Clienti & Preventivi";
      subtitle = "Gestione richieste preventivo e anagrafica clienti.";
      quickQuestions = [
        "Quali sono i preventivi più recenti?",
        "Quali sono ancora in revisione?",
        "Quali hanno importo più alto?",
        "Quali preventivi sono arrivati oggi?",
      ];
    } else if (normalizedPage.startsWith("admin-operations")) {
      eyebrow = "Pannello Admin · Operazioni Campagna";
      subtitle = "Dettagli operativi, pianificazione e stato avanzamento.";
      quickQuestions = [
        "Qual è lo stato della campagna?",
        "È già assegnata?",
        "Il tracking è attivo?",
        "Il report è pronto?",
      ];
    } else if (normalizedPage.startsWith("admin-assignments")) {
      eyebrow = "Pannello Admin · Assegnazione Lavori";
      subtitle = "Affidamento ordini a fornitori e driver.";
      quickQuestions = [
        "Quali fornitori hanno lavori attivi?",
        "Quali campagne non sono ancora assegnate?",
        "Qual è la data prevista per la distribuzione?",
      ];
    } else if (normalizedPage.startsWith("admin-gps")) {
      eyebrow = "Pannello Admin · Monitor GPS";
      subtitle = "Tracciamento in tempo reale, punti operatore e allarmi.";
      quickQuestions = [
        "Quando è arrivato l'ultimo aggiornamento?",
        "Ci sono anomalie?",
        "Qual è la copertura verificata?",
        "Quali driver hanno GPS fermo?",
      ];
    } else if (normalizedPage === "admin-suppliers") {
      eyebrow = "Pannello Admin · Gestione Fornitori";
      subtitle = "Albo fornitori, verifiche documentali e affidamenti.";
      quickQuestions = [
        "Quali fornitori hanno lavori attivi?",
        "Quali hanno più assegnazioni?",
        "Ci sono fornitori in attesa di verifica?",
      ];
    } else if (normalizedPage === "admin-communications") {
      eyebrow = "Pannello Admin · Hub Comunicazioni";
      subtitle = "Messaggi clienti, comunicazioni driver e richieste di modifica.";
      quickQuestions = [
        "Chi aspetta una risposta?",
        "Ci sono messaggi non letti dai clienti?",
        "Ci sono segnalazioni o richieste di modifica?",
      ];
    } else if (normalizedPage === "admin-analytics") {
      eyebrow = "Pannello Admin · Analytics & Traffico";
      subtitle = "Dati sul traffico, funnel di conversione e conversion rate.";
      quickQuestions = [
        "Quali sono le pagine con più traffico?",
        "Quanti preventivi sono stati completati?",
        "Qual è il tasso di conversione?",
      ];
    }

    return {
      enabled: true,
      role: ASSISTANT_ROLES.ADMIN,
      page: normalizedPage,
      campaignId,
      eyebrow,
      title: "Assistente VolantiniPro Copilot",
      subtitle,
      disclaimer: "Dati operativi autorizzati per amministratori. Operazioni in sola lettura.",
      inputPlaceholder: "Chiedi informazioni o scrivi un comando (es. preventivi oggi)",
      allowAnonymous: false,
      contextType: "admin_dashboard",
      quickQuestions,
    };
  }

  // Phase 4: Driver
  if (normalizedPage.startsWith("driver-assignment") || normalizedPage.startsWith("driver-map")) {
    const isMap = normalizedPage.includes("map");
    const assignmentId = normalizedPage.includes(":") ? normalizedPage.split(":")[1] : null;
    return {
      enabled: true,
      role: ASSISTANT_ROLES.DRIVER,
      page: normalizedPage,
      assignmentId,
      eyebrow: isMap ? "Driver · Mappa & Geofence" : "Driver · Incarico & Programma",
      title: "Assistente VolantiniPro",
      subtitle: isMap ? "Verifica della posizione, confini e tracciamento GPS." : "Informazioni sulle zone assegnate e procedura di turno.",
      disclaimer: "Sola lettura dell'assegnazione corrente. Nessuna modifica automatica.",
      inputPlaceholder: "Chiedi sulla zona, volantini o stato GPS",
      allowAnonymous: false,
      contextType: "driver_assignment",
      quickQuestions: isMap
        ? [
            "Qual è la mia zona attiva?",
            "Sono dentro la zona?",
            "Il GPS sta funzionando?",
            "Quanti volantini devo distribuire?",
          ]
        : [
            "Qual è la mia zona attiva?",
            "Quanti volantini devo distribuire?",
            "Il GPS sta funzionando?",
            "Cosa devo fare per chiudere il lavoro?",
            "Come carico la prova?",
            "Quante zone mi restano?",
          ],
    };
  }

  // Phase 4: Supplier
  if (normalizedPage === "supplier" || normalizedPage === "supplier-dashboard" || normalizedPage.startsWith("supplier-dashboard:")) {
    return {
      enabled: true,
      role: ASSISTANT_ROLES.SUPPLIER,
      page: normalizedPage,
      eyebrow: "Fornitore · Dashboard Marketplace",
      title: "Assistente VolantiniPro Copilot",
      subtitle: "Informazioni sui lavori affidati, compensi concordati e offerte.",
      disclaimer: "Sola lettura dei lavori affidati. Nessuna modifica automatica.",
      inputPlaceholder: "Chiedi informazioni sui tuoi lavori o compensi",
      allowAnonymous: false,
      contextType: "supplier_dashboard",
      quickQuestions: [
        "Quali lavori ho attivi?",
        "Quanto è il mio compenso per questa campagna?",
        "Quando devo iniziare?",
        "Quali zone devo coprire?",
        "Quali lavori sono ancora da accettare?",
      ],
    };
  }

  // Default: Disabled for all other pages (homepage, legal, quick quote, etc.)
  return {
    enabled: false,
    role: ASSISTANT_ROLES.GUEST,
    page: normalizedPage,
    eyebrow: null,
    title: "Assistente VolantiniPro",
    subtitle: null,
    disclaimer: null,
    inputPlaceholder: "Scrivi un messaggio",
    allowAnonymous: true,
    contextType: null,
  };
}

/**
 * Helper to check if assistant trigger and drawer should be active for a route.
 */
export function isAssistantEnabledForRoute(page) {
  return getAssistantRouteConfig(page).enabled === true;
}
