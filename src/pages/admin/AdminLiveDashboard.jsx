import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  displayDeviceId,
  displayDriverName,
} from '../../lib/services/gps-api.js';
import { getLiveDrivers } from '../../lib/services/admin-api.js';
import { filterOperationalRows } from '../../lib/services/report-utils.js';
import { AdminLayout } from './AdminLayout.jsx';

export function AdminLiveDashboard({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, drivers: [] });
  const [filters, setFilters] = useState({ period: 'today', fromDate: '', toDate: '', campaign: 'all', group: '', status: 'all', driver: '' });

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
  const visibleDrivers = filterOperationalRows(state.drivers, filters);

  const offlineCount = visibleDrivers.filter((item) => item.status === 'offline').length;
  const activeCount = visibleDrivers.filter((item) => ['started', 'paused'].includes(item.session.status)).length;

  const breadcrumbs = [
    { label: "Dashboard", href: "/admin" },
    { label: "GPS Live" }
  ];

  return (
    <AdminLayout title="Monitor GPS Live" subtitle="Driver, campagne attive e storico operativo" breadcrumbs={breadcrumbs} onNav={onNav}>
      {state.error && <Notice danger text={state.error} />}
      {offlineCount > 0 && <Notice danger text={`${offlineCount} driver offline o senza ping recente.`} />}

      <section style={kpiGridStyle}>
        <Kpi label="Sessioni filtrate" value={visibleDrivers.length} />
        <Kpi label="Sessioni live" value={activeCount} tone="green" />
        <Kpi label="Online" value={visibleDrivers.filter((item) => item.status === 'online').length} tone="green" />
        <Kpi label="Warning" value={visibleDrivers.filter((item) => item.status === 'warning').length} tone="yellow" />
        <Kpi label="Offline" value={offlineCount} tone="red" />
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtri storico</p>
        <div style={filterGridStyle}>
          <label style={labelStyle}>
            Periodo
            <select value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} style={inputStyle}>
              <option value="today">Oggi</option>
              <option value="yesterday">Ieri</option>
              <option value="7d">Ultimi 7 giorni</option>
              <option value="custom">Intervallo date</option>
              <option value="all">Tutto</option>
            </select>
          </label>
          <label style={labelStyle}>
            Da
            <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            A
            <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Campagna
            <select value={filters.campaign} onChange={(event) => setFilters((prev) => ({ ...prev, campaign: event.target.value }))} style={inputStyle}>
              <option value="all">Tutte</option>
              {campaigns.map((campaignId) => <option key={campaignId} value={campaignId}>{campaignId}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Stato sessione
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={inputStyle}>
              <option value="all">Tutti</option>
              <option value="started">Started</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label style={labelStyle}>
            Driver
            <input value={filters.driver} onChange={(event) => setFilters((prev) => ({ ...prev, driver: event.target.value }))} style={inputStyle} placeholder="nome operatore" />
          </label>
          <label style={labelStyle}>
            Gruppo
            <input value={filters.group} onChange={(event) => setFilters((prev) => ({ ...prev, group: event.target.value }))} style={inputStyle} placeholder="nome gruppo" />
          </label>
        </div>
      </section>

      <div style={layoutStyle}>
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Mappa live</p>
          {visibleDrivers.some((item) => item.latest) ? (
            <LiveMap drivers={visibleDrivers} />
          ) : (
            <EmptyState text={state.loading ? 'Caricamento tracking GPS...' : 'Nessun tracking GPS disponibile'} />
          )}
        </section>

        <aside style={cardStyle}>
          <p style={eyebrowStyle}>Driver live</p>
          {visibleDrivers.length ? visibleDrivers.map((item) => (
            <DriverRow key={item.session.id} item={item} />
          )) : <EmptyState text="Nessuna sessione attiva reale." />}
        </aside>
      </div>
    </AdminLayout>
  );
}

function LiveMap({ drivers }) {
  const first = drivers.find((item) => item.latest)?.latest;
  const center = first ? [Number(first.lat), Number(first.lng)] : [45.4642, 9.19];

  return (
    <div style={{ height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {drivers.filter((item) => item.latest).map((item) => {
          const color = statusColor(item.status);
          return (
            <CircleMarker
              key={item.session.id}
              center={[Number(item.latest.lat), Number(item.latest.lng)]}
              radius={10}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.82, weight: 3 }}
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
    </div>
  );
}

function DriverRow({ item }) {
  return (
    <div style={driverRowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ color: '#fff', fontSize: 16 }}>{displayDriverName(item.session)}</strong>
      </div>
      <span><StatusBadge status={item.status} /> · ping {formatDateTime(item.lastPing)} · {item.km.toFixed(2)} km · {item.points.length} punti</span>
      <span>Campagna {shortId(item.session.campaign_id)}</span>
      <span style={{ color: 'rgba(255,255,255,.34)', fontSize: 11 }}>Device {displayDeviceId(item.session)}</span>
    </div>
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
const driverRowStyle = { display: 'grid', gap: 5, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.07)', fontSize: 12 };
