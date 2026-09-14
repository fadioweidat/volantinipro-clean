import React from 'react';
import ProcessIcon from './ProcessIcon.jsx';
import './process-feasibility.css';

const STEPS = [
  { n: '01', icon: 'document', title: 'Configura', desc: 'Servizio, comune, quantità e formato.', badge: 'SERVIZIO + QUANTITÀ' },
  { n: '02', icon: 'pin', title: 'Analizza il territorio', desc: 'Copertura, famiglie, zone e mappa reale.', badge: 'ANALISI TERRITORIALE' },
  { n: '03', icon: 'sliders', title: 'Personalizza', desc: 'Piano, servizi ed extra opzionali.', badge: 'PIANO + EXTRA' },
  { n: '04', icon: 'euro', title: 'Preventivo', desc: 'Prezzo finale, PDF e avvio campagna.', badge: 'RIEPILOGO + PREZZO' },
];

export default function HowItWorksSection({ onConfigure }) {
  return <section id="come-funziona" className="vpp-section vpp-process" aria-labelledby="vpp-process-title">
    <div className="vpp-paper-scene" aria-hidden="true"><div className="vpp-paper"><span>La tua<br />attività<br />più vicina<br />alle persone.</span><i /><small>➤ VolantiniPro</small></div></div>
    <div className="vpp-inner">
      <header className="vpp-process-heading"><p className="vpp-eyebrow">DALL'IDEA AL VOLANTINO IN MANO</p><h2 id="vpp-process-title">Dall'idea alla campagna<br className="vpp-desktop-break" /> in 4 step misurabili.</h2><p className="vpp-lead">Un flusso unico per definire servizio, zona, date operative e preventivo finale.</p></header>
      <ol className="vpp-steps">{STEPS.map(step => <li className="vpp-step" key={step.n}>
        <div className="vpp-step-icon"><ProcessIcon name={step.icon} /><span>{step.n}</span></div>
        <h3>{step.title}</h3><p>{step.desc}</p><span className="vpp-badge">{step.badge}</span>
      </li>)}</ol>
      <div className="vpp-process-action"><button type="button" className="vpp-cta" onClick={() => onConfigure?.()}>Configura la tua campagna <span aria-hidden="true">→</span></button>
        <ul className="vpp-trust"><li><ProcessIcon name="shield" />Semplice e veloce</li><li><ProcessIcon name="chart" />Dati reali e aggiornati</li><li><ProcessIcon name="people" />Risultati misurabili</li></ul>
      </div>
      <span className="vpp-side-note" aria-hidden="true">TERRITORIO<br />STRATEGIA<br />RISULTATI<br />REALI</span><span className="vpp-hand-note" aria-hidden="true">Dall'idea<br />ai risultati<br />nel tuo territorio.</span>
    </div>
  </section>;
}
