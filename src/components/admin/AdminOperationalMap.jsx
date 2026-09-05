import 'leaflet/dist/leaflet.css';
import { CircleMarker, Circle, MapContainer, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { displayDriverName, getCampaignRecord } from '../../lib/services/gps-api.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { normalizeZonesFromCampaign, isPointInAnyZone } from '../../lib/geofence/geofenceEngine.js';

// Sintesi operativa per la Dashboard Admin principale (/admin): stessa
// fonte dati e stessa logica gia' verificata in AdminLiveDashboard.jsx
// (getLiveOperatorsSummary -> getLiveDrivers + classifySessionLifecycle +
// dedupeSessionsByOperator) e stesso filtro punti di pointQuality.js.
// Nessun secondo sistema GPS: qui si mostra solo cio' che serve per una
// sintesi (chi e' live adesso, ultimo punto, traccia sessione, zona se
// disponibile) — lo storico/i dettagli restano in Monitor GPS Live.
export function AdminOperationalMap({ operators }) {
  const [zonesByCampaign, setZonesByCampaign] = useState({});

  const campaignIds = useMemo(
    () => Array.from(new Set(operators.map((item) => item.session.campaign_id).filter(Boolean))),
    [operators],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(campaignIds.map(async (campaignId) => {
        const campaign = await getCampaignRecord(campaignId).catch(() => null);
        return [campaignId, normalizeZonesFromCampaign(campaign)];
      }));
      if (!cancelled) setZonesByCampaign(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [campaignIds]);

  const tracks = useMemo(() => operators.map((item) => {
    const { valid } = filterValidGpsPoints(item.points || []);
    const path = valid.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    const last = path[path.length - 1] || null;
    const zones = zonesByCampaign[item.session.campaign_id] || [];
    const zoneStatus = last && zones.length ? isPointInAnyZone(zones, last[0], last[1]) : null;
    return { item, path, last, zones, zoneStatus };
  }), [operators, zonesByCampaign]);

  const allPositions = tracks.flatMap((t) => t.path);

  if (!operators.length) {
    return <div style={{ padding: 16 }}><EmptyState text="Nessun operatore attivo." /></div>;
  }

  if (!allPositions.length) {
    return <div style={{ padding: 16 }}><EmptyState text="Operatori live senza ancora un punto GPS valido." /></div>;
  }

  const center = allPositions[0];

  return (
    <div>
      <div style={{ height: 320, borderRadius: 12, overflow: 'hidden' }}>
        <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBoundsToPositions positions={allPositions} />
          {tracks.map(({ item, zones }) => zones.map((zone, zoneIndex) => (
            <ZoneShape key={`${item.session.id}-zone-${zoneIndex}`} zone={zone} />
          )))}
          {tracks.map(({ item, path }) => (
            path.map((pos, idx) => (
              <CircleMarker
                key={`${item.session.id}-dot-${idx}`}
                center={pos}
                radius={3}
                pathOptions={{ color: '#e8571a', fillColor: '#e8571a', fillOpacity: 0.75, weight: 1 }}
              />
            ))
          ))}
          {tracks.map(({ item, last, zoneStatus }) => last && (
            <CircleMarker
              key={item.session.id}
              center={last}
              radius={9}
              pathOptions={{ color: '#1d4ed8', fillColor: zoneStatus === false ? '#ef4444' : '#2ecc8a', fillOpacity: 0.9, weight: 2 }}
            >
              <Popup>
                <strong>{displayDriverName(item.session)}</strong>
                <br />Ultimo ping: {formatDateTime(item.lastPing)}
                <br />Accuracy: {item.latest?.accuracy != null ? `${Math.round(item.latest.accuracy)} m` : 'n/d'}
                <br />{zoneStatus === null ? 'Zona non disponibile' : zoneStatus ? 'Dentro la zona' : 'Fuori zona'}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {tracks.map(({ item, zoneStatus }) => (
          <OperatorRow key={item.session.id} item={item} zoneStatus={zoneStatus} />
        ))}
      </div>
      <a href="/admin/live" style={openMonitorLinkStyle}>Apri Monitor GPS Live</a>
    </div>
  );
}

function FitBoundsToPositions({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(positions, { padding: [24, 24], maxZoom: 15 });
    } else if (positions.length === 1) {
      map.setView(positions[0], 15);
    }
  }, [positions, map]);
  return null;
}

function ZoneShape({ zone }) {
  if (zone.kind === 'polygon') {
    const rings = zone.geometry?.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry?.type === 'MultiPolygon' ? zone.geometry.coordinates : [];
    return rings.map((coords, i) => (
      <Polygon key={i} positions={coords.map((ring) => ring.map(([lng, lat]) => [lat, lng]))} pathOptions={{ color: '#e8571a', weight: 2, fillOpacity: 0.06 }} />
    ));
  }
  if (zone.kind === 'circle') {
    return <Circle center={[zone.centerLat, zone.centerLng]} radius={zone.radiusKm * 1000} pathOptions={{ color: '#e8571a', weight: 2, fillOpacity: 0.06 }} />;
  }
  return null;
}

function OperatorRow({ item, zoneStatus }) {
  const color = zoneStatus === false ? '#ef4444' : '#2ecc8a';
  return (
    <div style={operatorRowStyle}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
      <strong style={{ color: '#fff', fontSize: 12 }}>{displayDriverName(item.session)}</strong>
      <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>
        ping {formatDateTime(item.lastPing)} · {item.latest?.accuracy != null ? `${Math.round(item.latest.accuracy)} m` : 'n/d'}
        {' · '}{zoneStatus === null ? 'zona n/d' : zoneStatus ? 'dentro zona' : 'fuori zona'}
      </span>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.42)', fontSize: 12 }}>{text}</div>;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

const operatorRowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,.03)' };
const openMonitorLinkStyle = { display: 'inline-block', marginTop: 10, color: '#e8571a', fontWeight: 900, fontSize: 12, textDecoration: 'none' };
