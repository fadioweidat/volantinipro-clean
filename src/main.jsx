import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "../volantinipro-final.jsx";
import { CampaignTracking } from "./pages/customer/CampaignTracking.jsx";
import { ClientCampaignReport } from "./pages/customer/ClientCampaignReport.jsx";
import { TrackingPage } from "./pages/driver/TrackingPage.jsx";
import { AdminRouteGuard } from "./components/admin/AdminGuard.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";

// Code splitting: tutte le pagine admin-only sotto sono caricate solo quando
// un admin apre quella specifica rotta: un cliente normale che apre la home
// o il configuratore non scarica piu questo codice (prima finiva comunque nel
// bundle principale, perche importato staticamente qui in main.jsx).
const GpsMonitor = React.lazy(() => import("./pages/admin/GpsMonitor.jsx").then((m) => ({ default: m.GpsMonitor })));
const CampaignGroups = React.lazy(() => import("./pages/admin/CampaignGroups.jsx").then((m) => ({ default: m.CampaignGroups })));
const CampaignGroupDetail = React.lazy(() => import("./pages/admin/CampaignGroupDetail.jsx").then((m) => ({ default: m.CampaignGroupDetail })));
const CampaignOperations = React.lazy(() => import("./pages/admin/CampaignOperations.jsx").then((m) => ({ default: m.CampaignOperations })));
const CampaignReport = React.lazy(() => import("./pages/admin/CampaignReport.jsx").then((m) => ({ default: m.CampaignReport })));
const NewCampaign = React.lazy(() => import("./pages/admin/NewCampaign.jsx").then((m) => ({ default: m.NewCampaign })));
const ClientCampaignReport = React.lazy(() => import("./pages/customer/ClientCampaignReport.jsx").then((m) => ({ default: m.ClientCampaignReport })));
const FinancialDashboard = React.lazy(() => import("./pages/admin/FinancialDashboard.jsx").then((m) => ({ default: m.FinancialDashboard })));
const AutomationCenter = React.lazy(() => import("./pages/admin/AutomationCenter.jsx").then((m) => ({ default: m.AutomationCenter })));
const ClientiCRM = React.lazy(() => import("./pages/admin/ClientiCRM.jsx"));
const DocumentiDMS = React.lazy(() => import("./pages/admin/DocumentiDMS.jsx"));
const CentroConfigurazione = React.lazy(() => import("./pages/admin/CentroConfigurazione.jsx"));
const AnomalieAI = React.lazy(() => import("./pages/admin/AnomalieAI.jsx"));

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

function RouteFallback() {
  return <div style={{ minHeight: "100vh", background: "#0B1020" }} />;
}

function Root() {
  const path = window.location.pathname;
  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <TrackingPage campaignId={driverMatch[1]} />;

  const operatorMatch = path.match(/^\/operator(?:\/tracking)?\/([^/]+)$/);
  if (operatorMatch) return <TrackingPage campaignId={operatorMatch[1]} />;

  if (path === "/admin/campaigns/new" || path === "/admin/campaigns/new/") {
    return <AdminRouteGuard><NewCampaign /></AdminRouteGuard>;
  }

  const groupDetailMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/groups\/([^/]+)$/);
  if (groupDetailMatch) return <AdminRouteGuard><CampaignGroupDetail campaignId={groupDetailMatch[1]} groupId={groupDetailMatch[2]} /></AdminRouteGuard>;

  const groupsMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/groups$/);
  if (groupsMatch) return <AdminRouteGuard><CampaignGroups campaignId={groupsMatch[1]} /></AdminRouteGuard>;

  const opsMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/operations$/);
  if (opsMatch) return <AdminRouteGuard><CampaignOperations campaignId={opsMatch[1]} /></AdminRouteGuard>;

  const reportMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/report$/);
  if (reportMatch) return <AdminRouteGuard><CampaignReport campaignId={reportMatch[1]} /></AdminRouteGuard>;

  const adminMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/gps$/);
  if (adminMatch) return <AdminRouteGuard><GpsMonitor campaignId={adminMatch[1]} /></AdminRouteGuard>;

  if (path === "/admin/live" || path === "/admin/live/") {
    return <AdminRouteGuard><CampaignGroups campaignId="all" /></AdminRouteGuard>;
  }

  if (path === "/admin/finance" || path === "/admin/finance/" || path === "/admin/economics" || path === "/admin/economics/") {
    return <AdminRouteGuard><FinancialDashboard /></AdminRouteGuard>;
  }

  if (path === "/admin/automation" || path === "/admin/automation/") {
    return <AdminRouteGuard><AutomationCenter /></AdminRouteGuard>;
  }

  if (path === "/admin/crm" || path === "/admin/crm/" || path === "/admin/clienti" || path === "/admin/clienti/") {
    return <AdminRouteGuard><ClientiCRM /></AdminRouteGuard>;
  }

  if (path === "/admin/documenti" || path === "/admin/documenti/" || path === "/admin/dms" || path === "/admin/dms/") {
    return <AdminRouteGuard><DocumentiDMS /></AdminRouteGuard>;
  }

  if (path === "/admin/config" || path === "/admin/config/" || path === "/admin/configurazione" || path === "/admin/configurazione/") {
    return <AdminRouteGuard><CentroConfigurazione /></AdminRouteGuard>;
  }

  if (path === "/admin/anomalie" || path === "/admin/anomalie/" || path === "/admin/ai" || path === "/admin/ai/") {
    return <AdminRouteGuard><AnomalieAI /></AdminRouteGuard>;
  }

  const legacyClientReportMatch = path.match(/^\/client\/campaigns\/([^/]+)\/report$/);
  if (legacyClientReportMatch) return <ClientCampaignReport campaignId={legacyClientReportMatch[1]} />;

  const customerReportMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/report$/);
  if (customerReportMatch) return <ClientCampaignReport campaignId={customerReportMatch[1]} />;

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <CampaignTracking campaignId={customerMatch[1]} />;

  const clientReportMatch = path.match(/^\/client\/campaigns\/([^/]+)\/report$/);
  if (clientReportMatch) return <ClientCampaignReport campaignId={clientReportMatch[1]} />;

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<RouteFallback />}>
      <Root />
    </Suspense>
  </React.StrictMode>
);
