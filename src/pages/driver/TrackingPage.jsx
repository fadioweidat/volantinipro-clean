import 'leaflet/dist/leaflet.css';
import { CircleMarker, GeoJSON, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCampaignRecord, uploadProofPhoto } from '../../lib/services/gps-api.js';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { createPhotoProofPackage, rememberPhotoHash } from '../../lib/services/photo-proof.js';

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
      ? geom.coordinates.map((poly) => poly[0])
      : null;
  if (!rings) return true;
  return rings.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersects = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  });
}

export function TrackingPage({ campaignId, comuneName }) {
  const tracking = useGpsTracking(campaignId);
  const [campaign, setCampaign] = useState(null);
  const [campaignError, setCampaignError] = useState(null);
  const [boundary, setBoundary] = useState(null);
  const [section, setSection] = useState('home');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [uploadState, setUploadState] = useState({ loading: false, message: null, error: null });
  const [battery, setBattery] = useState({ supported: false, level: null, charging: null });
  const [sosState, setSosState] = useState(null);
  const fileInputRef = useRef(null);

  const details = useMemo(() => normalizeCampaignDetails(campaign, campaignId, comuneName), [campaign, campaignId, comuneName]);
  const currentPos = tracking.lastPosition;
  const pathPositions = tracking.path.map((point) => [point.lat, point.lng]);
  const outOfZone = Boolean(currentPos && boundary && tracking.isActive && !pointInPolygon(currentPos.lat, currentPos.lng, boundary));
  const completion = estimateCompletion(tracking.distanceKm, details.qty);
  const operatorName = tracking.session?.driver_name || tracking.session?.driverName || `Operatore ${String(tracking.session?.driver_id || 'assegnato').slice(0, 6)}`;

  useEffect(() => {
    let cancelled = false;
    getCampaignRecord(campaignId)
      .then((row) => { if (!cancelled) setCampaign(row); })
      .catch((error) => {
        console.warn('[OPERATOR_CAMPAIGN_LOAD_ERROR]', error);
        if (!cancelled) setCampaignError(error?.message || 'Campagna non caricabile.');
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    if (!details.comune || details.comune === 'Dato non disponibile') return undefined;
    fetchComuneBoundary(details.comune).then((geom) => {
      if (!cancelled) setBoundary(geom);
    });
    return () => { cancelled = true; };
  }, [details.comune]);

  useEffect(() => {
    if (!navigator.getBattery) return undefined;
    let batteryManager = null;
    const update = () => {
      if (!batteryManager) return;
      setBattery({ supported: true, level: Math.round(batteryManager.level * 100), charging: batteryManager.charging });
    };
    navigator.getBattery().then((manager) => {
      batteryManager = manager;
      update();
      manager.addEventListener('levelchange', update);
      manager.addEventListener('chargingchange', update);
    }).catch(() => setBattery({ supported: false, level: null, charging: null }));
    return () => {
      if (!batteryManager) return;
      batteryManager.removeEventListener('levelchange', update);
      batteryManager.removeEventListener('chargingchange', update);
    };
  }, []);

  useEffect(() => {
    if (!outOfZone) return;
    console.warn('[OPERATOR_OUT_OF_ZONE]', {
      campaignId,
      hasPosition: Boolean(currentPos),
      accuracy: currentPos?.accuracy ?? null,
    });
  }, [campaignId, currentPos, outOfZone]);

  async function runAction(label, fn) {
    setActionError(null);
    setActionLoading(label);
    try {
      await fn();
    } catch (error) {
      setActionError(error?.message || 'Operazione non riuscita.');
    } finally {
      setActionLoading(null);
    }
  }

  async function submitProofPhoto(event) {
    event.preventDefault();
    if (!file) {
      setUploadState({ loading: false, message: null, error: 'Scatta una foto dalla fotocamera.' });
      return;
    }
    setUploadState({ loading: true, message: null, error: null });
    try {
      const photoPackage = await createPhotoProofPackage(file, {
        operatorName,
        campaignId,
        sessionId: tracking.session?.id,
        details,
        position: currentPos,
        boundary,
        note,
      });
      await uploadProofPhoto({
        campaignId,
        sessionId: tracking.session?.id,
        file: photoPackage.file,
        lat: currentPos?.lat ?? null,
        lng: currentPos?.lng ?? null,
        note: photoPackage.note,
      });
      rememberPhotoHash(photoPackage.hash);
      console.info('[PHOTO_PROOF_UPLOAD_SUCCESS]', { campaignId, sessionId: tracking.session?.id, hash: photoPackage.hash, alerts: photoPackage.metadata.alerts.length });
      setFile(null);
      setNote('');
      event.currentTarget.reset();
      setUploadState({ loading: false, message: photoPackage.metadata.alerts.length ? 'Foto caricata. Verifica richiesta in dashboard admin.' : 'Foto caricata e verificata.', error: null });
    } catch (error) {
      setUploadState({ loading: false, message: null, error: error?.message || 'Upload non riuscito.' });
    }
  }

  function sendSos() {
    const event = {
      type: 'sos',
      campaignId,
      operatorName,
      lat: currentPos?.lat ?? null,
      lng: currentPos?.lng ?? null,
      recordedAt: new Date().toISOString(),
    };
    const key = 'volantinipro:operator-events';
    const events = readJson(key, []);
    window.localStorage.setItem(key, JSON.stringify([...events, event].slice(-100)));
    console.warn('[OPERATOR_SOS]', {
      campaignId,
      operatorName,
      hasPosition: Boolean(currentPos),
      recordedAt: event.recordedAt,
    });
    setSosState('SOS registrato localmente con ultima posizione disponibile.');
  }

  const assignmentBlocksStart = !tracking.isActive && !tracking.isPaused && tracking.assignmentStatus !== 'ready';
  const primaryAction = actionLoading ? `${actionLoading}...` : tracking.isActive ? 'Pausa' : tracking.isPaused ? 'Riprendi' : tracking.assignmentStatus === 'loading' ? 'Verifica...' : 'Start lavoro';

  return (
    <main style={shellStyle}>
      {outOfZone && <div style={alertBannerStyle}>Fuori dalla zona assegnata. Rientra nell'area di lavoro.</div>}

      <header style={topBarStyle}>
        <div style={avatarStyle}>{operatorName.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <p style={eyebrowStyle}>App operatore</p>
          <h1 style={titleStyle}>{operatorName}</h1>
          <p style={mutedStyle}>{details.comune} · {details.service}</p>
        </div>
        <StatusBadge status={tracking.status} network={tracking.networkStatus} />
      </header>

      {campaignError && <Notice danger text={campaignError} />}
      {tracking.assignmentError && <Notice id="operator-assignment-error" danger text={tracking.assignmentError} />}
      {tracking.error && <Notice danger text={tracking.error} />}
      {actionError && <Notice danger text={actionError} />}
      {sosState && <Notice text={sosState} />}

      <section style={heroCardStyle}>
        <div>
          <p style={eyebrowStyle}>Campagna assegnata</p>
          <h2 style={campaignTitleStyle}>{details.title}</h2>
          <div style={summaryGridStyle}>
            <Metric label="Comune" value={details.comune} />
            <Metric label="Quantita" value={details.qty ? details.qty.toLocaleString('it-IT') : 'Dato non disponibile'} />
            <Metric label="Data" value={details.date} />
            <Metric label="Ora" value={details.time} />
          </div>
        </div>
        <div style={telemetryGridStyle}>
          <Telemetry label="GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'In attesa'} tone={tracking.accuracy != null && tracking.accuracy <= 50 ? 'good' : 'warn'} />
          <Telemetry label="Batteria" value={battery.supported ? `${battery.level}%${battery.charging ? ' · carica' : ''}` : 'Non disponibile'} tone={battery.supported && battery.level < 20 ? 'bad' : 'good'} />
          <Telemetry label="Rete" value={tracking.networkStatus === 'online' ? 'Online' : 'Offline'} tone={tracking.networkStatus === 'online' ? 'good' : 'warn'} />
          <Telemetry label="Assegnazione" value={assignmentLabel(tracking.assignmentStatus)} tone={tracking.assignmentStatus === 'ready' ? 'good' : tracking.assignmentStatus === 'loading' ? 'warn' : 'bad'} />
          <Telemetry label="Coda offline locale" value={tracking.queueSize} tone={tracking.queueSize ? 'warn' : 'good'} />
        </div>
      </section>

      <section style={controlsCardStyle}>
        <button
          type="button"
          style={primaryButtonStyle}
          disabled={Boolean(actionLoading) || assignmentBlocksStart}
          aria-describedby={assignmentBlocksStart && tracking.assignmentError ? 'operator-assignment-error' : undefined}
          onClick={() => runAction(primaryAction, tracking.isActive ? tracking.pause : tracking.isPaused ? tracking.resume : tracking.start)}
        >
          {primaryAction}
        </button>
        {(tracking.isActive || tracking.isPaused) && (
          <button type="button" style={dangerButtonStyle} disabled={Boolean(actionLoading)} onClick={() => runAction('Termino', tracking.end)}>
            Termina
          </button>
        )}
        <button type="button" style={secondaryButtonStyle} onClick={() => setSection('map')}>Mappa</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => { setSection('photo'); window.setTimeout(() => fileInputRef.current?.click(), 120); }}>Foto</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => setSection('report')}>Report</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => setSection('help')}>Assistenza</button>
        <button type="button" style={sosButtonStyle} onClick={sendSos}>SOS</button>
      </section>
      <p style={localStateNoticeStyle}>Coda GPS offline, SOS e controllo duplicati foto sono salvati localmente su questo dispositivo finche non esiste un canale backend dedicato.</p>

      {section === 'home' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Stato lavoro</p>
          <div style={summaryGridStyle}>
            <Metric label="Tempo sessione" value={formatDuration(sessionMs(tracking.session))} />
            <Metric label="Km percorsi" value={`${tracking.distanceKm.toFixed(2)} km`} />
            <Metric label="Completamento" value={`${completion}%`} />
            <Metric label="Ultimo invio" value={tracking.lastSentAt ? formatTime(tracking.lastSentAt) : 'In attesa'} />
            <Metric label="Velocita" value={tracking.speed != null ? `${Math.round(tracking.speed * 3.6)} km/h` : 'n/d'} />
            <Metric label="Direzione" value={tracking.heading != null ? `${Math.round(tracking.heading)}°` : 'n/d'} />
          </div>
        </section>
      )}

      {section === 'map' && (
        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Mappa lavoro</p>
              <h2 style={sectionTitleStyle}>{details.comune}</h2>
            </div>
            <span style={mutedStyle}>{tracking.distanceKm.toFixed(2)} km · {completion}%</span>
          </div>
          <TrackingMap path={pathPositions} boundary={boundary} currentPos={currentPos} comuneName={details.comune} />
        </section>
      )}

      {section === 'photo' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Foto prova</p>
          <h2 style={sectionTitleStyle}>Scatto geolocalizzato</h2>
          <form onSubmit={submitProofPhoto} style={{ display: 'grid', gap: 12 }}>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0] || null)} style={fileInputStyle} />
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note per admin..." rows={3} style={textareaStyle} />
            <button style={primaryButtonStyle} type="submit" disabled={uploadState.loading}>
              {uploadState.loading ? 'Caricamento...' : 'Carica foto'}
            </button>
          </form>
          <p style={mutedStyle}>La foto viene salvata su Supabase Storage con posizione, data, ora, operatore, campagna, watermark e hash nel campo note. Il controllo duplicati usa hash locali del browser.</p>
          {uploadState.message && <Notice text={uploadState.message} />}
          {uploadState.error && <Notice danger text={uploadState.error} />}
        </section>
      )}

      {section === 'report' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Report operatore</p>
          <div style={summaryGridStyle}>
            <Metric label="Tempo" value={formatDuration(sessionMs(tracking.session))} />
            <Metric label="Km" value={`${tracking.distanceKm.toFixed(2)} km`} />
            <Metric label="Velocita media" value={averageSpeedLabel(tracking.distanceKm, sessionMs(tracking.session))} />
            <Metric label="Foto" value={uploadState.message ? '1+ caricate' : 'Nessuna in questa vista'} />
            <Metric label="Pause" value={tracking.isPaused ? 'In pausa' : 'n/d'} />
            <Metric label="Precisione GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'n/d'} />
            <Metric label="Copertura" value={`${completion}%`} />
            <Metric label="Area lavorata" value={boundary ? 'Confine comune caricato' : 'Confine non disponibile'} />
          </div>
        </section>
      )}

      {section === 'help' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Assistenza</p>
          <h2 style={sectionTitleStyle}>Contatto admin</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <a style={linkButtonStyle} href={`https://wa.me/?text=${encodeURIComponent(`Assistenza VolantiniPro - campagna ${campaignId}`)}`} target="_blank" rel="noreferrer">Apri WhatsApp</a>
            <button type="button" style={secondaryButtonStyle} onClick={sendSos}>Invia SOS con posizione</button>
          </div>
          <p style={mutedStyle}>Messaggi admin e notifiche push richiedono un canale backend dedicato: questa app non crea nuove tabelle o API.</p>
        </section>
      )}
    </main>
  );
}

