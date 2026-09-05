import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Polygon, Pane, Tooltip, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { calculateDistanceKm, groupGpsPointsBySession } from '../../lib/services/gps-api.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { getOwnedCustomerTracking } from '../../lib/services/customer-api.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';
import { listCoverageAdjustments, VERIFIED_COVERAGE_STYLE } from '../../lib/services/coverage-adjustments-api.js';
import { geoJsonPolygonToLeafletPositions } from '../../lib/geo/geoJsonToLeaflet.js';
import { createCustomerIssue, ISSUE_REASONS } from '../../lib/services/customer-issues-api.js';
import { deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, ZONE_LIVE_STATUS_LABELS, ZONE_LIVE_STATUS_COLORS } from '../../lib/geofence/geofenceEngine.js';
import { getMunicipalityCenterPoint } from '../../lib/geo/originRadialSelection.js';
import { C, F } from '../../lib/constants.js';

export function CampaignTracking({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [], campaign: null });
  const [adjustments, setAdjustments] = useState([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const zoneProgress = useZoneProgress({ campaignId });
  // Stesso hook condiviso di Admin/GpsMonitor.jsx: stesso confine reale del
  // comune (resolveMunicipalityBoundary, identico alla Driver App), nessuna
  // seconda logica per la vista Cliente.
  const { zoneRows, resolvedBoundaries } = useZoneBoundaries(campaignId);
  const mapZones = useMemo(() => (zoneProgress.zones || []).map((zone) => ({
    ...zone,
    geometry: resolvedBoundaries[zone.campaign_zone_id] || null,
  })), [zoneProgress.zones, resolvedBoundaries]);
  // SOLO le geometrie delle zone di QUESTA campagna (zoneRows), mai
  // Object.values(resolvedBoundaries) — che, non resettato fra campagne prima
  // del fix in useZoneBoundaries, poteva far entrare un confine di una
  // campagna vista in precedenza (root cause "Bergamo mostra Milano").
  const liveZones = useMemo(
    () => (zoneRows || [])
      .map((z) => resolvedBoundaries[z.id])
      .filter(Boolean)
      .map((geometry) => ({ kind: 'polygon', geometry })),
    [zoneRows, resolvedBoundaries],
  );
  const activeZoneName = zoneRows?.[0]?.zone_name || null;

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

  const status = deriveCampaignStatus(state.sessions, state.campaign);
  const activeMs = state.sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);
  // Distanza per campagna = somma delle distanze PER SESSIONE (mai su un array
  // misto di piu' operatori: il filtro qualita' confronta ogni punto col
  // precedente e un salto tra la traccia dell'operatore A e quella di B
  // sarebbe letto come "impossible_jump").
  const distanceKm = useMemo(() => {
    const groups = groupGpsPointsBySession(state.points);
    let km = 0;
    for (const groupPoints of groups.values()) km += calculateDistanceKm(groupPoints);
    return km;
  }, [state.points]);
  const latestPoint = state.points[state.points.length - 1] || null;
  // Stesso badge/soglia della Driver App e di Admin/GpsMonitor.jsx
  // (deriveLiveZoneStatus, geofenceEngine.js) — nessuna logica separata.
  const liveZoneStatus = useMemo(() => deriveLiveZoneStatus(liveZones, latestPoint?.lat, latestPoint?.lng), [liveZones, latestPoint]);
  const outsideDistanceKm = useMemo(() => {
    if (liveZoneStatus !== 'outside' || !latestPoint) return null;
    const meters = estimateDistanceToZoneBoundaryMeters(liveZones, latestPoint.lat, latestPoint.lng);
    return meters != null ? meters / 1000 : null;
  }, [liveZoneStatus, liveZones, latestPoint]);
  const mapRef = useRef(null);
  const handleGoToOperatorPosition = () => {
    if (latestPoint && mapRef.current) mapRef.current.setView([Number(latestPoint.lat), Number(latestPoint.lng)], Math.max(mapRef.current.getZoom(), 16));
  };
  const handleReturnToArea = () => {
    const geometry = liveZones[0]?.geometry;
    if (!geometry || !mapRef.current) return;
    try {
      const bounds = L.geoJSON(geometry).getBounds();
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: nessuna azione, nessun crash.
    }
  };
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
        .vp-nil-map-label {
          background: rgba(15, 23, 42, 0.88) !important;
          border: 1px solid rgba(232, 87, 26, 0.7) !important;
          color: #ffffff !important;
          font-family: inherit !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4) !important;
          pointer-events: none !important;
        }
        .vp-nil-map-label::before {
          display: none !important;
        }
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
          <Metric
            label="Copertura verificata"
            value={state.finalCoverage?.final_operational_coverage_pct != null
              ? `${state.finalCoverage.final_operational_coverage_pct}%`
              : (zoneProgress.zones?.[0]?.effective_percent != null && zoneProgress.zones[0].effective_percent > 0
                ? `${zoneProgress.zones[0].effective_percent}%`
                : (state.points.length > 0 ? 'In calcolo...' : 'Dato non disponibile'))}
            color={C.green}
          />
          <Metric label="Punti GPS" value={state.points.length} color={C.blue} />
          <Metric label="Tempo registrato" value={formatDuration(activeMs)} color={C.orange} />
          <Metric label="Distanza" value={`${distanceKm.toFixed(2)} km`} color={C.orange} />
          <Metric label="Ultimo ping" value={formatDateTime(latestPing)} color={C.purple} />
          <Metric label="Connessione" value={connectionStatus === 'online' ? 'Online' : 'Offline'} color={connectionStatus === 'online' ? C.green : 'rgba(255,255,255,.45)'} />
          <Metric label="Foto approvate" value={state.photos.length} color={C.blue} />
        </div>

        {state.campaign && (
          <AuthorizedZoneProgress
            zoneProgress={zoneProgress}
            finalCoverage={state.finalCoverage}
            selectedZoneId={selectedZoneId}
            onSelectZone={(zoneId) => setSelectedZoneId((curr) => (curr === zoneId ? null : zoneId))}
          />
        )}

        <section style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <p style={eyebrowStyle}>Percorso distribuzione</p>
              {activeZoneName && <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.white, fontFamily: F.sans }}>{activeZoneName}</p>}
            </div>
            <LiveZoneStatusBadge status={liveZoneStatus} distanceKm={outsideDistanceKm} />
          </div>
          {state.points.length > 0 || zoneProgress.zones.length > 0 || state.finalCoverage?.final_coverage_geometry ? (
            <>
              <TrackingMap
                zones={mapZones}
                points={state.points}
                latestPoint={latestPoint}
                finalCoverage={state.finalCoverage}
                mapRef={mapRef}
                selectedZoneId={selectedZoneId}
                onSelectZone={(zoneId) => setSelectedZoneId((curr) => (curr === zoneId ? null : zoneId))}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={handleReturnToArea} disabled={!liveZones[0]?.geometry} style={mapActionButtonStyle(!liveZones[0]?.geometry)}>⟲ Torna all'area</button>
              </div>
            </>
          ) : (
            <EmptyState text={state.loading ? 'Caricamento copertura…' : 'La copertura sarà disponibile quando inizierà la distribuzione.'} tall />
          )}
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgba(255,255,255,.45)', fontFamily: F.sans }}>
            Copertura verificata dal team operativo.
          </p>
        </section>

        <CustomerIssuesCard
          campaignId={campaignId}
          issues={state.issues || []}
          zones={zoneRows}
          onCreated={() => setRefreshNonce((n) => n + 1)}
        />

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

