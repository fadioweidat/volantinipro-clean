import 'leaflet/dist/leaflet.css';
import { MapContainer, Polyline, Popup, TileLayer, CircleMarker } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { classifyDriverStatus, displayDriverName, getSessionGroup } from '../../lib/services/gps-api.js';
import { getCampaignReport } from '../../lib/services/admin-api.js';
import { buildGpsCsv, buildSessionCsv, downloadTextFile, filterOperationalRows, lastActivityAt } from '../../lib/services/report-utils.js';

const DEFAULT_CENTER = [45.4642, 9.19];
const COLORS = ['#e8571a', '#2ecc8a', '#60a5fa', '#fbbf24', '#a78bfa', '#ef4444'];

export function CampaignOperations({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, operations: null, notice: '' });
  const [filters, setFilters] = useState({ period: 'all', fromDate: '', toDate: '', campaign: campaignId, group: '', driver: '', status: 'all' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const operations = await getCampaignReport(campaignId);
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: null, operations }));
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento operazioni campagna.' }));
      }
    }
    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId]);

  const operations = state.operations;
  const sessions = (operations?.sessions || []).map((item) => ({
    ...item,
    driverName: displayDriverName(item.session),
    group: getSessionGroup(item.session),
    groupName: getSessionGroup(item.session).name,
    activityAt: lastActivityAt(item.session, item.points),
  }));
  const visibleSessions = filterOperationalRows(sessions, filters);
  const status = deriveCampaignStatus(visibleSessions.map((item) => item.session));
  const drivers = new Set(visibleSessions.map((item) => displayDriverName(item.session)).filter(Boolean));
  const progress = estimateProgress(visibleSessions);
  const totalKm = visibleSessions.reduce((sum, item) => sum + distanceKm(item.points), 0);
  const totalPoints = visibleSessions.reduce((sum, item) => sum + item.points.length, 0);
  const totalMs = visibleSessions.reduce((sum, item) => sum + sessionDurationMs(item.session), 0);

  function exportSessionsCsv() {
    if (!visibleSessions.length) {
      setState((prev) => ({ ...prev, notice: 'Nessuna sessione reale da esportare.' }));
      return;
    }
    downloadTextFile(`volantinipro-sessioni-${campaignId}.csv`, buildSessionCsv(campaignId, visibleSessions, displayDriverName, distanceKm), 'text/csv;charset=utf-8');
    setState((prev) => ({ ...prev, notice: 'CSV sessioni esportato.' }));
  }

  function exportGpsCsv() {
    if (!totalPoints) {
      setState((prev) => ({ ...prev, notice: 'Nessun punto GPS da esportare.' }));
      return;
    }
    downloadTextFile(`volantinipro-gps-${campaignId}.csv`, buildGpsCsv(campaignId, visibleSessions), 'text/csv;charset=utf-8');
    setState((prev) => ({ ...prev, notice: 'CSV punti GPS esportato.' }));
  }

  function exportJson() {
    downloadTextFile(`volantinipro-operazioni-${campaignId}.json`, JSON.stringify({
      campaign_id: campaignId,
      exported_at: new Date().toISOString(),
      filters,
      sessions: visibleSessions,
      photos: operations?.photos || [],
      summary: { sessions: visibleSessions.length, operators: drivers.size, total_km: totalKm, total_points: totalPoints, total_ms: totalMs },
    }, null, 2), 'application/json;charset=utf-8');
    setState((prev) => ({ ...prev, notice: 'JSON operativo esportato.' }));
  }

  return (
    <AdminShell title="Operazioni campagna" subtitle={`Campagna ${campaignId}`}>
      {state.error && <Notice danger text={state.error} />}
      {state.notice && <Notice text={state.notice} />}

      <section style={kpiGridStyle}>
        <Kpi label="Status campagna" value={status} />
        <Kpi label="Driver assegnati" value={drivers.size || 'dato non disponibile'} />
        <Kpi label="Sessioni" value={`${visibleSessions.length}/${sessions.length}`} />
        <Kpi label="Tempo totale" value={formatDuration(totalMs)} />
        <Kpi label="Km totali" value={`${Number(totalKm || 0).toFixed(2)} km`} />
        <Kpi label="Punti GPS" value={totalPoints} />
        <Kpi label="Foto proof" value={operations?.photos?.length || 0} />
        <Kpi label="Avanzamento stimato" value={progress} />
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtri storico</p>
        <div style={filterGridStyle}>
          <label style={labelStyle}>Periodo
            <select value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} style={inputStyle}>
              <option value="all">Tutto</option>
              <option value="today">Oggi</option>
              <option value="yesterday">Ieri</option>
              <option value="7d">Ultimi 7 giorni</option>
              <option value="custom">Intervallo date</option>
            </select>
          </label>
          <label style={labelStyle}>Da
            <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>A
            <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>Campagna
            <input value={campaignId} disabled style={inputStyle} />
          </label>
          <label style={labelStyle}>Operatore
            <input value={filters.driver} onChange={(event) => setFilters((prev) => ({ ...prev, driver: event.target.value }))} style={inputStyle} placeholder="nome o id" />
          </label>
          <label style={labelStyle}>Gruppo
            <input value={filters.group} onChange={(event) => setFilters((prev) => ({ ...prev, group: event.target.value }))} style={inputStyle} placeholder="nome gruppo" />
          </label>
          <label style={labelStyle}>Stato sessione
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={inputStyle}>
              <option value="all">Tutti</option>
              <option value="started">Started</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <p style={eyebrowStyle}>Mappa operativa</p>
            <span style={mutedStyle}>Percorsi separati per sessione. Nessuna linea unisce sessioni diverse.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a style={buttonStyle} href={`/admin/campaigns/${campaignId}/gps`}>Apri monitor GPS</a>
            <a style={buttonStyle} href={`/admin/campaigns/${campaignId}/report`}>Report finale</a>
            <button style={buttonStyle} type="button" onClick={exportSessionsCsv}>CSV sessioni</button>
            <button style={buttonStyle} type="button" onClick={exportGpsCsv}>CSV GPS</button>
            <button style={buttonStyle} type="button" onClick={exportJson}>JSON operativo</button>
          </div>
        </div>
        {visibleSessions.some((item) => item.points.length) ? (
          <OperationsMap sessions={visibleSessions} />
        ) : (
          <EmptyState text={state.loading ? 'Caricamento operazioni campagna...' : 'Nessun tracking GPS disponibile per questa campagna'} />
        )}
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Sessioni driver</p>
        {visibleSessions.length ? visibleSessions.map((item, index) => (
          <SessionRow key={item.session.id} item={item} color={COLORS[index % COLORS.length]} />
        )) : <EmptyState text="Nessuna sessione delivery registrata." />}
      </section>
    </AdminShell>
  );
}

