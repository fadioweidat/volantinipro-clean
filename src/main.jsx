import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/AppRouter.jsx";
import { RouteLoadingFallback } from "./layouts/public/RouteLoadingFallback.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";

// BUNDLE-OPTIMIZE-1: queste 4 route (Cliente tracking diretto + tutte le
// route Driver) sono mutuamente esclusive per costruzione (un solo branch
// puo' corrispondere a window.location.pathname) e non fanno mai parte del
// bootstrap pubblico (homepage/configuratore cadono nel default <AppRouter/>
// piu' sotto). Renderle lazy le rimuove dal chunk iniziale senza cambiare
// alcun comportamento: il match sul path resta sincrono, solo il download
// del componente diventa asincrono.
const CampaignTracking = lazy(() =>
  import("./pages/customer/CampaignTracking.jsx").then(m => ({ default: m.CampaignTracking }))
);
const TrackingPage = lazy(() =>
  import("./pages/driver/TrackingPage.jsx").then(m => ({ default: m.TrackingPage }))
);
const DriverCoverageMap = lazy(() =>
  import("./pages/driver/DriverCoverageMap.jsx").then(m => ({ default: m.DriverCoverageMap }))
);
const DriverAssignmentPage = lazy(() =>
  import("./pages/driver/DriverAssignmentPage.jsx").then(m => ({ default: m.DriverAssignmentPage }))
);

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

function Root() {
  const path = window.location.pathname;

  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <Suspense fallback={<RouteLoadingFallback />}><TrackingPage campaignId={driverMatch[1]} /></Suspense>;

  const driverMapMatch = path.match(/^\/driver\/tracking\/([^/]+)\/map$/);
  if (driverMapMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverCoverageMap campaignId={driverMapMatch[1]} /></Suspense>;

  // ADMIN-DRIVER-LINK-2: link personale driver via assignment_id (no driver_id nell'URL)
  const driverAssignmentMatch = path.match(/^\/driver\/assignment\/([^/]+)$/);
  if (driverAssignmentMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverAssignmentPage assignmentId={driverAssignmentMatch[1]} /></Suspense>;

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <Suspense fallback={<RouteLoadingFallback />}><CampaignTracking campaignId={customerMatch[1]} /></Suspense>;

  return <AppRouter />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
