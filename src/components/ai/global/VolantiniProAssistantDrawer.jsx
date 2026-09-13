import React, { useEffect, useRef, useState } from "react";
import { buildInfoMailtoUrl, buildInfoWhatsAppUrl } from "../../../lib/contactConfig.js";
import "../quote/quote-assistant.css";

const ASSISTANT_WHATSAPP_URL = "https://wa.me/393517673737";

export function AssistantContactLinks({ compact = false }) {
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

/**
 * VolantiniProAssistantDrawer — Reusable global floating assistant shell.
 *
 * Implements the slide-over drawer UI, focus trapping, Escape dismiss,
 * mobile bottom-sheet behavior, suggested questions, conversation history,
 * thinking states, and human contact fallbacks.
 */
export default function VolantiniProAssistantDrawer({
  open = false,
  onClose,
  role = "guest",
  eyebrow = null,
  title = "Assistente VolantiniPro",
  subtitle = "Risposte brevi basate sui dati reali di questo Step.",
  contextCard = null,
  quickQuestions = [],
  onAsk,
  disclaimer = "Solo dati del preventivo. Nessuna modifica automatica.",
  inputPlaceholder = "Scrivi una domanda sul preventivo",
  welcomeTitle = "Come posso aiutarti?",
  welcomeText = "Conosco le scelte e i valori mostrati qui, ma non posso modificare il preventivo.",
  thinkingText = "Sto leggendo i dati dello Step…",
  fallbackTitle = "Assistente momentaneamente non disponibile.",
  fallbackText = "Il preventivo continua a funzionare normalmente.",
  showHumanContacts = true,
  children = null,
}) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const inputRef = useRef(null);

  // Focus management and escape listener
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 760px)").matches) {
      document.body.style.overflow = "hidden";
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  async function submit(raw = message) {
    const question = String(raw || "").trim();
    if (!question || sending) return;

    setHistory((items) => [...items, { role: "user", text: question }]);
    setMessage("");
    setUnavailable(false);

    if (!onAsk) {
      setUnavailable(true);
      return;
    }

    setSending(true);
    try {
      const response = await onAsk(question);
      if (response && response.text) {
        setHistory((items) => [
          ...items,
          { role: "assistant", text: response.text, contacts: Boolean(response.contacts) },
        ]);
      } else if (typeof response === "string") {
        setHistory((items) => [...items, { role: "assistant", text: response, contacts: false }]);
      } else {
        setUnavailable(true);
      }
    } catch (error) {
      console.error("[assistant-drawer]", error instanceof Error ? error.message : "ASSISTANT_UNAVAILABLE");
      setUnavailable(true);
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button className="quote-ai__backdrop" type="button" aria-label="Chiudi assistente" onClick={onClose} />
      <aside
        id="quote-ai-panel"
        className="quote-ai"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-ai-title"
        data-role={role}
      >
        <header className="quote-ai__header">
          <div>
            {eyebrow && <span className="quote-ai__step">{eyebrow}</span>}
            <h2 id="quote-ai-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="quote-ai__close" type="button" onClick={onClose} aria-label="Chiudi assistente">
            ×
          </button>
        </header>

        <div className="quote-ai__body">
          {contextCard}

          {Array.isArray(quickQuestions) && quickQuestions.length > 0 && (
            <div className="quote-ai__questions" aria-label="Domande suggerite">
              {quickQuestions.map((question) => (
                <button type="button" key={question} disabled={sending} onClick={() => submit(question)}>
                  {question}
                </button>
              ))}
            </div>
          )}

          <div className="quote-ai__history" aria-live="polite">
            {history.length === 0 && (
              <div className="quote-ai__welcome">
                <strong>{welcomeTitle}</strong>
                <p>{welcomeText}</p>
              </div>
            )}
            {history.map((item, index) => (
              <div className={`quote-ai__message quote-ai__message--${item.role}`} key={`${item.role}-${index}`}>
                <span>{item.role === "user" ? "Tu" : "Assistente"}</span>
                <p>{item.text}</p>
                {item.contacts && showHumanContacts && <AssistantContactLinks compact />}
              </div>
            ))}
            {sending && (
              <div className="quote-ai__thinking" role="status">
                {thinkingText}
              </div>
            )}
          </div>

          {unavailable && (
            <div className="quote-ai__fallback" role="alert">
              <strong>{fallbackTitle}</strong>
              <p>{fallbackText}</p>
              {showHumanContacts && <AssistantContactLinks />}
            </div>
          )}

          {children}
        </div>

        <form
          className="quote-ai__form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor="quote-ai-message">La tua domanda</label>
          <div>
            <input
              ref={inputRef}
              id="quote-ai-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={sending}
              maxLength={500}
              autoComplete="off"
              placeholder={inputPlaceholder}
            />
            <button type="submit" disabled={sending || !message.trim()}>
              {sending ? "Invio…" : "Invia"}
            </button>
          </div>
          {disclaimer && <small>{disclaimer}</small>}
        </form>
      </aside>
    </>
  );
}
