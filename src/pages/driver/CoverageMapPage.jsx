import 'leaflet/dist/leaflet.css';
import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { calculateDistanceKm, getCampaignGpsPoints, hasSupabaseSession } from '../../lib/services/gps-api.js';
import { fetchSectors } from '../../lib/services/sectors-api.js';
import { deriveInstantZoneStatus, normalizeZonesFromCampaign } from '../../lib/geofence/geofenceEngine.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { COVERAGE_RADIUS_M, computeZoneCoverage, sectorsToZones, zonesBBox } from '../../lib/gps/coverage.js';
import { formatDuration, sessionDurationMs } from '../../lib/services/report-utils.js';

const ZONE_STATUS_LABELS = {
  inside: 'Dentro la zona',
  near_border: 'Vicino al confine',
  outside: 'Fuori zona',
  zone_unavailable: 'Zona non disponibile',
};
const ZONE_STATUS_COLORS = {
  inside: '#0f766e',
  near_border: '#b45309',
  outside: '#b91c1c',
  zone_unavailable: '#64748b',
};
const SECTOR_STATUS_COLORS = { completed: '#0f766e', partial: '#b45309', missing: '#94a3b8' };
const PATH_REFRESH_MIN_INTERVAL_MS = 8000;

function mapServiceType(serviceType) {
  const raw = String(serviceType || '').toLowerCase();
  if (raw.includes('h2h') || raw.includes('hand')) return 'h2h';
  if (raw.includes('b2b') || raw.includes('business')) return 'b2b';
  return 'd2d';
}

// Registra l'istanza mappa in un ref del genitore, per i comandi
// "Centra sulla mia posizione" / "Mostra tutta la zona".
function MapController({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

// Inquadratura iniziale: SEMPRE l'intera zona assegnata quando esiste
// (es. una campagna Cormano parte centrata su Cormano), altrimenti la
// posizione corrente. Nessun fallback hardcoded su Milano o altrove.
function InitialFraming({ zones, position }) {
  const map = useMap();
  const doneRef = useRef(false);
  useEffect(() => {
    if (doneRef.current) return;
    const box = zonesBBox(zones);
    if (box) {
      map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: [24, 24] });
      doneRef.current = true;
    } else if (Number.isFinite(Number(position?.lat)) && Number.isFinite(Number(position?.lng))) {
      map.setView([Number(position.lat), Number(position.lng)], 16);
      doneRef.current = true;
    }
  }, [zones, position, map]);
  return null;
}

function ZoneShape({ zone }) {
  if (zone.kind === 'polygon') {
    const rings = zone.geometry?.type === 'Polygon'
      ? [zone.geometry.coordinates]
      : zone.geometry?.type === 'MultiPolygon'
        ? zone.geometry.coordinates
        : [];
    return rings.map((coords, i) => (
      <Polygon key={i} positions={coords.map((ring) => ring.map(([lng, lat]) => [lat, lng]))} pathOptions={{ color: '#e8571a', weight: 3, fillColor: '#e8571a', fillOpacity: 0.07 }} />
    ));
  }
  if (zone.kind === 'circle') {
    return <Circle center={[zone.centerLat, zone.centerLng]} radius={zone.radiusKm * 1000} pathOptions={{ color: '#e8571a', weight: 3, fillColor: '#e8571a', fillOpacity: 0.07 }} />;
  }
  return null;
}

function SectorOutline({ sector, status }) {
  const color = SECTOR_STATUS_COLORS[status] || SECTOR_STATUS_COLORS.missing;
  const rings = sector.geometry?.type === 'Polygon'
    ? [sector.geometry.coordinates]
    : sector.geometry?.type === 'MultiPolygon'
      ? sector.geometry.coordinates
      : [];
  return rings.map((coords, i) => (
    <Polygon key={i} positions={coords.map((ring) => ring.map(([lng, lat]) => [lat, lng]))} pathOptions={{ color, weight: 1.5, dashArray: '4 4', fillColor: color, fillOpacity: status === 'completed' ? 0.10 : 0.02 }} />
  ));
}

