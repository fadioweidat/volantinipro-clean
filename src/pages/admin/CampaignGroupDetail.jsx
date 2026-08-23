import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateDistanceKm,
  createProofPhotoSignedUrl,
  displayDriverName,
  endGpsSession,
  updateSessionAdminOverride,
} from '../../lib/services/gps-api.js';
import { getCampaignReport, getGroupSessions } from '../../lib/services/admin-api.js';
import { detectSessionAlerts, enrichSession, groupShareUrl } from '../../lib/services/group-ops.js';
import { REPORT_COLORS, filterOperationalRows, formatDateTime, formatDuration, sessionDurationMs, shortId } from '../../lib/services/report-utils.js';
import { CampaignGroupDetailKpiPanel } from './campaign-group-detail/CampaignGroupDetailKpiPanel.jsx';

export function CampaignGroupDetail({ campaignId, groupId }) {
  const [state, setState] = useState({ loading: true, error: null, report: null, groupSessions: [], photos: [], notice: '' });
  const [filters, setFilters] = useState({ period: 'all', fromDate: '', toDate: '', operator: '', status: 'all' });
  const [adminNote, setAdminNote] = useState('');
  const decodedGroupId = decodeURIComponent(groupId);

  async function load(cancelledRef = { current: false }) {
    try {
      const [report, groupSessions] = await Promise.all([
        getCampaignReport(campaignId),
        getGroupSessions(campaignId, decodedGroupId),
      ]);
      const photos = await Promise.all((report.photos || []).map(async (photo) => ({
        ...photo,
        signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
      })));
      if (!cancelledRef.current) setState({ loading: false, error: null, report, groupSessions, photos, notice: '' });
    } catch (err) {
      if (!cancelledRef.current) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento gruppo.' }));
    }
  }

  useEffect(() => {
    const cancelledRef = { current: false };
    load(cancelledRef);
    const timer = window.setInterval(() => load(cancelledRef), 15000);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(timer);
    };
  }, [campaignId, decodedGroupId]);

  const group = state.report?.groups?.find((item) => item.id === decodedGroupId) || { id: decodedGroupId, name: `Gruppo ${decodedGroupId}`, sessions: [] };
  const allRows = (state.groupSessions || [])
    .map((item) => enrichSession(item, state.report?.photos || []));
  const visibleRows = filterOperationalRows(allRows.map((item) => ({ ...item, driverName: displayDriverName(item.session), activityAt: item.lastPing })), {
    period: filters.period,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    status: filters.status,
    driver: filters.operator,
  });
  const alerts = visibleRows.flatMap((item) => detectSessionAlerts(item));
  const groupPhotos = state.photos.filter((photo) => visibleRows.some((item) => item.session.id === photo.session_id));
  const shareUrl = groupShareUrl(campaignId, group);

  async function copyLink() {
    await navigator.clipboard?.writeText(shareUrl);
    setNotice(`Link gruppo copiato: ${shareUrl}`);
  }

  function sendWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Link tracking ${group.name}: ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
  }

  async function adminAction(sessionId, patch) {
    if (patch.action === 'end') {
      await endGpsSession(sessionId);
    } else {
      await updateSessionAdminOverride(sessionId, patch);
    }
    setNotice('Azione admin salvata come override/nota. I punti GPS reali non sono stati modificati.');
    await load();
  }

  function setNotice(notice) {
    setState((prev) => ({ ...prev, notice }));
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <a href={`/admin/campaigns/${campaignId}/groups`} style={brandStyle}>VolantiniPro Admin</a>
          <h1 style={titleStyle}>{group.name}</h1>
          <p style={mutedStyle}>Area assegnata: area non definita</p>
        </div>
        <div style={actionsStyle}>
          <button style={buttonStyle} type="button" onClick={copyLink}>Copia link gruppo</button>
          <button style={buttonStyle} type="button" onClick={sendWhatsApp}>Invia WhatsApp</button>
          <a style={buttonStyle} href={`/admin/campaigns/${campaignId}/report`}>Report</a>
        </div>
      </header>

      {state.loading && <Notice text="Caricamento dati gruppo..." />}
      {state.error && <Notice danger text={state.error} />}
      {state.notice && <Notice text={state.notice} />}

      <CampaignGroupDetailKpiPanel
        operatorsValue={visibleRows.length}
        onlineValue={visibleRows.filter((item) => item.status === 'online').length}
        warningValue={visibleRows.filter((item) => item.status === 'warning').length}
        offlineValue={visibleRows.filter((item) => item.status === 'offline').length}
        kmValue={`${visibleRows.reduce((sum, item) => sum + item.km, 0).toFixed(2)} km`}
        pointsValue={visibleRows.reduce((sum, item) => sum + item.points.length, 0)}
        photosValue={groupPhotos.length}
        coverageValue="area non definita"
        Kpi={Kpi}
        styles={{
          kpiGridStyle,
        }}
      />

      <section style={toolbarStyle}>
        <label style={labelStyle}>Periodo
          <select value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} style={inputStyle}>
            <option value="all">Tutto</option>
            <option value="today">Oggi</option>
            <option value="yesterday">Ieri</option>
            <option value="7d">Ultimi 7 giorni</option>
            <option value="custom">Intervallo custom</option>
          </select>
        </label>
        <label style={labelStyle}>Gruppo
          <input value={group.name} disabled style={inputStyle} />
        </label>
        <label style={labelStyle}>Da
          <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
        </label>
        <label style={labelStyle}>A
          <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
        </label>
        <label style={labelStyle}>Operatore
          <input value={filters.operator} onChange={(event) => setFilters((prev) => ({ ...prev, operator: event.target.value }))} style={inputStyle} placeholder="nome operatore" />
        </label>
        <label style={labelStyle}>Stato
          <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={inputStyle}>
            <option value="all">Tutti</option>
            <option value="started">Started</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="offline">Offline</option>
          </select>
        </label>
      </section>

      <div style={layoutStyle}>
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Mappa live gruppo</p>
          {visibleRows.some((item) => item.points.length) ? <GroupMap rows={visibleRows} /> : <EmptyState text="Nessun dato reale disponibile" />}
        </section>
        <aside style={cardStyle}>
          <p style={eyebrowStyle}>Alert</p>
          {alerts.length ? alerts.map((alert, index) => <Alert key={index} alert={alert} />) : <EmptyState text="Nessun alert aperto." />}
          <div style={infoNoticeStyle}>Fuori zona: pronto appena area campagna/gruppo e disponibile.</div>
        </aside>
      </div>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Operatori del gruppo</p>
          {visibleRows.length ? visibleRows.map((item) => (
            <OperatorRow key={item.session.id} item={item} adminNote={adminNote} setAdminNote={setAdminNote} onAction={adminAction} />
          )) : <EmptyState text="Nessun dato reale disponibile" />}
        </div>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Foto proof</p>
          {groupPhotos.length ? groupPhotos.map((photo) => (
            <div key={photo.id} style={photoRowStyle}>
              {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto proof" style={photoStyle} /> : <div style={photoPlaceholderStyle}>Foto</div>}
              <div>
                <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
                <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.48)' }}>{photo.note || 'Nessuna nota'}</p>
              </div>
            </div>
          )) : <EmptyState text="Nessun dato reale disponibile" />}
        </div>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>QR code</p>
        <EmptyState text="QR code non generato: nessuna libreria QR locale disponibile. Usa Copia link gruppo o Invia WhatsApp." />
      </section>
    </main>
  );
}

