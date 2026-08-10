import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Polygon } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { calculateDistanceKm } from '../../lib/services/gps-api.js';
import { getOwnedCustomerTracking } from '../../lib/services/customer-api.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';
import { listCoverageAdjustments } from '../../lib/services/coverage-adjustments-api.js';
import { C, F } from '../../lib/constants.js';

export function CampaignTracking({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [], campaign: null });
  const [adjustments, setAdjustments] = useState([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const zoneProgress = useZoneProgress({ campaignId });

  useEffect(() => {
    let cancelled = false;
    // Sola lettura del modello canonico: get_campaign_coverage_adjustments
    // restituisce al Cliente solo id/tipo/geometria/updated_at delle
    // correzioni ATTIVE (mai revocate, mai motivo/note/identita' Admin) —
    // stesso RPC gia' verificato lato sicurezza in GPS-MANUAL-COVERAGE-1.
    listCoverageAdjustments(campaignId)
      .then((rows) => { if (!cancelled) setAdjustments(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAdjustments([]); });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tracking = await getOwnedCustomerTracking(campaignId);
        if (!cancelled) setState({ loading: false, error: null, ...tracking });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Tracking non disponibile.' }));
      }
    }
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // refreshNonce forza un reload immediato dal pulsante "Aggiorna", senza
    // attendere l'intervallo di 30s — stessa query, stessa logica, nessun
    // cambiamento a getOwnedCustomerTracking.
  }, [campaignId, refreshNonce]);

  const status = deriveCampaignStatus(state.sessions);
  const activeMs = state.sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);
  const distanceKm = calculateDistanceKm(state.points);
  const latestPing = [...state.points].reverse().find((point) => point.recorded_at || point.created_at)?.recorded_at
    || [...state.sessions].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0]?.updated_at
    || null;
  const connectionStatus = latestPing && Date.now() - new Date(latestPing).getTime() <= 5 * 60 * 1000 ? 'online' : 'offline';
  // zona (es. "Saronno") evita la ridondanza "Campagna Campagna X": titolo
  // in DB e' gia' salvato come "Campagna {citta}" (vedi Step4.jsx saveCampaign).
  const campaignTitle = state.campaign?.zona || state.campaign?.titolo || 'Campagna';
  const backHref = `/campagna/${campaignId}`;

  return (
    <main style={shellStyle}>
      <style>{`
        .vp-tracking-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 900px) { .vp-tracking-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .vp-tracking-kpi-grid { grid-template-columns: 1fr; } }
        .vp-tracking-two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        @media (max-width: 760px) { .vp-tracking-two-col { grid-template-columns: 1fr; } }
      `}</style>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <a href={backHref} style={breadcrumbStyle}>
                Dashboard Cliente <span style={{ color: 'rgba(255,255,255,.3)' }}>›</span> Campagna {campaignTitle} <span style={{ color: 'rgba(255,255,255,.3)' }}>›</span> Tracking
              </a>
              <h1 style={titleStyle}>Tracking Campagna {campaignTitle}</h1>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={backHref} style={secondaryBtnStyle}>Torna alla campagna</a>
              <button
                type="button"
                onClick={() => setRefreshNonce((n) => n + 1)}
                disabled={state.loading}
                style={{ ...secondaryBtnStyle, opacity: state.loading ? 0.6 : 1, cursor: state.loading ? 'default' : 'pointer' }}
              >
                {state.loading ? 'Aggiornamento…' : 'Aggiorna'}
              </button>
            </div>
          </div>
        </header>

        {state.error && <div style={errorStyle}>{state.error}</div>}

        <div className="vp-tracking-kpi-grid" style={{ marginBottom: 16 }}>
          <Metric label="Stato campagna" value={status} color={C.green} />
          <Metric label="Punti GPS" value={state.points.length} color={C.blue} />
          <Metric label="Tempo registrato" value={formatDuration(activeMs)} color={C.orange} />
          <Metric label="Distanza" value={`${distanceKm.toFixed(2)} km`} color={C.orange} />
          <Metric label="Ultimo ping" value={formatDateTime(latestPing)} color={C.purple} />
          <Metric label="Connessione" value={connectionStatus === 'online' ? 'Online' : 'Offline'} color={connectionStatus === 'online' ? C.green : 'rgba(255,255,255,.45)'} />
          <Metric label="Foto approvate" value={state.photos.length} color={C.blue} />
        </div>

        {state.campaign && <AuthorizedZoneProgress zoneProgress={zoneProgress} />}

        <section style={{ ...cardStyle, marginBottom: 16 }}>
          <p style={eyebrowStyle}>Percorso distribuzione</p>
          {state.points.length > 0 || zoneProgress.zones.length > 0 ? (
            <TrackingMap points={state.points} zones={zoneProgress.zones} adjustments={adjustments} />
          ) : (
            <EmptyState text={state.loading ? 'Caricamento tracking GPS…' : 'Il percorso GPS sarà disponibile quando inizierà la distribuzione.'} tall />
          )}
          {adjustments.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgba(255,255,255,.45)', fontFamily: F.sans }}>
              Copertura finale composta da rilevamento GPS e verifiche operative approvate.
            </p>
          )}
        </section>

        <div className="vp-tracking-two-col">
          <section style={cardStyle}>
            <p style={eyebrowStyle}>Riepilogo orari</p>
            {state.sessions.length ? state.sessions.map((session) => (
              <div key={session.id} style={rowStyle}>
                <strong style={{ color: C.white, fontFamily: F.sans, fontSize: 13 }}>{session.status}</strong>
                <span style={{ color: 'rgba(255,255,255,.5)', fontFamily: F.sans, fontSize: 12 }}>{formatDateTime(session.started_at)} – {formatDateTime(session.ended_at || session.paused_at)}</span>
              </div>
            )) : <EmptyState text="Nessuna sessione registrata." />}
          </section>

          <section style={cardStyle}>
            <p style={eyebrowStyle}>Foto prova approvate</p>
            {state.photos.length ? state.photos.map((photo) => {
              const meta = parseProofPhotoNote(photo.note);
              return (
                <div key={photo.id} style={rowStyle}>
                  {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova approvata" style={{ width: 110, height: 82, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' }} /> : null}
                  <div>
                    <strong style={{ color: C.white, fontFamily: F.sans, fontSize: 13 }}>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
                    {meta.outcome && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: C.green, fontFamily: F.sans }}>{podOutcomeLabel(meta.outcome)}</span>}
                    <p style={{ margin: '4px 0', color: 'rgba(255,255,255,.5)', fontFamily: F.sans, fontSize: 12 }}>{meta.client || 'Cliente non specificato'}{meta.address ? ` · ${meta.address}` : ''}</p>
                    {(meta.ddt || meta.colli) && (
                      <p style={{ margin: '2px 0', color: 'rgba(255,255,255,.35)', fontSize: 11, fontFamily: F.sans }}>{meta.ddt ? `DDT ${meta.ddt}` : ''}{meta.ddt && meta.colli ? ' · ' : ''}{meta.colli ? `${meta.colli} colli` : ''}</p>
                    )}
                    {meta.note && <p style={{ margin: '2px 0', color: 'rgba(255,255,255,.35)', fontSize: 11, fontFamily: F.sans }}>{meta.note}</p>}
                  </div>
                </div>
              );
            }) : <EmptyState text="Nessuna foto prova approvata disponibile." />}
          </section>
        </div>
      </div>
    </main>
  );
}

