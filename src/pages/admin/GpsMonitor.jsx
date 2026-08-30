import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Polygon } from 'react-leaflet';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { createProofPhotoSignedUrl, getCampaignGpsSessions, getCampaignSessionTracks, getCampaignProofPhotos, getCampaignRecord, calculateGpsCoverage, adminUnlockDevice } from '../../lib/services/gps-api.js';
import { C } from '../../lib/constants.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';
import { normalizeZonesFromCampaign, summarizeGeofencePoints, deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, ZONE_LIVE_STATUS_LABELS, ZONE_LIVE_STATUS_COLORS } from '../../lib/geofence/geofenceEngine.js';
import { geoJsonApproxCentroid } from '../../lib/geo/pointInPolygon.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { resolveMunicipalityBoundary } from '../../lib/geo/resolveMunicipalityBoundary.js';
import { AdminLayout } from './AdminLayout.jsx';
import { CoverageAdjustmentPanel } from '../../components/admin/CoverageAdjustmentPanel.jsx';
import { listCampaignAssignments } from '../../lib/services/admin-api.js';
import { getOperatorColor } from '../../lib/geo/operatorColor.js';
import { AdminIssuesPanel } from '../../components/admin/AdminIssuesPanel.jsx';
import { ZoneCoverageMap } from '../../components/admin/ZoneCoverageMap.jsx';
import { FitToZoneBounds } from '../../components/map/FitToZoneBounds.jsx';
import { GpsMonitorMetricsPanel } from './gps-monitor/GpsMonitorMetricsPanel.jsx';
import { GpsMonitorGeofenceHistory } from './gps-monitor/GpsMonitorGeofenceHistory.jsx';
import { GpsMonitorSessionsProofPanel } from './gps-monitor/GpsMonitorSessionsProofPanel.jsx';

// Palette tracce per-operatore: token del design system esistente
// (src/lib/constants.js), arancione brand per il primo operatore. Nessun
// colore inventato: si cicla se gli operatori superano la palette.
const TRACK_PALETTE = ['#e8571a', C.blue, C.purple, C.green, C.teal, C.yellow];
export function trackColor(index) {
  return TRACK_PALETTE[index % TRACK_PALETTE.length];
}
const OPERATOR_STATUS_LABELS = {
  live: 'ONLINE',
  warning: 'ONLINE',
  offline_recent: 'OFFLINE',
  history: 'TERMINATO',
};
function operatorStatusLabel(track) {
  if (track.session?.status === 'paused') return 'IN PAUSA';
  if (track.session?.status === 'completed' || track.session?.status === 'cancelled') return 'TERMINATO';
  return OPERATOR_STATUS_LABELS[track.lifecycleStatus] || 'OFFLINE';
}

