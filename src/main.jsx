import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/AppRouter.jsx";
import { CampaignTracking } from "./pages/customer/CampaignTracking.jsx";
import { TrackingPage } from "./pages/driver/TrackingPage.jsx";
import { DriverCoverageMap } from "./pages/driver/DriverCoverageMap.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

function Root() {
  const path = window.location.pathname;
  
  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <TrackingPage campaignId={driverMatch[1]} />;

  const driverMapMatch = path.match(/^\/driver\/tracking\/([^/]+)\/map$/);
  if (driverMapMatch) return <DriverCoverageMap campaignId={driverMapMatch[1]} />;

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <CampaignTracking campaignId={customerMatch[1]} />;

  return <AppRouter />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
