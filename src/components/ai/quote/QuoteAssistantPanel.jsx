import React, { useCallback, useMemo } from "react";
import VolantiniProAssistantDrawer, { AssistantContactLinks } from "../global/VolantiniProAssistantDrawer.jsx";
import { runQuoteAssistant } from "../../../ai/adapters/quoteAssistantAdapter.js";
import { buildInfoMailtoUrl, buildInfoWhatsAppUrl } from "../../../lib/contactConfig.js";
import "./quote-assistant.css";

export const HUMAN_REQUEST = /(?:parlare|sentire|contattare|scrivere).*(?:persona|operatore|consulente|umano)|(?:persona|operatore|consulente|umano).*(?:parlare|sentire|contattare|scrivere)/i;
export const ASSISTANT_WHATSAPP_URL = "https://wa.me/393517673737";

export function ContactLinks({ compact = false }) {
  const whatsappUrl = buildInfoWhatsAppUrl() || ASSISTANT_WHATSAPP_URL;
  return (
    <div className={`quote-ai__contacts${compact ? " quote-ai__contacts--compact" : ""}`}>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
        WhatsApp <span>+39 351 767 3737</span>
      </a>
      <a href={buildInfoMailtoUrl()}>
        Email <span>info@volantinipro.it</span>
      </a>
    </div>
  );
}

export function QuoteStep2ContextCard({ context }) {
  if (!context) return null;
  return (
    <div className="quote-ai__context-card" aria-label="Dati territoriali correnti">
      <div className="quote-ai__context-header">
        <span className="quote-ai__context-dot" />
        <strong>Dati che sto leggendo</strong>
      </div>
      <div className="quote-ai__context-grid">
        <div>
          <span className="quote-ai__context-label">Territorio</span>
          <span className="quote-ai__context-value">
            {context.location?.frazione
              ? `${context.location.frazione} — ${context.location.municipality || ""}`
              : (context.location?.municipality || context.territory?.selectedNames?.[0] || "Non selezionato")}
            {context.location?.province ? ` (${context.location.province})` : ""}
          </span>
        </div>
        <div>
          <span className="quote-ai__context-label">Modalità</span>
          <span className="quote-ai__context-value">
            {context.territory?.modeLabel || (context.territory?.mode === "radius" || context.territory?.mode === "raggio" ? "Raggio" : context.territory?.mode === "nil" ? "NIL" : "Comune")}
            {context.territory?.radiusKm ? ` (${context.territory.radiusKm} km)` : ""}
          </span>
        </div>
        <div>
          <span className="quote-ai__context-label">Quantità</span>
          <span className="quote-ai__context-value">
            {context.quantitaInserita || context.quantity?.current
              ? `${Number(context.quantitaInserita || context.quantity?.current).toLocaleString("it-IT")} volantini`
              : "Non inserita"}
          </span>
        </div>
        <div>
          <span className="quote-ai__context-label">Copertura</span>
          <span className="quote-ai__context-value">
            {context.territorialDataUnavailable
              ? "Dato non disponibile"
              : (context.coveragePct != null
                ? `${Number(context.coveragePct).toLocaleString("it-IT")}%`
                : (context.kpis?.residentialCoveragePct != null
                  ? `${Number(context.kpis.residentialCoveragePct).toLocaleString("it-IT")}%`
                  : "In calcolo…"))}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * QuoteAssistantPanel — Specialized adapter connecting configurator steps 1-4
 * to the generic VolantiniProAssistantDrawer.
 */
export default function QuoteAssistantPanel({ open, onClose, page, context, quickQuestions = [] }) {
  const step = Number(String(page || "").replace("step", "")) || null;

  const handleAsk = useCallback(
    async (question) => {
      if (HUMAN_REQUEST.test(question)) {
        return { text: "Certo. Puoi parlare subito con il team VolantiniPro:", contacts: true };
      }
      if (!context || !step) {
        throw new Error("ASSISTANT_UNAVAILABLE");
      }
      const response = await runQuoteAssistant({ contextType: `step${step}`, snapshot: context, question });
      return { text: response.answer, contacts: false };
    },
    [context, step]
  );

  const contextCard = useMemo(() => {
    return step === 2 && context ? <QuoteStep2ContextCard context={context} /> : null;
  }, [step, context]);

  return (
    <VolantiniProAssistantDrawer
      key={page}
      open={open}
      onClose={onClose}
      role="guest"
      eyebrow={`Preventivo · Step ${step}`}
      title="Assistente VolantiniPro"
      subtitle="Risposte brevi basate sui dati reali di questo Step."
      contextCard={contextCard}
      quickQuestions={quickQuestions}
      onAsk={handleAsk}
      disclaimer="Solo dati del preventivo. Nessuna modifica automatica."
      inputPlaceholder="Scrivi una domanda sul preventivo"
      welcomeTitle="Come posso aiutarti?"
      welcomeText="Conosco le scelte e i valori mostrati qui, ma non posso modificare il preventivo."
      thinkingText="Sto leggendo i dati dello Step…"
      fallbackTitle="Assistente momentaneamente non disponibile."
      fallbackText="Il preventivo continua a funzionare normalmente."
      showHumanContacts={true}
    />
  );
}
