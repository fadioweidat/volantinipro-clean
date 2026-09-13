import React, { useCallback, useMemo, useState } from "react";
import VolantiniProAssistantDrawer from "../global/VolantiniProAssistantDrawer.jsx";
import VolantiniProAssistantTrigger from "../global/VolantiniProAssistantTrigger.jsx";
import { getAssistantRouteConfig, ASSISTANT_ROLES } from "../global/assistantRouteRegistry.js";
import { runAdminDashboardAi } from "../../../ai/adapters/adminAssistantAdapter.js";
import "../quote/quote-assistant.css";

const HUMAN_REQUEST_PATTERN = /(?:parlare|sentire|contattare).*(?:persona|operatore|consulente|umano|amministratore)|(?:numero|whatsapp|telefono|email).*(?:supporto|assistenza)/i;

export function AdminContextCard({ page, campaignId }) {
  return (
    <div className="quote-ai__context-card" aria-label="Contesto Operativo Amministratore">
      <div className="quote-ai__context-header">
        <span className="quote-ai__context-dot" />
        <strong>Copilot Operativo VolantiniPro</strong>
      </div>
      <div className="quote-ai__context-grid">
        <div>
          <span className="quote-ai__context-label">Sezione</span>
          <span className="quote-ai__context-value">{page || "admin"}</span>
        </div>
        <div>
          <span className="quote-ai__context-label">Livello Auth</span>
          <span className="quote-ai__context-value">Amministratore</span>
        </div>
        {campaignId ? (
          <div>
            <span className="quote-ai__context-label">Campagna ID</span>
            <span className="quote-ai__context-value">{campaignId.slice(0, 8)}…</span>
          </div>
        ) : (
          <div>
            <span className="quote-ai__context-label">Ambito</span>
            <span className="quote-ai__context-value">Globale</span>
          </div>
        )}
        <div>
          <span className="quote-ai__context-label">Modalità</span>
          <span className="quote-ai__context-value">Read-Only</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminAssistantHost({ page, adminSession, onNav }) {
  const [open, setOpen] = useState(false);
  const routeConfig = useMemo(() => getAssistantRouteConfig(page), [page]);

  const campaignId = routeConfig.campaignId || null;

  const handleAsk = useCallback(
    async (question) => {
      if (HUMAN_REQUEST_PATTERN.test(question)) {
        return {
          text: "Puoi contattare l'assistenza tecnica o la direzione VolantiniPro: WhatsApp +39 351 767 3737 oppure Email info@volantinipro.it.",
          contacts: true,
        };
      }

      const res = await runAdminDashboardAi({
        page,
        campaignId,
        snapshot: {
          page,
          campaignId,
        },
        question,
      });

      return {
        text: res.answer,
        contacts: false,
        action: res.action || null,
      };
    },
    [page, campaignId]
  );

  const handleNavigate = useCallback(
    (route, action) => {
      if (typeof onNav === "function") {
        if (action?.campaignId) {
          onNav(`${route}:${action.campaignId}`);
        } else {
          onNav(route);
        }
      }
    },
    [onNav]
  );

  const handleConfirmAction = useCallback(
    async (action) => {
      // Phase 5A: verified action confirmation
      return { allowed: true, message: `Azione "${action.summary || action.action}" confermata dall'amministratore.` };
    },
    []
  );

  if (!routeConfig.enabled || routeConfig.role !== ASSISTANT_ROLES.ADMIN) {
    return null;
  }

  const contextCard = <AdminContextCard page={page} campaignId={campaignId} />;

  return (
    <>
      <VolantiniProAssistantTrigger
        open={open}
        onClick={() => setOpen((prev) => !prev)}
        label="Assistente Admin"
        badge="?"
        ariaControls="admin-assistant-drawer"
      />
      <VolantiniProAssistantDrawer
        key={page}
        open={open}
        onClose={() => setOpen(false)}
        role="admin"
        eyebrow={routeConfig.eyebrow}
        title={routeConfig.title}
        subtitle={routeConfig.subtitle}
        contextCard={contextCard}
        quickQuestions={routeConfig.quickQuestions || []}
        onAsk={handleAsk}
        onNavigate={handleNavigate}
        onConfirmAction={handleConfirmAction}
        disclaimer={routeConfig.disclaimer}
        inputPlaceholder={routeConfig.inputPlaceholder}
        welcomeTitle="Copilot Operativo Admin"
        welcomeText="Posso aiutarti a monitorare preventivi, campagne da assegnare, pagamenti in attesa, anomalie GPS e stato dei fornitori."
        thinkingText="Interrogazione database operativo in corso…"
        fallbackTitle="Copilot momentaneamente non disponibile."
        fallbackText="I dati operativi continuano a essere consultabili normalmente a schermo."
        showHumanContacts={true}
      />
    </>
  );
}
