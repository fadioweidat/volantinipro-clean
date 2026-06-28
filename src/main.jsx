import React from "react";
import { createRoot } from "react-dom/client";
import App from "../volantinipro-final.jsx";
import { GpsMonitor } from "./pages/admin/GpsMonitor.jsx";
import { CampaignGroups } from "./pages/admin/CampaignGroups.jsx";
import { CampaignGroupDetail } from "./pages/admin/CampaignGroupDetail.jsx";
import { CampaignOperations } from "./pages/admin/CampaignOperations.jsx";
import { CampaignReport } from "./pages/admin/CampaignReport.jsx";
import { CampaignTracking } from "./pages/customer/CampaignTracking.jsx";
import { TrackingPage } from "./pages/driver/TrackingPage.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

function Root() {
  const path = window.location.pathname;
  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <TrackingPage campaignId={driverMatch[1]} />;

  const groupDetailMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/groups\/([^/]+)$/);
  if (groupDetailMatch) return <CampaignGroupDetail campaignId={groupDetailMatch[1]} groupId={groupDetailMatch[2]} />;

  const groupsMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/groups$/);
  if (groupsMatch) return <CampaignGroups campaignId={groupsMatch[1]} />;

  const opsMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/operations$/);
  if (opsMatch) return <CampaignOperations campaignId={opsMatch[1]} />;

  const reportMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/report$/);
  if (reportMatch) return <CampaignReport campaignId={reportMatch[1]} />;

  const adminMatch = path.match(/^\/admin\/campaigns\/([^/]+)\/gps$/);
  if (adminMatch) return <GpsMonitor campaignId={adminMatch[1]} />;

  if (path === "/admin/live" || path === "/admin/live/") {
    return <CampaignGroups campaignId="all" />;
  }

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <CampaignTracking campaignId={customerMatch[1]} />;

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
