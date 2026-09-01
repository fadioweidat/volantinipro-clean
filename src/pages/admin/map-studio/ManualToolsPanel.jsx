// Studio Mappa — opzioni degli strumenti manuali: raggio gomma, azioni sulla
// feature selezionata (duplica / elimina / lock / cambia operatore).
import { btn, chip, panel, panelTitle } from './mapStudioStyles.js';
import { polylineLengthMeters, formatDistance } from './mapStudioGeometry.js';

export function ManualToolsPanel({ project, ops, drawing }) {
  const selected = project.features.find((f) => f.id === drawing.selectedFeatureId) || null;
  return (
    <div style={panel}>
      <p style={panelTitle}>Manuale</p>

      {drawing.tool === 'erase' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>Raggio gomma</span>
          {[10, 15, 20, 30, 45].map((r) => (
            <button key={r} type="button" onClick={() => drawing.setEraseRadiusM(r)} style={chip(drawing.eraseRadiusM === r)}>{r} m</button>
          ))}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>clic sul tratto per rimuovere solo la parte nel cerchio</span>
        </div>
      )}

      {drawing.tool === 'join' && (
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', margin: '4px 0' }}>
          {drawing.joinFirstId ? 'Seleziona la seconda linea contigua da unire.' : 'Seleziona la prima linea da unire.'}
        </p>
      )}

      {drawing.tool === 'move' && (
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', margin: '4px 0' }}>
          Seleziona una linea, poi trascina un vertice. Tasto destro sul vertice = elimina.
        </p>
      )}
      {drawing.tool === 'split' && (
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', margin: '4px 0' }}>
          Clic sul tratto per dividerlo nel punto, oppure seleziona una linea e clic su un vertice.
        </p>
      )}

      <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 8, marginTop: 8 }}>
        <p style={{ ...panelTitle, marginBottom: 4 }}>Elemento selezionato</p>
        {!selected && <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>Nessuno. Usa "Seleziona".</span>}
        {selected && (
          <div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.75)' }}>
              {selected.type} · {selected.source} · {selected.type === 'point' ? '1 punto' : `${selected.geometry.length} punti`}
              {selected.type === 'line' && ` · ${formatDistance(polylineLengthMeters(selected.geometry))}`}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {project.operators.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => ops.updateFeature(selected.id, { operatorId: op.id }, 'operator', 'Cambia operatore')}
                  style={{ ...chip(selected.operatorId === op.id), borderColor: op.color }}
                >
                  {op.name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              <button type="button" onClick={() => ops.duplicateFeature(selected.id)} style={btn(false)}>Duplica</button>
              <button type="button" onClick={() => ops.toggleFeatureLock(selected.id)} style={btn(false)}>{selected.locked ? 'Unlock' : 'Lock'}</button>
              <button type="button" onClick={() => { ops.removeFeature(selected.id); drawing.setSelectedFeatureId(null); }} style={{ ...btn(false), borderColor: '#dc2626', color: '#fca5a5' }}>Elimina</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 8, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => ops.clearFeatures((f) => f.source === 'auto')} style={btn(false)}>Svuota automatico</button>
        <button type="button" onClick={() => ops.clearFeatures()} style={{ ...btn(false), borderColor: '#dc2626', color: '#fca5a5' }}>Svuota tutto</button>
      </div>
    </div>
  );
}
