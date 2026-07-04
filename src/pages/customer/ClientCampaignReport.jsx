import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateDistanceKm,
} from '../../lib/services/gps-api.js';
import { getApprovedProofPhotos, getCampaignReport, getAdminCoverageCorrections, getAssignedZones, computeCoverageMetrics } from '../../lib/services/admin-api.js';
import {
  buildGpsCsv,
  deriveCampaignStatus,
  downloadTextFile,
  estimateProgress,
  formatDate,
  formatDateTime,
  formatDuration,
  sessionDurationMs,
} from '../../lib/services/report-utils.js';

export function ClientCampaignReport({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [], campaign: null, corrections: [], zones: [], notice: '' });
  const token = new URLSearchParams(window.location.search).get('token') || '';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [report, photosWithUrls, corrections, zones] = await Promise.all([
          getCampaignReport(campaignId),
          getApprovedProofPhotos(campaignId),
          getAdminCoverageCorrections(campaignId),
          getAssignedZones(campaignId),
        ]);
        if (!cancelled) setState({ loading: false, error: null, points: report.points, sessions: report.sessions.map((item) => item.session), photos: photosWithUrls, campaign: report.campaign, corrections, zones, notice: '' });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Report campagna non disponibile.' }));
      }
    }
    load();
  }, [campaignId, token]);

  const totalKm = calculateDistanceKm(state.points);
  const totalMs = state.sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);
  const status = deriveCampaignStatus(state.sessions);
  const lastActivity = latestActivity(state.points, state.sessions);
  const operatorCount = new Set(state.sessions.map((session) => session.driver_id).filter(Boolean)).size;
  const hasData = state.points.length || state.sessions.length || state.photos.length;
  const dateRange = campaignDateRange(state.campaign, state.sessions);

  const targetKm = state.zones.reduce((s, z) => s + (Number(z.target_km) || 0), 0) || Math.max(10, totalKm || 10);
  const metrics = computeCoverageMetrics(totalKm, targetKm, state.corrections);

  function exportGpsCsv() {
    if (!state.points.length) {
      setState((prev) => ({ ...prev, notice: 'Nessun punto GPS da esportare.' }));
      return;
    }
    const grouped = state.sessions.map((session) => ({
      session,
      points: state.points.filter((point) => point.session_id === session.id),
    }));
    downloadTextFile(`volantinipro-gps-${campaignId}.csv`, buildGpsCsv(campaignId, grouped), 'text/csv;charset=utf-8');
    setState((prev) => ({ ...prev, notice: 'CSV GPS scaricato.' }));
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <a href="/" style={brandStyle}>VolantiniPro</a>
          <h1 style={titleStyle}>Report trasparenza campagna</h1>
          <p style={subtitleStyle}>{campaignTitle(state.campaign, campaignId)}</p>
        </div>
        <div style={actionGroupStyle}>
          <button style={buttonStyle} type="button" onClick={exportGpsCsv}>Scarica CSV GPS</button>
          <button style={buttonStyle} type="button" onClick={() => window.print()}>Stampa PDF</button>
        </div>
      </header>

      {state.error && <Notice danger text={state.error} />}
      {state.notice && <Notice text={state.notice} />}
      {!hasData && !state.loading ? (
        <section style={emptyHeroStyle}>
          <h2 style={{ margin: '0 0 8px', color: '#17211f' }}>Il report si popolera appena inizia il lavoro sul campo.</h2>
          <p style={{ margin: 0, color: '#64748b' }}>Qui compariranno percorso GPS, foto approvate, tempi e riepilogo finale della distribuzione.</p>
        </section>
      ) : null}

      <section style={metricGridStyle}>
        <Metric label="Copertura verificata" value={`${metrics.copertura_finale_cliente_percent}%`} />
        <Metric label="Validazione qualita admin" value="Area verificata dal responsabile operativo" />
        <Metric label="Stato campagna" value={state.loading ? 'caricamento' : status} />
        <Metric label="Avanzamento stimato" value={estimateProgress(state.sessions)} />
        <Metric label="Date lavoro" value={dateRange} />
        <Metric label="Operatori" value={operatorCount || 'in assegnazione'} />
        <Metric label="Km totali" value={`${totalKm.toFixed(2)} km`} />
        <Metric label="Tempo totale" value={formatDuration(totalMs)} />
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Percorso di distribuzione</p>
            <h2 style={sectionTitleStyle}>Tracce GPS registrate</h2>
          </div>
          <span style={pillStyle}>{state.points.length} punti</span>
        </div>
        {state.points.length ? <ClientReportMap points={state.points} sessions={state.sessions} /> : <EmptyState text={state.loading ? 'Caricamento percorso...' : 'Nessun percorso GPS disponibile.'} />}
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Sessioni lavoro</p>
          {state.sessions.length ? state.sessions.map((session) => (
            <div key={session.id} style={rowStyle}>
              <strong>{session.status || 'sessione'}</strong>
              <span>{formatDateTime(session.started_at)} - {formatDateTime(session.ended_at || session.paused_at)}</span>
            </div>
          )) : <EmptyState text="Nessuna sessione registrata." />}
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Foto proof approvate</p>
          {state.photos.length ? state.photos.map((photo) => (
            <div key={photo.id} style={photoRowStyle}>
              {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova approvata" style={photoStyle} /> : <div style={photoPlaceholderStyle}>Foto</div>}
              <div>
                <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
                <p style={{ margin: '5px 0 0', color: '#64748b' }}>{photo.note || 'Prova lavoro approvata'}</p>
              </div>
            </div>
          )) : <EmptyState text="Nessuna foto approvata disponibile." />}
        </div>
      </section>
    </main>
  );
}

