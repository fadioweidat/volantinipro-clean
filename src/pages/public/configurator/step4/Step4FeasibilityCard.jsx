import React from 'react';
import { openFeasibility } from '../../../../lib/feasibility/entryPoint.js';
import '../../../../components/feasibility/feasibility.css';

export default function Step4FeasibilityCard({ context }) {
  return <section className="vp-feasibility vp-feasibility-card" aria-labelledby="feasibility-step4-title">
    <h2 id="feasibility-step4-title">Vuoi sapere se questa campagna può essere conveniente per la tua attività?</h2>
    <p>VolantiniPro può analizzare il costo della campagna, il valore medio dei tuoi clienti e gli obiettivi commerciali per stimare break-even, ROI e scenari.</p>
    <button type="button" className="vp-feasibility-cta" onClick={() => openFeasibility(context)}>Analizza la convenienza</button>
    <p className="vp-feasibility-note">Opzionale — non modifica il tuo preventivo. Servizio in preparazione.</p>
  </section>;
}