function AuthorizedZoneProgress({ zoneProgress, finalCoverage, selectedZoneId = null, onSelectZone = null }) {
  // Sincronizzazione source-of-truth: se calculate_campaign_final_coverage ha
  // una percentuale calcolata, viene usata in caso di mancata sync della cache zona
  const syncedZones = useMemo(() => {
    const rawZones = zoneProgress.zones || [];
    if (!rawZones.length) return [];
    if (finalCoverage?.final_operational_coverage_pct != null) {
      return rawZones.map((z) => ({
        ...z,
        effective_percent: z.effective_percent > 0 ? z.effective_percent : finalCoverage.final_operational_coverage_pct,
      }));
    }
    return rawZones;
  }, [zoneProgress.zones, finalCoverage]);

  return (
    <div style={{ marginBottom: 16 }}>
      <ZoneProgressPanel
        zones={syncedZones}
        loading={zoneProgress.loading}
        refreshing={zoneProgress.refreshing}
        error={zoneProgress.error}
        notice={zoneProgress.notice}
        selectedZoneId={selectedZoneId}
        onSelectZone={onSelectZone}
        onRefresh={zoneProgress.refresh}
        theme="dark"
      />
    </div>
  );
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

// Il Cliente vede i POLIGONI NIL / ZONE, la COPERTURA VERIFICATA finale
// (calculate_campaign_final_coverage.final_coverage_geometry) e i PUNTI GPS
// REALI (singoli dots, MAI linee continue o percorsi artificiali).
function TrackingMap({
  zones = [],
  points = [],
  latestPoint = null,
  finalCoverage = null,
  mapRef,
  selectedZoneId = null,
  onSelectZone = null,
}) {
  const selectedZone = useMemo(() => zones.find((z) => z.campaign_zone_id === selectedZoneId), [zones, selectedZoneId]);
  const zoneWithGeometry = useMemo(() => zones.find((zone) => zone.geometry), [zones]);
  const activeFocusGeometry = useMemo(() => {
    if (selectedZone?.geometry) return selectedZone.geometry;
    return zoneWithGeometry?.geometry || null;
  }, [selectedZone, zoneWithGeometry]);

  const coveragePositions = useMemo(
    () => (finalCoverage?.final_coverage_geometry
      ? geoJsonPolygonToLeafletPositions(finalCoverage.final_coverage_geometry)
      : []),
    [finalCoverage],
  );

  // Punti GPS validi (singoli dots reali per mostrare il passaggio effettivo)
  const validGpsPoints = useMemo(() => {
    return (points || [])
      .filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Number(p.lat) !== 0)
      .map((p) => ({
        id: p.id,
        lat: Number(p.lat),
        lng: Number(p.lng),
        recorded_at: p.recorded_at || p.created_at,
      }));
  }, [points]);

  const center = useMemo(() => {
    if (selectedZone?.geometry) {
      const c = getMunicipalityCenterPoint(selectedZone.geometry);
      if (c) return [c.lat, c.lng];
    }
    if (latestPoint && Number.isFinite(Number(latestPoint.lat))) {
      return [Number(latestPoint.lat), Number(latestPoint.lng)];
    }
    if (zoneWithGeometry) {
      const c = getMunicipalityCenterPoint(zoneWithGeometry.geometry);
      if (c) return [c.lat, c.lng];
      const coord = zoneWithGeometry.geometry.type === 'MultiPolygon'
        ? zoneWithGeometry.geometry.coordinates?.[0]?.[0]?.[0]
        : zoneWithGeometry.geometry.coordinates?.[0]?.[0];
      if (coord) return [coord[1], coord[0]];
    }
    if (validGpsPoints.length > 0) {
      return [validGpsPoints[0].lat, validGpsPoints[0].lng];
    }
    return [45.4642, 9.1900];
  }, [selectedZone, zoneWithGeometry, latestPoint, validGpsPoints]);

  return (
    <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer ref={mapRef} center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Layer Panes configurati con z-index espliciti */}
        <Pane name="nilPane" style={{ zIndex: 400 }} />
        <Pane name="coveragePane" style={{ zIndex: 450 }} />
        <Pane name="gpsPointsPane" style={{ zIndex: 500 }} />
        <Pane name="gpsLivePane" style={{ zIndex: 550 }} />

        {activeFocusGeometry && <FitToZoneBounds geometry={activeFocusGeometry} />}

        {/* Poligoni NIL / Zone individuali */}
        {zones.map((zone) => {
          if (!zone.geometry || !zone.geometry.coordinates) return null;
          let coords = [];
          if (zone.geometry.type === 'Polygon') {
            coords = zone.geometry.coordinates.map((ring) => ring.map((p) => [p[1], p[0]]));
          } else if (zone.geometry.type === 'MultiPolygon') {
            coords = zone.geometry.coordinates.map((poly) => poly.map((ring) => ring.map((p) => [p[1], p[0]])));
          }
          if (!coords.length) return null;

          const isSelected = selectedZoneId === zone.campaign_zone_id;
          const pathOptions = isSelected
            ? {
                color: '#e8571a',
                weight: 3.5,
                fillColor: '#e8571a',
                fillOpacity: 0.35,
              }
            : {
                color: '#e8571a',
                weight: 2,
                fillColor: '#e8571a',
                fillOpacity: 0.12,
              };

          return (
            <Polygon
              key={zone.campaign_zone_id}
              positions={coords}
              pane="nilPane"
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => onSelectZone?.(isSelected ? null : zone.campaign_zone_id),
              }}
            >
              <Tooltip permanent direction="center" className="vp-nil-map-label">
                <span>{zone.zone_name}</span>
              </Tooltip>
              <Popup>
                <div style={{ fontFamily: F.sans, fontSize: 13, minWidth: 160 }}>
                  <strong style={{ fontSize: 14, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                    {zone.zone_name}
                  </strong>
                  {zone.address_label && (
                    <p style={{ margin: '2px 0 6px', color: '#64748b', fontSize: 12 }}>
                      {zone.address_label}
                    </p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 4 }}>
                    <span style={{ color: '#334155' }}>Copertura:</span>
                    <strong style={{ color: '#16a34a' }}>
                      {zone.effective_percent != null ? `${Number(zone.effective_percent).toFixed(1)}%` : '0%'}
                    </strong>
                  </div>
                  {zone.target_quantity != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#64748b', marginTop: 3 }}>
                      <span>Volantini:</span>
                      <strong>{zone.completed_quantity || 0} / {zone.target_quantity}</strong>
                    </div>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* COPERTURA VERIFICATA — geometria unica */}
        {coveragePositions.length > 0 && (
          <Polygon positions={coveragePositions} pane="coveragePane" pathOptions={VERIFIED_COVERAGE_STYLE}>
            <Popup>
              Copertura verificata{finalCoverage?.final_operational_coverage_pct != null
                ? `: ${finalCoverage.final_operational_coverage_pct}%` : ''}
            </Popup>
          </Polygon>
        )}

        {/* PUNTI GPS REALI: singoli dots che mostrano i passaggi effettivi (NIENTE polyline) */}
        {validGpsPoints.map((pt, idx) => (
          <CircleMarker
            key={pt.id || `pt-${idx}`}
            center={[pt.lat, pt.lng]}
            radius={3}
            pane="gpsPointsPane"
            pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.75, weight: 1 }}
          >
            <Popup>Punto GPS rilevato<br />{formatDateTime(pt.recorded_at)}</Popup>
          </CircleMarker>
        ))}

        {/* Ultima posizione rilevata */}
        {latestPoint && (
          <CircleMarker
            center={[Number(latestPoint.lat), Number(latestPoint.lng)]}
            radius={7}
            pane="gpsLivePane"
            pathOptions={{ color: '#10b981', fillColor: '#34d399', fillOpacity: 0.95, weight: 2 }}
          >
            <Popup>Ultima posizione registrata<br />{formatDateTime(latestPoint.recorded_at || latestPoint.created_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,.7)', background: C.navyMid }}>
        <LegendItem color="#e8571a" label="Confini Zone / NIL" />
        <LegendItem color={VERIFIED_COVERAGE_STYLE.color} label="Copertura verificata" />
        <LegendItem color="#3b82f6" label="Punti GPS rilevati" />
        <LegendItem color="#34d399" label="Ultima posizione" />
      </div>
    </div>
  );
}

// Stato reale mostrato al Cliente (Fase 3/7 del ticket: "NON mentire al
// cliente" quando nessun driver e' assegnato). Wording dedicato al Cliente,
// distinto da ISSUE_STATUS_LABELS (usato da Driver/Admin per lo stesso
// status con un pubblico diverso) — nessuna duplicazione di dato, solo di
// presentazione.
function customerIssueStatusLabel(issue) {
  if (issue.status === 'resolved') return 'Risolta';
  if (issue.status === 'not_resolvable') return 'Non risolvibile';
  if (issue.status === 'in_progress') return 'In verifica';
  if (issue.status === 'seen') return 'Operatore informato';
  if (issue.routed_to !== 'driver') return 'In attesa di assegnazione operatore';
  return 'In attesa di presa visione';
}

function CustomerIssuesCard({ campaignId, issues = [], zones = [], onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ zoneId: '', street: '', houseNumber: '', reason: 'non_ricevuto', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.street.trim()) { setError('La via è obbligatoria.'); return; }
    setBusy(true); setError(null); setOk(null);
    try {
      const selectedZone = zones.find((z) => z.id === form.zoneId);
      const created = await createCustomerIssue({
        campaignId,
        municipality: selectedZone?.zone_name || 'Zona non specificata',
        street: form.street.trim(),
        houseNumber: form.houseNumber.trim() || null,
        zoneId: form.zoneId || null,
        reason: form.reason,
        notes: form.notes.trim() || null,
      });
      setOk(created);
      setForm({ zoneId: '', street: '', houseNumber: '', reason: 'non_ricevuto', notes: '' });
      setOpen(false);
      onCreated?.();
    } catch (err) {
      setError(err?.message || 'Invio segnalazione non riuscito.');
    } finally {
      setBusy(false);
    }
  };

  // §9 notifica in-app (nessun push/SMS/WhatsApp): quando una segnalazione
  // e' stata verificata dall'operatore, il cliente vede subito l'indicatore.
  const resolvedCount = issues.filter((i) => i.status === 'resolved').length;

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={eyebrowStyle}>Segnalazioni</p>
          {resolvedCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.04em', textTransform: 'uppercase', color: C.navy, background: C.green, borderRadius: 999, padding: '3px 8px', fontFamily: F.sans }}>
              Verifica completata{resolvedCount > 1 ? ` (${resolvedCount})` : ''}
            </span>
          )}
        </div>
        <button type="button" onClick={() => { setOpen((v) => !v); setOk(null); }} style={mapActionButtonStyle(false)}>
          {open ? 'Chiudi' : 'Segnala un problema'}
        </button>
      </div>
      {ok && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: C.green, fontFamily: F.sans }}>
          Segnalazione inviata. Stato: {customerIssueStatusLabel(ok)}.
        </p>
      )}
      {open && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <select value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })} style={issueInputStyle}>
            <option value="">Zona non specificata (verifica manuale Admin)</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.zone_name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Via (es. Via Roma)" value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })} style={{ ...issueInputStyle, flex: 2 }} />
            <input placeholder="Civico" value={form.houseNumber}
              onChange={(e) => setForm({ ...form, houseNumber: e.target.value })} style={{ ...issueInputStyle, flex: 1 }} />
          </div>
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={issueInputStyle}>
            {ISSUE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <textarea placeholder="Note (facoltative)" rows={2} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} style={issueInputStyle} />
          {error && <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', fontFamily: F.sans }}>{error}</p>}
          <button type="submit" disabled={busy} style={mapActionButtonStyle(busy)}>{busy ? 'Invio…' : 'Invia segnalazione'}</button>
        </form>
      )}
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {issues.length === 0 && <EmptyState text="Nessuna segnalazione." />}
        {issues.map((issue) => (
          <div key={issue.id} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ color: C.white, fontFamily: F.sans, fontSize: 13 }}>
                {issue.municipality} — {issue.street}{issue.house_number ? ` ${issue.house_number}` : ''}
              </strong>
              <span style={{ fontSize: 11, fontWeight: 800, color: (issue.status === 'resolved') ? C.green : 'rgba(255,255,255,.55)', fontFamily: F.sans }}>
                {customerIssueStatusLabel(issue)}
              </span>
            </div>
            {issue.status === 'resolved' && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,.65)', fontFamily: F.sans }}>
                <strong style={{ color: C.green }}>Verifica completata</strong> · {formatDateTime(issue.resolved_at)}<br />
                {issue.resolution_note && <span>“{issue.resolution_note}”<br /></span>}
                {(issue.photos || []).filter((p) => p.signedUrl).map((p) => (
                  <img key={p.id} src={p.signedUrl} alt="Foto verifica"
                    style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid rgba(255,255,255,.08)' }} />
                ))}
                {(issue.photos || []).some((p) => p.lat != null) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Foto GPS verificata.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const issueInputStyle = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 8, color: '#fff', padding: '8px 10px', fontFamily: 'inherit', fontSize: 13 };

// Stesso pattern di Admin/GpsMonitor.jsx e Driver/DriverWorkMapPage.jsx: il
// "center" di MapContainer fissa solo la posizione INIZIALE al mount.
function FitToZoneBounds({ geometry }) {
  const map = useMap();
  useEffect(() => {
    if (!geometry) return;
    try {
      const bounds = L.geoJSON(geometry).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: la mappa resta dov'e', nessun crash.
    }
  }, [geometry, map]);
  return null;
}

// Stesso badge di Admin/GpsMonitor.jsx (stessi ZONE_LIVE_STATUS_LABELS/COLORS
// da geofenceEngine.js, import diretto): allineamento richiesto tra Cliente e
// Driver App, mai una seconda logica per il desktop.
function LiveZoneStatusBadge({ status, distanceKm }) {
  const color = ZONE_LIVE_STATUS_COLORS[status] || ZONE_LIVE_STATUS_COLORS.zone_unavailable;
  const label = ZONE_LIVE_STATUS_LABELS[status] || ZONE_LIVE_STATUS_LABELS.zone_unavailable;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 900, color, borderColor: `${color}44`, background: `${color}14` }}>
        {label}
      </span>
      {status === 'outside' && distanceKm != null && (
        <span style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700 }}>
          Operatore fuori area assegnata — a {distanceKm.toFixed(1)} km dalla zona
        </span>
      )}
    </div>
  );
}

function mapActionButtonStyle(disabled) {
  return {
    border: '1px solid rgba(255,255,255,.14)',
    background: disabled ? 'rgba(255,255,255,.04)' : 'rgba(232,87,26,.16)',
    color: disabled ? 'rgba(255,255,255,.35)' : C.white,
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: F.sans,
  };
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

const CAMPAIGN_STATUS_LABELS = {
  in_progress: 'in corso', completed: 'completata', cancelled: 'annullata',
  canceled: 'annullata', archived: 'archiviata', draft: 'bozza', pending: 'in attesa',
};
// Fonte di verita' per lo stato campagna = campaigns.status (DB), non lo stato
// delle sessioni. Fallback alla derivazione da sessioni solo se il record
// campagna non porta lo stato.
function deriveCampaignStatus(sessions, campaignRecord) {
  const dbStatus = campaignRecord?.status || campaignRecord?.stato || campaignRecord?.stato_campagna;
  if (dbStatus) return CAMPAIGN_STATUS_LABELS[dbStatus] || String(dbStatus).replace(/_/g, ' ');
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
