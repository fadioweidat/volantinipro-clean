import React from 'react';
import ProcessIcon from './ProcessIcon.jsx';
import HomeQuoteCalculator from './HomeQuoteCalculator.jsx';

const BENEFITS = [
  ['data', 'Dati territoriali', 'Famiglie e indirizzi'],
  ['pin', 'Analisi GIS', 'Comuni, zone e quartieri'],
  ['chart', 'Quantità consigliata', 'In base al territorio'],
  ['euro', 'Eviti sprechi', 'Pianifichi il tuo investimento'],
];

export default function QuantityValueSection({ onConfigure }) {
  return <section className="vpq-section" aria-labelledby="vpq-title">
    <div className="vpq-inner">
      <div className="vpq-copy">
        <p className="vpq-eyebrow">IL TERRITORIO PRIMA DEI NUMERI</p>
        <h2 id="vpq-title">Non pagare volantini<br />che il territorio <em>non può assorbire</em></h2>
        <p className="vpq-description">Ogni Comune ha una capacità territoriale diversa. VolantiniPro analizza i dati disponibili su famiglie, indirizzi e territorio per mostrarti la quantità consigliata e aiutarti a evitare quantità sovrastimate.</p>
        <ul className="vpq-benefits">{BENEFITS.map(([icon, title, text]) => <li key={icon}><span className="vpq-icon"><ProcessIcon name={icon} /></span><strong>{title}</strong><span>{text}</span></li>)}</ul>
      </div>
      <HomeQuoteCalculator onConfigure={onConfigure} />
    </div>
  </section>;
}
