import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Circle, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { getCampaignGpsPoints } from '../../lib/services/gps-api.js';
import { deriveInstantZoneStatus, normalizeZonesFromCampaign } from '../../lib/geofence/geofenceEngine.js';
import { calculateFilteredDistanceKm } from '../../lib/gps/pointQuality.js';

const PATH_REFRESH_MIN_INTERVAL_MS = 8000;

const ZONE_STATUS_LABELS = {
  inside: 'Dentro zona',
  near_border: 'Vicino al confine',
  outside: 'Fuori zona',
  zone_unavailable: 'Zona non disponibile',
  unknown: 'Verifica in corso',
};

const ZONE_STATUS_COLORS = {
  inside: '#0f766e',
  near_border: '#b45309',
  outside: '#b91c1c',
  zone_unavailable: '#64748b',
  unknown: '#b45309',
};

function ZoneShape({ zone, index }) {
  if (zone.kind === 'polygon') {
    const rings = zone.geometry?.type === 'Polygon'
      ? [zone.geometry.coordinates]
      : zone.geometry?.type === 'MultiPolygon'
        ? zone.geometry.coordinates
        : [];
    return rings.map((polygonCoords, polyIndex) => (
      <Polygon
        key={`${index}-${polyIndex}`}
        positions={polygonCoords.map((ring) => ring.map(([lng, lat]) => [lat, lng]))}
        pathOptions={{ color: '#e8571a', weight: 2, fillColor: '#e8571a', fillOpacity: 0.08 }}
      />
    ));
  }
  if (zone.kind === 'circle') {
    return (
      <Circle
        center={[zone.centerLat, zone.centerLng]}
        radius={zone.radiusKm * 1000}
        pathOptions={{ color: '#e8571a', weight: 2, fillColor: '#e8571a', fillOpacity: 0.08 }}
      />
    );
  }
  return null;
}

function RecenterController({ center, fitBounds }) {
  const map = useMap();
  useEffect(() => {
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      map.setView([center.lat, center.lng], map.getZoom() < 14 ? 16 : map.getZoom());
    }
  }, [center, map]);
  
  useEffect(() => {
    if (fitBounds) {
      const { lat, lng } = fitBounds;
      map.setView([lat, lng], 13);
    }
  }, [fitBounds, map]);
  return null;
}

export function DriverCoverageMap({ campaignId }) {
  const tracking = useGpsTracking(campaignId);
  const [path, setPath] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [centerMap, setCenterMap] = useState(null);
  const lastFetchRef = useRef(0);
  const [panelExpanded, setPanelExpanded] = useState(false);

  const zones = useMemo(
    () => normalizeZonesFromCampaign(tracking.assignmentState.campaign),
    [tracking.assignmentState.campaign],
  );

  const sessionId = tracking.session?.id || null;
  const position = tracking.lastPosition;

  useEffect(() => {
    if (!sessionId) {
      setPath([]);
      setDistanceKm(0);
      return;
    }
    let cancelled = false;
    const now = Date.now();
    if (now - lastFetchRef.current < PATH_REFRESH_MIN_INTERVAL_MS) return;
    lastFetchRef.current = now;
    getCampaignGpsPoints(campaignId, { sessionId })
      .then((points) => {
        if (cancelled) return;
        const validPath = points
          .map((p) => [Number(p.lat), Number(p.lng)])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        setPath(validPath);
        const dist = calculateFilteredDistanceKm(points);
        setDistanceKm(dist);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [campaignId, sessionId, position?.recorded_at]);

  const zoneStatus = useMemo(() => {
    if (tracking.status !== 'active' && tracking.status !== 'paused') return 'unknown';
    if (!position) return 'unknown';
    return deriveInstantZoneStatus(zones, position);
  }, [zones, position, tracking.status]);
  const statusColor = ZONE_STATUS_COLORS[zoneStatus] || ZONE_STATUS_COLORS.zone_unavailable;
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const mapsUrl = hasPosition ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  
  const defaultCenter = hasPosition ? [lat, lng] : (zones[0]?.centerLat ? [zones[0].centerLat, zones[0].centerLng] : [45.4642, 9.19]);

  const handleRecenter = () => {
    if (hasPosition) {
      setCenterMap({ lat, lng, ts: Date.now() });
    }
  };

  const handleShowZone = () => {
    if (zones[0]?.centerLat) {
      setCenterMap(null);
      setCenterMap({ lat: zones[0].centerLat, lng: zones[0].centerLng, ts: Date.now() });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#eef2ef', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ padding: '16px', background: '#fff', borderBottom: '1px solid #d7ded9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <button onClick={() => window.location.href = `/driver/tracking/${campaignId}`} style={{ background: 'transparent', border: 'none', color: '#17211f', fontWeight: 600, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Tracking
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f766e' }}>Mappa Copertura</span>
      </header>

      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={defaultCenter} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <RecenterController center={centerMap} />
          {zones.map((zone, index) => <ZoneShape key={index} zone={zone} index={index} />)}
          {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.75 }} />}
          {hasPosition && (
            <CircleMarker center={[lat, lng]} radius={9} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}>
              <Tooltip permanent direction="top" offset={[0, -8]}>Tu sei qui</Tooltip>
            </CircleMarker>
          )}
        </MapContainer>

        <div style={{ position: 'absolute', right: 16, top: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleRecenter} style={mapControlStyle} title="Centra sulla mia posizione">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button onClick={handleShowZone} style={mapControlStyle} title="Mostra tutta la zona">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z"/><path d="M9 9h6v6H9z"/></svg>
          </button>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, zIndex: 1000, boxShadow: '0 -10px 25px rgba(0,0,0,0.1)', transition: 'transform 0.3s ease', transform: panelExpanded ? 'translateY(0)' : 'translateY(calc(100% - 130px))' }}>
          <div onClick={() => setPanelExpanded(!panelExpanded)} style={{ width: 40, height: 5, background: '#cbd5e1', borderRadius: 10, margin: '0 auto 16px', cursor: 'pointer' }} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#17211f' }}>Copertura sessione</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Copertura non ancora calcolabile</p>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: statusColor, background: `${statusColor}14`, border: `1px solid ${statusColor}44` }}>
              {ZONE_STATUS_LABELS[zoneStatus]}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Distanza</span>
              <strong style={{ fontSize: 18, color: '#17211f' }}>{distanceKm.toFixed(2)} km</strong>
            </div>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Accuratezza GPS</span>
              <strong style={{ fontSize: 18, color: '#17211f' }}>{tracking.accuracy ? `${Math.round(tracking.accuracy)} m` : 'n/d'}</strong>
            </div>
          </div>

          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '12px', background: '#f1f5f9', color: '#334155', fontWeight: 700, borderRadius: 10, textDecoration: 'none', fontSize: 14 }}>
              Apri in Google Maps
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const mapControlStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#334155', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' };
