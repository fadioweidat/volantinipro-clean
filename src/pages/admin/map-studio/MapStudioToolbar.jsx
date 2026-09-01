// Studio Mappa — toolbar strumenti manuali + undo/redo + azioni disegno.
import { TOOLS, SNAP_MODES } from './useMapStudioDrawing.js';
import { btn, chip, panel, panelTitle } from './mapStudioStyles.js';
import { formatDistance } from './mapStudioGeometry.js';

export function MapStudioToolbar({ drawing, history }) {
  const { tool, setTool, snapMode, setSnapMode, activeVertices, activeLengthM, lastSegmentM, actions } = drawing;
  return (
    <div style={panel}>
      <p style={panelTitle}>Strumenti</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {TOOLS.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTool(t.id); actions.cancelActive(); }} style={btn(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.5)' }}>Snapping</span>
        {SNAP_MODES.map((s) => (
          <button key={s.id} type="button" onClick={() => setSnapMode(s.id)} style={chip(snapMode === s.id)}>{s.label}</button>
        ))}
      </div>

      {(tool === 'line' || tool === 'polygon') && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={actions.closeShape} style={btn(false)}>Chiudi tratto</button>
          <button type="button" onClick={actions.undoLastPoint} style={btn(false)}>Annulla ultimo punto</button>
          <button type="button" onClick={actions.cancelActive} style={btn(false)}>Annulla disegno</button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.75)' }}>
            {activeVertices.length} punti · segmento {formatDistance(lastSegmentM)} · totale {formatDistance(activeLengthM)}
          </span>
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" onClick={history.undo} disabled={!history.canUndo} style={{ ...btn(false), opacity: history.canUndo ? 1 : 0.4 }}>
          ↶ undo ({history.undoDepth})
        </button>
        <button type="button" onClick={history.redo} disabled={!history.canRedo} style={{ ...btn(false), opacity: history.canRedo ? 1 : 0.4 }}>
          redo ({history.redoDepth}) ↷
        </button>
      </div>
    </div>
  );
}
