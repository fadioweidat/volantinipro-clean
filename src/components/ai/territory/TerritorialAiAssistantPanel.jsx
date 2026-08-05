import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildTerritorialSessionContextKey,
  clearTerritorialAiContext,
  clearTerritorialAiPrincipal,
  getTerritorialStep2Foundation,
  invalidateTerritorialAiSession,
  registerTerritorialAiSession,
  updateTerritorialSnapshot,
} from "../../../ai-foundation/integrations/territorial-step2/territorialStep2Foundation.mjs";
import { territorialToolSourceLabel } from "../../../ai-foundation/integrations/territorial-step2/TerritorialStep2ReadOnlyRuntime.mjs";
import { supabase } from "../../../supabaseClient.js";
import "./territorial-ai-assistant.css";

const identityRoles = new Set(["cliente", "client", "customer", "fornitore", "supplier", "admin", "super_admin"]);
const shortHash = (value) => {
  let result = 2166136261;
  for (const char of String(value)) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16).padStart(8, "0");
};

export function normalizeTerritorialIdentity(identity, contextId) {
  if (identity?.status === "signed_out" || identity?.status === "invalid") return Object.freeze({ enabled: false, principalId: null, role: "visitatore", authUser: null, profile: null });
  const role = typeof identity?.profile?.role === "string" ? identity.profile.role.trim().toLowerCase() : "";
  if (identity?.authUser?.id && identityRoles.has(role)) return Object.freeze({
    enabled: true,
    principalId: String(identity.authUser.id),
    role,
    authUser: Object.freeze({ id: String(identity.authUser.id), email: identity.authUser.email ?? null }),
    profile: Object.freeze({ role }),
  });
  if (identity?.status === "anonymous" && contextId) return Object.freeze({ enabled: true, principalId: `visitor:${contextId}`, role: "visitatore", authUser: null, profile: null });
  return Object.freeze({ enabled: false, principalId: null, role: "visitatore", authUser: null, profile: null });
}

function baseSessionId(principalId) {
  if (typeof window === "undefined") return null;
  const key = `vp_ai_territory_session:${shortHash(principalId)}`;
  let value = window.sessionStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, value);
  }
  return value;
}

function removeBaseSessionId(principalId) {
  if (typeof window !== "undefined" && principalId) window.sessionStorage.removeItem(`vp_ai_territory_session:${shortHash(principalId)}`);
}

function suggestions(snapshot) {
  const common = ["Spiegami questa analisi.", "Quali dati risultano mancanti?", "Spiegamelo in modo semplice."];
  if (snapshot.service.key === "d2d") return [common[0], "La quantita e sufficiente?", "Qual e la copertura stimata?", common[1], common[2]];
  if (snapshot.quantity.recommended != null) return [common[0], "La quantita e sufficiente?", common[1], common[2]];
  return common;
}

