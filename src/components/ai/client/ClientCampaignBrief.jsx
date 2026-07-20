import React from "react";
import { AIInsightCard } from "../AIInsightCard.jsx";
import { ClientCampaignAssistant } from "./ClientCampaignAssistant.jsx";
import "../ai-components.css";

export function ClientCampaignBrief({ items = [], attention = [], loading = false, error = null }) {
  const unavailableCount = items.filter((item) => item.value === null).length;
  return (
    <section className="client-ai-home" aria-labelledby="client-ai-home-title">
      <header className="client-ai-home__header">
        <div>
          <p className="client-ai-home__eyebrow">Riepilogo dati campagna</p>
          <h2 id="client-ai-home-title">La situazione in un colpo d’occhio</h2>
          <p>Ogni valore espone categoria, fonte e stato di aggiornamento.</p>
        </div>
        <div className="client-ai-home__legend" aria-label="Legenda categorie dato">
          <span>Reale</span><span>Derivato</span><span>Stima</span><span>Non disponibile</span>
        </div>
      </header>

      {error ? (
        <div className="client-ai-state client-ai-state--error" role="alert">
          <strong>Dati non caricati</strong>
          <span>Non è possibile produrre conclusioni finché la fonte campagne non torna disponibile.</span>
        </div>
      ) : loading ? (
        <div className="client-ai-kpi-grid" aria-label="Caricamento KPI Cliente"><AIInsightCard loading /><AIInsightCard loading /><AIInsightCard loading /></div>
      ) : items.length === 0 ? (
        <div className="client-ai-state"><strong>Nessun dato da mostrare</strong><span>La fonte non ha restituito KPI per questa dashboard.</span></div>
      ) : (
        <>
          <div className="client-ai-kpi-grid">{items.map((item, index) => <AIInsightCard key={item.id} datum={item} emphasis={index < 3 ? "primary" : "standard"} />)}</div>
          {unavailableCount > 0 && <p className="client-ai-home__missing" role="status">{unavailableCount} {unavailableCount === 1 ? "dato non è disponibile" : "dati non sono disponibili"}; nessun valore sostitutivo è stato applicato.</p>}
        </>
      )}

      <div className="client-ai-lower-grid">
        <section className="client-ai-attention" aria-labelledby="client-ai-attention-title">
          <p className="client-ai-home__eyebrow">Richiede attenzione</p>
          <h3 id="client-ai-attention-title">Elementi presenti nei dati</h3>
          {error || loading ? <p>Nessuna conclusione generata durante il caricamento o in caso di errore.</p> : attention.length > 0 ? (
            <ul>{attention.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{item.value}</span><AISourcePopoverProxy datum={item} /></li>)}</ul>
          ) : <p>Nessun elemento di attenzione emerge dagli stati già disponibili.</p>}
        </section>

        <ClientCampaignAssistant insights={{ items, attention }} loading={loading} />
      </div>
    </section>
  );
}

function AISourcePopoverProxy({ datum }) {
  return <span className="client-ai-attention__source">{datum.sources.map((source) => source.label).join(", ")} · {datum.category}</span>;
}