function OperationsMap({ sessions }) {
  const firstPoint = sessions.flatMap((item) => item.points)[0];
  const center = firstPoint ? [Number(firstPoint.lat), Number(firstPoint.lng)] : DEFAULT_CENTER;

  return (
    <div style={{ height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {sessions.map((item, index) => {
          const path = item.points.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
          const latest = item.points[item.points.length - 1];
          const color = COLORS[index % COLORS.length];
          return (
            <FragmentSession key={item.session.id}>
              {path.length > 1 && <Polyline positions={path} pathOptions={{ color, weight: 4, opacity: 0.85 }} />}
              {latest && (
                <CircleMarker center={[Number(latest.lat), Number(latest.lng)]} radius={7} pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}>
                  <Popup>
                    Sessione {item.session.id}
                    <br />Driver {displayDriverName(item.session)}
                    <br />Punti {item.points.length}
                    <br />Km {distanceKm(item.points).toFixed(2)}
                  </Popup>
                </CircleMarker>
              )}
            </FragmentSession>
          );
        })}
      </MapContainer>
    </div>
  );
}

function FragmentSession({ children }) {
  return <>{children}</>;
}

function SessionRow({ item, color }) {
  const latest = item.points[item.points.length - 1];
  const lastPing = latest?.recorded_at || latest?.created_at || item.session.updated_at || item.session.started_at;
  const driverStatus = classifyDriverStatus(lastPing);
  return (
    <div style={{ ...sessionRowStyle, borderLeftColor: color }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: '#fff' }}>Sessione {shortId(item.session.id)}</strong>
        <span style={{ color }}>{driverStatus}</span>
      </div>
      <span>Driver {displayDriverName(item.session)}</span>
      <span>Status sessione {item.session.status || 'dato non disponibile'}</span>
      <span>{formatDateTime(item.session.started_at)} - {formatDateTime(item.session.ended_at || item.session.paused_at)}</span>
      <span>{distanceKm(item.points).toFixed(2)} km · {item.points.length} punti GPS · ultimo ping {formatDateTime(lastPing)}</span>
    </div>
  );
}

