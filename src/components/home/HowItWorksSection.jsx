import React from 'react';
import ProcessIcon from './ProcessIcon.jsx';
import './process-feasibility.css';

const STEPS = [
  { n: '1', icon: 'pin', title: 'Scegli il territorio', desc: 'Comuni e area sulla mappa.', badge: 'TERRITORIO' },
  { n: '2', icon: 'euro', title: 'Ottieni il preventivo', desc: 'Quantità, servizi e prezzo online.', badge: 'PREVENTIVO' },
  { n: '3', icon: 'document', title: 'Conferma l’ordine', desc: 'Confermi la tua campagna.', badge: 'ORDINE' },
  { n: '4', icon: 'shop', title: 'Distribuzione sul campo', desc: 'Consegna nelle zone assegnate.', badge: 'DISTRIBUZIONE' },
  { n: '5', icon: 'shield', title: 'Verifica GPS e report', desc: 'Percorso, foto e report per zona.', badge: 'PROVA DEL LAVORO' },
];

export default function HowItWorksSection({ onConfigure }) {
  return <section id="come-funziona" className="vpp-section vpp-process vpq-process" aria-labelledby="vpp-process-title">
    <div className="vpp-paper-scene" aria-hidden="true"><div className="vpp-paper"><span>La tua<br />attività<br />più vicina<br />alle persone.</span><i /><small>➤ VolantiniPro</small></div></div>
    <div className="vpp-inner">
      <header className="vpp-process-heading"><p className="vpp-eyebrow">DAL TERRITORIO AL REPORT</p><h2 id="vpp-process-title">Come funziona VolantiniPro</h2><p className="vpp-lead">Dal preventivo alla verifica, tutto in cinque semplici passaggi.</p></header>
      <ol className="vpp-steps">{STEPS.map(step => <li className="vpp-step" key={step.n}>
        <div className="vpp-step-icon"><ProcessIcon name={step.icon} /><span>{step.n}</span></div>
        <h3>{step.title}</h3><p>{step.desc}</p><span className="vpp-badge">{step.badge}</span>
      </li>)}</ol>
      <div className="vpp-process-action"><button type="button" className="vpp-cta" onClick={() => onConfigure?.()}>Calcola il preventivo online <span aria-hidden="true">→</span></button>
        <ul className="vpp-trust"><li><ProcessIcon name="shield" />Semplice e veloce</li><li><ProcessIcon name="chart" />Dati reali e aggiornati</li><li><ProcessIcon name="people" />Risultati misurabili</li></ul>
      </div>
      <span className="vpp-side-note" aria-hidden="true">TERRITORIO<br />STRATEGIA<br />RISULTATI<br />REALI</span><span className="vpp-hand-note" aria-hidden="true">Dall'idea<br />ai risultati<br />nel tuo territorio.</span>
    </div>
  </section>;
}
