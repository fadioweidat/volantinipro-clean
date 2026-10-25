import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Polygon, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  classifySessionLifecycle,
  classifyDriverStatus,
  displayDeviceId,
  displayDriverName,
  calculateGpsCoverage,
} from '../../lib/services/gps-api.js';
import { adminGpsHistory } from '../../lib/services/admin-gps-history.js';
import { sessionZoneStatus, zoneStatusLabel } from '../../lib/services/admin-gps-history-core.js';
import { dedupeSessionsByOperator, filterOperationalRows, resolveDateRange } from '../../lib/services/report-utils.js';
import { EXCLUSION_LABELS, filterValidGpsPoints, calculateFilteredDistanceKm, summarizeGpsQuality } from '../../lib/gps/pointQuality.js';
import { deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, ZONE_LIVE_STATUS_LABELS, ZONE_LIVE_STATUS_COLORS } from '../../lib/geofence/geofenceEngine.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { AdminLayout } from './AdminLayout.jsx';
import { AdminLiveKpiPanel } from './admin-live/AdminLiveKpiPanel.jsx';
import { AdminLiveFiltersPanel } from './admin-live/AdminLiveFiltersPanel.jsx';
import { AdminLiveSessionsList } from './admin-live/AdminLiveSessionsList.jsx';

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
  const [trace, setTrace] = useState({ sessionId: null, loading: false, error: null, points: [] });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState(prev => ({ ...prev, loading: true, error: null }));
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const range = resolveDateRange(filters.period, filters.fromDate, filters.toDate);
        const drivers = await adminGpsHistory.summaries({ ...range, status: filters.status, signal: controller.signal });
        if (!cancelled) setState({ loading: false, error: null, drivers });
      } catch (err) {
        if (!cancelled) setState(prev => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento live GPS.' }));
      } finally { inFlight = false; }
    }
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [filters.period, filters.fromDate, filters.toDate, filters.status, retry]);

  const campaigns = useMemo(() => Array.from(new Map(state.drivers.map(item => [item.session.campaign_id, { id: item.session.campaign_id, name: item.campaignName }])).values()), [state.drivers]);

  const withLifecycle = useMemo(
    () => filterOperationalRows(state.drivers, filters).map((item) => ({
      ...item,
      status: classifyDriverStatus(item.activityAt),
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
    const withPoints = withLifecycle.find((item) => item.pointCount > 0) || withLifecycle[0] || null;
    setSelectedSessionId(withPoints?.session.id || null);
  }, [withLifecycle, selectedSessionId]);

  const selectedSummary = withLifecycle.find((item) => item.session.id === selectedSessionId) || null;
  useEffect(() => {
    const controller = new AbortController();
    if (!selectedSummary) { setTrace({ sessionId: null, loading: false, error: null, points: [] }); return undefined; }
    const id = selectedSummary.session.id;
    setTrace({ sessionId: id, loading: true, error: null, points: [] });
    adminGpsHistory.trace(id, { expectedCount: selectedSummary.pointCount,
      lastPointAt: selectedSummary.last_point_at, signal: controller.signal })
      .then(points => { if (!controller.signal.aborted) setTrace({ sessionId: id, loading: false, error: null, points }); })
      .catch(error => { if (!controller.signal.aborted) setTrace({ sessionId: id, loading: false, error: error.message, points: [] }); });
    return () => controller.abort();
  }, [selectedSessionId, selectedSummary?.pointCount, selectedSummary?.last_point_at, retry]);
  const selectedItem = selectedSummary ? { ...selectedSummary,
    points: trace.sessionId === selectedSessionId ? trace.points : [],
    traceLoading: trace.sessionId !== selectedSessionId || trace.loading,
    traceError: trace.sessionId === selectedSessionId ? trace.error : null,
  } : null;
  const mapRows = withLifecycle.map(item => item.session.id === selectedSessionId ? selectedItem : item);
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
    () => sessionZoneStatus(selectedItem?.session, deriveLiveZoneStatus(liveZones, selectedItem?.latest?.lat, selectedItem?.latest?.lng)),
    [liveZones, selectedItem?.latest, selectedItem?.session.status],
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
      {state.error && <Notice danger text={`${state.error} Gli eventuali riepiloghi precedenti non sono aggiornati.`} />}
      <button type="button" onClick={() => setRetry(n => n + 1)} style={mapActionButtonStyle(false)}>Aggiorna GPS</button>
      {state.loading && <Notice text="Caricamento riepiloghi GPS..." />}
      {!state.error && !state.loading && <Notice text={`${withLifecycle.length} sessioni · ${withLifecycle.reduce((n, item) => n + item.pointCount, 0)} punti GPS nel database`} />}
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
            <LiveMap drivers={mapRows} selectedSessionId={selectedSessionId} zones={mapZones} mapRef={mapRef} />
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

        <AdminLiveSessionsList
          loading={state.loading}
          error={state.error}
          withLifecycle={withLifecycle}
          selectedSessionId={selectedSessionId}
          setSelectedSessionId={setSelectedSessionId}
          DriverRow={DriverRow}
          EmptyState={EmptyState}
          styles={{
            cardStyle,
            eyebrowStyle,
          }}
        />
      </div>

      {selectedItem && (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <p style={eyebrowStyle}>Controllo operativo GPS</p>
          <div style={operationalGridStyle}>
            <div style={operationalCardStyle}>
              <p style={operationalCardTitleStyle}>Stato operatore</p>
              <MiniRow label="Connessione" value={selectedItem.lifecycle === 'live' ? 'Online' : 'Offline'} />
              <MiniRow label="GPS" value={selectedItem.session.status === 'started' ? 'Attivo' : selectedItem.session.status === 'paused' ? 'In pausa' : 'Sessione conclusa'} />
              <MiniRow label="Area" value={zoneStatusLabel(liveZoneStatus, ZONE_LIVE_STATUS_LABELS)} />
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
                  <MiniRow label="Punti validi/esclusi" value={`${selectedItem.valid_count} / ${selectedItem.pointCount - selectedItem.valid_count}`} />
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
  const label = zoneStatusLabel(status, ZONE_LIVE_STATUS_LABELS);
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
                <br />Campagna: {item.campaignName || item.session.campaign_id}
                <br />Sessione: {item.session.id}
                <br />Device: {displayDeviceId(item.session)}
                <br />Ultimo ping: {formatDateTime(item.lastPing)}
                <br />Accuracy: {item.latest.accuracy != null ? `${Math.round(item.latest.accuracy)} m` : 'n/d'}
                <br />Km: {item.km.toFixed(2)}
                <br />Punti GPS: {item.pointCount}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {selected && trackPositions.length === 0 && (
        <div style={{ padding: '10px 4px 0', color: 'rgba(255,255,255,.5)', fontSize: 12 }}>{selected.traceLoading ? 'Caricamento traccia completa...' : selected.traceError || 'Nessuna traccia disponibile per la sessione selezionata.'}</div>
      )}
    </div>
  );
}

function SessionQualityPanel({ item }) {
  if (!item) return null;
  if (item.traceLoading || item.traceError) return <div style={qualityPanelStyle} role="status">
    <p>{item.pointCount} punti nel database</p>
    {item.traceError || 'Caricamento traccia completa e qualità GPS...'}
  </div>;
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
      <span><StatusBadge status={item.status} /> · ping {formatDateTime(item.lastPing)} · {item.km.toFixed(2)} km · {item.pointCount} punti</span>
      <span>Campagna {item.campaignName || shortId(item.session.campaign_id)}</span>
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
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 12 };
const layoutStyle = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 };
const filterGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 12 };
const labelStyle = { minWidth: 0, display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.55)' };
const inputStyle = { minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.25)', color: '#fff', borderRadius: 9, padding: '10px 11px', font: 'inherit' };
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
