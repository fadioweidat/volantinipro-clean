import React, { useState, useEffect } from "react";
import {
  LoginPage, DashboardPage, CampaignDashboardPage, PagamentoBonificoPage, AdminDashboard
} from "../../volantinipro-final.jsx";
import { AdminLiveDashboard } from "../pages/admin/AdminLiveDashboard.jsx";
import { GpsMonitor } from "../pages/admin/GpsMonitor.jsx";
import { CampaignOperations } from "../pages/admin/CampaignOperations.jsx";
import { CampaignGroups } from "../pages/admin/CampaignGroups.jsx";
import { CampaignReport } from "../pages/admin/CampaignReport.jsx";
import { PublicRoutes } from "./PublicRoutes.jsx";
import { Bootstrap } from "../layouts/public/Bootstrap.jsx";
import { SeoMeta } from "../layouts/public/SeoMeta.jsx";
import { Navbar } from "../layouts/public/Navbar.jsx";
import { StepperBar } from "../layouts/public/StepperBar.jsx";
import { F, C } from "../lib/constants.js";
import { CustomerGuard } from "../auth/guards/CustomerGuard.jsx";
import { AdminGuard } from "../auth/guards/AdminGuard.jsx";
import { CampaignTracking } from "../pages/customer/CampaignTracking.jsx";
import { ClientCampaignReport } from "../pages/customer/ClientCampaignReport.jsx";
import { hasSupabaseAuthHashError, hasSupabaseAuthHashToken, readPendingAuthContext } from "../auth/session.js";

