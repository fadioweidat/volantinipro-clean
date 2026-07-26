export const isProduction = import.meta.env.PROD;

export const allowMockData =
  import.meta.env.DEV && import.meta.env.VITE_ALLOW_MOCK_DATA === "true";

export const isCustomerAiDashboardEnabled = import.meta.env.VITE_FEATURE_AI_CUSTOMER_DASHBOARD === "true";
