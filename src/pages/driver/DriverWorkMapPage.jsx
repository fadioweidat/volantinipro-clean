import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { useDriverAssignment } from '../../hooks/useDriverAssignment.js';
import { getCampaignGpsPoints, calculateGpsCoverage } from '../../lib/services/gps-api.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { geoJsonContainsPoint } from '../../lib/geo/pointInPolygon.js';
import { resolveMunicipalityBoundary } from '../../lib/geo/resolveMunicipalityBoundary.js';
import { driverPathWithQuery, driverBackClick } from './driverNav.js';

const POINTS_REFRESH_MIN_INTERVAL_MS = 8000;
const COVERAGE_REFRESH_INTERVAL_MS = 60000;

// ─── DriverWorkMapPage ────────────────────────────────────────────────────────
// /driver/assignment/{assignmentId}/map — mappa grande dedicata, separata da
// /driver/assignment/{assignmentId} (il "Programma"). Riusa useGpsTracking
// sullo stesso campaignId: la sessione GPS gia' attiva si ricollega da sola
// (resumeExistingSession in useGpsTracking.js, non toccato qui), quindi
// navigare qui e tornare indietro non interrompe/riavvia il tracking.
export function DriverWorkMapPage({ assignmentId }) {
  const { assignmentData, assignmentZones, assignmentError, campaignId, campaignRecord, loadingAssignment, accessToken } = useDriverAssignment(assignmentId);

  if (loadingAssignment) {
    return <main style={shellStyle}><div style={{ padding: 40, color: '#94a3b8' }}>Caricamento…</div></main>;
  }
  if (assignmentError || !campaignId) {
    const backHref = driverPathWithQuery(`/driver/assignment/${assignmentId}`);
    return (
      <main style={shellStyle}>
        <div style={{ padding: 40, color: '#fecaca' }}>{assignmentError || 'Assegnazione non disponibile.'}</div>
        <a href={backHref} style={backLinkStyle} onClick={(e) => driverBackClick(e, backHref)}>← Programma</a>
      </main>
    );
  }

  return (
    <WorkMap
      assignmentId={assignmentId}
      campaignId={campaignId}
      assignmentData={assignmentData}
      campaignRecord={campaignRecord}
      assignmentZones={assignmentZones}
      accessToken={accessToken}
    />
  );
}

