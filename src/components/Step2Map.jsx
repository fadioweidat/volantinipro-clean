import React, { useEffect, useRef, useState } from 'react';

const debugStep2 = (...args) => {
  if (import.meta.env.DEV && (import.meta.env.VITE_DEBUG_STEP2 === 'true' || window.__VOLANTINIPRO_DEBUG_STEP2__)) console.log(...args);
};
const warnStep2 = (...args) => {
  if (import.meta.env.DEV && (import.meta.env.VITE_DEBUG_STEP2 === 'true' || window.__VOLANTINIPRO_DEBUG_STEP2__)) console.warn(...args);
};

// CartoDB Voyager â€“ leggibile, strade visibili, aspetto GIS operativo
const CARTO_VOYAGER = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// â”€â”€ POI categories: palette GIS professionale, toni desaturati â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CATEGORY_COLORS = {
  subway_station: '#7C9EC4', train_station: '#7C9EC4', light_rail_station: '#7C9EC4',
  bus_station: '#8BAFC8', bus_stop: '#8BAFC8', tram_stop: '#8BAFC8', transit_station: '#7C9EC4',
  school: '#C4956A', university: '#C4956A', college: '#C4956A', academic_department: '#C4956A',
  shopping_mall: '#6B9E8C', store: '#6B9E8C', clothing_store: '#6B9E8C',
  department_store: '#6B9E8C', supermarket: '#6B9E8C', sportswear_store: '#6B9E8C',
  electronics_store: '#6B9E8C', cosmetics_store: '#6B9E8C',
  restaurant: '#7B9EC5', bar: '#7B9EC5', cafe: '#7B9EC5', coffee_shop: '#7B9EC5',
  bakery: '#7B9EC5', pizza_restaurant: '#7B9EC5', italian_restaurant: '#7B9EC5',
  meal_takeaway: '#7B9EC5', cocktail_bar: '#7B9EC5', wine_bar: '#7B9EC5',
  pharmacy: '#6A9E82', hospital: '#6A9E82', doctor: '#6A9E82', healthcare: '#6A9E82',
  tourist_attraction: '#B8A27A', castle: '#B8A27A', art_gallery: '#B8A27A',
  museum: '#B8A27A', church: '#B8A27A', historic_site: '#B8A27A',
  park: '#6A9E6A', garden: '#6A9E6A',
  post_office: '#7A8A9E', local_government_office: '#7A8A9E', office: '#7A8A9E',
  hostel: '#8A9EB8', hotel: '#8A9EB8',
};

function categoryColor(cat) {
  if (!cat) return '#7B9EC5';
  return CATEGORY_COLORS[cat.toLowerCase().replace(/-/g, '_')] || '#7B9EC5';
}

function getZoomForRadius(km) {
  if (km <= 0.5) return 15;
  if (km <= 1)   return 14;
  if (km <= 2)   return 13;
  if (km <= 3)   return 12;
  if (km <= 5)   return 12;
  if (km <= 8)   return 11;
  return 11;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatItNumber(value) {
  return Number(value || 0).toLocaleString('it-IT', { useGrouping: true });
}

function normalizeMapMunicipalityName(raw) {
  return String(raw || '')
    .split(',')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*comune di\s+/i, '')
    .trim()
    .toLowerCase();
}

// CSS applicato globalmente una sola volta
const MAP_CSS = `
.vp-step2-map-shell {
  height: clamp(420px, 42vw, 480px);
}
@media (max-width: 900px) {
  .vp-step2-map-shell {
    height: clamp(400px, 55vw, 440px);
  }
}
@media (max-width: 640px) {
  .vp-step2-map-shell {
    height: clamp(320px, 75vw, 360px);
  }
}
/* Voyager: nessun filter â€“ strade, nomi comuni e vie sono visibili per default */
.leaflet-container {
  background: #f1eee7 !important;
  pointer-events: auto !important;
}
.leaflet-tile {
  filter: brightness(1.08) contrast(1.10) saturate(0.94);
}
.gis-radius-glow {
  filter: drop-shadow(0 0 10px rgba(34,197,94,0.35));
}
.leaflet-pane,
.leaflet-map-pane,
.leaflet-tile-pane,
.leaflet-overlay-pane,
.leaflet-marker-pane,
.leaflet-tooltip-pane,
.leaflet-control-container {
  pointer-events: auto;
}
.map-overlay,
.map-glow,
.map-mask {
  pointer-events: none !important;
}

.leaflet-control-attribution {
  background: rgba(248,246,242,0.92) !important;
  color: rgba(60,60,60,0.55) !important;
  font-size: 8px !important;
  padding: 2px 6px !important;
  border-radius: 4px 0 0 0 !important;
}
.leaflet-control-attribution a { color: rgba(60,60,60,0.5) !important; }

.leaflet-tooltip {
  background: rgba(22,26,38,0.96) !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  color: rgba(255,255,255,0.88) !important;
  font-family: system-ui,-apple-system,sans-serif !important;
  font-size: 11px !important;
  line-height: 1.6 !important;
  padding: 5px 10px !important;
  border-radius: 7px !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.45) !important;
  white-space: nowrap;
}
.leaflet-tooltip::before { display: none !important; }
.leaflet-tooltip b { color: rgba(255,255,255,0.95); }

.leaflet-tooltip.vp-promoter-tooltip {
  width: 270px;
  padding: 0 !important;
  overflow: hidden;
  white-space: normal;
  border-radius: 12px !important;
}
.leaflet-popup.vp-promoter-popup .leaflet-popup-content-wrapper {
  padding: 0;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(12,20,35,.98);
  border: 1px solid rgba(255,255,255,.14);
  color: #fff;
  box-shadow: 0 16px 38px rgba(0,0,0,.5);
}
.leaflet-popup.vp-promoter-popup .leaflet-popup-content { margin: 0; width: 270px !important; }
.leaflet-popup.vp-promoter-popup .leaflet-popup-tip { background: rgba(12,20,35,.98); }
.leaflet-popup.vp-promoter-popup .leaflet-popup-close-button { color: rgba(255,255,255,.7); top: 5px; right: 6px; z-index: 2; }
.vp-promoter-map-card { font-family: system-ui,-apple-system,sans-serif; }
.vp-promoter-map-card__head { display:flex; align-items:center; gap:9px; padding:11px 13px; background:rgba(255,255,255,.045); border-bottom:1px solid rgba(255,255,255,.09); }
.vp-promoter-map-card__number { width:25px; height:25px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:850; flex:0 0 auto; }
.vp-promoter-map-card__title { color:#fff; font-size:12px; font-weight:800; }
.vp-promoter-map-card__subtitle { color:rgba(255,255,255,.48); font-size:9px; margin-top:1px; }
.vp-promoter-map-card__body { padding:10px 13px 12px; display:grid; gap:7px; }
.vp-promoter-map-card__address { color:#fff; font-size:11px; line-height:1.45; font-weight:650; }
.vp-promoter-map-card__row { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; font-size:10px; line-height:1.35; }
.vp-promoter-map-card__label { color:rgba(255,255,255,.43); }
.vp-promoter-map-card__value { color:rgba(255,255,255,.88); text-align:right; font-weight:650; }

.leaflet-control-zoom {
  border: 1px solid rgba(0,0,0,0.14) !important;
  border-radius: 7px !important;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.16) !important;
}
.leaflet-control-zoom a {
  background: rgba(255,255,255,0.95) !important;
  color: rgba(40,40,40,0.72) !important;
  border-bottom-color: rgba(0,0,0,0.09) !important;
  font-size: 15px !important;
  line-height: 26px !important;
}
.leaflet-control-zoom a:hover {
  background: rgba(242,242,240,1) !important;
  color: rgba(20,20,20,0.9) !important;
}
`;