function ClientReportMap({ points, sessions }) {
  const validPoints = points.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
  const latest = validPoints[validPoints.length - 1];
  const center = useMemo(() => latest ? [Number(latest.lat), Number(latest.lng)] : [45.4642, 9.19], [latest]);
  const sessionIds = sessions.map((session) => session.id);
  const groups = sessionIds.length
    ? sessionIds.map((sessionId) => points.filter((point) => point.session_id === sessionId))
    : [validPoints];

  return (
    <div style={mapFrameStyle}>
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {groups.map((group, index) => {
          const path = group.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
          return path.length > 1 ? <Polyline key={index} positions={path} pathOptions={{ color: '#e8571a', weight: 4, opacity: 0.82 }} /> : null;
        })}
        {latest && (
          <CircleMarker center={[Number(latest.lat), Number(latest.lng)]} radius={8} pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.9 }}>
            <Popup>Ultima attivita<br />{formatDateTime(latest.recorded_at || latest.created_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={metricStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Notice({ text, danger }) {
  return <div style={{ ...noticeStyle, borderColor: danger ? '#fecaca' : '#bbf7d0', color: danger ? '#991b1b' : '#166534', background: danger ? '#fee2e2' : '#f0fdf4' }}>{text}</div>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

function campaignTitle(campaign, campaignId) {
  return campaign?.title || campaign?.name || campaign?.campaign_name || campaign?.company || `Campagna ${campaignId}`;
}

function campaignDateRange(campaign, sessions) {
  const start = campaign?.start_date || campaign?.delivery_start || sessions.find((session) => session.started_at)?.started_at;
  const end = campaign?.end_date || campaign?.delivery_end || [...sessions].reverse().find((session) => session.ended_at)?.ended_at;
  if (!start && !end) return 'date in definizione';
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function latestActivity(points, sessions) {
  const candidates = [
    ...points.map((point) => point.recorded_at || point.created_at),
    ...sessions.map((session) => session.updated_at || session.ended_at || session.paused_at || session.started_at || session.created_at),
  ].filter(Boolean);
  return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#eef2ef', color: '#17211f', fontFamily: 'Inter, system-ui, sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 };
const brandStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none' };
const titleStyle = { margin: '0 0 8px', fontSize: 34, lineHeight: 1.1, color: '#17211f' };
const subtitleStyle = { margin: 0, color: '#64748b', maxWidth: 620 };
const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 12, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)', marginTop: 16 };
const emptyHeroStyle = { background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 24, marginBottom: 16 };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 };
const metricStyle = { display: 'grid', gap: 4, minHeight: 76, padding: 13, background: '#fff', borderRadius: 10, border: '1px solid #d7ded9' };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 };
const rowStyle = { display: 'grid', gap: 4, padding: 12, borderBottom: '1px solid #e2e8f0' };
const photoRowStyle = { display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid #e2e8f0', alignItems: 'center' };
const photoStyle = { width: 116, height: 86, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' };
const photoPlaceholderStyle = { ...photoStyle, display: 'grid', placeItems: 'center', color: '#94a3b8', background: '#f8fafc' };
const actionGroupStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' };
const buttonStyle = { border: '1px solid #d7ded9', borderRadius: 10, padding: '10px 13px', background: '#17211f', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const disabledButtonStyle = { ...buttonStyle, background: '#e2e8f0', color: '#64748b', cursor: 'not-allowed' };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, marginBottom: 12, fontWeight: 800 };
const emptyStyle = { padding: 18, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' };
const sectionHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const sectionTitleStyle = { margin: 0, color: '#17211f', fontSize: 20 };
const pillStyle = { alignSelf: 'start', padding: '6px 10px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 900 };
const mapFrameStyle = { height: 520, borderRadius: 12, overflow: 'hidden', border: '1px solid #d7ded9' };
