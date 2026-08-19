import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  COVERAGE_ADJUSTMENT_TYPES,
  createCoverageAdjustment,
  getFinalCoverage,
  listCoverageAdjustments,
  revokeCoverageAdjustment,
  updateCoverageAdjustment,
} from '../../lib/services/coverage-adjustments-api.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { geoJsonPolygonToLeafletPositions } from '../../lib/geo/geoJsonToLeaflet.js';
import { geoJsonContainsPoint } from '../../lib/geo/pointInPolygon.js';

// Modello obbligatorio: traccia GPS reale + correzioni manuali Admin + zone
// non accessibili = copertura operativa finale. Questo componente non scrive
// mai su gps_tracking_points/delivery_sessions: legge solo `points` (props),
// tutte le scritture passano dalle RPC admin_*_coverage_adjustment.

// Legenda fissa (ticket F): ARANCIONE = confine comune (mai un adjustment),
// BLU = traccia GPS reale, VIOLA = copertura manuale Admin. 'inaccessible'
// spostato da arancione (ora riservato al confine) a rosso tratteggiato, per
// non confondere "zona non accessibile" col confine del comune.
const BOUNDARY_COLOR = '#f97316'; // arancione — SOLO confine comune
const TYPE_COLORS = {
  manual_covered: '#a855f7', // viola
  partially_covered: '#a855f7',
  inaccessible: '#dc2626', // rosso tratteggiato — area non accessibile
};

// P1: operatori Admin manuali (MAN-01..MAN-04), identificativi neutrali —
// MAI nomi di persone reali inesistenti. Il colore del BORDO del poligono
// distingue l'operatore; il RIEMPIMENTO resta TYPE_COLORS (il tipo di
// correzione — coperta/non accessibile — non deve perdere il suo
// significato visivo esistente).
export const MAX_MANUAL_OPERATORS = 4;
const MANUAL_OPERATOR_COLORS = ['#0f766e', '#d97706', '#db2777', '#6366f1'];
const UNASSIGNED_OPERATOR_COLOR = '#94a3b8'; // correzioni create prima di questa funzione, nessun operator_key
function manualOperatorKeyFor(index) {
  return `MAN-${String(index + 1).padStart(2, '0')}`;
}
function manualOperatorColor(operatorKey) {
  if (!operatorKey) return UNASSIGNED_OPERATOR_COLOR;
  const idx = parseInt(String(operatorKey).split('-')[1], 10) - 1;
  return MANUAL_OPERATOR_COLORS[Number.isFinite(idx) && idx >= 0 ? idx % MANUAL_OPERATOR_COLORS.length : 0];
}

const TYPE_LABELS = Object.fromEntries(COVERAGE_ADJUSTMENT_TYPES.map((t) => [t.value, t.label]));

function polygonGeoJsonToLatLngs(geometry) {
  const ring = geometry?.coordinates?.[0];
  if (!Array.isArray(ring)) return [];
  return ring.map(([lng, lat]) => [lat, lng]);
}


