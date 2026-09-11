import React from 'react';
import { NOT_AVAILABLE, PRELIMINARY } from './feasibilityBusinessSchemas.js';

const fmt = value => (value == null ? NOT_AVAILABLE : new Intl.NumberFormat('it-IT').format(Math.round(value)));

const SOURCE_LABEL = { real: 'Dato reale', user: 'Dato fornito da te', rule: 'Regola deterministica', unavailable: 'Non disponibile' };
function Source({ tag }) {
  return <small className="vf-source-tag">{SOURCE_LABEL[tag] || SOURCE_LABEL.unavailable}</small>;
}

// STEP 4 — Report finale Business Mode (ticket "PREMIUM FEASIBILITY REPORTS"
// §6): 14 sezioni + pagina "above the fold" + affidabilità dei dati + fonti,
// pensato per sembrare uno studio di mini-consulenza, non una calcolatrice.
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

  const { competitionLevel, competitorCount, competitors, complementaryPois, targetPotential, score, nearestCompetitorKm, poisAvailable, dataReliability, location } = analysis;
  const isPreliminary = score === PRELIMINARY;
  // Ticket "GEOCODING + ISTAT + POI CONSISTENCY" §8: quando la località è
  // stata risolta davvero, mostra l'indirizzo/comune/NIL REALI restituiti
  // dal geocoder — mai il testo grezzo digitato dall'utente quando esiste un
  // dato migliore. Nessuna modifica al layout esistente, solo ai valori.
  const resolvedAddress = location?.displayAddress || null;
  const resolvedCity = location?.city || null;
  const resolvedNil = location?.nilName || null;

  return (
    <article className="vf-report vf-business-report" aria-labelledby="vfb-report-title">
      <header className="vf-report-heading">
        <span className="vf-eyebrow">VolantiniPro · Studio di Fattibilità AI</span>
        <h1 id="vfb-report-title">Studio di Fattibilità AI — Attività e Territorio</h1>
        <p className="vf-report-subtitle">Analisi del potenziale territoriale, concorrenza e opportunità — {inputs.businessType || 'attività'} a {inputs.location || 'zona indicata'}</p>
        <p>Analisi basata su dati territoriali reali (ISTAT) e punti di interesse reali (OpenStreetMap). Nessun dato è stato inventato: dove manca una fonte, il report indica "{NOT_AVAILABLE}".</p>
        <div className="vf-actions vf-no-print">
          {onEdit && <button type="button" onClick={onEdit}>Modifica dati</button>}
          <button type="button" onClick={() => window.print()}>Stampa / Salva PDF</button>
        </div>
      </header>

      {/* Prima pagina / above the fold (§3): tutto ciò che serve a colpo d'occhio */}
      <section className="vf-panel vf-above-fold" aria-label="Sintesi in evidenza">
        <dl className="vf-metrics vf-above-fold-grid">
          <div><dt>Tipo di attività</dt><dd>{inputs.businessType || NOT_AVAILABLE}</dd></div>
          <div><dt>Località analizzata</dt><dd>{resolvedAddress || inputs.location || NOT_AVAILABLE}</dd></div>
          <div><dt>Raggio di analisi</dt><dd>{analysis.radiusKm} km</dd></div>
          <div><dt>Potenzialità finale</dt><dd data-testid="vfb-score"><strong>{score}</strong>{isPreliminary && <small className="vf-small"> — analisi incompleta</small>}</dd></div>
          <div><dt>Affidabilità dei dati</dt><dd data-testid="vfb-reliability"><strong>{dataReliability.level}</strong> <small className="vf-small">({dataReliability.factorsAvailable}/{dataReliability.factorsPossible} fonti)</small></dd></div>
          <div><dt>Bacino potenziale</dt><dd data-testid="vfb-households">{fmt(targetPotential.households)} famiglie</dd></div>
          <div><dt>Concorrenza</dt><dd data-testid="vfb-competition">{competitionLevel}</dd></div>
          <div><dt>POI rilevanti</dt><dd>{poisAvailable ? fmt((competitorCount || 0) + complementaryPois.length) : NOT_AVAILABLE}</dd></div>
          <div><dt>Opportunità principale</dt><dd>{narrative.strongestPositive}</dd></div>
          <div><dt>Rischio principale</dt><dd>{narrative.biggestRisk}</dd></div>
        </dl>
      </section>

      <div className="vf-kpis">
        <section className="vf-kpi"><h3>Potenzialità finale</h3><strong>{score}</strong></section>
        <section className="vf-kpi"><h3>Affidabilità dei dati</h3><strong data-testid="vfb-reliability-kpi">{dataReliability.level}</strong></section>
        <section className="vf-kpi"><h3>Concorrenza</h3><strong>{competitionLevel}</strong></section>
      </div>

      <section className="vf-panel"><h3>1. Sintesi esecutiva</h3><p>{narrative.executiveSummary}</p></section>

      <section className="vf-panel">
        <h3>2. Attività e obiettivo</h3>
        <p>Attività: <strong>{inputs.businessType || NOT_AVAILABLE}</strong> ({inputs.businessStatus === 'existing' ? 'già esistente' : 'nuova apertura'}). <Source tag="user" /></p>
        <p>Cliente target dichiarato: {inputs.targetCustomer || NOT_AVAILABLE}. Prezzo medio: {inputs.averagePrice ? `${inputs.averagePrice} €` : NOT_AVAILABLE}. <Source tag="user" /></p>
        <p>Obiettivo principale: {inputs.businessGoal || NOT_AVAILABLE}. <Source tag="user" /></p>
      </section>

      <section className="vf-panel">
        <h3>3. Area analizzata</h3>
        <p>{inputs.location || NOT_AVAILABLE} · raggio {analysis.radiusKm} km. <Source tag="user" /></p>
        {analysis.locationResolved ? (
          <dl className="vf-metrics">
            <div><dt>Indirizzo geocodificato</dt><dd>{resolvedAddress || NOT_AVAILABLE} <Source tag="real" /></dd></div>
            <div><dt>Comune</dt><dd>{resolvedCity || NOT_AVAILABLE} <Source tag="real" /></dd></div>
            <div><dt>NIL</dt><dd>{resolvedNil || NOT_AVAILABLE} <Source tag={resolvedNil ? 'real' : 'unavailable'} /></dd></div>
          </dl>
        ) : null}
        <p className="vf-small">{analysis.locationResolved ? 'Località geocodificata correttamente.' : 'Località non geocodificata: i dati territoriali potrebbero non essere disponibili.'}</p>
      </section>

      <section className="vf-panel">
        <h3>4. Dati territoriali</h3>
        {targetPotential.available ? (
          <dl className="vf-metrics">
            <div><dt>Famiglie nell'area</dt><dd>{fmt(targetPotential.households)} <Source tag="real" /></dd></div>
            <div><dt>Popolazione nell'area</dt><dd>{fmt(targetPotential.population)} <Source tag="real" /></dd></div>
          </dl>
        ) : (
          <p><strong>{NOT_AVAILABLE}</strong> <Source tag="unavailable" /></p>
        )}
        <p className="vf-small">Fonte: ISTAT. {!targetPotential.available && 'Il dato non era disponibile per questa località al momento dell\'analisi.'}</p>
      </section>

      <section className="vf-panel">
        <h3>5. Bacino di clientela potenziale</h3>
        <p>Bacino potenziale stimato (dato territoriale, non domanda garantita):</p>
        <dl className="vf-metrics">
          <div><dt>Famiglie nell'area</dt><dd data-testid="vfb-hh">{fmt(targetPotential.households)}</dd></div>
          <div><dt>Popolazione nell'area</dt><dd data-testid="vfb-pop">{fmt(targetPotential.population)}</dd></div>
        </dl>
        {!targetPotential.available && <p className="vf-small">Dato ISTAT non disponibile per questa località: prova con il nome di un comune più preciso.</p>}
        <p className="vf-small">Il bacino potenziale rappresenta il contesto territoriale, non una previsione garantita di clienti.</p>
      </section>

      <section className="vf-panel">
        <h3>6. Concorrenza</h3>
        {!poisAvailable ? (
          <>
            <p>Concorrenza: <strong>{NOT_AVAILABLE}</strong> <Source tag="unavailable" /></p>
            <p className="vf-small">Il provider di punti di interesse non era disponibile durante l'analisi.</p>
          </>
        ) : (
          <>
            <p>Livello di concorrenza: <strong>{competitionLevel}</strong>{competitorCount != null && ` · ${competitorCount} attività rilevanti nel raggio`}{nearestCompetitorKm != null && ` · la più vicina a ${nearestCompetitorKm} km`}. <Source tag="real" /></p>
            {competitors.length > 0 ? (
              <ul>{competitors.slice(0, 6).map(c => <li key={c.id}>{c.name} — {c.category} ({c.distanceKm} km)</li>)}</ul>
            ) : <p className="vf-small">{competitorCount === null ? `${NOT_AVAILABLE} (attività non mappata su categorie di concorrenza note).` : 'Nessun concorrente diretto rilevato nel raggio analizzato.'}</p>}
          </>
        )}
        <p>{narrative.whyCompetitionHigh}</p>
      </section>

      <section className="vf-panel">
        <h3>7. Punti di interesse rilevanti</h3>
        {!poisAvailable ? (
          <p><strong>{NOT_AVAILABLE}</strong> <Source tag="unavailable" /> <span className="vf-small">Il provider di punti di interesse non era disponibile durante l'analisi.</span></p>
        ) : complementaryPois.length > 0 ? (
          <ul>{complementaryPois.slice(0, 8).map(p => <li key={p.id}>{p.name} — {p.category} ({p.distanceKm} km)</li>)}</ul>
        ) : <p className="vf-small">Nessun punto di interesse complementare rilevato nel raggio analizzato.</p>}
      </section>

      <section className="vf-panel"><h3>8. Punti di forza</h3><p>{narrative.positioning}</p></section>

      <section className="vf-panel">
        <h3>9. Rischi</h3>
        <ul>{narrative.riskFactors.map((risk, i) => <li key={i}>{risk}</li>)}</ul>
      </section>

      <section className="vf-panel"><h3>10. Opportunità</h3><p>{narrative.whyPromising}</p></section>

      <section className="vf-panel">
        <h3>11. Valutazione finale di fattibilità</h3>
        <strong data-testid="vfb-final-score">{score}</strong>
        {isPreliminary && <p className="vf-small">Analisi incompleta: le fonti maggiori (ISTAT e/o punti di interesse) non erano disponibili. Questa non è una valutazione ALTA/MEDIA/BASSA normale.</p>}
        <p className="vf-small">Il punteggio combina bacino demografico, livello di concorrenza e contesto di punti di interesse — solo sui fattori realmente disponibili ({analysis.factorsUsed}/{analysis.factorsPossible}). Nessun voto è stato inventato. <Source tag="rule" /></p>
        <p className="vf-small">Affidabilità dei dati: <strong>{dataReliability.level}</strong>, basata su {dataReliability.factorsAvailable} fonti disponibili su {dataReliability.factorsPossible} ({dataReliability.factors.filter(f => f.available).map(f => f.name).join(', ') || 'nessuna'}). <Source tag="rule" /></p>
      </section>

      <section className="vf-panel">
        <h3>12. Raccomandazioni pratiche</h3>
        <ul>{recommendations.map((rec, i) => <li key={i}>{rec}</li>)}</ul>
      </section>

      <section className="vf-panel">
        <h3>13. Prossima azione consigliata</h3>
        <p>{narrative.recommendedAction}</p>
        <p className="vf-small">L'acquisto di una campagna di distribuzione non è obbligatorio: questa è un'analisi indipendente.</p>
        {onCta && (
          <div className="vf-actions vf-no-print">
            <button type="button" onClick={() => onCta('another_zone')}>Analizza un'altra zona</button>
            <button type="button" onClick={() => onCta('quote')}>Calcola un preventivo</button>
            <button type="button" onClick={() => onCta('coverage')}>Analizza copertura</button>
            <button type="button" className="vf-primary" onClick={() => onCta('campaign')}>Avvia campagna</button>
            <button type="button" onClick={() => onCta('consultant')}>Parla con un consulente</button>
          </div>
        )}
      </section>

      <section className="vf-panel">
        <h3>14. Fonti dei dati e ipotesi</h3>
        <dl className="vf-sources">
          <div><dt>Tipo di attività, località, stato, cliente target, prezzo, obiettivo</dt><dd>Dati inseriti dal cliente<Source tag="user" /></dd></div>
          <div><dt>Popolazione / famiglie</dt><dd>{targetPotential.available ? 'ISTAT' : NOT_AVAILABLE}<Source tag={targetPotential.available ? 'real' : 'unavailable'} /></dd></div>
          <div><dt>Punti di interesse e concorrenza</dt><dd>{poisAvailable ? 'OpenStreetMap / provider POI' : NOT_AVAILABLE}<Source tag={poisAvailable ? 'real' : 'unavailable'} /></dd></div>
          <div><dt>Coordinate della località</dt><dd>{analysis.locationResolved ? 'Geocoding interno' : NOT_AVAILABLE}<Source tag={analysis.locationResolved ? 'real' : 'unavailable'} /></dd></div>
          <div><dt>Potenzialità finale e affidabilità dei dati</dt><dd>Regola deterministica basata sui fattori disponibili<Source tag="rule" /></dd></div>
        </dl>
        <p className="vf-small">Nessuna stima statistica di domanda è stata generata: dove manca una fonte reale, il report lo indica esplicitamente invece di stimare un valore.</p>
      </section>
      <div className="vf-print-footer"><span>VolantiniPro · Studio di Fattibilità AI — Attività e Territorio</span><span>{inputs.businessType || 'Attività'} · {inputs.location || 'Zona'}</span></div>
    </article>
  );
}
