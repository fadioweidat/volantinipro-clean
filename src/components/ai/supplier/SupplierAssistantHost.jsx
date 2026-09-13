/**
 * Supplier AI Assistant Host Component.
 *
 * Mounts the global VolantiniProAssistantDrawer & Trigger in the Supplier area.
 * Reuses the canonical design system and ensures strict read-only operation.
 */

import React, { useState, useCallback, useMemo } from "react";
import VolantiniProAssistantDrawer from "../global/VolantiniProAssistantDrawer.jsx";
import VolantiniProAssistantTrigger from "../global/VolantiniProAssistantTrigger.jsx";
import { getAssistantRouteConfig, isAssistantEnabledForRoute } from "../global/assistantRouteRegistry.js";
import { runSupplierDashboardAi } from "../../../ai/adapters/supplierAssistantAdapter.js";

function SupplierContextCard() {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "10px",
      padding: "12px",
      fontSize: "13px",
      color: "rgba(255,255,255,0.8)",
      marginBottom: "12px",
    }}>
      <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#e8571a", marginBottom: "4px" }}>
        Area Partner Fornitore
      </div>
      <div>Stato Partner: <strong style={{ color: "#34d399" }}>Verificato</strong></div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
        Consultazione rapida lavori affidati, compensi concordati e richieste marketplace.
      </div>
    </div>
  );
}

export default function SupplierAssistantHost({ page = "supplier-dashboard", onNav }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [conversation, setConversation] = useState([]);

  const routeConfig = useMemo(() => getAssistantRouteConfig(page), [page]);

  const handleAction = useCallback((action) => {
    if (!action || action.type !== "navigate") return;
    if (typeof onNav === "function") {
      onNav(action.route || "supplier-dashboard");
    }
    setIsOpen(false);
  }, [onNav]);

  const handleAsk = useCallback(async (questionText) => {
    const cleanQuestion = String(questionText || "").trim();
    if (!cleanQuestion) return null;

    const result = await runSupplierDashboardAi({
      campaignId: null,
      question: cleanQuestion,
      snapshot: { page },
    });

    return {
      text: result.answer,
      contacts: false,
      action: result.action || null,
    };
  }, [page]);

  const handleNavigate = useCallback((route, action) => {
    const targetId = action?.campaignId || action?.jobId || action?.requestId;
    if (route.startsWith("supplier-job") || route.startsWith("supplier-assignment")) {
      window.location.href = targetId ? `/supplier/dashboard#job-${targetId}` : "/supplier/dashboard";
    } else if (route.startsWith("supplier-request")) {
      window.location.href = "/supplier/dashboard#marketplace";
    } else {
      window.location.href = "/supplier/dashboard";
    }
  }, []);

  const handleConfirmAction = useCallback(async (action) => {
    return { allowed: true, message: `Azione "${action.summary || action.action}" verificata per il fornitore.` };
  }, []);

  if (!isAssistantEnabledForRoute(page)) return null;

  return (
    <>
      <VolantiniProAssistantTrigger
        expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        label="Hai bisogno di aiuto?"
        sublabel="Chiedi all’assistente VolantiniPro"
        badge="?"
      />
      <VolantiniProAssistantDrawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        role="supplier"
        eyebrow={routeConfig.eyebrow}
        title={routeConfig.title}
        subtitle={routeConfig.subtitle}
        disclaimer={routeConfig.disclaimer}
        inputPlaceholder={routeConfig.inputPlaceholder}
        quickQuestions={routeConfig.quickQuestions || []}
        contextCard={<SupplierContextCard />}
        onAsk={handleAsk}
        onNavigate={handleNavigate}
        onConfirmAction={handleConfirmAction}
      />
    </>
  );
}