// â”€â”€ Marker icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POI dot: visible on light map
function dotIcon(L, color, size, selected) {
  const s = size || (selected ? 9 : 5);
  const shadow = `0 1px 3px rgba(0,0,0,0.32)`;
  const border = selected
    ? `1.5px solid rgba(0,0,0,0.28)`
    : `1px solid rgba(0,0,0,0.18)`;
  return L.divIcon({
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:${border};box-shadow:${shadow};cursor:pointer;"></div>`,
    className: '',
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

// Marker operativo: deve restare chiaramente cliccabile anche con la mappa scura.
function poiCategorySymbol(category) {
  const value = String(category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (value.includes('palestra') || value.includes('fitness') || value.includes('sport') || value.includes('gym')) return '🏋';
  if (value.includes('scuol') || value.includes('istitut') || value.includes('liceo')) return '🎓';
  if (value.includes('universit') || value.includes('college') || value.includes('bibliotec')) return '📚';
  if (value.includes('stazion') || value.includes('metro') || value.includes('railway') || value.includes('transit') || value.includes('fermata')) return '🚉';
  if (value.includes('supermerc') || value.includes('negozio') || value.includes('retail') || value.includes('mall') || value.includes('centro comm')) return '🛒';
  if (value.includes('ristor') || value.includes('bar') || value.includes('caff') || value.includes('pub')) return '🍽';
  if (value.includes('farmac') || value.includes('clinic') || value.includes('ospedal') || value.includes('sanit')) return '⚕';
  if (value.includes('beauty') || value.includes('estetic') || value.includes('parrucch')) return '✂';
  if (value.includes('auto') || value.includes('officina') || value.includes('concession')) return '🚗';
  if (value.includes('immob') || value.includes('estate')) return '🏠';
  if (value.includes('ufficio') || value.includes('azienda') || value.includes('business') || value.includes('hotel')) return '🏢';
  if (value.includes('teatro') || value.includes('cinema') || value.includes('evento')) return '🎭';
  if (value.includes('parco')) return '🌳';
  return '📍';
}

function selectablePoiIcon(L, color, selected, operatorNumber = null, category = '') {
  const size = selected ? 30 : 26;
  const label = selected && operatorNumber ? `P${operatorNumber}` : selected ? '&#10003;' : poiCategorySymbol(category);
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${selected ? '#16A34A' : color};border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;color:#fff;font:900 ${selected && operatorNumber ? 10 : selected ? 15 : 18}px/1 system-ui,sans-serif;cursor:pointer">${label}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Marker di contesto per Door to Door: visibile ma non assegnabile.
function informationalPoiIcon(L, color, category = '') {
  const size = 20;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:900 11px/1 system-ui,sans-serif;cursor:help">${poiCategorySymbol(category)}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Centro cittÃ : discreto, brand color
function pinIcon(L, color) {
  return L.divIcon({
    html: `<div style="width:11px;height:11px;border-radius:50%;background:${color};border:2px solid rgba(0,0,0,0.28);box-shadow:0 1px 5px rgba(0,0,0,0.35);pointer-events:none;"></div>`,
    className: '',
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
  });
}

// â”€â”€ Colori e icone del layer panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Toni GIS professionali, nessun neon
const LAYER_META = {
  // Base
  radius:   { color: '#C4852A', icon: 'â—‹', label: 'Raggio'        },
  // Territory
  comuni:   { color: '#5B7FA6', icon: 'â–­', label: 'Comuni'        },
  settori:  { color: '#4A6E8A', icon: 'â–¤', label: 'Settori'       },
  // Points
  poi:      { color: '#4E8E6E', icon: 'âŠ™', label: 'POI'           },
  civici:   { color: '#4B5568', icon: 'â–¦', label: 'Civici'        },
  // Phase 2 overlays (structure â€” future: true, no live data yet)
  density:  { color: '#3B82F6', icon: 'â–’', label: 'DensitÃ  fam.'  },
  hotspot:  { color: '#A855F7', icon: 'â—‰', label: 'Hotspot H2H'   },
  cluster:  { color: '#F59E0B', icon: 'â¬¡', label: 'Cluster B2B'  },
  // Live
  tracking: { color: '#4B5568', icon: 'â—Ž', label: 'Tracking GPS'  },
};

function LayerPanel({ config, activeLayers, settori, civiciState, onToggle, opacityLevel, onOpacityChange, onReset }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!config || config.length === 0) return null;
  const primaryLayers = config.filter(layer => ['radius', 'comuni', 'settori', 'civici', 'poi'].includes(layer.id));
  const hasAdvancedLayers = config.length > primaryLayers.length;
  const civiciCount = Number(civiciState?.count || 0) || Number(civiciState?.bboxCount || 0);
  const civiciAvailable = Boolean(civiciState?.available) || civiciCount > 0;
  const civiciMicrocopy = [
    'Civici non disponibili',
    'Serve una fonte dati civici/address points per questa zona',
    'Layer previsto per Door to Door, non ancora popolato',
  ];
  const hasCiviciLayer = primaryLayers.some((layer) => layer.id === 'civici');
  const settoriUnavailable = primaryLayers.some((layer) => layer.id === 'settori' && !layer.future)
    && (!settori || settori.length === 0);

  return (
    <div style={{
      position: 'absolute',
      top: 10,
      right: 10,
      zIndex: 900,
      background: 'rgba(8,12,24,0.86)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 9,
      width: 146,
      maxWidth: 150,
      boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
      fontFamily: 'system-ui,-apple-system,sans-serif',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '7px 10px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>â–¦</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', flex: 1 }}>
          Layer
        </span>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>
          {collapsed ? 'â–¾' : 'â–´'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 0 3px' }}>
          {primaryLayers.map(layer => {
            const meta = LAYER_META[layer.id] || { color: '#5B7FA6', icon: 'â—‹' };
            const civiciDisabled = layer.id === 'civici' && !civiciAvailable;
            const settoriDisabled = layer.id === 'settori' && !settori;
            const isDisabled = civiciDisabled || settoriDisabled;
            const isOn = isDisabled ? false : (activeLayers?.[layer.id] ?? layer.defaultOn ?? false);
            const active = isOn && !layer.future && !isDisabled;
            const settoriNoData = layer.id === 'settori' && !layer.future && (isOn || settoriDisabled)
              && (!settori || settori.length === 0);
            const civiciTag = layer.id === 'civici'
              ? (civiciAvailable ? { bg: 'rgba(22,163,74,0.14)', fg: 'rgba(34,197,94,0.82)', txt: 'disponibili' } : { bg: 'rgba(148,163,184,0.14)', fg: 'rgba(148,163,184,0.82)', txt: 'non disponibili' })
              : null;

            return (
              <div
                key={layer.id}
                onClick={!layer.future && !isDisabled ? () => onToggle?.(layer.id) : undefined}
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
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Left color stripe â€“ GIS layer indicator */}
                <div style={{
                  width: 3,
                  alignSelf: 'stretch',
                  background: active ? meta.color : 'rgba(255,255,255,0.07)',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }} />

                {/* Icon */}
                <span style={{
                  fontSize: 10,
                  color: active ? meta.color : 'rgba(255,255,255,0.22)',
                  padding: '5px 6px 5px 7px',
                  flexShrink: 0,
                  transition: 'color 0.15s',
                  lineHeight: 1,
                }}>
                  {meta.icon}
                </span>

                {/* Label */}
                <span style={{
                  fontSize: 10,
                  color: active ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.3)',
                  flex: 1,
                  lineHeight: 1,
                  transition: 'color 0.15s',
                  paddingRight: 8,
                }}>
                  {layer.label}
                </span>

                {/* State badges */}
                {layer.future && (
                  <span style={{
                    fontSize: 7, padding: '1px 4px', borderRadius: 3, marginRight: 8,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.22)',
                    fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    presto
                  </span>
                )}
                {settoriNoData && (
                  <span style={{
                    fontSize: 7, padding: '1px 4px', borderRadius: 3, marginRight: 8,
                    background: 'rgba(74,110,138,0.18)', color: 'rgba(91,127,166,0.75)',
                    fontWeight: 700,
                  }}>
                    n/d
                  </span>
                )}
                {!layer.future && !settoriNoData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10 }}>
                    <span style={{
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: active ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.24)',
                    }}>
                      {active ? 'ON' : 'OFF'}
                    </span>
                    {civiciTag && (
                      <span style={{
                        fontSize: 7,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: civiciTag.bg,
                        color: civiciTag.fg,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {civiciTag.txt}
                      </span>
                    )}
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: active ? meta.color : 'transparent',
                      border: `1px solid ${active ? meta.color : 'rgba(255,255,255,0.18)'}`,
                      transition: 'all 0.15s',
                    }} />
                  </div>
                )}
              </div>
            );
          })}
          {settoriUnavailable && (
            <div style={{
              padding: '6px 10px 4px',
              fontSize: 9,
              color: 'rgba(255,255,255,0.36)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              Settori: dato non disponibile
            </div>
          )}
          {!civiciAvailable && hasCiviciLayer && (
            <div style={{
              padding: '6px 10px 4px',
              fontSize: 9,
              color: 'rgba(255,255,255,0.36)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              {civiciMicrocopy.map((row) => (
                <div key={row}>{row}</div>
              ))}
            </div>
          )}
          {hasAdvancedLayers && (
            <button
              type="button"
              style={{
                width: '100%',
                border: 0,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.025)',
                color: 'rgba(255,255,255,0.38)',
                fontSize: 9,
                fontWeight: 700,
                padding: '6px 8px',
                textAlign: 'left',
                cursor: 'default',
              }}
            >
              Personalizza layer
            </button>
          )}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, padding: '7px 8px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                OpacitÃ 
              </span>
              <button
                type="button"
                onClick={onReset}
                style={{
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.52)',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '4px 8px',
                  cursor: onReset ? 'pointer' : 'default',
                  opacity: onReset ? 1 : 0.5,
                }}
                disabled={!onReset}
              >
                Reset layer
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'low', label: 'Bassa' },
                { id: 'medium', label: 'Media' },
                { id: 'high', label: 'Alta' },
              ].map((o) => {
                const active = (opacityLevel || 'medium') === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOpacityChange?.(o.id)}
                    style={{
                      flex: 1,
                      borderRadius: 7,
                      border: `1px solid ${active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)'}`,
                      background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                      color: active ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.40)',
                      fontSize: 9,
                      fontWeight: active ? 800 : 700,
                      padding: '5px 6px',
                      cursor: onOpacityChange ? 'pointer' : 'default',
                      opacity: onOpacityChange ? 1 : 0.55,
                    }}
                    disabled={!onOpacityChange}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Colori GIS per le zone non selezionate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ZONE_UNSEL = { color: '#2D5A8E', fill: '#3A72A8' };

// Colori coerenti con la legenda "Coperti / Parziali / Non coperti" (stessa
// soglia getCoverageStatus di src/lib/step2/buildStep2ViewModel.js, passata
// via prop zoneCoverageById â€” nessuna soglia duplicata qui).
const COVERAGE_MAP_COLORS = {
  coperto:     { border: '#22C55E', fill: '#22C55E' },
  parziale:    { border: '#FACC15', fill: '#FACC15' },
  non_coperto: { border: '#F87171', fill: '#94A3B8' },
  preview_main:   { border: '#3B82F6', fill: '#3B82F6' },
  preview_nearby: { border: '#64748B', fill: '#94A3B8' },
};

// â”€â”€ Multi-zona accordion sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ZoneSidebar({ zones, activeZoneId, onSelectZone }) {
  if (!zones || zones.length <= 1) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 44,
      left: 10,
      zIndex: 900,
      background: 'rgba(8,12,24,0.96)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 9,
      minWidth: 176,
      maxWidth: 210,
      boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
      fontFamily: 'system-ui,-apple-system,sans-serif',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px 5px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>â¬¡</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Zone ({zones.length})
        </span>
      </div>

      {/* Zone list */}
      <div style={{ padding: '3px 0 3px' }}>
        {zones.map((z, idx) => {
          const isActive = z.id === activeZoneId;
          const city     = z.city;
          const rad      = parseFloat(z.radius ?? z.radius_km ?? 3);
          const label    = city?.label || city?.name || `Zona ${idx + 1}`;

          if (isActive) {
            return (
              <div key={z.id} style={{
                borderLeft: '3px solid rgba(196,133,42,0.85)',
                background: 'rgba(196,133,42,0.07)',
                padding: '6px 10px 7px 9px',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {esc(label)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: 'rgba(196,133,42,0.85)', fontWeight: 600 }}>
                    â—Ž {rad} km
                  </span>
                  {z.service_type && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', fontWeight: 500 }}>
                      {z.service_type.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 8.5, color: 'rgba(196,133,42,0.65)', marginTop: 2, fontWeight: 600, letterSpacing: '0.06em' }}>
                  ATTIVA
                </div>
              </div>
            );
          }

          return (
            <div
              key={z.id}
              onClick={() => onSelectZone?.(z.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                cursor: 'pointer',
                borderLeft: '3px solid transparent',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 8, color: 'rgba(127,155,176,0.60)', padding: '6px 7px 6px 10px', flexShrink: 0 }}>â—‹</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.48)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 4 }}>
                {esc(label)}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(127,155,176,0.45)', paddingRight: 10, flexShrink: 0, fontWeight: 600 }}>
                {rad} km
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€ Grid-clustering helper for POI markers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Groups nearby POI into clusters without a CDN plugin.
// cellDeg â‰ˆ 0.003Â° â‰ˆ 250m at Italian latitudes.
function gridCluster(pois, cellDeg = 0.003) {
  const cells = {};
  for (const p of pois) {
    const cx = Math.floor(p.lng / cellDeg);
    const cy = Math.floor(p.lat / cellDeg);
    const k  = `${cx},${cy}`;
    if (!cells[k]) cells[k] = [];
    cells[k].push(p);
  }
  return Object.values(cells).map(group => {
    if (group.length === 1) return { ...group[0], isCluster: false };
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
    const rep = group.reduce((b, p) => p.priority > b.priority ? p : b, group[0]);
    return { lat, lng, isCluster: true, count: group.length, color: rep.color, category: rep.category, pois: group };
  });
}

// Quintile-based color scale for density choropleth (D2D families layer).
function choroplethColor(value, breaks) {
  const DENSITY_SCALE = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'];
  const idx = breaks.findIndex(b => value <= b);
  return DENSITY_SCALE[idx === -1 ? 4 : Math.min(idx, 4)];
}

function computeBreaks(values) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.max(0, Math.floor(p * (s.length - 1)))];
  return [q(0.2), q(0.4), q(0.6), q(0.8), Infinity];
}

