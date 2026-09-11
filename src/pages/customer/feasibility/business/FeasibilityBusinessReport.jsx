import React from 'react';
import { NOT_AVAILABLE } from './feasibilityBusinessSchemas.js';

const fmt = value => (value == null ? NOT_AVAILABLE : new Intl.NumberFormat('it-IT').format(Math.round(value)));

// STEP 4 — Report finale Business Mode (§9): 11 sezioni dedicate, pensate
// per sembrare una mini consulenza, non una calcolatrice.
export default function FeasibilityBusinessReport({ inputs, analysis, narrative, recommendations, loading, onEdit, onCta }) {
  if (loading) {
    return (
      <section className="vf-panel" role="status">
        <span className="vf-eyebrow">Passo 4 di 4</span>
        <h2>Stiamo analizzando la zona…</h2>
        <p>Recupero dati territoriali reali e punti di interesse nella zona indicata.</p>
      </section>
    );
  }

  const { competitionLevel, competitorCount, competitors, complementaryPois, targetPotential, score, nearestCompetitorKm } = analysis;

  return (
    <article className="vf-report" aria-labelledby="vfb-report-title">
      <header className="vf-report-heading">
        <span className="vf-eyebrow">VolantiniPro · Studio di Fattibilità AI</span>
        <h2 id="vfb-report-title">Report di fattibilità — {inputs.businessType || 'la tua attività'}</h2>
        <p>Analisi basata su dati territoriali reali (ISTAT) e punti di interesse reali (OpenStreetMap). Nessun dato è stato inventato: dove manca una fonte, il report indica "{NOT_AVAILABLE}".</p>
        <div className="vf-actions vf-no-print">
          {onEdit && <button type="button" onClick={onEdit}>Modifica dati</button>}
          <button type="button" onClick={() => window.print()}>Stampa / Salva PDF</button>
        </div>
      </header>

      <div className="vf-kpis">
        <section className="vf-kpi"><h3>Potenzialità finale</h3><strong data-testid="vfb-score">{score}</strong></section>
        <section className="vf-kpi"><h3>Concorrenza</h3><strong data-testid="vfb-competition">{competitionLevel}</strong></section>
        <section className="vf-kpi"><h3>Bacino potenziale</h3><strong data-testid="vfb-households">{fmt(targetPotential.households)} famiglie</strong></section>
      </div>

      <section className="vf-panel"><h3>1. Sintesi esecutiva</h3><p>{narrative.executiveSummary}</p></section>

      <section className="vf-panel">
        <h3>2. Area analizzata</h3>
        <p>{inputs.location} · raggio {analysis.radiusKm} km · attività: {inputs.businessType} ({inputs.businessStatus === 'existing' ? 'già esistente' : 'nuova apertura'})</p>
        <p>Cliente target dichiarato: {inputs.targetCustomer}. Prezzo medio: {inputs.averagePrice ? `${inputs.averagePrice} €` : NOT_AVAILABLE}.</p>
      </section>

      <section className="vf-panel">
        <h3>3. Bacino di clientela potenziale</h3>
        <p>Bacino potenziale stimato (dato territoriale, non domanda garantita):</p>
        <dl className="vf-metrics">
          <div><dt>Famiglie nell'area</dt><dd data-testid="vfb-hh">{fmt(targetPotential.households)}</dd></div>
          <div><dt>Popolazione nell'area</dt><dd data-testid="vfb-pop">{fmt(targetPotential.population)}</dd></div>
        </dl>
        {!targetPotential.available && <p className="vf-small">Dato ISTAT non disponibile per questa località: prova con il nome di un comune più preciso.</p>}
        <p className="vf-small">Questo è il potenziale territoriale dell'area, non una previsione di clienti reali.</p>
      </section>

      <section className="vf-panel">
        <h3>4. Concorrenza</h3>
        <p>Livello di concorrenza: <strong>{competitionLevel}</strong>{competitorCount != null && ` · ${competitorCount} attività rilevanti nel raggio`}{nearestCompetitorKm != null && ` · la più vicina a ${nearestCompetitorKm} km`}.</p>
        {competitors.length > 0 ? (
          <ul>{competitors.slice(0, 6).map(c => <li key={c.id}>{c.name} — {c.category} ({c.distanceKm} km)</li>)}</ul>
        ) : <p className="vf-small">{competitorCount === null ? NOT_AVAILABLE : 'Nessun concorrente diretto rilevato nel raggio analizzato.'}</p>}
        <p>{narrative.whyCompetitionHigh}</p>
      </section>

      <section className="vf-panel">
        <h3>5. Punti di interesse rilevanti</h3>
        {complementaryPois.length > 0 ? (
          <ul>{complementaryPois.slice(0, 8).map(p => <li key={p.id}>{p.name} — {p.category} ({p.distanceKm} km)</li>)}</ul>
        ) : <p className="vf-small">Nessun punto di interesse complementare rilevato nel raggio analizzato.</p>}
      </section>

      <section className="vf-panel"><h3>6. Punti di forza</h3><p>{narrative.positioning}</p></section>

      <section className="vf-panel">
        <h3>7. Rischi</h3>
        <ul>{narrative.riskFactors.map((risk, i) => <li key={i}>{risk}</li>)}</ul>
      </section>

      <section className="vf-panel"><h3>8. Opportunità</h3><p>{narrative.whyPromising}</p></section>

      <section className="vf-panel">
        <h3>9. Fattibilità finale</h3>
        <strong data-testid="vfb-final-score">{score}</strong>
        <p className="vf-small">Il punteggio combina bacino demografico, livello di concorrenza e contesto di punti di interesse — solo sui fattori realmente disponibili ({analysis.factorsUsed}/{analysis.factorsPossible}). Nessun voto è stato inventato.</p>
      </section>

      <section className="vf-panel">
        <h3>10. Raccomandazioni pratiche</h3>
        <ul>{recommendations.map((rec, i) => <li key={i}>{rec}</li>)}</ul>
      </section>

      <section className="vf-panel">
        <h3>11. Prossima azione consigliata</h3>
        <p>{narrative.recommendedAction}</p>
        <p className="vf-small">L'acquisto di una campagna di distribuzione non è obbligatorio: questa è un'analisi indipendente.</p>
        {onCta && (
          <div className="vf-actions vf-no-print">
            <button type="button" onClick={() => onCta('quote')}>Calcola preventivo</button>
            <button type="button" onClick={() => onCta('coverage')}>Analizza copertura</button>
            <button type="button" className="vf-primary" onClick={() => onCta('campaign')}>Avvia campagna</button>
            <button type="button" onClick={() => onCta('consultant')}>Parla con un consulente</button>
          </div>
        )}
      </section>
    </article>
  );
}