function AuthorizedZoneProgress({ zoneProgress }) {
  return <div style={{ marginBottom: 16 }}>
    <ZoneProgressPanel
      zones={zoneProgress.zones}
      loading={zoneProgress.loading}
      refreshing={zoneProgress.refreshing}
      error={zoneProgress.error}
      notice={zoneProgress.notice}
      onRefresh={zoneProgress.refresh}
      theme="dark"
    />
  </div>;
}

const ADJUSTMENT_COLORS = {
  manual_covered: '#8b5cf6',
  partially_covered: '#8b5cf6',
  inaccessible: '#f97316',
};

function polygonGeoJsonToLatLngs(geometry) {
  const ring = geometry?.coordinates?.[0];
  if (!Array.isArray(ring)) return [];
  return ring.map(([lng, lat]) => [lat, lng]);
}

function TrackingMap({ points, zones = [], adjustments = [] }) {
  const latest = points[points.length - 1];
  const first = points[0];
  const center = useMemo(() => {
    if (latest) return [Number(latest.lat), Number(latest.lng)];
    if (zones.length > 0 && zones[0].geometry?.coordinates?.[0]?.[0]) {
      const coord = zones[0].geometry.coordinates[0][0];
      return [coord[1], coord[0]];
    }
    return [45.4642, 9.1900];
  }, [latest, zones]);
  const path = points.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  function getZoneStyle(zone) {
    if (zone.adjustment_type === 'inaccessible') {
      return { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.2, dashArray: '5, 10', weight: 2 };
    }
    if (zone.adjustment_type === 'manual_covered' || zone.adjustment_type === 'partially_covered') {
      return { color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.2, weight: 2 };
    }
    return { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.1, weight: 2 };
  }

  return (
    <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {zones.map((zone) => {
          if (!zone.geometry || !zone.geometry.coordinates) return null;
          let coords = [];
          if (zone.geometry.type === 'Polygon') {
            coords = zone.geometry.coordinates.map(ring => ring.map(p => [p[1], p[0]]));
          } else if (zone.geometry.type === 'MultiPolygon') {
            coords = zone.geometry.coordinates.map(poly => poly.map(ring => ring.map(p => [p[1], p[0]])));
          }
          if (!coords.length) return null;
          return (
            <Polygon key={zone.campaign_zone_id} positions={coords} pathOptions={getZoneStyle(zone)}>
              <Popup>
                <strong>{zone.zone_name}</strong><br/>
                Copertura: {zone.effective_percent}%
              </Popup>
            </Polygon>
          );
        })}

        {/* Correzioni geometriche esatte (fonte canonica campaign_coverage_adjustments),
            sopra il tinteggio dell'intera zona: mostrano l'area realmente corretta
            dall'Admin, non l'intera zona. Solo correzioni attive, mai revocate. */}
        {adjustments.map((adj) => (
          <Polygon
            key={adj.id}
            positions={polygonGeoJsonToLatLngs(adj.geometry)}
            pathOptions={{
              color: ADJUSTMENT_COLORS[adj.adjustment_type] || '#8b5cf6',
              fillColor: ADJUSTMENT_COLORS[adj.adjustment_type] || '#8b5cf6',
              fillOpacity: adj.adjustment_type === 'inaccessible' ? 0.1 : 0.28,
              weight: 2,
              dashArray: adj.adjustment_type === 'inaccessible' ? '6 5' : undefined,
            }}
          />
        ))}

        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.82 }} />}
        {first && (
          <CircleMarker center={[first.lat, first.lng]} radius={7} pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.9 }}>
            <Popup>Partenza<br />{formatDateTime(first.recorded_at)}</Popup>
          </CircleMarker>
        )}
        {latest && (
          <CircleMarker center={[latest.lat, latest.lng]} radius={8} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
            <Popup>Ultimo punto<br />{formatDateTime(latest.recorded_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
      {(zones.length > 0 || adjustments.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '8px 4px 0', fontSize: 11, color: 'rgba(255,255,255,.5)', background: C.navyMid }}>
          <LegendItem color="#2563eb" label="Traccia GPS reale" line />
          <LegendItem color="#22c55e" label="Copertura GPS" />
          <LegendItem color="#8b5cf6" label="Correzione manuale Admin" />
          <LegendItem color="#f97316" label="Area non accessibile" dashed />
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, line = false, dashed = false }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 14, height: line ? 3 : 10, background: line ? color : `${color}44`,
        border: line ? 'none' : `1px solid ${color}`, borderStyle: dashed ? 'dashed' : 'solid', borderRadius: line ? 0 : 2,
      }} />
      {label}
    </span>
  );
}

