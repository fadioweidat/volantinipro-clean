import React from "react";
import { AIInsightCard } from "../AIInsightCard.jsx";
import { AdminAttentionItem } from "./AdminAttentionItem.jsx";
import { AdminOperationalCopilot } from "./AdminOperationalCopilot.jsx";
import { AdminDecisionCenter } from "./AdminDecisionCenter.jsx";
import "../ai-components.css";

export function AdminOperationalBrief({ items = [], attention = [], attentionState = "empty", decisionCenter = null, links = [], loading = false, error = null }) {
  const unavailableCount = items.filter((item) => item.value === null).length;
  const staleCount = items.filter((item) => item.freshness?.state === "obsoleto").length;
  return (
    <section className="admin-ai-home" aria-labelledby="admin-ai-home-title">
      <header className="admin-ai-home__header">
        <div>
          <p className="admin-ai-home__eyebrow">Quadro operativo verificabile</p>
          <h2 id="admin-ai-home-title">Stato delle operazioni</h2>
          <p>KPI esistenti, con fonte, categoria e freshness consultabili.</p>
        </div>
        <div className="admin-ai-home__status" aria-label="Stato qualità dati">
          <span>{unavailableCount} non disponibili</span>
          <span>{staleCount} obsoleti</span>
        </div>
      </header>

      {error ? (
        <div className="admin-ai-state admin-ai-state--error" role="alert"><strong>Dati operativi non caricati</strong><span>Il riepilogo non produce conclusioni durante un errore della fonte.</span></div>
      ) : loading ? (
        <div className="admin-ai-kpi-grid" aria-label="Caricamento KPI Admin"><AIInsightCard loading /><AIInsightCard loading /><AIInsightCard loading /></div>
      ) : items.length === 0 ? (
        <div className="admin-ai-state"><strong>Nessun KPI disponibile</strong><span>Le fonti operative non hanno restituito dati proiettabili.</span></div>
      ) : (
        <>
          <div className="admin-ai-kpi-grid">{items.map((item, index) => <AIInsightCard key={item.id} datum={item} emphasis={index < 4 ? "primary" : "standard"} />)}</div>
          {unavailableCount > 0 && <p className="admin-ai-home__missing" role="status">{unavailableCount} {unavailableCount === 1 ? "KPI non è disponibile" : "KPI non sono disponibili"}; nessun valore sostitutivo è stato applicato.</p>}
        </>
      )}

      <AdminDecisionCenter decisionCenter={decisionCenter} loading={loading} error={error} />

      <div className="admin-ai-lower-grid">
        <section className="admin-ai-attention" aria-labelledby="admin-ai-attention-title">
          <p className="admin-ai-home__eyebrow">Richiede attenzione</p>
          <h3 id="admin-ai-attention-title">Segnali già presenti nel sistema</h3>
          {loading || error ? (
            <p>Nessuna conclusione generata durante il caricamento o in caso di errore.</p>
          ) : attention.length > 0 ? (
            <div className="admin-ai-attention__list">{attention.map((item) => <AdminAttentionItem key={item.datum.id} item={item} />)}</div>
          ) : (
            <p>Nessun segnale di attenzione emerge dai conteggi disponibili.</p>
          )}
          {attentionState === "partial" && <p className="admin-ai-attention__caveat" role="status">Verifica parziale: una o più fonti non sono disponibili. L’assenza di un segnale non equivale a “nessun problema”.</p>}
          {attentionState === "denied" && <p className="admin-ai-attention__caveat" role="status">Accesso negato a una o più fonti: i relativi valori restano nascosti.</p>}
        </section>

        <AdminOperationalCopilot insights={{ items, attention, attentionState }} decisionCenter={decisionCenter} loading={loading} />
      </div>

      {links.length > 0 && (
        <nav className="admin-ai-links" aria-label="Schermate operative Admin">
          {links.map((link) => <a href={link.href} key={link.href}>{link.label}<span>{link.description}</span></a>)}
        </nav>
      )}
    </section>
  );
}
