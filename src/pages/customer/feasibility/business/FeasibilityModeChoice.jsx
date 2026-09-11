import React from 'react';

// Scelta esplicita del modo di analisi (§1). Nessuna inferenza da campi
// mancanti: l'utente sceglie, lo stato feasibilityMode viene salvato così
// com'è (business|campaign) e guida l'intero flusso successivo.
export default function FeasibilityModeChoice({ onChoose }) {
  return (
    <section className="vf-panel" aria-labelledby="vf-mode-title">
      <span className="vf-eyebrow">VolantiniPro · Studio di Fattibilità AI</span>
      <h1 id="vf-mode-title">Cosa vuoi analizzare?</h1>
      <div className="vf-form-grid" role="group" aria-label="Scegli il tipo di analisi">
        <button
          type="button"
          className="vf-mode-card"
          data-testid="vf-mode-business"
          onClick={() => onChoose('business')}
        >
          <h2>Fattibilità della mia attività</h2>
          <p>Valuta il potenziale della zona, la concorrenza, il pubblico e le opportunità per la tua attività.</p>
        </button>
        <button
          type="button"
          className="vf-mode-card"
          data-testid="vf-mode-campaign"
          onClick={() => onChoose('campaign')}
        >
          <h2>Fattibilità di una campagna pubblicitaria</h2>
          <p>Valuta investimento, punto di pareggio e risultati possibili della campagna.</p>
        </button>
      </div>
    </section>
  );
}