function Step2MapImpl({
  city,
  radius,
  svcType,
  serviceColor,
  zonesWithCoords,
  selected,
  onToggleZone,
  apiData,
  targetColor,
  activeLayers,
  settori,       // Array<{id, numero, name?, geometry}> | null
  pois,          // Array<{id, lat, lng, name, category, color, priority, address}> from usePoi
  loadingPois,
  operationalPoints, // Punti assegnati ai promoter H2H, geocodificati in Step 1
  poiAssignments,
  onTogglePoi,
  businessConfig,
  civiciState,
  onLayerToggle,
  layerPanelConfig,
  campaignZones, // Nuovi parametri per multi-zona
  activeZoneId,
  onSelectZone,
  themeMode,
  opacityLevel,
  onOpacityChange,
  onLayerReset,
  municipalityBoundary, // GeoJSON geometry del confine comunale (da OSM Nominatim)
  isMunicipalityMode,   // true = mostra intero comune, non cerchio raggio
  nilMode,              // true = modalitÃ  NIL manuale (Milano): poligoni NIL visibili/cliccabili anche in municipality mode
  coveragePolygons,     // Array<{id,name,type,status,geometry,lat,lng,families,assignedFlyers,recommendedFlyers,coveragePct}> â€” territori REALI usati nel calcolo Raggio (comuni o NIL secondo zonesInRadius), SOLO tab Raggio
  activeLayerId,        // id layer attivo â€” incluso nei dep per re-trigger del render
  zoneCoverageById,     // { [zoneId]: "coperto"|"parziale"|"non_coperto" } â€” da getCoverageStatus, stessa soglia della legenda
  zoneAllocationById,   // { [zoneId]: {assignedFlyers, requiredFlyers, coveragePercent, status} } â€” per i tooltip
  boundaryKpis,         // { families, coveragePercent, insertedFlyers, recommendedFlyers } â€” tooltip confine comune attivo
  unconfirmedAddressMode, // true = indirizzo dentro Milano ma non confermato: preview NIL attive, confine leggero
  onMapClick,
}) {
  const hasConfirmedRadius = Number.isFinite(Number(radius)) && Number(radius) > 0;
  const effectiveMapRadius = hasConfirmedRadius ? Number(radius) : 3;
  const containerRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const viewRef = useRef({ lat: null, lng: null, radius: null });
  const autoFitRef = useRef({ operational: '', assignments: '' });
  const [leafletLoaded, setLeafletLoaded] = useState(!!window.L);
  const [selectedSectorId, setSelectedSectorId] = useState(null);
  const [mapZoom, setMapZoom] = useState(null);
  // Territori nel calcolo Raggio senza geometry disponibile â€” mostrati come
  // avviso opzionale in UI, senza nascondere i poligoni disponibili.
  const [missingPolygonNames, setMissingPolygonNames] = useState([]);

  // Carica Leaflet JS + CSS e inizializza mappa
  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    if (!document.getElementById('vp-leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'vp-leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('vp-leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'vp-leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setLeafletLoaded(true);
      script.onerror = () => { warnStep2('[Step2Map] Leaflet non caricato'); };
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    document.getElementById('vp-leaflet-dark')?.remove();
    if (document.getElementById('vp-map-css')) return;
    const style = document.createElement('style');
    style.id = 'vp-map-css';
    style.textContent = MAP_CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!leafletLoaded || !containerRef.current || mapRef.current) return;
    const L = window.L;

    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const map = L.map(containerRef.current, {
      center: city ? [city.lat, city.lng] : [41.9, 12.5],
      zoom: city ? getZoomForRadius(effectiveMapRadius) : 6,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      boxZoom: true,
      keyboard: true,
    });
    mapRef.current = map;

    try {
      const p0 = map.createPane('municipalityFillPane');
      p0.style.zIndex = 390;
      p0.style.pointerEvents = 'none';

      const p1 = map.createPane('nilPolygonsPane');
      p1.style.zIndex = 410;
      p1.style.pointerEvents = 'auto';

      const p2 = map.createPane('municipalityBoundaryPane');
      p2.style.zIndex = 415;
      p2.style.pointerEvents = 'none';

      const p3 = map.createPane('radiusCirclePane');
      p3.style.zIndex = 430;
      p3.style.pointerEvents = 'none';

      const p4 = map.createPane('radiusCenterPane');
      p4.style.zIndex = 620;
      p4.style.pointerEvents = 'auto';

      const poiPane = map.createPane('poiSelectionPane');
      poiPane.style.zIndex = 630;
      poiPane.style.pointerEvents = 'auto';

      const tipPane = map.getPane('tooltipPane');
      if (tipPane) {
        tipPane.style.zIndex = 650;
        tipPane.style.pointerEvents = 'none';
      }
    } catch (_e) {}

    const mbToken = typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN;
    if (mbToken && mbToken.startsWith('pk.')) {
      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${mbToken}`,
        { tileSize: 512, zoomOffset: -1, attribution: 'Mapbox OpenStreetMap', maxZoom: 19 }
      ).addTo(map);
    } else {
      L.tileLayer(CARTO_VOYAGER, { attribution: CARTO_ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => map.invalidateSize());
    });
    resizeObserver.observe(containerRef.current);

    map.on('zoomend', () => { setMapZoom(map.getZoom()); });
    map.on('click', (e) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [leafletLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ridisegna tutti i layer quando i dati o la visibilitÃ  cambiano
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    Object.values(layersRef.current).forEach(l => { try { map.removeLayer(l); } catch {} });
    layersRef.current = {};

    if (!city) return;

    const isD2D = svcType === 'd2d';
    const currentZoom = map.getZoom();
    const showAllLabels  = currentZoom >= 15;
    const showSomeLabels = currentZoom >= 12;

    // â”€â”€ Rileva il comune primario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // REGOLA: la zona primaria Ã¨ SEMPRE il comune scelto dall'utente (city).
    // Non usare il primo elemento di zonesWithCoords: in prossimitÃ  di Milano
    // i quartieri milanesi (Bruzzano, Affori, Niguardaâ€¦) hanno coordinate
    // sovrapponibili a quelle di comuni autonomi come Cormano o Bresso.
    const cityNameRaw   = city?.label || city?.name || '';
    const cityName      = normalizeMapMunicipalityName(cityNameRaw);
    const cityIsMilano  = cityName === 'milano';
    // Codice ISTAT del Comune di Milano usato nei settori del DB
    const MILANO_ISTAT  = '015146';

    let primaryZone    = null;
    let _selReason     = 'no_match';

    // 1. Match esatto per nome (case-insensitive) â€” prioritÃ  assoluta
    if (!primaryZone && cityName) {
      const found = zonesWithCoords?.find(
        z => normalizeMapMunicipalityName(z.name) === cityName
      );
      if (found) { primaryZone = found; _selReason = 'exact_name'; }
    }

    // 2. Match parziale nome (il nome cittÃ  Ã¨ contenuto nel nome zona o viceversa)
    if (!primaryZone && cityName) {
      const found = zonesWithCoords?.find(z => {
        const zn = normalizeMapMunicipalityName(z.name);
        return zn.length >= 4 && cityName.length >= 4 && (zn.includes(cityName) || cityName.includes(zn));
      });
      if (found) { primaryZone = found; _selReason = 'partial_name'; }
    }

    // 3. Coordinata piÃ¹ vicina â€” escludendo quartieri di Milano se city â‰  Milano
    if (!primaryZone && zonesWithCoords?.length > 0) {
      let best = null;
      let bestD2 = Infinity;
      zonesWithCoords.forEach(z => {
        if (!cityIsMilano) {
          const mc = String(z.municipality_code || z.municipalityCode || '');
          if (mc.includes(MILANO_ISTAT)) return; // salta i settori/quartieri milanesi
        }
        const d2 = Math.pow((z.lat || 0) - city.lat, 2) +
                   Math.pow((z.lng || 0) - city.lng, 2);
        if (d2 < bestD2) { bestD2 = d2; best = z; }
      });
      // Accettare solo se < ~2 km (dÂ² < 0.0004 in gradi â‰ˆ ~2.2 km)
      if (best && bestD2 < 0.0004) { primaryZone = best; _selReason = 'closest_coord_non_milan'; }
    }

    const primaryMunCode = city?.municipalityCode || city?.municipality_code || primaryZone?.municipality_code || primaryZone?.municipalityCode || null;

    const col = serviceColor || '#ff6b1a';
    const opacityScale = opacityLevel === 'low' ? 0.65 : opacityLevel === 'high' ? 1.25 : 1;
    const nextView = { lat: Number(city.lat), lng: Number(city.lng), radius: hasConfirmedRadius ? Number(radius) : null, boundary: municipalityBoundary };
    const viewChanged =
      viewRef.current.lat !== nextView.lat ||
      viewRef.current.lng !== nextView.lng ||
      viewRef.current.radius !== nextView.radius ||
      viewRef.current.boundary !== nextView.boundary;
    if (viewChanged) {
      viewRef.current = nextView;
      // In municipality mode with boundary: fitBounds to the polygon(s)
      // municipalityBoundary can be:
      //   - [{name, geometry}, ...]  (array from Nominatim fetch â€” the canonical format)
      //   - a raw GeoJSON geometry (legacy / direct pass)
      if (isMunicipalityMode && municipalityBoundary) {
        try {
          const boundaryEntries = Array.isArray(municipalityBoundary)
            ? municipalityBoundary.filter(b => b?.geometry)
            : (municipalityBoundary?.type ? [{ name: city?.label || city?.name || 'Comune', geometry: municipalityBoundary }] : []);
          if (boundaryEntries.length > 0) {
            const combinedGj = L.geoJSON({ type: 'FeatureCollection', features: boundaryEntries.map(b => ({ type: 'Feature', geometry: b.geometry, properties: { name: b.name } })) });
            const selectedBounds = combinedGj.getBounds();
            const fitSelectedBoundary = () => {
              const mapContainer = map.getContainer?.();
              if (!mapContainer || !mapContainer.isConnected || !map._loaded || !map._mapPane) return;
              map.invalidateSize({ pan: false });
              const mapSize = map.getSize();
              const horizontalPadding = Math.max(28, Math.min(72, Math.round(mapSize.x * 0.08)));
              const verticalPadding = Math.max(28, Math.min(58, Math.round(mapSize.y * 0.09)));
              map.fitBounds(selectedBounds, {
                paddingTopLeft: [horizontalPadding + 6, verticalPadding],
                paddingBottomRight: [horizontalPadding, verticalPadding + 6],
                animate: false,
              });
            };
            fitSelectedBoundary();
            requestAnimationFrame(() => fitSelectedBoundary());
          } else {
            map.setView([city.lat, city.lng], getZoomForRadius(effectiveMapRadius), { animate: false });
          }
        } catch {
          map.setView([city.lat, city.lng], getZoomForRadius(effectiveMapRadius), { animate: false });
        }
      } else {
        map.setView([city.lat, city.lng], getZoomForRadius(effectiveMapRadius), { animate: false });
      }
    }

    const group = L.layerGroup().addTo(map);
    layersRef.current.group = group;

    // Ordine layer (dal basso in alto): 1. tile base (gestita a parte) â†’
    // 2. confini comuni/NIL coinvolti â†’ 3. cerchio raggio â†’ 4. marker centro
    // â†’ 5. tooltip. Cerchio e marker vengono aggiunti DOPO i poligoni comuni
    // piÃ¹ sotto (non qui) proprio per restare sempre visibili sopra di essi
    // â€” prima erano disegnati per primi e i poligoni comuni li coprivano.
    const activeZone = (campaignZones || []).find(z => z.id === activeZoneId);
    const zonesList = activeZone ? [activeZone] : [{ id: 'active_zone', city, radiusKm: hasConfirmedRadius ? radius : null }];
    (campaignZones || []).forEach(z => {
      if (!zonesList.find(x => x.id === z.id)) {
        zonesList.push(z);
      }
    });

    // â”€â”€ Confine comunale (municipality boundary from OSM Nominatim) â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // municipalityBoundary format: [{name: string, geometry: GeoJSONGeometry}, ...]
    // Each entry represents one comune. We render all of them.
    // The active city comune gets a strong green border; additional comuni get
    // a slightly lighter style so multi-comune is immediately readable.
    let renderedBoundaryCount = 0;
    if (isMunicipalityMode && municipalityBoundary) {
      // Normalize to array-of-{name,geometry} regardless of input shape
      const cityLabel = city?.label || city?.name || 'Comune';
      let boundaryEntries = [];
      if (Array.isArray(municipalityBoundary)) {
        // Canonical format: [{name, geometry}, ...]
        boundaryEntries = municipalityBoundary.filter(b => b?.geometry);
      } else if (municipalityBoundary?.type) {
        // Legacy: raw GeoJSON geometry passed directly
        boundaryEntries = [{ name: cityLabel, geometry: municipalityBoundary }];
      }

      if (boundaryEntries.length === 0) {
        warnStep2('[MUNICIPALITY_BOUNDARY_WARN] isMunicipalityMode=true but no valid boundary entries found', municipalityBoundary);
      }

      // Detect the active comune name for styling
      const activeComuneName = (cityLabel)
        .split(',')[0]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

      const isMilanoCityMapForBoundary = Boolean(city && (String(city.name || city.label || '').toLowerCase().includes('milano')));
      const hasNilZonesForBoundary = Boolean((zonesWithCoords || []).some(z => z && (z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')) || (typeof z.type === 'string' && z.type === 'nil'))));
      const willRenderNilPolygonsForBoundary = activeLayers?.comuni !== false && (zonesWithCoords?.length || 0) > 0 && (!isMunicipalityMode || nilMode || hasNilZonesForBoundary || isMilanoCityMapForBoundary);
      const shouldRenderCoveragePolygonsForBoundary = (!isMunicipalityMode || unconfirmedAddressMode) && Array.isArray(coveragePolygons) && coveragePolygons.length > 0;

      boundaryEntries.forEach((entry, idx) => {
        const entryName = String(entry.name || `Comune ${idx + 1}`);
        const normEntry = entryName.split(',')[0].trim().toLowerCase();
        const normEntryClean = normEntry.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isActiveComuneEntry = idx === 0 || normEntryClean === activeComuneName;

        const entryHasNils = (zonesWithCoords || []).some(z => {
          if (!z) return false;
          const isNilLike = Boolean(z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')) || (typeof z.type === 'string' && z.type === 'nil'));
          if (!isNilLike) return false;
          return isMilanoCityMapForBoundary ? normEntry.includes('milano') : true;
        });
        const hasInteractiveSubZones = willRenderNilPolygonsForBoundary ? (entryHasNils || ((zonesWithCoords?.length || 0) > 0 && (isActiveComuneEntry || !isMunicipalityMode))) : shouldRenderCoveragePolygonsForBoundary;
        const isBoundaryInteractive = !hasInteractiveSubZones && !unconfirmedAddressMode;

        // Active comune: strong green border, light green fill (or faint context when unconfirmedAddressMode)
        // Additional comuni in multi-mode: slightly different shade, still visible
        const polyStyle = unconfirmedAddressMode ? {
          color: '#8A9EA7',
          weight: 1.5,
          fillColor: 'transparent',
          fillOpacity: 0,
          dashArray: '4 4',
          opacity: 0.35,
          interactive: false,
        } : isActiveComuneEntry ? {
          color: '#22C55E',
          weight: 2.5,
          fillColor: '#22C55E',
          fillOpacity: isBoundaryInteractive ? (0.06 * (opacityScale || 1)) : 0,
          dashArray: '8 5',
          opacity: 0.88,
          interactive: isBoundaryInteractive,
        } : {
          color: '#34D399',
          weight: 1.8,
          fillColor: '#34D399',
          fillOpacity: isBoundaryInteractive ? (0.04 * (opacityScale || 1)) : 0,
          dashArray: '6 4',
          opacity: 0.65,
          interactive: isBoundaryInteractive,
        };

        // Tooltip informativo (Â§ticket): tipo, famiglie, copertura, volantini.
        // Per il comune attivo usa i KPI aggregati (boundaryKpis); per gli
        // altri comuni multi-selezione usa i dati della zona corrispondente.
        const zoneForEntry = (zonesWithCoords || []).find(z => String(z.name || '').trim().toLowerCase() === normEntry) || null;
        const allocForEntry = zoneForEntry ? zoneAllocationById?.[zoneForEntry.id] : null;
        const fmtIT = n => Number(n || 0).toLocaleString('it-IT', { useGrouping: true });
        const tipRows = isActiveComuneEntry && boundaryKpis
          ? [
              `<b style="color:${col}">${esc(entryName)}</b>`,
              `<span style="color:rgba(255,255,255,.6);font-size:11px">Tipo: Comune completo</span>`,
              `Famiglie: <b>${fmtIT(boundaryKpis.families)}</b>`,
              `Copertura: <b>${Math.round(boundaryKpis.coveragePercent || 0)}%</b>`,
              `Quantità inserita: <b>${fmtIT(boundaryKpis.insertedFlyers)}</b>`,
              `Quantità consigliata: <b>${fmtIT(boundaryKpis.recommendedFlyers)}</b>`,
            ]
          : [
              `<b style="color:${col}">${esc(entryName)}</b>`,
              `<span style="color:rgba(255,255,255,.6);font-size:11px">Tipo: Comune</span>`,
              zoneForEntry ? `Famiglie: <b>${fmtIT(zoneForEntry.families)}</b>` : null,
              allocForEntry ? `Copertura: <b>${Math.round(allocForEntry.coveragePercent || 0)}%</b>` : null,
              allocForEntry ? `Volantini assegnati: <b>${fmtIT(allocForEntry.assignedFlyers)}</b>` : null,
              allocForEntry ? `Quantità consigliata: <b>${fmtIT(allocForEntry.requiredFlyers)}</b>` : null,
              allocForEntry ? _coverageStatusRow(allocForEntry.status) : null,
            ];
        const tip = tipRows.filter(Boolean).join('<br>');

        try {
          const p2 = map.getPane('municipalityBoundaryPane');
          if (p2) p2.style.pointerEvents = isBoundaryInteractive ? 'auto' : 'none';
          const feature = { type: 'Feature', geometry: entry.geometry, properties: { name: entryName } };
          const boundaryLayer = L.geoJSON(feature, { style: polyStyle, pane: 'municipalityBoundaryPane', interactive: isBoundaryInteractive });
          if (isBoundaryInteractive) {
            boundaryLayer.bindTooltip(tip, { direction: 'auto', opacity: 1, sticky: true, interactive: false, pane: 'tooltipPane' });
            boundaryLayer.on('mouseover', () => boundaryLayer.setStyle({ weight: polyStyle.weight + 1, fillOpacity: Math.min(0.18, (polyStyle.fillOpacity || 0.06) * 2.2) }));
            boundaryLayer.on('mouseout', () => boundaryLayer.setStyle({ weight: polyStyle.weight, fillOpacity: polyStyle.fillOpacity }));
          }
          boundaryLayer.addTo(group);
          layersRef.current[`municipalityBoundary_${idx}`] = boundaryLayer;
          renderedBoundaryCount++;
          debugStep2(`[MUNICIPALITY_BOUNDARY_DRAWN] ${entryName} (entry ${idx}, interactive: ${isBoundaryInteractive})`);
        } catch (e) {
          warnStep2(`[MUNICIPALITY_BOUNDARY_ERROR] draw failed for ${entryName}`, e);
        }
      });

      debugStep2('[MUNICIPALITY_BOUNDARY_LOADED] total drawn:', renderedBoundaryCount);
    }

    debugStep2('[Step2Map] svcType:', svcType,
      '| zones:', zonesWithCoords?.length ?? 0,
      '| settori:', settori?.length ?? 'null',
      '| isMunicipalityMode:', isMunicipalityMode,
      '| hasBoundary:', !!municipalityBoundary,
      '| layers:', JSON.stringify(activeLayers));
    if (activeLayerId) {
      const zonesWithColor = zonesWithCoords?.filter(z => z.metricColor)?.length ?? 0;
      debugStep2('[LAYER_RENDER_UPDATED]', { layerId: activeLayerId, themeMode, zonesColored: zonesWithColor, total: zonesWithCoords?.length ?? 0 });
    }

    // settoriActive: settori layer is on AND data is available
    const settoriActive = activeLayers?.settori !== false && settori?.length > 0;

    if (import.meta.env.DEV) {
      const boundaryEntriesArr = Array.isArray(municipalityBoundary)
        ? municipalityBoundary.filter(b => b?.geometry)
        : (municipalityBoundary?.type ? [municipalityBoundary] : []);
      const boundaryCount = boundaryEntriesArr.length;
      const coveragePolygonsCount = (zonesWithCoords || []).filter(z => z.geometry).length;
      const involvedMunicipalitiesCount = isMunicipalityMode ? boundaryCount : (zonesWithCoords?.length || 0);
      const hasRadiusCircle = !isMunicipalityMode && (activeLayers?.radius !== false);
      // Required debug log per spec
      console.log('[STEP2_MAP_BOUNDARIES]', {
        areaMode: isMunicipalityMode ? 'full_municipality' : 'radius',
        selectionMode: isMunicipalityMode ? 'comune' : 'raggio',
        searchMode: isMunicipalityMode ? 'municipality' : 'address',
        radiusKm: radius,
        selectedComuneName: city?.label || city?.name || null,
        selectedComuniCount: boundaryEntriesArr.length,
        selectedZonesCount: zonesWithCoords?.length || 0,
        activeZoneId,
        hasSelectedComuneBoundary: Boolean(municipalityBoundary),
        selectedComuniWithBoundary: boundaryEntriesArr.length,
        renderedBoundaryCount,
        renderedRadiusCircle: hasRadiusCircle,
        // raw boundary format for debugging
        boundaryIsArray: Array.isArray(municipalityBoundary),
        boundaryEntryNames: boundaryEntriesArr.map(b => b?.name || '?'),
      });
      console.log('[STEP2_MAP_RENDER]', {
        areaMode: isMunicipalityMode ? 'full_municipality' : 'radius',
        selectionMode: isMunicipalityMode ? 'comune' : 'raggio',
        radiusKm: radius,
        center: city ? { lat: city.lat, lng: city.lng } : null,
        boundaryCount,
        coveragePolygonsCount,
        involvedMunicipalitiesCount,
        hasRadiusCircle,
        activeLayerMode: isMunicipalityMode ? 'comune' : 'raggio',
      });
      const isMilanoCityMap = Boolean(city && (String(city.name || city.label || '').toLowerCase().includes('milano')));
      const hasNilZones = Boolean((zonesWithCoords || []).some(z => z && (z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')) || (typeof z.type === 'string' && z.type === 'nil'))));
      const willRenderNilPolygons = activeLayers?.comuni !== false && (zonesWithCoords?.length || 0) > 0 && (!isMunicipalityMode || nilMode || hasNilZones || isMilanoCityMap);
      console.log('[STEP2_MAP_GEOMETRY_DEBUG]', {
        activeAreaTab: isMunicipalityMode ? 'comune' : 'raggio',
        areaMode: isMunicipalityMode ? (nilMode ? 'custom_zone' : 'full_municipality') : 'radius',
        selectedComuneName: city?.label || city?.name || null,
        radiusKm: radius,
        hasMunicipalityGeometry: boundaryCount > 0,
        municipalityGeometryName: boundaryEntriesArr[0]?.name || null,
        nilGeometryCount: (zonesWithCoords || []).filter(z => z.geometry && (z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')))).length,
        renderedMunicipalityBoundary: isMunicipalityMode && boundaryCount > 0,
        renderedNilPolygons: willRenderNilPolygons ? coveragePolygonsCount : 0,
        renderedRadiusCircle: hasRadiusCircle,
        tooltipPolygonsCount: (isMunicipalityMode ? boundaryCount : 0) + (willRenderNilPolygons ? coveragePolygonsCount : 0),
      });
    }

    // â”€â”€ 2. Comuni (confini comunali) â€” SOLO NIL manuale (Comune tab) â”€â”€â”€â”€â”€â”€â”€
    // In municipality mode il poligono municipalityBoundary mostra giÃ  il
    // comune selezionato. Il caso "Raggio" (!isMunicipalityMode) NON passa
    // piÃ¹ da qui: usa il blocco dedicato coveragePolygons subito sotto,
    // per non confondere confine comunale (contesto singolo) con i territori
    // realmente coinvolti nel calcolo raggio (Â§ticket "non confondere
    // municipality boundary con radius polygons").
    const isMilanoCityMap = Boolean(city && (String(city.name || city.label || '').toLowerCase().includes('milano')));
    const hasNilZones = Boolean((zonesWithCoords || []).some(z => z && (z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')) || (typeof z.type === 'string' && z.type === 'nil'))));
    let renderedZonePolygonLayers = 0;
    const shouldRenderCoveragePolygonsEarly = (!isMunicipalityMode || unconfirmedAddressMode) && Array.isArray(coveragePolygons) && coveragePolygons.length > 0;
    if (!shouldRenderCoveragePolygonsEarly && activeLayers?.comuni !== false && zonesWithCoords?.length > 0 && (!isMunicipalityMode || nilMode || hasNilZones || isMilanoCityMap)) {
      zonesWithCoords.forEach(z => {
        const sel = isD2D && selected?.includes(z.id);
        const coverageStatus = zoneCoverageById?.[z.id] || null;
        const coverageColors = coverageStatus ? COVERAGE_MAP_COLORS[coverageStatus] : null;
        const comuneFill = coverageColors
          ? coverageColors.fill
          : (themeMode ? (z.metricColor || z.color || '#7F9BB0') : (z.color || '#7F9BB0'));
        // IntensitÃ  per stato: "non coperto" Ã¨ di gran lunga il caso piÃ¹
        // frequente su Milano (fino a 87 NIL su 88) â€” un bordo/fill uguali a
        // "coperto" lo fa dominare visivamente l'intera mappa. Bordo rosso
        // leggero + fill quasi trasparente, "coperto" resta il piÃ¹ marcato
        // (Ã¨ il caso raro/interessante da individuare a colpo d'occhio).
        const coverageIntensity = coverageStatus === 'non_coperto'
          ? { fillOpacity: 0.05, weight: 0.9, opacity: 0.45 }
          : coverageStatus === 'parziale'
            ? { fillOpacity: 0.16, weight: 1.3, opacity: 0.75 }
            : coverageStatus === 'coperto'
              ? { fillOpacity: 0.22, weight: 1.6, opacity: 0.9 }
              : null;
        const baseFill = settoriActive ? 0.010 : (coverageIntensity ? coverageIntensity.fillOpacity : (themeMode ? 0.16 : 0.055));
        const fillOpacity = Math.max(0.006, Math.min(0.32, baseFill * opacityScale));
        const isNilZone = Boolean(z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')));

        const styleUnsel = {
          color:       coverageColors ? coverageColors.border : 'rgba(15,23,42,0.40)',
          fillColor:   comuneFill,
          fillOpacity,
          weight:      coverageIntensity ? Math.max(isNilZone ? 1.3 : 0.85, coverageIntensity.weight) : (isNilZone ? 1.3 : (settoriActive ? 0.55 : 0.85)),
          opacity:     coverageIntensity ? Math.max(isNilZone ? 0.85 : 0.45, coverageIntensity.opacity) : (isNilZone ? 0.85 : (settoriActive ? 0.18 : 0.45)),
          dashArray:   coverageColors ? null : (themeMode ? null : '5 5'),
        };
        const styleSel = {
          color: coverageColors ? coverageColors.border : (z.color || col),
          fillColor: comuneFill,
          fillOpacity: Math.max(fillOpacity, Math.min(0.34, 0.12 * opacityScale)),
          weight: coverageIntensity ? Math.max(isNilZone ? 1.7 : 1.1, coverageIntensity.weight + 0.4) : (isNilZone ? 1.7 : 1.1),
          opacity: coverageIntensity ? Math.min(0.95, coverageIntensity.opacity + 0.1) : 0.85,
          dashArray: null,
          lineCap: 'round',
          lineJoin: 'round',
        };
        const gisStyle = sel ? styleSel : styleUnsel;
        const alloc = zoneAllocationById?.[z.id] || null;
        const tip = _buildZoneOrNilTooltip(z, col, sel, alloc, coverageStatus, false);

        if (z.geometry) {
          try {
            const p1 = map.getPane('nilPolygonsPane');
            if (p1) p1.style.pointerEvents = 'auto';
            const gj = typeof z.geometry === 'string' ? JSON.parse(z.geometry) : z.geometry;
            const zoneLayer = L.geoJSON(gj, {
              style: gisStyle,
              interactive: true,
              pane: 'nilPolygonsPane',
              onEachFeature: (feature, layer) => {
                layer.bindTooltip(tip, { direction: 'auto', opacity: 1, sticky: true, interactive: false, pane: 'tooltipPane' });
                layer.on('click', () => {
                  if (!isD2D) return;
                  if (import.meta.env.DEV) console.log('[LAYER_ZONE_CLICKED]', { zone: z.name, metricLabel: z.metricLabel, metricFmt: z.metricFmt, families: z.families });
                  onToggleZone?.(z.id);
                });
                layer.on('mouseover', () => {
                  layer.setStyle({ weight: (gisStyle.weight || 1) + 1.4, fillOpacity: Math.min(0.5, (gisStyle.fillOpacity || 0.18) + 0.18) });
                  layer.bringToFront?.();
                });
                layer.on('mouseout', () => layer.setStyle(gisStyle));
              }
            });
            zoneLayer.addTo(group);
            renderedZonePolygonLayers += 1;
          } catch (_e) {
            // In modalitÃ  comune: non mostrare cerchi fallback che sconfinano
            if (isD2D && !isMunicipalityMode) _renderD2DCircle(L, z, col, sel, tip, group, onToggleZone, styleUnsel, styleSel);
          }
        } else if (isD2D && !isMunicipalityMode) {
          // In modalitÃ  comune: senza geometry reale non disegnare cerchi nei comuni vicini
          _renderD2DCircle(L, z, col, sel, tip, group, onToggleZone, styleUnsel, styleSel);
        }
      });
    }

    // â”€â”€ 2b. Poligoni di copertura Raggio (coveragePolygons) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Territori REALMENTE usati nel calcolo (comuni o NIL, secondo
    // zonesInRadius) passati da volantinipro-final.jsx â€” sostituisce il
    // confine comunale come contenuto principale in modalitÃ  Raggio.
    const shouldRenderCoveragePolygons = (!isMunicipalityMode || unconfirmedAddressMode) && Array.isArray(coveragePolygons) && coveragePolygons.length > 0;
    let missingGeometryNames = [];
    let renderedCoveragePolygonLayers = 0;
    if (shouldRenderCoveragePolygons) {
      coveragePolygons.forEach(z => {
        const coverageColors = COVERAGE_MAP_COLORS[z.status] || COVERAGE_MAP_COLORS.non_coperto;
        const coverageIntensity = z.status === 'preview_main'
          ? { fillOpacity: 0.28, weight: 2.4, opacity: 0.95 }
          : z.status === 'preview_nearby'
            ? { fillOpacity: 0.10, weight: 1.3, opacity: 0.60 }
            : z.status === 'non_coperto'
              ? { fillOpacity: 0.05, weight: 0.9, opacity: 0.45 }
              : z.status === 'parziale'
                ? { fillOpacity: 0.16, weight: 1.3, opacity: 0.75 }
                : { fillOpacity: 0.22, weight: 1.6, opacity: 0.9 };
        const fillOpacity = Math.max(0.006, Math.min(0.32, coverageIntensity.fillOpacity * opacityScale));
        const gisStyle = {
          color: coverageColors.border,
          fillColor: coverageColors.fill,
          fillOpacity,
          weight: coverageIntensity.weight,
          opacity: coverageIntensity.opacity,
          lineCap: 'round',
          lineJoin: 'round',
        };
        const tip = _buildZoneOrNilTooltip(z, '#34D399', false, null, z.status, true);

        if (z.geometry) {
          try {
            const p1 = map.getPane('nilPolygonsPane');
            if (p1) p1.style.pointerEvents = 'auto';
            const gj = typeof z.geometry === 'string' ? JSON.parse(z.geometry) : z.geometry;
            const zoneLayer = L.geoJSON(gj, {
              style: gisStyle,
              interactive: true,
              pane: 'nilPolygonsPane',
              onEachFeature: (feature, layer) => {
                layer.bindTooltip(tip, { direction: 'auto', opacity: 1, sticky: true, interactive: false, pane: 'tooltipPane' });
                layer.on('mouseover', () => {
                  layer.setStyle({ weight: gisStyle.weight + 1.4, fillOpacity: Math.min(0.5, gisStyle.fillOpacity + 0.18) });
                  layer.bringToFront?.();
                });
                layer.on('mouseout', () => layer.setStyle(gisStyle));
              }
            });
            zoneLayer.addTo(group);
            renderedCoveragePolygonLayers += 1;
          } catch (e) {
            missingGeometryNames.push(z.name);
            warnStep2('[STEP2_RADIUS_POLYGON_MISSING]', { zone: z.name, reason: 'geometry_parse_error', error: e });
          }
        } else {
          missingGeometryNames.push(z.name);
          if (import.meta.env.DEV) console.warn('[STEP2_RADIUS_POLYGON_MISSING]', { zone: z.name, reason: 'no_geometry' });
        }
      });
    }
    setMissingPolygonNames(missingGeometryNames);

    // â”€â”€ Cerchio raggio + marker centro â€” disegnati DOPO i poligoni comuni
    // (sopra nell'ordine dei layer) cosÃ¬ il cerchio resta sempre visibile e
    // non finisce coperto dai fill dei comuni coinvolti. â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    zonesList.forEach(z => {
      const isActive = z.id === activeZoneId || z.id === 'active_zone';
      const zCity = isActive ? city : (z.city || null);
      if (!zCity || !zCity.lat || !zCity.lng) return;

      const zRadius = parseFloat((isActive ? (hasConfirmedRadius ? radius : null) : null) ?? z.radiusKm ?? z.radius ?? z.radius_km ?? 3);
      const zCol = isActive ? col : '#7F9BB0';
      const isRingOn = isActive ? (activeLayers?.radius !== false) : true;

      // â”€â”€ 1. Raggio / Circle â€” sempre nascosto in modalitÃ  comune intero,
      // sempre verde tratteggiato (area attiva) quando la zona attiva Ã¨ in
      // modalitÃ  raggio, coerente con lo stile del confine comunale. â”€â”€â”€â”€â”€â”€
      const showCircle = isRingOn && !isMunicipalityMode && (!isActive || hasConfirmedRadius);
      if (showCircle) {
        L.circle([zCity.lat, zCity.lng], {
          radius: zRadius * 1000,
          color: isActive ? col : zCol,
          fillColor: isActive ? col : 'transparent',
          fillOpacity: isActive ? 0.05 : 0,
          weight: isActive ? 2 : 0.7,
          dashArray: isActive ? '8 4' : '4 6',
          opacity: isActive ? 0.9 : 0.18,
          className: isActive ? 'gis-radius-glow' : '',
          interactive: false,
          pane: 'radiusCirclePane',
        }).addTo(group);
      }

      // â”€â”€ 2. Center Pin â”€â”€
      if (isActive && svcType === 'h2h' && operationalPoints?.length > 0) return;

      const tooltipContent = isActive
        ? (isMunicipalityMode
            ? `<b>${esc(zCity.label || zCity.name || 'Centro')}</b><br><span style="color:${col};opacity:0.85">Intero comune</span>`
            : hasConfirmedRadius
              ? `<b>${esc(zCity.label || zCity.name || 'Centro')}</b><br><span style="color:${zCol};opacity:0.85">${zRadius} km raggio (Attiva)</span>`
              : `<b>${esc(zCity.label || zCity.name || 'Centro')}</b><br><span style="color:${zCol};opacity:0.85">Punto confermato - scegli raggio</span>`)
        : `<b>${esc(zCity.label || zCity.name || 'Centro')}</b><br><span style="color:${zCol};opacity:0.75">${zRadius} km raggio<br><i>Clicca per attivare</i></span>`;

      const marker = L.marker([zCity.lat, zCity.lng], {
        icon: pinIcon(L, zCol), zIndexOffset: isActive ? 2000 : 1000, pane: 'radiusCenterPane',
      }).bindTooltip(tooltipContent, { direction: 'top', offset: [0, -10], opacity: 1 }).addTo(group);

      if (!isActive) {
        // Cliccando su una zona inattiva, la attiva!
        marker.on('click', () => {
          if (onSelectZone) onSelectZone(z.id);
        });
      }
    });

    // â”€â”€ 3. Settori operativi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Micro-zone inside municipalities â€” from map_sectors via useSectors.
    // The layer panel shows "n/d" when settori prop is null/empty.
    // Un pin numerato e una micro-zona per ogni promoter configurato.
    const validOperationalPoints = svcType === 'h2h'
      ? (operationalPoints || []).filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
      : [];
    const promoterColors = ['#2563EB', '#8B5CF6', '#0891B2', '#D97706', '#DB2777', '#16A34A'];
    const pointTypeLabels = {
      stazione: 'Stazione treno / metro', piazza: 'Piazza / via principale',
      centro_commerciale: 'Centro commerciale', universita: 'Università / scuola',
      fiera_evento: 'Fiera / evento',
    };
    const coordinateGroups = new Map();
    validOperationalPoints.forEach((point, index) => {
      const key = `${Number(point.lat).toFixed(5)}_${Number(point.lng).toFixed(5)}`;
      coordinateGroups.set(key, [...(coordinateGroups.get(key) || []), index]);
    });
    validOperationalPoints.forEach((point, index) => {
      const markerNumber = Number(point.promoterNumber || index + 1);
      const markerColor = promoterColors[index % promoterColors.length];
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      const microRadius = Math.max(150, Number(point.microRadiusMeters || 400));
      const assignedQuantity = Number(point.assignedQuantity || 0);
      const coordinateKey = `${lat.toFixed(5)}_${lng.toFixed(5)}`;
      const colocatedIndexes = coordinateGroups.get(coordinateKey) || [index];
      const colocatedPosition = colocatedIndexes.indexOf(index);
      const overlapAngle = (Math.PI * 2 * colocatedPosition) / colocatedIndexes.length;
      const overlapOffset = colocatedIndexes.length > 1 ? 0.00013 : 0;
      const displayLat = lat + Math.sin(overlapAngle) * overlapOffset;
      const displayLng = lng + Math.cos(overlapAngle) * overlapOffset;

      L.circle([lat, lng], {
        radius: microRadius, color: markerColor, fillColor: markerColor,
        fillOpacity: 0.07, weight: 1.5, dashArray: '6 6', opacity: 0.85,
        interactive: false, pane: 'radiusCirclePane',
      }).addTo(group);

      const promoterIcon = L.divIcon({
        html: `<div style="width:30px;height:30px;border-radius:50%;background:${markerColor};border:3px solid #fff;box-shadow:0 5px 16px rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;color:#fff;font:800 13px/1 system-ui,sans-serif">${markerNumber}</div>`,
        className: '', iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const pointLabel = esc(point.label || point.location || `Punto operativo ${markerNumber}`);
      const pointTypeLabel = esc(pointTypeLabels[point.pointType] || String(point.pointType || 'Punto ad alto flusso').replace(/_/g, ' '));
      const timeSlot = esc(point.timeSlot || 'Da definire');
      const durationHours = Math.max(1, Number(point.serviceDurationHours || 4));
      const overlapNote = colocatedIndexes.length > 1
        ? '<div class="vp-promoter-map-card__row"><span class="vp-promoter-map-card__label">Posizione</span><span class="vp-promoter-map-card__value">Pin separato per leggibilità</span></div>'
        : '';
      const cardHtml = `<div class="vp-promoter-map-card">
        <div class="vp-promoter-map-card__head">
          <span class="vp-promoter-map-card__number" style="background:${markerColor}">${markerNumber}</span>
          <div><div class="vp-promoter-map-card__title">Promoter ${markerNumber}</div><div class="vp-promoter-map-card__subtitle">Postazione operativa pianificata</div></div>
        </div>
        <div class="vp-promoter-map-card__body">
          <div class="vp-promoter-map-card__address">${pointLabel}</div>
          <div class="vp-promoter-map-card__row"><span class="vp-promoter-map-card__label">Tipo punto</span><span class="vp-promoter-map-card__value" style="color:${markerColor}">${pointTypeLabel}</span></div>
          <div class="vp-promoter-map-card__row"><span class="vp-promoter-map-card__label">Fascia oraria</span><span class="vp-promoter-map-card__value">${timeSlot}</span></div>
          <div class="vp-promoter-map-card__row"><span class="vp-promoter-map-card__label">Durata</span><span class="vp-promoter-map-card__value">${durationHours} ore</span></div>
          <div class="vp-promoter-map-card__row"><span class="vp-promoter-map-card__label">Capacità stimata</span><span class="vp-promoter-map-card__value">${formatItNumber(assignedQuantity)} pz.</span></div>
          <div class="vp-promoter-map-card__row"><span class="vp-promoter-map-card__label">Micro-zona</span><span class="vp-promoter-map-card__value">${formatItNumber(microRadius)} m</span></div>
          ${overlapNote}
        </div>
      </div>`;
      L.marker([displayLat, displayLng], { icon: promoterIcon, zIndexOffset: 2600 + index, pane: 'radiusCenterPane', title: `Promoter ${markerNumber}: ${pointLabel}` })
        .bindTooltip(cardHtml, { className: 'vp-promoter-tooltip', direction: 'top', offset: [0, -13], opacity: 1 })
        .bindPopup(cardHtml, { className: 'vp-promoter-popup', offset: [0, -10], maxWidth: 280, closeButton: true })
        .addTo(group);
    });

    const operationalFitSignature = validOperationalPoints
      .map((point) => `${point.id || point.promoterNumber || ''}:${Number(point.lat).toFixed(6)}:${Number(point.lng).toFixed(6)}`)
      .sort()
      .join('|');
    if (validOperationalPoints.length > 1 && autoFitRef.current.operational !== operationalFitSignature) {
      autoFitRef.current.operational = operationalFitSignature;
      map.fitBounds(validOperationalPoints.map((point) => [Number(point.lat), Number(point.lng)]), { padding: [55, 55], maxZoom: 14 });
    } else if (validOperationalPoints.length <= 1) {
      autoFitRef.current.operational = operationalFitSignature;
    }

    if (settoriActive) {
      const settoriGroup = L.layerGroup().addTo(map);
      layersRef.current.settoriGroup = settoriGroup;

      // Build municipality lookup from zonesWithCoords so we can show real names
      const munByCode = {};
      if (zonesWithCoords) {
        zonesWithCoords.forEach(z => {
          const k = z.municipality_code || z.municipalityCode;
          if (k) munByCode[k] = z;
        });
      }

      const munSectorCounts = {};
      settori.forEach(s2 => {
        const k = s2.municipalityCode || s2.municipality_code;
        if (k) munSectorCounts[k] = (munSectorCounts[k] || 0) + 1;
      });

      settori.forEach((s, idx) => {
        if (!s.geometry) return;

        // â”€â”€ Filtra settori per comune appartenente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Mostra solo settori del comune primario (o dei comuni esplicitamente
        // selezionati in radius mode). Impedisce che settori di Milano appaiano
        // quando l'utente ha selezionato Sesto San Giovanni o Cormano.
        const sMunCode = s.municipalityCode || s.municipality_code;
        const sMunZone = sMunCode ? munByCode[sMunCode] : null;
        const sMunName = normalizeMapMunicipalityName(sMunZone?.name);
        const matchesPrimaryMunicipality = primaryMunCode && sMunCode
          ? String(sMunCode) === String(primaryMunCode)
          : Boolean(cityName && sMunName && sMunName === cityName);
        if (isMunicipalityMode) {
          // In municipality mode: mostra SOLO i settori del comune selezionato
          if (!matchesPrimaryMunicipality) {
            return;
          }
        } else {
          // In radius mode: mostra settori del comune primario; aggiungi altri
          // SOLO se il relativo comune Ã¨ stato esplicitamente selezionato.
          if (!matchesPrimaryMunicipality) {
            const isExplicitlySelected = isD2D && sMunZone && selected?.includes(sMunZone.id);
            if (!isExplicitlySelected) {
              return;
            }
          }
        }

        try {
          const gj     = typeof s.geometry === 'string' ? JSON.parse(s.geometry) : s.geometry;
          const num    = s.numero || (idx + 1);
          const sId    = s.id ?? `s_${idx}`;
          const isSel  = selectedSectorId === sId;

          const munCode  = sMunCode;
          const munZone  = sMunZone;
          const isMunSel = isD2D && munZone && selected?.includes(munZone.id);

          const styleDef = {
            color:       isMunSel ? '#2A6E48' : '#2D6FA6',
            fillColor:   isMunSel ? '#3D8C5E' : '#4A8EC0',
            fillOpacity: Math.max(0.006, Math.min(0.08, 0.02 * opacityScale)),
            weight:      0.65,
            opacity:     0.28,
            dashArray:   '5 4',
          };
          const styleSel = {
            color:       col,
            fillColor:   col,
            fillOpacity: Math.max(0.010, Math.min(0.12, 0.03 * opacityScale)),
            weight:      1,
            opacity:     0.58,
            dashArray:   null,
            lineCap:     'round',
            lineJoin:    'round',
          };

          const poly = L.geoJSON(gj, {
            style: isSel ? styleSel : styleDef,
            interactive: true,
          });

          // Hover effect
          poly.on('mouseover', () => poly.setStyle({ fillOpacity: isSel ? 0.055 : 0.04, weight: isSel ? 1.15 : 0.9 }));
          poly.on('mouseout',  () => poly.setStyle(isSel ? styleSel : styleDef));

          // Click: toggle selection
          poly.on('click', () => {
            setSelectedSectorId(prev => prev === sId ? null : sId);
          });

          poly.bindTooltip(
            _buildSectorTip(s, num, munByCode, svcType, city, munSectorCounts, selected, isD2D),
            { direction: 'top', opacity: 1, sticky: false, offset: [0, -4] }
          ).addTo(settoriGroup);

          // Labels: zoom-dependent â€” none <12, active only 12-14, all â‰¥15
          if (showSomeLabels && (showAllLabels || isSel)) {
            const bounds = poly.getBounds();
            const center = bounds.getCenter();
            const labelW = s.name ? Math.max(28, s.name.length * 5.5 + 16) : 28;
            const bgCol  = isSel ? col : (isMunSel ? 'rgba(12,52,32,0.90)' : 'rgba(12,32,62,0.88)');
            const txCol  = isSel ? '#fff' : (isMunSel ? '#7EE8B0' : '#7EB8E8');
            const bdCol  = isSel ? col : (isMunSel ? 'rgba(45,130,78,0.65)' : 'rgba(45,111,166,0.65)');
            const labelIcon = L.divIcon({
              html: `<div style="
                background:${bgCol};
                color:${txCol};
                border-radius:4px;padding:3px 6px;
                font-size:10px;font-weight:700;
                font-family:system-ui,sans-serif;
                border:1.5px solid ${bdCol};
                white-space:nowrap;line-height:1.3;letter-spacing:0.04em;
                box-shadow:0 2px 6px rgba(0,0,0,0.28);
                text-align:center;
              ">S${num}${s.name ? `<br><span style="font-size:8px;font-weight:400;opacity:0.75;letter-spacing:0">${esc(s.name)}</span>` : ''}</div>`,
              className: '',
              iconSize: [labelW, s.name ? 28 : 18],
              iconAnchor: [labelW / 2, s.name ? 14 : 9],
            });
            L.marker([center.lat, center.lng], {
              icon: labelIcon, interactive: false, zIndexOffset: 400,
            }).addTo(settoriGroup);
          }

        } catch (_e) { debugStep2('[Step2Map] settore error', _e); }
      });
    }

    // â”€â”€ 4. POI reali (Overpass) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Uses only the already filtered POI prop. Raw analysis metadata must not
    // appear here: it contains mixed categories and creates misleading dots
    // while the selected activity (for example Fitness) is being resolved.
    // Se la ricerca ha restituito attivitÃ  coerenti con la campagna, queste
    // restano visibili anche quando una vecchia configurazione aveva il layer off.
    const poiActive = pois?.length > 0 || activeLayers?.poi !== false;

    if (poiActive && pois?.length > 0) {
      const poiGroup = L.layerGroup().addTo(map);
      layersRef.current.poiGroup = poiGroup;

      // Cell size scales with radius: bigger area â†’ coarser clustering
      const cellDeg = mapZoom >= 15 ? 0.00001 : effectiveMapRadius <= 2 ? 0.0015 : effectiveMapRadius <= 5 ? 0.003 : 0.005;
      // Con pochi risultati mostriamo sempre ogni singolo punto: sono scelte operative,
      // non semplici indicatori statistici. Il clustering resta utile solo su liste grandi.
      const clusters = pois.length <= 30
        ? pois.map((poi) => ({ ...poi, isCluster: false }))
        : gridCluster(pois, cellDeg);

      clusters.forEach(item => {
        if (item.isCluster) {
          // Cluster bubble: size grows with count, color from dominant category
          const s = Math.min(34, 24 + Math.log2(item.count) * 3);
          const clusterLabel = item.count === 1 ? '1 punto raggruppato' : `${item.count} punti raggruppati`;
          const clusterIcon = L.divIcon({
            html: `<div role="img" aria-label="${esc(clusterLabel)}" title="${esc(clusterLabel)}" style="
              width:${s}px;height:${s}px;border-radius:50%;
              background:${item.color};opacity:0.74;
              border:1px solid rgba(255,255,255,0.38);
              display:flex;align-items:center;justify-content:center;
              font-size:${Math.max(8, Math.floor(s * 0.38))}px;font-weight:700;
              color:#fff;font-family:system-ui,sans-serif;
              box-shadow:0 2px 6px rgba(0,0,0,0.28);
              pointer-events:auto;
            ">${item.count}</div>`,
            className: '',
            iconSize: [s, s],
            iconAnchor: [s / 2, s / 2],
          });
          const catCounts = {};
          item.pois.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
          const tipLines = Object.entries(catCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat, n]) => `${n}Ã— ${esc(cat)}`);
          L.marker([item.lat, item.lng], { icon: clusterIcon, zIndexOffset: 300, pane: 'poiSelectionPane', alt: clusterLabel })
            .bindTooltip(
              `<b>${esc(clusterLabel)}</b><br>${tipLines.join('<br>')}<br><span style="color:#7DD3FC">Clicca per vedere i singoli punti</span>`,
              { direction: 'top', offset: [0, -4], opacity: 1 }
            )
            .on('click', () => map.setView([item.lat, item.lng], Math.max(15, map.getZoom() + 2), { animate: true }))
            .addTo(poiGroup);
        } else {
          // Punto selezionabile: marker grande, sopra gli altri layer operativi.
          const assignment = poiAssignments?.[item.id] || null;
          const isSel = Boolean(assignment);
          const businessDetails = svcType === 'b2b'
            ? [
                item.distanceKm != null ? `<span>Distanza: ${Number(item.distanceKm).toFixed(1)} km</span>` : null,
                `<span>Fonte: ${esc(item.source || 'OpenStreetMap / Overpass')}</span>`,
                assignment ? `<span>Copie: ${Number(assignment.copies || 1)}</span>` : null,
                businessConfig?.deliveryLabel ? `<span>Consegna: ${esc(businessConfig.deliveryLabel)}</span>` : null,
                businessConfig?.recipientLabel ? `<span>Referente: ${esc(businessConfig.recipientLabel)}</span>` : null,
              ].filter(Boolean).join('<br>')
            : '';
          const assignmentLabel = assignment
            ? (svcType === 'b2b'
                ? `<br><span style="color:#4ADE80;font-weight:700">✓ Attività selezionata</span>${businessDetails ? `<br>${businessDetails}` : ''}`
                : `<br><span style="color:#4ADE80;font-weight:700">Assegnato a Promoter ${Number(assignment.operatorNumber || 1)}</span>`)
            : (svcType === 'b2b'
                ? `<br>${businessDetails ? `${businessDetails}<br>` : ''}<span style="color:#7DD3FC">Clicca per selezionare l'attività</span>`
                : '<br><span style="color:#7DD3FC">Clicca per aggiungere e assegnare</span>');
          const contextLabel = svcType === 'd2d'
            ? '<br><span style="color:#7DD3FC">AttivitÃ  presente dentro il raggio selezionato</span>'
            : assignmentLabel;
          const tip = `${_buildPoiTip(item)}${contextLabel}`;
          const poiMarker = L.marker([item.lat, item.lng], {
            icon: svcType === 'd2d'
              ? informationalPoiIcon(L, item.color || categoryColor(item.category), item.category)
              : selectablePoiIcon(L, item.color || categoryColor(item.category), isSel, assignment?.operatorNumber, item.category),
            zIndexOffset: isSel ? 500 : 200,
            pane: 'poiSelectionPane',
          }).bindTooltip(tip, { direction: 'top', offset: [0, -16], opacity: 1 });
          if (svcType !== 'd2d') poiMarker.on('click', () => onTogglePoi?.(item));
          poiMarker.addTo(poiGroup);
        }
      });

      const assignedPoiPoints = pois.filter((poi) => poiAssignments?.[poi.id]);
      const assignmentFitSignature = assignedPoiPoints
        .map((poi) => `${poi.id}:${Number(poi.lat).toFixed(6)}:${Number(poi.lng).toFixed(6)}:${Number(poiAssignments?.[poi.id]?.operatorNumber || 1)}`)
        .sort()
        .join('|');
      if (assignedPoiPoints.length > 0 && autoFitRef.current.assignments !== assignmentFitSignature) {
        autoFitRef.current.assignments = assignmentFitSignature;
        const boundsPoints = assignedPoiPoints.map((poi) => [Number(poi.lat), Number(poi.lng)]);
        if (city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lng))) {
          boundsPoints.push([Number(city.lat), Number(city.lng)]);
        }
        map.fitBounds(boundsPoints, { padding: [55, 55], maxZoom: 14 });
      } else if (assignedPoiPoints.length === 0) {
        autoFitRef.current.assignments = '';
      }

    }

    // â”€â”€ 5. Density choropleth (D2D) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Colored comuni polygons by family count â€” CartoDB blue sequential scale.
    const civiciPoints = Array.isArray(civiciState?.points) ? civiciState.points : [];
    if (activeLayers?.civici === true && civiciPoints.length > 0) {
      const civiciGroup = L.layerGroup().addTo(map);
      layersRef.current.civiciGroup = civiciGroup;
        const maxPoints = effectiveMapRadius <= 2 ? 500 : effectiveMapRadius <= 5 ? 350 : 200;

      civiciPoints.slice(0, maxPoints).forEach((point) => {
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
        const label = [point.via, point.numeroCivico].filter(Boolean).join(' ') || 'Civico';
        const comune = point.comune ? `<br><span style="color:rgba(255,255,255,0.5)">${esc(point.comune)}</span>` : '';
        L.circleMarker([point.lat, point.lng], {
          radius: Math.max(1.8, Math.min(3.2, 2.3 * opacityScale)),
          color: 'rgba(15,23,42,0.62)',
          weight: 0.6,
          fillColor: '#4B5568',
          fillOpacity: Math.min(0.78, 0.58 * opacityScale),
          opacity: Math.min(0.86, 0.68 * opacityScale),
          interactive: true,
        }).bindTooltip(
          `<b>${esc(label)}</b>${comune}<br><span style="color:rgba(255,255,255,0.42)">OSM - copertura parziale</span>`,
          { direction: 'top', offset: [0, -4], opacity: 1 }
        ).addTo(civiciGroup);
      });
    }

    if (activeLayers?.density === true && svcType === 'd2d' && zonesWithCoords?.length > 0) {
      const densityGroup = L.layerGroup().addTo(map);
      layersRef.current.densityGroup = densityGroup;

      const famValues = zonesWithCoords.map(z => z.families || 0).filter(v => v > 0);
      if (famValues.length > 0) {
        const breaks = computeBreaks(famValues);
        zonesWithCoords.forEach(z => {
          if (!z.geometry) return;
          try {
            const gj  = typeof z.geometry === 'string' ? JSON.parse(z.geometry) : z.geometry;
            const fam = z.families || 0;
            const fillCol = choroplethColor(fam, breaks);
            L.geoJSON(gj, {
              style: {
                color:       '#1e3a8a',
                fillColor:   fillCol,
                fillOpacity: 0.08,
                weight:      0.8,
                opacity:     0.42,
              },
              interactive: true,
            }).bindTooltip(
              `<b>${esc(z.name)}</b><br>Famiglie: <b>${(fam).toLocaleString("it-IT", { useGrouping: true })}</b>`,
              { direction: 'center', sticky: true, opacity: 1 }
            ).addTo(densityGroup);
          } catch (_e) {
            debugStep2('[Step2Map] density polygon parse error', _e);
          }
        });
      }
    }

    if (import.meta.env.DEV && (import.meta.env.VITE_DEBUG_STEP2 === 'true' || window.__VOLANTINIPRO_DEBUG_STEP2__)) {
      let groupLayerCount = 0;
      let totalLeafletLayerCount = 0;
      try { group.eachLayer(() => { groupLayerCount += 1; }); } catch (_e) {}
      try { map.eachLayer(() => { totalLeafletLayerCount += 1; }); } catch (_e) {}
      window.__VOLANTINIPRO_STEP2_MAP_STATE__ = {
        zonesWithCoordsCount: Array.isArray(zonesWithCoords) ? zonesWithCoords.length : 0,
        zonesWithCoordsNilCount: Array.isArray(zonesWithCoords) ? zonesWithCoords.filter(z => z?.isNil || z?.territoryLevel === 'nil').length : 0,
        zonesWithCoordsGeometryCount: Array.isArray(zonesWithCoords) ? zonesWithCoords.filter(z => Boolean(z?.geometry)).length : 0,
        renderedZonePolygonLayers,
        coveragePolygonsCount: Array.isArray(coveragePolygons) ? coveragePolygons.length : 0,
        renderedCoveragePolygonLayers,
        missingCoveragePolygonCount: missingGeometryNames.length,
        groupLayerCount,
        totalLeafletLayerCount,
        isMunicipalityMode,
        nilMode,
        unconfirmedAddressMode,
      };
    }

  }, [leafletLoaded, city, radius, zonesWithCoords, selected, apiData, svcType, serviceColor, targetColor, activeLayers, settori, selectedSectorId, pois, operationalPoints, poiAssignments, onTogglePoi, businessConfig, civiciState, mapZoom, campaignZones, activeZoneId, municipalityBoundary, isMunicipalityMode, nilMode, coveragePolygons, themeMode, activeLayerId, zoneCoverageById, zoneAllocationById, boundaryKpis, unconfirmedAddressMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="vp-step2-map-shell" style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', pointerEvents: 'auto', cursor: onMapClick ? 'crosshair' : 'default' }} />

      {/* Avviso opzionale: alcuni territori nel calcolo raggio non hanno una
          geometry disponibile â€” non nasconde i poligoni giÃ  renderizzati. */}
      {missingPolygonNames.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10, zIndex: 640,
          background: 'rgba(8,15,30,.9)', border: '1px solid rgba(251,191,36,.4)',
          borderRadius: 6, padding: '5px 9px', fontFamily: 'system-ui,sans-serif',
          fontSize: 10, color: '#FBBF24', maxWidth: 220,
        }}>
          Alcuni confini non disponibili ({missingPolygonNames.length})
        </div>
      )}

      {/* Schermata di caricamento */}
      {!leafletLoaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#e8e4dc',
          color: 'rgba(60,60,60,0.42)',
          fontFamily: 'system-ui,sans-serif',
          fontSize: 12,
          pointerEvents: 'none',
        }}>
          Caricamento mappa...
        </div>
      )}

      {/* La base geografica puÃ² essere pronta prima dei POI reali. Durante
          questa fase copriamo la vista provvisoria e spieghiamo l'aggiornamento. */}
      {leafletLoaded && city && loadingPois && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,15,30,.62)', backdropFilter: 'blur(2px)',
          pointerEvents: 'auto',
        }}>
          <div style={{
            minWidth: 250, maxWidth: '82%', padding: '16px 18px', borderRadius: 12,
            background: 'rgba(8,15,30,.95)', border: '1px solid rgba(34,197,94,.34)',
            boxShadow: '0 14px 38px rgba(0,0,0,.42)', textAlign: 'center',
            fontFamily: 'system-ui,sans-serif',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: '#4ADE80', fontSize: 13, fontWeight: 800 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 0 5px rgba(34,197,94,.13)' }} />
              Ricerca attivitÃ  nel raggio...
            </div>
            <div style={{ marginTop: 7, color: 'rgba(255,255,255,.58)', fontSize: 11, lineHeight: 1.45 }}>
              Stiamo caricando i punti reali. La mappa si aggiornerÃ  automaticamente.
            </div>
          </div>
        </div>
      )}

      {/* Prompt iniziale senza cittÃ  */}
      {leafletLoaded && !city && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 800,
        }}>
          <div style={{
            background: 'rgba(8,12,24,0.82)',
            backdropFilter: 'blur(5px)',
            borderRadius: 9,
            padding: '9px 16px',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.48)',
            fontFamily: 'system-ui,sans-serif',
            fontSize: 12,
            fontWeight: 600,
          }}>
            Cerca un comune per iniziare
          </div>
        </div>
      )}

      {/* Layer Panel GIS â€“ visibile quando city Ã¨ impostata e il config Ã¨ disponibile */}
      {leafletLoaded && city && layerPanelConfig && (
        <LayerPanel
          config={layerPanelConfig}
          activeLayers={activeLayers}
          settori={settori}
          civiciState={civiciState}
          onToggle={onLayerToggle}
          opacityLevel={opacityLevel}
          onOpacityChange={onOpacityChange}
          onReset={onLayerReset}
        />
      )}

      {/* Multi-zona accordion sidebar â€“ solo con 2+ zone */}
      {leafletLoaded && city && (
        <ZoneSidebar
          zones={campaignZones}
          activeZoneId={activeZoneId}
          onSelectZone={onSelectZone}
        />
      )}

      {/* Density legend â€“ shown when density layer is active for D2D */}
      {leafletLoaded && city && activeLayers?.density && svcType === 'd2d' && (
        <div style={{
          position: 'absolute', bottom: 22, left: 10, zIndex: 900,
          background: 'rgba(8,12,24,0.92)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7,
          padding: '7px 10px 6px',
          fontFamily: 'system-ui,-apple-system,sans-serif',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>
            Famiglie per comune
          </div>
          {[
            ['Molto alta', '#1d4ed8'],
            ['Alta',       '#3b82f6'],
            ['Media',      '#60a5fa'],
            ['Bassa',      '#93c5fd'],
            ['Minima',     '#dbeafe'],
          ].map(([label, color]) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 11, height: 11, borderRadius: 2, background: color, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.58)' }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const Step2Map = React.memo(Step2MapImpl);

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Riga "Stato: coperto/parziale/non coperto" con gli stessi colori della
// legenda (COVERAGE_MAP_COLORS) â€” usata sia dai tooltip zona che dal confine.
function _coverageStatusRow(status) {
  if (!status) return null;
  if (status === 'preview_main') return `Stato: <b style="color:#3B82F6">Preview (NIL principale)</b>`;
  if (status === 'preview_nearby') return `Stato: <b style="color:#64748B">Preview (NIL adiacente)</b>`;
  const label = status === 'coperto' ? 'Coperto' : status === 'parziale' ? 'Parziale' : 'Non coperto';
  const color = status === 'coperto' ? '#22C55E' : status === 'parziale' ? '#FACC15' : '#F87171';
  return `Stato: <b style="color:${color}">${label}</b>`;
}

function _buildZoneOrNilTooltip(z, col, sel, alloc = null, coverageStatus = null, isRadiusOrPreview = false) {
  const isNil = Boolean(z.isNil || z.territoryLevel === 'nil' || z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_')) || (typeof z.type === 'string' && z.type === 'nil'));
  
  if (z.status === 'preview_main' || z.status === 'preview_nearby') {
    return [
      `<b style="color:rgba(255,255,255,0.95)">${esc(z.name)} — ${z.status === 'preview_main' ? 'NIL Principale' : 'NIL Adiacente'}</b>`,
      `Famiglie: <b>${Number(z.families || 0).toLocaleString("it-IT", { useGrouping: true })}</b>`,
      `<i>Preview territoriale — seleziona raggio o comune per il calcolo</i>`,
    ].join('<br>');
  }

  const fmtIT = n => Number(n || 0).toLocaleString('it-IT', { useGrouping: true });
  const familiesVal = Number(z.families || 0);
  const codeRaw = z.code || z.nilCode || z.nil_code || (typeof z.id === 'string' && z.id.startsWith('nil_') ? z.id.replace(/^nil_/, '') : null);
  const codeStr = codeRaw != null && codeRaw !== '' ? String(codeRaw) : null;
  const hasValidCode = codeStr && codeStr.toLowerCase() !== String(z.name || '').toLowerCase() && !codeStr.startsWith('comune_') && !codeStr.startsWith('api_');

  const covPct = alloc?.coveragePercent ?? z.coveragePct ?? z.coverage ?? (alloc ? 100 : 0);
  const assignedVal = alloc?.assignedFlyers ?? z.assignedFlyers ?? (covPct > 0 ? Math.round(familiesVal * (covPct / 100)) : 0);
  const recommendedVal = alloc?.requiredFlyers ?? z.recommendedFlyers ?? z.volantiniNelRaggio ?? z.flyersMin ?? familiesVal;
  const statusVal = coverageStatus ?? z.status ?? (alloc?.status || null);
  const priorityRow = Number(alloc?.priorityRank) === 1 && Number(assignedVal) > 0
    ? '<span style="color:#FBBF24;font-weight:700">Prima zona prioritaria con la quantit\u00e0 attuale</span>'
    : null;

  const layerRow = z.metricLabel
    ? (z.metricFmt
        ? `<span style="color:${z.metricColor || col}">${esc(z.metricLabel)}: <b>${esc(z.metricFmt)}</b></span>`
        : `<span style="color:rgba(255,255,255,.35)">${esc(z.metricLabel)}: dato non disponibile</span>`)
    : null;

  if (isNil) {
    return [
      `<b style="color:rgba(255,255,255,0.95)">${esc(z.name)}</b>`,
      hasValidCode ? `Codice NIL: <b>${esc(codeStr)}</b>` : null,
      layerRow,
      priorityRow,
      `Famiglie: <b>${fmtIT(familiesVal)}</b>`,
      `Copertura: <b>${Math.round(covPct)}%</b>`,
      `Volantini assegnati: <b>${fmtIT(assignedVal)}</b>`,
      `Quantità consigliata: <b>${fmtIT(recommendedVal)}</b>`,
      _coverageStatusRow(statusVal),
      !isRadiusOrPreview ? (sel ? `<span style="color:#6EC4A0">✓ Selezionata</span>` : `<span style="color:rgba(255,255,255,0.32)">○ Non inclusa</span>`) : null,
    ].filter(Boolean).join('<br>');
  }

  const _wPct = z.weightPct === 0 && familiesVal > 0 ? '<1' : (z.weightPct || 0);
  const density = z.area > 0 ? Math.round(familiesVal / z.area) : null;
  const tipoRow = `<span style="color:rgba(255,255,255,.6);font-size:11px">Tipo: Comune</span>`;
  return [
    `<b style="color:rgba(255,255,255,0.95)">${esc(z.name)}</b>`,
    tipoRow,
    layerRow,
    priorityRow,
    `Famiglie: <b>${fmtIT(familiesVal)}</b>`,
    density ? `Densità: <b>${fmtIT(density)} fam/km²</b>` : null,
    alloc || z.assignedFlyers != null ? `Volantini assegnati: <b>${fmtIT(assignedVal)}</b>` : null,
    `Quantità consigliata: <b>${fmtIT(recommendedVal)}</b>`,
    alloc || z.coveragePct != null ? `Copertura: <b>${Math.round(covPct)}%</b>` : `Copertura: ${_wPct}%`,
    _coverageStatusRow(statusVal),
    !isRadiusOrPreview ? (sel ? `<span style="color:#6EC4A0">✓ Selezionata</span>` : `<span style="color:rgba(255,255,255,0.32)">○ Non inclusa</span>`) : null,
  ].filter(Boolean).join('<br>');
}

function _buildD2DTip(z, col, sel, alloc = null, coverageStatus = null) {
  return _buildZoneOrNilTooltip(z, col, sel, alloc, coverageStatus, false);
}

function _buildCoveragePolygonTip(z) {
  return _buildZoneOrNilTooltip(z, '#34D399', false, null, z.status, true);
}

// Tooltip per un POI Overpass â€” nome, categoria, indirizzo reali.
function _buildPoiTip(poi) {
  return [
    `<b>${esc(poi.name)}</b>`,
    `<span style="color:${poi.color};opacity:0.88">${esc(poi.category)}</span>`,
    poi.address ? `<span style="color:rgba(255,255,255,0.45)">${esc(poi.address)}</span>` : null,
    poi.openingHours ? `<span style="color:rgba(255,255,255,0.32);font-size:10px">${esc(poi.openingHours)}</span>` : null,
  ].filter(Boolean).join('<br>');
}

// Tooltip per un settore operativo â€” dati reali dal lookup comunale.
function _buildSectorTip(s, num, munByCode, svcType, city, munSectorCounts, selected, isD2D) {
  const munCode  = s.municipalityCode || s.municipality_code;
  const mun      = munCode && munByCode[munCode];
  const munName  = mun?.name || city?.label || city?.name || 'â€”';
  const nSectors = (munCode && munSectorCounts?.[munCode]) || 1;
  const famTot   = mun?.families || 0;
  const flyTot   = mun?.volantiniNelRaggio || mun?.flyersMin || famTot;
  const famSec   = famTot > 0 ? Math.round(famTot / nSectors).toLocaleString("it-IT", { useGrouping: true }) : null;
  const flySec   = flyTot > 0 ? Math.round(flyTot / nSectors).toLocaleString("it-IT", { useGrouping: true }) : null;
  const isMunSel = isD2D && mun && selected?.includes(mun.id);
  const name     = s.name ? ` â€” ${esc(s.name)}` : '';

  const statusLine = isD2D
    ? (isMunSel
        ? `<span style="color:#5DBE8A">âœ“ Comune incluso nella campagna</span>`
        : `<span style="color:rgba(255,255,255,0.38)">â—‹ Comune non selezionato</span>`)
    : null;

  return [
    `<b style="color:rgba(255,255,255,0.95)">S${num}${name}</b>`,
    `<span style="color:rgba(255,255,255,0.45);font-size:9px">${esc(munName)}</span>`,
    famSec ? `Famiglie stimate: <b>~${famSec}</b>` : null,
    flySec ? `Quantità consigliata: <b>~${flySec}</b>` : null,
    statusLine,
  ].filter(Boolean).join('<br>');
}

// Fallback circolare quando la geometria GeoJSON non Ã¨ disponibile
function _renderD2DCircle(L, z, col, sel, tip, group, onToggleZone, styleUnsel, styleSel) {
  const r = Math.max(350, Math.sqrt((z.area || 1) * 1e6 / Math.PI) * 0.4);
  const cs = sel ? styleSel : styleUnsel;
  L.circle([z.lat, z.lng], {
    radius: r,
    color: cs.color, fillColor: cs.fillColor || cs.color,
    fillOpacity: cs.fillOpacity, weight: cs.weight, opacity: cs.opacity,
    dashArray: cs.dashArray || null,
    interactive: true,
  }).bindTooltip(tip, { direction: 'top', offset: [0, -8], opacity: 1 })
    .on('click', () => onToggleZone?.(z.id))
    .addTo(group);

  if (!z.lat || !z.lng) return;
  L.marker([z.lat, z.lng], {
    icon: dotIcon(L, sel ? col : ZONE_UNSEL.color, null, sel),
    zIndexOffset: sel ? 600 : 400,
  }).bindTooltip(tip, { direction: 'top', offset: [0, -8], opacity: 1 })
    .on('click', () => onToggleZone?.(z.id))
    .addTo(group);
}
