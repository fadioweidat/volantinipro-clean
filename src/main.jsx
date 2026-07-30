import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/AppRouter.jsx";
import { GpsMonitor } from "./pages/admin/GpsMonitor.jsx";
import { AdminLiveDashboard } from "./pages/admin/AdminLiveDashboard.jsx";
import { CampaignOperations } from "./pages/admin/CampaignOperations.jsx";
import { CampaignTracking } from "./pages/customer/CampaignTracking.jsx";
import { TrackingPage } from "./pages/driver/TrackingPage.jsx";
import { AdminGuard } from "./auth/guards/AdminGuard.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

// Queste due route standalone (fuori da AppRouter/AppRouter.jsx) sono le uniche
// in questo file protette da AdminGuard: non hanno uno stato di pagina SPA a
// cui tornare, quindi il redirect verso il login e' una navigazione reale.
function goToAdminLogin() {
  window.location.href = "/login?context=admin";
}

function Root() {
  const path = window.location.pathname;
  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <TrackingPage campaignId={driverMatch[1]} />;

  const adminMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/gps$/);
  if (adminMatch) return <GpsMonitor campaignId={adminMatch[1]} />;

  if (path === "/admin/live") {
    return (
      <AdminGuard onNav={goToAdminLogin}>
        <AdminLiveDashboard />
      </AdminGuard>
    );
  }

  const adminOperationsMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/operations$/);
  if (adminOperationsMatch) {
    return (
      <AdminGuard onNav={goToAdminLogin}>
        <CampaignOperations campaignId={adminOperationsMatch[1]} />
      </AdminGuard>
    );
  }

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <CampaignTracking campaignId={customerMatch[1]} />;

  return <AppRouter />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
