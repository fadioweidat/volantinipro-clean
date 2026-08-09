import React from "react";
import { HomePage } from "../pages/public/HomePage.jsx";
import { LegalPage } from "../pages/public/LegalPage.jsx";
import { Step1 } from "../pages/public/configurator/Step1.jsx";
import { Step2 } from "../pages/public/configurator/Step2.jsx";
import { Step3 } from "../pages/public/configurator/Step3.jsx";
import { Step4 } from "../pages/public/configurator/Step4.jsx";
import QuickQuotePage from "../pages/public/QuickQuotePage.jsx";
import ConsultantPage from "../pages/public/ConsultantPage.jsx";
import ServiceCenter from "../pages/public/ServiceCenter.jsx";
import { getStoredSupabaseSession, isStoredSupabaseSessionExpired } from "../lib/supabaseClient.js";

// Identita' AI territoriale per Step2: stessa fonte reale (localStorage
// vp_supabase_session) gia' usata da AdminGuard/CustomerGuard e dalla
// risoluzione automatica interna di TerritorialAiAssistantPanel. Se una
// sessione valida esiste, si lascia `aiIdentity` a null: il pannello la
// risolve gia' da solo (utente autenticato reale via getCurrentSupabaseUser).
// Se NON esiste, il pannello la classificherebbe come "signed_out" (bloccato)
// invece che "anonymous" (consentito) perche' nessuna delle due situazioni
// e' distinguibile dall'interno senza che qualcuno gliela dichiari: qui
// passiamo esplicitamente lo stato anonimo, l'unico dato mancante.
function resolveStep2AiIdentity() {
  const session = getStoredSupabaseSession();
  const hasValidSession = Boolean(session && !isStoredSupabaseSessionExpired(session));
  return hasValidSession ? null : { status: "anonymous" };
}

export function PublicRoutes({ page, data, setData, goTo, prefillPatch }) {
  if (page === "home") return <HomePage onStart={goTo} />;
  if (page === "privacy") return <LegalPage type="privacy" onNav={goTo} />;
  if (page === "terms") return <LegalPage type="terms" onNav={goTo} />;
  if (page === "cookie") return <LegalPage type="cookie" onNav={goTo} />;
  if (page === "quick") return <QuickQuotePage onStart={goTo} onContact={goTo} />;
  if (page === "consultant") return <ConsultantPage onStart={goTo} />;
  if (page === "preventivo") return <ServiceCenter onNav={goTo} />;
  
  if (page === "step1") return <Step1 data={data} setData={setData} onNext={() => goTo("step2")} />;
  if (page === "step2") return <Step2 data={data} setData={setData} onNext={() => goTo("step3")} onBack={() => goTo("step1")} aiIdentity={resolveStep2AiIdentity()} />;
  if (page === "step3") return <Step3 data={data} setData={setData} onNext={() => goTo("step4")} onBack={() => goTo("step2")} />;
  if (page === "step4") return <Step4 data={data} setData={setData} onNav={goTo} onBack={() => goTo("step3")} />;
  
  return null;
}