export function GpsMonitor({ campaignId, onNav }) {
  // MULTI-OPERATORE: si caricano TUTTE le sessioni trackabili della campagna
  // (una per operatore) con i punti gia' separati per session_id. `points` e'
  // solo la concatenazione piatta per i pannelli/metriche esistenti — la mappa
  // NON la usa mai per la polilinea (vedi GpsMap): una <Polyline> per traccia.
  const [state, setState] = useState({ loading: true, error: null, points: [], sessions: [], sessionTracks: [], photos: [], activeSession: null, campaign: null });
  const [coverage, setCoverage] = useState(null);
  const [trackVisibility, setTrackVisibility] = useState({});
  const toggleTrack = (sessionId) => setTrackVisibility((prev) => ({ ...prev, [sessionId]: prev[sessionId] === false }));
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
        const [sessions, sessionTracks, photos, campaign] = await Promise.all([
          getCampaignGpsSessions(campaignId),
          getCampaignSessionTracks(campaignId),
          getCampaignProofPhotos(campaignId),
          getCampaignRecord(campaignId).catch(() => null),
        ]);
        // Sessione "primaria" per coverage/centro mappa/highlight nel pannello
        // sessioni — MAI l'unica renderizzata: tutte le tracce restano
        // visibili come polilinee separate.
        const activeSession = getLatestTrackableSession(sessions) || sessionTracks[sessionTracks.length - 1]?.session || null;
        const points = sessionTracks.flatMap((track) => track.points);
        const photosWithUrls = await hydratePhotoUrls(photos);
        if (!cancelled) setState({ loading: false, error: null, points, sessions, sessionTracks, photos: photosWithUrls, activeSession, campaign });
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

  // Ambito automatico multi-zona (CoverageAdjustmentPanel §4): SOLO le zone
  // campagna gia' esistenti (campaign_zones via useZoneBoundaries), con nome
  // comune e confine reale gia' risolto. Nessun boundary inventato: le zone
  // ancora senza geometria vengono escluse finche' resolveMunicipalityBoundary
  // non le popola.
  const campaignZonesForAuto = useMemo(
    () => zoneRows
      .map((z) => ({ id: z.id, municipalityName: z.zone_name, boundaryGeometry: resolvedBoundaries[z.id] || null }))
      .filter((z) => z.municipalityName && z.boundaryGeometry),
    [zoneRows, resolvedBoundaries],
  );

  // Operatori REALI della campagna per CoverageAdjustmentPanel (§ ticket
  // "operatori reali"): da admin_list_campaign_assignments, solo attivi/non
  // revocati, senza access_token nel payload passato alla UI.
  const [assignmentRows, setAssignmentRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!campaignId) { setAssignmentRows([]); return undefined; }
    listCampaignAssignments(campaignId)
      .then((rows) => { if (!cancelled) setAssignmentRows(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAssignmentRows([]); });
    return () => { cancelled = true; };
  }, [campaignId]);
  const campaignOperators = useMemo(
    () => assignmentRows
      .filter((a) => !a.revoked_at && (a.status == null || a.status === 'active'))
      .map((a) => ({
        assignmentId: a.id,
        operatorId: a.operator_id || null,
        name: a.operator_name && a.operator_name !== a.operator_id ? a.operator_name : null,
        zoneId: a.zone_id || null,
        groupId: a.group_id || null,
      })),
    [assignmentRows],
  );

  // Operatori GPS REALI con nome + colore stabile, per la legenda del
  // CoverageAdjustmentPanel (§ ticket "ogni operatore con il suo colore" +
  // "legenda con nomi"). Un elemento per driver_id distinto tra le sessioni
  // trackabili; il nome viene risolto dagli assignment reali (operator_id),
  // il colore da getOperatorColor(driver_id) — LO STESSO usato per la traccia
  // GPS sulla mappa e per le correzioni manuali dello stesso operatore.
  const gpsOperators = useMemo(() => {
    const byId = new Map();
    (state.sessionTracks || []).forEach((t) => {
      const id = t.session?.driver_id;
      if (!id || byId.has(id)) return;
      const match = campaignOperators.find((o) => o.operatorId && o.operatorId === id);
      byId.set(id, { id, name: match?.name || null, color: getOperatorColor(id) });
    });
    return [...byId.values()];
  }, [state.sessionTracks, campaignOperators]);

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

  // ADMIN — "Sblocca dispositivo": scollega il device associato alla sessione
  // dell'operatore (RPC gps_admin_unlock_device, admin-only). Preserva
  // sessione / GPS / assignment / storico: azzera solo device_id, cosi' un
  // nuovo dispositivo puo' riprendere l'incarico. Conferma + motivo obbligatori.
  const handleUnlockDevice = async (sessionId) => {
    if (!sessionId) return;
    if (!window.confirm('Vuoi scollegare il dispositivo attualmente associato a questo incarico? La sessione, i punti GPS e lo storico NON vengono toccati.')) return;
    const reason = window.prompt('Motivo dello sblocco (obbligatorio):', '');
    if (!reason || !reason.trim()) { window.alert('Motivo obbligatorio: sblocco annullato.'); return; }
    try {
      await adminUnlockDevice(sessionId, reason.trim());
      window.alert('Dispositivo scollegato. L\'operatore puo\' ora riprendere l\'incarico da un nuovo dispositivo.');
    } catch (err) {
      window.alert(`Sblocco non riuscito: ${err?.message || 'errore sconosciuto'}`);
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

  // Geofence: source of truth = geometrie reali gia' risolte/persistite da
  // useZoneBoundaries (campaign_zones.polygon_geojson), NON il record campagna.
  // Prima si leggevano le zone dal solo oggetto campagna: quel record non
  // porta le zone, quindi il motore geofence non trovava geometria e mostrava
  // "Zona non configurata" come falso negativo anche quando campaign_zones
  // esiste. `normalizeZonesFromCampaign` accetta gia' una forma
  // { campaign_zones: [...] } e legge zone.geometry per ciascuna.
  const geofenceZones = useMemo(
    () => normalizeZonesFromCampaign({ campaign_zones: (mapZones || []).filter((zone) => zone.geometry) }),
    [mapZones],
  );
  const geofence = useMemo(() => summarizeGeofencePoints(state.points, geofenceZones), [state.points, geofenceZones]);

  const status = deriveCampaignStatus(state.sessions, state.campaign);
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
  // Somma dei validi PER SESSIONE (mai filterValidGpsPoints sull'unione dei
  // punti di piu' operatori: il confronto col punto precedente leggerebbe il
  // salto tra la traccia di A e quella di B come "impossible_jump").
  const gpsValidPointCount = useMemo(
    () => state.sessionTracks.reduce((sum, track) => sum + track.validPoints.length, 0),
    [state.sessionTracks],
  );
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
      <GpsMonitorMetricsPanel
        state={state}
        status={status}
        activeMs={activeMs}
        activeSessionLabel={activeSessionLabel}
        driverOnline={driverOnline}
        geofence={geofence}
        coverage={coverage}
        handleRecalculateCoverage={handleRecalculateCoverage}
        formatDuration={formatDuration}
        Metric={Metric}
        GeofenceBadge={GeofenceBadge}
        styles={{
          metricGridStyle,
        }}
      />

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
          <GpsMap points={state.points} sessionTracks={state.sessionTracks} trackVisibility={trackVisibility} latest={latest} zones={mapZones} selectedZoneGeometry={selectedZoneGeometry} searchGeometry={zoneSearchState.result?.geometry || null} mapRef={mapRef} />
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

        <GpsMonitorOperatorsPanel
          sessionTracks={state.sessionTracks}
          trackVisibility={trackVisibility}
          toggleTrack={toggleTrack}
          activeSessionId={state.activeSession?.id}
          formatDateTime={formatDateTime}
          onUnlockDevice={handleUnlockDevice}
        />

        {mapMode === 'gps' && (
          <div style={gpsReadOnlySummaryStyle}>
            {/* "Copertura operatore (stimata)": il calcolo attuale e' per
                singola sessione e usa come denominatore l'area della zona
                assegnata (spesso l'intero comune). NON e' la copertura
                aggregata di campagna (unione delle tracce di tutti gli
                operatori) — quella e' un lavoro successivo con RPC dedicata. */}
            <MiniStat label="Copertura operatore (stimata)" value={coverage?.calculation_status === 'ready' ? `${coverage.coverage_percent}%` : 'n/d'} />
            <MiniStat label="Punti GPS validi" value={gpsValidPointCount} />
            <MiniStat label="Punti GPS esclusi (qualita')" value={state.points.length - gpsValidPointCount} />
          </div>
        )}

        {mapMode === 'auto' && (
          <div style={{ marginTop: 16 }}>
            {/* AUTOMATICO ADMIN — editor reale sulla mappa: stesso
                CoverageAdjustmentPanel del tab MANUALE, ma aperto sul livello
                'automatic_verified'. Matita (area/tratto), gomma (esclusione),
                seleziona, annulla, salva, "Anteprima Copertura finale". Le
                correzioni sono persistite in campaign_coverage_adjustments
                (source=automatic_verified / gps_exclusion) e alimentano
                calculate_campaign_final_coverage — l'UNICA fonte di verita'
                del "finale", identica a quella del Cliente. */}
            <CoverageAdjustmentPanel
              key={`auto-${selectedZoneRow?.id || 'none'}`}
              campaignId={campaignId}
              points={state.points}
              zones={selectedZoneRow ? [{ id: selectedZoneRow.id, ...manualPanelZoneCenter }] : geofenceZones}
              boundaryGeometry={selectedZoneGeometry}
              gpsOperatorCount={gpsOperatorCount}
              defaultSourceLevel="automatic_verified"
              municipalityName={activeZoneName}
              campaignZones={campaignZonesForAuto}
              campaignOperators={campaignOperators}
              gpsOperators={gpsOperators}
              automaticPercent={selectedAutoZoneProgress ? (selectedAutoZoneProgress.manual_override_enabled ? selectedAutoZoneProgress.manual_percent : selectedAutoZoneProgress.automatic_percent) : null}
            />

            {/* Diagnostica (sola lettura): la selezione stradale automatica
                come nuvola di punti. NON e' la copertura finale — quella e'
                l'anteprima nel pannello sopra. */}
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.6)' }}>
                Diagnostica: selezione stradale automatica (sola lettura)
              </summary>
              {selectedAutoZoneProgress ? (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                    {activeZoneName ? `${activeZoneName} — ` : ''}
                    Legacy — GPS sessione: {gpsCoveragePercentLabel} · Automatico grezzo: {formatAdminPercent(selectedAutoZoneProgress)} · Effettivo cache: {formatFinalPercent(selectedAutoZoneProgress)}
                    <br /><span style={{ color: '#94a3b8', fontWeight: 600 }}>Questi valori NON sono la Copertura Verificata: fanno riferimento alla cache campaign_zone_progress. Il valore reale e' "FINALE VERIFICATA" nel pannello sopra.</span>
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
              ) : (
                <p style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>Seleziona una zona per la diagnostica.</p>
              )}
            </details>

            {/* Override legacy (percentuale manuale) — MANTENUTO per audit /
                compatibilita', ma NON alimenta la Copertura Verificata. */}
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.6)' }}>
                Override legacy percentuale (non alimenta la Copertura Verificata)
              </summary>
              <p style={{ margin: '8px 0', fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>
                Sistema precedente basato su percentuale fissa. Per correggere la copertura usa Matita/Gomma qui sopra.
              </p>
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
            </details>
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
              campaignZones={campaignZonesForAuto}
              campaignOperators={campaignOperators}
              gpsOperators={gpsOperators}
            />
            <AdminIssuesPanel campaignId={campaignId} />
          </div>
        )}
      </section>

      <GpsMonitorGeofenceHistory
        geofence={geofence}
        geofenceZones={geofenceZones}
        formatDateTime={formatDateTime}
        EmptyState={EmptyState}
        styles={{
          cardStyle,
          eyebrowStyle,
          rowStyle,
        }}
      />

      <GpsMonitorSessionsProofPanel
        sessions={state.sessions}
        activeSession={state.activeSession}
        photos={state.photos}
        latest={latest}
        sessionOnlineLabel={sessionOnlineLabel}
        ProofPhoto={ProofPhoto}
        EmptyState={EmptyState}
        formatDateTime={formatDateTime}
        styles={{
          gridTwoStyle,
          cardStyle,
          eyebrowStyle,
          rowStyle,
          activeSessionRowStyle,
          activeBadgeStyle,
        }}
      />
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

function GpsMap({ points, sessionTracks = [], trackVisibility = {}, latest, zones = [], selectedZoneGeometry = null, searchGeometry = null, mapRef }) {
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
  // UNA polilinea PER SESSIONE/OPERATORE, mai una sola linea da tutti i punti:
  // concatenare la traccia dell'operatore A con quella di B disegnerebbe
  // segmenti diagonali artificiali e, nel filtro qualita' (confronto col punto
  // precedente), leggerebbe il salto A->B come "impossible_jump".
  // filterValidGpsPoints e' applicato PER SESSIONE. Un operatore nascosto dal
  // toggle non contribuisce alla mappa.
  const trackLines = useMemo(() => (sessionTracks || []).map((track, index) => ({
    sessionId: track.session.id,
    // Colore STABILE per operatore (stesso di CoverageAdjustmentPanel per le
    // correzioni manuali dello stesso autista); fallback all'indice per
    // sessioni senza driver_id.
    color: track.session?.driver_id ? getOperatorColor(track.session.driver_id) : trackColor(index),
    visible: trackVisibility[track.session.id] !== false,
    lastPoint: track.lastPoint,
    latlngs: (track.validPoints || [])
      .map((point) => [Number(point.lat), Number(point.lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    points: track.points || [],
  })), [sessionTracks, trackVisibility]);

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

        {trackLines.filter((track) => track.visible).map((track) => (
          <Fragment key={track.sessionId}>
            {track.latlngs.length > 1 && (
              <Polyline positions={track.latlngs} pathOptions={{ color: track.color, weight: 4, opacity: 0.82 }} />
            )}
            {track.points.map((point) => (
              <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={4} pathOptions={{ color: track.color, fillColor: track.color, fillOpacity: 0.6 }}>
                <Popup>
                  {formatDateTime(point.recorded_at)}
                  <br />
                  Accuracy: {point.accuracy != null ? `${Math.round(point.accuracy)} m` : 'n/d'}
                </Popup>
              </CircleMarker>
            ))}
            {track.lastPoint && (
              <CircleMarker center={[Number(track.lastPoint.lat), Number(track.lastPoint.lng)]} radius={7} pathOptions={{ color: track.color, fillColor: track.color, fillOpacity: 0.95 }}>
                <Popup>Ultimo punto operatore<br />{formatDateTime(track.lastPoint.recorded_at)}</Popup>
              </CircleMarker>
            )}
          </Fragment>
        ))}
        {latest && (
          <CircleMarker center={[latest.lat, latest.lng]} radius={8} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
            <Popup>Ultimo punto (piu' recente in campagna)<br />{formatDateTime(latest.recorded_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

// Pannello operatori: TUTTE le sessioni della campagna contemporaneamente,
// una riga per operatore, con traccia distinguibile (colore = trackColor),
// stato (ONLINE / IN PAUSA / OFFLINE / TERMINATO), conteggi punti e toggle
// mostra/nascondi la traccia sulla mappa.
export function GpsMonitorOperatorsPanel({ sessionTracks = [], trackVisibility = {}, toggleTrack, activeSessionId, formatDateTime: fmt, onUnlockDevice }) {
  if (!sessionTracks.length) return null;
  const format = fmt || ((v) => (v ? new Date(v).toLocaleString('it-IT') : 'n/d'));
  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', fontWeight: 900 }}>
        Operatori · {sessionTracks.length}
      </div>
      {sessionTracks.map((track, index) => {
        const color = trackColor(index);
        const statusLabel = operatorStatusLabel(track);
        const visible = trackVisibility[track.session.id] !== false;
        const lastAt = track.lastPoint?.recorded_at || track.session.updated_at || track.session.started_at || null;
        return (
          <div
            key={track.session.id}
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
              padding: '10px 12px', borderRadius: 10,
              background: track.session.id === activeSessionId ? 'rgba(232,87,26,.08)' : 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.07)',
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 3, background: color, flex: '0 0 auto' }} />
            <strong style={{ color: '#fff', fontSize: 13 }}>Operatore {index + 1}</strong>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.04em', color:
              statusLabel === 'ONLINE' ? '#22c55e' : statusLabel === 'IN PAUSA' ? '#fbbf24' : statusLabel === 'TERMINATO' ? '#94a3b8' : '#f87171' }}>
              {statusLabel}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
              {track.points.length} punti · {track.validPoints.length} validi · {track.excludedPoints.length} scartati (qualita')
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>Ultimo: {format(lastAt)}</span>
            <button
              type="button"
              onClick={() => toggleTrack?.(track.session.id)}
              style={{
                marginLeft: 'auto', border: '1px solid rgba(255,255,255,.16)',
                background: visible ? 'rgba(232,87,26,.16)' : 'rgba(255,255,255,.04)',
                color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {visible ? 'Nascondi traccia' : 'Mostra traccia'}
            </button>
            {onUnlockDevice && (track.session.status === 'started' || track.session.status === 'paused') && (
              <button
                type="button"
                onClick={() => onUnlockDevice(track.session.id)}
                title="Scollega il dispositivo associato a questo incarico (sessione/GPS/storico preservati)"
                style={{
                  border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.04)',
                  color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                }}
              >
                Sblocca dispositivo
              </button>
            )}
          </div>
        );
      })}
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

const CAMPAIGN_STATUS_LABELS = {
  in_progress: 'in corso', completed: 'completata', cancelled: 'annullata',
  canceled: 'annullata', archived: 'archiviata', draft: 'bozza', pending: 'in attesa',
};
// Lo stato REALE della campagna e' campaigns.status (DB), NON lo stato delle
// sessioni: una campagna 'in_progress' con tutte le sessioni 'completed' e'
// comunque IN CORSO (gli operatori possono ripartire con "Riprendi zona").
// Lo stato sessione/operatore e' mostrato separatamente (pannello operatori).
function deriveCampaignStatus(sessions, campaignRecord) {
  const dbStatus = campaignRecord?.status || campaignRecord?.stato;
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
