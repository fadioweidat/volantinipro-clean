export const isProduction = import.meta.env.PROD;

export const allowMockData =
  import.meta.env.DEV && import.meta.env.VITE_ALLOW_MOCK_DATA === "true";

export const isCustomerAiDashboardEnabled = import.meta.env.VITE_FEATURE_AI_CUSTOMER_DASHBOARD === "true";
export const isAdminAiDashboardEnabled = import.meta.env.VITE_FEATURE_AI_ADMIN_DASHBOARD === "true";
export const isTerritorialStep2AiEnabled = import.meta.env.VITE_AI_TERRITORIAL_STEP2_ENABLED === "true";
