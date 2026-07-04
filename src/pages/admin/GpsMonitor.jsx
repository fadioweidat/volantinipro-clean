import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCampaignGpsPoints, getCampaignGpsSessions } from '../../lib/services/gps-api.js';
import { getAdminCoverageCorrections, getAssignedZones, computeCoverageMetrics, getRealGroups } from '../../lib/services/admin-api.js';
import { buildGpsProfessionalSnapshot, formatGpsDuration, formatGpsNumber } from '../../lib/services/gps-professional.js';

// ─── OSM Nominatim boundary fetch ───────────────────────────────────────────
async function fetchComuneBoundary(name) {
  if (!name) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name + ', Italy')}&format=geojson&polygon_geojson=1&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'VolantiniPro/1.0' } });
    const data = await res.json();
    return data.features?.[0]?.geometry || null;
  } catch {
    return null;
  }
}

// ─── Map auto-fit helper ─────────────────────────────────────────────────────
function MapAutoFit({ points }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 250);
    if (points.length > 0) {
      try {
        const latLngs = points.map(p => [Number(p.lat), Number(p.lng)]);
        map.fitBounds(L.latLngBounds(latLngs), { padding: [20, 20] });
      } catch { /* ignore: invalid bounds */ }
    }
    return () => clearTimeout(timer);
  }, [map, points.length]);
  return null;
}

