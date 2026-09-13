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

  // Future phases: Customer Dashboard
  if (normalizedPage === "dashboard" || normalizedPage.startsWith("campaign:")) {
    return {
      enabled: false, // Phase 1: disabled
      role: ASSISTANT_ROLES.CUSTOMER,
      page: normalizedPage,
      eyebrow: "Area Cliente · Campagne",
      title: "Assistente VolantiniPro",
      subtitle: "Informazioni e stato delle tue campagne attive.",
      disclaimer: "Sola consultazione dati autorizzati. Nessuna modifica automatica.",
      inputPlaceholder: "Chiedi informazioni sulla tua campagna",
      allowAnonymous: false,
      contextType: "customer_dashboard",
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
