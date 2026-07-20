import React from "react";
import { AIInsightCard } from "../AIInsightCard.jsx";

export function ClientHistoricalSuggestions({ suggestions, loading = false, error = null }) {
  const items = Array.isArray(suggestions?.items) ? suggestions.items : [];
  const criteria = Array.isArray(suggestions?.criteria) ? suggestions.criteria : [];
  return (
    <section className="client-report-history" aria-labelledby="client-report-history-title">
      <header className="client-report-history__header">
        <div><p className="client-ai-home__eyebrow">Confronto storico Cliente</p><h3 id="client-report-history-title">Migliora la prossima campagna</h3><p>Osservazioni descrittive basate soltanto su campagne concluse, omogenee e appartenenti allo stesso Cliente.</p></div>
      </header>
      {error ? <div className="client-ai-state client-ai-state--error" role="alert"><strong>Storico non disponibile</strong><span>Nessun suggerimento viene prodotto durante un errore.</span></div>
        : loading ? <div className="client-report-history__grid" aria-label="Caricamento confronto storico"><AIInsightCard loading /><AIInsightCard loading /><AIInsightCard loading /></div>
          : items.length === 0 ? <div className="client-ai-state"><strong>Nessun confronto disponibile</strong><span>Lo storico autorizzato non ha prodotto insight.</span></div>
            : <div className="client-report-history__grid">{items.map((datum) => <AIInsightCard key={datum.id} datum={datum} />)}</div>}
      <details className="client-report-history__criteria">
        <summary>Criteri di comparabilita</summary>
        <ol>{criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ol>
      </details>
      <p className="client-report-history__guardrail">Nessun benchmark globale, previsione, suggerimento di spesa o confronto con altri clienti.</p>
    </section>
  );
}
