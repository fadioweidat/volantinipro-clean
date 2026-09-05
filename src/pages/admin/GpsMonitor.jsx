import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Polygon } from 'react-leaflet';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { createProofPhotoSignedUrl, getCampaignGpsSessions, getCampaignSessionTracks, getCampaignProofPhotos, getCampaignRecord, calculateGpsCoverage, adminUnlockDevice } from '../../lib/services/gps-api.js';
import { C } from '../../lib/constants.js';
import { CoverageAdjustmentPanel } from '../../components/admin/CoverageAdjustmentPanel.jsx';
import { getMunicipalityCenterPoint } from '../../lib/geo/originRadialSelection.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';
import { normalizeZonesFromCampaign, summarizeGeofencePoints, deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, ZONE_LIVE_STATUS_LABELS, ZONE_LIVE_STATUS_COLORS } from '../../lib/geofence/geofenceEngine.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { resolveMunicipalityBoundary } from '../../lib/geo/resolveMunicipalityBoundary.js';
import { AdminLayout } from './AdminLayout.jsx';
import { listCampaignAssignments } from '../../lib/services/admin-api.js';
import { getOperatorColor } from '../../lib/geo/operatorColor.js';
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
// Etichetta di ripiego quando il display_name reale dell'operatore non c'e':
// "Operatore <short-id>", MAI "Operatore 04" da indice di array.
export function shortOperatorId(value) {
  const s = String(value || '');
  return s.length > 8 ? s.slice(0, 8) : s;
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
  const [selectedOperatorFilter, setSelectedOperatorFilter] = useState('all');
  const [showExcludedGpsPoints, setShowExcludedGpsPoints] = useState(false);

  // Filtraggio per operatore selezionato (quick filter bar)
  const filteredSessionTracks = useMemo(() => {
    if (selectedOperatorFilter === 'all') return state.sessionTracks;
    return state.sessionTracks.filter((track) => {
      const driverId = track.session?.driver_id;
      const assignmentId = track.session?.assignment_id;
      const sessionId = track.session?.id;
      return driverId === selectedOperatorFilter || assignmentId === selectedOperatorFilter || sessionId === selectedOperatorFilter;
    });
  }, [state.sessionTracks, selectedOperatorFilter]);

  const filteredPoints = useMemo(() => {
    if (selectedOperatorFilter === 'all') return state.points;
    return filteredSessionTracks.flatMap((t) => t.points || []);
  }, [selectedOperatorFilter, filteredSessionTracks, state.points]);
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

  // Operatori REALI della campagna (§ ticket "operatori reali"): da
  // admin_list_campaign_assignments, solo attivi/non revocati, senza
  // access_token nel payload passato alla UI. Alimentano canonicalOperators
  // (pannello operatori del monitor) e vengono passati all'Editor Copertura
  // quando l'Admin apre "Correggi copertura".
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

  // Lista CANONICA degli operatori della campagna (ticket §2). Fonte primaria:
  // le assegnazioni reali (admin_list_campaign_assignments, attive/non
  // revocate). Arricchita con la presenza GPS = driver_id tra le sessioni
  // trackabili. operatorId stabile; colore SEMPRE da
  // getOperatorColor(operatorId||assignmentId) — mai da indice/etichetta.
  const gpsDriverIds = useMemo(
    () => new Set((state.sessionTracks || []).map((t) => t.session?.driver_id).filter(Boolean)),
    [state.sessionTracks],
  );
  const canonicalOperators = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const o of campaignOperators) {
      const key = o.operatorId || o.assignmentId;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        operatorId: o.operatorId || null,
        assignmentId: o.assignmentId || null,
        colorKey: String(key),
        displayName: o.name || `Operatore ${shortOperatorId(key)}`,
        color: getOperatorColor(key),
        assigned: true,
        hasGps: o.operatorId ? gpsDriverIds.has(o.operatorId) : false,
      });
    }
    // GPS driver senza assegnazione corrispondente (assegnazione revocata ma
    // sessione storica): non perderli, ma restano fuori dal conteggio "assegnati".
    for (const id of gpsDriverIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        operatorId: id, assignmentId: null, colorKey: String(id),
        displayName: `Operatore ${shortOperatorId(id)}`, color: getOperatorColor(id),
        assigned: false, hasGps: true,
      });
    }
    return out;
  }, [campaignOperators, gpsDriverIds]);
  // "OPERATORI: N" = operatori realmente ASSEGNATI (mai il numero di sessioni GPS).
  const assignedOperatorCount = canonicalOperators.filter((o) => o.assigned).length;
  const operatorsWithGpsCount = canonicalOperators.filter((o) => o.hasGps).length;

  // Operatori GPS reali (id + nome + colore stabile) per la legenda del
  // CoverageAdjustmentPanel simple: un elemento per driver_id distinto, nome
  // dagli assignment reali, colore SEMPRE da getOperatorColor(driver_id) — lo
  // stesso della traccia GPS e delle correzioni manuali dello stesso autista.
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
  const gpsOperatorCount = gpsDriverIds.size;

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

  // MONITOR OPERATIVO ADMIN: mappa/tracce/operatori/foto/geofence + strumenti
  // SEMPLICI di correzione copertura inline (CoverageAdjustmentPanel mode
  // simple): operatore, matita, gomma parziale, manuale, automatico 50..100%,
  // KPI/preview, salva, note facoltative. NIENTE diagnostica / override legacy
  // / pannelli tecnici / motivo obbligatorio. Lo "Studio Mappa Avanzato"
  // (CoverageEditor.jsx) resta un lavoro separato, NON collegato da qui.
  // Un solo motore GPS, un'unica fonte copertura: calculate_campaign_final_coverage.

  // Centro iniziale del pannello di disegno per la zona selezionata: 1)
  // center_lat/lng reali SE validi (Bergamo reale ha 0/0), 2) centroide del
  // confine reale (getMunicipalityCenterPoint). MAI Milano hard-coded.
  const zoneCentroid = selectedZoneGeometry ? getMunicipalityCenterPoint(selectedZoneGeometry) : null;
  const manualPanelZoneCenter = (
    selectedZoneRow
    && Number.isFinite(Number(selectedZoneRow.center_lat)) && Number(selectedZoneRow.center_lat) !== 0
    && Number.isFinite(Number(selectedZoneRow.center_lng)) && Number(selectedZoneRow.center_lng) !== 0
  ) ? { center_lat: Number(selectedZoneRow.center_lat), center_lng: Number(selectedZoneRow.center_lng) }
    : (zoneCentroid ? { center_lat: zoneCentroid.lat, center_lng: zoneCentroid.lng } : {});

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
        <p style={eyebrowStyle}>Mappa operativa — Copertura GPS (sola lettura)</p>

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
            <p style={{ margin: '2px 0 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b', fontWeight: 900 }}>Fonte: GPS DRIVER — sola lettura</p>
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

        {/* BARRA FILTRI OPERATORE (TUTTI / OP-01 / OP-02 ...) + DIAGNOSTICA ESCLUSI */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.07)' }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.5)' }}>Filtro Operatori:</span>
          <button
            type="button"
            onClick={() => setSelectedOperatorFilter('all')}
            style={operatorFilterChipStyle(selectedOperatorFilter === 'all')}
          >
            Tutti ({canonicalOperators.length || state.sessionTracks.length})
          </button>
          {canonicalOperators.map((op, idx) => {
            const opKey = op.operatorId || op.assignmentId || op.colorKey;
            const isSelected = selectedOperatorFilter === opKey;
            const label = `OP-0${idx + 1}${op.displayName && !op.displayName.startsWith('Operatore') ? ` · ${op.displayName}` : ''}`;
            return (
              <button
                key={op.colorKey}
                type="button"
                onClick={() => setSelectedOperatorFilter(opKey)}
                style={{
                  ...operatorFilterChipStyle(isSelected),
                  borderColor: isSelected ? op.color : 'rgba(255,255,255,.16)',
                  background: isSelected ? `${op.color}28` : 'rgba(255,255,255,.04)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: op.color, display: 'inline-block', marginRight: 6 }} />
                {label}
              </button>
            );
          })}
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showExcludedGpsPoints}
              onChange={(e) => setShowExcludedGpsPoints(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Mostra punti GPS esclusi (diagnostica)
          </label>
        </div>

        {(selectedZoneGeometry || latest) ? (
          <GpsMap
            points={filteredPoints}
            sessionTracks={filteredSessionTracks}
            trackVisibility={trackVisibility}
            showExcludedGpsPoints={showExcludedGpsPoints}
            latest={latest}
            zones={mapZones}
            selectedZoneGeometry={selectedZoneGeometry}
            searchGeometry={zoneSearchState.result?.geometry || null}
            mapRef={mapRef}
          />
        ) : (
          <EmptyState text={state.loading
            ? 'Caricamento tracking GPS...'
            : activeZoneName
              ? `Confine della zona "${activeZoneName}" non disponibile: mappa non mostrata per evitare una zona errata.`
              : 'Nessuna zona selezionata / nessun tracking GPS disponibile'} />
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
          canonicalOperators={canonicalOperators}
          assignedOperatorCount={assignedOperatorCount}
          operatorsWithGpsCount={operatorsWithGpsCount}
          trackVisibility={trackVisibility}
          toggleTrack={toggleTrack}
          zoneRows={zoneRows}
          activeSessionId={state.activeSession?.id}
          formatDateTime={formatDateTime}
          onUnlockDevice={handleUnlockDevice}
        />

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

      </section>

      {/* COPERTURA OPERATIVA — stessa fonte di Cliente ed Editor
          (calculate_campaign_final_coverage, via il pannello) + strumenti
          SEMPLICI inline. mode "simple": operatore, matita/continua tracciato,
          gomma parziale, manuale, automatico 50..100%, KPI/preview, salva,
          note facoltative. NIENTE diagnostica / override legacy / selettore
          livello / ambito multi-zona / motivo obbligatorio / link editor.
          key={campaignId:zoneId}: cambio campagna o zona rimonta il pannello
          da zero — nessun autoNetRef / draft / centro della zona precedente. */}
      <section style={{ ...cardStyle, marginTop: 16 }}>
        {selectedZoneGeometry ? (
          <CoverageAdjustmentPanel
            key={`${campaignId}:${selectedZoneId || 'none'}`}
            simple
            campaignId={campaignId}
            points={state.points}
            zones={selectedZoneRow ? [{ id: selectedZoneRow.id, ...manualPanelZoneCenter }] : []}
            boundaryGeometry={selectedZoneGeometry}
            municipalityName={activeZoneName}
            gpsOperatorCount={gpsOperatorCount}
            campaignOperators={campaignOperators}
            gpsOperators={gpsOperators}
          />
        ) : (
          <EmptyState text={state.loading
            ? 'Caricamento zona...'
            : `Confine della zona ${activeZoneName ? `"${activeZoneName}" ` : ''}non disponibile: strumenti copertura non attivabili finché il confine non è caricato.`} />
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

function GpsMap({ points, sessionTracks = [], trackVisibility = {}, showExcludedGpsPoints = false, latest, zones = [], selectedZoneGeometry = null, searchGeometry = null, mapRef }) {
  const center = useMemo(() => {
    if (selectedZoneGeometry) {
      const c = getMunicipalityCenterPoint(selectedZoneGeometry);
      if (c) return [c.lat, c.lng];
      const coord = selectedZoneGeometry.type === 'MultiPolygon'
        ? selectedZoneGeometry.coordinates?.[0]?.[0]?.[0]
        : selectedZoneGeometry.coordinates?.[0]?.[0];
      if (coord) return [coord[1], coord[0]];
    }
    // Priorità 2: ultimo punto GPS reale (una posizione reale, non un default).
    if (latest) return [Number(latest.lat), Number(latest.lng)];
    return [45.4642, 9.1900];
  }, [latest, selectedZoneGeometry]);

  const trackLayers = useMemo(() => (sessionTracks || []).map((track, index) => {
    const color = track.session?.driver_id ? getOperatorColor(track.session.driver_id) : trackColor(index);
    const validPts = track.validPoints || [];
    const excludedPts = track.excludedPoints || [];
    return {
      sessionId: track.session.id,
      driverId: track.session?.driver_id,
      color,
      visible: trackVisibility[track.session.id] !== false,
      lastPoint: track.lastPoint,
      validPoints: validPts,
      excludedPoints: excludedPts,
    };
  }), [sessionTracks, trackVisibility]);

  function getZoneStyle(zone) {
    if (zone.adjustment_type === 'inaccessible') {
      return { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.2, dashArray: '5, 10', weight: 2 };
    }
    if (zone.adjustment_type === 'manual_covered' || zone.adjustment_type === 'partially_covered') {
      return { color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.2, weight: 2 };
    }
    return { color: '#e8571a', fillColor: '#e8571a', fillOpacity: 0.08, weight: 2 };
  }

  return (
    <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <MapContainer ref={mapRef} center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {selectedZoneGeometry && <FitToZoneBounds geometry={selectedZoneGeometry} />}

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

        {/* PUNTI GPS REALI: singoli dots per ogni posizione registrata (NIENTE polyline continua) */}
        {trackLayers.filter((t) => t.visible).map((track) => (
          <Fragment key={track.sessionId}>
            {/* Punti validi dell'operatore */}
            {track.validPoints.map((point) => (
              <CircleMarker
                key={point.id}
                center={[point.lat, point.lng]}
                radius={3.5}
                pathOptions={{ color: track.color, fillColor: track.color, fillOpacity: 0.75, weight: 1 }}
              >
                <Popup>
                  <strong>Punto GPS registrato</strong>
                  <br />Ora: {formatDateTime(point.recorded_at)}
                  <br />Accuratezza: {point.accuracy != null ? `${Math.round(point.accuracy)} m` : 'n/d'}
                  {point.speed != null && <><br />Velocità: {(point.speed * 3.6).toFixed(1)} km/h</>}
                </Popup>
              </CircleMarker>
            ))}

            {/* Punti esclusi per diagnostica (se attivata) */}
            {showExcludedGpsPoints && track.excludedPoints.map((point) => (
              <CircleMarker
                key={`ex-${point.id}`}
                center={[point.lat, point.lng]}
                radius={2.5}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.5, weight: 1 }}
              >
                <Popup>
                  <strong style={{ color: '#ef4444' }}>Punto GPS escluso</strong>
                  <br />Ora: {formatDateTime(point.recorded_at)}
                  <br />Motivo: {point.exclusionReason || 'Qualità non sufficiente (accuratezza o salto)'}
                  <br />Accuratezza: {point.accuracy != null ? `${Math.round(point.accuracy)} m` : 'n/d'}
                </Popup>
              </CircleMarker>
            ))}

            {/* Ultimo punto operatore (marker pulsante) */}
            {track.lastPoint && (
              <CircleMarker
                center={[Number(track.lastPoint.lat), Number(track.lastPoint.lng)]}
                radius={7.5}
                pathOptions={{ color: track.color, fillColor: track.color, fillOpacity: 0.95, weight: 2 }}
              >
                <Popup>
                  <strong>Ultima posizione rilevata</strong>
                  <br />{formatDateTime(track.lastPoint.recorded_at)}
                  <br />Accuratezza: {track.lastPoint.accuracy != null ? `${Math.round(track.lastPoint.accuracy)} m` : 'n/d'}
                </Popup>
              </CircleMarker>
            )}
          </Fragment>
        ))}

        {latest && (
          <CircleMarker center={[latest.lat, latest.lng]} radius={8.5} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9, weight: 2 }}>
            <Popup><strong>Ultimo punto generale campagna</strong><br />{formatDateTime(latest.recorded_at)}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

function calculatePointsDistanceKm(points) {
  if (!points || points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const lat1 = Number(p1.lat);
    const lng1 = Number(p1.lng);
    const lat2 = Number(p2.lat);
    const lng2 = Number(p2.lng);
    if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) continue;
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalMeters += R * c;
  }
  return totalMeters / 1000;
}

// Pannello operatori: TUTTE le sessioni della campagna contemporaneamente,
// una riga per operatore, con traccia distinguibile,
// stato (ONLINE / IN PAUSA / OFFLINE / TERMINATO), conteggi punti, km e toggle
// mostra/nascondi la traccia sulla mappa.
export function GpsMonitorOperatorsPanel({ sessionTracks = [], canonicalOperators = [], assignedOperatorCount = 0, operatorsWithGpsCount = 0, trackVisibility = {}, toggleTrack, zoneRows = [], activeSessionId, formatDateTime: fmt, onUnlockDevice }) {
  if (!sessionTracks.length && !canonicalOperators.length) return null;
  const format = fmt || ((v) => (v ? new Date(v).toLocaleString('it-IT') : 'n/d'));
  const opByDriver = new Map(canonicalOperators.filter((o) => o.operatorId).map((o) => [o.operatorId, o]));
  const zoneNameById = new Map((zoneRows || []).map((z) => [z.id, z.zone_name]));

  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', fontWeight: 900 }}>
        OPERATORI: {assignedOperatorCount}{operatorsWithGpsCount > 0 ? ` · CON GPS: ${operatorsWithGpsCount}` : ''}
      </div>

      {/* OPERATORI CAMPAGNA — legenda: TUTTI gli operatori assegnati, nome reale + colore stabile */}
      {canonicalOperators.length > 0 && (
        <div style={{ display: 'grid', gap: 4, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
          {canonicalOperators.map((op) => (
            <div key={`canon-${op.colorKey}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.78)' }}>
              <span style={{ width: 11, height: 11, borderRadius: 999, background: op.color, border: '1px solid rgba(0,0,0,.35)', flex: '0 0 auto' }} />
              {op.displayName}
              {op.hasGps && <span style={{ fontSize: 10, fontWeight: 900, color: '#22c55e' }}>GPS</span>}
              {!op.assigned && <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>(assegnazione revocata)</span>}
            </div>
          ))}
        </div>
      )}

      {sessionTracks.map((track, index) => {
        const canonOp = opByDriver.get(track.session?.driver_id) || null;
        const color = canonOp?.color
          || (track.session?.driver_id ? getOperatorColor(track.session.driver_id) : trackColor(index));
        const rowTitle = canonOp?.displayName
          || (track.session?.driver_id ? `Operatore ${shortOperatorId(track.session.driver_id)}` : `Operatore ${index + 1}`);
        const statusLabel = operatorStatusLabel(track);
        const visible = trackVisibility[track.session.id] !== false;
        const lastAt = track.lastPoint?.recorded_at || track.session.updated_at || track.session.started_at || null;
        const assignedZoneName = zoneNameById.get(track.session?.campaign_zone_id) || (canonOp?.zoneId && zoneNameById.get(canonOp.zoneId)) || null;
        const distKm = calculatePointsDistanceKm(track.validPoints);

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
            <strong style={{ color: '#fff', fontSize: 13 }}>{rowTitle}</strong>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.04em', color:
              statusLabel === 'ONLINE' ? '#22c55e' : statusLabel === 'IN PAUSA' ? '#fbbf24' : statusLabel === 'TERMINATO' ? '#94a3b8' : '#f87171' }}>
              {statusLabel}
            </span>
            {assignedZoneName && (
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,.06)', padding: '2px 8px', borderRadius: 6, color: 'rgba(255,255,255,.7)' }}>
                Zona: {assignedZoneName}
              </span>
            )}
            <span style={{ fontSize: 12, color: '#2ecc8a', fontWeight: 700 }}>
              {distKm.toFixed(1)} km
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
              {track.points.length} punti ({track.validPoints.length} validi · {track.excludedPoints.length} scartati)
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

function operatorFilterChipStyle(active) {
  return {
    border: '1px solid',
    borderColor: active ? '#e8571a' : 'rgba(255,255,255,.16)',
    background: active ? 'rgba(232,87,26,.22)' : 'rgba(255,255,255,.04)',
    color: '#fff',
    borderRadius: 999,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: active ? 900 : 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
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
