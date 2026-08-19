import React, { useEffect, useState } from "react";
import { runAdminCopilot } from "../../../ai/adapters/adminCopilotAdapter.js";
import { AI_RESPONSE_STATUSES } from "../../../ai/schema/aiResponseSchema.js";
import "./admin-central-ai.css";

const INTENT_LABELS = {
  operations_summary: "Riepilogo operativo",
  driver_attention: "Driver da attenzionare",
  campaign_attention: "Campagne critiche",
  blocked_zones: "Zone bloccate",
  gps_stale: "GPS fermo",
  program_status: "Stato programmi",
  alerts_summary: "Riepilogo alert",
};

export default function AdminCentralAiPanel({ adminIdentity, campaigns = [], availability = {}, operators = [], operatorsSummary = {}, dataLoading = false, dataError = null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [fetchedFor, setFetchedFor] = useState(null);

  const identityReady = Boolean(adminIdentity?.user?.id && ["admin", "super_admin"].includes(adminIdentity?.role));
  const unavailable = !identityReady || Boolean(dataError);

  async function fetchCopilotData(nextIntent = "operations_summary") {
    if (loading || unavailable || dataLoading) return;
    setLoading(true);
    try {
      const result = await runAdminCopilot({ adminIdentity, campaigns, availability, operators, operatorsSummary, intentName: nextIntent });
      setResponse(result);
      setFetchedFor(nextIntent);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && fetchedFor === null) fetchCopilotData();
  }, [open]);

  return (
    <section className={`admin-central-ai${open ? " admin-central-ai--open" : ""}`} aria-labelledby="admin-central-ai-title">
      <div className="admin-central-ai__topline">
        <div>
          <p className="admin-central-ai__eyebrow">AI Copilot · OpenAI GPT-4o-mini</p>
          <h2 id="admin-central-ai-title">Analisi Operativa Dashboard</h2>
          <p>Analisi in tempo reale delle campagne attive per suggerire priorità e identificare anomalie.</p>
        </div>
        <button type="button" className="admin-central-ai__toggle" aria-expanded={open} aria-controls="admin-central-ai-body" onClick={() => setOpen((value) => !value)}>{open ? "Chiudi" : "Genera Analisi AI"}</button>
      </div>
      {open && <div id="admin-central-ai-body" className="admin-central-ai__body">
        {dataLoading ? <div className="admin-central-ai__state" role="status">Caricamento dei dati Admin autorizzati...</div>
          : unavailable ? <div className="admin-central-ai__state admin-central-ai__state--error" role="alert">Assistente non disponibile: identità Admin o fonte dati non verificata.</div>
            : <>
              <div className="admin-central-ai__suggestions" aria-label="Domande Admin suggerite">
                {Object.entries(INTENT_LABELS).map(([id, label]) => (
                  <button key={id} type="button" disabled={loading} onClick={() => fetchCopilotData(id)}>{label}</button>
                ))}
              </div>
              {loading ? <div className="admin-central-ai__loading" role="status">L'AI sta analizzando la dashboard...</div>
                : !response ? null
                  : (
                    <div className="admin-central-ai__history" aria-live="polite">
                      <article className="admin-central-ai__message admin-central-ai__message--assistant" style={{ borderLeft: `4px solid ${response.status === AI_RESPONSE_STATUSES.AI ? "#3b82f6" : response.status === AI_RESPONSE_STATUSES.FALLBACK ? "#eab308" : "#ef4444"}` }}>
                        <strong>{INTENT_LABELS[response.intent] || "Analisi"}</strong>
                        <p>{response.answer}</p>
                        {response.summary && <p className="admin-central-ai__summary"><strong>Analisi AI</strong>{response.summary}</p>}
                        {response.priorities?.length > 0 && <div className="admin-central-ai__details"><strong>Priorità</strong><ul>{response.priorities.map((item, index) => <li key={`priority-${index}`}>{item}</li>)}</ul></div>}
                        {response.warnings?.length > 0 && <div className="admin-central-ai__details admin-central-ai__details--warning"><strong>Warning</strong><ul>{response.warnings.map((item, index) => <li key={`warning-${index}`}>{item}</li>)}</ul></div>}
                        {response.evidence.length > 0 && (
                          <ul className="admin-central-ai__evidence">
                            {response.evidence.map((item, index) => (
                              <li key={`${item.label}-${index}`}>{item.label}: {String(item.value)} <em>({item.type.toLowerCase()}, {item.confidence}, {item.source})</em></li>
                            ))}
                          </ul>
                        )}
                        {response.limitations.length > 0 && <p className="admin-central-ai__source">Limiti: {response.limitations.join(" ")}</p>}
                      </article>
                      <span className="admin-central-ai__source">{response.updatedAt ? `Ultimo aggiornamento: ${new Date(response.updatedAt).toLocaleString("it-IT")}. ` : ""}{response.provider === "deterministic" ? "Risposta deterministica su dati reali autorizzati." : response.status === AI_RESPONSE_STATUSES.AI ? "Generato da OpenAI su dati reali autorizzati." : "Errore reale controllato: nessun testo grezzo del modello mostrato."}</span>
                    </div>
                  )}
            </>}
      </div>}
    </section>
  );
}
