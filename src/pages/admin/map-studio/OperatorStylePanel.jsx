// Studio Mappa — "Design operatore": stile linea/punto per l'operatore
// selezionato (in disegno). Colori/stili stabili dopo save/reload perche'
// persistiti nel progetto.
import { panel, panelTitle, chip } from './mapStudioStyles.js';

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

export function OperatorStylePanel({ project, ops, drawing }) {
  const op = project.operators.find((o) => o.id === drawing.activeOperatorId) || project.operators[0];
  if (!op) return null;
  const st = op.style;
  const set = (patch) => ops.updateOperator(op.id, { style: patch });

  return (
    <div style={panel}>
      <p style={panelTitle}>Design operatore — {op.name}</p>

      <Row label="Spessore linea">
        {[1, 2, 3, 4, 6, 8].map((w) => (
          <button key={w} type="button" onClick={() => set({ lineWidth: w })} style={chip(st.lineWidth === w)}>{w}</button>
        ))}
      </Row>

      <Row label="Stile linea">
        <button type="button" onClick={() => set({ lineStyle: 'solid' })} style={chip(st.lineStyle === 'solid')}>continua</button>
        <button type="button" onClick={() => set({ lineStyle: 'dash' })} style={chip(st.lineStyle === 'dash')}>tratteggiata</button>
      </Row>

      <Row label="Opacità">
        {[0.3, 0.5, 0.75, 1].map((o) => (
          <button key={o} type="button" onClick={() => set({ opacity: o })} style={chip(st.opacity === o)}>{Math.round(o * 100)}%</button>
        ))}
      </Row>

      <Row label="Dimensione punti">
        {[4, 6, 8, 10].map((p) => (
          <button key={p} type="button" onClick={() => set({ pointSize: p })} style={chip(st.pointSize === p)}>{p}</button>
        ))}
      </Row>

      <Row label="Marker">
        {['circle', 'square', 'diamond'].map((m) => (
          <button key={m} type="button" onClick={() => set({ markerStyle: m })} style={chip(st.markerStyle === m)}>{m}</button>
        ))}
      </Row>

      <Row label="Visibilità">
        <button type="button" onClick={() => ops.updateOperator(op.id, { visible: !op.visible })} style={chip(op.visible)}>
          {op.visible ? 'mostrato' : 'nascosto'}
        </button>
      </Row>
    </div>
  );
}
