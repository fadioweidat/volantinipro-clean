import React, { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import "./admin-central-ai.css";

export default function AdminCentralAiPanel({ adminIdentity, campaigns = [], availability = {}, dataLoading = false, dataError = null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [fetched, setFetched] = useState(false);

  const identityReady = Boolean(adminIdentity?.user?.id && ["admin", "super_admin"].includes(adminIdentity?.role));
  const unavailable = !identityReady || Boolean(dataError) || availability?.campaigns !== true;

  async function fetchCopilotData() {
    if (loading || fetched || unavailable || dataLoading) return;
    setLoading(true);
    setError(null);
    try {
      // Aggregiamo i dati rilevanti delle campagne attive per l'AI
      const activeCampaigns = campaigns.filter(c => c.status === "active");
      const dashboardData = {
        activeCampaignsCount: activeCampaigns.length,
        campaigns: activeCampaigns.map(c => ({
          id: c.id,
          name: c.title || c.company || "Campagna",
          progress: c.progress || 0,
          end_date: c.end_date,
          status: c.status
        }))
      };

      const { data, error: invokeError } = await supabase.functions.invoke('ai-admin-copilot', {
        body: { dashboardData }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      setAlerts(data?.alerts || []);
      setFetched(true);
    } catch (err) {
      console.error("AI Admin Copilot error:", err);
      setError("Impossibile generare l'analisi AI della Dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !fetched) {
      fetchCopilotData();
    }
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
            : loading ? <div className="admin-central-ai__loading" role="status">L'AI sta analizzando la dashboard...</div>
              : error ? <div className="admin-central-ai__state admin-central-ai__state--error" role="alert">{error}</div>
                : alerts.length > 0 ? (
                  <div className="admin-central-ai__history" aria-live="polite">
                    {alerts.map((alert, idx) => (
                      <article key={idx} className={`admin-central-ai__message admin-central-ai__message--assistant`} style={{ borderLeft: `4px solid ${alert.type === 'warning' ? '#eab308' : alert.type === 'error' ? '#ef4444' : '#3b82f6'}` }}>
                        <strong>{alert.type === 'warning' ? 'Attenzione' : alert.type === 'error' ? 'Problema' : 'Suggerimento'}</strong>
                        <p>{alert.message}</p>
                      </article>
                    ))}
                    <span className="admin-central-ai__source">Generato da OpenAI su dati reali. Non produce testi statici predefiniti.</span>
                  </div>
                ) : (
                  <div className="admin-central-ai__empty">Nessun alert generato dall'AI. Tutte le campagne sembrano in regola.</div>
                )}
      </div>}
    </section>
  );
}
