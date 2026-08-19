import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Polygon } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { createProofPhotoSignedUrl, getCampaignGpsPoints, getCampaignGpsSessions, getCampaignProofPhotos, getCampaignRecord, calculateGpsCoverage } from '../../lib/services/gps-api.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';
import { normalizeZonesFromCampaign, summarizeGeofencePoints, deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, ZONE_LIVE_STATUS_LABELS, ZONE_LIVE_STATUS_COLORS } from '../../lib/geofence/geofenceEngine.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { geoJsonApproxCentroid } from '../../lib/geo/pointInPolygon.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { resolveMunicipalityBoundary } from '../../lib/geo/resolveMunicipalityBoundary.js';
import { AdminLayout } from './AdminLayout.jsx';
import { CoverageAdjustmentPanel } from '../../components/admin/CoverageAdjustmentPanel.jsx';
import { ZoneCoverageMap } from '../../components/admin/ZoneCoverageMap.jsx';
import { FitToZoneBounds } from '../../components/map/FitToZoneBounds.jsx';

export function GpsMonitor({ campaignId, onNav }) {
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], photos: [], activeSession: null, campaign: null });
  const [coverage, setCoverage] = useState(null);
  const zoneProgress = useZoneProgress({ campaignId, includeHistory: true });
  // Confine reale del comune (stesso hook condiviso con Cliente/CampaignTracking.jsx
  // e stesso resolveMunicipalityBoundary della Driver App) — MAI un cerchio
  // inventato quando manca il poligono. Persistito su
  // campaign_zones.polygon_geojson (best-effort, dentro l'hook) cosi' anche
  // gps_calculate_zone_coverage smette di restituire zone_geometry_missing.
  const { zoneRows, resolvedBoundaries } = useZoneBoundaries(campaignId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sessions = await getCampaignGpsSessions(campaignId);
        const activeSession = getLatestTrackableSession(sessions);
        const [points, photos, campaign] = await Promise.all([
          activeSession ? getCampaignGpsPoints(campaignId, { sessionId: activeSession.id }) : Promise.resolve([]),
          getCampaignProofPhotos(campaignId),
          getCampaignRecord(campaignId).catch(() => null),
        ]);
        const photosWithUrls = await hydratePhotoUrls(photos);
        if (!cancelled) setState({ loading: false, error: null, points, sessions, photos: photosWithUrls, activeSession, campaign });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento GPS.' }));
      }
    }
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId]);

  // Zone per la mappa: percentuale/adjustment reali da zoneProgress, geometria
  // reale (se risolta) agganciata per campaign_zone_id. Una zona senza
  // geometria risolta resta semplicemente esclusa dal disegno/centro mappa,
  // mai sostituita da un cerchio.
  const mapZones = useMemo(() => (zoneProgress.zones || []).map((zone) => ({
    ...zone,
    geometry: resolvedBoundaries[zone.campaign_zone_id] || null,
  })), [zoneProgress.zones, resolvedBoundaries]);

  // Zona "attiva" per la Live Map: su una campagna multi-comune (es. Varese,
  // Barasso, Bardello..., Gavirate, ...) leggere semplicemente zoneRows[0] o
  // "la prima zona con geometria gia' risolta" e' indeterministico — root
  // cause del bug "la mappa mostra una zona diversa da quella attesa": senza
  // ORDER BY l'ordine DB e' arbitrario, e le geometrie si risolvono in
  // parallelo (resolveMunicipalityBoundary) quindi "la prima risolta" cambia
  // a ogni refresh. Selezione esplicita e deterministica:
  //   1) la zona della sessione GPS realmente attiva (delivery_sessions.campaign_zone_id)
  //   2) altrimenti la prima zona per priority/zone_name (ordine stabile, da useZoneBoundaries)
  // L'Admin puo' sempre cambiarla a mano dai chip sotto la mappa.
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  useEffect(() => {
    if (selectedZoneId && zoneRows.some((z) => z.id === selectedZoneId)) return;
    const fallbackId = state.activeSession?.campaign_zone_id || zoneRows[0]?.id || null;
    if (fallbackId) setSelectedZoneId(fallbackId);
  }, [zoneRows, state.activeSession?.campaign_zone_id, selectedZoneId]);

  const selectedZoneRow = zoneRows.find((z) => z.id === selectedZoneId) || null;
  const selectedZoneGeometry = selectedZoneId ? resolvedBoundaries[selectedZoneId] || null : null;
  const activeZoneName = selectedZoneRow?.zone_name || null;

  // Riga di zoneProgress per la zona selezionata (ticket A): stesso dato
  // gia' letto da ZoneProgressPanel/AUTOMATICO, non un secondo fetch.
  const selectedAutoZoneProgress = selectedZoneId
    ? zoneProgress.zones.find((z) => z.campaign_zone_id === selectedZoneId) || null
    : null;
  // "GPS reale" nell'esempio del ticket riusa la STESSA copertura GPS gia'
  // calcolata e mostrata nel tab GPS REALE (coverage.coverage_percent) — MAI
  // un nuovo calcolo per-zona: quello richiederebbe toccare il motore GPS,
  // esplicitamente vietato da questo ticket.
  const gpsCoveragePercentLabel = coverage?.calculation_status === 'ready' ? `${coverage.coverage_percent}%` : 'n/d';
  // P1 (KPI multi-operatore): conteggio best-effort da dati gia' caricati
  // (state.sessions), MAI una nuova query al motore GPS. "Operatore GPS" qui
  // = driver_id distinto tra le sessioni della zona selezionata — un proxy
  // ragionevole, non una verifica di identita' reale.
  const gpsOperatorCount = new Set(
    state.sessions
      .filter((s) => !selectedZoneId || s.campaign_zone_id === selectedZoneId)
      .map((s) => s.driver_id)
      .filter(Boolean),
  ).size;
  function formatAdminPercent(zoneRow) {
    const value = zoneRow.manual_override_enabled ? zoneRow.manual_percent : zoneRow.automatic_percent;
    return value != null ? `${Number(value).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%` : 'n/d';
  }
  function formatFinalPercent(zoneRow) {
    return zoneRow.effective_percent != null
      ? `${Number(zoneRow.effective_percent).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`
      : 'n/d';
  }

  // P0 (MANUALE ADMIN): campaign_zones.center_lat/center_lng sono spesso 0/0
  // (mai popolati da Step4 per le zone "comune completo") — CoverageAdjustmentPanel
  // fa `zones[0]?.center_lat ? [...] : [45.4642, 9.19]` per il centro
  // iniziale della SUA mappa, e 0 e' falsy in JS: la mappa si apriva su
  // Milano invece che sulla zona selezionata, senza alcun errore visibile —
  // l'Admin si trovava davanti a una mappa "vuota" della zona sbagliata e
  // il click sembrava "non fare nulla" (i vertici finivano su Milano, mai
  // scrollati in vista). Usiamo il centroide del confine reale gia' risolto
  // (stesso identico poligono di selectedZoneGeometry, nessun nuovo fetch)
  // quando disponibile, altrimenti le colonne DB come fallback residuo.
  const zoneCentroid = selectedZoneGeometry ? geoJsonApproxCentroid(selectedZoneGeometry) : null;
  const manualPanelZoneCenter = zoneCentroid
    ? { center_lat: zoneCentroid.lat, center_lng: zoneCentroid.lng }
    : { center_lat: selectedZoneRow?.center_lat, center_lng: selectedZoneRow?.center_lng };

  // Stessa forma normalizzata { kind, geometry } richiesta da
  // deriveLiveZoneStatus/estimateDistanceToZoneBoundaryMeters — le funzioni
  // pure gia' usate dal Driver (DriverZoneMap.jsx). Dentro/fuori area e
  // fitBounds seguono la SOLA zona selezionata, non tutte le zone della
  // campagna insieme — coerente con "select Barasso -> boundary Barasso".
  const liveZones = useMemo(
    () => (selectedZoneGeometry ? [{ kind: 'polygon', geometry: selectedZoneGeometry }] : []),
    [selectedZoneGeometry],
  );
  const mapRef = useRef(null);

  // MAPPA OPERATIVA: 3 modalita' esplicite, mai confuse. GPS REALE resta
  // sempre sola lettura (nessun input scrive qui). AUTOMATICO ADMIN e
  // MANUALE ADMIN riusano i due sistemi di correzione GIA' esistenti
  // (ZoneProgressPanel/admin_set_zone_manual_progress per percentuale,
  // CoverageAdjustmentPanel/admin_create_coverage_adjustment per geometria
  // disegnata) — nessun terzo sistema creato qui, solo la stessa UI
  // riorganizzata in tab.
  const [mapMode, setMapMode] = useState('gps');

  // Ricerca comune libera (sezione 3 del ticket): stesso resolveMunicipalityBoundary
  // del Driver, MAI persistito e MAI legato a campaign_zones — serve solo per
  // esplorare/verificare il confine reale di un comune qualsiasi sulla mappa,
  // distinto dalla risoluzione automatica per-zona-campagna gia' fatta da
  // useZoneBoundaries (quella SI persiste su polygon_geojson). Due scopi
  // diversi dello stesso helper condiviso, non due implementazioni.
  const [zoneSearchQuery, setZoneSearchQuery] = useState('');
  const [zoneSearchState, setZoneSearchState] = useState({ loading: false, error: null, result: null });
  const handleSearchZone = async () => {
    const query = zoneSearchQuery.trim();
    if (!query) return;
    setZoneSearchState({ loading: true, error: null, result: null });
    try {
      const geometry = await resolveMunicipalityBoundary(query);
      if (!geometry) {
        setZoneSearchState({ loading: false, error: `Confine non trovato per "${query}".`, result: null });
        return;
      }
      setZoneSearchState({ loading: false, error: null, result: { name: query, geometry } });
      requestAnimationFrame(() => {
        if (!mapRef.current) return;
        try {
          const bounds = L.geoJSON(geometry).getBounds();
          if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
        } catch {
          // geometria non valida per Leaflet: risultato comunque mostrato in lista.
        }
      });
    } catch {
      setZoneSearchState({ loading: false, error: 'Ricerca non riuscita (rete/Nominatim non disponibile).', result: null });
    }
  };

  const handleGoToOperatorPosition = () => {
    if (latest && mapRef.current) mapRef.current.setView([Number(latest.lat), Number(latest.lng)], Math.max(mapRef.current.getZoom(), 16));
  };
  const handleReturnToArea = () => {
    if (!selectedZoneGeometry || !mapRef.current) return;
    try {
      const bounds = L.geoJSON(selectedZoneGeometry).getBounds();
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    } catch {
      // geometria non valida per Leaflet: nessuna azione, nessun crash.
    }
  };

  const handleRecalculateCoverage = () => {
    if (state.activeSession?.id) {
      setCoverage(prev => ({ ...prev, calculating: true }));
      calculateGpsCoverage(state.activeSession.id)
        .then(res => setCoverage(res))
        .catch(err => console.error('Error fetching coverage', err));
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (state.activeSession?.id) {
      calculateGpsCoverage(state.activeSession.id)
        .then(res => { if (!cancelled) setCoverage(res); })
        .catch(err => { console.error('Error fetching coverage', err); });
    }
    return () => { cancelled = true; };
  }, [state.activeSession?.id, state.points.length, state.activeSession?.status]);

  const geofenceZones = useMemo(() => normalizeZonesFromCampaign(state.campaign), [state.campaign]);
  const geofence = useMemo(() => summarizeGeofencePoints(state.points, geofenceZones), [state.points, geofenceZones]);

  const status = deriveCampaignStatus(state.sessions);
  const activeMs = state.sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);
  const latest = state.points[state.points.length - 1] || null;
  // Stato dentro/fuori istantaneo sull'ultimo punto — stessa funzione pura del
  // Driver (deriveLiveZoneStatus), niente calcolo distanza/contenimento
  // duplicato qui. Distinto dal badge "Geofence" esistente sotto (quello resta
  // il debounce ufficiale su summarizeGeofencePoints, invariato).
  const liveZoneStatus = useMemo(() => deriveLiveZoneStatus(liveZones, latest?.lat, latest?.lng), [liveZones, latest]);
  const outsideDistanceKm = useMemo(() => {
    if (liveZoneStatus !== 'outside' || !latest) return null;
    const meters = estimateDistanceToZoneBoundaryMeters(liveZones, latest.lat, latest.lng);
    return meters != null ? meters / 1000 : null;
  }, [liveZoneStatus, liveZones, latest]);
  const gpsValidPointCount = useMemo(() => filterValidGpsPoints(state.points).valid.length, [state.points]);
  const latestActivityAt = state.activeSession?.updated_at || latest?.created_at || latest?.recorded_at || state.activeSession?.started_at || null;
  const driverOnline = latestActivityAt ? Date.now() - new Date(latestActivityAt).getTime() < 45000 : false;
  const activeSessionLabel = state.activeSession
    ? `${state.activeSession.status} · ${formatDateTime(state.activeSession.started_at || state.activeSession.created_at)}`
    : 'nessuna sessione';

  const breadcrumbs = [
    { label: "Dashboard", href: "/admin" },
    { label: "Campagne", href: "/admin" },
    { label: `Campagna ${campaignId}` }
  ];

  return (
    <AdminLayout title="Admin GPS Monitor" subtitle={`Campagna ${campaignId}`} breadcrumbs={breadcrumbs} onNav={onNav}>
      {state.error && <div style={errorStyle}>{state.error}</div>}
      <div style={metricGridStyle}>
        <Metric label="Stato campagna" value={status} />
        <Metric label="Sessioni" value={state.sessions.length} />
        <Metric label="Punti GPS" value={state.points.length} />
        <Metric label="Sessione mappa" value={activeSessionLabel} />
        <Metric label="Driver" value={driverOnline ? 'online' : 'offline'} />
        <Metric label="Tempo attivo" value={formatDuration(activeMs)} />
        <Metric label="Geofence" value={<GeofenceBadge status={geofence.status} />} />
        {coverage && coverage.calculation_status === 'ready' && (
          <Metric 
            label="Copertura calcolata" 
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {coverage.coverage_percent}%
                <button 
                  onClick={handleRecalculateCoverage}
                  disabled={coverage.calculating}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
                  title="Ricalcola manualmente"
                >
                  {coverage.calculating ? '...' : 'Ricalcola'}
                </button>
              </div>
            } 
          />
        )}
      </div>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Mappa operativa — Copertura GPS / Admin</p>

        {/* 3 modalita' esplicite (sezione 1/15 del ticket): GPS REALE resta
            sempre sola lettura, nessun form/input scrive nulla in quella
            tab. AUTOMATICO ADMIN e MANUALE ADMIN riusano i due sistemi di
            correzione gia' esistenti (vedi commento su mapMode sopra). */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {[
            { value: 'gps', label: 'GPS REALE' },
            { value: 'auto', label: 'AUTOMATICO ADMIN' },
            { value: 'manual', label: 'MANUALE ADMIN' },
          ].map((tab) => (
            <button key={tab.value} onClick={() => setMapMode(tab.value)} style={modeTabStyle(mapMode === tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            value={zoneSearchQuery}
            onChange={(e) => setZoneSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchZone(); }}
            placeholder="Cerca comune (es. Cormano, Monza, Varese...)"
            style={zoneSearchInputStyle}
          />
          <button onClick={handleSearchZone} disabled={zoneSearchState.loading || !zoneSearchQuery.trim()} style={mapActionButtonStyle(zoneSearchState.loading || !zoneSearchQuery.trim())}>
            {zoneSearchState.loading ? 'Ricerca...' : '🔍 Cerca'}
          </button>
          {zoneSearchState.result && <span style={{ fontSize: 12, color: '#0f766e', fontWeight: 800 }}>Confine trovato: {zoneSearchState.result.name}</span>}
          {zoneSearchState.error && <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 800 }}>{zoneSearchState.error}</span>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            {activeZoneName && <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#17211f' }}>{activeZoneName}</p>}
            {mapMode === 'gps' && <p style={{ margin: '2px 0 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b', fontWeight: 900 }}>Fonte: GPS DRIVER — sola lettura</p>}
          </div>
          <LiveZoneStatusBadge status={liveZoneStatus} distanceKm={outsideDistanceKm} />
        </div>

        {zoneRows.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {zoneRows.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                style={zoneChipStyle(zone.id === selectedZoneId)}
              >
                {zone.zone_name}
              </button>
            ))}
          </div>
        )}

        {state.points.length > 0 || zoneProgress.zones.length > 0 ? (
          <GpsMap points={state.points} latest={latest} zones={mapZones} selectedZoneGeometry={selectedZoneGeometry} searchGeometry={zoneSearchState.result?.geometry || null} mapRef={mapRef} />
        ) : (
          <EmptyState text={state.loading ? 'Caricamento tracking GPS...' : 'Nessun tracking GPS disponibile'} />
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={handleGoToOperatorPosition} disabled={!latest} style={mapActionButtonStyle(!latest)}>
            📍 Posizione operatore
          </button>
          <button onClick={handleReturnToArea} disabled={!selectedZoneGeometry} style={mapActionButtonStyle(!selectedZoneGeometry)}>
            ⟲ Torna all'area
          </button>
        </div>

        {mapMode === 'gps' && (
          <div style={gpsReadOnlySummaryStyle}>
            <MiniStat label="Copertura GPS" value={coverage?.calculation_status === 'ready' ? `${coverage.coverage_percent}%` : 'n/d'} />
            <MiniStat label="Punti GPS validi" value={gpsValidPointCount} />
            <MiniStat label="Punti GPS esclusi" value={state.points.length - gpsValidPointCount} />
          </div>
        )}

        {mapMode === 'auto' && (
          <div style={{ marginTop: 16 }}>
            {/* AUTOMATICO ADMIN = ZoneProgressPanel gia' esistente
                (admin_set_zone_manual_progress / admin_clear_zone_manual_progress,
                audit gia' presente in campaign_zone_progress_history), filtrato
                alla SOLA zona selezionata: stessa identica logica, non una
                riscrittura — "Comune: [Varese]" del ticket e' proprio questo filtro. */}
            <ZoneProgressPanel
              zones={selectedZoneId ? zoneProgress.zones.filter((z) => z.campaign_zone_id === selectedZoneId) : zoneProgress.zones}
              history={zoneProgress.history}
              loading={zoneProgress.loading}
              refreshing={zoneProgress.refreshing}
              error={zoneProgress.error}
              notice={zoneProgress.notice}
              isAdmin
              mutatingZoneId={zoneProgress.mutatingZoneId}
              onRefresh={zoneProgress.refresh}
              onSetManual={zoneProgress.setManualProgress}
              onClearManual={zoneProgress.clearManualProgress}
            />
            {/* Ticket A: AUTOMATICO ADMIN aveva solo il controllo percentuale,
                nessuna mappa. Stesso boundary di GPS REALE/MANUALE
                (selectedZoneGeometry, nessun secondo resolver), stessa
                traccia GPS reale gia' caricata (state.points, MAI generata
                qui) + un riempimento proporzionale del confine come
                indicatore visivo della percentuale Admin (ticket G: nessuna
                linea GPS finta). */}
            {selectedAutoZoneProgress && (
              <div style={{ marginTop: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                  {activeZoneName ? `${activeZoneName} — ` : ''}
                  GPS reale: {gpsCoveragePercentLabel} · Admin automatico: {formatAdminPercent(selectedAutoZoneProgress)} · Finale: {formatFinalPercent(selectedAutoZoneProgress)}
                </p>
                <ZoneCoverageMap
                  key={selectedZoneId || 'none'}
                  boundaryGeometry={selectedZoneGeometry}
                  municipalityName={activeZoneName}
                  gpsOperatorCount={gpsOperatorCount}
                  points={state.points}
                  automaticPercent={selectedAutoZoneProgress.manual_override_enabled ? selectedAutoZoneProgress.manual_percent : selectedAutoZoneProgress.automatic_percent}
                  effectivePercent={selectedAutoZoneProgress.effective_percent}
                />
              </div>
            )}
          </div>
        )}

        {mapMode === 'manual' && (
          <div style={{ marginTop: 16 }}>
            {/* MANUALE ADMIN = CoverageAdjustmentPanel gia' esistente
                (admin_create/update/revoke_coverage_adjustment, disegno
                Polygon con click, storico/revoca gia' presenti, mostra gia'
                la scomposizione GPS/manuale/finale richiesta dal test D) —
                stessa identica logica, non una riscrittura. Scopiamo
                zones alla zona selezionata solo per il centro iniziale e per
                taggare correttamente le nuove correzioni. */}
            {/* key={selectedZoneRow?.id}: il centro Leaflet (prop `center` di
                MapContainer) si applica solo al MONTAGGIO iniziale — senza
                remount, cambiare zona (es. Barasso -> Gavirate) dai chip
                sopra non avrebbe ricentrato la mappa di disegno. */}
            <CoverageAdjustmentPanel
              key={selectedZoneRow?.id || 'none'}
              campaignId={campaignId}
              points={state.points}
              zones={selectedZoneRow ? [{ id: selectedZoneRow.id, ...manualPanelZoneCenter }] : geofenceZones}
              boundaryGeometry={selectedZoneGeometry}
              gpsOperatorCount={gpsOperatorCount}
            />
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Storico geofence (sessione mappa)</p>
        {geofence.events.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {geofence.events.map((event, index) => (
              <div key={index} style={rowStyle}>
                <span style={{ fontSize: 11, fontWeight: 900, color: event.type === 'exited' ? '#b91c1c' : '#0f766e' }}>
                  {event.type === 'exited' ? 'Uscita confermata' : 'Rientro confermato'}
                </span>
                <span>{formatDateTime(new Date(event.at).toISOString())}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{event.lat.toFixed(5)}, {event.lng.toFixed(5)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={geofenceZones.length ? 'Nessuna uscita dalla zona rilevata sui punti disponibili.' : 'Zona campagna non ancora configurata: verifica non disponibile.'} />
        )}
      </section>

      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Sessioni</p>
          {state.sessions.length ? state.sessions.map((session) => (
            <div key={session.id} style={session.id === state.activeSession?.id ? activeSessionRowStyle : rowStyle}>
              <strong>{session.status}</strong>
              <span>{formatDateTime(session.started_at)} - {formatDateTime(session.ended_at || session.paused_at)}</span>
              <span>{session.driver_id}</span>
              <span>{sessionOnlineLabel(session, state.activeSession, latest)}</span>
              {session.id === state.activeSession?.id ? <span style={activeBadgeStyle}>mappa</span> : null}
            </div>
          )) : <EmptyState text="Nessuna sessione registrata" />}
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Foto proof</p>
          {state.photos.length ? state.photos.map((photo) => (
            <ProofPhoto key={photo.id} photo={photo} />
          )) : <EmptyState text="Nessuna foto prova caricata" />}
        </div>
      </section>
    </AdminLayout>
  );
}

const GEOFENCE_LABELS = {
  inside: 'In zona',
  outside: 'Fuori zona',
  zone_unavailable: 'Zona non configurata',
  stale: 'Posizione non aggiornata',
  unknown: 'Verifica in corso',
};

function GeofenceBadge({ status }) {
  const color = status === 'outside' ? '#b91c1c' : status === 'inside' ? '#0f766e' : '#b45309';
  return <span style={{ display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 900, color, borderColor: `${color}44`, background: `${color}14` }}>{GEOFENCE_LABELS[status] || GEOFENCE_LABELS.unknown}</span>;
}

// Badge istantaneo dentro/fuori/vicino-confine/in-attesa-GPS: stessi label e
// colori della Driver App (ZONE_LIVE_STATUS_LABELS/COLORS in geofenceEngine.js,
// import diretto, nessuna copia locale) — allineamento visivo richiesto tra
// dashboard PC e app mobile, non una seconda logica per il desktop.
function LiveZoneStatusBadge({ status, distanceKm }) {
  const color = ZONE_LIVE_STATUS_COLORS[status] || ZONE_LIVE_STATUS_COLORS.zone_unavailable;
  const label = ZONE_LIVE_STATUS_LABELS[status] || ZONE_LIVE_STATUS_LABELS.zone_unavailable;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 900, color, borderColor: `${color}44`, background: `${color}14` }}>
        {label}
      </span>
      {status === 'outside' && distanceKm != null && (
        <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>
          Operatore fuori area assegnata — a {distanceKm.toFixed(1)} km dalla zona
        </span>
      )}
    </div>
  );
}

function sessionOnlineLabel(session, activeSession, latestPoint) {
  if (session.id !== activeSession?.id) return 'offline';
  const activityAt = session.updated_at || latestPoint?.created_at || latestPoint?.recorded_at || session.started_at;
  if (!activityAt) return 'offline';
  return Date.now() - new Date(activityAt).getTime() < 45000 ? 'online' : 'offline';
}

function getLatestTrackableSession(sessions) {
  const trackableStatuses = new Set(['started', 'paused', 'completed']);
  return (sessions || [])
    .filter((session) => trackableStatuses.has(session.status))
    .sort((a, b) => {
      const aTime = new Date(a.started_at || a.created_at || 0).getTime();
      const bTime = new Date(b.started_at || b.created_at || 0).getTime();
      return bTime - aTime;
    })[0] || null;
}

function GpsMap({ points, latest, zones = [], selectedZoneGeometry = null, searchGeometry = null, mapRef }) {
  // Centro/fitBounds seguono la geometria della zona SELEZIONATA (passata
  // esplicitamente dal genitore), mai "la prima zona con geometria trovata
  // nell'array" — su una campagna multi-comune l'ordine di risoluzione delle
  // geometrie e' asincrono/parallelo (resolveMunicipalityBoundary per ogni
  // comune) e "la prima gia' risolta" cambiava a ogni refresh: era questa
  // l'indeterminatezza dietro "la mappa mostra una zona diversa da quella
  // attesa" su campagne con piu' comuni.
  const center = useMemo(() => {
    if (latest) return [Number(latest.lat), Number(latest.lng)];
    if (selectedZoneGeometry) {
      const coord = selectedZoneGeometry.type === 'MultiPolygon'
        ? selectedZoneGeometry.coordinates?.[0]?.[0]?.[0]
        : selectedZoneGeometry.coordinates?.[0]?.[0];
      if (coord) return [coord[1], coord[0]];
    }
    // Nessun punto GPS, nessuna zona selezionata con confine reale ancora
    // risolto: unico caso residuo in cui non c'e' nulla di reale da
    // centrare. FitToZoneBounds sotto corregge comunque la vista reale non
    // appena il confine della zona selezionata arriva.
    return [45.4642, 9.1900]; // Milano default — solo fallback residuo
  }, [latest, selectedZoneGeometry]);
  // Solo i punti che superano il filtro qualita' (stesso modulo condiviso di
  // AdminLiveDashboard) finiscono nella polilinea: un punto anomalo isolato
  // non deve piu' disegnare un salto impossibile sulla mappa.
  const validPoints = useMemo(() => filterValidGpsPoints(points).valid, [points]);
  const path = validPoints.map((point) => [Number(point.lat), Number(point.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  function getZoneStyle(zone) {
    if (zone.adjustment_type === 'inaccessible') {
      return { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.2, dashArray: '5, 10', weight: 2 };
    }
    if (zone.adjustment_type === 'manual_covered' || zone.adjustment_type === 'partially_covered') {
      return { color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.2, weight: 2 };
    }
    // Confine normale (nessuna correzione manuale/inaccessibile): stesso
    // arancione brand del confine disegnato dalla Driver App
    // (DriverZoneMap.jsx ZoneShape, #e8571a) — stessa identità visiva tra
    // dashboard PC e app mobile, non un colore diverso per il desktop.
    return { color: '#e8571a', fillColor: '#e8571a', fillOpacity: 0.08, weight: 2 };
  }

  return (
    <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer ref={mapRef} center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* Si riesegue a ogni cambio di zona selezionata (geometry cambia
            riferimento), non solo quando manca un punto GPS live: cambiare
            zona deve sempre spostare subito la vista, come richiesto. */}
        {selectedZoneGeometry && <FitToZoneBounds geometry={selectedZoneGeometry} />}

        {zones.map((zone) => {
          if (!zone.geometry || !zone.geometry.coordinates) return null;
          // Leaflet expects [lat, lng], GeoJSON is [lng, lat]
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
                Copertura: {zone.effective_percent}%<br/>
                {zone.adjustment_type && <span>Correzione: {zone.adjustment_type}</span>}
              </Popup>
            </Polygon>
          );
        })}

        {searchGeometry && (() => {
          let coords = [];
          if (searchGeometry.type === 'Polygon') {
            coords = searchGeometry.coordinates.map((ring) => ring.map((p) => [p[1], p[0]]));
          } else if (searchGeometry.type === 'MultiPolygon') {
            coords = searchGeometry.coordinates.map((poly) => poly.map((ring) => ring.map((p) => [p[1], p[0]])));
          }
          if (!coords.length) return null;
          return (
            <Polygon positions={coords} pathOptions={{ color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.06, dashArray: '6 6' }}>
              <Popup>Risultato ricerca (solo consultazione)</Popup>
            </Polygon>
          );
        })()}

        {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#e8571a', weight: 4, opacity: 0.82 }} />}
        {points.map((point) => (
          <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={4} pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.65 }}>
            <Popup>
              {formatDateTime(point.recorded_at)}
              <br />
              Accuracy: {point.accuracy != null ? `${Math.round(point.accuracy)} m` : 'n/d'}
            </Popup>
          </CircleMarker>
        ))}
        {latest && (
          <CircleMarker center={[latest.lat, latest.lng]} radius={8} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
            <Popup>Ultimo punto<br />{formatDateTime(latest.recorded_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

function ProofPhoto({ photo }) {
  const meta = parseProofPhotoNote(photo.note);
  return (
    <div style={rowStyle}>
      {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8 }} /> : null}
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
          {meta.outcome && <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e' }}>{podOutcomeLabel(meta.outcome)}</span>}
          <span style={{ fontSize: 11, color: photo.approved_at ? '#0f766e' : '#b45309' }}>{photo.approved_at ? 'Approvata' : 'In attesa di approvazione'}</span>
        </div>
        <p style={{ margin: '4px 0', color: 'rgba(255,255,255,.55)' }}>{meta.client || 'Cliente non specificato'}{meta.address ? ` · ${meta.address}` : ''}</p>
        {(meta.ddt || meta.colli) && (
          <p style={{ margin: '2px 0', color: 'rgba(255,255,255,.4)', fontSize: 12 }}>{meta.ddt ? `DDT ${meta.ddt}` : ''}{meta.ddt && meta.colli ? ' · ' : ''}{meta.colli ? `${meta.colli} colli` : ''}</p>
        )}
        {meta.note && <p style={{ margin: '2px 0', color: 'rgba(255,255,255,.4)', fontSize: 12 }}>{meta.note}</p>}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{photo.lat && photo.lng ? `${Number(photo.lat).toFixed(5)}, ${Number(photo.lng).toFixed(5)}` : 'Coordinate non disponibili'}</span>
      </div>
    </div>
  );
}

async function hydratePhotoUrls(photos) {
  return Promise.all((photos || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
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

function Metric({ label, value }) {
  return <div style={metricStyle}><span>{label}</span><strong style={{ color: '#fff' }}>{value}</strong></div>;
}

function EmptyState({ text }) {
  return <div style={{ padding: 20, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' }}>{text}</div>;
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

const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(0,0,0,.24)', color: '#fff' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 };
const metricStyle = { display: 'grid', gap: 4, padding: 12, background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)', color: 'rgba(255,255,255,.62)' };
const gridTwoStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 };
const rowStyle = { display: 'flex', gap: 12, padding: 12, borderBottom: '1px solid rgba(255,255,255,.07)', alignItems: 'center', flexWrap: 'wrap', color: 'rgba(255,255,255,.75)' };
const activeSessionRowStyle = { ...rowStyle, background: 'rgba(249,115,22,.08)', borderRadius: 10, borderBottom: '1px solid rgba(249,115,22,.2)' };
const activeBadgeStyle = { padding: '3px 8px', borderRadius: 999, background: '#e8571a', color: '#fff', fontSize: 11, fontWeight: 900 };
const errorStyle = { padding: 12, borderRadius: 10, color: '#fecaca', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)' };
// Pulsanti ricentraggio mappa: stessa funzione della Driver App (dove il
// ricentraggio e' automatico/link Maps), qui espliciti perche' su desktop
// l'Admin puo' pannare via dalla vista live per ispezionare lo storico e deve
// poter tornare indietro con un click — mai nascosti/minuscoli, visibili
// anche su desktop come richiesto.
function mapActionButtonStyle(disabled) {
  return {
    border: '1px solid rgba(255,255,255,.14)',
    background: disabled ? 'rgba(255,255,255,.04)' : 'rgba(232,87,26,.16)',
    color: disabled ? 'rgba(255,255,255,.35)' : '#fff',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function zoneChipStyle(active) {
  return {
    border: '1px solid',
    borderColor: active ? '#e8571a' : 'rgba(255,255,255,.16)',
    background: active ? 'rgba(232,87,26,.22)' : 'rgba(255,255,255,.04)',
    color: '#fff',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: active ? 900 : 700,
    cursor: 'pointer',
  };
}

function modeTabStyle(active) {
  return {
    border: '1px solid',
    borderColor: active ? '#e8571a' : 'rgba(255,255,255,.16)',
    background: active ? '#e8571a' : 'rgba(255,255,255,.04)',
    color: '#fff',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '.04em',
    cursor: 'pointer',
  };
}

const zoneSearchInputStyle = { flex: '1 1 260px', minWidth: 200, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.04)', color: '#fff', borderRadius: 8, padding: '9px 12px', fontSize: 13 };
const gpsReadOnlySummaryStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginTop: 14 };

function MiniStat({ label, value }) {
  return (
    <div style={{ padding: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', fontWeight: 900 }}>{label}</div>
      <div style={{ fontSize: 16, color: '#fff', fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
