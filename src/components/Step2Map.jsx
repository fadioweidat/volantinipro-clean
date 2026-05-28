import { useEffect, useRef, useState } from 'react';

// CartoDB Voyager – leggibile, strade visibili, aspetto GIS operativo
const CARTO_VOYAGER = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ── POI categories: palette GIS professionale, toni desaturati ──────────────
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

function parseGeoJsonValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const first = JSON.parse(value);
    if (typeof first === 'string') {
      const s = first.trim();
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        return JSON.parse(s);
      }
    }
    return first;
  } catch {
    return null;
  }
}

// CSS applicato globalmente una sola volta
const MAP_CSS = `
/* Voyager: nessun filter – strade, nomi comuni e vie sono visibili per default */
.leaflet-container {
  background: #f1eee7 !important;
  pointer-events: auto !important;
}
.leaflet-tile {
  filter: brightness(1.08) contrast(1.10) saturate(0.94);
}
.gis-radius-glow {
  filter: drop-shadow(0 0 10px rgba(232,87,26,0.12));
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

// ── Marker icons ─────────────────────────────────────────────────────────────

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

// Centro città: discreto, brand color
function pinIcon(L, color) {
  return L.divIcon({
    html: `<div style="width:11px;height:11px;border-radius:50%;background:${color};border:2px solid rgba(0,0,0,0.28);box-shadow:0 1px 5px rgba(0,0,0,0.35);pointer-events:none;"></div>`,
    className: '',
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
  });
}

// ── Colori e icone del layer panel ───────────────────────────────────────────
// Toni GIS professionali, nessun neon
const LAYER_META = {
  // Base
  radius:   { color: '#C4852A', icon: '○', label: 'Raggio'        },
  // Territory
  comuni:   { color: '#5B7FA6', icon: '▭', label: 'Comuni'        },
  settori:  { color: '#4A6E8A', icon: '▤', label: 'Settori'       },
  // Points
  poi:      { color: '#4E8E6E', icon: 'P', label: 'POI'           },
  transport:{ color: '#2563EB', icon: 'T', label: 'TPL'            },
  civici:   { color: '#4B5568', icon: '▦', label: 'Civici'        },
  // Phase 2 overlays (structure — future: true, no live data yet)
  density:  { color: '#3B82F6', icon: '▒', label: 'Densità fam.'  },
  hotspot:  { color: '#A855F7', icon: '◉', label: 'Hotspot H2H'   },
  cluster:  { color: '#F59E0B', icon: '⬡', label: 'Cluster B2B'  },
  // Live
  tracking: { color: '#4B5568', icon: '◎', label: 'Tracking GPS'  },
};

const TRANSPORT_SOURCE_LABELS = {
  atm_milano: 'ATM Milano',
  trenord_lombardia: 'Trenord',
};

function getTransportLayerLabel(transportState, transportAvailable) {
  if (!transportAvailable) return 'Dati TPL non disponibili';
  const sources = Array.isArray(transportState?.sources)
    ? transportState.sources.filter(Boolean)
    : [];
  const stopSources = Array.isArray(transportState?.stops)
    ? transportState.stops.map((stop) => stop.source).filter(Boolean)
    : [];
  const uniqueSources = Array.from(new Set([...sources, ...stopSources])).sort();
  if (uniqueSources.length > 1) return 'TPL · fonti multiple';
  if (uniqueSources.length === 1) return `TPL · ${TRANSPORT_SOURCE_LABELS[uniqueSources[0]] || uniqueSources[0]}`;
  const label = transportState?.label;
  if (label && label !== 'Dati TPL non disponibili') return label;
  const routeTypes = Array.isArray(transportState?.routeTypes) ? transportState.routeTypes : [];
  if (routeTypes.length === 1 && routeTypes[0] === 'train') return 'TPL · Trenord';
  if (routeTypes.some((type) => ['metro', 'tram', 'bus'].includes(type))) return 'TPL · ATM Milano';
  return 'TPL';
}

function LayerPanel({ config, svcType, activeLayers, settori, civiciState, transportState, onToggle, opacityLevel, onOpacityChange, onReset }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!config || config.length === 0) return null;
  const visibleConfig = config.filter(layer => layer.available !== false);
  const primaryIds = svcType === 'h2h' ? ['radius', 'poi', 'transport'] : ['radius', 'comuni', 'settori', 'civici', 'poi'];
  const primaryLayers = visibleConfig.filter(layer => primaryIds.includes(layer.id));
  const hasAdvancedLayers = svcType !== 'h2h' && visibleConfig.length > primaryLayers.length;
  const civiciCount =
    Number(civiciState?.count || 0) ||
    Number(civiciState?.bboxCount || 0);
  const civiciAvailable =
    Boolean(civiciState?.available) || civiciCount > 0;
  const transportAvailable = Boolean(
    transportState?.available ||
    Number(transportState?.count || 0) > 0 ||
    (transportState?.stops || []).length > 0
  );
  const transportLabel = getTransportLayerLabel(transportState, transportAvailable);
  const civiciLabel = civiciAvailable ? 'OSM · copertura parziale' : 'Civici non disponibili';
  const civiciMessage = civiciAvailable
    ? (civiciState?.message || 'Civici OSM presenti nel bbox selezionato. Copertura non completa.')
    : (civiciState?.message || 'Serve una fonte dati civici/address points completa per questa zona.');
  const hasCiviciLayer = primaryLayers.some((layer) => layer.id === 'civici');

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
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>▦</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', flex: 1 }}>
          Layer
        </span>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>
          {collapsed ? '▾' : '▴'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 0 3px' }}>
          {primaryLayers.map(layer => {
            const meta = LAYER_META[layer.id] || { color: '#5B7FA6', icon: '○' };
            const civiciDisabled = layer.id === 'civici' && !civiciAvailable;
            const isOn = civiciDisabled ? false : (activeLayers?.[layer.id] ?? layer.defaultOn ?? false);
            const active = isOn && !layer.future && !civiciDisabled;
            const settoriNoData = layer.id === 'settori' && !layer.future && isOn
              && (!settori || settori.length === 0);
            
            const civiciTag = layer.id === 'civici'
              ? (civiciAvailable ? { bg: 'rgba(22,163,74,0.14)', fg: 'rgba(34,197,94,0.82)', txt: civiciLabel } : { bg: 'rgba(148,163,184,0.14)', fg: 'rgba(148,163,184,0.82)', txt: civiciLabel })
              : null;
            const transportTag = layer.id === 'transport'
              ? (transportAvailable ? { bg: 'rgba(37,99,235,0.16)', fg: 'rgba(147,197,253,0.88)', txt: transportLabel } : { bg: 'rgba(148,163,184,0.14)', fg: 'rgba(148,163,184,0.82)', txt: transportLabel })
              : null;

            return (
              <div
                key={layer.id}
                onClick={!layer.future && !civiciDisabled ? () => onToggle?.(layer.id) : undefined}
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
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Left color stripe – GIS layer indicator */}
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
                        letterSpacing: '0.04em',
                      }}>
                        {civiciTag.txt}
                      </span>
                    )}
                    {transportTag && (
                      <span style={{
                        fontSize: 7,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: transportTag.bg,
                        color: transportTag.fg,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                      }}>
                        {transportTag.txt}
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
          {hasCiviciLayer && (
            <div style={{
              padding: '6px 10px 4px',
              fontSize: 9,
              color: 'rgba(255,255,255,0.36)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div>{civiciMessage}</div>
              {civiciAvailable && civiciCount > 0 && (
                <div>{civiciCount.toLocaleString('it-IT')} civici OSM nel raggio</div>
              )}
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
                Opacità
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

// ── Colori GIS per le zone non selezionate ───────────────────────────────────
const ZONE_UNSEL = { color: '#2D5A8E', fill: '#3A72A8' };

// ── Multi-zona accordion sidebar ─────────────────────────────────────────────
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
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>⬡</span>
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
                    ◎ {rad} km
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
              <span style={{ fontSize: 8, color: 'rgba(127,155,176,0.60)', padding: '6px 7px 6px 10px', flexShrink: 0 }}>○</span>
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

// ── Grid-clustering helper for POI markers ────────────────────────────────────
// Groups nearby POI into clusters without a CDN plugin.
// cellDeg ≈ 0.003° ≈ 250m at Italian latitudes.
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

function transportMarkerStyle(type) {
  if (type === 'metro') return { color: '#dc2626', stroke: '#7f1d1d', radius: 6.2 };
  if (type === 'tram') return { color: '#16a34a', stroke: '#14532d', radius: 5.2 };
  if (type === 'bus') return { color: '#2563eb', stroke: '#1e3a8a', radius: 4.4 };
  if (type === 'train') return { color: '#7c3aed', stroke: '#4c1d95', radius: 5.8 };
  return { color: '#64748b', stroke: '#334155', radius: 4 };
}

function transportTypeLabel(type) {
  if (type === 'metro') return 'Metro';
  if (type === 'tram') return 'Tram';
  if (type === 'bus') return 'Bus';
  if (type === 'train') return 'Treno';
  return 'Fermata TPL';
}

export function Step2Map({
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
  civiciState,
  transportState,
  onLayerToggle,
  layerPanelConfig,
  campaignZones, // Nuovi parametri per multi-zona
  activeZoneId,
  onSelectZone,
  themeMode,
  opacityLevel,
  onOpacityChange,
  onLayerReset,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const viewRef = useRef({ lat: null, lng: null, radius: null });
  const [leafletLoaded, setLeafletLoaded] = useState(!!window.L);
  const [selectedSectorId, setSelectedSectorId] = useState(null);
  const [mapZoom, setMapZoom] = useState(null);

  // Carica Leaflet JS + CSS una sola volta
  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }

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
      script.onerror = () => console.warn('[Step2Map] Leaflet non caricato');
      document.head.appendChild(script);
    }
  }, []);

  // CSS mappa – iniettato una sola volta (rimuove il vecchio stile se presente)
  useEffect(() => {
    document.getElementById('vp-leaflet-dark')?.remove();
    if (document.getElementById('vp-map-css')) return;
    const style = document.createElement('style');
    style.id = 'vp-map-css';
    style.textContent = MAP_CSS;
    document.head.appendChild(style);
  }, []);

  // Inizializza mappa
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
      zoom: city ? getZoomForRadius(radius) : 6,
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
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.dragging.enable();
    map.touchZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
    map.on('zoomend', () => { setMapZoom(map.getZoom()); });

    const mbToken = typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_TOKEN;
    if (mbToken && mbToken.startsWith('pk.')) {
      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${mbToken}`,
        { tileSize: 512, zoomOffset: -1, attribution: 'Mapbox OpenStreetMap', maxZoom: 19 }
      ).addTo(map);
    } else {
      L.tileLayer(CARTO_VOYAGER, { attribution: CARTO_ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    }

    return () => { map.remove(); mapRef.current = null; };
  }, [leafletLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ridisegna tutti i layer quando i dati o la visibilità cambiano
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

    const col = serviceColor || '#ff6b1a';
    const opacityScale = opacityLevel === 'low' ? 0.65 : opacityLevel === 'high' ? 1.25 : 1;
    const nextView = { lat: Number(city.lat), lng: Number(city.lng), radius: Number(radius) };
    const viewChanged =
      viewRef.current.lat !== nextView.lat ||
      viewRef.current.lng !== nextView.lng ||
      viewRef.current.radius !== nextView.radius;
    if (viewChanged) {
      map.setView([city.lat, city.lng], getZoomForRadius(radius), { animate: false });
      viewRef.current = nextView;
    }

    const group = L.layerGroup().addTo(map);
    layersRef.current.group = group;

    // ── DRAW ALL CAMPAIGN ZONES ──
    const zonesList = campaignZones || [];
    zonesList.forEach(z => {
      const isActive = z.id === activeZoneId;
      const zCity = z.city || (isActive ? city : null);
      if (!zCity || !zCity.lat || !zCity.lng) return;

      const zRadius = parseFloat(z.radiusKm ?? z.radius ?? z.radius_km ?? 3);
      const zSvc = z.service_type || 'd2d';
      const zCol = isActive ? col : '#7F9BB0';
      const isRingOn = isActive ? (activeLayers?.radius !== false) : true;

      // ── 1. Raggio / Circle ──
      if (isRingOn) {
        L.circle([zCity.lat, zCity.lng], {
          radius: zRadius * 1000,
          color: zCol,
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: isActive ? 1.6 : 0.7,
          dashArray: isActive ? '9 7' : '4 6',
          opacity: isActive ? 0.72 : 0.18,
          className: isActive ? 'gis-radius-glow' : '',
          interactive: false,
        }).addTo(isActive ? map : group);
      }

      // ── 2. Center Pin ──
      const tooltipContent = isActive 
        ? `<b>${esc(zCity.label || zCity.name || 'Centro')}</b><br><span style="color:${zCol};opacity:0.85">${zRadius} km raggio (Attiva)</span>`
        : `<b>${esc(zCity.label || zCity.name || 'Centro')}</b><br><span style="color:${zCol};opacity:0.75">${zRadius} km raggio<br><i>Clicca per attivare</i></span>`;

      const marker = L.marker([zCity.lat, zCity.lng], {
        icon: pinIcon(L, zCol), zIndexOffset: isActive ? 2000 : 1000,
      }).bindTooltip(tooltipContent, { direction: 'top', offset: [0, -10], opacity: 1 }).addTo(isActive ? map : group);

      if (!isActive) {
        // Cliccando su una zona inattiva, la attiva!
        marker.on('click', () => {
          if (onSelectZone) onSelectZone(z.id);
        });
      }
    });

    if (import.meta.env.DEV) {
      console.debug('[Step2Map] svcType:', svcType,
        '| zones:', zonesWithCoords?.length ?? 0,
        '| settori:', settori?.length ?? 'null',
        '| layers:', JSON.stringify(activeLayers));
    }

    // settoriActive: settori layer is on AND data is available
    const settoriActive = activeLayers?.settori !== false && settori?.length > 0;

    // ── 2. Comuni (confini comunali) ─────────────────────────────────────────
    // When settori are active, comuni become secondary (reduced opacity).
    if (activeLayers?.comuni !== false && zonesWithCoords?.length > 0) {
      zonesWithCoords.forEach(z => {
        const sel = isD2D && selected?.includes(z.id);
        const comuneFill = themeMode ? (z.metricColor || z.color || '#7F9BB0') : (z.color || '#7F9BB0');
        const baseFill = settoriActive ? 0.010 : (themeMode ? 0.16 : 0.055);
        const fillOpacity = Math.max(0.006, Math.min(0.26, baseFill * opacityScale));

        const styleUnsel = {
          color:       'rgba(15,23,42,0.40)',
          fillColor:   comuneFill,
          fillOpacity,
          weight:      settoriActive ? 0.55 : 0.85,
          opacity:     settoriActive ? 0.18 : 0.45,
          dashArray:   themeMode ? null : '5 5',
        };
        const styleSel = {
          color: col,
          fillColor: comuneFill,
          fillOpacity: Math.max(fillOpacity, Math.min(0.28, 0.09 * opacityScale)),
          weight: 1.1,
          opacity: 0.62,
          dashArray: null,
          lineCap: 'round',
          lineJoin: 'round',
        };
        const gisStyle = sel ? styleSel : styleUnsel;
        const tip = isD2D ? _buildD2DTip(z, col, sel) : `<b>${esc(z.name)}</b>`;

        if (!z.geometry) {
          console.warn('Comune senza geometry reale', z);
          return;
        }

        const gj = parseGeoJsonValue(z.geometry);
        if (!gj) {
          console.warn('Comune senza geometry reale', z);
          return;
        }

        L.geoJSON(gj, { style: gisStyle, interactive: isD2D })
          .bindTooltip(tip, { direction: 'center', opacity: 1, sticky: true })
          .on('click', () => isD2D && onToggleZone?.(z.id))
          .addTo(group);
      });
    }

    // ── 3. Settori operativi ──────────────────────────────────────────────────
    // Micro-zone inside municipalities — from map_sectors via useSectors.
    // The layer panel shows "n/d" when settori prop is null/empty.
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
        try {
          const gj     = typeof s.geometry === 'string' ? JSON.parse(s.geometry) : s.geometry;
          const num    = s.numero || (idx + 1);
          const sId    = s.id ?? `s_${idx}`;
          const isSel  = selectedSectorId === sId;

          const munCode  = s.municipalityCode || s.municipality_code;
          const munZone  = munByCode[munCode];
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

          // Labels: zoom-dependent — none <12, active only 12-14, all ≥15
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

        } catch (_e) { if (import.meta.env.DEV) console.debug('[Step2Map] settore error', _e); }
      });
    }

    // ── 4. POI reali (Overpass) ───────────────────────────────────────────────
    // Uses pois prop (Overpass data) when available; falls back to apiData metadata.
    const poiActive = activeLayers?.poi !== false;

    if (poiActive && pois?.length > 0) {
      const poiGroup = L.layerGroup().addTo(map);
      layersRef.current.poiGroup = poiGroup;

      // Cell size scales with radius: bigger area → coarser clustering
      const cellDeg = radius <= 2 ? 0.0015 : radius <= 5 ? 0.003 : 0.005;
      const clusters = gridCluster(pois, cellDeg);

      clusters.forEach(item => {
        if (item.isCluster) {
          // Cluster bubble: size grows with count, color from dominant category
          const s = Math.min(22, 12 + Math.log2(item.count) * 3);
          const clusterIcon = L.divIcon({
            html: `<div style="
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
            .map(([cat, n]) => `${n}× ${esc(cat)}`);
          L.marker([item.lat, item.lng], { icon: clusterIcon, zIndexOffset: 300 })
            .bindTooltip(
              `<b>${item.count} POI</b><br>${tipLines.join('<br>')}`,
              { direction: 'top', offset: [0, -4], opacity: 1 }
            ).addTo(poiGroup);
        } else {
          // Individual marker: size by priority
          const sz = item.priority >= 9 ? 8 : item.priority >= 7 ? 6 : 5;
          const isSel = item.priority >= 9;
          const tip = _buildPoiTip(item);
          L.marker([item.lat, item.lng], {
            icon: dotIcon(L, item.color, sz, isSel),
            zIndexOffset: isSel ? 500 : 200,
          }).bindTooltip(tip, { direction: 'top', offset: [0, -sz / 2 - 2], opacity: 1 })
            .addTo(poiGroup);
        }
      });

    } else if (poiActive && (svcType === 'h2h' || svcType === 'b2b') && apiData?.metadata) {
      // Fallback: use existing apiData metadata hotspots (legacy path)
      const hotspots = apiData.metadata.hotspots || [];
      const nearby   = apiData.metadata.nearby_activities || [];
      const seen = new Set();

      nearby.slice(0, 60).forEach(poi => {
        if (!poi.lat || !poi.lng) return;
        const key = `${poi.lat.toFixed(5)}_${poi.lng.toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const pCol = categoryColor(poi.category);
        L.marker([poi.lat, poi.lng], { icon: dotIcon(L, pCol, 6, false), zIndexOffset: -50 })
          .bindTooltip(
            `<b>${esc(poi.name || 'POI')}</b>${poi.category ? `<br><span style="color:${pCol};opacity:0.8">${poi.category.replace(/_/g, ' ')}</span>` : ''}`,
            { direction: 'top', offset: [0, -5], opacity: 1 }
          ).addTo(group);
      });

      hotspots.forEach(poi => {
        if (!poi.lat || !poi.lng) return;
        seen.add(`${poi.lat.toFixed(5)}_${poi.lng.toFixed(5)}`);
        const pCol = categoryColor(poi.category);
        const dist = poi.distance_km != null
          ? `<br><span style="color:rgba(255,255,255,0.35)">${poi.distance_km} km dal centro</span>` : '';
        L.marker([poi.lat, poi.lng], { icon: dotIcon(L, pCol, 10, true), zIndexOffset: 500 })
          .bindTooltip(
            `<b>${esc(poi.name || 'Hotspot')}</b>${poi.category ? `<br><span style="color:${pCol};opacity:0.8">${poi.category.replace(/_/g, ' ')}</span>` : ''}${dist}`,
            { direction: 'top', offset: [0, -8], opacity: 1 }
          ).addTo(group);
      });
    }

    const civiciCount =
      Number(civiciState?.count || 0) ||
      Number(civiciState?.bboxCount || 0);
    const civiciDataAvailable =
      Boolean(civiciState?.available) || civiciCount > 0;
    const civiciActive = activeLayers?.civici === true && civiciDataAvailable;
    const addressPoints = civiciState?.points || [];
    if (civiciActive && addressPoints.length > 0) {
      const civiciGroup = L.layerGroup().addTo(map);
      layersRef.current.civiciGroup = civiciGroup;

      addressPoints.forEach((point) => {
        const tip = [
          `<b>${esc([point.via, point.numeroCivico].filter(Boolean).join(' ') || 'Civico')}</b>`,
          point.comune ? `<span style="color:rgba(255,255,255,0.45)">${esc(point.comune)}</span>` : null,
          point.distanceM != null ? `<span style="color:rgba(255,255,255,0.32)">${Math.round(point.distanceM)} m dal centro</span>` : null,
          `<span style="color:rgba(34,197,94,0.82)">OSM · copertura parziale</span>`,
        ].filter(Boolean).join('<br>');

        L.circleMarker([point.lat, point.lng], {
          radius: 2.6,
          color: 'rgba(15,23,42,0.52)',
          weight: 0.6,
          fillColor: '#4B5568',
          fillOpacity: 0.72,
          opacity: 0.8,
        }).bindTooltip(tip, { direction: 'top', offset: [0, -4], opacity: 1 })
          .addTo(civiciGroup);
      });
    }
    const transportAvailable = Boolean(
      transportState?.available ||
      Number(transportState?.count || 0) > 0 ||
      (transportState?.stops || []).length > 0
    );
    const transportLabel = getTransportLayerLabel(transportState, transportAvailable);
    const transportActive = svcType === 'h2h' && activeLayers?.transport !== false && transportAvailable;
    const transportStops = transportState?.stops || [];
    if (transportActive && transportStops.length > 0) {
      const transportGroup = L.layerGroup().addTo(map);
      layersRef.current.transportGroup = transportGroup;

      transportStops.forEach((stop) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const style = transportMarkerStyle(stop.stopType);
        const routeNames = (stop.routes || [])
          .map((route) => route.shortName || route.longName || route.routeId)
          .filter(Boolean)
          .slice(0, 8)
          .join(', ');
        const tip = [
          `<b>${esc(stop.stopName || 'Fermata TPL')}</b>`,
          `<span style="color:${style.color};opacity:0.86">${esc(transportTypeLabel(stop.stopType))}</span>`,
          routeNames ? `<span style="color:rgba(255,255,255,0.45)">Linee: ${esc(routeNames)}</span>` : null,
          `<span style="color:rgba(147,197,253,0.88)">${esc(transportLabel)}</span>`,
        ].filter(Boolean).join('<br>');

        L.circleMarker([lat, lng], {
          radius: style.radius,
          color: style.stroke,
          weight: 1.2,
          fillColor: style.color,
          fillOpacity: 0.78,
          opacity: 0.86,
        }).bindTooltip(tip, { direction: 'top', offset: [0, -4], opacity: 1 })
          .addTo(transportGroup);
      });
    }

    // Density choropleth (D2D) ──────────────────────────────────────────
    // Colored comuni polygons by family count — CartoDB blue sequential scale.
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
              `<b>${esc(z.name)}</b><br>Famiglie: <b>${(fam).toLocaleString('it-IT')}</b>`,
              { direction: 'center', sticky: true, opacity: 1 }
            ).addTo(densityGroup);
          } catch (_e) {}
        });
      }
    }

  }, [leafletLoaded, city, radius, zonesWithCoords, selected, apiData, svcType, serviceColor, targetColor, activeLayers, settori, selectedSectorId, pois, civiciState, transportState, mapZoom, campaignZones, activeZoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%', height: 420 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', pointerEvents: 'auto' }} />

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

      {/* Prompt iniziale senza città */}
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

      {/* Layer Panel GIS – visibile quando city è impostata e il config è disponibile */}
      {leafletLoaded && city && layerPanelConfig && (
        <LayerPanel
          config={layerPanelConfig}
          svcType={svcType}
          activeLayers={activeLayers}
          settori={settori}
          civiciState={civiciState}
          transportState={transportState}
          onToggle={onLayerToggle}
          opacityLevel={opacityLevel}
          onOpacityChange={onOpacityChange}
          onReset={onLayerReset}
        />
      )}

      {/* Multi-zona accordion sidebar – solo con 2+ zone */}
      {leafletLoaded && city && (
        <ZoneSidebar
          zones={campaignZones}
          activeZoneId={activeZoneId}
          onSelectZone={onSelectZone}
        />
      )}

      {/* Density legend – shown when density layer is active for D2D */}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildD2DTip(z, col, sel) {
  const _wPct  = z.weightPct === 0 && (z.families || 0) > 0 ? '<1' : (z.weightPct || 0);
  const flyers = z.volantiniNelRaggio || z.flyersMin || z.families || 0;
  const density = z.area > 0 ? Math.round((z.families || 0) / z.area) : null;
  return [
    `<b style="color:rgba(255,255,255,0.95)">${esc(z.name)}</b>`,
    `Famiglie: <b>${(z.families || 0).toLocaleString('it-IT')}</b>`,
    density ? `Densità: <b>${density.toLocaleString('it-IT')} fam/km²</b>` : null,
    `Volantini consigliati: <b>${flyers.toLocaleString('it-IT')}</b>`,
    `Copertura: ${_wPct}%`,
    sel ? `<span style="color:#6EC4A0">✓ Selezionata</span>` : `<span style="color:rgba(255,255,255,0.32)">○ Non inclusa</span>`,
  ].filter(Boolean).join('<br>');
}

