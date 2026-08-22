import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Polygon, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  classifySessionLifecycle,
  displayDeviceId,
  displayDriverName,
  calculateGpsCoverage,
} from '../../lib/services/gps-api.js';
import { getLiveDrivers } from '../../lib/services/admin-api.js';
import { dedupeSessionsByOperator, filterOperationalRows } from '../../lib/services/report-utils.js';
import { EXCLUSION_LABELS, filterValidGpsPoints, calculateFilteredDistanceKm, summarizeGpsQuality } from '../../lib/gps/pointQuality.js';
import { deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, ZONE_LIVE_STATUS_LABELS, ZONE_LIVE_STATUS_COLORS } from '../../lib/geofence/geofenceEngine.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { AdminLayout } from './AdminLayout.jsx';
import { AdminLiveKpiPanel } from './admin-live/AdminLiveKpiPanel.jsx';
import { AdminLiveFiltersPanel } from './admin-live/AdminLiveFiltersPanel.jsx';

const WORK_STATUS_LABELS = {
  started: 'In corso',
  paused: 'Pausa',
  completed: 'Completata',
  cancelled: 'Annullata',
};

const LIFECYCLE_LABELS = {
  live: 'Live',
  warning: 'Warning',
  offline_recent: 'Offline recente',
  history: 'Storico terminato',
};

