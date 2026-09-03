import React, { lazy, Suspense } from "react";
import { RouteLoadingFallback } from "../layouts/public/RouteLoadingFallback.jsx";
import InlineHelpCta from "../components/common/InlineHelpCta.jsx";

// PERF-1: questi erano import statici (commento originale: "restano import
// statici, invariati" — riferito al fatto che homepage/configuratore non
// dovevano essere toccati mentre si rendevano lazy le route Driver/Cliente).
// Da allora pero' e' emerso via network trace reale che /admin passa SEMPRE
// da AppRouter -> PublicRoutes, quindi pagava comunque il download
// dell'intero configuratore (Step1..Step4 + QuickQuote/Consultant/Service)
// anche se un Admin non lo vede mai. Resi lazy: nessuna riga di logica di
// Step1-4 e' stata toccata, solo il momento del download.
const HomePage = lazy(() => import("../pages/public/HomePage.jsx").then(m => ({ default: m.HomePage })));
const LegalPage = lazy(() => import("../pages/public/LegalPage.jsx").then(m => ({ default: m.LegalPage })));
const Step1 = lazy(() => import("../pages/public/configurator/Step1.jsx").then(m => ({ default: m.Step1 })));
const Step2 = lazy(() => import("../pages/public/configurator/Step2.jsx").then(m => ({ default: m.Step2 })));
const Step3 = lazy(() => import("../pages/public/configurator/Step3.jsx").then(m => ({ default: m.Step3 })));
const Step4 = lazy(() => import("../pages/public/configurator/Step4.jsx").then(m => ({ default: m.Step4 })));
const QuickQuotePage = lazy(() => import("../pages/public/QuickQuotePage.jsx"));
const ConsultantPage = lazy(() => import("../pages/public/ConsultantPage.jsx"));
const ServiceCenter = lazy(() => import("../pages/public/ServiceCenter.jsx"));

// L'Assistente e il Report AI di Step2 richiedono un utente Supabase
// autenticato reale: le Edge Function (ai-assistant-territory,
// analyze-territory-summary) verificano il JWT server-side e rispondono 401
// senza. Non passiamo mai un'identita' "anonymous" costruita qui: quella
// stringa (`visitor:${contextId}`) non porta un JWT reale, quindi farebbe
// solo sembrare l'AI disponibile per poi fallire alla prima richiesta.
// Non passando `aiIdentity`, TerritorialAiAssistantPanel risolve da solo la
// sessione reale (stessa fonte di AdminGuard/CustomerGuard): utente loggato
// -> identita' reale abilitata; nessuna sessione valida -> resta disabilitata
// (l'utente vede "Accedi per usare l'Assistente AI", non un errore tecnico).

export function PublicRoutes({ page, data, setData, goTo, prefillPatch }) {
  const content = (() => {
    if (page === "home") return <HomePage onStart={goTo} />;
    if (page === "privacy") return <LegalPage type="privacy" onNav={goTo} />;
    if (page === "terms") return <LegalPage type="terms" onNav={goTo} />;
    if (page === "cookie") return <LegalPage type="cookie" onNav={goTo} />;
    if (page === "quick") return <QuickQuotePage onStart={goTo} onContact={goTo} />;
    if (page === "consultant") return <ConsultantPage onStart={goTo} />;
    if (page === "preventivo") return <ServiceCenter onNav={goTo} />;

    if (page === "step1") return <Step1 data={data} setData={setData} onNext={() => goTo("step2")} />;
    if (page === "step2") return <Step2 data={data} setData={setData} onNext={() => goTo("step3")} onBack={() => goTo("step1")} />;
    if (page === "step3") return <Step3 data={data} setData={setData} onNext={() => goTo("step4")} onBack={() => goTo("step2")} />;
    if (page === "step4") return <Step4 data={data} setData={setData} onNav={goTo} onBack={() => goTo("step3")} />;

    return null;
  })();

  if (!content) return null;
  // Richiamo di aiuto compatto SOLO nel configuratore (Step 1-4). Non tocca la
  // logica degli Step: overlay fisso, richiudibile. "Chiedi all'AI" porta allo
  // Step 2 (assistente territoriale).
  const isConfiguratorStep = page === "step1" || page === "step2" || page === "step3" || page === "step4";
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {content}
      {isConfiguratorStep && <InlineHelpCta onAsk={() => goTo("step2")} />}
    </Suspense>
  );
}
