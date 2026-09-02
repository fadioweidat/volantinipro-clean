import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "../volantinipro-final.jsx";
import { CampaignTracking } from "./pages/customer/CampaignTracking.jsx";
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
const ClientsQuotes = React.lazy(() => import("./pages/admin/ClientsQuotes.jsx").then((m) => ({ default: m.ClientsQuotes })));
const SmartPairingWaitlist = React.lazy(() => import("./pages/admin/SmartPairingWaitlist.jsx").then((m) => ({ default: m.SmartPairingWaitlist })));
const DocumentiDMS = React.lazy(() => import("./pages/admin/DocumentiDMS.jsx"));
const CentroConfigurazione = React.lazy(() => import("./pages/admin/CentroConfigurazione.jsx"));
const AnomalieAI = React.lazy(() => import("./pages/admin/AnomalieAI.jsx"));
// ADMIN-DRIVER-LINK-1: nuovi moduli assegnazione
const CampaignAssignments = React.lazy(() => import("./pages/admin/CampaignAssignments.jsx").then((m) => ({ default: m.CampaignAssignments })));
const AssignWork = React.lazy(() => import("./pages/admin/AssignWork.jsx").then((m) => ({ default: m.AssignWork })));
const DriverAssignmentPage = React.lazy(() => import("./pages/driver/DriverAssignmentPage.jsx").then((m) => ({ default: m.DriverAssignmentPage })));

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

function RouteFallback() {
  return <div style={{ minHeight: "100vh", background: "#0B1020" }} />;
}

const AdvancedCoverageReport = React.lazy(() => import("./pages/customer/AdvancedCoverageReport.jsx").then((m) => ({ default: m.AdvancedCoverageReport })));
const QrRedirectPage = React.lazy(() => import("./pages/QrRedirectPage.jsx").then((m) => ({ default: m.QrRedirectPage })));

function Root() {
  const path = window.location.pathname;

  const qrMatch = path.match(/^\/q\/([^/]+)$/);
  if (qrMatch) return <QrRedirectPage slug={qrMatch[1]} />;

  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <TrackingPage campaignId={driverMatch[1]} />;

  const operatorMatch = path.match(/^\/operator(?:\/tracking)?\/([^/]+)$/);
  if (operatorMatch) return <TrackingPage campaignId={operatorMatch[1]} />;

  // ADMIN-DRIVER-LINK-1: link personale driver via assignment_id (no driver_id nell'URL)
  const driverAssignmentMatch = path.match(/^\/driver\/assignment\/([^/]+)$/);
  if (driverAssignmentMatch) return <DriverAssignmentPage assignmentId={driverAssignmentMatch[1]} />;

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

  // ADMIN-DRIVER-LINK-1: assegnazioni
  const assignmentsNewMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/assignments\/new$/);
  if (assignmentsNewMatch) return <AdminRouteGuard><AssignWork campaignId={assignmentsNewMatch[1]} /></AdminRouteGuard>;

  const assignmentsMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/assignments$/);
  if (assignmentsMatch) return <AdminRouteGuard><CampaignAssignments campaignId={assignmentsMatch[1]} /></AdminRouteGuard>;

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

  if (path === "/admin/clients-quotes" || path === "/admin/clients-quotes/") {
    return <AdminRouteGuard><ClientsQuotes /></AdminRouteGuard>;
  }

  if (path === "/admin/smart-pairing" || path === "/admin/smart-pairing/") {
    return <AdminRouteGuard><SmartPairingWaitlist /></AdminRouteGuard>;
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

  const coverageReportMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/coverage$/);
  if (coverageReportMatch) return <AdvancedCoverageReport campaignId={coverageReportMatch[1]} />;

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <CampaignTracking campaignId={customerMatch[1]} />;

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<RouteFallback />}>
      <Root />
    </Suspense>
  </React.StrictMode>
);
