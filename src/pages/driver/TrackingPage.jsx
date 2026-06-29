import 'leaflet/dist/leaflet.css';
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadProofPhoto } from '../../lib/services/gps-api.js';
import { startGpsSession, pauseGpsSession, endGpsSession, resumeGpsSession, insertGpsPoint } from '../../lib/services/gps-api.js';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';

// ─── OSM Nominatim boundary ─────────────────────────────────────────────────
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

// ─── Point-in-polygon (ray casting) ─────────────────────────────────────────
function pointInPolygon(lat, lng, geom) {
  if (!geom) return true; // se non c'è confine, considera dentro
  const coords = geom.type === 'Polygon' ? [geom.coordinates[0]] :
    geom.type === 'MultiPolygon' ? geom.coordinates.map(p => p[0]) : null;
  if (!coords) return true;
  for (const ring of coords) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// ─── Map component ─────────────────────────────────────────────────────────
function TrackingMap({ path, boundary, currentPos, comuneName }) {
  const center = currentPos ? [currentPos.lat, currentPos.lng] :
    path.length > 0 ? [path[path.length-1][0], path[path.length-1][1]] : [45.4642, 9.19];

  return (
    <div style={mapWrapStyle}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <MapUpdater center={center} />
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {boundary && (
          <GeoJSON
            key={comuneName}
            data={boundary}
            style={{ color: '#22c55e', weight: 3, fillOpacity: 0.06, dashArray: '6,4' }}
          />
        )}
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#e8571a', weight: 4, opacity: 0.85 }} />}
        {currentPos && (
          <CircleMarker
            center={[currentPos.lat, currentPos.lng]}
            radius={10}
            pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.9 }}
          >
            <Popup>Posizione attuale<br />Accuracy: {currentPos.accuracy != null ? `${Math.round(currentPos.accuracy)} m` : 'n/d'}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

function MapUpdater({ center }) {
  const map = useMap();
  const prevCenter = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(timer);
  }, [map]);
  useEffect(() => {
    if (!center) return;
    const key = center.join(',');
    if (key !== prevCenter.current) {
      prevCenter.current = key;
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [map, center]);
  return null;
}

// ─── Main TrackingPage ───────────────────────────────────────────────────────
export function TrackingPage({ campaignId, comuneName }) {
  const tracking = useGpsTracking(campaignId);

  // Manual GPS session state (for explicit start/pause/end buttons)
  const [session, setSession] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | active | paused | ended
  const [currentPos, setCurrentPos] = useState(null);
  const [path, setPath] = useState([]);
  const [outOfZone, setOutOfZone] = useState(false);
  const [boundary, setBoundary] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const watchIdRef = useRef(null);

  // Note/foto upload state
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [uploadState, setUploadState] = useState({ loading: false, message: null, error: null });

  // Load boundary for comune
  useEffect(() => {
    if (!comuneName) return;
    fetchComuneBoundary(comuneName).then(setBoundary);
  }, [comuneName]);

  // Stop watching GPS when component unmounts
  useEffect(() => {
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Start continuous GPS watch
  function startGpsWatch(sessionId, sessionCampId) {
    if (!navigator.geolocation) return;
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const newPos = { lat, lng, accuracy };
        setCurrentPos(newPos);
        setPath(prev => [...prev, [lat, lng]]);

        // Check out-of-zone
        if (boundary) {
          setOutOfZone(!pointInPolygon(lat, lng, boundary));
        }

        // Save GPS point
        try {
          await insertGpsPoint({
            campaignId: sessionCampId,
            sessionId,
            lat,
            lng,
            accuracy,
            recordedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('GPS point save error:', err);
        }
      },
      (err) => console.warn('GPS watch error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function stopGpsWatch() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  async function handleStart() {
    setActionError(null);
    setActionLoading(true);
    try {
      const sess = await startGpsSession(campaignId);
      setSession(sess);
      setGpsStatus('active');
      setPath([]);
      startGpsWatch(sess.id, campaignId);
    } catch (err) {
      setActionError(err?.message || 'Errore avvio sessione.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    setActionError(null);
    setActionLoading(true);
    try {
      stopGpsWatch();
      const updated = await pauseGpsSession(session.id);
      setSession(updated);
      setGpsStatus('paused');
    } catch (err) {
      setActionError(err?.message || 'Errore pausa.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    setActionError(null);
    setActionLoading(true);
    try {
      const updated = await resumeGpsSession(session.id);
      setSession(updated);
      setGpsStatus('active');
      startGpsWatch(session.id, campaignId);
    } catch (err) {
      setActionError(err?.message || 'Errore ripresa.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEnd() {
    setActionError(null);
    setActionLoading(true);
    try {
      stopGpsWatch();
      const updated = await endGpsSession(session.id);
      setSession(updated);
      setGpsStatus('ended');
      setOutOfZone(false);
    } catch (err) {
      setActionError(err?.message || 'Errore fine sessione.');
    } finally {
      setActionLoading(false);
    }
  }

  async function submitProofPhoto(event) {
    event.preventDefault();
    if (!file) { setUploadState({ loading: false, message: null, error: 'Seleziona una foto prova.' }); return; }
    setUploadState({ loading: true, message: null, error: null });
    try {
      await uploadProofPhoto({
        campaignId,
        sessionId: session?.id || tracking.session?.id,
        file,
        lat: currentPos?.lat ?? tracking.lastPosition?.lat,
        lng: currentPos?.lng ?? tracking.lastPosition?.lng,
        note,
      });
      setFile(null);
      setNote('');
      event.currentTarget.reset();
      setUploadState({ loading: false, message: 'Foto prova caricata con successo.', error: null });
    } catch (err) {
      setUploadState({ loading: false, message: null, error: err?.message || 'Upload non riuscito.' });
    }
  }

  const statusLabel = {
    idle: 'Non iniziata',
    active: 'GPS attivo',
    paused: 'In pausa',
    ended: 'Distribuzione terminata',
  }[gpsStatus] || 'Non iniziata';

  return (
    <main style={shellStyle}>
      {/* Out-of-zone banner */}
      {outOfZone && gpsStatus === 'active' && (
        <div style={outOfZoneBannerStyle}>
          ATTENZIONE: Sei fuori dalla zona assegnata!
        </div>
      )}

      <header style={{ marginBottom: 20 }}>
        <a href="/" style={brandStyle}>VolantiniPro</a>
        <p style={eyebrowStyle}>Distribuzione — {campaignId}</p>
        <h1 style={{ margin: 0, fontSize: 28, color: '#fff' }}>{statusLabel}</h1>
        {comuneName && <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.55)', fontSize: 13 }}>Zona: {comuneName}</p>}
      </header>

      {/* Status & controls */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <StatusPill status={gpsStatus} />
          {currentPos && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
              Accuracy: {Math.round(currentPos.accuracy)} m
            </span>
          )}
          {outOfZone && gpsStatus === 'active' && (
            <span style={{ color: '#ef4444', fontWeight: 900, fontSize: 13 }}>Fuori zona!</span>
          )}
        </div>

        {actionError && <div style={errorBoxStyle}>{actionError}</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(gpsStatus === 'idle' || gpsStatus === 'ended') && (
            <button style={startBtnStyle} type="button" onClick={handleStart} disabled={actionLoading}>
              {actionLoading ? 'Avvio...' : 'START GPS'}
            </button>
          )}
          {gpsStatus === 'active' && (
            <button style={pauseBtnStyle} type="button" onClick={handlePause} disabled={actionLoading}>
              {actionLoading ? '...' : 'PAUSA'}
            </button>
          )}
          {gpsStatus === 'paused' && (
            <button style={startBtnStyle} type="button" onClick={handleResume} disabled={actionLoading}>
              {actionLoading ? '...' : 'RIPRENDI'}
            </button>
          )}
          {(gpsStatus === 'active' || gpsStatus === 'paused') && (
            <button style={endBtnStyle} type="button" onClick={handleEnd} disabled={actionLoading}>
              {actionLoading ? '...' : 'FINE'}
            </button>
          )}
        </div>

        {currentPos && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Metric label="Latitudine" value={currentPos.lat.toFixed(6)} />
            <Metric label="Longitudine" value={currentPos.lng.toFixed(6)} />
            <Metric label="Punti tracciati" value={path.length} />
            <Metric label="Sessione" value={session?.id ? session.id.slice(0, 8) : '—'} />
          </div>
        )}
      </section>

      {/* Mappa */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Mappa zona{comuneName ? ` — ${comuneName}` : ''}</p>
        <TrackingMap path={path} boundary={boundary} currentPos={currentPos} comuneName={comuneName} />
      </section>

      {/* Foto prova */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Foto prova</p>
        <form onSubmit={submitProofPhoto} style={{ display: 'grid', gap: 12 }}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ color: 'rgba(255,255,255,.8)' }}
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note operative..."
            rows={3}
            style={textareaStyle}
          />
          <button style={uploadBtnStyle} type="submit" disabled={uploadState.loading}>
            {uploadState.loading ? 'Caricamento...' : 'Carica foto prova'}
          </button>
        </form>
        {uploadState.message && <div style={successBoxStyle}>{uploadState.message}</div>}
        {uploadState.error && <div style={errorBoxStyle}>{uploadState.error}</div>}
      </section>
    </main>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const colors = { idle: '#64748b', active: '#16a34a', paused: '#b45309', ended: '#1d4ed8' };
  const c = colors[status] || '#64748b';
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${c}66`, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 900, background: `${c}22`, color: c }}>
      {status}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ padding: 10, background: 'rgba(255,255,255,.06)', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>{label}</div>
      <strong style={{ color: '#fff', fontSize: 15 }}>{value}</strong>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const shellStyle = { minHeight: '100vh', padding: '0 0 40px', background: '#0B192C', color: 'rgba(255,255,255,.9)', fontFamily: "'DM Sans', Inter, system-ui, sans-serif" };
const brandStyle = { display: 'block', color: '#e8571a', fontWeight: 900, textDecoration: 'none', padding: '16px 20px 0', fontSize: 16 };
const eyebrowStyle = { margin: '8px 0 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.45)', fontWeight: 900 };
const cardStyle = { background: 'rgba(18, 32, 54, 0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 20, margin: '0 14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,.2)' };
const mapWrapStyle = { height: 380, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)', position: 'relative', zIndex: 1 };
const outOfZoneBannerStyle = { position: 'sticky', top: 0, zIndex: 9999, background: '#ef4444', color: '#fff', fontWeight: 900, textAlign: 'center', padding: '14px 20px', fontSize: 16, letterSpacing: '.04em' };
const errorBoxStyle = { marginTop: 12, padding: 12, borderRadius: 10, color: '#fca5a5', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.35)', fontSize: 14 };
const successBoxStyle = { marginTop: 12, padding: 12, borderRadius: 10, color: '#86efac', background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.35)', fontSize: 14 };
const textareaStyle = { width: '100%', background: '#122036', border: '1px solid rgba(255,255,255,.15)', borderRadius: 10, padding: 12, color: '#fff', font: 'inherit', fontSize: 14, boxSizing: 'border-box' };

// Big touch-friendly buttons
const startBtnStyle = { border: 'none', borderRadius: 14, padding: '18px 32px', background: '#22C55E', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 18, minWidth: 140, letterSpacing: '.04em' };
const pauseBtnStyle = { border: 'none', borderRadius: 14, padding: '18px 32px', background: '#F59E0B', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 18, minWidth: 140, letterSpacing: '.04em' };
const endBtnStyle   = { border: 'none', borderRadius: 14, padding: '18px 32px', background: '#EF4444', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 18, minWidth: 140, letterSpacing: '.04em' };
const uploadBtnStyle = { border: 'none', borderRadius: 10, padding: '14px 20px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 16 };