export function CoverageMapPage({ campaignId }) {
  const [authState, setAuthState] = useState({ checking: true, authenticated: false });
  const tracking = useGpsTracking(campaignId);
  const [pathPoints, setPathPoints] = useState([]);
  const [sectorZones, setSectorZones] = useState({ loading: true, sectors: [] });
  const [panelExpanded, setPanelExpanded] = useState(false);
  const mapRef = useRef(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    hasSupabaseSession()
      .then((authenticated) => { if (!cancelled) setAuthState({ checking: false, authenticated }); })
      .catch(() => { if (!cancelled) setAuthState({ checking: false, authenticated: false }); });
    return () => { cancelled = true; };
  }, [campaignId]);

  const zones = useMemo(
    () => normalizeZonesFromCampaign(tracking.assignmentState.campaign),
    [tracking.assignmentState.campaign],
  );

  // Settori operativi reali (map_sectors, stessa fonte di Step2), limitati
  // all'area della zona assegnata: il calcolo copertura scarta comunque i
  // settori che non intersecano la zona.
  useEffect(() => {
    if (!zones.length) {
      setSectorZones({ loading: false, sectors: [] });
      return;
    }
    let cancelled = false;
    const box = zonesBBox(zones);
    if (!box) {
      setSectorZones({ loading: false, sectors: [] });
      return;
    }
    const centerLat = (box[0] + box[2]) / 2;
    const centerLng = (box[1] + box[3]) / 2;
    const diagKm = Math.hypot((box[2] - box[0]) * 111.32, (box[3] - box[1]) * 111.32 * Math.cos((centerLat * Math.PI) / 180));
    const radiusKm = Math.max(2, Math.ceil(diagKm / 2) + 1);
    fetchSectors({ serviceType: mapServiceType(tracking.assignmentState.campaign?.service_type), centerLat, centerLng, radiusKm })
      .then((collection) => {
        if (!cancelled) setSectorZones({ loading: false, sectors: sectorsToZones(collection) });
      })
      .catch(() => { if (!cancelled) setSectorZones({ loading: false, sectors: [] }); });
    return () => { cancelled = true; };
  }, [zones, tracking.assignmentState.campaign?.service_type]);

  const refreshPath = useCallback(() => {
    const sessionId = tracking.session?.id;
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastFetchRef.current < PATH_REFRESH_MIN_INTERVAL_MS) return;
    lastFetchRef.current = now;
    getCampaignGpsPoints(campaignId, { sessionId })
      .then((points) => setPathPoints(points))
      .catch(() => { /* la mappa resta utilizzabile senza percorso storico */ });
  }, [campaignId, tracking.session?.id]);

  useEffect(() => {
    refreshPath();
  }, [refreshPath, tracking.lastPosition?.recorded_at]);

  useEffect(() => {
    const timer = window.setInterval(refreshPath, 15000);
    return () => window.clearInterval(timer);
  }, [refreshPath]);

  const validPathPositions = useMemo(() => {
    const { valid } = filterValidGpsPoints(pathPoints);
    return valid.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  }, [pathPoints]);

  const coverage = useMemo(
    () => computeZoneCoverage(zones, pathPoints, { sectors: sectorZones.sectors }),
    [zones, pathPoints, sectorZones.sectors],
  );

  const zoneStatus = deriveInstantZoneStatus(zones, tracking.lastPosition);
  const distanceKm = useMemo(() => calculateDistanceKm(pathPoints), [pathPoints]);
  const durationMs = sessionDurationMs(tracking.session);
  const sectorStatusByName = useMemo(
    () => Object.fromEntries((coverage.sectors || []).map((s) => [s.name, s.status])),
    [coverage],
  );

  const position = tracking.lastPosition;
  const hasPosition = Number.isFinite(Number(position?.lat)) && Number.isFinite(Number(position?.lng));
  const mapsUrl = hasPosition ? `https://www.google.com/maps?q=${Number(position.lat)},${Number(position.lng)}` : null;

  const centerOnMe = () => {
    if (mapRef.current && hasPosition) mapRef.current.setView([Number(position.lat), Number(position.lng)], Math.max(mapRef.current.getZoom(), 16));
  };
  const showWholeZone = () => {
    const box = zonesBBox(zones);
    if (mapRef.current && box) mapRef.current.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: [24, 24] });
  };

  if (authState.checking) {
    return <div style={shellStyle}><div style={centerMsgStyle}>Verifica accesso in corso...</div></div>;
  }
  if (!authState.authenticated) {
    return (
      <div style={shellStyle}>
        <div style={centerMsgStyle}>
          Accesso operatore richiesto.
          <a href={`/driver/tracking/${campaignId}`} style={{ ...smallButtonStyle, marginTop: 12, display: 'inline-block' }}>Torna al tracking</a>
        </div>
      </div>
    );
  }

  const canRenderMap = zones.length > 0 || hasPosition;

  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <a href={`/driver/tracking/${campaignId}`} style={backLinkStyle}>← Tracking</a>
        <strong style={{ fontSize: 14 }}>Mappa copertura</strong>
        <span style={{ ...statusPillStyle, color: ZONE_STATUS_COLORS[zoneStatus], borderColor: `${ZONE_STATUS_COLORS[zoneStatus]}55`, background: `${ZONE_STATUS_COLORS[zoneStatus]}14` }}>
          {ZONE_STATUS_LABELS[zoneStatus]}
        </span>
      </header>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {canRenderMap ? (
          <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapController mapRef={mapRef} />
            <InitialFraming zones={zones} position={position} />
            {sectorZones.sectors.map((sector, index) => (
              <SectorOutline key={index} sector={sector} status={sectorStatusByName[sector.name] || 'missing'} />
            ))}
            {zones.map((zone, index) => <ZoneShape key={index} zone={zone} />)}
            {validPathPositions.map((pos, index) => (
              <Circle key={index} center={pos} radius={COVERAGE_RADIUS_M} pathOptions={{ stroke: false, fillColor: '#0f766e', fillOpacity: 0.18 }} />
            ))}
            {validPathPositions.map((pos, index) => (
              <CircleMarker
                key={`dot-${index}`}
                center={pos}
                radius={3.5}
                pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.75, weight: 1 }}
              />
            ))}
            {validPathPositions.length > 0 && (
              <CircleMarker center={validPathPositions[0]} radius={7} pathOptions={{ color: '#0f766e', fillColor: '#2ecc8a', fillOpacity: 0.95, weight: 2 }}>
                <Tooltip direction="top">Partenza</Tooltip>
              </CircleMarker>
            )}
            {hasPosition && (
              <CircleMarker center={[Number(position.lat), Number(position.lng)]} radius={9} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}>
                <Tooltip permanent direction="top" offset={[0, -8]}>Tu sei qui</Tooltip>
              </CircleMarker>
            )}
          </MapContainer>
        ) : (
          <div style={centerMsgStyle}>
            {tracking.assignmentState.status === 'checking' ? 'Caricamento zona assegnata...' : 'Zona non disponibile e nessuna posizione GPS: avvia il tracking per vedere la mappa.'}
          </div>
        )}
      </div>

      <section style={panelStyle}>
        <button type="button" style={panelHandleStyle} onClick={() => setPanelExpanded((prev) => !prev)}>
          <span style={{ fontWeight: 900 }}>
            {coverage.computable ? `Copertura ${coverage.percent}%` : 'Copertura non ancora calcolabile'}
          </span>
          <span style={{ color: '#64748b' }}>{distanceKm.toFixed(2)} km · {formatDuration(durationMs)}</span>
          <span style={{ color: '#94a3b8' }}>{panelExpanded ? '▾' : '▴'}</span>
        </button>

        {panelExpanded && (
          <div style={{ display: 'grid', gap: 10, paddingTop: 8 }}>
            <div style={metricGridStyle}>
              <Metric label="Copertura" value={coverage.computable ? `${coverage.percent}%` : 'n/d'} sub={coverage.computable ? coverage.denominatorLabel : 'zona senza geometria utilizzabile'} />
              <Metric label="Distanza" value={`${distanceKm.toFixed(2)} km`} />
              <Metric label="Tempo" value={formatDuration(durationMs)} />
              <Metric label="Accuratezza" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'n/d'} />
              <Metric label="Stato zona" value={ZONE_STATUS_LABELS[zoneStatus]} />
              <Metric label="Ultimo aggiornamento" value={position?.recorded_at ? new Date(position.recorded_at).toLocaleTimeString('it-IT') : 'nessuno'} />
            </div>

            {coverage.computable && coverage.sectors?.length > 0 ? (
              <div style={{ display: 'grid', gap: 4 }}>
                <p style={eyebrowStyle}>Settori nella zona</p>
                {['completed', 'partial', 'missing'].map((status) => {
                  const items = coverage.sectors.filter((s) => s.status === status);
                  if (!items.length) return null;
                  const label = status === 'completed' ? 'Completati' : status === 'partial' ? 'Parziali' : 'Mancanti';
                  return (
                    <div key={status} style={{ fontSize: 12 }}>
                      <strong style={{ color: SECTOR_STATUS_COLORS[status] }}>{label} ({items.length}):</strong>{' '}
                      <span style={{ color: '#475569' }}>{items.map((s) => `${s.name} ${s.percent}%`).join(' · ')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                {sectorZones.loading ? 'Caricamento settori operativi...' : 'Settori operativi non disponibili per quest\'area.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={smallButtonStyle} onClick={centerOnMe} disabled={!hasPosition}>Centra sulla mia posizione</button>
              <button type="button" style={smallButtonStyle} onClick={showWholeZone} disabled={!zones.length}>Mostra tutta la zona</button>
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={smallButtonStyle}>Apri in Google Maps</a>}
              <a href={`/driver/tracking/${campaignId}`} style={smallButtonStyle}>Torna al tracking</a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div style={{ display: 'grid', gap: 2, padding: 8, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <strong style={{ fontSize: 14, color: '#17211f' }}>{value}</strong>
      {sub && <span style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</span>}
    </div>
  );
}

const shellStyle = { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#eef2ef', color: '#17211f', fontFamily: 'Inter, system-ui, sans-serif' };
const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: '#fff', borderBottom: '1px solid #d7ded9', flexShrink: 0 };
const backLinkStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' };
const statusPillStyle = { display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' };
const panelStyle = { flexShrink: 0, background: '#fff', borderTop: '1px solid #d7ded9', padding: '8px 12px', maxHeight: '55dvh', overflowY: 'auto' };
const panelHandleStyle = { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: 'none', background: 'transparent', font: 'inherit', fontSize: 13, cursor: 'pointer', padding: '4px 0', color: '#17211f' };
const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 };
const eyebrowStyle = { margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: '#64748b', fontWeight: 900 };
const centerMsgStyle = { display: 'grid', placeItems: 'center', height: '100%', padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 };
const smallButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#17211f', fontWeight: 800, fontSize: 12, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' };
