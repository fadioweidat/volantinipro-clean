import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { createProofPhotoSignedUrl, getCampaignGpsPoints, getCampaignGpsSessions, getCampaignProofPhotos, getCampaignRecord, calculateGpsCoverage } from '../../lib/services/gps-api.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';
import { normalizeZonesFromCampaign, summarizeGeofencePoints } from '../../lib/geofence/geofenceEngine.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { AdminLayout } from './AdminLayout.jsx';

export function GpsMonitor({ campaignId, onNav }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [], activeSession: null, campaign: null });
  const [coverage, setCoverage] = useState(null);
  const zoneProgress = useZoneProgress({ campaignId, includeHistory: true });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sessions = await getCampaignGpsSessions(campaignId);
        const activeSession = getLatestTrackableSession(sessions);
        const [points, photos, campaign] = await Promise.all([
          activeSession ? getCampaignGpsPoints(campaignId, { sessionId: activeSession.id }) : Promise.resolve([]),
          getCampaignProofPhotos(campaignId),
          getCampaignRecord(campaignId).catch(() => null),
        ]);
        const photosWithUrls = await hydratePhotoUrls(photos);
        if (!cancelled) setState({ loading: false, error: null, points, sessions, photos: photosWithUrls, activeSession, campaign });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento GPS.' }));
      }
    }
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId]);

  const handleRecalculateCoverage = () => {
    if (state.activeSession?.id) {
      setCoverage(prev => ({ ...prev, calculating: true }));
      calculateGpsCoverage(state.activeSession.id)
        .then(res => setCoverage(res))
        .catch(err => console.error('Error fetching coverage', err));
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (state.activeSession?.id) {
      calculateGpsCoverage(state.activeSession.id)
        .then(res => { if (!cancelled) setCoverage(res); })
        .catch(err => { console.error('Error fetching coverage', err); });
    }
    return () => { cancelled = true; };
  }, [state.activeSession?.id, state.points.length, state.activeSession?.status]);

  const geofenceZones = useMemo(() => normalizeZonesFromCampaign(state.campaign), [state.campaign]);
  const geofence = useMemo(() => summarizeGeofencePoints(state.points, geofenceZones), [state.points, geofenceZones]);

  const status = deriveCampaignStatus(state.sessions);
  const activeMs = state.sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);
  const latest = state.points[state.points.length - 1] || null;
  const latestActivityAt = state.activeSession?.updated_at || latest?.created_at || latest?.recorded_at || state.activeSession?.started_at || null;
  const driverOnline = latestActivityAt ? Date.now() - new Date(latestActivityAt).getTime() < 45000 : false;
  const activeSessionLabel = state.activeSession
    ? `${state.activeSession.status} · ${formatDateTime(state.activeSession.started_at || state.activeSession.created_at)}`
    : 'nessuna sessione';

  const breadcrumbs = [
    { label: "Dashboard", href: "/admin" },
    { label: "Campagne", href: "/admin" },
    { label: `Campagna ${campaignId}` }
  ];

  return (
    <AdminLayout title="Admin GPS Monitor" subtitle={`Campagna ${campaignId}`} breadcrumbs={breadcrumbs} onNav={onNav}>
      {state.error && <div style={errorStyle}>{state.error}</div>}
      <div style={metricGridStyle}>
        <Metric label="Stato campagna" value={status} />
        <Metric label="Sessioni" value={state.sessions.length} />
        <Metric label="Punti GPS" value={state.points.length} />
        <Metric label="Sessione mappa" value={activeSessionLabel} />
        <Metric label="Driver" value={driverOnline ? 'online' : 'offline'} />
        <Metric label="Tempo attivo" value={formatDuration(activeMs)} />
        <Metric label="Geofence" value={<GeofenceBadge status={geofence.status} />} />
        {coverage && coverage.calculation_status === 'ready' && (
          <Metric 
            label="Copertura calcolata" 
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {coverage.coverage_percent}%
                <button 
                  onClick={handleRecalculateCoverage}
                  disabled={coverage.calculating}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
                  title="Ricalcola manualmente"
                >
                  {coverage.calculating ? '...' : 'Ricalcola'}
                </button>
              </div>
            } 
          />
        )}
      </div>

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
      />

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Live map</p>
        {state.points.length > 0 ? (
          <GpsMap points={state.points} latest={latest} />
        ) : (
          <EmptyState text={state.loading ? 'Caricamento tracking GPS...' : 'Nessun tracking GPS disponibile'} />
        )}
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Storico geofence (sessione mappa)</p>
        {geofence.events.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {geofence.events.map((event, index) => (
              <div key={index} style={rowStyle}>
                <span style={{ fontSize: 11, fontWeight: 900, color: event.type === 'exited' ? '#b91c1c' : '#0f766e' }}>
                  {event.type === 'exited' ? 'Uscita confermata' : 'Rientro confermato'}
                </span>
                <span>{formatDateTime(new Date(event.at).toISOString())}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{event.lat.toFixed(5)}, {event.lng.toFixed(5)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={geofenceZones.length ? 'Nessuna uscita dalla zona rilevata sui punti disponibili.' : 'Zona campagna non ancora configurata: verifica non disponibile.'} />
        )}
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Sessioni</p>
          {state.sessions.length ? state.sessions.map((session) => (
            <div key={session.id} style={session.id === state.activeSession?.id ? activeSessionRowStyle : rowStyle}>
              <strong>{session.status}</strong>
              <span>{formatDateTime(session.started_at)} - {formatDateTime(session.ended_at || session.paused_at)}</span>
              <span>{session.driver_id}</span>
              <span>{sessionOnlineLabel(session, state.activeSession, latest)}</span>
              {session.id === state.activeSession?.id ? <span style={activeBadgeStyle}>mappa</span> : null}
            </div>
          )) : <EmptyState text="Nessuna sessione registrata" />}
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Foto proof</p>
          {state.photos.length ? state.photos.map((photo) => (
            <ProofPhoto key={photo.id} photo={photo} />
          )) : <EmptyState text="Nessuna foto prova caricata" />}
        </div>
      </section>
    </AdminLayout>
  );
}

const GEOFENCE_LABELS = {
  inside: 'In zona',
  outside: 'Fuori zona',
  zone_unavailable: 'Zona non configurata',
  stale: 'Posizione non aggiornata',
  unknown: 'Verifica in corso',
};

function GeofenceBadge({ status }) {
  const color = status === 'outside' ? '#b91c1c' : status === 'inside' ? '#0f766e' : '#b45309';
  return <span style={{ display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 900, color, borderColor: `${color}44`, background: `${color}14` }}>{GEOFENCE_LABELS[status] || GEOFENCE_LABELS.unknown}</span>;
}

function sessionOnlineLabel(session, activeSession, latestPoint) {
  if (session.id !== activeSession?.id) return 'offline';
  const activityAt = session.updated_at || latestPoint?.created_at || latestPoint?.recorded_at || session.started_at;
  if (!activityAt) return 'offline';
  return Date.now() - new Date(activityAt).getTime() < 45000 ? 'online' : 'offline';
}

function getLatestTrackableSession(sessions) {
  const trackableStatuses = new Set(['started', 'paused', 'completed']);
  return (sessions || [])
    .filter((session) => trackableStatuses.has(session.status))
    .sort((a, b) => {
      const aTime = new Date(a.started_at || a.created_at || 0).getTime();
      const bTime = new Date(b.started_at || b.created_at || 0).getTime();
      return bTime - aTime;
    })[0] || null;
}

function GpsMap({ points, latest }) {
  const center = useMemo(() => [Number(latest.lat), Number(latest.lng)], [latest]);
  // Solo i punti che superano il filtro qualita' (stesso modulo condiviso di
  // AdminLiveDashboard) finiscono nella polilinea: un punto anomalo isolato
  // non deve piu' disegnare un salto impossibile sulla mappa.
  const validPoints = useMemo(() => filterValidGpsPoints(points).valid, [points]);
  const path = validPoints.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  return (
    <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#e8571a', weight: 4, opacity: 0.82 }} />}
        {points.map((point) => (
          <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={4} pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.65 }}>
            <Popup>
              {formatDateTime(point.recorded_at)}
              <br />
              Accuracy: {point.accuracy != null ? `${Math.round(point.accuracy)} m` : 'n/d'}
            </Popup>
          </CircleMarker>
        ))}
        {latest && (
          <CircleMarker center={[latest.lat, latest.lng]} radius={8} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
            <Popup>Ultimo punto<br />{formatDateTime(latest.recorded_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

function ProofPhoto({ photo }) {
  const meta = parseProofPhotoNote(photo.note);
  return (
    <div style={rowStyle}>
      {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8 }} /> : null}
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
          {meta.outcome && <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e' }}>{podOutcomeLabel(meta.outcome)}</span>}
          <span style={{ fontSize: 11, color: photo.approved_at ? '#0f766e' : '#b45309' }}>{photo.approved_at ? 'Approvata' : 'In attesa di approvazione'}</span>
        </div>
        <p style={{ margin: '4px 0', color: 'rgba(255,255,255,.55)' }}>{meta.client || 'Cliente non specificato'}{meta.address ? ` · ${meta.address}` : ''}</p>
        {(meta.ddt || meta.colli) && (
          <p style={{ margin: '2px 0', color: 'rgba(255,255,255,.4)', fontSize: 12 }}>{meta.ddt ? `DDT ${meta.ddt}` : ''}{meta.ddt && meta.colli ? ' · ' : ''}{meta.colli ? `${meta.colli} colli` : ''}</p>
        )}
        {meta.note && <p style={{ margin: '2px 0', color: 'rgba(255,255,255,.4)', fontSize: 12 }}>{meta.note}</p>}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{photo.lat && photo.lng ? `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` : 'Coordinate non disponibili'}</span>
      </div>
    </div>
  );
}

async function hydratePhotoUrls(photos) {
  return Promise.all((photos || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
}

function deriveCampaignStatus(sessions) {
  if (!sessions.length) return 'non iniziata';
  if (sessions.some((session) => session.status === 'started')) return 'in corso';
  if (sessions.some((session) => session.status === 'paused')) return 'pausa';
  if (sessions.every((session) => session.status === 'completed')) return 'completata';
  return sessions[0]?.status || 'non iniziata';
}

function sessionDurationMs(session) {
  if (!session.started_at) return 0;
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.ended_at || session.paused_at || Date.now()).getTime();
  return Math.max(0, end - start);
}

function Metric({ label, value }) {
  return <div style={metricStyle}><span>{label}</span><strong style={{ color: '#fff' }}>{value}</strong></div>;
}

function EmptyState({ text }) {
  return <div style={{ padding: 20, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' }}>{text}</div>;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(0,0,0,.24)', color: '#fff' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 };
const metricStyle = { display: 'grid', gap: 4, padding: 12, background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)', color: 'rgba(255,255,255,.62)' };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 };
const rowStyle = { display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid rgba(255,255,255,.07)', alignItems: 'center', flexWrap: 'wrap', color: 'rgba(255,255,255,.75)' };
const activeSessionRowStyle = { ...rowStyle, background: 'rgba(249,115,22,.08)', borderRadius: 10, borderBottom: '1px solid rgba(249,115,22,.2)' };
const activeBadgeStyle = { padding: '3px 8px', borderRadius: 999, background: '#e8571a', color: '#fff', fontSize: 11, fontWeight: 900 };
const errorStyle = { padding: 12, borderRadius: 10, color: '#fecaca', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)' };
