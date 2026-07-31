import React, { useState, useEffect } from "react";
import {
  LoginPage, DashboardPage, CampaignDashboardPage, PagamentoBonificoPage, AdminDashboard
} from "../../volantinipro-final.jsx";
import { AdminLiveDashboard } from "../pages/admin/AdminLiveDashboard.jsx";
import { GpsMonitor } from "../pages/admin/GpsMonitor.jsx";
import { CampaignOperations } from "../pages/admin/CampaignOperations.jsx";
import { PublicRoutes } from "./PublicRoutes.jsx";
import { Bootstrap } from "../layouts/public/Bootstrap.jsx";
import { SeoMeta } from "../layouts/public/SeoMeta.jsx";
import { Navbar } from "../layouts/public/Navbar.jsx";
import { StepperBar } from "../layouts/public/StepperBar.jsx";
import { F, C } from "../lib/constants.js";
import { CustomerGuard } from "../auth/guards/CustomerGuard.jsx";
import { AdminGuard } from "../auth/guards/AdminGuard.jsx";

export function AppRouter() {
  const readPrefill = () => {
    if (typeof window === "undefined") return { has: false, patch: {} };
    const p = new URLSearchParams(window.location.search);
    const service = p.get("service");
    const comune = p.get("comune") || "";
    const qty = Number(p.get("qty") || 0);
    const printed = p.get("printed");
    const format = p.get("format");
    const urgency = p.get("urgency");
    const startDate = p.get("startDate") || "";
    const endDate = p.get("endDate") || "";
    const serviceOk = ["d2d", "h2h", "b2b"].includes(service || "");
    const has = serviceOk || Boolean(comune) || qty > 0;
    return {
      has, patch: {
        ...(serviceOk ? { type: service, selectedService: service, activeService: service } : {}),
        ...(qty > 0 ? { qty, flyerQuantity: qty, flyerQuantityFromStep1: qty } : {}),
        ...(comune ? { cityName: comune, searchedLocation: comune } : {}),
        ...(printed ? { hasFlyers: printed === "true" ? "yes" : "no", alreadyPrinted: printed === "true" } : {}),
        ...(format ? { flyerFormat: format.toLowerCase() } : {}),
        ...(urgency ? { urgency: urgency === "urgent" ? "urgent" : "normal" } : {}),
        ...(startDate ? { startDate, campaignPeriodStart: startDate } : {}),
        ...(endDate ? { endDate, campaignPeriodEnd: endDate } : {}),
        quickSource: p.get("source") || ""
      }
    };
  };

  const prefill = readPrefill();
  
  const routeToPage = path => {
    const p = path.toLowerCase();
    const url = new URL(window.location.href);
    const step = url.searchParams.get("step");

    if (p === "/" || p === "/index.html" || p === "/volantinipro-final.jsx") return "home";
    if (p.includes("login")) return "login";
    if (p.includes("dashboard")) return "dashboard";
    if (p.includes("pagamento")) return "payment";
    if (p.includes("campagna")) return "campaign";
    if (p.includes("privacy")) return "privacy";
    if (p.includes("termini") || p.includes("terms")) return "terms";
    if (p.includes("cookie-policy") || p.includes("cookie")) return "cookie";
    if (p.includes("preventivo-rapido")) return "quick";
    if (p.includes("consulente")) return "consultant";
    if (p.includes("configuratore") || prefill.has) {
      if (step) return `step${step}`;
      return "step1";
    }
    if (p === "/admin/live") return "admin-live";
    const adminGpsMatch = p.match(/^\/admin\/campaigns\/([^/]+)\/gps$/);
    if (adminGpsMatch) return `admin-gps:${adminGpsMatch[1]}`;
    const adminOpsMatch = p.match(/^\/admin\/campaigns\/([^/]+)\/operations$/);
    if (adminOpsMatch) return `admin-operations:${adminOpsMatch[1]}`;
    if (p.includes("admin")) return "admin";
    return "home";
  };

  const [page, setPage] = useState(routeToPage(window.location.pathname));

  useEffect(() => {
    const handlePop = () => setPage(routeToPage(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const [data, setData] = useState({
    type: null, activityType: "", activityNote: "", qty: 10000,
    hasFlyers: "no", flyerFormat: "a5", flyerWeight: "115", extraServices: [], printGramm: "115", printSide: "fronte", printColor: "cmyk",
    urgency: "normal", subscription: "single", campaignsPerMonth: 1,
    selectedService: null, activeService: null, businessSector: "", flyerQuantity: 10000,
    campaignPeriodStart: "", campaignPeriodEnd: "", alreadyPrinted: false,
    printServices: [], paperWeight: "115", printSides: "fronte", colorMode: "cmyk",
    campaignPlan: "single", totalCampaigns: 1, planDiscount: 0,
    redistExtra: null, zoneMode: "auto", zoneCountIntent: "single",
    city: null, cityName: "", radius: 3, selectedRadius: 3, searchedLocation: "", zones: [], selectedZones: [], selectedComuni: [],
    layerValues: {}, adminInfoSummary: null, serviceKpis: null, requiredFlyers: 0,
    flyerQuantityFromStep1: 10000, missingFlyers: 0, coverageStatus: "empty", recommendations: [],
    days: [], avgDiscount: 0, selectedDates: [], selectedMonth: null, selectedDaysCount: 0,
    pairingDays: [], normalDays: [], requestOnlyDays: [], pairingType: {}, pairingDiscountPercent: {},
    averagePairingDiscount: 0, maxPairingDiscount: 0, calendarStatus: "empty",
    smartPairingStatus: "none", smartPairingRequestSent: false,
    requiresManualConfirmation: false, contactRequestData: null,
    aiOptimizer: false, startDate: "", endDate: "", ...prefill.patch
  });

  const goTo = (p, prefillPatch = null) => {
    if (prefillPatch) {
      const service = prefillPatch.service;
      const qty = Number(prefillPatch.qty || 0);
      const comune = prefillPatch.comune || "";
      const printed = prefillPatch.printed;
      const format = prefillPatch.format;
      const urgency = prefillPatch.urgency;
      setData(d => ({
        ...d,
        ...(service ? { type: service, selectedService: service, activeService: service } : {}),
        ...(qty > 0 ? { qty, flyerQuantity: qty, flyerQuantityFromStep1: qty } : {}),
        ...(comune ? { cityName: comune, searchedLocation: comune } : {}),
        ...(printed ? { hasFlyers: printed === "true" ? "yes" : "no", alreadyPrinted: printed === "true" } : {}),
        ...(format ? { flyerFormat: format.toLowerCase() } : {}),
        ...(urgency ? { urgency: urgency === "urgent" ? "urgent" : "normal" } : {}),
        quickSource: prefillPatch.source || d.quickSource || ""
      }));
    }
    const paths = {
      home: "/", login: "/login", dashboard: "/dashboard",
      campaign: prefillPatch?.campaignId ? `/campagna/${prefillPatch.campaignId}${prefillPatch?.new ? "?nuovo=true" : ""}` : "/dashboard",
      payment: prefillPatch?.campaignId ? `/campagna/${prefillPatch.campaignId}/pagamento` : "/dashboard",
      privacy: "/privacy", terms: "/termini", cookie: "/cookie-policy", quick: "/preventivo-rapido",
      consultant: "/consulente", step1: "/configuratore", step2: "/configuratore", step3: "/configuratore",
      step4: "/configuratore", admin: "/admin", "admin-live": "/admin/live"
    };
    if (typeof window !== "undefined") {
      const params = new URLSearchParams();
      if (p === "login") {
        const ctx = prefillPatch?.context === "admin" ? "?context=admin" : "";
        window.history.pushState(null, "", `/login${ctx}`);
      } else if (p.startsWith("step")) {
        const s = prefillPatch || data;
        if (s.type || s.service) params.set("service", s.type || s.service);
        if (s.cityName || s.comune) params.set("comune", s.cityName || s.comune);
        if (s.qty) params.set("qty", String(s.qty));
        if (s.hasFlyers || s.printed) params.set("printed", s.hasFlyers === "yes" || s.printed === "true" ? "true" : "false");
        if (s.flyerFormat || s.format) params.set("format", (s.flyerFormat || s.format).toUpperCase());
        if (s.urgency) params.set("urgency", s.urgency);
        if (s.startDate) params.set("startDate", s.startDate);
        if (s.endDate) params.set("endDate", s.endDate);
        if (s.source || s.quickSource) params.set("source", s.source || s.quickSource);
        params.set("step", p.replace("step", ""));
        window.history.pushState(null, "", `/configuratore?${params.toString()}`);
      } else if (p.startsWith("admin-gps:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/gps`);
      } else if (p.startsWith("admin-operations:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/operations`);
      } else {
        window.history.pushState(null, "", paths[p] || "/");
      }
    }
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isConfiguratorPage = page === "step1" || page === "step2" || page === "step3" || page === "step4";
  const loginContext = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("context") === "admin"
    ? "admin"
    : "customer";

  return (
    <div style={{ fontFamily: F.sans, minHeight: "100vh", background: C.navyMid }}>
      <Bootstrap />
      <SeoMeta page={page} />
      {!isConfiguratorPage && page !== "home" && <Navbar onNav={goTo} page={page} />}
      <div style={{ paddingTop: 0 }}>

        {/* PUBLIC ROUTES */}
        {isConfiguratorPage && <StepperBar current={page} onGo={goTo} />}
        <PublicRoutes page={page} data={data} setData={setData} goTo={goTo} prefillPatch={prefill.patch} />

        {/* AUTH */}
        {page === "login" && <LoginPage onNav={goTo} context={loginContext} />}

        {/* CUSTOMER ROUTES */}
        {page === "dashboard" && (
          <CustomerGuard onNav={goTo}>
            <DashboardPage onNav={goTo} />
          </CustomerGuard>
        )}
        {page === "campaign" && (
          <CustomerGuard onNav={goTo}>
            <CampaignDashboardPage onNav={goTo} campaignId={window.location.pathname.split("/").filter(Boolean).pop() || null} />
          </CustomerGuard>
        )}
        {page === "payment" && (
          <CustomerGuard onNav={goTo}>
            <PagamentoBonificoPage onNav={goTo} campaignId={window.location.pathname.split("/").filter(Boolean)[1] || null} />
          </CustomerGuard>
        )}

        {/* ADMIN ROUTES */}
        {page.startsWith("admin") && (
          <AdminGuard onNav={goTo}>
            {page === "admin" && <AdminDashboard onNav={goTo} />}
            {page === "admin-live" && <AdminLiveDashboard onNav={goTo} />}
            {page.startsWith("admin-gps:") && <GpsMonitor campaignId={page.split(":")[1]} onNav={goTo} />}
            {page.startsWith("admin-operations:") && <CampaignOperations campaignId={page.split(":")[1]} onNav={goTo} />}
          </AdminGuard>
        )}

      </div>
    </div>
  );
}