function latLngsToPolygonGeoJson(latlngs) {
  const ring = latlngs.map(([lat, lng]) => [lng, lat]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

// Approssimazione planare (equirettangolare) solo per l'anteprima immediata
// lato client: il valore ufficiale, usato per salvare e per la copertura
// finale, viene sempre ricalcolato dal server con PostGIS su geography reale.
function approxPolygonAreaM2(latlngs) {
  if (latlngs.length < 3) return 0;
  const R = 6371000;
  const latRef = (latlngs.reduce((s, [lat]) => s + lat, 0) / latlngs.length) * (Math.PI / 180);
  const pts = latlngs.map(([lat, lng]) => [
    (lng * Math.PI / 180) * R * Math.cos(latRef),
    (lat * Math.PI / 180) * R,
  ]);
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function manualOperatorDivIcon(label, color) {
  return L.divIcon({
    className: 'admin-operator-marker',
    html: `<div style="width:22px;height:22px;border-radius:999px;background:${color};border:2px solid #111827;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function DrawClickCapture({ active, onAddPoint }) {
  useMapEvents({
    click(event) {
      if (!active) return;
      onAddPoint([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function CoverageAdjustmentPanel({ campaignId, points = [], zones = [], boundaryGeometry = null, gpsOperatorCount = 0 }) {
  const [adjustments, setAdjustments] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [correcting, setCorrecting] = useState(false);
  // P0 (ticket C): un solo array di vertici collegava automaticamente click
  // in aree geograficamente separate con una linea/lato del poligono che
  // attraversava lo spazio vuoto tra loro (es. due quartieri non contigui di
  // Barasso). Ora ogni "area chiusa" e' il proprio array di vertici dentro
  // draftAreas; activeVertices e' SOLO l'area attualmente in disegno, mai
  // collegata alle precedenti. Al salvataggio ogni area diventa una riga
  // campaign_coverage_adjustments separata (stesso zone_id/tipo/motivo) —
  // nessuna riga collega due poligoni tra loro, coerente con la colonna DB
  // tipizzata Polygon singolo (vedi audit sotto, nessun cambio schema).
  const [draftAreas, setDraftAreas] = useState([]);
  const [activeVertices, setActiveVertices] = useState([]);
  const [draftType, setDraftType] = useState('manual_covered');
  const [draftReason, setDraftReason] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetailedPoints, setShowDetailedPoints] = useState(false);
  // P1: numero di operatori Admin manuali disponibili (MAN-01..MAN-0N) e
  // operatore assegnato all'area/correzione in disegno. Nessuna
  // persistenza per il contatore stesso (Fase 10): solo il singolo
  // operator_key scelto viene salvato, dentro il campo metadata jsonb gia'
  // esistente su campaign_coverage_adjustments — nessun cambio schema.
  const [manualOperatorCount, setManualOperatorCount] = useState(1);
  const [selectedOperatorKey, setSelectedOperatorKey] = useState('MAN-01');

  const validPoints = useMemo(() => filterValidGpsPoints(points).valid, [points]);
  const path = validPoints.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  const first = path[0] || null;
  const last = path[path.length - 1] || null;
  // P0: il centro iniziale della mappa di disegno DEVE essere la zona
  // selezionata, mai la posizione del Driver. Prima la traccia GPS reale
  // (`last`/`first`) aveva priorita' sul centro zona: con un Driver
  // realmente lontano (es. Beirut/Libano) la mappa manuale si apriva li',
  // rendendo impossibile disegnare sulla zona campagna corretta (Barasso).
  // Il centro zona (centroide del boundary reale, calcolato dal chiamante)
  // ha ora sempre priorita' quando disponibile; la traccia GPS resta
  // visibile come layer di sola lettura ma non controlla piu' il centro.
  const zoneCenter = zones[0]?.center_lat ? [zones[0].center_lat, zones[0].center_lng] : null;
  const center = zoneCenter || last || first || [45.4642, 9.19];

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [adj, cov] = await Promise.all([
        listCoverageAdjustments(campaignId),
        getFinalCoverage(campaignId),
      ]);
      setAdjustments(Array.isArray(adj) ? adj : []);
      setCoverage(cov);
    } catch (err) {
      setError(err?.message || 'Correzioni copertura non disponibili.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [adj, cov] = await Promise.all([
          listCoverageAdjustments(campaignId),
          getFinalCoverage(campaignId),
        ]);
        if (cancelled) return;
        setAdjustments(Array.isArray(adj) ? adj : []);
        setCoverage(cov);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Correzioni copertura non disponibili.');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  const startCorrecting = () => {
    setCorrecting(true);
    setEditingId(null);
    setDraftAreas([]);
    setActiveVertices([]);
    setDraftType('manual_covered');
    setDraftReason('');
    setDraftNotes('');
    setSelectedOperatorKey('MAN-01');
    setFormError(null);
  };

  const startEditing = (adjustment) => {
    // Modifica di una riga esistente = un solo poligono (la colonna DB e'
    // tipizzata Polygon singolo per riga): niente multi-area qui, il
    // workflow "Nuova area" resta disabilitato durante la modifica. Per
    // aggiungere altre aree alla stessa correzione, l'Admin ne crea di
    // nuove con "Correggi copertura" (mai cancellate, solo revocate, come
    // il resto del modello di audit di questa tabella).
    setCorrecting(true);
    setEditingId(adjustment.id);
    setDraftAreas([]);
    setActiveVertices(polygonGeoJsonToLatLngs(adjustment.geometry));
    setDraftType(adjustment.adjustment_type);
    setDraftReason(adjustment.reason || '');
    setDraftNotes(adjustment.notes || '');
    const existingKey = adjustment.metadata?.operator_key || 'MAN-01';
    setSelectedOperatorKey(existingKey);
    // Se l'operatore gia' assegnato ha un indice oltre il contatore
    // corrente (es. adjustment MAN-03 ma il selettore e' su 1), allarga il
    // contatore cosi' il suo pulsante resta visibile/selezionabile.
    const existingIndex = parseInt(existingKey.split('-')[1], 10);
    if (Number.isFinite(existingIndex) && existingIndex > manualOperatorCount) {
      setManualOperatorCount(Math.min(MAX_MANUAL_OPERATORS, existingIndex));
    }
    setFormError(null);
  };

  const cancelCorrecting = () => {
    setCorrecting(false);
    setEditingId(null);
    setDraftAreas([]);
    setActiveVertices([]);
    setFormError(null);
  };

  const undoLastPoint = () => setActiveVertices((prev) => prev.slice(0, -1));

  // "Nuova area" (ticket C, passo 1/4): l'area corrente deve essere gia'
  // chiusa (o vuota). Se l'Admin clicca "Nuova area" con vertici ancora
  // aperti, blocchiamo con un messaggio invece di chiuderla in silenzio: un
  // "Chiudi area" implicito nasconderebbe esattamente l'errore che questo
  // fix vuole eliminare (poligoni uniti senza che l'Admin lo intenda).
  const handleNewArea = () => {
    if (editingId) return;
    if (activeVertices.length > 0) {
      setFormError('Chiudi l\'area corrente ("Chiudi area") prima di iniziarne una nuova.');
      return;
    }
    setFormError(null);
  };

  const handleCloseArea = () => {
    if (activeVertices.length < 3) {
      setFormError('Disegna almeno 3 vertici prima di chiudere l\'area.');
      return;
    }
    setDraftAreas((prev) => [...prev, activeVertices]);
    setActiveVertices([]);
    setFormError(null);
  };

  const handleClearActiveArea = () => {
    setActiveVertices([]);
    setFormError(null);
  };

  const handleClearAllAreas = () => {
    setDraftAreas([]);
    setActiveVertices([]);
    setFormError(null);
  };

  // Ticket E: nessuna clip geometrica (richiederebbe una libreria come
  // turf, non presente — nessuna dipendenza aggiunta senza necessita'
  // provata). In alternativa esplicitamente prevista dal ticket: bloccare
  // il salvataggio con un messaggio chiaro. Controllo per vertici (non per
  // bordo continuo: un'approssimazione dichiarata, coerente con le altre
  // stime lato client di questo pannello che vengono sempre ricalcolate
  // server-side).
  function areaOutsideBoundary(vertices) {
    if (!boundaryGeometry) return false;
    return vertices.some(([lat, lng]) => !geoJsonContainsPoint(boundaryGeometry, lat, lng));
  }

  const handleSave = async () => {
    if (!draftReason.trim()) {
      setFormError('Il motivo e’ obbligatorio.');
      return;
    }
    // Modifica (editingId): activeVertices E' l'unico poligono della riga,
    // niente "Chiudi area" — salva direttamente quel poligono.
    // Nuova correzione: ogni area deve essere gia' chiusa in draftAreas;
    // un'area ancora in disegno blocca il salvataggio invece di essere
    // chiusa in automatico (stesso motivo del blocco in "Nuova area" sopra).
    let areas;
    if (editingId) {
      if (activeVertices.length < 3) {
        setFormError('Disegna almeno 3 vertici prima di salvare.');
        return;
      }
      areas = [activeVertices];
    } else {
      if (activeVertices.length > 0) {
        setFormError('Chiudi l\'area in disegno ("Chiudi area") o cancellala prima di salvare.');
        return;
      }
      if (draftAreas.length === 0) {
        setFormError('Disegna almeno un\'area (minimo 3 vertici, poi "Chiudi area") prima di salvare.');
        return;
      }
      areas = draftAreas;
    }
    for (let i = 0; i < areas.length; i += 1) {
      if (areaOutsideBoundary(areas[i])) {
        setFormError(`L'area ${i + 1} esce dal confine del comune selezionato. Correggi i vertici o cancella quest'area prima di salvare.`);
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    try {
      // P1: operator_key nel campo metadata jsonb gia' esistente (nessun
      // cambio schema — vedi audit). admin_operator:true marca esplicitamente
      // che questa correzione e' un'integrazione Admin simulata, MAI dati
      // GPS reali di gps_tracking_points/delivery_sessions.
      const metadata = { operator_key: selectedOperatorKey, admin_operator: true };
      if (editingId) {
        await updateCoverageAdjustment({
          adjustmentId: editingId,
          adjustmentType: draftType,
          geometryGeoJson: latLngsToPolygonGeoJson(areas[0]),
          reason: draftReason.trim(),
          notes: draftNotes.trim() || null,
          metadata,
        });
      } else {
        // Un adjustment per area (ticket D: la colonna geometry e' tipizzata
        // Polygon singolo, nessuna MultiPolygon multi-parte ammessa dalla
        // RPC) — tutte riferite alla stessa zone_id/tipo/motivo, cosi' due
        // aree separate non vengono mai unite in un'unica geometria che le
        // collegherebbe. calculate_zone_final_coverage le unisce (ST_Union)
        // gia' oggi per il calcolo aggregato, nessuna riscrittura li'.
        for (const area of areas) {
          await createCoverageAdjustment({
            campaignId,
            zoneId: zones[0]?.id ?? null,
            adjustmentType: draftType,
            geometryGeoJson: latLngsToPolygonGeoJson(area),
            reason: draftReason.trim(),
            notes: draftNotes.trim() || null,
            metadata,
          });
        }
      }
      cancelCorrecting();
      await load();
    } catch (err) {
      setFormError(err?.message || 'Salvataggio non riuscito.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (adjustment) => {
    const reason = window.prompt('Motivo della revoca (obbligatorio):', '');
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert('Il motivo della revoca e’ obbligatorio.');
      return;
    }
    try {
      await revokeCoverageAdjustment({ adjustmentId: adjustment.id, reason: reason.trim() });
      await load();
    } catch (err) {
      window.alert(err?.message || 'Revoca non riuscita.');
    }
  };

  const activeAdjustments = adjustments.filter((a) => !a.revoked_at);
  const revokedAdjustments = adjustments.filter((a) => a.revoked_at);
  const previewAreaM2 = activeVertices.length >= 3 ? approxPolygonAreaM2(activeVertices) : 0;
  const activeAreaOutsideBoundary = activeVertices.length >= 3 && areaOutsideBoundary(activeVertices);

  // Operatori distinti realmente presenti tra le correzioni attive (non il
  // solo contatore UI) — usati per legenda/KPI, cosi' riflettono i dati
  // reali anche se manualOperatorCount cambia dopo che le aree sono state
  // salvate.
  const presentOperatorKeys = [...new Set(activeAdjustments.map((a) => a.metadata?.operator_key).filter(Boolean))].sort();

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={eyebrowStyle}>Copertura operativa (GPS + correzioni Admin)</p>
        {!correcting ? (
          <button type="button" onClick={startCorrecting} style={primaryButtonStyle}>Correggi copertura</button>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!editingId && (
              <button type="button" onClick={handleNewArea} disabled={activeVertices.length > 0} style={secondaryButtonStyle}>Nuova area</button>
            )}
            {!editingId && (
              <button type="button" onClick={handleCloseArea} disabled={activeVertices.length < 3} style={secondaryButtonStyle}>Chiudi area</button>
            )}
            <button type="button" onClick={undoLastPoint} disabled={!activeVertices.length} style={secondaryButtonStyle}>Annulla ultimo punto</button>
            <button type="button" onClick={handleClearActiveArea} disabled={!activeVertices.length} style={secondaryButtonStyle}>Cancella area</button>
            {!editingId && (
              <button type="button" onClick={handleClearAllAreas} disabled={!draftAreas.length && !activeVertices.length} style={secondaryButtonStyle}>Cancella tutto</button>
            )}
            <button type="button" onClick={cancelCorrecting} style={secondaryButtonStyle}>Annulla</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Operatori Admin manuali</span>
        {Array.from({ length: MAX_MANUAL_OPERATORS }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" onClick={() => setManualOperatorCount(n)} style={{ ...secondaryButtonStyle, background: manualOperatorCount === n ? '#0f766e' : secondaryButtonStyle.background, border: manualOperatorCount === n ? 'none' : secondaryButtonStyle.border }}>{n}</button>
        ))}
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {coverage && coverage.calculation_status === 'ready' && (
        <div style={coverageGridStyle}>
          <CoverageMetric label="Copertura GPS" value={coverage.gps_coverage_pct} color="#22c55e" />
          <CoverageMetric label="Copertura manuale" value={coverage.manual_coverage_pct} color="#a855f7" />
          <CoverageMetric label="Area non accessibile" value={coverage.inaccessible_area_pct} color="#f97316" />
          <CoverageMetric label="Copertura finale" value={coverage.final_operational_coverage_pct} color="#e8571a" emphasize />
        </div>
      )}
      {coverage && coverage.calculation_status !== 'ready' && (
        <div style={{ ...errorStyle, background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.6)' }}>
          Copertura non calcolabile: {coverage.reason_not_calculable || coverage.calculation_status}
        </div>
      )}

      {correcting && (
        <div style={formStyle}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
            {editingId
              ? `Clicca sulla mappa per aggiungere i vertici del poligono (${activeVertices.length} inseriti, minimo 3).`
              : `Area in disegno: ${activeVertices.length} vertici (minimo 3, poi "Chiudi area"). Aree chiuse: ${draftAreas.length}.`}
          </p>
          <label style={labelStyle}>
            Tipo correzione
            <select value={draftType} onChange={(e) => setDraftType(e.target.value)} style={inputStyle}>
              {COVERAGE_ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Operatore
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {Array.from({ length: manualOperatorCount }, (_, i) => manualOperatorKeyFor(i)).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedOperatorKey(key)}
                  style={{
                    border: selectedOperatorKey === key ? 'none' : '1px solid rgba(255,255,255,.14)',
                    borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    background: selectedOperatorKey === key ? manualOperatorColor(key) : 'rgba(255,255,255,.05)',
                    color: '#fff',
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </label>
          <label style={labelStyle}>
            Motivo (obbligatorio)
            <textarea value={draftReason} onChange={(e) => setDraftReason(e.target.value)} rows={2} style={inputStyle} placeholder="Es. distribuzione a piedi confermata senza tracker attivo" />
          </label>
          <label style={labelStyle}>
            Note (facoltative)
            <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={2} style={inputStyle} />
          </label>
          {activeVertices.length >= 3 && (
            <p style={{ margin: '4px 0', fontSize: 12, color: activeAreaOutsideBoundary ? '#fca5a5' : 'rgba(255,255,255,.55)' }}>
              Anteprima area: ~{Math.round(previewAreaM2).toLocaleString('it-IT')} m² (stima client, il valore ufficiale viene ricalcolato al salvataggio).
              {activeAreaOutsideBoundary ? ' Attenzione: esce dal confine del comune.' : ''}
            </p>
          )}
          {formError && <div style={errorStyle}>{formError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={handleSave} disabled={saving} style={primaryButtonStyle}>{saving ? 'Salvataggio...' : 'Salva'}</button>
            <button type="button" onClick={cancelCorrecting} disabled={saving} style={secondaryButtonStyle}>Annulla</button>
          </div>
        </div>
      )}

      <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', marginTop: 12 }}>
        <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <DrawClickCapture active={correcting} onAddPoint={(pt) => setActiveVertices((prev) => [...prev, pt])} />

          {boundaryGeometry && geoJsonPolygonToLeafletPositions(boundaryGeometry).length > 0 && (
            <Polygon
              positions={geoJsonPolygonToLeafletPositions(boundaryGeometry)}
              pathOptions={{ color: BOUNDARY_COLOR, weight: 2, dashArray: '6 4', fill: false }}
              interactive={false}
            />
          )}

          {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }} />}
          {coverage?.gps_coverage_geometry && (
            <Polygon
              positions={polygonGeoJsonToLatLngs(coverage.gps_coverage_geometry.type === 'Polygon' ? coverage.gps_coverage_geometry : { coordinates: coverage.gps_coverage_geometry.coordinates?.[0] })}
              pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.18, weight: 1 }}
            />
          )}

          {activeAdjustments.map((adj) => (
            <Polygon
              key={adj.id}
              positions={polygonGeoJsonToLatLngs(adj.geometry)}
              pathOptions={{
                // P1: il BORDO distingue l'operatore Admin, il RIEMPIMENTO
                // resta legato al tipo di correzione (coperta/non
                // accessibile) — nessuna delle due informazioni si perde.
                color: manualOperatorColor(adj.metadata?.operator_key),
                fillColor: TYPE_COLORS[adj.adjustment_type] || '#a855f7',
                fillOpacity: adj.adjustment_type === 'inaccessible' ? 0.08 : 0.22,
                weight: 3,
                dashArray: adj.adjustment_type === 'inaccessible' ? '8 6' : undefined,
              }}
              eventHandlers={{ click: () => !correcting && startEditing(adj) }}
            >
              <Popup>
                <strong>{TYPE_LABELS[adj.adjustment_type]}</strong>{adj.metadata?.operator_key ? ` — ${adj.metadata.operator_key}` : ''}<br />
                {adj.reason}<br />
                {adj.updated_at ? new Date(adj.updated_at).toLocaleString('it-IT') : ''}
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => startEditing(adj)}>Modifica</button>{' '}
                  <button type="button" onClick={() => handleRevoke(adj)}>Revoca</button>
                </div>
              </Popup>
            </Polygon>
          ))}
          {/* Un solo marker START per operatore (Fase 6: no marker per ogni
              area), sulla prima correzione attiva trovata per quell'operatore. */}
          {presentOperatorKeys.map((key) => {
            const firstAdj = activeAdjustments.find((a) => a.metadata?.operator_key === key);
            const pos = firstAdj ? polygonGeoJsonToLatLngs(firstAdj.geometry)[0] : null;
            return pos ? (
              <Marker key={`man-start-${key}`} position={pos} icon={manualOperatorDivIcon(`M${key.split('-')[1]}`, manualOperatorColor(key))} />
            ) : null;
          })}

          {/* Ogni area chiusa e' il proprio Polygon indipendente — nessun
              lato disegnato tra un'area e la successiva (ticket C). */}
          {correcting && !editingId && draftAreas.map((area, i) => (
            <Polygon
              key={`draft-area-${i}`}
              positions={area}
              pathOptions={{ color: TYPE_COLORS[draftType], fillColor: TYPE_COLORS[draftType], fillOpacity: 0.25, weight: 2, dashArray: '4 4' }}
            />
          ))}
          {correcting && activeVertices.length > 0 && (
            <Polygon
              positions={activeVertices}
              pathOptions={{
                color: activeAreaOutsideBoundary ? '#dc2626' : TYPE_COLORS[draftType],
                fillColor: activeAreaOutsideBoundary ? '#dc2626' : TYPE_COLORS[draftType],
                fillOpacity: 0.25,
                weight: 2,
                dashArray: '4 4',
              }}
            />
          )}
          {correcting && activeVertices.map((v, i) => (
            <CircleMarker key={i} center={v} radius={5} pathOptions={{ color: '#111827', fillColor: '#fff', fillOpacity: 1 }} />
          ))}

          {showDetailedPoints && validPoints.map((p) => (
            <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={3} pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.6 }}>
              <Popup>{p.recorded_at ? new Date(p.recorded_at).toLocaleString('it-IT') : ''}</Popup>
            </CircleMarker>
          ))}

          {first && (
            <CircleMarker center={first} radius={7} pathOptions={{ color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.9 }}>
              <Popup>Partenza</Popup>
            </CircleMarker>
          )}
          {last && (
            <CircleMarker center={last} radius={8} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
              <Popup>Ultima posizione</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
        <input type="checkbox" checked={showDetailedPoints} onChange={(e) => setShowDetailedPoints(e.target.checked)} />
        Mostra ogni punto GPS dettagliato (solo su richiesta)
      </label>

      <Legend presentOperatorKeys={presentOperatorKeys} />
      {(presentOperatorKeys.length > 0 || gpsOperatorCount > 0) && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
          Operatori GPS reali: {gpsOperatorCount} · Operatori Admin manuali: {presentOperatorKeys.length}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={() => setShowHistory((v) => !v)} style={secondaryButtonStyle}>
          {showHistory ? 'Nascondi storico correzioni' : `Storico correzioni (${adjustments.length})`}
        </button>
        {showHistory && (
          <div style={{ marginTop: 8 }}>
            {loading && <EmptyState text="Caricamento correzioni..." />}
            {!loading && !adjustments.length && <EmptyState text="Nessuna correzione registrata per questa campagna." />}
            {activeAdjustments.map((adj) => (
              <AdjustmentRow key={adj.id} adjustment={adj} onEdit={() => startEditing(adj)} onRevoke={() => handleRevoke(adj)} />
            ))}
            {revokedAdjustments.map((adj) => (
              <AdjustmentRow key={adj.id} adjustment={adj} revoked />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AdjustmentRow({ adjustment, onEdit, onRevoke, revoked = false }) {
  return (
    <div style={{ ...rowStyle, opacity: revoked ? 0.55 : 1, color: revoked ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.8)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: revoked ? '#6b7280' : TYPE_COLORS[adjustment.adjustment_type] }} />
      <strong>{TYPE_LABELS[adjustment.adjustment_type] || adjustment.adjustment_type}</strong>
      <span>{adjustment.reason}</span>
      {adjustment.notes && <span style={{ color: 'rgba(255,255,255,.45)' }}>{adjustment.notes}</span>}
      <span>{adjustment.updated_at ? new Date(adjustment.updated_at).toLocaleString('it-IT') : ''}</span>
      {revoked && <span style={{ fontStyle: 'italic' }}>revocata: {adjustment.revoke_reason}</span>}
      {!revoked && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" onClick={onEdit} style={secondaryButtonStyle}>Modifica</button>
          <button type="button" onClick={onRevoke} style={secondaryButtonStyle}>Revoca</button>
        </span>
      )}
    </div>
  );
}

function CoverageMetric({ label, value, color, emphasize = false }) {
  return (
    <div style={{ ...coverageMetricStyle, borderColor: emphasize ? color : 'rgba(255,255,255,.08)' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <strong style={{ fontSize: emphasize ? 22 : 18, color }}>{value != null ? `${value}%` : '—'}</strong>
    </div>
  );
}

function Legend({ presentOperatorKeys = [] }) {
  const items = [
    { color: BOUNDARY_COLOR, label: 'Confine comune (zona selezionata)', dashed: true },
    { color: '#2563eb', label: 'Traccia GPS reale' },
    { color: '#22c55e', label: 'Copertura GPS', fillOnly: true },
    ...(presentOperatorKeys.length > 0
      ? presentOperatorKeys.map((key) => ({ color: manualOperatorColor(key), label: `${key} — Integrazione manuale Admin` }))
      : [{ color: '#a855f7', label: 'Copertura manuale Admin', fillOnly: true }]),
    { color: '#dc2626', label: 'Area non accessibile', dashed: true },
    { color: '#6b7280', label: 'Correzione revocata (storico Admin)' },
  ];
  return (
    <div style={legendStyle}>
      {items.map((item) => (
        <span key={item.label} style={legendItemStyle}>
          <span style={{
            width: 14, height: item.fillOnly ? 10 : 3, background: item.fillOnly ? `${item.color}44` : item.color,
            border: item.fillOnly ? `1px solid ${item.color}` : 'none',
            borderStyle: item.dashed ? 'dashed' : 'solid',
            borderRadius: item.fillOnly ? 2 : 0,
          }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' }}>{text}</div>;
}

const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(0,0,0,.24)', color: '#fff' };
const eyebrowStyle = { margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const primaryButtonStyle = { background: '#e8571a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 800, padding: '8px 14px', cursor: 'pointer' };
const secondaryButtonStyle = { background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 10px', cursor: 'pointer' };
const errorStyle = { padding: 10, borderRadius: 8, color: '#fecaca', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', marginTop: 8, fontSize: 12 };
const formStyle = { marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 8 };
const inputStyle = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 6, color: '#fff', padding: '6px 8px', fontFamily: 'inherit', fontSize: 13 };
const coverageGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginTop: 12 };
const coverageMetricStyle = { display: 'grid', gap: 4, padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid' };
const legendStyle = { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.6)' };
const legendItemStyle = { display: 'flex', alignItems: 'center', gap: 6 };
const rowStyle = { display: 'flex', gap: 12, padding: 10, borderBottom: '1px solid rgba(255,255,255,.07)', alignItems: 'center', flexWrap: 'wrap', fontSize: 13 };
