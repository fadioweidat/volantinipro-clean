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

  // Future phases: Admin Dashboard
  if (normalizedPage === "admin" || normalizedPage.startsWith("admin-")) {
    return {
      enabled: false, // Phase 1: existing inline panel remains on /admin; global drawer disabled
      role: ASSISTANT_ROLES.ADMIN,
      page: normalizedPage,
      eyebrow: "Pannello Admin · Operatività",
      title: "Assistente VolantiniPro Copilot",
      subtitle: "Analisi operativa e monitoraggio in tempo reale.",
      disclaimer: "Dati operativi autorizzati per amministratori.",
      inputPlaceholder: "Chiedi informazioni sulle operazioni di oggi",
      allowAnonymous: false,
      contextType: "admin_dashboard",
    };
  }

  // Future phases: Driver
  if (normalizedPage.startsWith("driver")) {
    return {
      enabled: false, // Phase 1: disabled
      role: ASSISTANT_ROLES.DRIVER,
      page: normalizedPage,
      eyebrow: "Driver · Assegnazione",
      title: "Assistente VolantiniPro",
      subtitle: "Informazioni sulla tua zona di distribuzione.",
      disclaimer: "Sola lettura dell'assegnazione corrente.",
      inputPlaceholder: "Chiedi informazioni sulla zona assegnata",
      allowAnonymous: false,
      contextType: "driver_assignment",
    };
  }

  // Future phases: Supplier
  if (normalizedPage === "supplier-dashboard") {
    return {
      enabled: false, // Phase 1: disabled
      role: ASSISTANT_ROLES.SUPPLIER,
      page: normalizedPage,
      eyebrow: "Fornitore · Gestione",
      title: "Assistente VolantiniPro",
      subtitle: "Informazioni sui lavori affidati.",
      disclaimer: "Sola lettura delle campagne affidate.",
      inputPlaceholder: "Chiedi informazioni sui lavori affidati",
      allowAnonymous: false,
      contextType: "supplier_dashboard",
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
