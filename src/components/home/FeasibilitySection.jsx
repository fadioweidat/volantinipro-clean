import React from 'react';
import { openFeasibility } from '../../lib/feasibility/entryPoint.js';
import '../feasibility/feasibility.css';

export default function FeasibilitySection() {
  return <section className="vp-feasibility vp-feasibility-home" aria-labelledby="feasibility-home-title">
    <div className="vp-feasibility-inner">
      <span className="vp-feasibility-kicker">Analisi Convenienza Campagna</span>
      <h2 id="feasibility-home-title">Scopri se la tua campagna conviene davvero</h2>
      <p>Prima di distribuire, analizza la sostenibilità economica della campagna in base alla tua attività, al budget e all'area scelta.</p>
      <div className="vp-feasibility-grid">
        <article className="vp-feasibility-benefit"><h3>Break-even</h3><p>Scopri quanti nuovi clienti servono per recuperare il costo della campagna.</p></article>
        <article className="vp-feasibility-benefit"><h3>Scenari economici</h3><p>Confronta scenario prudente, realistico e crescita.</p></article>
        <article className="vp-feasibility-benefit"><h3>Report professionale</h3><p>Uno studio con stime di ROI, rischi, raccomandazioni e PDF.</p></article>
      </div>
      <button className="vp-feasibility-cta" type="button" onClick={() => openFeasibility()}>Analizza la tua campagna</button>
      <p className="vp-feasibility-note">Studio completo previsto come servizio opzionale, in preparazione. Prezzo mostrato prima dell'acquisto. Le stime non garantiscono risultati.</p>
    </div>
  </section>;
}
