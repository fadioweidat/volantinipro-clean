import React, { useEffect, useMemo, useState } from "react";
import { getCurrentSupabaseUser } from "../../../lib/supabaseClient.js";
import {
  clearCustomerDashboardAiContext,
  getCustomerDashboardFoundation,
  registerCustomerAiSession,
  updateCustomerDashboardData,
} from "../../../ai-foundation/integrations/customer-dashboard/customerDashboardFoundation.mjs";
import {
  CUSTOMER_DASHBOARD_SUPPORTED_QUESTIONS,
} from "../../../ai-foundation/integrations/customer-dashboard/CustomerDashboardReadOnlyRuntime.mjs";
import { runCustomerAssistant, classifyCustomerIntent } from "../../../ai/adapters/customerAssistantAdapter.js";
import { AI_RESPONSE_STATUSES } from "../../../ai/schema/aiResponseSchema.js";
import "./customer-ai-assistant.css";

const SUGGESTIONS = Object.freeze([
  CUSTOMER_DASHBOARD_SUPPORTED_QUESTIONS[0],
  CUSTOMER_DASHBOARD_SUPPORTED_QUESTIONS[2],
  CUSTOMER_DASHBOARD_SUPPORTED_QUESTIONS[8],
  CUSTOMER_DASHBOARD_SUPPORTED_QUESTIONS[9],
]);

function getSessionId(subjectId) {
  const key = `vp_ai_customer_session:${subjectId}`;
  let value = window.sessionStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, value);
  }
  return value;
}

