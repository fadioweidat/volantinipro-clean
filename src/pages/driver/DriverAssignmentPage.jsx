import 'leaflet/dist/leaflet.css';
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { PodCapture } from '../../components/driver/PodCapture.jsx';

// ─── DriverAssignmentPage ─────────────────────────────────────────────────────
// Pagina driver accessibile tramite /driver/assignment/{assignmentId}.
//
// A differenza di TrackingPage (che riceve campaignId dall'URL),
// questa pagina riceve assignmentId — risolve il campaignId leggendo
// l'assegnazione da Supabase (via operator_assignments, RLS-protetta).
//
// Il driver_id NON è mai nell'URL: l'autenticazione è sempre via auth.uid().
// Un driver diverso → RLS blocca la lettura → assignmentStatus = 'blocked'.

async function fetchComuneBoundary(name) {
  if (!name) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${name}, Italy`)}&format=geojson&polygon_geojson=1&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'VolantiniPro/1.0' } });
    const data = await res.json();
    return data.features?.[0]?.geometry || null;
  } catch {
    return null;
  }
}

function pointInPolygon(lat, lng, geom) {
  if (!geom) return true;
  const rings = geom.type === 'Polygon'
    ? [geom.coordinates[0]]
    : geom.type === 'MultiPolygon'
      ? geom.coordinates.map(poly => poly[0])
      : null;
  if (!rings) return true;
  return rings.some(ring => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DriverAssignmentPage({ assignmentId }) {
  const [assignmentData, setAssignmentData] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  // Load assignment from DB to get campaignId + details
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!assignmentId) {
        setAssignmentError('ID assegnazione mancante.');
        setLoadingAssignment(false);
        return;
      }
      try {
        // Import supabase directly to read operator_assignments
        const { supabase } = await import('../../supabaseClient.js');
        if (!supabase) throw new Error('Supabase non configurato.');

        const { data, error } = await supabase
          .from('operator_assignments')
          .select('*')
          .eq('id', assignmentId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error('Assegnazione non trovata o accesso negato. Verifica di essere loggato con l\'account corretto.');
        }

        // Check status client-side (RLS already enforces operator_id = auth.uid())
        if (data.status === 'revoked') {
          // Un'assegnazione revocata blocca l'accesso, tranne quando esiste
          // già una sessione GPS attiva/in pausa: in quel caso la pagina resta
          // raggiungibile solo per permettere il Termina (gps_transition_session
          // lato backend applica la stessa regola ed è la source of truth:
          // blocca resume/pause, consente solo complete/cancel).
          const { data: liveSession } = await supabase
            .from('delivery_sessions')
            .select('id')
            .eq('assignment_id', assignmentId)
            .in('status', ['started', 'paused'])
            .maybeSingle();
          if (!liveSession) {
            throw new Error('Questa assegnazione è stata revocata. Contatta il tuo amministratore.');
          }
        }
        if (data.status === 'completed') {
          throw new Error('Questa assegnazione è già stata completata.');
        }
        const now = Date.now();
        if (data.ends_at && Date.parse(data.ends_at) <= now) {
          throw new Error(`Questa assegnazione è scaduta il ${new Date(data.ends_at).toLocaleString('it-IT')}. Contatta il tuo amministratore.`);
        }
        if (data.starts_at && Date.parse(data.starts_at) > now) {
          throw new Error(`Il lavoro inizia il ${new Date(data.starts_at).toLocaleString('it-IT')}. Torna più tardi.`);
        }

        if (!cancelled) {
          setAssignmentData(data);
          setCampaignId(data.campaign_id);
          setLoadingAssignment(false);
        }
      } catch (err) {
        if (!cancelled) {
          setAssignmentError(err?.message || 'Errore caricamento assegnazione.');
          setLoadingAssignment(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [assignmentId]);

  if (loadingAssignment) {
    return (
      <main style={shellStyle}>
        <LoadingScreen />
      </main>
    );
  }

  if (assignmentError || !campaignId) {
    return (
      <main style={shellStyle}>
        <BlockedScreen error={assignmentError || 'Assegnazione non disponibile.'} />
      </main>
    );
  }

  return (
    <DriverTracker
      campaignId={campaignId}
      assignmentId={assignmentId}
      assignmentData={assignmentData}
    />
  );
}

// ─── DriverTracker ────────────────────────────────────────────────────────────
// Il componente reale del tracker. Separato per permettere il mount
// solo dopo che campaignId è risolto (evita chiamate con undefined).

function DriverTracker({ campaignId, assignmentId, assignmentData }) {
  const tracking = useGpsTracking(campaignId);
  const [section, setSection] = useState('home');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [battery, setBattery] = useState({ supported: false, level: null, charging: null });
  const [sosState, setSosState] = useState(null);
  const [boundary, setBoundary] = useState(null);

  // Parse metadata from assignment
  const meta = useMemo(() => safeJson(assignmentData?.metadata), [assignmentData]);
  const comuni = useMemo(() => meta.comuni || [], [meta]);
  const zoneLabels = useMemo(() => meta.zone_labels || [], [meta]);
  const qty = meta.qty || null;
  const assignmentNotes = meta.notes || null;
  const campaignTitle = meta.campaign_title || `Campagna ${String(campaignId).slice(0, 8)}`;
  const startsAt = assignmentData?.starts_at;
  const endsAt = assignmentData?.ends_at;
  const primaryComune = comuni[0] || null;

  const operatorName = tracking.session?.driver_name
    || tracking.session?.driverName
    || meta.operator_display_name
    || `Operatore ${String(tracking.session?.driver_id || assignmentData?.operator_id || 'assegnato').slice(0, 6)}`;

  // Fetch comune boundary for first assigned comune
  useEffect(() => {
    if (!primaryComune) return;
    let cancelled = false;
    fetchComuneBoundary(primaryComune).then(geom => {
      if (!cancelled) setBoundary(geom);
    });
    return () => { cancelled = true; };
  }, [primaryComune]);

  // Battery status
  useEffect(() => {
    if (!navigator.getBattery) return;
    let mgr = null;
    const update = () => {
      if (!mgr) return;
      setBattery({ supported: true, level: Math.round(mgr.level * 100), charging: mgr.charging });
    };
    navigator.getBattery().then(m => {
      mgr = m;
      update();
      m.addEventListener('levelchange', update);
      m.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => {
      if (!mgr) return;
      mgr.removeEventListener('levelchange', update);
      mgr.removeEventListener('chargingchange', update);
    };
  }, []);

  const currentPos = tracking.lastPosition;
  const pathPositions = tracking.path.map(p => [p.lat, p.lng]);
  const outOfZone = Boolean(currentPos && boundary && tracking.isActive && !pointInPolygon(currentPos.lat, currentPos.lng, boundary));
  const completion = estimateCompletion(tracking.distanceKm, qty);

  // Assegnazione revocata con sessione già in corso: Start/Pausa/Riprendi
  // restano bloccati lato UI (il backend li rifiuta comunque — è la
  // source of truth), solo Termina/Annulla restano permessi.
  const isRevoked = assignmentData?.status === 'revoked';
  const assignmentBlocksStart = isRevoked
    || (!tracking.isActive && !tracking.isPaused && tracking.assignmentStatus !== 'ready');
  const primaryAction = actionLoading
    ? `${actionLoading}...`
    : tracking.isActive ? 'Pausa'
    : tracking.isPaused ? 'Riprendi'
    : tracking.assignmentStatus === 'loading' ? 'Verifica...'
    : 'Inizia tracciamento';

  async function runAction(label, fn) {
    setActionError(null);
    setActionLoading(label);
    try { await fn(); }
    catch (err) { setActionError(err?.message || 'Operazione non riuscita.'); }
    finally { setActionLoading(null); }
  }

  function sendSos() {
    const event = {
      type: 'sos', assignmentId, campaignId, operatorName,
      lat: currentPos?.lat ?? null, lng: currentPos?.lng ?? null,
      recordedAt: new Date().toISOString(),
    };
    try {
      const key = 'volantinipro:operator-events';
      const prev = JSON.parse(window.localStorage.getItem(key) || '[]');
      window.localStorage.setItem(key, JSON.stringify([...prev, event].slice(-100)));
    } catch { /* ignore */ }
    setSosState('SOS registrato localmente con ultima posizione disponibile.');
  }

  function openGoogleMaps() {
    if (currentPos) {
      window.open(`https://www.google.com/maps?q=${currentPos.lat},${currentPos.lng}`, '_blank', 'noopener,noreferrer');
    } else if (primaryComune) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(primaryComune + ', Italy')}`, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <main style={shellStyle}>
      {outOfZone && <div style={alertBannerStyle}>⚠️ Fuori dalla zona assegnata. Rientra nell'area di lavoro.</div>}

      <header style={topBarStyle}>
        <div style={avatarStyle}>{operatorName.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <p style={eyebrowStyle}>App operatore</p>
          <h1 style={titleStyle}>{operatorName}</h1>
          <p style={mutedStyle}>{campaignTitle}</p>
        </div>
        <StatusBadge status={tracking.status} network={tracking.networkStatus} />
      </header>

      {/* Errors */}
      {tracking.assignmentError && <Notice id="op-assign-error" danger text={tracking.assignmentError} />}
      {tracking.error && <Notice danger text={tracking.error} />}
      {actionError && <Notice danger text={actionError} />}
      {sosState && <Notice text={sosState} />}

      {/* Assignment info card */}
      <section style={heroCardStyle}>
        <p style={eyebrowStyle}>Lavoro assegnato</p>
        <h2 style={campaignTitleStyle}>{campaignTitle}</h2>
        <div style={summaryGridStyle}>
          <Metric label="Comuni" value={comuni.length ? comuni.join(', ') : 'Da definire'} />
          {zoneLabels.length > 0 && <Metric label="Zone" value={zoneLabels.join(', ')} />}
          <Metric label="Quantità" value={qty ? `${Number(qty).toLocaleString('it-IT')} volantini` : 'Non specificata'} />
          <Metric label="Data" value={startsAt ? new Date(startsAt).toLocaleDateString('it-IT') : 'Da definire'} />
          {endsAt && <Metric label="Scadenza" value={new Date(endsAt).toLocaleDateString('it-IT')} />}
          {assignmentNotes && <Metric label="Note admin" value={assignmentNotes} />}
        </div>
        <div style={telemetryGridStyle}>
          <Telemetry label="GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'In attesa'} tone={tracking.accuracy != null && tracking.accuracy <= 50 ? 'good' : 'warn'} />
          <Telemetry label="Batteria" value={battery.supported ? `${battery.level}%${battery.charging ? ' · ⚡' : ''}` : 'n/d'} tone={battery.supported && battery.level < 20 ? 'bad' : 'good'} />
          <Telemetry label="Rete" value={tracking.networkStatus === 'online' ? 'Online' : 'Offline'} tone={tracking.networkStatus === 'online' ? 'good' : 'warn'} />
          <Telemetry label="Assegnazione" value={assignmentLabel(tracking.assignmentStatus)} tone={tracking.assignmentStatus === 'ready' ? 'good' : tracking.assignmentStatus === 'loading' ? 'warn' : 'bad'} />
          {tracking.queueSize > 0 && <Telemetry label="Coda offline" value={tracking.queueSize} tone="warn" />}
        </div>
      </section>

      {/* Controls */}
      <section style={controlsCardStyle}>
        <button
          type="button"
          style={primaryButtonStyle}
          disabled={Boolean(actionLoading) || assignmentBlocksStart}
          onClick={() => runAction(
            primaryAction,
            tracking.isActive ? tracking.pause
              : tracking.isPaused ? tracking.resume
              : tracking.start
          )}
        >
          {primaryAction}
        </button>
        {(tracking.isActive || tracking.isPaused) && (
          <button type="button" style={dangerButtonStyle} disabled={Boolean(actionLoading)}
            onClick={() => runAction('Termino', tracking.end)}>
            Termina
          </button>
        )}
        <button type="button" style={secondaryButtonStyle} onClick={() => setSection('map')}>Mappa</button>
        <button type="button" style={secondaryButtonStyle} onClick={openGoogleMaps}>Google Maps</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => { setSection('photo'); window.setTimeout(() => fileInputRef.current?.click(), 120); }}>Foto</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => setSection('report')}>Report</button>
        <button type="button" style={sosButtonStyle} onClick={sendSos}>SOS</button>
      </section>

      {/* Home section */}
      {section === 'home' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Stato lavoro</p>
          <div style={summaryGridStyle}>
            <Metric label="Km percorsi" value={`${tracking.distanceKm.toFixed(2)} km`} />
            <Metric label="Completamento" value={`${completion}%`} />
            <Metric label="Velocità" value={tracking.speed != null ? `${Math.round(tracking.speed * 3.6)} km/h` : 'n/d'} />
            <Metric label="Direzione" value={tracking.heading != null ? `${Math.round(tracking.heading)}°` : 'n/d'} />
            <Metric label="Ultimo invio" value={tracking.lastSentAt ? formatTime(tracking.lastSentAt) : 'In attesa'} />
            <Metric label="Sessione" value={formatDuration(sessionMs(tracking.session))} />
          </div>
        </section>
      )}

      {/* Map section */}
      {section === 'map' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p style={eyebrowStyle}>Mappa lavoro</p>
              <h2 style={{ margin: '4px 0 0', color: '#fff', fontSize: 18 }}>{comuni.join(' / ') || 'Area assegnata'}</h2>
            </div>
            <span style={mutedStyle}>{tracking.distanceKm.toFixed(2)} km · {completion}%</span>
          </div>
          <DriverMap path={pathPositions} boundary={boundary} currentPos={currentPos} />
        </section>
      )}

      {/* Photo section — riusa il componente PodCapture gia' usato da TrackingPage.jsx
          (validazione, compressione, watermark: src/lib/pod/podPhotoProcessing.js),
          invece del modulo photo-proof.js che non esiste in questo worktree. */}
      {section === 'photo' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Foto prova</p>
          <h2 style={{ margin: '4px 0 14px', color: '#fff', fontSize: 18 }}>Scatto geolocalizzato</h2>
          <PodCapture
            campaignId={campaignId}
            sessionId={tracking.session?.id || null}
            lastPosition={currentPos}
            driverName={operatorName}
            onUploaded={() => {}}
          />
        </section>
      )}

      {/* Report section */}
      {section === 'report' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Report operatore</p>
          <div style={summaryGridStyle}>
            <Metric label="Tempo" value={formatDuration(sessionMs(tracking.session))} />
            <Metric label="Km" value={`${tracking.distanceKm.toFixed(2)} km`} />
            <Metric label="Completamento" value={`${completion}%`} />
            <Metric label="Precisione GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'n/d'} />
            <Metric label="Comuni assegnati" value={comuni.join(', ') || 'Tutti'} />
            {qty && <Metric label="Quantità assegnata" value={`${Number(qty).toLocaleString('it-IT')} volantini`} />}
          </div>
        </section>
      )}

      <p style={disclaimerStyle}>
        Coda GPS offline, SOS e controllo duplicati foto sono salvati localmente su questo dispositivo.
      </p>
    </main>
  );
}

// ─── Map Component ────────────────────────────────────────────────────────────
function DriverMap({ path, boundary, currentPos }) {
  const center = currentPos
    ? [currentPos.lat, currentPos.lng]
    : path.length ? path[path.length - 1]
    : [45.4642, 9.19];
  return (
    <div style={mapWrapStyle}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <MapUpdater center={center} />
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {boundary && (
          <GeoJSON key={JSON.stringify(center)} data={boundary}
            style={{ color: '#2ECC8A', weight: 3, fillOpacity: 0.06, dashArray: '6,4' }} />
        )}
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#E8571A', weight: 5, opacity: 0.9 }} />}
        {currentPos && (
          <CircleMarker center={[currentPos.lat, currentPos.lng]} radius={11}
            pathOptions={{ color: '#2ECC8A', fillColor: '#2ECC8A', fillOpacity: 0.95 }}>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

function MapUpdater({ center }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    return () => window.clearTimeout(t);
  }, [map]);
  useEffect(() => {
    if (!center) return;
    const key = center.join(',');
    if (key !== prev.current) {
      prev.current = key;
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(232,87,26,.3)', borderTop: '3px solid #e8571a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14 }}>Caricamento assegnazione...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function BlockedScreen({ error }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <h2 style={{ color: '#fff', textAlign: 'center', fontSize: 20, margin: 0 }}>Accesso non disponibile</h2>
      <p style={{ color: '#fca5a5', textAlign: 'center', maxWidth: 400, lineHeight: 1.6, fontSize: 14 }}>{error}</p>
      <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, textAlign: 'center' }}>
        Assicurati di essere loggato con l'account corretto e che l'assegnazione sia attiva.
      </p>
    </div>
  );
}

function StatusBadge({ status, network }) {
  const isActive = status === 'active';
  const color = isActive ? '#2ECC8A' : status === 'paused' ? '#FBBF24' : '#94A3B8';
  return (
    <div style={{ ...statusBadgeStyle, borderColor: `${color}55`, color }}>
      <strong>{statusLabel(status)}</strong>
      <span>{network}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <strong style={{ color: '#fff', fontSize: 14, lineHeight: 1.3 }}>{value}</strong>
    </div>
  );
}

function Telemetry({ label, value, tone }) {
  const color = tone === 'bad' ? '#F87171' : tone === 'warn' ? '#FBBF24' : '#2ECC8A';
  return (
    <div style={{ ...telemetryStyle, borderColor: `${color}33` }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function Notice({ text, danger = false, id }) {
  return (
    <div id={id} role={danger ? 'alert' : 'status'} style={{
      maxWidth: 760,
      margin: '0 auto 10px',
      padding: 12,
      borderRadius: 14,
      background: 'rgba(255,255,255,.05)',
      border: `1px solid ${danger ? 'rgba(248,113,113,.35)' : 'rgba(46,204,138,.32)'}`,
      color: danger ? '#FCA5A5' : '#86EFAC',
      fontSize: 13,
      fontWeight: 750,
    }}>
      {text}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function assignmentLabel(status) {
  if (status === 'ready')   return 'Valida';
  if (status === 'loading') return 'Verifica';
  if (status === 'blocked') return 'Bloccata';
  return 'In attesa';
}

function statusLabel(status) {
  if (status === 'active')           return 'Online';
  if (status === 'paused')           return 'Pausa';
  if (status === 'completed')        return 'Terminato';
  if (status === 'permission_error') return 'GPS bloccato';
  return 'Offline';
}

function estimateCompletion(distanceKm, qty) {
  const target = qty ? Math.max(1.2, qty / 3500) : 4;
  return Math.min(100, Math.round((distanceKm / target) * 100));
}

function sessionMs(session) {
  if (!session?.started_at) return 0;
  const start = new Date(session.started_at).getTime();
  const end   = new Date(session.ended_at || session.paused_at || Date.now()).getTime();
  return Math.max(0, end - start);
}

function formatDuration(ms) {
  const total   = Math.floor(ms / 1000);
  const hours   = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTime(v) {
  return new Date(v).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function safeJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const shellStyle = {
  minHeight: '100dvh',
  padding: '14px 12px 40px',
  background: '#071426',
  color: 'rgba(255,255,255,.9)',
  fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
};
const topBarStyle = {
  display: 'grid',
  gridTemplateColumns: '52px minmax(0,1fr) auto',
  gap: 12,
  alignItems: 'center',
  margin: '0 auto 14px',
  maxWidth: 760,
};
const avatarStyle = {
  width: 52,
  height: 52,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg,#203752,#0f2238)',
  border: '1px solid rgba(255,255,255,.12)',
  color: '#fff',
  fontWeight: 900,
  fontSize: 22,
};
const eyebrowStyle = {
  margin: 0,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.12em',
  color: 'rgba(255,255,255,.48)',
  fontWeight: 900,
};
const titleStyle = { margin: 0, color: '#fff', fontSize: 18, lineHeight: 1.1 };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 12, lineHeight: 1.45 };
const statusBadgeStyle = {
  minWidth: 86,
  border: '1px solid',
  borderRadius: 14,
  padding: '8px 10px',
  display: 'grid',
  gap: 2,
  justifyItems: 'end',
  background: 'rgba(255,255,255,.04)',
  fontSize: 11,
};
const heroCardStyle = {
  maxWidth: 760,
  margin: '0 auto 12px',
  padding: 16,
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.1)',
  background: 'linear-gradient(180deg,rgba(18,32,54,.96),rgba(12,25,44,.96))',
  boxShadow: '0 20px 50px rgba(0,0,0,.25)',
};
const cardStyle = {
  maxWidth: 760,
  margin: '0 auto 12px',
  padding: 16,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.09)',
  background: 'rgba(18,32,54,.86)',
  boxShadow: '0 14px 34px rgba(0,0,0,.2)',
};
const campaignTitleStyle = {
  margin: '5px 0 14px',
  color: '#fff',
  fontSize: 22,
  lineHeight: 1.05,
  letterSpacing: '-.02em',
};
const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
  gap: 10,
};
const telemetryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
  gap: 10,
  marginTop: 12,
};
const controlsCardStyle = {
  maxWidth: 760,
  margin: '0 auto 12px',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
  gap: 10,
};
const primaryButtonStyle = {
  minHeight: 58,
  border: 'none',
  borderRadius: 16,
  padding: '0 18px',
  background: '#2ECC8A',
  color: '#071426',
  fontWeight: 950,
  fontSize: 17,
  cursor: 'pointer',
  boxShadow: '0 14px 28px rgba(46,204,138,.24)',
};
const secondaryButtonStyle = {
  minHeight: 54,
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 16,
  padding: '0 14px',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  fontWeight: 850,
  fontSize: 15,
  cursor: 'pointer',
};
const dangerButtonStyle = {
  ...secondaryButtonStyle,
  background: 'rgba(248,113,113,.15)',
  border: '1px solid rgba(248,113,113,.32)',
  color: '#FCA5A5',
};
const sosButtonStyle = {
  ...secondaryButtonStyle,
  background: 'rgba(248,113,113,.22)',
  border: '1px solid rgba(248,113,113,.45)',
};
const metricStyle = {
  minHeight: 70,
  padding: 11,
  borderRadius: 14,
  background: 'rgba(255,255,255,.055)',
  border: '1px solid rgba(255,255,255,.08)',
  display: 'grid',
  alignContent: 'space-between',
};
const telemetryStyle = {
  padding: 11,
  borderRadius: 14,
  background: 'rgba(255,255,255,.045)',
  border: '1px solid rgba(255,255,255,.08)',
  display: 'grid',
  gap: 5,
};
const mapWrapStyle = {
  height: 'min(62vh, 520px)',
  minHeight: 360,
  width: '100%',
  borderRadius: 16,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,.12)',
  position: 'relative',
  zIndex: 1,
};
const alertBannerStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  maxWidth: 760,
  margin: '0 auto 10px',
  borderRadius: 14,
  padding: 12,
  background: '#EF4444',
  color: '#fff',
  fontWeight: 950,
  textAlign: 'center',
};
const fileInputStyle = {
  minHeight: 54,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.8)',
  padding: 13,
};
const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 90,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.05)',
  color: '#fff',
  padding: 13,
  font: 'inherit',
  resize: 'vertical',
};
const disclaimerStyle = {
  maxWidth: 760,
  margin: '0 auto',
  color: 'rgba(255,255,255,.4)',
  fontSize: 11,
  lineHeight: 1.5,
  padding: '0 4px',
};
