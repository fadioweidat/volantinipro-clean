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
import { getCampaignReport, getGroupSessions, getAdminCoverageCorrections, getAssignedZones, createAdminCoverageCorrection, computeCoverageMetrics } from '../../lib/services/admin-api.js';
import { detectSessionAlerts, enrichSession, groupShareUrl } from '../../lib/services/group-ops.js';
import { REPORT_COLORS, filterOperationalRows, formatDateTime, formatDuration, sessionDurationMs, shortId } from '../../lib/services/report-utils.js';

export function CampaignGroupDetail({ campaignId, groupId }) {
  const [state, setState] = useState({ loading: true, error: null, report: null, groupSessions: [], photos: [], corrections: [], zones: [], notice: '' });
  const [filters, setFilters] = useState({ period: 'all', fromDate: '', toDate: '', operator: '', status: 'all' });
  const [adminNote, setAdminNote] = useState('');
  const [corrForm, setCorrForm] = useState({
    correctionType: 'coperto_manualmente',
    reason: 'zona montagna',
    label: '',
    notes: '',
    estimatedKm: '1.5',
  });
  const decodedGroupId = decodeURIComponent(groupId);

  async function load(cancelledRef = { current: false }) {
    try {
      const [report, groupSessions, corrections, zones] = await Promise.all([
        getCampaignReport(campaignId),
        getGroupSessions(campaignId, decodedGroupId),
        getAdminCoverageCorrections(campaignId, { groupId: decodedGroupId }),
        getAssignedZones(campaignId, { groupId: decodedGroupId }),
      ]);
      const photos = await Promise.all((report.photos || []).map(async (photo) => ({
        ...photo,
        signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
      })));
      if (!cancelledRef.current) setState({ loading: false, error: null, report, groupSessions, photos, corrections, zones, notice: '' });
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

  const groupKm = visibleRows.reduce((sum, item) => sum + item.km, 0);
  const targetKm = state.zones.reduce((s, z) => s + (Number(z.target_km) || 0), 0) || Math.max(10, groupKm || 10);
  const metrics = computeCoverageMetrics(groupKm, targetKm, state.corrections);

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

  async function handleCreateCorrection(e) {
    e.preventDefault();
    if (!corrForm.label) {
      setNotice('Inserisci una label o via per la correzione.');
      return;
    }
    try {
      await createAdminCoverageCorrection({
        campaignId,
        groupId: decodedGroupId,
        correctionType: corrForm.correctionType,
        reason: corrForm.reason,
        label: corrForm.label,
        notes: corrForm.notes,
        estimatedKm: Number(corrForm.estimatedKm) || 0,
      });
      if (corrForm.correctionType === 'da_rifare') {
        if (import.meta.env.DEV) console.log('[GPS_REWORK_ASSIGNED]');
      } else {
        if (import.meta.env.DEV) console.log('[GPS_MANUAL_COVERAGE_CREATED]');
      }
      setNotice('Correzione copertura admin salvata con successo.');
      setCorrForm({ ...corrForm, label: '', notes: '' });
      await load();
    } catch (err) {
      setNotice(`Errore salvataggio correzione: ${err.message}`);
    }
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
          <p style={mutedStyle}>Area assegnata: {state.zones.map(z => z.label).join(', ') || 'Area operativa standard'}</p>
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

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Copertura (Divisione Interna Admin vs Verificata Finale Cliente)</p>
          </div>
        </div>
        <div style={kpiGridStyle}>
          <Kpi label="GPS Reale" value={`${metrics.copertura_gps_reale_percent}%`} color="#60a5fa" />
          <Kpi label="Validazione Admin" value={`${metrics.copertura_manual_admin_percent}%`} color="#2ecc8a" />
          <Kpi label="Da Rifare" value={`${metrics.copertura_da_rifare_percent}%`} color="#ef4444" />
          <Kpi label="Finale Cliente" value={`${metrics.copertura_finale_cliente_percent}%`} color="#e8571a" />
        </div>
      </section>

      <section style={{ ...kpiGridStyle, marginTop: 16 }}>
        <Kpi label="Operatori" value={visibleRows.length} />
        <Kpi label="Online" value={visibleRows.filter((item) => item.status === 'online').length} color="#2ecc8a" />
        <Kpi label="Warning" value={visibleRows.filter((item) => item.status === 'warning').length} color="#fbbf24" />
        <Kpi label="Offline" value={visibleRows.filter((item) => item.status === 'offline').length} color="#ef4444" />
        <Kpi label="Km gruppo" value={`${groupKm.toFixed(2)} km`} />
        <Kpi label="Punti GPS" value={visibleRows.reduce((sum, item) => sum + item.points.length, 0)} />
        <Kpi label="Foto proof" value={groupPhotos.length} />
      </section>

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
          <p style={eyebrowStyle}>Mappa operativa e di validazione</p>
          {(visibleRows.some((item) => item.points.length) || state.corrections.length > 0) ? (
            <GroupMap rows={visibleRows} corrections={state.corrections} />
          ) : (
            <EmptyState text="Nessun dato reale o correzione disponibile" />
          )}
        </section>
        <aside style={cardStyle}>
          <p style={eyebrowStyle}>Correzione Copertura Admin</p>
          <form onSubmit={handleCreateCorrection} style={{ display: 'grid', gap: 10 }}>
            <label style={labelStyle}>Tipo Correzione
              <select value={corrForm.correctionType} onChange={(e) => setCorrForm({ ...corrForm, correctionType: e.target.value })} style={inputStyle}>
                <option value="coperto_manualmente">Coperto manualmente</option>
                <option value="validato_admin">Validato da admin</option>
                <option value="da_rifare">Da rifare</option>
                <option value="impossibile">Impossibile da coprire</option>
              </select>
            </label>
            <label style={labelStyle}>Motivo Standard
              <select value={corrForm.reason} onChange={(e) => setCorrForm({ ...corrForm, reason: e.target.value })} style={inputStyle}>
                <option value="GPS debole">GPS debole</option>
                <option value="zona montagna">Zona montagna</option>
                <option value="strada privata">Strada privata</option>
                <option value="accesso impossibile">Accesso impossibile</option>
                <option value="rete assente">Rete assente</option>
                <option value="operatore conferma copertura">Operatore conferma copertura</option>
                <option value="verifica admin">Verifica admin</option>
                <option value="altro">Altro</option>
              </select>
            </label>
            <label style={labelStyle}>Via / Area o Segmento
              <input value={corrForm.label} onChange={(e) => setCorrForm({ ...corrForm, label: e.target.value })} onClick={() => import.meta.env.DEV && console.log('[GPS_UNCOVERED_AREA_SELECTED]')} placeholder="Es. Via Roma montagna" style={inputStyle} />
            </label>
            <label style={labelStyle}>Km stimati
              <input type="number" step="0.1" value={corrForm.estimatedKm} onChange={(e) => setCorrForm({ ...corrForm, estimatedKm: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>Note admin
              <input value={corrForm.notes} onChange={(e) => setCorrForm({ ...corrForm, notes: e.target.value })} placeholder="Dettagli verifica..." style={inputStyle} />
            </label>
            <button type="submit" style={{ ...buttonStyle, background: '#e8571a', borderColor: '#e8571a' }}>Salva Correzione Copertura</button>
          </form>

          <p style={{ ...eyebrowStyle, marginTop: 20 }}>Alert</p>
          {alerts.length ? alerts.map((alert, index) => <Alert key={index} alert={alert} />) : <EmptyState text="Nessun alert aperto." />}
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
        <p style={eyebrowStyle}>Storico Correzioni Admin</p>
        {state.corrections.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {state.corrections.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                <div>
                  <strong style={{ color: c.correction_type === 'da_rifare' ? '#ef4444' : '#38bdf8' }}>{c.label}</strong> ({c.correction_type})
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>Motivo: {c.reason} · {c.estimated_km} km stimati · {formatDateTime(c.created_at)}</div>
                </div>
                {c.notes && <span style={{ fontSize: 11, fontStyle: 'italic', color: 'rgba(255,255,255,.6)' }}>"{c.notes}"</span>}
              </div>
            ))}
          </div>
        ) : <EmptyState text="Nessuna correzione salvata" />}
      </section>
    </main>
  );
}

function GroupMap({ rows, corrections = [] }) {
  const first = rows.flatMap((item) => item.points)[0];
  const center = useMemo(() => first ? [Number(first.lat), Number(first.lng)] : [45.4642, 9.19], [first]);

  useEffect(() => {
    if (rows.some(r => r.points.length) || corrections.length > 0) {
      if (import.meta.env.DEV) console.log('[GPS_MAP_POINTS_LOADED]');
    } else {
      if (import.meta.env.DEV) console.log('[GPS_MAP_EMPTY]');
    }
  }, [rows, corrections]);

  return (
    <div style={mapFrameStyle}>
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {rows.map((item, index) => {
          const path = item.points.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
          const latest = item.points[item.points.length - 1];
          const color = REPORT_COLORS[index % REPORT_COLORS.length];
          if (path.length > 1) {
            if (import.meta.env.DEV) console.log('[GPS_TRACK_RENDERED]');
          }
          if (latest) {
            if (import.meta.env.DEV) console.log('[GPS_OPERATOR_MARKER_RENDERED]');
          }
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
        {corrections.map((c, idx) => {
          const offsetLat = center[0] + ((idx + 1) * 0.004);
          const offsetLng = center[1] + ((idx + 1) * 0.004);
          const mockPath = [[offsetLat - 0.003, offsetLng - 0.003], [offsetLat + 0.003, offsetLng + 0.003]];
          const isRedo = c.correction_type === 'da_rifare';
          const corrColor = isRedo ? '#ef4444' : '#38bdf8';
          return (
            <Polyline key={c.id || idx} positions={mockPath} pathOptions={{ color: corrColor, weight: 5, dashArray: '6, 6', opacity: 0.9 }}>
              <Popup><strong>{c.label}</strong><br />Tipo: {c.correction_type}<br />Motivo: {c.reason}</Popup>
            </Polyline>
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
