/**
 * Driver AI Assistant Host Component.
 *
 * Mounts the global VolantiniProAssistantDrawer & Trigger in the Driver area.
 * Reuses the canonical design system and ensures strict read-only operation.
 */

import React, { useState, useCallback, useMemo } from "react";
import VolantiniProAssistantDrawer from "../global/VolantiniProAssistantDrawer.jsx";
import VolantiniProAssistantTrigger from "../global/VolantiniProAssistantTrigger.jsx";
import { getAssistantRouteConfig, isAssistantEnabledForRoute } from "../global/assistantRouteRegistry.js";
import { runDriverAssignmentAi } from "../../../ai/adapters/driverAssistantAdapter.js";
import { navigateDriver, driverPathWithQuery } from "../../../pages/driver/driverNav.js";

function readTokenFromUrl() {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("access") || null;
  } catch {
    return null;
  }
}

function DriverContextCard({ assignmentId }) {
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
        Incarico Operatore Attivo
      </div>
      <div>ID Incarico: <code style={{ color: "#fff", background: "rgba(255,255,255,0.08)", padding: "2px 4px", borderRadius: "4px" }}>{assignmentId ? assignmentId.slice(0, 8) + "…" : "—"}</code></div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>
        Consultazione rapida zone, quantitativi e stato GPS.
      </div>
    </div>
  );
}

export default function DriverAssistantHost({ assignmentId, page = "driver-assignment" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [conversation, setConversation] = useState([]);

  const accessToken = useMemo(() => readTokenFromUrl(), []);
  const routeConfig = useMemo(() => getAssistantRouteConfig(page), [page]);

  const handleAction = useCallback((action) => {
    if (!action || action.type !== "navigate") return;
    if (action.route === "driver-map") {
      const zoneParam = action.targetZoneId ? `?zoneId=${encodeURIComponent(action.targetZoneId)}` : "";
      navigateDriver(driverPathWithQuery(`/driver/assignment/${assignmentId}/map${zoneParam}`));
      setIsOpen(false);
      return;
    }
    if (action.route === "driver-assignment") {
      navigateDriver(driverPathWithQuery(`/driver/assignment/${assignmentId}`));
      setIsOpen(false);
      return;
    }
    if (action.route === "driver-pod") {
      setIsOpen(false);
      const podEl = document.getElementById("pod-capture-section") || document.querySelector("[data-pod-capture]");
      if (podEl) {
        podEl.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }
  }, [assignmentId]);

  const handleAsk = useCallback(async (questionText) => {
    const cleanQuestion = String(questionText || "").trim();
    if (!cleanQuestion || isThinking) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: cleanQuestion,
      timestamp: new Date().toISOString(),
    };

    setConversation((prev) => [...prev, userMessage]);
    setIsThinking(true);

    try {
      const result = await runDriverAssignmentAi({
        assignmentId,
        accessToken,
        question: cleanQuestion,
        snapshot: { page, assignmentId },
      });

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: result.answer,
        summary: result.summary || "",
        priorities: result.priorities || [],
        warnings: result.warnings || [],
        sources: result.sources || [],
        action: result.action || null,
        status: result.status || "ai",
        timestamp: new Date().toISOString(),
      };

      setConversation((prev) => [...prev, assistantMessage]);
    } catch {
      setConversation((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: "assistant",
          text: "Si è verificato un errore imprevisto. Riprova più tardi.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [assignmentId, accessToken, page, isThinking]);

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
        eyebrow={routeConfig.eyebrow}
        title={routeConfig.title}
        subtitle={routeConfig.subtitle}
        disclaimer={routeConfig.disclaimer}
        inputPlaceholder={routeConfig.inputPlaceholder}
        quickQuestions={routeConfig.quickQuestions || []}
        conversation={conversation}
        isThinking={isThinking}
        contextCard={<DriverContextCard assignmentId={assignmentId} />}
        onAsk={handleAsk}
        onAction={handleAction}
      />
    </>
  );
}