export function resolveAppRoute(path, { hasAuthHash = false, prefillHas = false, step = null } = {}) {
  const p = String(path || '/').toLowerCase();
  if (hasAuthHash) return 'login';
  if (p === '/admin' || p === '/admin/dashboard') return 'admin';
  if (p === '/admin/live') return 'admin-live';
  const adminRoute = p.match(/^\/admin\/campaigns\/([^/]+)\/(gps|operations|groups|report)$/);
  if (adminRoute) return `admin-${adminRoute[2]}:${adminRoute[1]}`;
  if (p.startsWith('/admin')) return 'admin';

  const customerCampaignRoute = p.match(/^\/customer\/campaigns\/([^/]+)\/(tracking|report|payment)$/);
  if (customerCampaignRoute) return `customer-${customerCampaignRoute[2]}:${customerCampaignRoute[1]}`;
  const dashboardCampaignRoute = p.match(/^\/dashboard\/([^/]+)$/);
  if (dashboardCampaignRoute) return `campaign:${dashboardCampaignRoute[1]}`;
  const dashboardPaymentRoute = p.match(/^\/dashboard\/([^/]+)\/payment$/);
  if (dashboardPaymentRoute) return `customer-payment:${dashboardPaymentRoute[1]}`;
  const legacyReportRoute = p.match(/^\/campagna\/([^/]+)\/report$/);
  if (legacyReportRoute) return `customer-report:${legacyReportRoute[1]}`;
  const legacyPaymentRoute = p.match(/^\/campagna\/([^/]+)\/pagamento$/);
  if (legacyPaymentRoute) return `customer-payment:${legacyPaymentRoute[1]}`;
  const legacyCampaignRoute = p.match(/^\/campagna\/([^/]+)$/);
  if (legacyCampaignRoute) return `campaign:${legacyCampaignRoute[1]}`;
  if (p.startsWith('/customer/') || p.startsWith('/dashboard/') || p.startsWith('/campagna/')) return 'not-found';

  if (p === '/' || p === '/index.html' || p === '/volantinipro-final.jsx') return 'home';
  if (p === '/login') return 'login';
  if (p === '/dashboard') return 'dashboard';
  if (p === '/privacy') return 'privacy';
  if (p === '/termini' || p === '/terms') return 'terms';
  if (p === '/cookie-policy' || p === '/cookie') return 'cookie';
  if (p === '/preventivo') return 'preventivo';
  if (p === '/preventivo-rapido') return 'quick';
  if (p === '/consulente') return 'consultant';
  if (p === '/configuratore' || prefillHas) return step ? `step${step}` : 'step1';
  return 'not-found';
}

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

    return resolveAppRoute(p, {
      hasAuthHash: hasSupabaseAuthHashError() || hasSupabaseAuthHashToken(),
      prefillHas: prefill.has,
      step,
    });
  };

  const [page, setPage] = useState(routeToPage(window.location.pathname));

  useEffect(() => {
    const handlePop = () => setPage(routeToPage(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const [data, setData] = useState(() => {
    let draft = {};
    if (typeof window !== "undefined" && localStorage.getItem("volantinipro_return_to") === "step4") {
      try {
        const raw = localStorage.getItem("volantinipro_pending_campaign_draft");
        if (raw) draft = JSON.parse(raw);
      } catch (e) {}
    }
    return {
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
      aiOptimizer: false, startDate: "", endDate: "", ...prefill.patch,
      ...draft
    };
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
      privacy: "/privacy", terms: "/termini", cookie: "/cookie-policy", quick: "/preventivo-rapido", preventivo: "/preventivo",
      consultant: "/consulente", step1: "/configuratore", step2: "/configuratore", step3: "/configuratore",
      step4: "/configuratore", admin: "/admin", "admin-live": "/admin/live"
    };
    if (typeof window !== "undefined") {
      const params = new URLSearchParams();
      if (p.startsWith("login?")) {
        window.history.pushState(null, "", "/" + p);
        p = "login";
      } else if (p === "login") {
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
      } else if (p.startsWith("admin-groups:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/groups`);
      } else if (p.startsWith("admin-report:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/report`);
      } else {
        window.history.pushState(null, "", paths[p] || "/");
      }
    }
    setPage(routeToPage(window.location.pathname));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isConfiguratorPage = page === "step1" || page === "step2" || page === "step3" || page === "step4";
  // ?context=admin nella query e' l'indicazione primaria (redirect_to
  // onorato). Se manca ma l'hash porta un errore O un token Supabase, il
  // tentativo potrebbe comunque venire da Admin: il fallback su SITE_URL non
  // porta la query originale, quindi si ricade sul context "ricordato" al
  // momento dell'invio del magic link (vedi rememberPendingAuthContext).
  const queryContext = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("context") : null;
  const pendingAuthContext = (hasSupabaseAuthHashError() || hasSupabaseAuthHashToken()) ? readPendingAuthContext() : null;
  const loginContext = queryContext === "admin"
    ? "admin"
    : queryContext === "customer"
      ? "customer"
      : queryContext === "driver"
        ? "driver"
        : pendingAuthContext === "admin"
          ? "admin"
          : pendingAuthContext === "driver"
            ? "driver"
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
        {page.startsWith("campaign:") && (
          <CustomerGuard onNav={goTo}>
            <CampaignDashboardPage onNav={goTo} campaignId={page.split(":")[1]} />
          </CustomerGuard>
        )}
        {page.startsWith("customer-payment:") && (
          <CustomerGuard onNav={goTo}>
            <PagamentoBonificoPage onNav={goTo} campaignId={page.split(":")[1]} />
          </CustomerGuard>
        )}
        {page.startsWith("customer-tracking:") && (
          <CustomerGuard onNav={goTo}>
            <CampaignTracking campaignId={page.split(":")[1]} />
          </CustomerGuard>
        )}
        {page.startsWith("customer-report:") && (
          <CustomerGuard onNav={goTo}>
            <ClientCampaignReport campaignId={page.split(":")[1]} />
          </CustomerGuard>
        )}
        {page === "not-found" && <NotFoundPage />}

        {/* ADMIN ROUTES */}
        {page.startsWith("admin") && (
          <AdminGuard onNav={goTo}>
            {page === "admin" && <AdminDashboard onNav={goTo} />}
            {page === "admin-live" && <AdminLiveDashboard onNav={goTo} />}
            {page.startsWith("admin-gps:") && <GpsMonitor campaignId={page.split(":")[1]} onNav={goTo} />}
            {page.startsWith("admin-operations:") && <CampaignOperations campaignId={page.split(":")[1]} onNav={goTo} />}
            {page.startsWith("admin-groups:") && <CampaignGroups campaignId={page.split(":")[1]} onNav={goTo} />}
            {page.startsWith("admin-report:") && <CampaignReport campaignId={page.split(":")[1]} onNav={goTo} />}
          </AdminGuard>
        )}

      </div>
    </div>
  );
}

function NotFoundPage() {
  return <main style={{ minHeight: '70vh', padding: '140px 24px 80px', color: '#fff', textAlign: 'center' }}>
    <p style={{ color: '#e8571a', fontWeight: 900 }}>404</p>
    <h1>Pagina non trovata</h1>
    <p>La route richiesta non esiste.</p>
  </main>;
}
