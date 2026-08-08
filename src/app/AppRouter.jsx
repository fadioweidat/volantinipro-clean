import React, { useState, useEffect, Suspense, lazy } from "react";
import { PublicRoutes } from "./PublicRoutes.jsx";
import { Bootstrap } from "../layouts/public/Bootstrap.jsx";
import { SeoMeta } from "../layouts/public/SeoMeta.jsx";
import { Navbar } from "../layouts/public/Navbar.jsx";
import { StepperBar } from "../layouts/public/StepperBar.jsx";
import { RouteLoadingFallback } from "../layouts/public/RouteLoadingFallback.jsx";
import { F, C } from "../lib/constants.js";
import { CustomerGuard } from "../auth/guards/CustomerGuard.jsx";
import { AdminGuard } from "../auth/guards/AdminGuard.jsx";
import { hasSupabaseAuthHashError, hasSupabaseAuthHashToken, readPendingAuthContext } from "../auth/session.js";
import { resolveAppRoute } from "./routeResolution.js";
import { configuratorHistoryState, readConfiguratorDraft, readConfiguratorHistoryState, writeConfiguratorDraft } from "../lib/configuratorState.js";
export { resolveAppRoute } from "./routeResolution.js";

// BUNDLE-OPTIMIZE-1: nessuna di queste route serve al bootstrap pubblico
// (homepage/configuratore, gestiti da PublicRoutes qui sotto restano
// import statici, invariati). "volantinipro-final.jsx" e' un unico modulo
// legacy che esporta Login/Dashboard Cliente/Pagamento/wrapper Admin insieme
// — i 5 lazy() qui sotto puntano tutti allo stesso specifier, quindi Vite li
// raggruppa in un solo chunk condiviso, scaricato solo quando serve una di
// queste pagine (mai per homepage/configuratore).
const LoginPage = lazy(() => import("../../volantinipro-final.jsx").then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("../../volantinipro-final.jsx").then(m => ({ default: m.DashboardPage })));
const CampaignDashboardPage = lazy(() => import("../../volantinipro-final.jsx").then(m => ({ default: m.CampaignDashboardPage })));
const PagamentoBonificoPage = lazy(() => import("../../volantinipro-final.jsx").then(m => ({ default: m.PagamentoBonificoPage })));
const AdminDashboard = lazy(() => import("../../volantinipro-final.jsx").then(m => ({ default: m.AdminDashboard })));

const AdminLiveDashboard = lazy(() => import("../pages/admin/AdminLiveDashboard.jsx").then(m => ({ default: m.AdminLiveDashboard })));
const GpsMonitor = lazy(() => import("../pages/admin/GpsMonitor.jsx").then(m => ({ default: m.GpsMonitor })));
const CampaignOperations = lazy(() => import("../pages/admin/CampaignOperations.jsx").then(m => ({ default: m.CampaignOperations })));
const CampaignGroups = lazy(() => import("../pages/admin/CampaignGroups.jsx").then(m => ({ default: m.CampaignGroups })));
const CampaignReport = lazy(() => import("../pages/admin/CampaignReport.jsx").then(m => ({ default: m.CampaignReport })));
const AssignWork = lazy(() => import("../pages/admin/AssignWork.jsx").then(m => ({ default: m.AssignWork })));
const CampaignAssignments = lazy(() => import("../pages/admin/CampaignAssignments.jsx").then(m => ({ default: m.CampaignAssignments })));