export default function TerritorialAiAssistantPanel({ snapshot, identity = null, contextId = null, activeCampaignRef = null, activeQuoteRef = null }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [versionNotice, setVersionNotice] = useState(null);
  const previousSession = useRef(null);
  const previousPrincipal = useRef(null);

  const resolvedIdentity = useMemo(() => normalizeTerritorialIdentity(identity, contextId), [identity, contextId]);
  const baseId = useMemo(() => resolvedIdentity.enabled ? baseSessionId(resolvedIdentity.principalId) : null, [resolvedIdentity.enabled, resolvedIdentity.principalId]);
  const contextKey = useMemo(() => buildTerritorialSessionContextKey({
    principalId: resolvedIdentity.principalId,
    role: resolvedIdentity.role,
    contextId,
    campaignRef: activeCampaignRef,
    quoteRef: activeQuoteRef,
    fingerprint: snapshot.fingerprint,
  }), [resolvedIdentity.principalId, resolvedIdentity.role, contextId, activeCampaignRef, activeQuoteRef, snapshot.fingerprint]);
  const sessionId = baseId && contextKey ? `${baseId}:${contextKey}` : null;

  useEffect(() => {
    if (!sessionId || !resolvedIdentity.enabled) {
      if (previousPrincipal.current) clearTerritorialAiPrincipal(previousPrincipal.current);
      else if (previousSession.current) invalidateTerritorialAiSession(previousSession.current);
      if (previousPrincipal.current) removeBaseSessionId(previousPrincipal.current);
      previousSession.current = null;
      previousPrincipal.current = null;
      setHistory([]);
      setSending(false);
      return;
    }
    if (previousPrincipal.current && previousPrincipal.current !== resolvedIdentity.principalId) {
      clearTerritorialAiPrincipal(previousPrincipal.current);
      removeBaseSessionId(previousPrincipal.current);
    } else if (previousSession.current && previousSession.current !== sessionId) {
      invalidateTerritorialAiSession(previousSession.current);
      setHistory([]);
      setVersionNotice("Contesto aggiornato: le risposte precedenti sono state invalidate.");
    }
    previousSession.current = sessionId;
    previousPrincipal.current = resolvedIdentity.principalId;
    registerTerritorialAiSession(sessionId, resolvedIdentity.principalId);
    updateTerritorialSnapshot(sessionId, snapshot, resolvedIdentity.principalId);
    try { setHistory(getTerritorialStep2Foundation().stateManager.snapshot(sessionId).history); } catch { setHistory([]); }
  }, [sessionId, contextKey, resolvedIdentity.enabled, resolvedIdentity.principalId, snapshot]);

  useEffect(() => () => {
    if (previousSession.current) clearTerritorialAiContext(previousSession.current);
  }, []);

  async function submit(value = message) {
    const question = String(value || "").trim();
    if (!question || sending || !sessionId || !resolvedIdentity.enabled) return;
    setSending(true);
    setMessage("");
    setError(null);
    updateTerritorialSnapshot(sessionId, snapshot, resolvedIdentity.principalId);

    // Add user message to history immediately
    const userMessage = { role: "user", content: question, at: Date.now() };
    setHistory(prev => [...prev, userMessage]);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-assistant-territory', {
        body: { snapshot, question }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      // Add AI response to history
      const assistantMessage = {
        role: "assistant",
        content: data?.answer || "Nessuna risposta dal modello.",
        at: Date.now(),
        metadata: { sources: [{ name: "OpenAI GPT-4o-mini", kind: "provider" }] }
      };
      setHistory(prev => [...prev, assistantMessage]);
      setVersionNotice(null);
    } catch (err) {
      console.error("AI invocation error:", err);
      setError("Errore nella comunicazione con l'Assistente AI. Riprova più tardi.");
    } finally {
      setSending(false);
    }
  }

  const stateLabel = { complete: "Dati completi", partial: "Dati parziali", missing: "Dati mancanti", unavailable: "Dati non disponibili", loading: "Analisi in corso", error: "Errore controllato", unsupported_service: "Servizio non supportato" }[snapshot.state];
  return <section className={`territorial-central-ai${open ? " territorial-central-ai--open" : ""}`} aria-labelledby="territorial-central-ai-title">
    <div className="territorial-central-ai__topline"><div><p className="territorial-central-ai__eyebrow">CentralAiAgent · Territory Tool · sola lettura</p><h2 id="territorial-central-ai-title">Assistente Analisi Territoriale</h2><p>Ti aiuta a comprendere copertura, quantita e dati della zona selezionata.</p></div><div className="territorial-central-ai__actions">{stateLabel && <span className={`territorial-central-ai__badge territorial-central-ai__badge--${snapshot.state}`}>{stateLabel}</span>}<button type="button" className="territorial-central-ai__toggle" aria-expanded={open} aria-controls="territorial-central-ai-body" onClick={() => setOpen((value) => !value)}>{open ? "Chiudi" : "Apri assistente"}</button></div></div>
    {open && <div id="territorial-central-ai-body" className="territorial-central-ai__body">
      {versionNotice && <div className="territorial-central-ai__state" role="status">{versionNotice}</div>}
      {!resolvedIdentity.enabled ? <div className="territorial-central-ai__state" role="status">Sessione AI territoriale non disponibile.</div> : snapshot.state === "loading" ? <div className="territorial-central-ai__state" role="status">Analisi territoriale in corso...</div> : <>
        <div className="territorial-central-ai__suggestions" aria-label="Domande territoriali suggerite">{suggestions(snapshot).map((suggestion) => <button type="button" key={suggestion} disabled={sending} onClick={() => submit(suggestion)}>{suggestion}</button>)}</div>
        <div className="territorial-central-ai__history" aria-live="polite" aria-label="Cronologia Assistente Analisi Territoriale">{history.length === 0 ? <p className="territorial-central-ai__empty">Chiedi una spiegazione dei risultati gia prodotti dallo Step 2.</p> : history.map((item, index) => <article key={`${item.at}-${index}`} className={`territorial-central-ai__message territorial-central-ai__message--${item.role}`}><strong>{item.role === "user" ? "Tu" : "Assistente Territoriale"}</strong><p>{item.content}</p>{item.role === "assistant" && item.metadata?.sources?.length > 0 && <span className="territorial-central-ai__source">Provenienza verificata tramite {[...new Set(item.metadata.sources.map(territorialToolSourceLabel))].join(", ")}; provider, dataset/fonte e stato sono riportati nella risposta.</span>}</article>)}{sending && <div className="territorial-central-ai__loading" role="status">Lettura dello snapshot in corso...</div>}</div>
        {error && <div className="territorial-central-ai__state territorial-central-ai__state--error" role="alert">{error}</div>}
        <form className="territorial-central-ai__form" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor="territorial-central-ai-message">Messaggio</label><div><input id="territorial-central-ai-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} placeholder="Chiedi di spiegare l'analisi" autoComplete="off" /><button type="submit" disabled={sending || !message.trim()}>{sending ? "Invio..." : "Invia"}</button></div></form>
        <p className="territorial-central-ai__notice">Non modifica quantita, zone, raggio o mappa e non esegue nuovi calcoli territoriali.</p>
      </>}
    </div>}
  </section>;
}