export function AdminLiveDashboard({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, drivers: [] });
  const [filters, setFilters] = useState({ period: 'today', fromDate: '', toDate: '', campaign: 'all', group: '', status: 'all_history', driver: '' });
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const drivers = await getLiveDrivers();
        if (!cancelled) setState({ loading: false, error: null, drivers });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err?.message || 'Errore caricamento live GPS.', drivers: [] });
      }
    }
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const campaigns = useMemo(() => Array.from(new Set(state.drivers.map((item) => item.session.campaign_id).filter(Boolean))), [state.drivers]);

  const withLifecycle = useMemo(
    () => filterOperationalRows(state.drivers, filters).map((item) => ({
      ...item,
      lifecycle: classifySessionLifecycle(item.session, item.activityAt),
    })),
    [state.drivers, filters],
  );

  const currentRows = useMemo(() => dedupeSessionsByOperator(withLifecycle.filter((item) => item.lifecycle !== 'history')), [withLifecycle]);
  const historyCount = withLifecycle.length - withLifecycle.filter((item) => item.lifecycle !== 'history').length;

  const liveCount = currentRows.filter((item) => item.lifecycle === 'live').length;
  const warningCount = currentRows.filter((item) => item.lifecycle === 'warning').length;
  const offlineRecentCount = currentRows.filter((item) => item.lifecycle === 'offline_recent').length;

  // La lista e la mappa rispettano anche il filtro storico: i KPI live/offline
  // restano calcolati su currentRows, ma una sessione completata oggi non deve
  // sparire proprio quando il filtro dichiara di includere lo storico.
  useEffect(() => {
    if (selectedSessionId && withLifecycle.some((item) => item.session.id === selectedSessionId)) return;
    const withPoints = withLifecycle.find((item) => item.points?.length > 0) || withLifecycle[0] || null;
    setSelectedSessionId(withPoints?.session.id || null);
  }, [withLifecycle, selectedSessionId]);

  const selectedItem = withLifecycle.find((item) => item.session.id === selectedSessionId) || null;
  const selectedCampaignId = selectedItem?.session?.campaign_id || null;

  // Confine reale + stato dentro/fuori/vicino-confine per il driver
  // selezionato: stesso hook/funzioni condivise con GpsMonitor.jsx,
  // CampaignTracking.jsx e la Driver App — nessuna logica geografica nuova.
  const { zoneRows, resolvedBoundaries } = useZoneBoundaries(selectedCampaignId);
  const zoneProgress = useZoneProgress({ campaignId: selectedCampaignId, includeHistory: true });
  const liveZones = useMemo(
    () => Object.values(resolvedBoundaries).filter(Boolean).map((geometry) => ({ kind: 'polygon', geometry })),
    [resolvedBoundaries],
  );
  const mapZones = useMemo(() => (zoneProgress.zones || []).map((zone) => ({
    ...zone,
    geometry: resolvedBoundaries[zone.campaign_zone_id] || null,
  })), [zoneProgress.zones, resolvedBoundaries]);
  const activeZoneName = zoneRows?.[0]?.zone_name || null;
  const liveZoneStatus = useMemo(
    () => deriveLiveZoneStatus(liveZones, selectedItem?.latest?.lat, selectedItem?.latest?.lng),
    [liveZones, selectedItem?.latest],
  );
  const outsideDistanceKm = useMemo(() => {
    if (liveZoneStatus !== 'outside' || !selectedItem?.latest) return null;
    const meters = estimateDistanceToZoneBoundaryMeters(liveZones, selectedItem.latest.lat, selectedItem.latest.lng);
    return meters != null ? meters / 1000 : null;
  }, [liveZoneStatus, liveZones, selectedItem?.latest]);

  // Copertura GPS reale della sessione selezionata — stessa RPC
  // gps_calculate_zone_coverage gia' usata da GpsMonitor.jsx, nessun secondo
  // calcolo lato client.
  const [coverage, setCoverage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setCoverage(null);
    if (!selectedSessionId) return undefined;
    calculateGpsCoverage(selectedSessionId)
      .then((res) => { if (!cancelled) setCoverage(res); })
      .catch(() => { if (!cancelled) setCoverage(null); });
    return () => { cancelled = true; };
  }, [selectedSessionId, selectedItem?.points?.length]);

  const mapRef = useRef(null);
  const handleGoToOperatorPosition = () => {
    if (selectedItem?.latest && mapRef.current) {
      mapRef.current.setView([Number(selectedItem.latest.lat), Number(selectedItem.latest.lng)], Math.max(mapRef.current.getZoom(), 16));
    }
  };
  const handleReturnToArea = () => {
    const geometry = liveZones[0]?.geometry;
    if (!geometry || !mapRef.current) return;
    try {
      const bounds = L.geoJSON(geometry).getBounds();
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: nessuna azione, nessun crash.
    }
  };

  const breadcrumbs = [
    { label: "Dashboard", href: "/admin" },
    { label: "GPS Live" }
  ];

  return (
    <AdminLayout title="Monitor GPS Live" subtitle="Driver, campagne attive e storico operativo" breadcrumbs={breadcrumbs} onNav={onNav}>
      {state.error && <Notice danger text={state.error} />}
      {offlineRecentCount > 0 && <Notice danger text={`${offlineRecentCount} driver offline o senza ping recente.`} />}

      <AdminLiveKpiPanel
        currentRows={currentRows}
        liveCount={liveCount}
        warningCount={warningCount}
        offlineRecentCount={offlineRecentCount}
        historyCount={historyCount}
        Kpi={Kpi}
        styles={{
          kpiGridStyle,
        }}
      />

      <AdminLiveFiltersPanel
        filters={filters}
        setFilters={setFilters}
        campaigns={campaigns}
        styles={{
          cardStyle,
          eyebrowStyle,
          filterGridStyle,
          labelStyle,
          inputStyle,
        }}
      />

      <div style={layoutStyle}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <p style={{ ...eyebrowStyle, margin: 0 }}>Mappa live {selectedItem ? `— traccia: ${displayDriverName(selectedItem.session)} (${shortId(selectedItem.session.id)})` : ''}</p>
            {selectedItem && <LiveZoneStatusBadge status={liveZoneStatus} distanceKm={outsideDistanceKm} />}
          </div>
          {activeZoneName && <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#fff' }}>{activeZoneName}</p>}
          {liveZoneStatus === 'outside' && (
            <div style={outOfAreaAlertStyle}>
              ⚠ OPERATORE FUORI AREA{outsideDistanceKm != null ? ` — a ${outsideDistanceKm.toFixed(1)} km dalla zona` : ''}
            </div>
          )}
          {withLifecycle.some((item) => item.latest) ? (
            <LiveMap drivers={withLifecycle} selectedSessionId={selectedSessionId} zones={mapZones} mapRef={mapRef} />
          ) : (
            <EmptyState text={state.loading ? 'Caricamento tracking GPS...' : 'Nessun tracking GPS disponibile'} />
          )}
          {selectedItem && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={handleGoToOperatorPosition} disabled={!selectedItem.latest} style={mapActionButtonStyle(!selectedItem.latest)}>📍 Posizione operatore</button>
              <button onClick={handleReturnToArea} disabled={!liveZones[0]?.geometry} style={mapActionButtonStyle(!liveZones[0]?.geometry)}>⟲ Torna all'area</button>
            </div>
          )}
          <SessionQualityPanel item={selectedItem} />
        </section>

        <aside style={cardStyle}>
          <p style={eyebrowStyle}>Driver e storico</p>
          {withLifecycle.length ? withLifecycle.map((item) => (
            <DriverRow
              key={item.session.id}
              item={item}
              selected={item.session.id === selectedSessionId}
              onSelect={() => setSelectedSessionId(item.session.id)}
            />
          )) : <EmptyState text="Nessuna sessione attiva reale." />}
        </aside>
      </div>

      {selectedItem && (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <p style={eyebrowStyle}>Controllo operativo GPS</p>
          <div style={operationalGridStyle}>
            <div style={operationalCardStyle}>
              <p style={operationalCardTitleStyle}>Stato operatore</p>
              <MiniRow label="Connessione" value={selectedItem.lifecycle === 'live' ? 'Online' : 'Offline'} />
              <MiniRow label="GPS" value={selectedItem.session.status === 'started' ? 'Attivo' : selectedItem.session.status === 'paused' ? 'In pausa' : 'Non avviato'} />
              <MiniRow label="Area" value={ZONE_LIVE_STATUS_LABELS[liveZoneStatus] || ZONE_LIVE_STATUS_LABELS.zone_unavailable} />
              {outsideDistanceKm != null && <MiniRow label="Distanza dalla zona" value={`${outsideDistanceKm.toFixed(1)} km`} />}
              <MiniRow label="Ultimo ping" value={formatDateTime(selectedItem.lastPing)} />
              <MiniRow label="Precisione GPS" value={selectedItem.latest?.accuracy != null ? `${Math.round(selectedItem.latest.accuracy)} m` : 'n/d'} />
            </div>
            <div style={operationalCardStyle}>
              <p style={operationalCardTitleStyle}>Stato lavoro</p>
              <MiniRow label="Sessione" value={WORK_STATUS_LABELS[selectedItem.session.status] || selectedItem.session.status} />
              <MiniRow label="Modalità" value="Automatica GPS" />
              <MiniRow label="Zona attiva" value={activeZoneName || 'n/d'} />
            </div>
            <div style={operationalCardStyle}>
              <p style={operationalCardTitleStyle}>Copertura</p>
              {coverage?.calculation_status === 'ready' ? (
                <>
                  <MiniRow label="Copertura GPS" value={`${coverage.coverage_percent}%`} />
                  <MiniRow label="Km validi" value={`${(selectedItem.km || 0).toFixed(2)} km`} />
                  <MiniRow label="Punti validi/esclusi" value={`${summarizeGpsQuality(selectedItem.points || []).validCount} / ${summarizeGpsQuality(selectedItem.points || []).excludedCount}`} />
                </>
              ) : (
                <MiniRow label="Copertura GPS" value={coverage?.calculation_status === 'zone_geometry_missing' ? 'Confine non ancora disponibile' : 'In calcolo...'} />
              )}
            </div>
          </div>

          {/* Intervento manuale Admin: RIUSA il pannello override zona gia'
              esistente (ZoneProgressPanel + admin_set/clear_zone_manual_progress,
              con storico audit gia' presente) — nessuna seconda implementazione
              di "completamento manuale". "Imposta override" al 100% copre
              "Conferma/Completa manualmente"; "Rimuovi override" copre
              "Riapri zona/Annulla intervento". Non esiste nel codice una stato
              distinto "Da verificare"/"Richiedi ripasso": non inventato qui,
              richiederebbe una nuova colonna di stato non autorizzata da
              questo ticket (vedi report finale). */}
          <div style={{ marginTop: 16 }}>
            <ZoneProgressPanel
              zones={zoneProgress.zones}
              history={zoneProgress.history}
              loading={zoneProgress.loading}
              refreshing={zoneProgress.refreshing}
              error={zoneProgress.error}
              notice={zoneProgress.notice}
              isAdmin
              mutatingZoneId={zoneProgress.mutatingZoneId}
              onRefresh={zoneProgress.refresh}
              onSetManual={zoneProgress.setManualProgress}
              onClearManual={zoneProgress.clearManualProgress}
              theme="dark"
            />
          </div>
        </section>
      )}
    </AdminLayout>
  );
}

function MiniRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <span style={{ color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#fff', fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function LiveZoneStatusBadge({ status, distanceKm }) {
  const color = ZONE_LIVE_STATUS_COLORS[status] || ZONE_LIVE_STATUS_COLORS.zone_unavailable;
  const label = ZONE_LIVE_STATUS_LABELS[status] || ZONE_LIVE_STATUS_LABELS.zone_unavailable;
  return (
    <span style={{ display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 900, color, borderColor: `${color}44`, background: `${color}14` }}>
      {label}{status === 'outside' && distanceKm != null ? ` — ${distanceKm.toFixed(1)} km` : ''}
    </span>
  );
}

function mapActionButtonStyle(disabled) {
  return {
    border: '1px solid rgba(255,255,255,.14)',
    background: disabled ? 'rgba(255,255,255,.04)' : 'rgba(232,87,26,.16)',
    color: disabled ? 'rgba(255,255,255,.35)' : '#fff',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

// Stesso pattern di Admin/GpsMonitor.jsx e Driver/DriverWorkMapPage.jsx.
function FitToZoneBounds({ geometry }) {
  const map = useMap();
  useEffect(() => {
    if (!geometry) return;
    try {
      const bounds = L.geoJSON(geometry).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: la mappa resta dov'e', nessun crash.
    }
  }, [geometry, map]);
  return null;
}

// Ricentra sull'INTERA traccia (fitBounds), non solo sull'ultimo punto: va
// rieseguito ogni volta che cambiano sessione selezionata o punti validi.
function FitBoundsToTrack({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(positions, { padding: [32, 32], maxZoom: 17 });
    } else if (positions.length === 1) {
      map.setView(positions[0], Math.max(map.getZoom(), 15));
    }
  }, [positions, map]);
  return null;
}

function LiveMap({ drivers, selectedSessionId, zones = [], mapRef }) {
  const first = drivers.find((item) => item.latest)?.latest;
  const zoneWithGeometry = useMemo(() => zones.find((zone) => zone.geometry), [zones]);
  const center = useMemo(() => {
    if (first) return [Number(first.lat), Number(first.lng)];
    if (zoneWithGeometry) {
      const coord = zoneWithGeometry.geometry.type === 'MultiPolygon'
        ? zoneWithGeometry.geometry.coordinates?.[0]?.[0]?.[0]
        : zoneWithGeometry.geometry.coordinates?.[0]?.[0];
      if (coord) return [coord[1], coord[0]];
    }
    return [45.4642, 9.19]; // Milano default — solo fallback residuo
  }, [first, zoneWithGeometry]);

  const selected = drivers.find((item) => item.session.id === selectedSessionId) || null;
  const { valid: selectedValidPoints } = useMemo(
    () => filterValidGpsPoints(selected?.points || []),
    [selected],
  );
  const trackPositions = selectedValidPoints
    .map((point) => [Number(point.lat), Number(point.lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  const startPoint = trackPositions[0] || null;

  return (
    <div style={{ height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer ref={mapRef} center={center} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {trackPositions.length < 2 && zoneWithGeometry && <FitToZoneBounds geometry={zoneWithGeometry.geometry} />}
        {zones.map((zone) => {
          if (!zone.geometry || !zone.geometry.coordinates) return null;
          let coords = [];
          if (zone.geometry.type === 'Polygon') {
            coords = zone.geometry.coordinates.map((ring) => ring.map((p) => [p[1], p[0]]));
          } else if (zone.geometry.type === 'MultiPolygon') {
            coords = zone.geometry.coordinates.map((poly) => poly.map((ring) => ring.map((p) => [p[1], p[0]])));
          }
          if (!coords.length) return null;
          return (
            <Polygon key={zone.campaign_zone_id} positions={coords} pathOptions={{ color: '#e8571a', weight: 2, fillColor: '#e8571a', fillOpacity: 0.08 }}>
              <Popup><strong>{zone.zone_name}</strong></Popup>
            </Polygon>
          );
        })}
        {trackPositions.length >= 2 && (
          <>
            <Polyline positions={trackPositions} pathOptions={{ color: '#e8571a', weight: 5, opacity: 0.85 }} />
            <FitBoundsToTrack positions={trackPositions} />
          </>
        )}
        {startPoint && trackPositions.length >= 2 && (
          <CircleMarker center={startPoint} radius={7} pathOptions={{ color: '#0f766e', fillColor: '#2ecc8a', fillOpacity: 0.95, weight: 2 }}>
            <Tooltip direction="top">Partenza sessione</Tooltip>
          </CircleMarker>
        )}
        {drivers.filter((item) => item.latest).map((item) => {
          const isSelected = item.session.id === selectedSessionId;
          const color = statusColor(item.status);
          return (
            <CircleMarker
              key={item.session.id}
              center={[Number(item.latest.lat), Number(item.latest.lng)]}
              radius={isSelected ? 12 : 9}
              pathOptions={{ color: isSelected ? '#1d4ed8' : color, fillColor: color, fillOpacity: 0.85, weight: isSelected ? 4 : 2 }}
            >
              <Popup>
                <strong>{item.status}</strong>
                <br />Driver: {displayDriverName(item.session)}
                <br />Campagna: {item.session.campaign_id}
                <br />Sessione: {item.session.id}
                <br />Device: {displayDeviceId(item.session)}
                <br />Ultimo ping: {formatDateTime(item.lastPing)}
                <br />Accuracy: {item.latest.accuracy != null ? `${Math.round(item.latest.accuracy)} m` : 'n/d'}
                <br />Km: {item.km.toFixed(2)}
                <br />Punti GPS: {item.points.length}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {selected && trackPositions.length === 0 && (
        <div style={{ padding: '10px 4px 0', color: 'rgba(255,255,255,.5)', fontSize: 12 }}>Nessuna traccia disponibile per la sessione selezionata.</div>
      )}
    </div>
  );
}

function SessionQualityPanel({ item }) {
  if (!item) return null;
  const rawKm = (() => {
    const points = [...(item.points || [])].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    let km = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (![a?.lat, a?.lng, b?.lat, b?.lng].every((v) => Number.isFinite(Number(v)))) continue;
      const R = 6371;
      const dLat = ((Number(b.lat) - Number(a.lat)) * Math.PI) / 180;
      const dLng = ((Number(b.lng) - Number(a.lng)) * Math.PI) / 180;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos((Number(a.lat) * Math.PI) / 180) * Math.cos((Number(b.lat) * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      km += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }
    return Math.round(km * 100) / 100;
  })();
  const filteredKm = calculateFilteredDistanceKm(item.points || []);
  const quality = summarizeGpsQuality(item.points || []);

  return (
    <div style={qualityPanelStyle}>
      <p style={eyebrowStyle}>Qualita' traccia — sessione {shortId(item.session.id)}</p>
      <div style={metricRowStyle}>
        <Metric label="Punti totali" value={quality.total} />
        <Metric label="Punti validi" value={quality.validCount} />
        <Metric label="Punti esclusi" value={quality.excludedCount} />
        <Metric label="Qualita' GPS" value={quality.quality} />
        <Metric label="Distanza grezza" value={`${rawKm.toFixed(2)} km`} />
        <Metric label="Distanza corretta" value={`${filteredKm.toFixed(2)} km`} />
      </div>
      {quality.excludedCount > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
          {Object.entries(quality.excludedByReason).map(([reason, count]) => (
            <div key={reason}>{EXCLUSION_LABELS[reason] || reason}: {count}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function DriverRow({ item, selected, onSelect }) {
  return (
    <button type="button" onClick={onSelect} style={{ ...driverRowStyle, ...(selected ? driverRowSelectedStyle : null) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ color: '#fff', fontSize: 16 }}>{displayDriverName(item.session)}</strong>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontWeight: 900 }}>{LIFECYCLE_LABELS[item.lifecycle] || item.lifecycle}</span>
      </div>
      <span><StatusBadge status={item.status} /> · ping {formatDateTime(item.lastPing)} · {item.km.toFixed(2)} km · {item.points.length} punti</span>
      <span>Campagna {shortId(item.session.campaign_id)}</span>
      <span style={{ color: 'rgba(255,255,255,.34)', fontSize: 11 }}>Device {displayDeviceId(item.session)}</span>
    </button>
  );
}

function Kpi({ label, value, tone = 'orange' }) {
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{label}</p>
      <strong style={{ color: toneColor(tone), fontSize: 28 }}>{value}</strong>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 800 }}>{label}</span>
      <strong style={{ color: '#fff', fontSize: 15 }}>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span style={{ ...badgeStyle, color: statusColor(status), borderColor: `${statusColor(status)}66` }}>{status}</span>;
}

function Notice({ text, danger }) {
  return <div style={{ ...noticeStyle, borderColor: danger ? '#ef4444' : 'rgba(255,255,255,.1)', color: danger ? '#fecaca' : '#d1fae5' }}>{text}</div>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

function statusColor(status) {
  if (status === 'online') return '#2ecc8a';
  if (status === 'warning') return '#fbbf24';
  return '#ef4444';
}

function toneColor(tone) {
  if (tone === 'green') return '#2ecc8a';
  if (tone === 'yellow') return '#fbbf24';
  if (tone === 'red') return '#ef4444';
  return '#e8571a';
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : 'n/d';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 };
const layoutStyle = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 };
const filterGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 };
const labelStyle = { display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.55)' };
const inputStyle = { border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.25)', color: '#fff', borderRadius: 9, padding: '10px 11px', font: 'inherit' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontWeight: 800 };
const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' };
const badgeStyle = { border: '1px solid', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 };
const driverRowStyle = { display: 'grid', gap: 5, width: '100%', textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid rgba(255,255,255,.07)', fontSize: 12, background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', color: 'inherit' };
const driverRowSelectedStyle = { background: 'rgba(232,87,26,.12)', boxShadow: 'inset 0 0 0 1px rgba(232,87,26,.4)' };
const qualityPanelStyle = { marginTop: 14, padding: 14, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10 };
const outOfAreaAlertStyle = { marginBottom: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.35)', color: '#fecaca', fontWeight: 900, fontSize: 13 };
const operationalGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 };
const operationalCardStyle = { padding: 14, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10 };
const operationalCardTitleStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.5)', fontWeight: 900 };
const metricRowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 };
const metricStyle = { display: 'grid', gap: 4, padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,.06)' };