// ─── Coverage metrics panel ─────────────────────────────────────────────────
function CoveragePanel({ zones, corrections, gpsKm }) {
  const targetKm = zones.reduce((s, z) => s + (Number(z.target_km) || 0), 0) || Math.max(10, gpsKm || 10);
  const totalCivici = zones.reduce((s, z) => s + (Number(z.total_civici) || 0), 0);
  const totalStrade = zones.reduce((s, z) => s + (Number(z.total_strade) || 0), 0);
  const metrics = computeCoverageMetrics(gpsKm, targetKm, corrections);

  return (
    <div style={kpiGridStyle}>
      <Kpi label="GPS Reale %" value={`${metrics.copertura_gps_reale_percent}%`} color="#60a5fa" />
      <Kpi label="Validazione Admin %" value={`${metrics.copertura_manual_admin_percent}%`} color="#2ecc8a" />
      <Kpi label="Da Rifare %" value={`${metrics.copertura_da_rifare_percent}%`} color="#ef4444" />
      <Kpi label="Finale Cliente %" value={`${metrics.copertura_finale_cliente_percent}%`} color="#e8571a" />
      <Kpi label="Km GPS" value={`${(gpsKm || 0).toFixed(2)} km`} color="#a78bfa" />
      <Kpi label="Target Km" value={`${targetKm.toFixed(2)} km`} />
      {totalCivici > 0 && <Kpi label="Civici (zona)" value={totalCivici} />}
      {totalStrade > 0 && <Kpi label="Strade (zona)" value={totalStrade} />}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function GpsMonitor({ campaignId }) {
  const [sessions, setSessions] = useState([]);
  const [allPoints, setAllPoints] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [zones, setZones] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [filterComune, setFilterComune] = useState('');
  const [filterGruppo, setFilterGruppo] = useState('');
  const [filterOperatore, setFilterOperatore] = useState('');

  // Boundary
  const [boundary, setBoundary] = useState(null);
  const [boundaryName, setBoundaryName] = useState('');
  const boundaryFetchRef = useRef(null);

  // Derived lists for filter dropdowns
  const comuneOptions = useMemo(() => {
    const set = new Set();
    zones.forEach(z => z.municipality_name && set.add(z.municipality_name));
    sessions.forEach(s => s.municipality_name && set.add(s.municipality_name));
    return Array.from(set).sort();
  }, [zones, sessions]);

  const gruppoOptions = useMemo(() => {
    const set = new Set();
    groups.forEach(g => g.name && set.add(g.name));
    sessions.forEach(s => s.group_name && set.add(s.group_name));
    return Array.from(set).sort();
  }, [groups, sessions]);

  const operatoreOptions = useMemo(() => {
    const set = new Set();
    sessions.forEach(s => {
      if (s.driver_name) set.add(s.driver_name);
      else if (s.driver_id) set.add(s.driver_id.slice(0, 8));
    });
    return Array.from(set).sort();
  }, [sessions]);

  // Data loading
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [sess, corr, zns, grps] = await Promise.all([
          getCampaignGpsSessions(campaignId).catch(() => []),
          getAdminCoverageCorrections(campaignId).catch(() => []),
          getAssignedZones(campaignId).catch(() => []),
          getRealGroups(campaignId).catch(() => []),
        ]);
        const pts = await getCampaignGpsPoints(campaignId).catch(() => []);
        if (!cancelled) {
          setSessions(sess);
          setAllPoints(pts);
          setCorrections(corr);
          setZones(zns);
          setGroups(grps);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) { setError(err?.message || 'Errore caricamento GPS.'); setLoading(false); }
      }
    }
    load();
    const timer = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [campaignId]);

  // Boundary fetch when comune filter changes
  useEffect(() => {
    if (!filterComune) { setBoundary(null); setBoundaryName(''); return; }
    if (filterComune === boundaryName) return;
    let cancelled = false;
    (async () => {
      const geom = await fetchComuneBoundary(filterComune);
      if (!cancelled) { setBoundary(geom); setBoundaryName(filterComune); }
    })();
    return () => { cancelled = true; };
  }, [filterComune]);

  // Filtered data
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (filterGruppo && s.group_name !== filterGruppo) return false;
      if (filterOperatore) {
        const name = s.driver_name || (s.driver_id ? s.driver_id.slice(0, 8) : '');
        if (name !== filterOperatore) return false;
      }
      return true;
    });
  }, [sessions, filterGruppo, filterOperatore]);

  const sessionIds = useMemo(() => new Set(filteredSessions.map(s => s.id)), [filteredSessions]);

  const filteredPoints = useMemo(() => {
    return allPoints.filter(p => sessionIds.has(p.session_id));
  }, [allPoints, sessionIds]);

  // GPS km calculation
  const gpsKm = useMemo(() => {
    if (filteredPoints.length < 2) return 0;
    let km = 0;
    for (let i = 1; i < filteredPoints.length; i++) {
      const a = filteredPoints[i - 1], b = filteredPoints[i];
      if (a.session_id !== b.session_id) continue;
      km += haversineKm(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
    }
    return Math.round(km * 100) / 100;
  }, [filteredPoints]);

  const validPoints = useMemo(() =>
    filteredPoints.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))),
    [filteredPoints]
  );
  const monitorRows = useMemo(() => filteredSessions.map((session) => ({
    session,
    points: validPoints.filter((point) => point.session_id === session.id),
  })), [filteredSessions, validPoints]);
  const gpsSnapshot = useMemo(() => buildGpsProfessionalSnapshot(monitorRows, []), [monitorRows]);

  // Zones for selected comune
  const filteredZones = useMemo(() => {
    if (!filterComune) return zones;
    return zones.filter(z => z.municipality_name === filterComune);
  }, [zones, filterComune]);

  const filteredCorrections = useMemo(() => {
    if (!filterComune && !filterGruppo) return corrections;
    return corrections.filter(c => {
      if (filterGruppo) {
        const grp = groups.find(g => g.name === filterGruppo);
        if (grp && c.group_id !== grp.id) return false;
      }
      return true;
    });
  }, [corrections, filterComune, filterGruppo, groups]);

  const latest = validPoints[validPoints.length - 1] || null;
  const center = latest ? [Number(latest.lat), Number(latest.lng)] : [45.4642, 9.19];
  const path = validPoints.map(p => [Number(p.lat), Number(p.lng)]);

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <a href="/admin" style={brandStyle}>VolantiniPro Admin</a>
          <h1 style={titleStyle}>GPS Monitor — Copertura</h1>
          <p style={mutedStyle}>Campagna {campaignId}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <a style={btnStyle} href={`/admin/campaigns/${campaignId}/groups`}>Gruppi</a>
          <a style={btnStyle} href={`/admin/campaigns/${campaignId}/report`}>Report</a>
        </div>
      </header>

      {loading && <Notice text="Caricamento dati GPS..." />}
      {error && <Notice danger text={error} />}

      {/* Filtri */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtri</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={labelStyle}>
            Comune
            <select style={selectStyle} value={filterComune} onChange={e => setFilterComune(e.target.value)}>
              <option value="">Tutti</option>
              {comuneOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Gruppo
            <select style={selectStyle} value={filterGruppo} onChange={e => setFilterGruppo(e.target.value)}>
              <option value="">Tutti</option>
              {gruppoOptions.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Operatore
            <select style={selectStyle} value={filterOperatore} onChange={e => setFilterOperatore(e.target.value)}>
              <option value="">Tutti</option>
              {operatoreOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* Metriche copertura */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Copertura {filterComune ? `— ${filterComune}` : '— Totale'}</p>
        <CoveragePanel zones={filteredZones} corrections={filteredCorrections} gpsKm={gpsKm} />
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Monitor live</p>
        <div style={kpiGridStyle}>
          <Kpi label="Operatori online" value={gpsSnapshot.summary.online} color="#2ecc8a" />
          <Kpi label="Operatori offline" value={gpsSnapshot.summary.offline} color="#ef4444" />
          <Kpi label="In pausa" value={gpsSnapshot.summary.paused} color="#fbbf24" />
          <Kpi label="Campagne attive" value={gpsSnapshot.summary.active} color="#60a5fa" />
          <Kpi label="Campagne concluse" value={gpsSnapshot.summary.completed} />
          <Kpi label="Precisione media" value={formatGpsNumber(gpsSnapshot.summary.avgAccuracy, ' m')} />
          <Kpi label="Velocita media" value={formatGpsNumber(gpsSnapshot.summary.avgSpeedKmh, ' km/h')} />
          <Kpi label="Tempo fermo" value={formatGpsDuration(gpsSnapshot.summary.stoppedMs)} />
        </div>
      </section>

      {/* Mappa */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Live Map {validPoints.length > 0 ? `— ${validPoints.length} punti GPS` : ''}</p>
        {validPoints.length > 0 ? (
          <div style={mapWrapStyle}>
            <MapContainer center={center} zoom={14} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
              <MapAutoFit points={validPoints} />
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {/* Confine comune */}
              {boundary && (
                <GeoJSON
                  key={filterComune}
                  data={boundary}
                  style={{ color: '#22c55e', weight: 3, fillOpacity: 0.04, dashArray: '6,4' }}
                />
              )}
              {/* Tracciato GPS */}
              {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#e8571a', weight: 3, opacity: 0.82 }} />}
              {/* Punti */}
              {validPoints.map(p => (
                <CircleMarker
                  key={p.id}
                  center={[Number(p.lat), Number(p.lng)]}
                  radius={4}
                  pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.65 }}
                >
                  <Popup>
                    {formatDateTime(p.recorded_at)}<br />
                    Accuracy: {p.accuracy != null ? `${Math.round(p.accuracy)} m` : 'n/d'}<br />
                    Velocita: {Number.isFinite(Number(p.speed)) ? `${Math.round(Number(p.speed) * 3.6)} km/h` : 'n/d'}<br />
                    Direzione: {Number.isFinite(Number(p.heading)) ? `${Math.round(Number(p.heading))}°` : 'n/d'}
                  </Popup>
                </CircleMarker>
              ))}
              {gpsSnapshot.heatmap.map(cell => (
                <CircleMarker
                  key={`heat-${cell.lat}-${cell.lng}`}
                  center={[cell.lat, cell.lng]}
                  radius={Math.min(24, 5 + cell.count)}
                  pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.16, weight: 1 }}
                >
                  <Popup>Heatmap<br />{cell.count} punti GPS</Popup>
                </CircleMarker>
              ))}
              {/* Ultimo punto */}
              {latest && (
                <CircleMarker
                  center={[Number(latest.lat), Number(latest.lng)]}
                  radius={10}
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.9 }}
                >
                  <Popup>Ultimo punto<br />{formatDateTime(latest.recorded_at)}</Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </div>
        ) : (
          <EmptyState text={loading ? 'Caricamento...' : 'Nessun punto GPS per i filtri selezionati'} />
        )}
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Allarmi GPS</p>
          {gpsSnapshot.alarms.length ? gpsSnapshot.alarms.slice(0, 12).map((alarm, index) => <AlarmRow key={`${alarm.type}-${index}`} alarm={alarm} />) : <EmptyState text="Nessun allarme GPS sui dati disponibili." />}
        </div>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Timeline</p>
          {gpsSnapshot.timeline.length ? gpsSnapshot.timeline.slice(0, 14).map((item, index) => <TimelineRow key={`${item.type}-${index}`} item={item} />) : <EmptyState text="Timeline non disponibile." />}
        </div>
      </section>

      {/* Sessioni */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Sessioni ({filteredSessions.length})</p>
        {filteredSessions.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {filteredSessions.map(s => (
              <div key={s.id} style={rowStyle}>
                <span style={{ fontWeight: 900, color: statusColor(s.status) }}>{s.status}</span>
                <span>{s.driver_name || (s.driver_id || '').slice(0, 8) || 'Operatore'}</span>
                <span>{s.group_name || '—'}</span>
                <span>{s.municipality_name || '—'}</span>
                <span style={{ color: 'rgba(255,255,255,.42)', fontSize: 11 }}>{formatDateTime(s.started_at)} → {formatDateTime(s.ended_at || s.paused_at)}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState text="Nessuna sessione" />}
      </section>

      {/* Correzioni admin */}
      {filteredCorrections.length > 0 && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Correzioni admin ({filteredCorrections.length})</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {filteredCorrections.map(c => (
              <div key={c.id} style={rowStyle}>
                <span style={{ fontWeight: 900, color: correctionColor(c.correction_type) }}>{c.correction_type}</span>
                <span>{c.label || c.reason || '—'}</span>
                <span>{Number(c.estimated_km) > 0 ? `${Number(c.estimated_km).toFixed(2)} km` : '—'}</span>
                <span style={{ color: 'rgba(255,255,255,.42)', fontSize: 11 }}>{formatDateTime(c.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = deg2rad(lat2 - lat1), dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(deg2rad(lat1))*Math.cos(deg2rad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function deg2rad(d) { return d * Math.PI / 180; }

function statusColor(s) {
  if (s === 'started') return '#22c55e';
  if (s === 'paused') return '#f59e0b';
  if (s === 'completed') return '#60a5fa';
  return 'rgba(255,255,255,.42)';
}

function correctionColor(t) {
  if (t === 'validato_admin') return '#22c55e';
  if (t === 'coperto_manualmente') return '#60a5fa';
  if (t === 'da_rifare') return '#ef4444';
  return 'rgba(255,255,255,.42)';
}

function formatDateTime(v) {
  return v ? new Date(v).toLocaleString('it-IT') : 'n/d';
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Kpi({ label, value, color = 'rgba(255,255,255,.9)' }) {
  return (
    <div style={kpiCardStyle}>
      <p style={eyebrowStyle}>{label}</p>
      <strong style={{ color, fontSize: 22 }}>{value}</strong>
    </div>
  );
}

function Notice({ text, danger }) {
  return (
    <div style={{ padding: 12, border: `1px solid ${danger ? '#ef4444' : 'rgba(255,255,255,.1)'}`, borderRadius: 10, background: 'rgba(255,255,255,.04)', color: danger ? '#fecaca' : '#d1fae5', fontWeight: 800, marginBottom: 12 }}>
      {text}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: 20, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' }}>{text}</div>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function AlarmRow({ alarm }) {
  const color = alarm.level === 'red' ? '#ef4444' : '#fbbf24';
  return (
    <div style={{ ...alarmRowStyle, borderLeftColor: color }}>
      <strong style={{ color }}>{alarm.title}</strong>
      <span>{alarm.detail}</span>
      <small>{formatDateTime(alarm.at)}</small>
    </div>
  );
}

function TimelineRow({ item }) {
  return (
    <div style={timelineRowStyle}>
      <strong>{item.label}</strong>
      <span>{item.detail}</span>
      <small>{formatDateTime(item.at)}</small>
    </div>
  );
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#0B192C', color: 'rgba(255,255,255,.82)', fontFamily: "'DM Sans', Inter, system-ui, sans-serif" };
const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 };
const brandStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none' };
const titleStyle = { margin: '8px 0 4px', fontSize: 30, color: '#fff', fontFamily: "'DM Serif Display', Georgia, serif" };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.45)', fontSize: 12 };
const cardStyle = { background: 'rgba(18, 32, 54, 0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const eyebrowStyle = { margin: '0 0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.45)', fontWeight: 900 };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 };
const kpiCardStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14 };
const mapWrapStyle = { height: 500, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)', position: 'relative', zIndex: 1 };
const rowStyle = { display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap', fontSize: 13, alignItems: 'center' };
const alarmRowStyle = { display: 'grid', gap: 5, padding: '10px 0 10px 12px', borderBottom: '1px solid rgba(255,255,255,.07)', borderLeft: '4px solid', fontSize: 12 };
const timelineRowStyle = { display: 'grid', gap: 5, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.07)', fontSize: 12 };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'rgba(255,255,255,.55)', fontWeight: 800 };
const selectStyle = { background: '#122036', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontFamily: 'inherit', fontSize: 13, minWidth: 160 };
const btnStyle = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: '10px 14px', color: '#fff', background: 'rgba(255,255,255,.06)', textDecoration: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s ease' };
