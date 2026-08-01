import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Circle, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { getCampaignGpsPoints } from '../../lib/services/gps-api.js';
import { estimateDistanceToZoneBoundaryMeters, isPointInAnyZone } from '../../lib/geofence/geofenceEngine.js';

const NEAR_BORDER_THRESHOLD_M = 40;
const PATH_REFRESH_MIN_INTERVAL_MS = 8000;

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

// Stato SOLO visivo, calcolato istantaneamente sull'ultima posizione nota
// (isPointInAnyZone e' la stessa funzione pura gia' usata dal debounce
// ufficiale in useGpsTracking/geofenceEngine — nessuna nuova logica di
// rilevamento, solo una lettura immediata per la mappa). Distinto di
// proposito dallo stato debounced tracking.geofenceState.status, che resta
// l'unica fonte per l'alert "Sei fuori dalla zona assegnata".
function deriveMapZoneStatus(zones, position) {
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'zone_unavailable';
  const inside = isPointInAnyZone(zones, lat, lng);
  if (inside === null) return 'zone_unavailable';
  const distance = estimateDistanceToZoneBoundaryMeters(zones, lat, lng);
  if (distance != null && distance <= NEAR_BORDER_THRESHOLD_M) return 'near_border';
  return inside ? 'inside' : 'outside';
}

function ZoneStatusBadge({ status }) {
  const color = ZONE_STATUS_COLORS[status] || ZONE_STATUS_COLORS.zone_unavailable;
  return (
    <span style={{
      display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '5px 12px',
      fontSize: 12, fontWeight: 900, color, borderColor: `${color}44`, background: `${color}14`,
    }}>
      {ZONE_STATUS_LABELS[status] || ZONE_STATUS_LABELS.zone_unavailable}
    </span>
  );
}

function RecenterOnPosition({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], map.getZoom() < 14 ? 16 : map.getZoom());
    }
  }, [lat, lng, map]);
  return null;
}

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

// Mappa compatta per il Driver: solo cio' che serve per lavorare (dove sono,
// dove finisce la zona, il percorso di questa sessione, apri in Maps).
// Nessun controllo/dato Admin (storico multi-sessione, distanza percorsa,
// anomalie, foto di altri operatori): quel pannello resta esclusivamente
// in Admin/GpsMonitor.jsx, che questo componente non tocca.
export function DriverZoneMap({ campaignId, sessionId, position, zones }) {
  const [path, setPath] = useState([]);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setPath([]);
      return;
    }
    let cancelled = false;
    const now = Date.now();
    if (now - lastFetchRef.current < PATH_REFRESH_MIN_INTERVAL_MS) return;
    lastFetchRef.current = now;
    getCampaignGpsPoints(campaignId, { sessionId })
      .then((points) => {
        if (cancelled) return;
        setPath(points.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)));
      })
      .catch(() => { /* la mappa resta utilizzabile anche senza percorso storico */ });
    return () => { cancelled = true; };
    // Si aggiorna a ogni nuovo invio riuscito (position.recorded_at cambia),
    // throttle sopra per non rifare fetch a ogni singolo render.
  }, [campaignId, sessionId, position?.recorded_at]);

  const zoneStatus = useMemo(() => deriveMapZoneStatus(zones, position), [zones, position]);
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const mapsUrl = hasPosition ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 }}>Mappa zona</p>
        <ZoneStatusBadge status={zoneStatus} />
      </div>

      {hasPosition ? (
        <div style={{ height: 260, borderRadius: 12, overflow: 'hidden', border: '1px solid #d7ded9' }}>
          <MapContainer center={[lat, lng]} zoom={16} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <RecenterOnPosition lat={lat} lng={lng} />
            {zones.map((zone, index) => <ZoneShape key={index} zone={zone} index={index} />)}
            {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.75 }} />}
            <CircleMarker center={[lat, lng]} radius={9} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}>
              <Tooltip permanent direction="top" offset={[0, -8]}>Tu sei qui</Tooltip>
            </CircleMarker>
          </MapContainer>
        </div>
      ) : (
        <div style={{ padding: 16, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' }}>
          In attesa della prima posizione GPS per mostrare la mappa.
        </div>
      )}

      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 12, border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 14px', color: '#17211f', fontWeight: 900, textDecoration: 'none', fontSize: 13 }}
        >
          Apri in Google Maps
        </a>
      )}
    </section>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
