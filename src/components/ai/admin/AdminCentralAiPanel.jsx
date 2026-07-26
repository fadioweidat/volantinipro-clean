import React, { useEffect, useMemo, useState } from "react";
import {
  clearAdminDashboardAiContext,
  getAdminDashboardFoundation,
  registerAdminAiSession,
  updateAdminDashboardData,
} from "../../../ai-foundation/integrations/admin-dashboard/adminDashboardFoundation.mjs";
import { adminToolSourceLabel } from "../../../ai-foundation/integrations/admin-dashboard/AdminDashboardReadOnlyRuntime.mjs";
import "./admin-central-ai.css";

const SUGGESTIONS = Object.freeze([
  "Mostrami le campagne che richiedono attenzione.",
  "Quali dati risultano mancanti?",
  "Riassumi le campagne attive.",
  "Quali preventivi sono ancora aperti?",
  "Spiegami questa Dashboard.",
]);

function getSessionId(subjectId) {
  if (typeof window === "undefined") return null;
  const key = `vp_ai_admin_session:${subjectId}`;
  let value = window.sessionStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, value);
  }
  return value;
}

export default function AdminCentralAiPanel({ adminIdentity, campaigns = [], availability = {}, dataLoading = false, dataError = null }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const identityReady = Boolean(adminIdentity?.user?.id && ["admin", "super_admin"].includes(adminIdentity?.role));
  const sessionId = useMemo(() => identityReady ? getSessionId(adminIdentity.user.id) : null, [identityReady, adminIdentity?.user?.id]);

  useEffect(() => {
    if (!sessionId) return;
    registerAdminAiSession(sessionId);
    updateAdminDashboardData({ adminIdentity, campaigns, availability, loading: dataLoading, error: Boolean(dataError) });
    try { setHistory(getAdminDashboardFoundation().stateManager.snapshot(sessionId).history); } catch { setHistory([]); }
  }, [sessionId, adminIdentity, campaigns, availability, dataLoading, dataError]);

  useEffect(() => () => clearAdminDashboardAiContext(), [adminIdentity?.user?.id, adminIdentity?.role]);

  async function submit(value = message) {
    const question = String(value || "").trim();
    if (!question || sending || !identityReady || dataLoading || dataError) return;
    setSending(true);
    setMessage("");
    setError(null);
    try {
      updateAdminDashboardData({ adminIdentity, campaigns, availability, loading: dataLoading, error: Boolean(dataError) });
      const response = await getAdminDashboardFoundation().agent.reply({
        sessionId,
        authUser: { id: String(adminIdentity.user.id), email: adminIdentity.user.email ?? null },
        profile: { role: adminIdentity.role },
        location: window.location.href,
        activeCampaign: campaigns.find((campaign) => campaign?.quality === "real" && campaign?.status === "active") ?? null,
        activeQuote: campaigns.find((campaign) => campaign?.quality !== "test" && campaign?.source === "quote_requests") ?? null,
        message: question,
      });
      setHistory(response.state.history);
    } catch {
      setError("Non e stato possibile consultare i dati Admin autorizzati. Riprova tra poco.");
    } finally { setSending(false); }
  }

  const unavailable = !identityReady || Boolean(dataError) || availability?.campaigns !== true;
  return (
    <section className={`admin-central-ai${open ? " admin-central-ai--open" : ""}`} aria-labelledby="admin-central-ai-title">
      <div className="admin-central-ai__topline">
        <div>
          <p className="admin-central-ai__eyebrow">CentralAiAgent · sola lettura</p>
          <h2 id="admin-central-ai-title">Assistente Operativo VolantiniPro</h2>
          <p>Consulta soltanto lo snapshot reale autorizzato della Dashboard Admin. Non modifica dati e non esegue azioni.</p>
        </div>
        <button type="button" className="admin-central-ai__toggle" aria-expanded={open} aria-controls="admin-central-ai-body" onClick={() => setOpen((value) => !value)}>{open ? "Chiudi" : "Apri assistente"}</button>
      </div>
      {open && <div id="admin-central-ai-body" className="admin-central-ai__body">
        {dataLoading ? <div className="admin-central-ai__state" role="status">Caricamento dei dati Admin autorizzati...</div>
          : unavailable ? <div className="admin-central-ai__state admin-central-ai__state--error" role="alert">Assistente non disponibile: identita Admin o fonte dati non verificata.</div>
            : <>
              <div className="admin-central-ai__suggestions" aria-label="Domande suggerite">{SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} disabled={sending} onClick={() => submit(suggestion)}>{suggestion}</button>)}</div>
              <div className="admin-central-ai__history" aria-live="polite" aria-label="Cronologia Assistente Operativo VolantiniPro">
                {history.length === 0 ? <p className="admin-central-ai__empty">Fai una domanda operativa sui dati disponibili.</p> : history.map((item, index) => <article key={`${item.at}-${index}`} className={`admin-central-ai__message admin-central-ai__message--${item.role}`}>
                  <strong>{item.role === "user" ? "Tu" : "Assistente Operativo"}</strong><p>{item.content}</p>
                  {item.role === "assistant" && item.metadata?.sources?.length > 0 && <span className="admin-central-ai__source">Fonte interna: {[...new Set(item.metadata.sources.map(adminToolSourceLabel))].join(", ")} · {item.metadata.kind === "fact" ? "fatto letto" : "regola deterministica / spiegazione"}</span>}
                </article>)}
                {sending && <div className="admin-central-ai__loading" role="status">Consultazione read-only in corso...</div>}
              </div>
              {error && <div className="admin-central-ai__state admin-central-ai__state--error" role="alert">{error}</div>}
              <form className="admin-central-ai__form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                <label htmlFor="admin-central-ai-message">Messaggio</label><div><input id="admin-central-ai-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} placeholder="Chiedi informazioni operative" autoComplete="off" /><button type="submit" disabled={sending || !message.trim()}>{sending ? "Invio..." : "Invia"}</button></div>
              </form>
              <p className="admin-central-ai__notice">Campi personali, identificativi completi e fonti non collegate non vengono esposti.</p>
            </>}
      </div>}
    </section>
  );
}
