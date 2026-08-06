import 'leaflet/dist/leaflet.css';
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

// Modello obbligatorio: traccia GPS reale + correzioni manuali Admin + zone
// non accessibili = copertura operativa finale. Questo componente non scrive
// mai su gps_tracking_points/delivery_sessions: legge solo `points` (props),
// tutte le scritture passano dalle RPC admin_*_coverage_adjustment.

const TYPE_COLORS = {
  manual_covered: '#a855f7', // viola
  partially_covered: '#a855f7',
  inaccessible: '#f97316', // arancione tratteggiato
};

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

function DrawClickCapture({ active, onAddPoint }) {
  useMapEvents({
    click(event) {
      if (!active) return;
      onAddPoint([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function CoverageAdjustmentPanel({ campaignId, points = [], zones = [] }) {
  const [adjustments, setAdjustments] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [correcting, setCorrecting] = useState(false);
  const [draftVertices, setDraftVertices] = useState([]);
  const [draftType, setDraftType] = useState('manual_covered');
  const [draftReason, setDraftReason] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetailedPoints, setShowDetailedPoints] = useState(false);

  const validPoints = useMemo(() => filterValidGpsPoints(points).valid, [points]);
  const path = validPoints.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  const first = path[0] || null;
  const last = path[path.length - 1] || null;
  const center = last || first || (zones[0]?.center_lat ? [zones[0].center_lat, zones[0].center_lng] : [45.4642, 9.19]);

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
    setDraftVertices([]);
    setDraftType('manual_covered');
    setDraftReason('');
    setDraftNotes('');
    setFormError(null);
  };

  const startEditing = (adjustment) => {
    setCorrecting(true);
    setEditingId(adjustment.id);
    setDraftVertices(polygonGeoJsonToLatLngs(adjustment.geometry));
    setDraftType(adjustment.adjustment_type);
    setDraftReason(adjustment.reason || '');
    setDraftNotes(adjustment.notes || '');
    setFormError(null);
  };

  const cancelCorrecting = () => {
    setCorrecting(false);
    setEditingId(null);
    setDraftVertices([]);
    setFormError(null);
  };

  const undoLastVertex = () => setDraftVertices((prev) => prev.slice(0, -1));

  const handleSave = async () => {
    if (draftVertices.length < 3) {
      setFormError('Disegna almeno 3 vertici sulla mappa prima di salvare.');
      return;
    }
    if (!draftReason.trim()) {
      setFormError('Il motivo e’ obbligatorio.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const geometryGeoJson = latLngsToPolygonGeoJson(draftVertices);
      if (editingId) {
        await updateCoverageAdjustment({
          adjustmentId: editingId,
          adjustmentType: draftType,
          geometryGeoJson,
          reason: draftReason.trim(),
          notes: draftNotes.trim() || null,
        });
      } else {
        await createCoverageAdjustment({
          campaignId,
          zoneId: zones[0]?.id ?? null,
          adjustmentType: draftType,
          geometryGeoJson,
          reason: draftReason.trim(),
          notes: draftNotes.trim() || null,
        });
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
  const previewAreaM2 = draftVertices.length >= 3 ? approxPolygonAreaM2(draftVertices) : 0;

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={eyebrowStyle}>Copertura operativa (GPS + correzioni Admin)</p>
        {!correcting ? (
          <button type="button" onClick={startCorrecting} style={primaryButtonStyle}>Correggi copertura</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={undoLastVertex} disabled={!draftVertices.length} style={secondaryButtonStyle}>Annulla ultimo vertice</button>
            <button type="button" onClick={cancelCorrecting} style={secondaryButtonStyle}>Annulla</button>
          </div>
        )}
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
            Clicca sulla mappa per aggiungere i vertici del poligono ({draftVertices.length} inseriti, minimo 3).
          </p>
          <label style={labelStyle}>
            Tipo correzione
            <select value={draftType} onChange={(e) => setDraftType(e.target.value)} style={inputStyle}>
              {COVERAGE_ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Motivo (obbligatorio)
            <textarea value={draftReason} onChange={(e) => setDraftReason(e.target.value)} rows={2} style={inputStyle} placeholder="Es. distribuzione a piedi confermata senza tracker attivo" />
          </label>
          <label style={labelStyle}>
            Note (facoltative)
            <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={2} style={inputStyle} />
          </label>
          {draftVertices.length >= 3 && (
            <p style={{ margin: '4px 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
              Anteprima area: ~{Math.round(previewAreaM2).toLocaleString('it-IT')} m² (stima client, il valore ufficiale viene ricalcolato al salvataggio).
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
          <DrawClickCapture active={correcting} onAddPoint={(pt) => setDraftVertices((prev) => [...prev, pt])} />

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
                color: TYPE_COLORS[adj.adjustment_type] || '#a855f7',
                fillColor: TYPE_COLORS[adj.adjustment_type] || '#a855f7',
                fillOpacity: adj.adjustment_type === 'inaccessible' ? 0.08 : 0.22,
                weight: 2,
                dashArray: adj.adjustment_type === 'inaccessible' ? '8 6' : undefined,
              }}
              eventHandlers={{ click: () => !correcting && startEditing(adj) }}
            >
              <Popup>
                <strong>{TYPE_LABELS[adj.adjustment_type]}</strong><br />
                {adj.reason}<br />
                {adj.updated_at ? new Date(adj.updated_at).toLocaleString('it-IT') : ''}
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => startEditing(adj)}>Modifica</button>{' '}
                  <button type="button" onClick={() => handleRevoke(adj)}>Revoca</button>
                </div>
              </Popup>
            </Polygon>
          ))}

          {correcting && draftVertices.length > 0 && (
            <Polygon
              positions={draftVertices}
              pathOptions={{ color: TYPE_COLORS[draftType], fillColor: TYPE_COLORS[draftType], fillOpacity: 0.25, weight: 2, dashArray: '4 4' }}
            />
          )}
          {correcting && draftVertices.map((v, i) => (
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

      <Legend />

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

function Legend() {
  const items = [
    { color: '#2563eb', label: 'Traccia GPS reale' },
    { color: '#22c55e', label: 'Copertura GPS', fillOnly: true },
    { color: '#a855f7', label: 'Copertura manuale Admin', fillOnly: true },
    { color: '#f97316', label: 'Area non accessibile', dashed: true },
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
