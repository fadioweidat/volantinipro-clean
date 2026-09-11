import React from 'react';
import { openFeasibility } from '../../lib/feasibility/entryPoint.js';
import '../feasibility/feasibility.css';

const BUSINESS_BULLETS = ['Bacino potenziale', 'Concorrenza nella zona', 'POI e contesto territoriale', 'Punti di forza e criticità', 'Valutazione finale'];
const CAMPAIGN_BULLETS = ['Break-even', 'Clienti necessari per rientrare', 'Scenario prudente / realistico / crescita', 'Margine e sostenibilità', 'Rischi e raccomandazioni'];

// `onConfigure` (ticket "HOMEPAGE FEASIBILITY ENTRY FLOW CLEANUP"): stessa
// funzione già usata da ogni altra sezione della homepage (Hero, Servizi,
// ecc.) per avviare la configurazione campagna — qui la card Campagna la
// riusa invece di aprire il flusso standalone di Fattibilità Campagna, che
// resta raggiungibile SOLO da un preventivo/campagna reale (Step4,
// dashboard cliente): un'analisi di convenienza campagna senza servizio/
// quantità/zona configurati parte da una pagina vuota e confonde l'utente.
export default function FeasibilitySection({ onConfigure } = {}) {
  return <section className="vp-feasibility vp-feasibility-home" aria-labelledby="feasibility-home-title">
    <div className="vp-feasibility-inner">
      <span className="vp-feasibility-kicker">Studio di Fattibilità AI</span>
      <h2 id="feasibility-home-title">Due analisi diverse, in base a ciò che vuoi decidere.</h2>
      <p>Puoi analizzare direttamente il potenziale della tua attività oppure configurare una campagna e verificarne la sostenibilità economica utilizzando quantità, territorio e costo reali.</p>
      <div className="vp-feasibility-dual-grid">
        <article className="vp-feasibility-dual-card" aria-labelledby="feasibility-business-title">
          <h3 id="feasibility-business-title">Fattibilità della mia attività</h3>
          <p className="vp-feasibility-dual-subtitle">Scopri se una zona è adatta alla tua attività.</p>
          <p>Analizziamo territorio, pubblico potenziale, concorrenza, attività vicine, opportunità e rischi.</p>
          <ul className="vp-feasibility-dual-bullets">{BUSINESS_BULLETS.map(b => <li key={b}>{b}</li>)}</ul>
          <button className="vp-feasibility-cta" type="button" onClick={() => openFeasibility(null, window, 'business')}>Analizza la tua attività</button>
        </article>
        <article className="vp-feasibility-dual-card" aria-labelledby="feasibility-campaign-title">
          <h3 id="feasibility-campaign-title">Fattibilità della campagna pubblicitaria</h3>
          <p className="vp-feasibility-dual-subtitle">Scopri se il tuo investimento può essere sostenibile.</p>
          <p>Confrontiamo costo, margine, clienti necessari, punto di pareggio e scenari possibili.</p>
          <ul className="vp-feasibility-dual-bullets">{CAMPAIGN_BULLETS.map(b => <li key={b}>{b}</li>)}</ul>
          <button className="vp-feasibility-cta" type="button" onClick={() => (onConfigure ? onConfigure() : (window.location.href = '/preventivo'))}>Configura e analizza la campagna</button>
          <p className="vp-feasibility-dual-microcopy">Configura prima la campagna: useremo automaticamente quantità, area e costo del preventivo nell’analisi.</p>
        </article>
      </div>
      <p className="vp-feasibility-note">Analisi basata sui dati realmente disponibili e sulle informazioni che fornisci. Le stime non garantiscono risultati.</p>
    </div>
  </section>;
}
