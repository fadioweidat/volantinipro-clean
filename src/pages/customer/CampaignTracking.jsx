import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { createProofPhotoSignedUrl, getCampaignGpsPoints, getCampaignGpsSessions, getCampaignProofPhotos, calculateDistanceKm } from '../../lib/services/gps-api.js';
import { getAdminCoverageCorrections, getAssignedZones, computeCoverageMetrics } from '../../lib/services/admin-api.js';
import { useCampagnaDetail } from '../../hooks/useCampagnaDetail.js';
import { buildClientCampaignInsights, confirmClientCampaignOwnership, filterApprovedClientPhotos, isClientTrackingEnabled, projectClientCampaignSourceData } from '../../lib/ai/buildClientCampaignInsights.js';
import { ClientTrackingAI } from '../../components/ai/client/ClientTrackingAI.jsx';

export function CampaignTracking({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [], corrections: [], zones: [] });
  const { campagna, loading: campaignLoading, error: campaignError } = useCampagnaDetail(campaignId);
  const [clientSession] = useState(() => { try { return JSON.parse(localStorage.getItem('vp_supabase_session') || 'null'); } catch { return null; } });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [points, sessions, photos, corrections, zones] = await Promise.all([
          getCampaignGpsPoints(campaignId),
          getCampaignGpsSessions(campaignId),
          getCampaignProofPhotos(campaignId, { approvedOnly: true }),
          getAdminCoverageCorrections(campaignId),
          getAssignedZones(campaignId),
        ]);
        const photosWithUrls = await Promise.all((photos || []).map(async (photo) => ({
          ...photo,
          signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
        })));
        if (!cancelled) setState({ loading: false, error: null, points, sessions, photos: photosWithUrls, corrections, zones });
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
  const totalKm = calculateDistanceKm(state.points);
  const targetKm = state.zones.reduce((s, z) => s + (Number(z.target_km) || 0), 0) || Math.max(10, totalKm || 10);
  const metrics = computeCoverageMetrics(totalKm, targetKm, state.corrections);
  const ownershipConfirmed = confirmClientCampaignOwnership(campagna, clientSession);
  const trackingEnabled = isClientTrackingEnabled(campagna);
  const campaignObservedAt = campagna?.updated_at || campagna?.created_at || null;
  const lastPoint = state.points[state.points.length - 1] || null;
  const gpsObservedAt = lastPoint?.recorded_at || lastPoint?.created_at || null;
  const approvedPhotos = filterApprovedClientPhotos(state.photos);
  const trackingAi = buildClientCampaignInsights({
    sources: {
      campaign: campaignLoading ? { status: 'missing', reason: 'Caricamento campagna in corso.' } : campaignError || !campagna ? { status: 'error', reason: campaignError?.message || 'Campagna non disponibile.' } : { status: 'ready', data: projectClientCampaignSourceData(campagna), observedAt: campaignObservedAt, staleAfterMs: 24 * 60 * 60 * 1000 },
      gpsPoints: state.loading ? { status: 'missing', reason: 'Caricamento GPS in corso.' } : state.error ? { status: 'error', reason: state.error } : { status: 'ready', data: state.points, observedAt: gpsObservedAt, staleAfterMs: 5 * 60 * 1000 },
      approvedPhotos: state.loading ? { status: 'missing', reason: 'Caricamento foto in corso.' } : state.error ? { status: 'error', reason: state.error } : { status: 'ready', data: approvedPhotos, observedAt: approvedPhotos[0]?.approved_at || approvedPhotos[0]?.created_at || null, staleAfterMs: 24 * 60 * 60 * 1000 },
      coverageMetrics: state.loading ? { status: 'missing', reason: 'Caricamento copertura in corso.' } : state.error ? { status: 'error', reason: state.error } : { status: 'ready', data: { coveragePercent: metrics.copertura_finale_cliente_percent, formula: 'computeCoverageMetrics esistente', inputs: ['metrics.copertura_finale_cliente_percent'], assumptions: ['Valore riutilizzato senza ricalcolo AI.'] }, observedAt: gpsObservedAt, staleAfterMs: 5 * 60 * 1000 },
    },
    context: { campaignId, ownershipConfirmed, clientTrackingEnabled: trackingEnabled, approvedOnly: true },
  });

  return (
    <main style={shellStyle}>
      <header style={{ marginBottom: 22 }}>
        <a href="/" style={{ color: '#e8571a', fontWeight: 900, textDecoration: 'none' }}>VolantiniPro</a>
        <p style={eyebrowStyle}>Tracking cliente</p>
        <h1 style={{ margin: 0, fontSize: 34 }}>Stato distribuzione</h1>
      </header>

      {state.error && <div style={errorStyle}>{state.error}</div>}

      <ClientTrackingAI insights={trackingAi} loading={state.loading || campaignLoading} error={state.error || campaignError?.message || null} />

      <div style={metricGridStyle}>
        <Metric label="Copertura verificata" value={`${metrics.copertura_finale_cliente_percent}%`} />
        <Metric label="Validazione qualita admin" value="Area verificata dal responsabile operativo" />
        <Metric label="Stato campagna" value={status} />
        <Metric label="Punti GPS" value={state.points.length} />
        <Metric label="Tempo registrato" value={formatDuration(activeMs)} />
        <Metric label="Foto approvate" value={state.photos.length} />
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
          {state.photos.length ? state.photos.map((photo) => (
            <div key={photo.id} style={rowStyle}>
              {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova approvata" style={{ width: 110, height: 82, objectFit: 'cover', borderRadius: 8 }} /> : null}
              <div>
                <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
                <p style={{ margin: '4px 0', color: '#64748b' }}>{photo.note || 'Foto prova'}</p>
              </div>
            </div>
          )) : <EmptyState text="Nessuna foto prova approvata disponibile" />}
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