function TrackingMap({ path, boundary, currentPos, comuneName }) {
  const center = currentPos ? [currentPos.lat, currentPos.lng] : path.length ? path[path.length - 1] : [45.4642, 9.19];
  return (
    <div style={mapWrapStyle}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <MapUpdater center={center} />
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {boundary && <GeoJSON key={comuneName} data={boundary} style={{ color: '#2ECC8A', weight: 3, fillOpacity: 0.06, dashArray: '6,4' }} />}
        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#E8571A', weight: 5, opacity: 0.9 }} />}
        {currentPos && (
          <CircleMarker center={[currentPos.lat, currentPos.lng]} radius={11} pathOptions={{ color: '#2ECC8A', fillColor: '#2ECC8A', fillOpacity: 0.95 }}>
            <Popup>Posizione attuale<br />Precisione: {currentPos.accuracy != null ? `${Math.round(currentPos.accuracy)} m` : 'n/d'}</Popup>
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
    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => window.clearTimeout(timer);
  }, [map]);
  useEffect(() => {
    if (!center) return;
    const key = center.join(',');
    if (key !== prevCenter.current) {
      prevCenter.current = key;
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
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
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Telemetry({ label, value, tone }) {
  const color = tone === 'bad' ? '#F87171' : tone === 'warn' ? '#FBBF24' : '#2ECC8A';
  return (
    <div style={{ ...telemetryStyle, borderColor: `${color}33` }}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function Notice({ text, danger = false, id }) {
  return <div id={id} role={danger ? 'alert' : 'status'} style={{ ...noticeStyle, color: danger ? '#FCA5A5' : '#86EFAC', borderColor: danger ? 'rgba(248,113,113,.35)' : 'rgba(46,204,138,.32)' }}>{text}</div>;
}

function assignmentLabel(status) {
  if (status === 'ready') return 'Valida';
  if (status === 'loading') return 'Verifica';
  if (status === 'blocked') return 'Bloccata';
  return 'In attesa';
}

function normalizeCampaignDetails(campaign, campaignId, fallbackComune) {
  const metadata = safeJson(campaign?.metadata);
  const serviceRaw = String(campaign?.servizio || campaign?.service || campaign?.service_type || metadata.servizio || '').toLowerCase();
  const service = serviceRaw.includes('h2h') ? 'Hand to Hand' : serviceRaw.includes('b2b') ? 'Business' : 'Door to Door';
  const qty = Number(campaign?.quantita || campaign?.quantity || campaign?.qty || campaign?.total_flyers || metadata.volantini_inseriti || metadata.volantini_necessari);
  const date = String(campaign?.start_date || campaign?.created_at || metadata.data || '').slice(0, 10);
  return {
    title: campaign?.title || campaign?.campaign_name || campaign?.nome || `Campagna ${String(campaignId).slice(0, 8)}`,
    service,
    client: campaign?.client_name || campaign?.customer_name || campaign?.company || metadata.cliente || null,
    comune: fallbackComune || metadata.zona || metadata.comune_principale || campaign?.zona || campaign?.zone || campaign?.city_name || 'Dato non disponibile',
    provincia: metadata.provincia || campaign?.provincia || campaign?.province || null,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    date: date || 'Dato non disponibile',
    time: campaign?.start_time || metadata.ora || 'Da assegnare',
  };
}

function estimateCompletion(distanceKm, qty) {
  const target = qty ? Math.max(1.2, qty / 3500) : 4;
  return Math.min(100, Math.round((distanceKm / target) * 100));
}

function sessionMs(session) {
  if (!session?.started_at) return 0;
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.ended_at || session.paused_at || Date.now()).getTime();
  return Math.max(0, end - start);
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function averageSpeedLabel(km, ms) {
  const hours = ms / 3600000;
  if (!hours || !Number.isFinite(hours)) return 'n/d';
  return `${(km / hours).toFixed(1)} km/h`;
}

function statusLabel(status) {
  if (status === 'active') return 'Online';
  if (status === 'paused') return 'Pausa';
  if (status === 'completed') return 'Terminato';
  if (status === 'permission_error') return 'GPS bloccato';
  return 'Offline';
}

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function readJson(key, fallback) {
  try { return JSON.parse(window.localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

const shellStyle = { minHeight: '100dvh', padding: '14px 12px 40px', background: '#071426', color: 'rgba(255,255,255,.9)', fontFamily: "'DM Sans', Inter, system-ui, sans-serif" };
const topBarStyle = { display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 12, alignItems: 'center', margin: '0 auto 14px', maxWidth: 760 };
const avatarStyle = { width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#203752,#0f2238)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', fontWeight: 900, fontSize: 22 };
const eyebrowStyle = { margin: 0, fontSize: 10, lineHeight: 1.4, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.48)', fontWeight: 900 };
const titleStyle = { margin: 0, color: '#fff', fontSize: 18, lineHeight: 1.1 };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 12, lineHeight: 1.45 };
const statusBadgeStyle = { minWidth: 86, border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '8px 10px', display: 'grid', gap: 2, justifyItems: 'end', background: 'rgba(255,255,255,.04)', fontSize: 11 };
const heroCardStyle = { maxWidth: 760, margin: '0 auto 12px', padding: 16, borderRadius: 22, border: '1px solid rgba(255,255,255,.1)', background: 'linear-gradient(180deg,rgba(18,32,54,.96),rgba(12,25,44,.96))', boxShadow: '0 20px 50px rgba(0,0,0,.25)' };
const cardStyle = { maxWidth: 760, margin: '0 auto 12px', padding: 16, borderRadius: 18, border: '1px solid rgba(255,255,255,.09)', background: 'rgba(18,32,54,.86)', boxShadow: '0 14px 34px rgba(0,0,0,.2)' };
const campaignTitleStyle = { margin: '5px 0 14px', color: '#fff', fontSize: 24, lineHeight: 1.05, letterSpacing: '-.02em' };
const summaryGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 };
const telemetryGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 12 };
const controlsCardStyle = { maxWidth: 760, margin: '0 auto 12px', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 };
const primaryButtonStyle = { minHeight: 58, border: 'none', borderRadius: 16, padding: '0 18px', background: '#2ECC8A', color: '#071426', fontWeight: 950, fontSize: 17, cursor: 'pointer', boxShadow: '0 14px 28px rgba(46,204,138,.24)' };
const secondaryButtonStyle = { minHeight: 54, border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: '0 14px', background: 'rgba(255,255,255,.06)', color: '#fff', fontWeight: 850, fontSize: 15, cursor: 'pointer' };
const dangerButtonStyle = { ...secondaryButtonStyle, background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.32)', color: '#FCA5A5' };
const sosButtonStyle = { ...secondaryButtonStyle, background: 'rgba(248,113,113,.22)', border: '1px solid rgba(248,113,113,.45)', color: '#fff' };
const metricStyle = { minHeight: 70, padding: 11, borderRadius: 14, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.08)', display: 'grid', alignContent: 'space-between' };
const telemetryStyle = { padding: 11, borderRadius: 14, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', display: 'grid', gap: 5 };
const sectionHeaderStyle = { display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, marginBottom: 12 };
const sectionTitleStyle = { margin: '5px 0 0', color: '#fff', fontSize: 20, lineHeight: 1.1 };
const mapWrapStyle = { height: 'min(62vh, 520px)', minHeight: 360, width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)', position: 'relative', zIndex: 1 };
const alertBannerStyle = { position: 'sticky', top: 0, zIndex: 20, maxWidth: 760, margin: '0 auto 10px', borderRadius: 14, padding: 12, background: '#EF4444', color: '#fff', fontWeight: 950, textAlign: 'center' };
const noticeStyle = { maxWidth: 760, margin: '0 auto 10px', padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', fontSize: 13, fontWeight: 750 };
const localStateNoticeStyle = { maxWidth: 760, margin: '0 auto 12px', color: 'rgba(255,255,255,.5)', fontSize: 12, lineHeight: 1.45, padding: '0 4px' };
const fileInputStyle = { minHeight: 54, borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.8)', padding: 13 };
const textareaStyle = { width: '100%', boxSizing: 'border-box', minHeight: 90, borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#fff', padding: 13, font: 'inherit', resize: 'vertical' };
const linkButtonStyle = { ...secondaryButtonStyle, display: 'grid', placeItems: 'center', textDecoration: 'none' };