// Tooltip per un POI Overpass — nome, categoria, indirizzo reali.
function _buildPoiTip(poi) {
  return [
    `<b>${esc(poi.name)}</b>`,
    `<span style="color:${poi.color};opacity:0.88">${esc(poi.category)}</span>`,
    poi.address ? `<span style="color:rgba(255,255,255,0.45)">${esc(poi.address)}</span>` : null,
    poi.openingHours ? `<span style="color:rgba(255,255,255,0.32);font-size:10px">${esc(poi.openingHours)}</span>` : null,
  ].filter(Boolean).join('<br>');
}

// Tooltip per un settore operativo — dati reali dal lookup comunale.
function _buildSectorTip(s, num, munByCode, svcType, city, munSectorCounts, selected, isD2D) {
  const munCode  = s.municipalityCode || s.municipality_code;
  const mun      = munCode && munByCode[munCode];
  const munName  = mun?.name || city?.label || city?.name || '—';
  const nSectors = (munCode && munSectorCounts?.[munCode]) || 1;
  const famTot   = mun?.families || 0;
  const flyTot   = mun?.volantiniNelRaggio || mun?.flyersMin || famTot;
  const famSec   = famTot > 0 ? Math.round(famTot / nSectors).toLocaleString('it-IT') : null;
  const flySec   = flyTot > 0 ? Math.round(flyTot / nSectors).toLocaleString('it-IT') : null;
  const isMunSel = isD2D && mun && selected?.includes(mun.id);
  const name     = s.name ? ` — ${esc(s.name)}` : '';

  const statusLine = isD2D
    ? (isMunSel
        ? `<span style="color:#5DBE8A">✓ Comune incluso nella campagna</span>`
        : `<span style="color:rgba(255,255,255,0.38)">○ Comune non selezionato</span>`)
    : null;

  return [
    `<b style="color:rgba(255,255,255,0.95)">S${num}${name}</b>`,
    `<span style="color:rgba(255,255,255,0.45);font-size:9px">${esc(munName)}</span>`,
    famSec ? `Famiglie stimate: <b>~${famSec}</b>` : null,
    flySec ? `Volantini consigliati: <b>~${flySec}</b>` : null,
    statusLine,
  ].filter(Boolean).join('<br>');
}

// Fallback circolare quando la geometria GeoJSON non è disponibile
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