function WorkMap({ assignmentId, campaignId, assignmentData, campaignRecord, assignmentZones, accessToken }) {
  // Riusa l'assignment/campaign gia' validati e recuperati da
  // useDriverAssignment (mount di questa pagina avviene solo dopo che quel
  // caricamento e' finito): evita che useGpsTracking rifaccia da zero le
  // stesse due chiamate di rete (gps_get_operator_campaign +
  // getValidOperatorAssignments) per lo stesso mount pagina — vedi
  // resolveGpsAssignment in gps-api.js per cosa resta comunque verificato
  // sempre lato server. Memo per identita' stabile: senza, un nuovo oggetto
  // ad ogni render farebbe ripartire l'effetto di refreshAssignment in loop.
  const assignmentContext = useMemo(
    () => (assignmentData && campaignRecord ? { assignment: assignmentData, campaign: campaignRecord } : null),
    [assignmentData, campaignRecord],
  );
  const tracking = useGpsTracking(campaignId, { assignmentContext, accessToken, assignmentId });
  const [points, setPoints] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [boundary, setBoundary] = useState(null);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [flyToMe, setFlyToMe] = useState(null);
  const [fitToArea, setFitToArea] = useState(0);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const lastPointsFetchRef = useRef(0);
  const lastCoverageFetchRef = useRef(0);
  // Timing diagnostico SOLO DEV (audit "Driver page + Map slow load"):
  // MAP_SHELL_MOUNT = primo render di questo componente (equivalente a
  // "map shell" visibile, MapContainer/TileLayer gia' nel JSX sotto).
  // MAP_MOUNT/TILE_FIRST_LOAD sono impostati dagli handler Leaflet piu'
  // sotto. Nessuna fase viene rallentata da questi marker.
  const mapTimingRef = useRef(Boolean(import.meta.env.DEV) ? { shellMount: performance.now() } : null);

  const activeAssignmentZoneId = tracking.session?.campaign_zone_id;
  const activeZone = (assignmentZones || []).find(z => z.id === activeAssignmentZoneId) || (assignmentZones || [])[0] || null;
  const zoneCenter = activeZone && activeZone.centerLat != null && activeZone.centerLng != null
    && !(activeZone.centerLat === 0 && activeZone.centerLng === 0)
    ? { lat: activeZone.centerLat, lng: activeZone.centerLng }
    : null;
  // meta.comuni[0] viene da assignmentData.metadata, gia' disponibile al
  // primo render (Fase 1 di useDriverAssignment, nessuna attesa aggiuntiva)
  // — stesso fallback gia' usato da DriverAssignmentPage.jsx. Senza questo,
  // su questa pagina il nome del comune restava null finche' non arrivavano
  // le zone dettagliate (Fase 2) o la risoluzione di useGpsTracking, e la
  // richiesta del confine partiva quindi in ritardo rispetto al primo paint.
  const metaPrimaryComune = useMemo(() => {
    const raw = assignmentData?.metadata;
    const meta = raw && typeof raw === 'object' ? raw : (() => { try { return JSON.parse(raw || '{}'); } catch { return {}; } })();
    return Array.isArray(meta.comuni) && meta.comuni[0] ? meta.comuni[0] : null;
  }, [assignmentData]);
  // activeZone.zone_name viene da operator_assignment_zones.municipality_name
  // (gia' risolto a livello Comune, mai una sotto-zona tipo "Monza Centro" —
  // vedi useDriverAssignment.js): priorita' sulla zona realmente in corso,
  // poi campaign?.city (assegnazioni senza zone strutturate), poi il comune
  // gia' noto dai metadati dell'assegnazione (disponibile subito, Fase 1).
  // Prima leggeva solo campaign?.city: su una campagna con piu' zone/comuni
  // la mappa restava agganciata al comune "principale" della campagna anche
  // quando la sessione GPS attiva (campaign_zone_id) era su un altro comune.
  const realComuneName = activeZone?.zone_name || tracking.assignmentState.campaign?.city || metaPrimaryComune || null;

  // Confine reale del Comune — stesso helper condiviso di DriverAssignmentPage
  // e DriverCoverageMap, mai un cerchio inventato.
  useEffect(() => {
    if (!realComuneName) { setBoundary(null); return; }
    let cancelled = false;
    setBoundaryLoading(true);
    const boundaryStart = mapTimingRef.current ? performance.now() : 0;
    resolveMunicipalityBoundary(realComuneName, { lat: zoneCenter?.lat, lng: zoneCenter?.lng })
      .then(geom => {
        if (cancelled) return;
        setBoundary(geom);
        if (mapTimingRef.current) {
          const t = mapTimingRef.current;
          t.boundaryReady = performance.now();
          console.info(`[MAP LOAD] BOUNDARY_RESOLVE=${Math.round(t.boundaryReady - boundaryStart)}ms shellToBoundary=${Math.round(t.boundaryReady - t.shellMount)}ms mapMount=${t.mapMount != null ? Math.round(t.mapMount - t.shellMount) : '—'}ms firstTile=${t.firstTile != null ? Math.round(t.firstTile - t.shellMount) : '—'}ms`);
        }
      })
      .finally(() => { if (!cancelled) setBoundaryLoading(false); });
    return () => { cancelled = true; };
  }, [realComuneName, zoneCenter?.lat, zoneCenter?.lng]);

  const sessionId = tracking.session?.id || null;
  const position = tracking.lastPosition;

  // Punti GPS persistiti della sessione (con accuracy, per il filtro qualita'
  // gia' esistente in pointQuality.js) — stessa fonte/logica gia' usata da
  // DriverCoverageMap.jsx, non una nuova pipeline di raccolta.
  useEffect(() => {
    if (!sessionId) { setPoints([]); return; }
    let cancelled = false;
    const now = Date.now();
    if (now - lastPointsFetchRef.current < POINTS_REFRESH_MIN_INTERVAL_MS) return;
    lastPointsFetchRef.current = now;
    getCampaignGpsPoints(campaignId, { sessionId })
      .then((rows) => { if (!cancelled) setPoints(rows); })
      .catch(() => {});
    // gps_calculate_zone_coverage richiede geometry/polygon_geojson/radius_m
    // sulla zona: se sappiamo gia' lato client che radiusM e' null (unico
    // segnale disponibile qui), evitiamo la chiamata RPC — restituirebbe
    // comunque 'zone_geometry_missing', ma senza il giro di rete.
    const zoneGeometryKnownMissing = activeZone && activeZone.radiusM == null;
    if (zoneGeometryKnownMissing) {
      setCoverage({ calculation_status: 'zone_geometry_missing' });
    } else if (now - lastCoverageFetchRef.current >= COVERAGE_REFRESH_INTERVAL_MS || !lastCoverageFetchRef.current) {
      lastCoverageFetchRef.current = now;
      calculateGpsCoverage(sessionId).then((result) => { if (!cancelled) setCoverage(result); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [campaignId, sessionId, position?.recorded_at, tracking.status, activeZone]);

  const validPoints = useMemo(() => filterValidGpsPoints(points).valid, [points]);
  const trackPath = useMemo(
    () => validPoints.map(p => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    [validPoints],
  );

  // "Distanza valida nell'area": solo i tratti di percorso quality-filtrato
  // che restano DENTRO il confine reale — mai una distanza dal centro
  // presentata come area. Senza confine risolto non si inventa un numero.
  const validAreaDistanceKm = useMemo(() => {
    if (!boundary || validPoints.length < 2) return boundary ? 0 : null;
    let km = 0;
    for (let i = 1; i < validPoints.length; i += 1) {
      const a = validPoints[i - 1];
      const b = validPoints[i];
      const aInside = geoJsonContainsPoint(boundary, Number(a.lat), Number(a.lng));
      const bInside = geoJsonContainsPoint(boundary, Number(b.lat), Number(b.lng));
      if (aInside && bInside) km += haversineKm(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
    }
    return Math.round(km * 100) / 100;
  }, [boundary, validPoints]);

  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const outOfArea = Boolean(hasPosition && boundary && tracking.isActive && !geoJsonContainsPoint(boundary, lat, lng));

  const coverageLabel = coverage?.calculation_status === 'ready' ? `${coverage.gps_coverage_pct ?? coverage.final_operational_coverage_pct ?? 0}%` : 'Non disponibile';
  const coveragePct = coverage?.calculation_status === 'ready' ? Number(coverage.gps_coverage_pct ?? coverage.final_operational_coverage_pct ?? 0) : null;

  const zoneLabel = activeZone?.zone_name || null;

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <a href={driverPathWithQuery(`/driver/assignment/${assignmentId}`)} style={backLinkStyle} onClick={(e) => driverBackClick(e, driverPathWithQuery(`/driver/assignment/${assignmentId}`))}>← Programma</a>
        <div>
          <h1 style={titleStyle}>{realComuneName || 'Area assegnata'}</h1>
          {zoneLabel && <p style={subtitleStyle}>Zona attiva: {zoneLabel}</p>}
        </div>
      </header>

      <div style={kpiGridStyle}>
        <Kpi label="Copertura" value={coverageLabel} />
        <Kpi label="Distanza valida" value={validAreaDistanceKm != null ? `${validAreaDistanceKm.toFixed(2)} km` : 'N.D.'} />
        <Kpi label="Precisione GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'In attesa'} />
        <Kpi label="Stato" value={outOfArea ? 'Fuori area' : hasPosition ? 'Dentro area' : 'In attesa GPS'} tone={outOfArea ? 'warn' : 'ok'} />
      </div>

      {coveragePct != null && (
        <div style={progressWrapStyle}>
          <div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${Math.min(100, Math.max(0, coveragePct))}%` }} /></div>
        </div>
      )}

      {outOfArea && <div style={outOfAreaBannerStyle}>⚠ Fuori area assegnata</div>}
      {!boundary && (
        <div style={infoBannerStyle}>{boundaryLoading ? 'Caricamento confine…' : 'Confine area non disponibile'}</div>
      )}

      <div style={mapWrapStyle}>
        {/* Container della mappa sempre visibile fin da subito (MapContainer
            sotto non aspetta ne' boundary ne' tile): questo overlay copre
            solo l'attesa dei tile di base, mai uno schermo vuoto o bloccato. */}
        {!tilesLoaded && (
          <div style={mapLoadingOverlayStyle}>Mappa in caricamento…</div>
        )}
        <DriverMapErrorBoundary>
          {/* height:'100%' non si risolveva mai qui: il genitore (mapWrapStyle)
              prende altezza da flex:'1 1 auto' (flex-basis:auto), e in questo
              motore di rendering l'altezza risolta di un flex item con
              flex-basis:auto NON viene propagata come "definita" ai figli con
              height percentuale (verificato dal vivo: getComputedStyle del
              genitore riportava gia' 466px, ma il figlio restava a 0px finche'
              non si forzava un'altezza esplicita sul genitore). position:
              absolute + inset:0 ancora il contenitore Leaflet al genitore
              position:relative senza passare da nessuna risoluzione
              percentuale, quindi non dipende da questa sottigliezza flex. */}
          {/* fadeAnimation=false: con React.StrictMode (main.jsx) la MapContainer
              viene montata/smontata/rimontata una volta in piu' in dev; il loop
              rAF interno di Leaflet che anima l'opacita' dei tile da 0 a 1 resta
              corrotto tra un'istanza scartata e quella reale, lasciando i tile
              caricati (leaflet-tile-loaded, visibility:visible) bloccati a
              style.opacity="0" (verificato dal vivo: forzare opacity=1 a mano
              rende i tile visibili immediatamente). Disabilitare l'animazione
              rimuove la dipendenza da quel loop: i tile compaiono a piena
              opacita' non appena caricati, nessun impatto su GPS/DB/auth. */}
          <MapContainer center={zoneCenter ? [zoneCenter.lat, zoneCenter.lng] : [45.4642, 9.19]} zoom={14} fadeAnimation={false} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{
                load: () => {
                  setTilesLoaded(true);
                  if (mapTimingRef.current && mapTimingRef.current.firstTile == null) {
                    const t = mapTimingRef.current;
                    t.firstTile = performance.now();
                    console.info(`[MAP LOAD] TILE_FIRST_LOAD=${Math.round(t.firstTile - t.shellMount)}ms`);
                  }
                },
              }}
            />
            {boundary && (
              <GeoJSON data={boundary} style={{ color: '#E8571A', weight: 3, fillColor: '#E8571A', fillOpacity: 0.06 }} />
            )}
            <MapReadyController onReady={() => {
              if (mapTimingRef.current && mapTimingRef.current.mapMount == null) {
                const t = mapTimingRef.current;
                t.mapMount = performance.now();
                console.info(`[MAP LOAD] MAP_MOUNT=${Math.round(t.mapMount - t.shellMount)}ms`);
              }
            }} />
            {boundary && <FitToBounds geometry={boundary} trigger={fitToArea} />}
            {zoneCenter && (
              <CircleMarker center={[zoneCenter.lat, zoneCenter.lng]} radius={8} pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.9, weight: 2 }}>
                <Tooltip direction="top" offset={[0, -8]}>{zoneLabel || 'Zona attiva'}</Tooltip>
              </CircleMarker>
            )}
            {trackPath.length > 1 && <Polyline positions={trackPath} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }} />}
            {hasPosition && (
              <CircleMarker center={[lat, lng]} radius={9} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.95, weight: 2 }}>
                <Tooltip permanent direction="top" offset={[0, -8]}>Tu sei qui</Tooltip>
              </CircleMarker>
            )}
            <FlyToPosition position={flyToMe} />
          </MapContainer>
        </DriverMapErrorBoundary>

        <div style={mapControlsStyle}>
          <button type="button" style={mapControlBtnStyle} disabled={!hasPosition} onClick={() => setFlyToMe({ lat, lng, ts: Date.now() })}>La mia posizione</button>
          <button type="button" style={mapControlBtnStyle} disabled={!boundary} onClick={() => setFitToArea((n) => n + 1)}>Torna all'area</button>
        </div>
      </div>
    </main>
  );
}

// Boundary locale solo intorno a <MapContainer>: se Leaflet crasha (es.
// geometria del confine corrotta), il resto della pagina (header, KPI,
// controlli) resta utilizzabile invece di sbiancare tutto. Retry esplicito
// (non solo un resetKey) perche' qui l'utente ha un pulsante da premere.
class DriverMapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('[DriverMapErrorBoundary] mappa crash', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={mapErrorStyle}>
          <p style={{ margin: '0 0 12px' }}>Impossibile caricare la mappa</p>
          <button type="button" style={mapControlBtnStyle} onClick={() => this.setState({ hasError: false })}>Riprova</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Leaflet misura il contenitore in modo SINCRONO al mount, ma qui il
// contenitore prende altezza da flexbox (flex:1 1 auto dentro una colonna
// minHeight:100vh) + minHeight:58vh: sul mobile il layout finale (e la vh
// reale, che i browser mobile ricalcolano dopo il primo paint quando la
// barra indirizzi si comprime) puo' stabilizzarsi DOPO che Leaflet ha gia'
// creato la griglia tile su un contenitore a misura 0/sbagliata — risultato:
// contenitore visibile ma nessuna tile, nessun layer. invalidateSize() forza
// Leaflet a rimisurare e ridisegnare; lo richiamiamo al mount (via rAF, per
// essere sicuri che il layout sia gia' stato committato) e ad ogni
// resize/orientationchange, non con un timeout arbitrario lungo.
function MapReadyController({ onReady }) {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    const raf1 = requestAnimationFrame(() => {
      invalidate();
      const raf2 = requestAnimationFrame(invalidate);
      map.__perfRaf2 = raf2;
    });
    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);
    return () => {
      cancelAnimationFrame(raf1);
      if (map.__perfRaf2) cancelAnimationFrame(map.__perfRaf2);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
    };
  }, [map]);
  // Timing diagnostico SOLO DEV: la Promise di react-leaflet (whenReady)
  // e' gia' risolta quando questo componente figlio monta (react-leaflet
  // monta i figli di MapContainer solo dopo whenReady), quindi il mount di
  // questo effect e' gia' un segnale valido di "mappa pronta" — nessuna
  // nuova sottoscrizione Leaflet aggiunta.
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FitToBounds({ geometry, trigger }) {
  const map = useMap();
  const firstFitDone = useRef(false);
  useEffect(() => {
    if (!geometry) return;
    try {
      const bounds = L.geoJSON(geometry).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: la mappa resta sul center di default,
      // nessun crash e nessuna area inventata.
    }
    firstFitDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, trigger, map]);
  return null;
}

function FlyToPosition({ position }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 16));
  }, [position, map]);
  return null;
}

function Kpi({ label, value, tone }) {
  const color = tone === 'warn' ? '#f59e0b' : tone === 'ok' ? '#22c55e' : '#e2e8f0';
  return (
    <div style={kpiTileStyle}>
      <span style={kpiLabelStyle}>{label}</span>
      <strong style={{ ...kpiValueStyle, color }}>{value}</strong>
    </div>
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const shellStyle = { minHeight: '100vh', width: '100%', background: '#0b1220', display: 'flex', flexDirection: 'column', overflowX: 'hidden' };
// sticky: resta visibile e raggiungibile col pollice anche se la pagina
// scrolla (KPI/banner sopra la mappa possono spingerla giu'), senza mai
// sovrapporsi alla mappa (z-index sotto ai controlli Leaflet, che restano
// in basso a destra — vedi mapControlsStyle).
const headerStyle = { padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 6, position: 'sticky', top: 0, zIndex: 10, background: '#0b1220' };
// Tap target reale (min 44px, linea guida iOS/Android) invece del link di
// testo di prima (padding 6px, nessun'area cliccabile oltre al testo):
// facile da premere col pollice in movimento, non solo "leggibile".
const backLinkStyle = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', borderRadius: 12, background: 'rgba(147,197,253,.12)', border: '1px solid rgba(147,197,253,.35)', color: '#93c5fd', textDecoration: 'none', fontSize: 15, fontWeight: 800 };
const titleStyle = { margin: 0, color: '#fff', fontSize: 20, fontWeight: 800 };
const subtitleStyle = { margin: '2px 0 0', color: '#94a3b8', fontSize: 13 };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 16px', marginBottom: 8 };
const kpiTileStyle = { background: '#111c30', border: '1px solid #1f2c45', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const kpiLabelStyle = { fontSize: 10.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' };
const kpiValueStyle = { fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const progressWrapStyle = { padding: '0 16px', marginBottom: 8 };
const progressTrackStyle = { height: 8, borderRadius: 999, background: '#1f2c45', overflow: 'hidden' };
const progressFillStyle = { height: '100%', background: '#22c55e', borderRadius: 999, transition: 'width .3s ease' };
const outOfAreaBannerStyle = { margin: '0 16px 8px', padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.4)', color: '#fbbf24', fontSize: 13, fontWeight: 700 };
const infoBannerStyle = { margin: '0 16px 8px', padding: '8px 12px', borderRadius: 10, background: 'rgba(148,163,184,.08)', border: '1px dashed rgba(148,163,184,.35)', color: '#94a3b8', fontSize: 12.5 };
const mapWrapStyle = { position: 'relative', flex: '1 1 auto', minHeight: '58vh', margin: '0 16px 16px', borderRadius: 16, overflow: 'hidden', border: '1px solid #1f2c45' };
const mapLoadingOverlayStyle = { position: 'absolute', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,18,32,.72)', color: '#cbd5e1', fontSize: 13, fontWeight: 700, pointerEvents: 'none' };
const mapErrorStyle = { height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', background: '#111c30', fontSize: 14, fontWeight: 700, textAlign: 'center', padding: 20 };
const mapControlsStyle = { position: 'absolute', right: 10, bottom: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 };
const mapControlBtnStyle = { minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(15,23,42,.85)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