function deriveCampaignStatus(sessions) {
  if (!sessions.length) return 'non iniziata';
  if (sessions.some((session) => session.status === 'started')) return 'in corso';
  if (sessions.some((session) => session.status === 'paused')) return 'pausa';
  if (sessions.every((session) => session.status === 'completed')) return 'completata';
  return sessions[0]?.status || 'non iniziata';
}

function sessionDurationMs(session) {
  if (!session.started_at) return 0;
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.ended_at || session.paused_at || Date.now()).getTime();
  return Math.max(0, end - start);
}

function Metric({ label, value, color }) {
  return (
    <div style={metricStyle}>
      <div style={{ fontFamily: F.serif, fontSize: 22, color: color || C.white, letterSpacing: '-.5px', wordBreak: 'break-word' }}>{value}</div>
      <div style={{ fontFamily: F.sans, fontSize: 11, color: 'rgba(255,255,255,.42)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function EmptyState({ text, tall = false }) {
  return (
    <div style={{
      padding: tall ? '60px 20px' : 20,
      minHeight: tall ? 200 : undefined,
      display: tall ? 'flex' : 'block',
      alignItems: tall ? 'center' : undefined,
      justifyContent: tall ? 'center' : undefined,
      textAlign: 'center',
      border: '1px dashed rgba(255,255,255,.14)',
      borderRadius: 12,
      background: 'rgba(255,255,255,.02)',
      color: 'rgba(255,255,255,.45)',
      fontFamily: F.sans,
      fontSize: 13,
    }}>{text}</div>
  );
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

const shellStyle = { minHeight: '100vh', background: C.navyMid, padding: '32px 24px 80px', color: C.white, fontFamily: F.sans };
const breadcrumbStyle = { display: 'inline-block', color: 'rgba(255,255,255,.45)', fontFamily: F.sans, fontSize: 12, textDecoration: 'none', marginBottom: 10 };
const titleStyle = { margin: 0, fontFamily: F.serif, fontSize: 32, color: C.white, letterSpacing: '-1px' };
const secondaryBtnStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' };
const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: 18 };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: C.green, fontWeight: 800, fontFamily: F.sans };
const metricStyle = { padding: 14, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 13 };
const rowStyle = { display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.06)', alignItems: 'center', flexWrap: 'wrap' };
const errorStyle = { padding: 12, borderRadius: 10, color: C.red, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.25)', marginBottom: 16, fontFamily: F.sans, fontSize: 13 };
