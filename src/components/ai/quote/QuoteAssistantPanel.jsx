import React, { useEffect, useRef, useState } from "react";
import { runQuoteAssistant } from "../../../ai/adapters/quoteAssistantAdapter.js";
import { buildInfoMailtoUrl, buildInfoWhatsAppUrl } from "../../../lib/contactConfig.js";
import "./quote-assistant.css";

const HUMAN_REQUEST = /(?:parlare|sentire|contattare|scrivere).*(?:persona|operatore|consulente|umano)|(?:persona|operatore|consulente|umano).*(?:parlare|sentire|contattare|scrivere)/i;
const ASSISTANT_WHATSAPP_URL = "https://wa.me/393517673737";

function ContactLinks({ compact = false }) {
  const whatsappUrl = buildInfoWhatsAppUrl() || ASSISTANT_WHATSAPP_URL;
  return <div className={`quote-ai__contacts${compact ? " quote-ai__contacts--compact" : ""}`}>
    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp <span>+39 351 767 3737</span></a>
    <a href={buildInfoMailtoUrl()}>Email <span>info@volantinipro.it</span></a>
  </div>;
}

export default function QuoteAssistantPanel({ open, onClose, page, context, quickQuestions = [] }) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const inputRef = useRef(null);
  const step = Number(String(page || "").replace("step", "")) || null;

  useEffect(() => {
    setHistory([]);
    setUnavailable(false);
    setMessage("");
  }, [page]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 760px)").matches) document.body.style.overflow = "hidden";
    window.setTimeout(() => inputRef.current?.focus(), 80);
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
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

    if (HUMAN_REQUEST.test(question)) {
      setHistory((items) => [...items, { role: "assistant", text: "Certo. Puoi parlare subito con il team VolantiniPro:", contacts: true }]);
      return;
    }

    if (!context || !step) {
      setUnavailable(true);
      return;
    }

    setSending(true);
    try {
      const response = await runQuoteAssistant({ contextType: `step${step}`, snapshot: context, question });
      setHistory((items) => [...items, { role: "assistant", text: response.answer }]);
    } catch (error) {
      console.error("[quote-assistant]", error instanceof Error ? error.message : "ASSISTANT_UNAVAILABLE");
      setUnavailable(true);
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;
  return <>
    <button className="quote-ai__backdrop" type="button" aria-label="Chiudi assistente" onClick={onClose} />
    <aside id="quote-ai-panel" className="quote-ai" role="dialog" aria-modal="true" aria-labelledby="quote-ai-title">
      <header className="quote-ai__header">
        <div>
          <span className="quote-ai__step">Preventivo · Step {step}</span>
          <h2 id="quote-ai-title">Assistente VolantiniPro</h2>
          <p>Risposte brevi basate sui dati reali di questo Step.</p>
        </div>
        <button className="quote-ai__close" type="button" onClick={onClose} aria-label="Chiudi assistente">×</button>
      </header>

      <div className="quote-ai__body">
        <div className="quote-ai__questions" aria-label="Domande suggerite">
          {quickQuestions.map((question) => <button type="button" key={question} disabled={sending} onClick={() => submit(question)}>{question}</button>)}
        </div>

        <div className="quote-ai__history" aria-live="polite">
          {history.length === 0 && <div className="quote-ai__welcome"><strong>Come posso aiutarti?</strong><p>Conosco le scelte e i valori mostrati qui, ma non posso modificare il preventivo.</p></div>}
          {history.map((item, index) => <div className={`quote-ai__message quote-ai__message--${item.role}`} key={`${item.role}-${index}`}>
            <span>{item.role === "user" ? "Tu" : "Assistente"}</span>
            <p>{item.text}</p>
            {item.contacts && <ContactLinks compact />}
          </div>)}
          {sending && <div className="quote-ai__thinking" role="status">Sto leggendo i dati dello Step…</div>}
        </div>

        {unavailable && <div className="quote-ai__fallback" role="alert">
          <strong>Assistente momentaneamente non disponibile.</strong>
          <p>Il preventivo continua a funzionare normalmente.</p>
          <ContactLinks />
        </div>}
      </div>

      <form className="quote-ai__form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label htmlFor="quote-ai-message">La tua domanda</label>
        <div>
          <input ref={inputRef} id="quote-ai-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} maxLength={500} autoComplete="off" placeholder="Scrivi una domanda sul preventivo" />
          <button type="submit" disabled={sending || !message.trim()}>{sending ? "Invio…" : "Invia"}</button>
        </div>
        <small>Solo dati del preventivo. Nessuna modifica automatica.</small>
      </form>
    </aside>
  </>;
}
