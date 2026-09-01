// Studio Mappa — lista operatori N (reali importati o virtuali). Aggiungi /
// rimuovi / rinomina / colore / visibile / lock / "solo questo".
import { btn, input, panel, panelTitle, smallBtn } from './mapStudioStyles.js';
import { STUDIO_OPERATOR_PALETTE } from './mapStudioProject.js';

export function OperatorsPanel({ project, ops, drawing, soloOperatorId, setSoloOperatorId }) {
  const { operators } = project;
  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={panelTitle}>Operatori ({operators.length})</p>
        <button type="button" onClick={() => ops.addOperator({})} style={smallBtn}>+ Operatore</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {operators.map((op, i) => {
          const active = drawing.activeOperatorId === op.id;
          const solo = soloOperatorId === op.id;
          return (
            <div key={op.id} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: 8, background: active ? 'rgba(37,99,235,.12)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: op.color, border: '1px solid rgba(255,255,255,.3)', flex: '0 0 auto' }} />
                <input
                  style={{ ...input, padding: '4px 6px' }}
                  value={op.name}
                  onChange={(e) => ops.updateOperator(op.id, { name: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {STUDIO_OPERATOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`colore ${c}`}
                    onClick={() => ops.updateOperator(op.id, { color: c })}
                    style={{ width: 16, height: 16, borderRadius: 4, background: c, border: op.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,.25)', cursor: 'pointer' }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                <button type="button" onClick={() => drawing.setActiveOperatorId(op.id)} style={smallBtn}>{active ? 'In disegno ✓' : 'Disegna con'}</button>
                <button type="button" onClick={() => ops.updateOperator(op.id, { visible: !op.visible })} style={smallBtn}>{op.visible ? 'Visibile' : 'Nascosto'}</button>
                <button type="button" onClick={() => ops.updateOperator(op.id, { locked: !op.locked })} style={smallBtn}>{op.locked ? 'Locked' : 'Unlocked'}</button>
                <button type="button" onClick={() => setSoloOperatorId(solo ? null : op.id)} style={{ ...smallBtn, borderColor: solo ? '#2563eb' : undefined }}>{solo ? 'Solo ✓' : 'Solo'}</button>
                {operators.length > 1 && (
                  <button type="button" onClick={() => ops.removeOperator(op.id)} style={{ ...smallBtn, borderColor: '#dc2626', color: '#fca5a5' }}>Rimuovi</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" onClick={() => setSoloOperatorId(null)} style={btn(false)}>Mostra tutti</button>
        <button type="button" onClick={ops.reassignColors} style={btn(false)}>Ricolora</button>
      </div>
    </div>
  );
}