const CampaignTracking = lazy(() => import("../pages/customer/CampaignTracking.jsx").then(m => ({ default: m.CampaignTracking })));
const ClientCampaignReport = lazy(() => import("../pages/customer/ClientCampaignReport.jsx").then(m => ({ default: m.ClientCampaignReport })));

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
    const handlePop = event => {
      const restored = readConfiguratorHistoryState(event.state);
      if (restored) setData(current => ({ ...current, ...restored }));
      setPage(routeToPage(window.location.pathname));
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const [data, setData] = useState(() => {
    let draft = {};
    const persistedDraft = typeof window !== "undefined" ? readConfiguratorDraft(window.localStorage) || {} : {};
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
      aiOptimizer: false, startDate: "", endDate: "",
      ...persistedDraft,
      ...draft,
      ...prefill.patch
    };
  });

  useEffect(() => {
    if (!isConfiguratorPagePath(window.location.pathname)) return;
    writeConfiguratorDraft(window.localStorage, data);
    window.history.replaceState(configuratorHistoryState(data), "", window.location.href);
  }, [data]);

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
        window.history.replaceState(configuratorHistoryState(data), "", window.location.href);
        window.history.pushState(configuratorHistoryState(s), "", `/configuratore?${params.toString()}`);
      } else if (p.startsWith("admin-gps:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/gps`);
      } else if (p.startsWith("admin-operations:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/operations`);
      } else if (p.startsWith("admin-groups:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/groups`);
      } else if (p.startsWith("admin-report:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/report`);
      } else if (p.startsWith("admin-assignments-new:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/assignments/new`);
      } else if (p.startsWith("admin-assignments:")) {
        window.history.pushState(null, "", `/admin/campaigns/${p.split(":")[1]}/assignments`);
      } else if (p.startsWith("customer-tracking:")) {
        window.history.pushState(null, "", `/customer/campaigns/${p.split(":")[1]}/tracking`);
      } else if (p.startsWith("customer-report:")) {
        window.history.pushState(null, "", `/customer/campaigns/${p.split(":")[1]}/report`);
      } else if (p.startsWith("customer-payment:")) {
        window.history.pushState(null, "", `/customer/campaigns/${p.split(":")[1]}/payment`);
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
        {page === "login" && (
          <Suspense fallback={<RouteLoadingFallback />}>
            <LoginPage onNav={goTo} context={loginContext} />
          </Suspense>
        )}

        {/* CUSTOMER ROUTES */}
        {page === "dashboard" && (
          <CustomerGuard onNav={goTo}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <DashboardPage onNav={goTo} />
            </Suspense>
          </CustomerGuard>
        )}
        {page.startsWith("campaign:") && (
          <CustomerGuard onNav={goTo}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <CampaignDashboardPage onNav={goTo} campaignId={page.split(":")[1]} />
            </Suspense>
          </CustomerGuard>
        )}
        {page.startsWith("customer-payment:") && (
          <CustomerGuard onNav={goTo}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <PagamentoBonificoPage onNav={goTo} campaignId={page.split(":")[1]} />
            </Suspense>
          </CustomerGuard>
        )}
        {page.startsWith("customer-tracking:") && (
          <CustomerGuard onNav={goTo}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <CampaignTracking campaignId={page.split(":")[1]} />
            </Suspense>
          </CustomerGuard>
        )}
        {page.startsWith("customer-report:") && (
          <CustomerGuard onNav={goTo}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <ClientCampaignReport campaignId={page.split(":")[1]} />
            </Suspense>
          </CustomerGuard>
        )}
        {page === "not-found" && <NotFoundPage />}

        {/* ADMIN ROUTES */}
        {page.startsWith("admin") && (
          <AdminGuard onNav={goTo}>
            {({ session }) => <Suspense fallback={<RouteLoadingFallback />}>
              {page === "admin" && <AdminDashboard onNav={goTo} adminSession={session} />}
              {page === "admin-live" && <AdminLiveDashboard onNav={goTo} />}
              {page.startsWith("admin-gps:") && <GpsMonitor campaignId={page.split(":")[1]} onNav={goTo} />}
              {page.startsWith("admin-operations:") && <CampaignOperations campaignId={page.split(":")[1]} onNav={goTo} />}
              {page.startsWith("admin-groups:") && <CampaignGroups campaignId={page.split(":")[1]} onNav={goTo} />}
              {page.startsWith("admin-report:") && <CampaignReport campaignId={page.split(":")[1]} onNav={goTo} />}
              {page.startsWith("admin-assignments-new:") && <AssignWork campaignId={page.split(":")[1]} />}
              {page.startsWith("admin-assignments:") && <CampaignAssignments campaignId={page.split(":")[1]} />}
            </Suspense>}
          </AdminGuard>
        )}

      </div>
    </div>
  );
}

function isConfiguratorPagePath(pathname) {
  return String(pathname || "").toLowerCase() === "/configuratore";
}

function NotFoundPage() {
  return <main style={{ minHeight: '70vh', padding: '140px 24px 80px', color: '#fff', textAlign: 'center' }}>
    <p style={{ color: '#e8571a', fontWeight: 900 }}>404</p>
    <h1>Pagina non trovata</h1>
    <p>La route richiesta non esiste.</p>
  </main>;
}
