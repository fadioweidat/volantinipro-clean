import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateDistanceKm,
  createProofPhotoSignedUrl,
  displayDriverName,
  getSessionGroup,
} from '../../lib/services/gps-api.js';
import { getCampaignReport } from '../../lib/services/admin-api.js';
import {
  REPORT_COLORS,
  buildGpsCsv,
  buildSessionCsv,
  detectAnomalies,
  deriveCampaignStatus,
  downloadTextFile,
  estimateProgress,
  filterOperationalRows,
  formatDateTime,
  formatDuration,
  lastActivityAt,
  sessionDurationMs,
  shortId,
} from '../../lib/services/report-utils.js';

export function CampaignReport({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, operations: null, campaign: null, notice: '' });
  const [filters, setFilters] = useState({ period: 'all', fromDate: '', toDate: '', group: '', driver: '', status: 'all' });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const report = await getCampaignReport(campaignId);
        const photos = await hydratePhotoUrls(report.photos);
        if (!cancelled) setState({ loading: false, error: null, operations: { ...report, photos }, campaign: report.campaign, notice: '' });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento report campagna.' }));
      }
    }
    load();
  }, [campaignId]);

  const rows = (state.operations?.sessions || []).map((item) => ({
    ...item,
    driverName: displayDriverName(item.session),
    group: getSessionGroup(item.session),
    groupName: getSessionGroup(item.session).name,
    activityAt: lastActivityAt(item.session, item.points),
  }));
  const visibleRows = filterOperationalRows(rows, filters);
  const allSessions = rows.map((item) => item.session);
  const visibleSessions = visibleRows.map((item) => item.session);
  const totalKm = visibleRows.reduce((sum, item) => sum + calculateDistanceKm(item.points), 0);
  const totalMs = visibleRows.reduce((sum, item) => sum + sessionDurationMs(item.session), 0);
  const totalPoints = visibleRows.reduce((sum, item) => sum + item.points.length, 0);
  const operators = new Set(visibleRows.map((item) => displayDriverName(item.session)).filter(Boolean));
  const anomalies = detectAnomalies(visibleRows);
  const timeline = buildTimeline(visibleRows, state.operations?.photos || []);

  function exportSessions() {
    if (!visibleRows.length) return setNotice('Nessuna sessione da esportare.');
    downloadTextFile(`volantinipro-sessioni-${campaignId}.csv`, buildSessionCsv(campaignId, visibleRows, displayDriverName, calculateDistanceKm), 'text/csv;charset=utf-8');
    setNotice('CSV sessioni esportato.');
  }

  function exportGps() {
    if (!totalPoints) return setNotice('Nessun punto GPS da esportare.');
    downloadTextFile(`volantinipro-gps-${campaignId}.csv`, buildGpsCsv(campaignId, visibleRows), 'text/csv;charset=utf-8');
    setNotice('CSV punti GPS esportato.');
  }

  function exportJson() {
    const payload = {
      campaign: state.campaign,
      campaign_id: campaignId,
      exported_at: new Date().toISOString(),
      filters,
      notes,
      summary: {
        status: deriveCampaignStatus(visibleSessions),
        sessions: visibleRows.length,
        operators: operators.size,
        total_km: Number(totalKm.toFixed(3)),
        total_ms: totalMs,
        total_points: totalPoints,
        photos: state.operations?.photos?.length || 0,
        anomalies: anomalies.length,
      },
      sessions: visibleRows,
      photos: state.operations?.photos || [],
      anomalies,
      timeline,
    };
    downloadTextFile(`volantinipro-operativo-${campaignId}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    setNotice('JSON operativo esportato.');
  }

  function setNotice(notice) {
    setState((prev) => ({ ...prev, notice }));
  }

  return (
    <AdminShell title="Report finale campagna" subtitle={`Campagna ${campaignId}`} campaignId={campaignId}>
      {state.error && <Notice danger text={state.error} />}
      {state.notice && <Notice text={state.notice} />}

      <section style={toolbarStyle}>
        <ReportFilters filters={filters} onChange={setFilters} operators={Array.from(new Set(rows.map((item) => item.driverName).filter(Boolean)))} />
        <div style={actionGroupStyle}>
          <button style={buttonStyle} type="button" onClick={exportSessions}>CSV sessioni</button>
          <button style={buttonStyle} type="button" onClick={exportGps}>CSV GPS</button>
          <button style={buttonStyle} type="button" onClick={exportJson}>JSON operativo</button>
          <button style={disabledButtonStyle} type="button" disabled>PDF disponibile dopo generazione report</button>
        </div>
      </section>

      <section style={kpiGridStyle}>
        <Kpi label="Stato" value={state.loading ? 'caricamento' : deriveCampaignStatus(allSessions)} />
        <Kpi label="Avanzamento" value={estimateProgress(allSessions)} />
        <Kpi label="Sessioni filtrate" value={`${visibleRows.length}/${rows.length}`} />
        <Kpi label="Operatori" value={operators.size || 'n/d'} />
        <Kpi label="Km totali" value={`${totalKm.toFixed(2)} km`} />
        <Kpi label="Tempo totale" value={formatDuration(totalMs)} />
        <Kpi label="Punti GPS" value={totalPoints} />
        <Kpi label="Foto proof" value={state.operations?.photos?.length || 0} />
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Riepilogo campagna</p>
            <h2 style={sectionTitleStyle}>{campaignTitle(state.campaign, campaignId)}</h2>
          </div>
          <a style={navButtonStyle} href={`/client/campaigns/${campaignId}/report`}>Vista cliente</a>
        </div>
        <Summary campaign={state.campaign} campaignId={campaignId} />
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Mappa percorsi separati</p>
        {visibleRows.some((item) => item.points.length) ? <ReportMap rows={visibleRows} /> : <EmptyState text={state.loading ? 'Caricamento percorsi...' : 'Nessun punto GPS per i filtri selezionati.'} />}
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Anomalie</p>
          {anomalies.length ? anomalies.map((item, index) => <Alert key={index} item={item} />) : <EmptyState text="Nessuna anomalia rilevata sui dati disponibili." />}
          <div style={infoNoticeStyle}>Fuori zona: pronto per verifica appena la campagna espone geometria/area operativa confrontabile.</div>
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Note operative</p>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} style={textareaStyle} placeholder="Aggiungi note interne per chiusura lavoro, anomalie gestite o indicazioni al team." />
        </div>
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Sessioni</p>
          {visibleRows.length ? visibleRows.map((item, index) => <SessionRow key={item.session.id} item={item} color={REPORT_COLORS[index % REPORT_COLORS.length]} />) : <EmptyState text="Nessuna sessione per i filtri selezionati." />}
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Timeline attivita</p>
          {timeline.length ? timeline.map((item, index) => <TimelineRow key={`${item.type}-${index}`} item={item} />) : <EmptyState text="Timeline non disponibile." />}
        </div>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Foto proof</p>
        {state.operations?.photos?.length ? (
          <div style={photoGridStyle}>
            {state.operations.photos.map((photo) => (
              <article key={photo.id} style={photoCardStyle}>
                {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto proof" style={photoStyle} /> : <div style={photoPlaceholderStyle}>Foto</div>}
                <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
                <span>{photo.approved_at ? 'approvata' : 'da verificare'}</span>
                <small>{photo.note || 'Nessuna nota'}</small>
              </article>
            ))}
          </div>
        ) : <EmptyState text="Nessuna foto proof caricata." />}
      </section>
    </AdminShell>
  );
}

function ReportMap({ rows }) {
  const firstPoint = rows.flatMap((item) => item.points)[0];
  const center = useMemo(() => firstPoint ? [Number(firstPoint.lat), Number(firstPoint.lng)] : [45.4642, 9.19], [firstPoint]);
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
                <CircleMarker center={[Number(latest.lat), Number(latest.lng)]} radius={7} pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}>
                  <Popup>
                    Operatore {displayDriverName(item.session)}
                    <br />Sessione {shortId(item.session.id)}
                    <br />Punti {item.points.length}
                    <br />Km {calculateDistanceKm(item.points).toFixed(2)}
                  </Popup>
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

function ReportFilters({ filters, onChange, operators }) {
  const patch = (field, value) => onChange((prev) => ({ ...prev, [field]: value }));
  return (
    <div style={filterGridStyle}>
      <label style={labelStyle}>Periodo
        <select value={filters.period} onChange={(event) => patch('period', event.target.value)} style={inputStyle}>
          <option value="all">Tutto</option>
          <option value="today">Oggi</option>
          <option value="yesterday">Ieri</option>
          <option value="7d">Ultimi 7 giorni</option>
          <option value="custom">Intervallo date</option>
        </select>
      </label>
      <label style={labelStyle}>Da
        <input type="date" value={filters.fromDate} onChange={(event) => patch('fromDate', event.target.value)} style={inputStyle} disabled={filters.period !== 'custom'} />
      </label>
      <label style={labelStyle}>A
        <input type="date" value={filters.toDate} onChange={(event) => patch('toDate', event.target.value)} style={inputStyle} disabled={filters.period !== 'custom'} />
      </label>
      <label style={labelStyle}>Operatore
        <input list="operators" value={filters.driver} onChange={(event) => patch('driver', event.target.value)} style={inputStyle} placeholder="nome o id" />
        <datalist id="operators">{operators.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
      <label style={labelStyle}>Gruppo
        <input value={filters.group || ''} onChange={(event) => patch('group', event.target.value)} style={inputStyle} placeholder="nome gruppo" />
      </label>
      <label style={labelStyle}>Stato sessione
        <select value={filters.status} onChange={(event) => patch('status', event.target.value)} style={inputStyle}>
          <option value="all">Tutti</option>
          <option value="started">Started</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
    </div>
  );
}

function Summary({ campaign, campaignId }) {
  const rows = [
    ['ID campagna', campaignId],
    ['Origine dati', campaign?.source_table || 'tracking operativo'],
    ['Cliente', campaign?.client_name || campaign?.customer_name || campaign?.company || 'n/d'],
    ['Stato gestionale', campaign?.status || campaign?.state || 'n/d'],
    ['Zona', campaign?.area_label || campaign?.city || campaign?.address || 'n/d'],
  ];
  return <div style={summaryGridStyle}>{rows.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>;
}

function SessionRow({ item, color }) {
  return (
    <div style={{ ...sessionRowStyle, borderLeftColor: color }}>
      <strong style={{ color: '#fff' }}>{displayDriverName(item.session)} · {shortId(item.session.id)}</strong>
      <span>Status {item.session.status || 'n/d'} · {formatDateTime(item.session.started_at)} - {formatDateTime(item.session.ended_at || item.session.paused_at)}</span>
      <span>{calculateDistanceKm(item.points).toFixed(2)} km · {item.points.length} punti GPS · ultima attivita {formatDateTime(item.activityAt)}</span>
    </div>
  );
}

function TimelineRow({ item }) {
  return (
    <div style={timelineRowStyle}>
      <strong>{item.label}</strong>
      <span>{formatDateTime(item.at)}</span>
      <small>{item.detail}</small>
    </div>
  );
}

function Alert({ item }) {
  return <div style={alertStyle}><strong>{item.label}</strong><span>{item.detail}</span></div>;
}

function Kpi({ label, value }) {
  return <div style={cardStyle}><p style={eyebrowStyle}>{label}</p><strong style={{ color: '#e8571a', fontSize: 25 }}>{value}</strong></div>;
}

function Notice({ text, danger }) {
  return <div style={{ ...noticeStyle, borderColor: danger ? '#ef4444' : 'rgba(255,255,255,.1)', color: danger ? '#fecaca' : '#d1fae5' }}>{text}</div>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

function campaignTitle(campaign, campaignId) {
  return campaign?.title || campaign?.name || campaign?.campaign_name || `Campagna ${campaignId}`;
}

function buildTimeline(rows, photos) {
  return [
    ...rows.flatMap((item) => [
      { type: 'session-start', at: item.session.started_at, label: 'Sessione avviata', detail: displayDriverName(item.session) },
      { type: 'session-end', at: item.session.ended_at || item.session.paused_at, label: item.session.ended_at ? 'Sessione chiusa' : 'Sessione in pausa', detail: displayDriverName(item.session) },
    ]),
    ...(photos || []).map((photo) => ({ type: 'photo', at: photo.taken_at || photo.created_at, label: 'Foto proof', detail: photo.approved_at ? 'Approvata' : 'Da verificare' })),
  ].filter((item) => item.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 40);
}

async function hydratePhotoUrls(photos) {
  return Promise.all((photos || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
}

function AdminShell({ title, subtitle, campaignId, children }) {
  return (
    <main style={shellStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <a href="/admin" style={{ color: '#e8571a', fontWeight: 900, textDecoration: 'none' }}>VolantiniPro Admin</a>
          <h1 style={{ margin: '8px 0 4px', fontSize: 34, color: '#fff' }}>{title}</h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.55)' }}>{subtitle}</p>
        </div>
        <div style={actionGroupStyle}>
          <a href="/admin/live" style={navButtonStyle}>Storico live</a>
          <a href={`/admin/campaigns/${campaignId}/operations`} style={navButtonStyle}>Operazioni</a>
        </div>
      </header>
      <div style={{ display: 'grid', gap: 16 }}>{children}</div>
    </main>
  );
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#07100d', color: 'rgba(255,255,255,.72)', fontFamily: 'Inter, system-ui, sans-serif' };
const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const toolbarStyle = { ...cardStyle, display: 'grid', gap: 14 };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 };
const summaryGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 };
const filterGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 };
const actionGroupStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.55)' };
const inputStyle = { border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.25)', color: '#fff', borderRadius: 9, padding: '10px 11px', font: 'inherit' };
const textareaStyle = { ...inputStyle, minHeight: 170, resize: 'vertical' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const sectionHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' };
const sectionTitleStyle = { margin: 0, color: '#fff', fontSize: 22 };
const navButtonStyle = { alignSelf: 'start', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 13px', color: '#fff', textDecoration: 'none', fontWeight: 900 };
const buttonStyle = { ...navButtonStyle, background: 'rgba(255,255,255,.04)', cursor: 'pointer' };
const disabledButtonStyle = { ...buttonStyle, color: 'rgba(255,255,255,.38)', cursor: 'not-allowed' };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontWeight: 800 };
const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' };
const mapFrameStyle = { height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' };
const sessionRowStyle = { display: 'grid', gap: 5, padding: '12px 0 12px 12px', borderBottom: '1px solid rgba(255,255,255,.07)', borderLeft: '4px solid', fontSize: 12 };
const timelineRowStyle = { display: 'grid', gap: 4, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,.07)', fontSize: 12 };
const alertStyle = { display: 'grid', gap: 5, padding: 12, marginBottom: 8, borderRadius: 10, border: '1px solid rgba(251,191,36,.35)', background: 'rgba(251,191,36,.08)', color: '#fde68a' };
const infoNoticeStyle = { padding: 12, marginTop: 10, borderRadius: 10, color: 'rgba(255,255,255,.55)', background: 'rgba(255,255,255,.035)', fontSize: 12 };
const photoGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 };
const photoCardStyle = { display: 'grid', gap: 7, padding: 10, border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, background: 'rgba(0,0,0,.16)', fontSize: 12 };
const photoStyle = { width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 };
const photoPlaceholderStyle = { ...photoStyle, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.42)', background: 'rgba(255,255,255,.05)' };
