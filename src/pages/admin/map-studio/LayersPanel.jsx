// Studio Mappa — controllo layer: show/hide + opacity.
import { panel, panelTitle } from './mapStudioStyles.js';

const LAYER_LABELS = {
  boundary: 'Confine comune',
  network: 'Rete stradale',
  auto: 'Copertura automatica',
  manual: 'Copertura manuale',
  operators: 'Operatori',
  points: 'Punti / vertici',
  labels: 'Etichette',
  importedGps: 'GPS importato (read-only)',
};

export function LayersPanel({ project, ops }) {
  return (
    <div style={panel}>
      <p style={panelTitle}>Layer</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.keys(LAYER_LABELS).map((key) => {
          const layer = project.layers[key];
          if (!layer) return null;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, flex: 1, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={(e) => ops.setLayer(key, { visible: e.target.checked })}
                />
                {LAYER_LABELS[key]}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={layer.opacity}
                onChange={(e) => ops.setLayer(key, { opacity: Number(e.target.value) })}
                style={{ width: 90 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
