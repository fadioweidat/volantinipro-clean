const fs = require('fs');

let c = fs.readFileSync('src/components/Step2Map.jsx', 'utf8');

const layerPanelOld = `            const meta = LAYER_META[layer.id] || { color: '#5B7FA6', icon: '○' };
            const civiciDisabled = layer.id === 'civici' && !civiciAvailable;
            const isOn = civiciDisabled ? false : (activeLayers?.[layer.id] ?? layer.defaultOn ?? false);
            const active = isOn && !layer.future && !civiciDisabled;
            const settoriNoData = layer.id === 'settori' && !layer.future && isOn
              && (!settori || settori.length === 0);
            const civiciTag = layer.id === 'civici'`;

const layerPanelNew = `            const meta = LAYER_META[layer.id] || { color: '#5B7FA6', icon: '○' };
            const civiciDisabled = layer.id === 'civici' && !civiciAvailable;
            const settoriDisabled = layer.id === 'settori' && !settori;
            const isDisabled = civiciDisabled || settoriDisabled;
            const isOn = isDisabled ? false : (activeLayers?.[layer.id] ?? layer.defaultOn ?? false);
            const active = isOn && !layer.future && !isDisabled;
            const settoriNoData = layer.id === 'settori' && !layer.future && (isOn || settoriDisabled)
              && (!settori || settori.length === 0);
            const civiciTag = layer.id === 'civici'`;

c = c.replace(layerPanelOld, layerPanelNew);

const onclickOld = `                onClick={!layer.future && !civiciDisabled ? () => onToggle?.(layer.id) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  cursor: layer.future || civiciDisabled ? 'default' : 'pointer',
                  opacity: layer.future ? 0.32 : (civiciDisabled ? 0.45 : 1),
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!layer.future && !civiciDisabled) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}`;

const onclickNew = `                onClick={!layer.future && !isDisabled ? () => onToggle?.(layer.id) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  cursor: layer.future || isDisabled ? 'default' : 'pointer',
                  opacity: layer.future ? 0.32 : (isDisabled ? 0.45 : 1),
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!layer.future && !isDisabled) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}`;

c = c.replace(onclickOld, onclickNew);

fs.writeFileSync('src/components/Step2Map.jsx', c);
console.log("Patched Step2Map.jsx for disabled sectors");
