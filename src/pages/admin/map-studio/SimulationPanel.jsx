// Studio Mappa — SIMULAZIONE PERCORSO.
//
// FASE 1: solo architettura / placeholder (decisione esplicita: "NON
// implementare ancora il motore Play/Pause completo"). I controlli sono
// visibili ma disattivati; il modulo mapStudioSimulation.js contiene gia' la
// logica di interpolazione pura, pronta da cablare in FASE 2. NESSUNA
// scrittura GPS, NESSUNA delivery_session, NESSUN impatto su Driver.
import { btn, panel, panelTitle } from './mapStudioStyles.js';

export function SimulationPanel({ project }) {
  return (
    <div style={{ ...panel, opacity: 0.75 }}>
      <p style={panelTitle}>Simula operatore — FASE 2</p>
      <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', margin: '0 0 8px' }}>
        Anteprima visiva della progressione lungo la rete. Non scrive dati GPS reali.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['Play', 'Pausa', 'Stop', 'Restart'].map((l) => (
          <button key={l} type="button" disabled style={{ ...btn(false), opacity: 0.4, cursor: 'not-allowed' }}>{l}</button>
        ))}
      </div>
      <select disabled style={{ marginTop: 8, opacity: 0.4, width: '100%' }}>
        {project.operators.map((o) => <option key={o.id}>{o.name}</option>)}
      </select>
      <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', marginTop: 6 }}>
        Motore in mapStudioSimulation.js (interpolazione pura) — cablaggio UI in FASE 2.
      </p>
    </div>
  );
}
