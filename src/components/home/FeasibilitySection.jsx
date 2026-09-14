import React from 'react';
import { openFeasibility } from '../../lib/feasibility/entryPoint.js';
import ProcessIcon from './ProcessIcon.jsx';
import './process-feasibility.css';

const BUSINESS_BULLETS = ['Bacino potenziale', 'Concorrenza nella zona', 'POI e contesto territoriale', 'Punti di forza e criticità', 'Valutazione finale'];
const CAMPAIGN_BULLETS = ['Break-even', 'Clienti necessari per rientrare', 'Scenario prudente / realistico / crescita', 'Margine e sostenibilità', 'Rischi e raccomandazioni'];

export default function FeasibilitySection({ onConfigure } = {}) {
  return <section className="vpp-section vpp-feasibility" aria-labelledby="feasibility-home-title">
    <div className="vpp-inner">
      <header><p className="vpp-eyebrow">STUDIO DI FATTIBILITÀ AI</p><h2 id="feasibility-home-title">Due analisi diverse, in base a ciò che vuoi decidere.</h2><p className="vpp-lead">Puoi analizzare direttamente il potenziale della tua attività oppure configurare una campagna e verificarne la sostenibilità economica utilizzando quantità, territorio e costo reali.</p></header>
      <div className="vpp-analysis-grid">
        <article className="vpp-analysis-card vpp-business" aria-labelledby="feasibility-business-title">
          <div className="vpp-card-art" aria-hidden="true"><div className="vpp-target"><ProcessIcon name="pin" /></div></div>
          <div className="vpp-card-label"><span className="vpp-card-icon"><ProcessIcon name="shop" /></span><span className="vpp-badge">ANALISI TERRITORIALE</span></div>
          <h3 id="feasibility-business-title">Fattibilità della mia attività</h3><p className="vpp-card-subtitle">Scopri se una zona è adatta alla tua attività.</p>
          <p className="vpp-card-copy">Analizziamo territorio, pubblico potenziale, concorrenza, attività vicine, opportunità e rischi.</p>
          <ul className="vpp-bullets">{BUSINESS_BULLETS.map(b => <li key={b}>{b}</li>)}</ul>
          <div className="vpp-card-action"><button className="vpp-cta" type="button" onClick={() => openFeasibility(null, window, 'business')}>Analizza la tua attività <span aria-hidden="true">→</span></button><span className="vpp-card-note" aria-hidden="true">CONOSCI<br />IL TUO POTENZIALE</span></div>
        </article>
        <article className="vpp-analysis-card vpp-campaign" aria-labelledby="feasibility-campaign-title">
          <div className="vpp-card-art" aria-hidden="true"><div className="vpp-bars"><i /><i /><i /></div></div>
          <div className="vpp-card-label"><span className="vpp-card-icon"><ProcessIcon name="chart" /></span><span className="vpp-badge">ANALISI ECONOMICA</span></div>
          <h3 id="feasibility-campaign-title">Fattibilità della campagna pubblicitaria</h3><p className="vpp-card-subtitle">Scopri se il tuo investimento può essere sostenibile.</p>
          <p className="vpp-card-copy">Confrontiamo costo, margine, clienti necessari, punto di pareggio e scenari possibili.</p>
          <ul className="vpp-bullets">{CAMPAIGN_BULLETS.map(b => <li key={b}>{b}</li>)}</ul>
          <div className="vpp-card-action"><div><button className="vpp-cta" type="button" onClick={() => (onConfigure ? onConfigure() : (window.location.href = '/preventivo'))}>Configura e analizza la campagna <span aria-hidden="true">→</span></button><p className="vpp-helper"><ProcessIcon name="info" />Configura prima la campagna: useremo automaticamente quantità, area e costo del preventivo nell’analisi.</p></div><span className="vpp-card-note" aria-hidden="true">INVESTI<br />CON PIÙ CERTEZZE</span></div>
        </article>
      </div>
      <p className="vpp-footnote"><ProcessIcon name="data" /><span>Analisi basata sui dati realmente disponibili e sulle informazioni che fornisci. Le stime non garantiscono risultati.</span><span className="vpp-signature" aria-hidden="true"><b>➤</b> VolantiniPro</span></p>
    </div>
  </section>;
}
