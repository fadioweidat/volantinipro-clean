import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { createProofPhotoSignedUrl, getCampaignGpsPoints, getCampaignGpsSessions, getCampaignProofPhotos } from '../../lib/services/gps-api.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';

export function CampaignTracking({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [] });
  const zoneProgress = useZoneProgress({ campaignId });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [points, sessions, photos] = await Promise.all([
          getCampaignGpsPoints(campaignId),
          getCampaignGpsSessions(campaignId),
          getCampaignProofPhotos(campaignId, { approvedOnly: true }),
        ]);
        const photosWithUrls = await Promise.all((photos || []).map(async (photo) => ({
          ...photo,
          signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
        })));
        if (!cancelled) setState({ loading: false, error: null, points, sessions, photos: photosWithUrls });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Tracking non disponibile.' }));
      }
    }
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId]);

  const status = deriveCampaignStatus(state.sessions);
  const activeMs = state.sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);

  return (
    <main style={shellStyle}>
      <header style={{ marginBottom: 22 }}>
        <a href="/" style={{ color: '#e8571a', fontWeight: 900, textDecoration: 'none' }}>VolantiniPro</a>
        <p style={eyebrowStyle}>Tracking cliente</p>
        <h1 style={{ margin: 0, fontSize: 34 }}>Stato distribuzione</h1>
      </header>

      {state.error && <div style={errorStyle}>{state.error}</div>}

      <div style={metricGridStyle}>
        <Metric label="Stato campagna" value={status} />
        <Metric label="Punti GPS" value={state.points.length} />
        <Metric label="Tempo registrato" value={formatDuration(activeMs)} />
        <Metric label="Foto approvate" value={state.photos.length} />
      </div>

      <div style={{ marginTop: 16 }}>
        <ZoneProgressPanel
          zones={zoneProgress.zones}
          loading={zoneProgress.loading}
          refreshing={zoneProgress.refreshing}
          error={zoneProgress.error}
          notice={zoneProgress.notice}
          onRefresh={zoneProgress.refresh}
        />
      </div>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Percorso distribuzione</p>
        {state.points.length > 0 ? (
          <TrackingMap points={state.points} />
        ) : (
          <EmptyState text={state.loading ? 'Caricamento tracking GPS...' : 'Nessun tracking GPS disponibile'} />
        )}
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Riepilogo orari</p>
          {state.sessions.length ? state.sessions.map((session) => (
            <div key={session.id} style={rowStyle}>
              <strong>{session.status}</strong>
              <span>{formatDateTime(session.started_at)} - {formatDateTime(session.ended_at || session.paused_at)}</span>
            </div>
          )) : <EmptyState text="Nessuna sessione registrata" />}
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Foto prova approvate</p>
          {state.photos.length ? state.photos.map((photo) => {
            const meta = parseProofPhotoNote(photo.note);
            return (
              <div key={photo.id} style={rowStyle}>
                {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova approvata" style={{ width: 110, height: 82, objectFit: 'cover', borderRadius: 8 }} /> : null}
                <div>
                  <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
                  {meta.outcome && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#0f766e' }}>{podOutcomeLabel(meta.outcome)}</span>}
                  <p style={{ margin: '4px 0', color: '#64748b' }}>{meta.client || 'Cliente non specificato'}{meta.address ? ` · ${meta.address}` : ''}</p>
                  {(meta.ddt || meta.colli) && (
                    <p style={{ margin: '2px 0', color: '#94a3b8', fontSize: 12 }}>{meta.ddt ? `DDT ${meta.ddt}` : ''}{meta.ddt && meta.colli ? ' · ' : ''}{meta.colli ? `${meta.colli} colli` : ''}</p>
                  )}
                  {meta.note && <p style={{ margin: '2px 0', color: '#94a3b8', fontSize: 12 }}>{meta.note}</p>}
                </div>
              </div>
            );
          }) : <EmptyState text="Nessuna foto prova approvata disponibile" />}
        </div>
      </section>
    </main>
  );
}

function TrackingMap({ points }) {
  const latest = points[points.length - 1];
  const center = useMemo(() => [Number(latest.lat), Number(latest.lng)], [latest]);
  const path = points.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  return (
    <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid #d7ded9' }}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#e8571a', weight: 4, opacity: 0.82 }} />}
        <CircleMarker center={[latest.lat, latest.lng]} radius={8} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
          <Popup>Ultimo punto<br />{formatDateTime(latest.recorded_at)}</Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
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
  return <div style={metricStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ text }) {
  return <div style={{ padding: 20, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' }}>{text}</div>;
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

const shellStyle = { minHeight: '100vh', padding: 24, background: '#eef2ef', color: '#17211f', fontFamily: 'Inter, system-ui, sans-serif' };
const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)', marginTop: 16 };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 };
const metricStyle = { display: 'grid', gap: 4, padding: 12, background: '#fff', borderRadius: 10, border: '1px solid #d7ded9' };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 };
const rowStyle = { display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid #e2e8f0', alignItems: 'center', flexWrap: 'wrap' };
const errorStyle = { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', marginBottom: 16 };