export default function CustomerAiAssistantPanel({ session, customer, campaigns = [], dataLoading = false, dataError = null }) {
  const [open, setOpen] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authState, setAuthState] = useState(session ? "checking" : "unavailable");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setAuthUser(null);
      setAuthState("unavailable");
      setHistory([]);
      clearCustomerDashboardAiContext();
      return () => { cancelled = true; };
    }
    setAuthState("checking");
    getCurrentSupabaseUser(session)
      .then((user) => {
        if (cancelled) return;
        if (!user?.id || !user?.email) { setAuthState("unavailable"); return; }
        setAuthUser({ id: String(user.id), email: String(user.email) });
        setAuthState("ready");
      })
      .catch(() => { if (!cancelled) setAuthState("unavailable"); });
    return () => { cancelled = true; };
  }, [session]);

  const identityReady = Boolean(authState === "ready" && authUser?.id && customer?.id && customer?.email && authUser.email.toLowerCase() === String(customer.email).toLowerCase());
  const sessionId = useMemo(() => identityReady ? getSessionId(authUser.id) : null, [identityReady, authUser?.id]);

  useEffect(() => {
    if (!sessionId) return;
    registerCustomerAiSession(sessionId);
    updateCustomerDashboardData({ authUser, customer, campaigns, loading: dataLoading, error: Boolean(dataError) });
    const stateManager = getCustomerDashboardFoundation().stateManager;
    try { setHistory(stateManager.snapshot(sessionId).history.map((item) => ({ ...item, aiResponse: null }))); } catch { setHistory([]); }
  }, [sessionId, authUser, customer, campaigns, dataLoading, dataError]);

  async function submit(value = message) {
    const question = String(value || "").trim();
    if (!question || sending || !identityReady || dataLoading) return;
    setSending(true);
    setError(null);
    setMessage("");
    setHistory((prev) => [...prev, { role: "user", content: question, at: new Date().toISOString(), aiResponse: null }]);
    try {
      const activeQuote = campaigns.find((campaign) => {
        const status = campaign?.stato ?? campaign?.status;
        const metadata = campaign?.metadata && typeof campaign.metadata === "object" ? campaign.metadata : {};
        return Boolean(metadata.quote_summary) || ["preventivo", "inviato", "in_preparazione"].includes(status);
      }) ?? null;
      const intentName = classifyCustomerIntent(question);
      const response = await runCustomerAssistant({
        sessionId, authUser, customer, campaigns, dataLoading, dataError,
        activeCampaign: campaigns[0] ?? null, activeQuote, location: window.location.href, intentName,
      });
      setHistory((prev) => [...prev, { role: "assistant", content: response.answer, at: new Date().toISOString(), aiResponse: response }]);
    } catch {
      setError("Non e stato possibile consultare i dati autorizzati. Riprova tra poco.");
    } finally {
      setSending(false);
    }
  }

  const unavailable = !identityReady || Boolean(dataError);

  return (
    <section className={`customer-central-ai${open ? " customer-central-ai--open" : ""}`} aria-labelledby="customer-central-ai-title">
      <div className="customer-central-ai__topline">
        <div>
          <p className="customer-central-ai__eyebrow">CentralAiAgent · sola lettura</p>
          <h2 id="customer-central-ai-title">Assistente VolantiniPro</h2>
          <p>Legge e spiega esclusivamente i dati reali autorizzati presenti nella tua Dashboard Cliente.</p>
        </div>
        <button type="button" className="customer-central-ai__toggle" aria-expanded={open} aria-controls="customer-central-ai-body" onClick={() => setOpen((value) => !value)}>
          {open ? "Chiudi" : "Apri assistente"}
        </button>
      </div>

      {open && (
        <div id="customer-central-ai-body" className="customer-central-ai__body">
          {authState === "checking" || dataLoading ? (
            <div className="customer-central-ai__state" role="status">Verifica dei dati autorizzati in corso...</div>
          ) : unavailable ? (
            <div className="customer-central-ai__state customer-central-ai__state--error" role="alert">Assistente non disponibile: sessione cliente o fonte dati non verificata.</div>
          ) : (
            <>
              <div className="customer-central-ai__suggestions" aria-label="Domande suggerite">
                {SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} disabled={sending} onClick={() => submit(suggestion)}>{suggestion}</button>)}
              </div>

              <div className="customer-central-ai__history" aria-live="polite" aria-label="Cronologia Assistente VolantiniPro">
                {history.length === 0 ? <p className="customer-central-ai__empty">Fai una domanda sui dati disponibili nella Dashboard.</p> : history.map((item, index) => (
                  <article key={`${item.at}-${index}`} className={`customer-central-ai__message customer-central-ai__message--${item.role}`}>
                    <strong>{item.role === "user" ? "Tu" : "Assistente VolantiniPro"}</strong>
                    <p>{item.content}</p>
                    {item.role === "assistant" && item.aiResponse?.evidence?.length > 0 && (
                      <ul className="customer-central-ai__evidence">
                        {item.aiResponse.evidence.map((evidenceItem, evidenceIndex) => (
                          <li key={`${evidenceItem.label}-${evidenceIndex}`}>{evidenceItem.label}: {evidenceItem.value == null ? "NON DISPONIBILE" : String(evidenceItem.value)} <em>({evidenceItem.type.toLowerCase()}, {evidenceItem.confidence})</em></li>
                        ))}
                      </ul>
                    )}
                    {item.role === "assistant" && (
                      <span className="customer-central-ai__source">{item.aiResponse?.status === AI_RESPONSE_STATUSES.AI ? "Fonte interna verificata" : "Risposta di fallback controllata"}</span>
                    )}
                  </article>
                ))}
                {sending && <div className="customer-central-ai__loading" role="status">Consultazione dei dati in corso...</div>}
              </div>

              {error && <div className="customer-central-ai__state customer-central-ai__state--error" role="alert">{error}</div>}

              <form className="customer-central-ai__form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                <label htmlFor="customer-central-ai-message">Messaggio</label>
                <div>
                  <input id="customer-central-ai-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} placeholder="Chiedi informazioni sulla tua dashboard" autoComplete="off" />
                  <button type="submit" disabled={sending || !message.trim()}>{sending ? "Invio..." : "Invia"}</button>
                </div>
              </form>
              <p className="customer-central-ai__notice">Nessuna modifica, automazione o azione viene eseguita. L'assistente non usa un modello generativo nel browser.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