function AdminShell({ title, subtitle, children }) {
  return (
    <main style={shellStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <a href="/admin" style={{ color: '#e8571a', fontWeight: 900, textDecoration: 'none' }}>VolantiniPro Admin</a>
          <h1 style={{ margin: '8px 0 4px', fontSize: 34, color: '#fff' }}>{title}</h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.55)' }}>{subtitle}</p>
        </div>
        <a href="/admin/live" style={navButtonStyle}>Monitor GPS Live</a>
      </header>
      <div style={{ display: 'grid', gap: 16 }}>{children}</div>
    </main>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{label}</p>
      <strong style={{ color: '#e8571a', fontSize: 25 }}>{value}</strong>
    </div>
  );
}

function Notice({ text, danger }) {
  return <div style={{ ...noticeStyle, borderColor: danger ? '#ef4444' : 'rgba(255,255,255,.1)', color: danger ? '#fecaca' : '#d1fae5' }}>{text}</div>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

function deriveCampaignStatus(sessions) {
  if (!sessions.length) return 'non iniziata';
  if (sessions.some((session) => session.status === 'started')) return 'in corso';
  if (sessions.some((session) => session.status === 'paused')) return 'pausa';
  if (sessions.every((session) => session.status === 'completed')) return 'completata';
  return 'dato non disponibile';
}

function estimateProgress(sessions) {
  if (!sessions.length) return 'dato non disponibile';
  const completed = sessions.filter((item) => item.session.status === 'completed').length;
  return `${Math.round((completed / sessions.length) * 100)}%`;
}

function distanceKm(points) {
  let meters = 0;
  for (let index = 1; index < (points || []).length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const lat1 = Number(a.lat);
    const lng1 = Number(a.lng);
    const lat2 = Number(b.lat);
    const lng2 = Number(b.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) continue;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    meters += 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return meters / 1000;
}

function formatDuration(ms) {
  const minutes = Math.floor((ms || 0) / 60000);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : 'n/d';
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#07100d', color: 'rgba(255,255,255,.72)', fontFamily: 'Inter, system-ui, sans-serif' };
const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 };
const filterGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.55)' };
const inputStyle = { border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.25)', color: '#fff', borderRadius: 9, padding: '10px 11px', font: 'inherit' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const mutedStyle = { color: 'rgba(255,255,255,.48)', fontSize: 12 };
const navButtonStyle = { alignSelf: 'start', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 13px', color: '#fff', textDecoration: 'none', fontWeight: 900 };
const buttonStyle = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 13px', background: 'rgba(255,255,255,.04)', color: '#fff', textDecoration: 'none', fontWeight: 900, cursor: 'pointer' };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontWeight: 800 };
const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' };
const sessionRowStyle = { display: 'grid', gap: 5, padding: '12px 0 12px 12px', borderBottom: '1px solid rgba(255,255,255,.07)', borderLeft: '4px solid', fontSize: 12 };
