import React from 'react';
import ProcessIcon from './ProcessIcon.jsx';

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
      <article className="vpq-example" aria-labelledby="vpq-example-title">
        <div className="vpq-example-heading"><h3 id="vpq-example-title">Calcola ora il tuo preventivo</h3><span className="vpq-example-tag">Esempio</span></div>
        <ol className="vpq-example-steps" aria-label="Percorso nel configuratore"><li><b>1</b> Territorio</li><li><b>2</b> Quantità e servizi</li><li><b>3</b> Preventivo</li></ol>
        <div className="vpq-place"><ProcessIcon name="pin" /><div><small>Comune di esempio</small><strong>Cormano (MI)</strong></div><span aria-hidden="true">↗</span></div>
        <div className="vpq-metrics">
          <div><span>Famiglie</span><ProcessIcon name="people" /><strong>9.297</strong><small>Valore dimostrativo</small></div>
          <div><span>Quantità consigliata</span><ProcessIcon name="document" /><strong>Da analizzare</strong><small>Nel configuratore</small></div>
          <div><span>Copertura prevista</span><ProcessIcon name="chart" /><strong>Da verificare</strong><small>In base all’area scelta</small></div>
        </div>
        <p className="vpq-example-note">Dati d’esempio. Quantità e copertura si verificano nel configuratore.</p>
        <p className="vpq-info"><ProcessIcon name="info" /><span>Se la quantità supera la capacità stimata della zona, puoi ampliare il territorio o aggiungere altri Comuni.</span></p>
        <button type="button" className="vpq-cta" onClick={() => onConfigure?.()}>Calcola il preventivo online <span aria-hidden="true">→</span></button>
        <p className="vpq-next">Scegli servizio e territorio e scopri il tuo preventivo.</p>
      </article>
    </div>
  </section>;
}
