import React from 'react';
import '../../components/feasibility/feasibility.css';

export default function FeasibilityPage({ onNav }) {
  return <main className="vp-feasibility vp-feasibility-page">
    <div className="vp-feasibility-inner">
      <span className="vp-feasibility-kicker">Servizio opzionale · in preparazione</span>
      <h1>Analisi Convenienza Campagna</h1>
      <p>Questa funzione ti aiuterà a valutare break-even, ROI e scenari economici della tua campagna.</p>
      <p>Potrai capire quanti clienti servono per recuperare il costo, confrontare diverse ipotesi e valutare i rischi prima di decidere. Le stime dipenderanno dai dati forniti e dalle ipotesi dichiarate.</p>
      <p>L'analisi non è ancora acquistabile. Il prezzo sarà mostrato prima dell'acquisto. Puoi proseguire con il tuo preventivo.</p>
      <div className="vp-feasibility-actions">
        <button type="button" className="vp-feasibility-cta" onClick={() => onNav('step4')}>Torna al preventivo</button>
        <button type="button" className="vp-feasibility-cta vp-feasibility-secondary" onClick={() => onNav('dashboard')}>Dashboard</button>
      </div>
    </div>
  </main>;
}