function GroupMap({ rows }) {
  const first = rows.flatMap((item) => item.points)[0];
  const center = useMemo(() => first ? [Number(first.lat), Number(first.lng)] : [45.4642, 9.19], [first]);
  return (
    <div style={mapFrameStyle}>
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {rows.map((item, index) => {
          const path = item.points.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
          const latest = item.points[item.points.length - 1];
          const color = REPORT_COLORS[index % REPORT_COLORS.length];
          return (
            <Fragment key={item.session.id}>
              {path.length > 1 && <Polyline positions={path} pathOptions={{ color, weight: 4, opacity: 0.86 }} />}
              {latest && (
                <CircleMarker center={[Number(latest.lat), Number(latest.lng)]} radius={8} pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}>
                  <Popup>{displayDriverName(item.session)}<br />{formatDateTime(latest.recorded_at || latest.created_at)}<br />{item.km.toFixed(2)} km</Popup>
                </CircleMarker>
              )}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

function Fragment({ children }) {
  return <>{children}</>;
}

function OperatorRow({ item, adminNote, setAdminNote, onAction }) {
  return (
    <div style={operatorRowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: '#fff' }}>{displayDriverName(item.session)}</strong>
        <span style={{ color: statusColor(item.status), fontWeight: 900 }}>{item.status}</span>
      </div>
      <span>Sessione {shortId(item.session.id)} · {item.session.status} · ultimo ping {formatDateTime(item.lastPing)}</span>
      <span>{formatDuration(sessionDurationMs(item.session))} · {calculateDistanceKm(item.points).toFixed(2)} km · {item.points.length} punti GPS</span>
      <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Nota admin / override" style={textareaStyle} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={smallButtonStyle} type="button" onClick={() => onAction(item.session.id, { action: 'end' })}>Termina sessione</button>
        <button style={smallButtonStyle} type="button" onClick={() => onAction(item.session.id, { status: 'partial_completed', note: adminNote })}>Segna completato parziale</button>
        <button style={smallButtonStyle} type="button" onClick={() => onAction(item.session.id, { status: 'problem', note: adminNote })}>Segna problema</button>
        <button style={smallButtonStyle} type="button" onClick={() => onAction(item.session.id, { note: adminNote })}>Aggiungi nota admin</button>
        <button style={smallButtonStyle} type="button" onClick={() => onAction(item.session.id, { hidden_test: true, note: adminNote })}>Nascondi sessione test</button>
        <button style={smallButtonStyle} type="button" onClick={() => onAction(item.session.id, { reassign_requested: true, note: adminNote })}>Riassegna a gruppo</button>
      </div>
    </div>
  );
}

function Alert({ alert }) {
  return <div style={{ ...alertStyle, borderColor: alert.level === 'red' ? 'rgba(239,68,68,.38)' : 'rgba(251,191,36,.38)', color: alert.level === 'red' ? '#fecaca' : '#fde68a' }}><strong>{alert.label}</strong><span>{alert.detail}</span></div>;
}

function Kpi({ label, value, color = '#e8571a' }) {
  return <div style={cardStyle}><p style={eyebrowStyle}>{label}</p><strong style={{ color, fontSize: 24 }}>{value}</strong></div>;
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

const shellStyle = { minHeight: '100vh', padding: 24, background: '#07100d', color: 'rgba(255,255,255,.72)', fontFamily: 'Inter, system-ui, sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 };
const brandStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none' };
const titleStyle = { margin: '8px 0 4px', fontSize: 34, color: '#fff' };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.55)', fontSize: 12 };
const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 };
const toolbarStyle = { ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 };
const layoutStyle = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, marginBottom: 16 };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginBottom: 16 };
const actionsStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' };
const buttonStyle = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 13px', color: '#fff', background: 'rgba(255,255,255,.04)', textDecoration: 'none', fontWeight: 900, cursor: 'pointer' };
const smallButtonStyle = { ...buttonStyle, padding: '7px 9px', fontSize: 12 };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const labelStyle = { display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.55)' };
const inputStyle = { border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.25)', color: '#fff', borderRadius: 9, padding: '10px 11px', font: 'inherit' };
const textareaStyle = { ...inputStyle, minHeight: 58, resize: 'vertical' };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontWeight: 800, marginBottom: 12 };
const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' };
const mapFrameStyle = { height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' };
const alertStyle = { display: 'grid', gap: 5, padding: 12, marginBottom: 8, borderRadius: 10, border: '1px solid', background: 'rgba(255,255,255,.04)', fontSize: 12 };
const infoNoticeStyle = { padding: 12, marginTop: 10, borderRadius: 10, color: 'rgba(255,255,255,.55)', background: 'rgba(255,255,255,.035)', fontSize: 12 };
const operatorRowStyle = { display: 'grid', gap: 7, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.07)', fontSize: 12 };
const photoRowStyle = { display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid rgba(255,255,255,.07)', alignItems: 'center' };
const photoStyle = { width: 108, height: 80, objectFit: 'cover', borderRadius: 8 };
const photoPlaceholderStyle = { ...photoStyle, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.42)', background: 'rgba(255,255,255,.05)' };
