import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COVERAGE_ADJUSTMENT_TYPES,
  COVERAGE_SOURCE_LEVELS,
  VERIFIED_COVERAGE_STYLE,
  createCoverageAdjustment,
  createCoverageAdjustmentsBatch,
  getFinalCoverage,
  latLngsToLineStringGeoJson,
  listCoverageAdjustments,
  recalcZoneCoverage,
  revokeCoverageAdjustment,
  splitCoverageAdjustment,
  updateCoverageAdjustment,
} from '../../lib/services/coverage-adjustments-api.js';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { geoJsonPolygonToLeafletPositions } from '../../lib/geo/geoJsonToLeaflet.js';
import { geoJsonContainsPoint } from '../../lib/geo/pointInPolygon.js';
import { resolveRoadNetwork } from '../../lib/geo/resolveRoadNetwork.js';
import { getMunicipalityCenterPoint, selectRoadsFromOrigin } from '../../lib/geo/originRadialSelection.js';
import { mergeRoadNetworks, assignWayZoneId } from '../../lib/geo/mergeRoadNetworks.js';
import { splitPolylineByCircle, polylineLengthMeters } from '../../lib/geo/splitPolylineByCircle.js';
import { getOperatorColor, UNASSIGNED_OPERATOR_COLOR } from '../../lib/geo/operatorColor.js';
import { geometryToLeafletLines, isPolygonGeometry, geometryFirstLatLng } from '../../lib/geo/adjustmentGeometry.js';

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
  exclusion: '#dc2626', // rosso — GOMMA sul GPS reale (esclusione overlay)
};

// Operatori REALI della campagna (da admin_list_campaign_assignments). Il
// colore del BORDO del poligono / della linea distingue l'operatore; il
// RIEMPIMENTO resta TYPE_COLORS (il tipo di correzione non perde il suo
// significato visivo). `operator_key` salvato in metadata =
// operator_id || assignment_id reale — MAI un "MAN-0N" fittizio.
const ADMIN_OPERATOR_KEY = 'admin'; // campagna senza assignment: unico fallback neutrale

// Colore stabile per la chiave operatore (operator_id/assignment_id reali; per
// le correzioni pre-feature con chiave "MAN-0N" resta comunque deterministico).
function manualOperatorColor(operatorKey) {
  if (!operatorKey || operatorKey === ADMIN_OPERATOR_KEY) return UNASSIGNED_OPERATOR_COLOR;
  return getOperatorColor(operatorKey);
}


const TYPE_LABELS = { ...Object.fromEntries(COVERAGE_ADJUSTMENT_TYPES.map((t) => [t.value, t.label])), exclusion: 'Esclusione GPS (gomma)' };

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

// §1/§2: cerchio GOMMA che segue il puntatore in tempo reale ED È SEMPRE
// VISIBILE — anche quando il mouse è sopra le linee di copertura.
//
// - `map.on('mousemove')` NON scatta sopra un <Polyline> SVG interattivo
//   (Leaflet dirotta l'evento sul layer): il vecchio approccio "congelava" il
//   cerchio proprio dove serve. Qui si ascolta il `mousemove` DOM nativo sul
//   container della mappa: gli eventi DOM risalgono dai figli SVG, quindi
//   scattano ovunque. `map.mouseEventToLatLng` converte in coordinate.
// - Il <Circle> vive in un pane dedicato con z-index ALTO (sopra overlayPane
//   400 e markerPane 600), così non finisce mai sotto le linee.
function EraseCursorCapture({ active, radiusM }) {
  const map = useMap();
  const [pt, setPt] = useState(null);

  useEffect(() => {
    if (!map.getPane('vp-erase-pane')) {
      const p = map.createPane('vp-erase-pane');
      p.style.zIndex = 660;
      p.style.pointerEvents = 'none';
    }
  }, [map]);

  useEffect(() => {
    if (!active) { setPt(null); return undefined; }
    const el = map.getContainer();
    const onMove = (event) => {
      try {
        const ll = map.mouseEventToLatLng(event);
        setPt([ll.lat, ll.lng]);
      } catch { /* fuori dalla mappa */ }
    };
    const onLeave = () => setPt(null);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      setPt(null);
    };
  }, [active, map]);

  if (!active || !pt) return null;
  return (
    <Circle
      center={pt}
      radius={radiusM}
      pane="vp-erase-pane"
      interactive={false}
      pathOptions={{ color: '#ef4444', weight: 3, opacity: 0.95, fillColor: '#ef4444', fillOpacity: 0.2, dashArray: '6 5' }}
    />
  );
}

// §3: click mappa per il "punto di partenza" dell'automatico (livello
// automatic_verified). Attivo solo in modalita' origine = 'map'.
function OriginClickCapture({ active, onPick }) {
  useMapEvents({
    click(event) { if (active) onPick(event.latlng.lat, event.latlng.lng); },
  });
  return null;
}

// §2: preset percentuale copertura automatica.
const AUTO_PCT_PRESETS = [50, 60, 70, 80, 90, 100];
// §4/§9: concorrenza max delle chiamate Overpass multi-zona + soglia oltre la
// quale mostrare l'avviso "campagna con molte zone".
const AUTO_MULTIZONE_CONCURRENCY = 4;
const AUTO_MULTIZONE_WARN_OVER = 6;

// §3: batched Promise.allSettled — mai Promise.all puro (una zona che fallisce
// NON deve far fallire tutte le altre), concorrenza limitata (§9: mai N
// chiamate contemporanee senza controllo).
async function resolveNetworksBatched(zones, limit = AUTO_MULTIZONE_CONCURRENCY) {
  const out = [];
  for (let start = 0; start < zones.length; start += limit) {
    const batch = zones.slice(start, start + limit);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(
      batch.map((z) => resolveRoadNetwork(z.municipalityName, z.boundaryGeometry)),
    );
    settled.forEach((s, k) => {
      out.push({ zoneId: batch[k].id, zoneName: batch[k].municipalityName, network: s.status === 'fulfilled' ? s.value : null });
    });
  }
  return out;
}
// §7: raggio gomma selezionabile (m). Il valore reale usato da eraseNearest
// e il raggio del cerchio §6 sono lo STESSO numero.
const ERASE_RADIUS_PRESETS_M = [5, 10, 20, 30, 50];
const DEFAULT_ERASE_RADIUS_M = 25;

// Distanza minima (m, approx planare) da una polilinea [[lat,lng],...] a un
// punto — per la GOMMA "clicca il tratto da rimuovere".
function pointToPolylineMeters(latlng, line) {
  if (!Array.isArray(line) || line.length < 2) return Infinity;
  const [plat, plng] = latlng;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((plat * Math.PI) / 180);
  const px = plng * mPerDegLng;
  const py = plat * mPerDegLat;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ax = line[i][1] * mPerDegLng; const ay = line[i][0] * mPerDegLat;
    const bx = line[i + 1][1] * mPerDegLng; const by = line[i + 1][0] * mPerDegLat;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx; const cy = ay + t * dy;
    best = Math.min(best, Math.hypot(px - cx, py - cy));
  }
  return best;
}

export function CoverageAdjustmentPanel({ campaignId, points = [], zones = [], boundaryGeometry = null, gpsOperatorCount = 0, gpsOperators = [], defaultSourceLevel = 'manual_verified', automaticPercent = null, municipalityName = null, storePoint = null, campaignZones = [], campaignOperators = [], simple = false }) {
  // simple: modalità "Monitor operativo Admin" — solo strumenti quotidiani
  // (operatore, matita, gomma, manuale, automatico 50..100%, KPI/preview,
  // salva, note facoltative). Nasconde selettore livello, ambito multi-zona,
  // storico correzioni. NON è lo Studio Mappa Avanzato (fuori scope).
  // Operatori REALI della campagna (da GpsMonitor -> admin_list_campaign_assignments).
  // Ogni opzione: { key (operator_id||assignment_id||'admin'), label, operatorId,
  // assignmentId, zoneId }. Mai un MAN-0N fittizio. Se la campagna non ha
  // assignment: unica opzione neutrale "Copertura Admin".
  const operatorOptions = useMemo(() => {
    const list = (Array.isArray(campaignOperators) ? campaignOperators : [])
      .filter((o) => o && (o.operatorId || o.assignmentId))
      .map((o, i) => ({
        key: String(o.operatorId || o.assignmentId),
        label: o.name || `Autista ${i + 1}`,
        operatorId: o.operatorId || null,
        assignmentId: o.assignmentId || null,
        zoneId: o.zoneId || null,
      }));
    // dedup per key (piu' assignment stesso operatore)
    const seen = new Set();
    const deduped = list.filter((o) => (seen.has(o.key) ? false : seen.add(o.key)));
    if (deduped.length === 0) {
      return [{ key: ADMIN_OPERATOR_KEY, label: 'Copertura Admin', operatorId: null, assignmentId: null, zoneId: null }];
    }
    return deduped;
  }, [campaignOperators]);

  // Default: operatore della zona selezionata se determinabile, altrimenti il
  // primo. Se ambiguo (piu' operatori sulla zona) resta il primo di quella zona.
  const defaultOperatorKey = useMemo(() => {
    const zoneId = zones[0]?.id ?? null;
    const forZone = zoneId ? operatorOptions.find((o) => o.zoneId && o.zoneId === zoneId) : null;
    return (forZone || operatorOptions[0])?.key || ADMIN_OPERATOR_KEY;
  }, [operatorOptions, zones]);
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
  const [draftNotes, setDraftNotes] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetailedPoints, setShowDetailedPoints] = useState(false);
  // Operatore reale associato alla correzione in disegno. Solo il singolo
  // operator_key (id reale) viene salvato in metadata jsonb — nessun cambio
  // schema. Nessun contatore: l'elenco e' quello reale (operatorOptions).
  const [selectedOperatorKey, setSelectedOperatorKey] = useState(ADMIN_OPERATOR_KEY);
  // Allinea la selezione al default reale quando cambiano gli operatori/zona
  // e non si sta editando una riga esistente.
  useEffect(() => {
    if (editingId) return;
    setSelectedOperatorKey((cur) => (operatorOptions.some((o) => o.key === cur) ? cur : defaultOperatorKey));
  }, [defaultOperatorKey, operatorOptions, editingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedOperator = operatorOptions.find((o) => o.key === selectedOperatorKey) || operatorOptions[0];
  // key (id reale o vecchia "MAN-0N") -> etichetta leggibile.
  const operatorLabelForKey = (key) => {
    const opt = operatorOptions.find((o) => o.key === key);
    if (opt) return opt.label;
    if (!key || key === ADMIN_OPERATOR_KEY) return 'Copertura Admin';
    if (/^MAN-\d+$/.test(String(key))) return `Operatore ${String(key).split('-')[1]}`;
    return 'Operatore';
  };
  const operatorShortForKey = (key) => {
    const label = operatorLabelForKey(key);
    const m = String(label).match(/\d+/);
    if (m) return m[0];
    return /^[A-Za-zÀ-ÿ]/.test(label) ? label[0].toUpperCase() : '•';
  };

  // Livello di editing (gomma su TUTTI e 3): 'gps_exclusion' (gomma sul GPS
  // reale — overlay, mai DELETE su gps_tracking_points), 'automatic_verified'
  // (matita/gomma su generazione automatica), 'manual_verified'.
  const [sourceLevel, setSourceLevel] = useState(defaultSourceLevel);
  // 'area' (poligono, come prima) | 'line' (matita a tratto -> LineString).
  // §6/§G: per completare vie/tratti mancanti il default e' LINEA. "Area
  // (poligono)" resta opzione secondaria per piazze/aree pedonali/zone non
  // accessibili.
  const [drawMode, setDrawMode] = useState('line');
  const [lineBufferM, setLineBufferM] = useState(12);
  const [activeLine, setActiveLine] = useState([]);   // vertici polilinea in disegno
  const [draftLines, setDraftLines] = useState([]);   // polilinee chiuse, in attesa di Salva
  // Anteprima "Copertura finale" = ESATTAMENTE la geometria che vede il
  // Cliente (calculate_campaign_final_coverage.final_coverage_geometry).
  const [showFinalPreview, setShowFinalPreview] = useState(true);
  // TOOL vero e cliccabile: SELEZIONA / MATITA / GOMMA. ANNULLA e SALVA
  // restano azioni. La GOMMA rimuove SOLO il tratto/forma cliccato — mai
  // "cancella tutto".
  const [tool, setTool] = useState('draw');
  // Caricamento della copertura AUTOMATICA esistente (vie reali OSM) come
  // BASE editabile — cosi' automatic_verified non parte da 0%.
  const [autoBaseState, setAutoBaseState] = useState({ loading: false, error: null, loaded: 0 });
  // Esito dell'ultimo salvataggio batch automatico: { inserted, discarded }.
  const [lastBatchSave, setLastBatchSave] = useState(null);
  // TIMEOUT DOPO GOMMA: il ricalcolo pesante della copertura zona
  // (ST_UnaryUnion su ~2500 tratti) e' SEPARATO dall'edit. Matita/Gomma
  // marcano la zona "dirty" lato DB e ritornano subito; qui completiamo il
  // ricalcolo best-effort. `zoneRecalcPending` mostra "ricalcolo in corso"
  // e un timeout qui NON annulla l'edit gia' committato.
  const [zoneRecalcPending, setZoneRecalcPending] = useState(false);
  // Stack undo delle modifiche NON salvate (aree/linee chiuse).
  const [undoStack, setUndoStack] = useState([]);

  // §2 — percentuale AUTOMATICO ADMIN: % della lunghezza delle VIE IDONEE da
  // selezionare (NON e' final_operational_coverage_pct: quello resta calcolato
  // solo dal motore server, commit-based). Default = automatic_percent
  // esistente se disponibile, altrimenti 70.
  const [autoPct, setAutoPct] = useState(() => {
    const n = Number(automaticPercent);
    return Number.isFinite(n) && n > 0 ? Math.min(100, Math.max(1, Math.round(n))) : 70;
  });
  // §3 — punto di partenza dell'automatico: 'store' (punto vendita, solo se una
  // coordinata reale e' disponibile), 'center' (centro comune), 'map' (click).
  const [autoOriginMode, setAutoOriginMode] = useState(storePoint ? 'store' : 'center');
  const [autoMapPoint, setAutoMapPoint] = useState(null);
  const [autoOriginError, setAutoOriginError] = useState(null);
  // §7 — raggio gomma (m). Sostituisce l'hardcoded ERASE_RADIUS_M = 35.
  const [eraseRadiusM, setEraseRadiusM] = useState(DEFAULT_ERASE_RADIUS_M);
  // §6 — posizione corrente del puntatore per il cerchio gomma.
  // §1: quando la GOMMA colpisce una linea via il suo handler <Polyline>,
  // questo timestamp impedisce al catch-all <DrawClickCapture> del map di
  // ri-elaborare lo stesso click su `draftLines` stale (doppio split / esito
  // incoerente).
  const justErasedRef = useRef(0);
  // §C/§8 — rete stradale + origine dell'ultimo "Carica copertura automatica".
  // Serve a rifare SUBITO la sola selezione (selectRoadsFromOrigin, pura e
  // locale) quando l'Admin cambia la percentuale 50/60/70/80/90/100 — senza
  // nuova chiamata Overpass, senza conferma, senza salvare prima.
  const autoNetRef = useRef(null);
  // §9 — KPI dell'ultimo "Carica copertura automatica".
  const [autoKpi, setAutoKpi] = useState(null);
  // §10 — vie dell'ultimo caricamento automatico non ancora salvato, per
  // sostituirle (mai duplicarle) ad un nuovo caricamento.
  const [lastAutoLines, setLastAutoLines] = useState([]);
  // §4 — ambito automatico: 'single' (comune selezionato) | 'campaign' (tutte
  // le zone della campagna gia' esistenti). Default 'single'.
  const [autoScope, setAutoScope] = useState('single');
  // §3/§4 — mappa geometria-linea -> zone_id assegnato (solo scope campaign;
  // in single il salvataggio usa la zona selezionata come sempre).
  const [autoLineOwnership, setAutoLineOwnership] = useState(new Map());
  // §3 — esito multi-zona dell'ultimo caricamento (per KPI + elenco zone fallite).
  const [autoMulti, setAutoMulti] = useState(null);

  // gps_exclusion = solo aree, tipo forzato 'exclusion' (la gomma sul GPS).
  const isGpsLevel = sourceLevel === 'gps_exclusion';
  useEffect(() => {
    if (isGpsLevel) {
      setDrawMode('area');
      setDraftType('exclusion');
    } else if (draftType === 'exclusion') {
      setDraftType('manual_covered');
    }
  }, [isGpsLevel]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // §3 — origine effettiva per selectRoadsFromOrigin. 'store' vale solo se una
  // coordinata reale del punto vendita e' stata passata (mai inventata).
  // Fallback dichiarato: punto vendita assente -> centro comune.
  const autoCenterPoint = useMemo(
    () => (boundaryGeometry ? getMunicipalityCenterPoint(boundaryGeometry) : null),
    [boundaryGeometry],
  );
  // Centro iniziale della mappa di disegno. Priorità: 1) center_lat/lng reali
  // della zona SE validi (non null, non 0/0 — Bergamo reale ha 0/0), 2)
  // centroide del confine reale (getMunicipalityCenterPoint), 3) traccia GPS,
  // 4) [45.4642, 9.19] come ULTIMISSIMO residuo (mai raggiunto se la zona ha
  // un confine): meglio un default che un crash di Leaflet su center=null.
  const zoneCenterFromCols = (
    zones[0]
    && Number.isFinite(Number(zones[0].center_lat)) && Number(zones[0].center_lat) !== 0
    && Number.isFinite(Number(zones[0].center_lng)) && Number(zones[0].center_lng) !== 0
  ) ? [Number(zones[0].center_lat), Number(zones[0].center_lng)] : null;
  const zoneCenterFromBoundary = autoCenterPoint ? [autoCenterPoint.lat, autoCenterPoint.lng] : null;
  const center = zoneCenterFromCols || zoneCenterFromBoundary || last || first || [45.4642, 9.19];
  const storeOriginPoint = storePoint && Number.isFinite(Number(storePoint.lat)) && Number.isFinite(Number(storePoint.lng))
    ? { lat: Number(storePoint.lat), lng: Number(storePoint.lng) }
    : null;
  const autoOrigin = autoOriginMode === 'store'
    ? (storeOriginPoint || autoCenterPoint)
    : autoOriginMode === 'map'
      ? (autoMapPoint || null)
      : autoCenterPoint;

  // §4 — zone campagna realmente utilizzabili (nome comune + confine reale
  // risolto). MAI un confine inventato: le zone senza geometria sono escluse.
  const multiZonesEligible = useMemo(
    () => (Array.isArray(campaignZones) ? campaignZones : []).filter(
      (z) => z && z.id != null && z.municipalityName && z.boundaryGeometry,
    ),
    [campaignZones],
  );
  // simple: mai ambito multi-zona (una zona per volta, come da ticket
  // "Monitor Admin simple" — niente configurazioni complesse).
  const canMultiZone = !simple && multiZonesEligible.length > 1;
  const isCampaignScope = !simple && autoScope === 'campaign' && canMultiZone;

  // §3 — i controlli "Copertura automatica" (percentuale/origine/ambito/CTA)
  // NON devono sparire quando l'Admin sposta il selettore livello (es. per
  // usare la GOMMA su un tratto): nel tab AUTOMATICO (defaultSourceLevel
  // 'automatic_verified') restano sempre visibili. Nel tab MANUALE non
  // compaiono.
  const autoContext = defaultSourceLevel === 'automatic_verified' || simple;
  const autoConfigVisible = autoContext || sourceLevel === 'automatic_verified';

  function handleAutoOriginPick(lat, lng) {
    // §5 — in scope campagna il punto puo' stare in QUALSIASI zona della
    // campagna; fuori da TUTTE -> bloccato. In scope singolo resta vincolato
    // al confine della zona selezionata (comportamento invariato).
    if (isCampaignScope) {
      const inAnyZone = multiZonesEligible.some((z) => geoJsonContainsPoint(z.boundaryGeometry, lat, lng));
      if (!inAnyZone) {
        setAutoMapPoint(null);
        setAutoOriginError('Punto di partenza fuori da tutte le zone della campagna.');
        return;
      }
    } else if (boundaryGeometry && !geoJsonContainsPoint(boundaryGeometry, lat, lng)) {
      setAutoMapPoint(null);
      setAutoOriginError('Punto di partenza fuori dalla zona selezionata.');
      return;
    }
    setAutoOriginError(null);
    setAutoMapPoint({ lat, lng });
  }

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
    const refresh = async () => {
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
    };
    refresh();
    // Refresh periodico: le correzioni possono essere revocate FUORI da questo
    // pannello (cleanup SQL, altro Admin). Senza ricarica, `adjustments`
    // restava stale e una riga gia' revocata nel DB veniva ancora mostrata
    // come attiva/editabile -> CORREZIONE_GIA_REVOCATA al primo click.
    // Non tocca draft/editingId/disegno in corso (load() setta solo
    // adjustments + coverage).
    const timer = window.setInterval(refresh, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [campaignId]);

  // Se la riga in modifica viene revocata (qui o altrove) esci dall'editor:
  // continuare a salvarla darebbe CORREZIONE_GIA_REVOCATA.
  useEffect(() => {
    if (!editingId) return;
    const row = adjustments.find((a) => a.id === editingId);
    if (row && row.revoked_at) {
      setFormError('Questa correzione è stata revocata: editor chiuso.');
      cancelCorrecting();
    }
  }, [adjustments, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCorrecting = () => {
    setCorrecting(true);
    setEditingId(null);
    setDraftAreas([]);
    setActiveVertices([]);
    setDraftLines([]);
    setActiveLine([]);
    setUndoStack([]);
    setTool('draw');
    setAutoBaseState({ loading: false, error: null, loaded: 0 });
    setAutoKpi(null);
    setLastAutoLines([]);
    setAutoLineOwnership(new Map());
    autoNetRef.current = null;
    setAutoMulti(null);
    setAutoScope('single');
    setAutoMapPoint(null);
    setAutoOriginError(null);
    setDraftType(isGpsLevel ? 'exclusion' : 'manual_covered');
    setDraftNotes('');
    setSelectedOperatorKey(defaultOperatorKey);
    setFormError(null);
    setLastBatchSave(null);
  };

  const addDrawPoint = (pt) => {
    if (tool === 'erase') { eraseNearest(pt); return; }
    if (tool !== 'draw') return;
    if (drawMode === 'line') setActiveLine((prev) => [...prev, pt]);
    else setActiveVertices((prev) => [...prev, pt]);
  };

  // §8: KPI live ricalcolati dalla geometria residua reale delle bozze
  // automatiche (mai final_operational_coverage_pct finche' non si salva).
  const recomputeAutoKpi = (nextDraftLines) => {
    setAutoKpi((k) => {
      if (!k || !(autoContext || sourceLevel === 'automatic_verified')) return k;
      const totalM = (Number(k.totalKm) || 0) * 1000;
      const selM = (nextDraftLines || []).reduce((s, l) => s + polylineLengthMeters(l), 0);
      return { ...k, ways: (nextDraftLines || []).length, selectedKm: selM / 1000, coveragePct: totalM > 0 ? (selM / totalM) * 100 : 0 };
    });
  };

  // §8: gomma PARZIALE su una LineString di BOZZA (mai su righe salvate).
  // Sostituisce la linea con 0..N pezzi residui; propaga ownership zone_id
  // (§5) e lastAutoLines (§6); registra l'undo per ripristino esatto (§7).
  const applyDraftLineSplit = (original, pt) => {
    const idx = draftLines.indexOf(original);
    if (idx < 0) return false;
    const pieces = splitPolylineByCircle(original, pt, eraseRadiusM);
    const nextDraftLines = [...draftLines.slice(0, idx), ...pieces, ...draftLines.slice(idx + 1)];
    const hadOwner = autoLineOwnership.has(original);
    const ownerZoneId = autoLineOwnership.get(original);
    const wasAuto = lastAutoLines.includes(original);

    setDraftLines(nextDraftLines);
    if (hadOwner) {
      setAutoLineOwnership((prev) => {
        const next = new Map(prev);
        next.delete(original);
        pieces.forEach((p) => next.set(p, ownerZoneId));
        return next;
      });
    }
    if (wasAuto) {
      setLastAutoLines((prev) => {
        const at = prev.indexOf(original);
        if (at < 0) return prev;
        return [...prev.slice(0, at), ...pieces, ...prev.slice(at + 1)];
      });
    }
    setUndoStack((prev) => [...prev, { kind: 'split-line', original, pieces, hadOwner, ownerZoneId, wasAuto }]);
    recomputeAutoKpi(nextDraftLines);
    setFormError(null);
    return true;
  };

  // GOMMA: rimuove SOLO la forma piu' vicina al click (tratto/area draft),
  // oppure revoca la correzione salvata piu' vicina. Mai "cancella tutto".
  const eraseNearest = (pt) => {
    // §1: se il click era gia' stato preso dall'handler <Polyline> (hit-test
    // preciso di Leaflet sul tratto), NON rielaborarlo qui sul draftLines
    // stale della closure.
    if (Date.now() - justErasedRef.current < 80) return;
    // §7: raggio operativo = quello scelto nella UI. È lo STESSO numero del
    // cerchio §2.
    const ERASE_RADIUS_M = eraseRadiusM;
    // §1: fallback quando Leaflet non ha registrato il click "sul tratto"
    // (bordo, gap tra vertici): tolleranza generosa, minimo 30 m, cosi' un
    // click visivamente "sopra la linea" fa comunque lo split.
    const LINE_TOL_M = Math.max(ERASE_RADIUS_M, 30);
    // 1) draft lines — §8: split parziale, non rimozione dell'intera linea
    let bestI = -1; let bestD = LINE_TOL_M;
    draftLines.forEach((line, i) => { const d = pointToPolylineMeters(pt, line); if (d < bestD) { bestD = d; bestI = i; } });
    if (bestI >= 0) {
      applyDraftLineSplit(draftLines[bestI], pt);
      return;
    }
    // 2) draft areas (per vertice piu' vicino)
    let bestA = -1; let bestAD = ERASE_RADIUS_M;
    draftAreas.forEach((area, i) => {
      const d = pointToPolylineMeters(pt, [...area, area[0]]);
      if (d < bestAD) { bestAD = d; bestA = i; }
    });
    if (bestA >= 0) {
      setDraftAreas((prev) => prev.filter((_, i) => i !== bestA));
      setUndoStack((prev) => [...prev, { kind: 'erase-area', area: draftAreas[bestA] }]);
      setFormError(null);
      return;
    }
    // 3) correzione SORGENTE salvata piu' vicina. Hit-test sulla geometria di
    // OGNI correzione attiva (LineString / TUTTI i rami di MultiLineString /
    // anello del Polygon), distanza click->segmento (pointToPolylineMeters).
    // Tolleranza = LINE_TOL_M (>= 30 m), come per le bozze: un click
    // visivamente "sopra la linea" a zoom tipico deve trovarla. Mai sul
    // poligono finale aggregato (quello NON e' in activeAdjustments).
    let bestAdj = null; let bestAdjD = LINE_TOL_M;
    for (const adj of activeAdjustments) {
      const g = adj.geometry;
      const rings = [];
      if (g?.type === 'LineString') rings.push(g.coordinates.map(([lng, lat]) => [lat, lng]));
      else if (g?.type === 'MultiLineString') {
        (g.coordinates || []).forEach((seg) => rings.push((seg || []).map(([lng, lat]) => [lat, lng])));
      } else if (g?.type === 'Polygon') {
        (g.coordinates || []).forEach((r) => rings.push((r || []).map(([lng, lat]) => [lat, lng])));
      } else if (g?.type === 'MultiPolygon') {
        (g.coordinates || []).forEach((poly) => (poly || []).forEach((r) => rings.push((r || []).map(([lng, lat]) => [lat, lng]))));
      }
      for (const line of rings) {
        const d = pointToPolylineMeters(pt, line);
        if (d < bestAdjD) { bestAdjD = d; bestAdj = adj; }
      }
    }
    if (bestAdj) {
      const g = bestAdj.geometry;
      // GOMMA PARZIALE: se e' una linea, taglia SOLO la porzione dentro il
      // cerchio e persisti i segmenti residui; revoca completa solo se non
      // resta nulla. Su Polygon/MultiPolygon -> revoca completa (lo split
      // areale richiederebbe una libreria di clipping non presente).
      if (g?.type === 'LineString' || g?.type === 'MultiLineString') {
        const subLines = g.type === 'LineString'
          ? [g.coordinates.map(([lng, lat]) => [lat, lng])]
          : (g.coordinates || []).map((seg) => (seg || []).map(([lng, lat]) => [lat, lng]));
        const residuals = [];
        let touched = false;
        for (const sub of subLines) {
          if (sub.length < 2) continue;
          const pieces = splitPolylineByCircle(sub, pt, ERASE_RADIUS_M);
          if (pieces.length === 1 && pieces[0].length === sub.length) {
            residuals.push(sub); // ramo non toccato dal cerchio
          } else {
            touched = true;
            pieces.forEach((pc) => { if (pc.length >= 2) residuals.push(pc); });
          }
        }
        if (!touched) {
          setFormError('GOMMA: il cerchio non interseca questo tratto. Zooma o clicca più vicino.');
          return;
        }
        handleSplitAdjustment(bestAdj, residuals); // residuals=[] -> revoca completa
        return;
      }
      handleRevoke(bestAdj);
      return;
    }
    setFormError('GOMMA: nessuna correzione entro il raggio. Zooma o clicca più vicino a un tratto visibile.');
  };

  // GOMMA PARZIALE su una correzione salvata: una sola operazione atomica
  // (revoca sorgente + creazione segmenti residui + una sola sync) via
  // admin_split_coverage_adjustment. I residui ereditano source / zone_id /
  // operator metadata / line_buffer_m dalla sorgente. residualLatLngs = []
  // -> revoca completa.
  // Completa il ricalcolo PESANTE della copertura zona DOPO che l'edit
  // geometrico e' gia' committato. admin_recalc_zone_coverage vive in una
  // request separata (timeout 600s, fuori dal gateway dell'edit): se fallisce,
  // la zona resta "dirty" lato DB e un retry successivo la completa — l'edit
  // NON viene mai annullato. La "finale verificata" visibile
  // (calculate_campaign_final_coverage) e' gia' corretta senza questo passo.
  const recalcZonesAfterEdit = async (zoneIds) => {
    const ids = [...new Set((zoneIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    setZoneRecalcPending(true);
    try {
      for (const id of ids) {
        try {
          await recalcZoneCoverage({ campaignZoneId: id });
        } catch {
          /* zona resta dirty: retry al prossimo edit / refresh periodico */
        }
      }
    } finally {
      setZoneRecalcPending(false);
    }
  };

  const handleSplitAdjustment = async (adjustment, residualLatLngs) => {
    if (!adjustment?.id || adjustment.revoked_at) return;
    const residualLines = (residualLatLngs || [])
      .filter((l) => Array.isArray(l) && l.length >= 2)
      .map((l) => latLngsToLineStringGeoJson(l));
    // Rimozione ottimista della sorgente (i residui compaiono dopo load()).
    setAdjustments((prev) => prev.map((a) => (
      a.id === adjustment.id
        ? { ...a, revoked_at: new Date().toISOString(), revoke_reason: 'admin_partial_erase' }
        : a
    )));
    if (editingId === adjustment.id) cancelCorrecting();
    justErasedRef.current = Date.now();
    try {
      await splitCoverageAdjustment({
        adjustmentId: adjustment.id,
        residualLines,
        reason: draftNotes.trim() || 'admin_partial_erase',
      });
    } catch (err) {
      if (!/CORREZIONE_GIA_REVOCATA/i.test(err?.message || '')) {
        window.alert(err?.message || 'Gomma parziale non riuscita.');
      }
    } finally {
      await load();
      // Edit committato: ora il ricalcolo pesante, fuori dalla transazione.
      await recalcZonesAfterEdit([adjustment.zone_id, ...zones.map((z) => z.id)]);
      await load();
    }
  };

  // §C/§8 — applica la percentuale corrente a una rete GIA' risolta (cache
  // autoNetRef). PURA + LOCALE: nessuna Overpass, nessuna conferma. Sostituisce
  // le sole vie automatiche precedenti (mai le linee disegnate a mano, mai le
  // correzioni salvate) e ricalcola i KPI cosi' che corrispondano alla mappa.
  // Ritorna il numero di vie selezionate.
  const applyAutoSelectionFromCache = (pctRaw, { pushUndo = false } = {}) => {
    const cached = autoNetRef.current;
    if (!cached) return 0;
    const { net, origin, meta } = cached;
    const pct = Math.min(100, Math.max(1, Math.round(Number(pctRaw) || 70)));
    const gpsPath = filterValidGpsPoints(points).valid.map((p) => [Number(p.lat), Number(p.lng)]);
    const sel = selectRoadsFromOrigin(net, origin, pct, gpsPath);
    const selectedWays = (sel.selectedWays || []).filter((w) => Array.isArray(w.geometry) && w.geometry.length >= 2);
    const lines = selectedWays.map((w) => w.geometry);
    if (!lines.length) {
      // percentuale troppo bassa per anche una sola via: pulisci SOLO la bozza
      // automatica, lascia intatte le linee disegnate a mano.
      setDraftLines((prev) => prev.filter((l) => !lastAutoLines.includes(l)));
      setLastAutoLines([]);
      setAutoLineOwnership(new Map());
      setAutoKpi((k) => (k ? { ...k, requestedPct: pct, ways: 0, selectedKm: 0, coveragePct: 0 } : k));
      return 0;
    }
    const ownership = new Map();
    if (meta.isCampaignScope) {
      const fallbackZoneId = zones[0]?.id ?? null;
      const multiZonesEligible = meta.multiZonesEligible;
      for (const w of selectedWays) {
        ownership.set(w.geometry, assignWayZoneId(w.geometry, multiZonesEligible, fallbackZoneId).zoneId);
      }
    }
    setDraftLines((prev) => [...prev.filter((l) => !lastAutoLines.includes(l)), ...lines]);
    setLastAutoLines(lines);
    setAutoLineOwnership(ownership);
    if (pushUndo) setUndoStack((prev) => [...prev, ...lines.map(() => ({ kind: 'line' }))]);
    setAutoKpi({
      requestedPct: pct,
      ways: selectedWays.length,
      selectedKm: sel.selectedLengthM / 1000,
      totalKm: net.totalLengthM / 1000,
      coveragePct: sel.coverageMetricPercent,
      originLabel: meta.originLabel,
      scope: meta.isCampaignScope ? 'campaign' : 'single',
      zonesLoaded: meta.zonesLoaded,
      zonesFailed: meta.zonesFailed,
    });
    return lines.length;
  };

  // §C/§8 — la percentuale (preset / slider / campo numero) aggiorna SUBITO la
  // mappa e i KPI quando una rete automatica e' gia' stata caricata: nessuna
  // nuova Overpass, nessuna conferma, nessun salvataggio, nessun cambio tool.
  useEffect(() => {
    if (!correcting || editingId) return;
    if (!autoNetRef.current) return;
    applyAutoSelectionFromCache(autoPct, { pushUndo: false });
  }, [autoPct]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Carica copertura automatica": converte la selezione stradale AUTOMATICA
  // (vie reali OSM, stesso motore di ZoneCoverageMap) in tratti draft
  // editabili. Al salvataggio ogni via diventa una riga
  // source=automatic_verified -> alimenta calculate_campaign_final_coverage.
  const loadAutomaticBase = async () => {
    // Guardia: scope singolo richiede confine+comune della zona selezionata;
    // scope campagna richiede almeno una zona campagna con confine reale.
    if (!isCampaignScope && (!boundaryGeometry || !municipalityName)) {
      autoNetRef.current = null;
      setAutoBaseState({ loading: false, error: 'Confine/comune non disponibile per questa zona.', loaded: 0 });
      return;
    }
    if (isCampaignScope && multiZonesEligible.length === 0) {
      autoNetRef.current = null;
      setAutoBaseState({ loading: false, error: 'Nessuna zona campagna con confine reale disponibile.', loaded: 0 });
      return;
    }
    // §3/§5: origine effettiva, con fallback dichiarato a centro comune (della
    // zona selezionata in single, della prima zona campagna in scope campagna).
    const fallbackCenter = autoCenterPoint
      || (boundaryGeometry ? getMunicipalityCenterPoint(boundaryGeometry) : null)
      || (isCampaignScope ? getMunicipalityCenterPoint(multiZonesEligible[0].boundaryGeometry) : null);
    const origin = autoOrigin || fallbackCenter;
    if (!origin) {
      autoNetRef.current = null;
      setAutoBaseState({ loading: false, error: 'Punto di partenza non disponibile: scegli "Centro comune" o clicca sulla mappa.', loaded: 0 });
      return;
    }
    // §10: se una bozza automatica precedente non salvata esiste, chiedere e
    // SOSTITUIRLA (mai duplicare). Le correzioni gia' salvate non si toccano.
    if (lastAutoLines.length > 0 && typeof window !== 'undefined' && window.confirm
      && !window.confirm('Rigenerare la bozza automatica? Le vie automatiche non ancora salvate verranno sostituite. Le correzioni gia’ salvate non vengono toccate.')) {
      return;
    }
    setAutoBaseState({ loading: true, error: null, loaded: 0 });
    setAutoOriginError(null);
    setAutoMulti(null);
    try {
      // §3/§4: rete idonea. Scope campagna -> una resolveRoadNetwork per zona
      // (batched Promise.allSettled, concorrenza limitata), poi merge+dedup.
      let net;
      let multiInfo = null;
      if (isCampaignScope) {
        const settled = await resolveNetworksBatched(multiZonesEligible, AUTO_MULTIZONE_CONCURRENCY);
        const merged = mergeRoadNetworks(settled);
        const failedZoneNames = settled
          .filter((s) => merged.failedZoneIds.includes(s.zoneId))
          .map((s) => s.zoneName)
          .filter(Boolean);
        multiInfo = { loadedZoneCount: merged.loadedZoneCount, failedZoneCount: merged.failedZoneCount, failedZoneNames };
        setAutoMulti(multiInfo);
        if (!merged.ways.length || !(merged.totalLengthM > 0)) {
          autoNetRef.current = null;
          setAutoBaseState({ loading: false, error: 'Nessuna rete stradale caricata per le zone della campagna.', loaded: 0 });
          return;
        }
        net = merged;
      } else {
        net = await resolveRoadNetwork(municipalityName, boundaryGeometry);
        // §4 ticket: una rete con 0 vie o lunghezza totale <= 0 NON è una
        // base valida — mai cache, errore esplicito, autoNetRef invalidato
        // (così il cambio percentuale non produce più 0 in silenzio).
        if (!net?.ways?.length || !(net.totalLengthM > 0)) {
          autoNetRef.current = null;
          setAutoBaseState({ loading: false, error: 'Rete stradale non disponibile per questa zona (nessuna via idonea trovata). Riprova più tardi.', loaded: 0 });
          return;
        }
      }
      // §C/§8: memorizza la rete risolta + l'origine. Da qui in poi il cambio
      // di percentuale rifa' SOLO la selezione (pura, locale) via l'effetto su
      // autoPct — nessuna nuova Overpass, nessuna conferma.
      autoNetRef.current = {
        net,
        origin,
        meta: {
          isCampaignScope,
          multiZonesEligible,
          originLabel: autoOriginMode === 'store' && storeOriginPoint ? 'Punto vendita' : autoOriginMode === 'map' && autoMapPoint ? 'Punto sulla mappa' : 'Centro comune',
          zonesLoaded: multiInfo ? multiInfo.loadedZoneCount : 1,
          zonesFailed: multiInfo ? multiInfo.failedZoneCount : 0,
        },
      };
      setSourceLevel('automatic_verified');
      setDrawMode('line');
      const loadedCount = applyAutoSelectionFromCache(autoPct, { pushUndo: true });
      if (!loadedCount) {
        // Rete valida ma 0 vie selezionate a questa percentuale: la
        // percentuale NON va mostrata come "successo". La rete resta in cache
        // (alzare la % può selezionare vie); il messaggio è esplicito.
        setAutoBaseState({ loading: false, error: `Nessuna via selezionata al ${Math.round(Number(autoPct) || 0)}%: alza la percentuale o sposta il punto di partenza.`, loaded: 0 });
        return;
      }
      setAutoBaseState({ loading: false, error: null, loaded: loadedCount });
    } catch (err) {
      autoNetRef.current = null;
      setAutoBaseState({ loading: false, error: err?.message || 'Caricamento automatico non riuscito.', loaded: 0 });
    }
  };

  // "Chiudi": area (>=3 vertici) o tratto (>=2 vertici) -> nel rispettivo
  // draft + push sullo stack undo.
  const handleCloseShape = () => {
    if (drawMode === 'line') {
      if (activeLine.length < 2) { setFormError('Disegna almeno 2 punti per il tratto.'); return; }
      setDraftLines((prev) => [...prev, activeLine]);
      setUndoStack((prev) => [...prev, { kind: 'line' }]);
      setActiveLine([]);
    } else {
      if (activeVertices.length < 3) { setFormError('Disegna almeno 3 vertici per l\'area.'); return; }
      setDraftAreas((prev) => [...prev, activeVertices]);
      setUndoStack((prev) => [...prev, { kind: 'area' }]);
      setActiveVertices([]);
    }
    setFormError(null);
  };

  // ANNULLA: ripristina l'ultima modifica NON salvata. Prima i vertici della
  // forma in disegno, poi l'ultima forma chiusa (area o tratto).
  const handleUndo = () => {
    if (drawMode === 'line' && activeLine.length > 0) { setActiveLine((p) => p.slice(0, -1)); return; }
    if (activeVertices.length > 0) { setActiveVertices((p) => p.slice(0, -1)); return; }
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((p) => p.slice(0, -1));
    if (last.kind === 'line') setDraftLines((p) => p.slice(0, -1));
    else if (last.kind === 'area') setDraftAreas((p) => p.slice(0, -1));
    else if (last.kind === 'erase-line') setDraftLines((p) => [...p, last.line]);   // GOMMA -> ripristina
    else if (last.kind === 'erase-area') setDraftAreas((p) => [...p, last.area]);
    else if (last.kind === 'split-line') {
      // §7: ripristina ESATTAMENTE la LineString originale al posto dei pezzi.
      const firstPieceIdx = last.pieces.length ? draftLines.indexOf(last.pieces[0]) : -1;
      const without = draftLines.filter((l) => !last.pieces.includes(l));
      const insertAt = firstPieceIdx >= 0 ? Math.min(firstPieceIdx, without.length) : without.length;
      const restored = [...without.slice(0, insertAt), last.original, ...without.slice(insertAt)];
      setDraftLines(restored);
      if (last.hadOwner) {
        setAutoLineOwnership((prev) => {
          const next = new Map(prev);
          last.pieces.forEach((p) => next.delete(p));
          next.set(last.original, last.ownerZoneId);
          return next;
        });
      }
      if (last.wasAuto) {
        setLastAutoLines((prev) => {
          const at = last.pieces.length ? prev.indexOf(last.pieces[0]) : -1;
          const cleaned = prev.filter((l) => !last.pieces.includes(l));
          const pos = at >= 0 ? Math.min(at, cleaned.length) : cleaned.length;
          return [...cleaned.slice(0, pos), last.original, ...cleaned.slice(pos)];
        });
      }
      recomputeAutoKpi(restored);
    }
  };

  const startEditing = (adjustment) => {
    // Mai aprire l'editor su una riga revocata: il salvataggio darebbe
    // CORREZIONE_GIA_REVOCATA. La UI non dovrebbe offrirlo (popup/pulsanti
    // solo su activeAdjustments), ma lo stato puo' essere stale.
    if (!adjustment?.id || adjustment.revoked_at) { setFormError('Correzione revocata: non modificabile.'); return; }
    // Modifica di una riga esistente = un solo poligono (la colonna DB e'
    // tipizzata Polygon singolo per riga): niente multi-area qui, il
    // workflow "Nuova area" resta disabilitato durante la modifica. Per
    // aggiungere altre aree alla stessa correzione, l'Admin ne crea di
    // nuove con "Correggi copertura" (mai cancellate, solo revocate, come
    // il resto del modello di audit di questa tabella).
    setCorrecting(true);
    setEditingId(adjustment.id);
    setDraftAreas([]);
    setDraftLines([]);
    setUndoStack([]);
    setSourceLevel(adjustment.source || 'manual_verified');
    const gtype = adjustment.geometry?.type;
    if (gtype === 'LineString' || gtype === 'MultiLineString') {
      setDrawMode('line');
      setActiveLine((adjustment.geometry.coordinates || []).map(([lng, lat]) => [lat, lng]));
      setActiveVertices([]);
      if (adjustment.line_buffer_m) setLineBufferM(Number(adjustment.line_buffer_m));
    } else {
      setDrawMode('area');
      setActiveVertices(polygonGeoJsonToLatLngs(adjustment.geometry));
      setActiveLine([]);
    }
    setDraftType(adjustment.adjustment_type);
    // "reason" resta solo un campo di audit interno: si pre-compila le Note
    // con l'eventuale testo storico (reason legacy o notes) senza mai
    // ripristinare un campo "motivo obbligatorio".
    setDraftNotes(adjustment.notes || (adjustment.reason && adjustment.reason !== 'admin_adjustment' ? adjustment.reason : ''));
    // Operatore gia' salvato (id reale o vecchia chiave "MAN-0N"): se non e'
    // tra gli operatori reali attuali resta comunque selezionato via
    // `editSavedOperatorKey` (aggiunto in coda alle opzioni finche' si edita).
    setSelectedOperatorKey(adjustment.metadata?.operator_key || defaultOperatorKey);
    setFormError(null);
  };

  const cancelCorrecting = () => {
    setCorrecting(false);
    setEditingId(null);
    setDraftAreas([]);
    setActiveVertices([]);
    setDraftLines([]);
    setActiveLine([]);
    setUndoStack([]);
    setTool('draw');
    setAutoBaseState({ loading: false, error: null, loaded: 0 });
    setAutoKpi(null);
    setLastAutoLines([]);
    setAutoLineOwnership(new Map());
    autoNetRef.current = null;
    setAutoMulti(null);
    setFormError(null);
    // lastBatchSave NON azzerato: l'esito "N salvate / M scartate" resta
    // visibile dopo il salvataggio finché non si riapre l'editor.
  };

  const handleClearAll = () => {
    setDraftAreas([]);
    setActiveVertices([]);
    setDraftLines([]);
    setActiveLine([]);
    setUndoStack([]);
    setAutoKpi(null);
    setLastAutoLines([]);
    setAutoLineOwnership(new Map());
    autoNetRef.current = null;
    setAutoMulti(null);
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
    // Nessun campo "motivo" obbligatorio: l'Admin decide direttamente. Il
    // backend richiede reason NOT NULL solo per audit -> si passa
    // automaticamente le Note (se presenti) o un valore interno neutro.
    const autoReason = draftNotes.trim() || 'admin_adjustment';
    // source per livello. gps_exclusion + type 'exclusion' = GOMMA sul GPS
    // reale: NON tocca gps_tracking_points, e' una riga overlay revocabile.
    const source = sourceLevel;
    const effectiveType = isGpsLevel ? 'exclusion' : draftType;

    // Editing di una riga esistente = un solo poligono/tratto.
    if (editingId) {
      const isLine = drawMode === 'line';
      const shape = isLine ? activeLine : activeVertices;
      if ((isLine && shape.length < 2) || (!isLine && shape.length < 3)) {
        setFormError(isLine ? 'Disegna almeno 2 punti.' : 'Disegna almeno 3 vertici.');
        return;
      }
      if (!isLine && areaOutsideBoundary(shape)) {
        setFormError('L\'area esce dal confine del comune selezionato.');
        return;
      }
      setSaving(true); setFormError(null);
      try {
        await updateCoverageAdjustment({
          adjustmentId: editingId,
          adjustmentType: effectiveType,
          geometryGeoJson: isLine ? latLngsToLineStringGeoJson(shape) : latLngsToPolygonGeoJson(shape),
          reason: autoReason,
          notes: draftNotes.trim() || null,
          metadata: { operator_key: selectedOperatorKey, operator_id: selectedOperator?.operatorId || null, assignment_id: selectedOperator?.assignmentId || null, admin_operator: true },
          source,
          lineBufferM: isLine ? lineBufferM : null,
        });
        cancelCorrecting();
        await load();
        await recalcZonesAfterEdit(zones.map((z) => z.id));
        await load();
      } catch (err) {
        if (/CORREZIONE_GIA_REVOCATA/i.test(err?.message || '')) {
          // La riga e' stata revocata nel frattempo (cleanup/altro Admin):
          // chiudi l'editor e riallinea, senza errore tecnico.
          setFormError('Questa correzione è stata revocata: modifica annullata.');
          cancelCorrecting();
          await load();
        } else {
          setFormError(err?.message || 'Salvataggio non riuscito.');
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    // In modalita' GOMMA non c'e' un "salva bozza": la gomma agisce al click
    // sulla mappa. Messaggio coerente con lo strumento, non quello del disegno.
    if (tool === 'erase') {
      setFormError('Seleziona una parte del tratto da rimuovere.');
      return;
    }

    // Nuova correzione: tutte le forme devono essere gia' chiuse.
    if (activeVertices.length > 0 || activeLine.length > 0) {
      setFormError('Chiudi la forma in disegno ("Chiudi") o annullala prima di salvare.');
      return;
    }
    const areas = draftAreas;
    const lines = drawMode === 'line' ? draftLines : (isGpsLevel ? [] : draftLines);
    if (areas.length === 0 && lines.length === 0 && draftLines.length === 0) {
      setFormError('Disegna almeno un\'area o un tratto, poi "Chiudi", prima di salvare.');
      return;
    }
    for (let i = 0; i < areas.length; i += 1) {
      if (areaOutsideBoundary(areas[i])) {
        setFormError(`L'area ${i + 1} esce dal confine del comune selezionato.`);
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    try {
      const metadata = { operator_key: selectedOperatorKey, operator_id: selectedOperator?.operatorId || null, assignment_id: selectedOperator?.assignmentId || null, admin_operator: true };
      for (const area of areas) {
        await createCoverageAdjustment({
          campaignId, zoneId: zones[0]?.id ?? null, adjustmentType: effectiveType,
          geometryGeoJson: latLngsToPolygonGeoJson(area),
          reason: autoReason, notes: draftNotes.trim() || null, metadata, source,
        });
      }
      // Matita "a tratto" / copertura automatica: TUTTE le LineString in
      // UNA sola RPC batch atomica (mai piu' una RPC per via — vedi
      // migration 20260831120000). Se il batch fallisce: 0 righe scritte,
      // errore mostrato, draft mantenuto in UI (nessun cancelCorrecting nel
      // catch). Non disponibile per gps_exclusion (sempre un'area).
      if (!isGpsLevel && draftLines.length > 0) {
        // §7/§10: zone_id per via — dall'assegnazione multi-zona quando
        // presente (scope campagna), altrimenti la zona selezionata.
        const linesPayload = draftLines.map((line) => ({
          geometry: latLngsToLineStringGeoJson(line),
          zone_id: autoLineOwnership.get(line) ?? zones[0]?.id ?? null,
        }));
        const res = await createCoverageAdjustmentsBatch({
          campaignId,
          lines: linesPayload,
          reason: autoReason,
          source,
          lineBufferM,
          notes: draftNotes.trim() || null,
          metadata,
          adjustmentType: 'manual_covered',
        });
        setLastBatchSave({
          inserted: Number(res?.inserted || 0),
          discarded: Number(res?.discarded || 0),
          received: Number(res?.received || linesPayload.length),
        });
      }
      cancelCorrecting();
      await load();
      await recalcZonesAfterEdit(zones.map((z) => z.id));
      await load();
    } catch (err) {
      setFormError(err?.message || 'Salvataggio non riuscito.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (adjustment) => {
    // Guardia: mai un secondo revoke sulla stessa riga (la UI non deve
    // nemmeno offrirlo, ma lo stato React puo' essere transitoriamente stale).
    if (!adjustment?.id || adjustment.revoked_at) return;
    // Rimozione OTTIMISTA immediata dalla lista attiva: il popup/pulsanti
    // spariscono subito, senza attendere il round-trip. load() nel finally
    // riallinea comunque alla verita' del DB.
    setAdjustments((prev) => prev.map((a) => (
      a.id === adjustment.id
        ? { ...a, revoked_at: new Date().toISOString(), revoke_reason: 'admin_revoked' }
        : a
    )));
    if (editingId === adjustment.id) cancelCorrecting();
    // Azione diretta: nessun popup, nessun testo richiesto all'Admin. Il
    // backend richiede reason NOT NULL solo per audit -> valore interno neutro.
    try {
      await revokeCoverageAdjustment({ adjustmentId: adjustment.id, reason: 'admin_revoked' });
    } catch (err) {
      // CORREZIONE_GIA_REVOCATA = il DB l'ha gia' revocata (cleanup/altro
      // Admin): non e' un errore per l'utente, load() qui sotto sincronizza.
      if (!/CORREZIONE_GIA_REVOCATA/i.test(err?.message || '')) {
        window.alert(err?.message || 'Revoca non riuscita.');
      }
    } finally {
      await load(); // verita' del DB: se il revoke e' davvero fallito, la riga torna attiva
      await recalcZonesAfterEdit([adjustment.zone_id, ...zones.map((z) => z.id)]);
      await load();
    }
  };

  const activeAdjustments = adjustments.filter((a) => !a.revoked_at);
  const revokedAdjustments = adjustments.filter((a) => a.revoked_at);
  const previewAreaM2 = activeVertices.length >= 3 ? approxPolygonAreaM2(activeVertices) : 0;
  const activeAreaOutsideBoundary = activeVertices.length >= 3 && areaOutsideBoundary(activeVertices);

  // Operatori distinti realmente presenti tra le correzioni attive (non il
  // solo contatore UI) — usati per legenda/KPI, cosi' riflettono i dati
  // reali anche se l'elenco operatori cambia dopo che le aree sono state
  // salvate.
  const presentOperatorKeys = [...new Set(activeAdjustments.map((a) => a.metadata?.operator_key).filter(Boolean))].sort();

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={eyebrowStyle}>Copertura operativa (GPS + correzioni Admin)</p>
        {!correcting ? (
          <button type="button" onClick={startCorrecting} style={primaryButtonStyle}>Correggi copertura</button>
        ) : (
          <button type="button" onClick={cancelCorrecting} style={secondaryButtonStyle}>Chiudi editor</button>
        )}
      </div>

      {/* §11 — AUTOMATICO ADMIN: controlli in ordine (1 Percentuale, 2 Punto
          di partenza, 3 [Carica]) PRIMA della toolbar di editing. Visibile
          solo sul livello automatic_verified in creazione (non in modifica di
          una riga esistente). */}
      {correcting && !editingId && autoConfigVisible && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(15,118,110,.10)', border: '1px solid rgba(15,118,110,.35)' }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Copertura automatica</div>

          {/* 1 — Percentuale */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={autoCtlLabelStyle}>Copertura automatica</span>
            {AUTO_PCT_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAutoPct(p)} style={autoChipStyle(autoPct === p)}>{p}%</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <input type="range" min={1} max={100} step={1} value={autoPct} onChange={(e) => setAutoPct(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={{ flex: '1 1 160px' }} />
            <input type="number" min={1} max={100} value={autoPct} onChange={(e) => setAutoPct(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={{ ...inputStyle, width: 64 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>% della lunghezza delle vie idonee (non è la copertura finale)</span>
          </div>

          {/* 2 — Punto di partenza */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={autoCtlLabelStyle}>Punto di partenza</span>
            <button type="button" disabled={!storeOriginPoint} title={storeOriginPoint ? '' : 'Nessuna coordinata reale del punto vendita per questa campagna'} onClick={() => setAutoOriginMode('store')} style={autoChipStyle(autoOriginMode === 'store', !storeOriginPoint)}>Punto vendita</button>
            <button type="button" onClick={() => setAutoOriginMode('center')} style={autoChipStyle(autoOriginMode === 'center')}>Centro comune</button>
            <button type="button" onClick={() => setAutoOriginMode('map')} style={autoChipStyle(autoOriginMode === 'map')}>Scegli sulla mappa</button>
          </div>
          {autoOriginMode === 'map' && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
              Clicca sulla mappa per fissare il punto di partenza automatico{autoMapPoint ? ' ✓ impostato' : ''}.
            </p>
          )}
          {autoOriginMode === 'store' && !storeOriginPoint && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#fbbf24' }}>Punto vendita non disponibile — verrà usato il centro comune.</p>
          )}
          {autoOriginError && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#fca5a5' }}>{autoOriginError}</p>}

          {/* 3 — Ambito (§4) — nascosto in modalità simple (una zona per volta). */}
          {!simple && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <span style={autoCtlLabelStyle}>Ambito</span>
                <button type="button" onClick={() => setAutoScope('single')} style={autoChipStyle(autoScope === 'single')}>Comune selezionato</button>
                <button
                  type="button"
                  disabled={!canMultiZone}
                  title={canMultiZone ? '' : 'La campagna ha una sola zona con confine reale'}
                  onClick={() => setAutoScope('campaign')}
                  style={autoChipStyle(isCampaignScope, !canMultiZone)}
                >
                  Tutte le zone della campagna{canMultiZone ? ` (${multiZonesEligible.length})` : ''}
                </button>
              </div>
              {isCampaignScope && multiZonesEligible.length > AUTO_MULTIZONE_WARN_OVER && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#fbbf24' }}>
                  Campagna con molte zone: il caricamento della rete può richiedere più tempo.
                </p>
              )}
              {autoMulti && autoMulti.failedZoneCount > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#fca5a5' }}>
                  Zone non caricate ({autoMulti.failedZoneCount}): {autoMulti.failedZoneNames.join(', ') || '—'}. La copertura mostrata NON è completa.
                </p>
              )}
            </>
          )}

          {/* 4 — Carica */}
          <button type="button" onClick={loadAutomaticBase} disabled={autoBaseState.loading} style={{ ...primaryButtonStyle, background: '#0f766e', marginTop: 10 }}>
            {autoBaseState.loading ? 'Carico vie…' : (lastAutoLines.length ? 'Rigenera copertura automatica' : 'Carica copertura automatica')}
          </button>
        </div>
      )}

      {correcting && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, padding: 8, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,.42)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Strumenti</span>
          <button type="button" onClick={() => setTool('select')} style={toolButtonStyle(tool === 'select')}>Seleziona</button>
          <button type="button" onClick={() => { setTool('draw'); }} style={toolButtonStyle(tool === 'draw')}>Matita</button>
          <button type="button" onClick={() => setTool('erase')} style={{ ...toolButtonStyle(tool === 'erase'), background: tool === 'erase' ? '#dc2626' : 'rgba(255,255,255,.06)' }}>Gomma</button>
          <button type="button" onClick={handleUndo} disabled={!activeVertices.length && !activeLine.length && !undoStack.length} style={toolButtonStyle(false)}>Annulla</button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ ...toolButtonStyle(false), background: '#e8571a' }}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          {tool === 'draw' && (
            <button type="button" onClick={handleCloseShape} style={toolButtonStyle(false)}>{drawMode === 'line' ? 'Chiudi tratto' : 'Chiudi area'}</button>
          )}
          {!editingId && (
            <button type="button" onClick={handleClearAll} style={toolButtonStyle(false)}>Svuota bozza</button>
          )}
        </div>
      )}
      {correcting && tool === 'erase' && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{ fontSize: 12, fontWeight: 800, color: '#fca5a5' }}
            title="Sulle bozze non salvate la gomma taglia solo la porzione dentro il cerchio. Per modificare solo una parte di una correzione gia' salvata, revocala e ridisegna i tratti necessari."
          >
            GOMMA attiva — sulle bozze taglia solo la parte dentro il cerchio; su una correzione salvata la revoca (con motivo).
          </span>
          {/* §7 — dimensione gomma: il raggio mostrato §6 = il raggio usato da eraseNearest */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
            <span style={autoCtlLabelStyle}>Dimensione</span>
            <button type="button" onClick={() => setEraseRadiusM((r) => Math.max(5, r - 5))} style={secondaryButtonStyle}>−</button>
            <b style={{ minWidth: 44, textAlign: 'center' }}>{eraseRadiusM} m</b>
            <button type="button" onClick={() => setEraseRadiusM((r) => Math.min(50, r + 5))} style={secondaryButtonStyle}>+</button>
            {ERASE_RADIUS_PRESETS_M.map((m) => (
              <button key={m} type="button" onClick={() => setEraseRadiusM(m)} style={autoChipStyle(eraseRadiusM === m)}>{m}</button>
            ))}
          </span>
        </div>
      )}
      {autoBaseState.error && <div style={errorStyle}>{autoBaseState.error}</div>}
      {autoBaseState.loaded > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#86efac' }}>
          Copertura automatica caricata: {autoBaseState.loaded} vie reali come base editabile. Rimuovi le vie inutili con la GOMMA, poi Salva.
        </div>
      )}
      {lastBatchSave && (
        <div style={{ marginTop: 6, fontSize: 12, color: lastBatchSave.discarded > 0 ? '#fbbf24' : '#86efac' }}>
          Salvataggio automatico: {lastBatchSave.inserted} linee salvate (transazione unica){lastBatchSave.discarded > 0 ? ` · ${lastBatchSave.discarded} scartate perché geometria non valida` : ''}. Ricarica per la copertura finale.
        </div>
      )}
      {zoneRecalcPending && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#93c5fd' }}>
          Modifica salvata. Ricalcolo della copertura della zona in corso…
        </div>
      )}
      {/* §9 — KPI bozza automatica (nessun impatto sul FINALE finché non si salva) */}
      {autoKpi && autoConfigVisible && autoKpi.ways === 0 && (
        <div style={errorStyle}>
          Copertura automatica al {autoKpi.requestedPct}%: nessuna via selezionata (0 km). Non è un risultato valido — alza la percentuale, sposta il punto di partenza o riprova a caricare la rete.
        </div>
      )}
      {autoKpi && autoConfigVisible && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
          {[
            ['Copertura richiesta', `${autoKpi.requestedPct}%`],
            ...(autoKpi.scope === 'campaign' ? [
              ['Zone caricate', String(autoKpi.zonesLoaded)],
              ['Zone fallite', String(autoKpi.zonesFailed)],
            ] : []),
            ['Vie selezionate', autoKpi.ways.toLocaleString('it-IT')],
            ['Lunghezza selezionata', `${autoKpi.selectedKm.toLocaleString('it-IT', { maximumFractionDigits: 2 })} km`],
            ['Rete totale', `${autoKpi.totalKm.toLocaleString('it-IT', { maximumFractionDigits: 2 })} km`],
            ['Copertura effettiva', `${autoKpi.coveragePct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`],
            ['Origine', autoKpi.originLabel],
          ].map(([l, v]) => (
            <div key={l} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</span>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}

      {coverage && coverage.calculation_status === 'ready' && (
        <div style={coverageGridStyle}>
          <CoverageMetric label="GPS reale" value={coverage.gps_coverage_pct} color="#22c55e" />
          <CoverageMetric label="Verificata (man.+auto.)" value={coverage.manual_coverage_pct} color="#a855f7" />
          <CoverageMetric label="Area non accessibile" value={coverage.inaccessible_area_pct} color="#f97316" />
          <CoverageMetric label="FINALE VERIFICATA" value={coverage.final_operational_coverage_pct} color="#e8571a" emphasize />
        </div>
      )}
      {coverage && coverage.calculation_status !== 'ready' && (
        <div style={{ ...errorStyle, background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.6)' }}>
          Copertura non calcolabile: {coverage.reason_not_calculable || coverage.calculation_status}
        </div>
      )}

      {correcting && (
        <div style={formStyle}>
          {/* Selettore livello (gps/automatic/manual): pannello tecnico —
              nascosto in modalità simple. Il livello resta gestito
              implicitamente: manuale di default, 'automatic_verified' dopo
              "Carica copertura automatica", esclusione dalla GOMMA. */}
          {!simple && (
            <label style={labelStyle}>
              Livello (la gomma agisce su tutti e 3)
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                {COVERAGE_SOURCE_LEVELS.map((lv) => (
                  <button
                    key={lv.value}
                    type="button"
                    onClick={() => setSourceLevel(lv.value)}
                    style={{
                      border: sourceLevel === lv.value ? 'none' : '1px solid rgba(255,255,255,.14)',
                      borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                      background: sourceLevel === lv.value ? '#2563eb' : 'rgba(255,255,255,.05)', color: '#fff',
                    }}
                  >
                    {lv.label}
                  </button>
                ))}
              </div>
            </label>
          )}
          <p style={{ margin: '6px 0', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
            {isGpsLevel
              ? 'GOMMA sul GPS reale: crea un\'esclusione verificata (overlay). NON modifica mai gps_tracking_points.'
              : 'Matita = aggiungi tratto/area verificata. Gomma = disegna un\'esclusione, oppure revoca una correzione dallo storico.'}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
            {drawMode === 'line'
              ? `Tratto in disegno: ${activeLine.length} punti (min 2). Tratti chiusi: ${draftLines.length}.`
              : `Area in disegno: ${activeVertices.length} vertici (min 3). Aree chiuse: ${draftAreas.length}.`}
          </p>
          {!isGpsLevel && (
            <label style={labelStyle}>
              Strumento
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button type="button" onClick={() => setDrawMode('area')}
                  style={{ ...secondaryButtonStyle, background: drawMode === 'area' ? '#2563eb' : secondaryButtonStyle.background }}>Area (poligono)</button>
                <button type="button" onClick={() => setDrawMode('line')}
                  style={{ ...secondaryButtonStyle, background: drawMode === 'line' ? '#2563eb' : secondaryButtonStyle.background }}>Matita a tratto (linea)</button>
              </div>
            </label>
          )}
          {drawMode === 'line' && !isGpsLevel && (
            <label style={labelStyle}>
              Larghezza tratto: {lineBufferM} m
              <input type="range" min={4} max={40} step={2} value={lineBufferM}
                onChange={(e) => setLineBufferM(Number(e.target.value))} />
            </label>
          )}
          <label style={labelStyle}>
            Tipo correzione
            <select value={draftType} onChange={(e) => setDraftType(e.target.value)} style={inputStyle} disabled={isGpsLevel || drawMode === 'line'}>
              {isGpsLevel
                ? <option value="exclusion">Esclusione GPS (gomma)</option>
                : COVERAGE_ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Operatore associato
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {(operatorOptions.some((o) => o.key === selectedOperatorKey)
                ? operatorOptions
                : [...operatorOptions, { key: selectedOperatorKey, label: selectedOperatorKey }]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedOperatorKey(opt.key)}
                  style={{
                    border: selectedOperatorKey === opt.key ? 'none' : '1px solid rgba(255,255,255,.14)',
                    borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    background: selectedOperatorKey === opt.key ? manualOperatorColor(opt.key) : 'rgba(255,255,255,.05)',
                    color: '#fff',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>
          <label style={labelStyle}>
            Note (facoltative)
            <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={2} style={inputStyle} placeholder="Es. distribuzione a piedi confermata senza tracker attivo" />
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

      {/* §6 — cursore crosshair quando la GOMMA è attiva (Leaflet imposta un
          proprio cursore su .leaflet-container: serve un override mirato). */}
      <style>{'.leaflet-container.vp-erase-cursor{cursor:crosshair}'}</style>
      <div style={{ height: 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', marginTop: 12 }}>
        <MapContainer center={center} zoom={15} scrollWheelZoom className={correcting && tool === 'erase' ? 'vp-erase-cursor' : undefined} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <DrawClickCapture active={correcting} onAddPoint={addDrawPoint} />
          {/* §3 — click mappa per il punto di partenza automatico */}
          <OriginClickCapture active={correcting && autoConfigVisible && autoOriginMode === 'map'} onPick={handleAutoOriginPick} />
          {/* §1/§2 — cerchio GOMMA: segue il puntatore (mousemove DOM, scatta
              anche sopra le linee) in un pane sopra la copertura, sempre visibile. */}
          <EraseCursorCapture active={correcting && tool === 'erase'} radiusM={eraseRadiusM} />
          {/* §3 — marker "Punto di partenza automatico" */}
          {correcting && autoConfigVisible && autoOrigin && Number.isFinite(Number(autoOrigin.lat)) && (
            <CircleMarker center={[autoOrigin.lat, autoOrigin.lng]} radius={7} pathOptions={{ color: '#111827', fillColor: '#fbbf24', fillOpacity: 1, weight: 2 }}>
              <Popup>Punto di partenza automatico</Popup>
            </CircleMarker>
          )}

          {/* ANTEPRIMA "COPERTURA FINALE" = la STESSA geometria/stile che vede
              il Cliente ("Copertura verificata"). Nessuna distinzione per
              source. */}
          {showFinalPreview && coverage?.final_coverage_geometry
            && geoJsonPolygonToLeafletPositions(coverage.final_coverage_geometry).length > 0 && (
            <Polygon
              positions={geoJsonPolygonToLeafletPositions(coverage.final_coverage_geometry)}
              pathOptions={VERIFIED_COVERAGE_STYLE}
              interactive={false}
            />
          )}

          {boundaryGeometry && geoJsonPolygonToLeafletPositions(boundaryGeometry).length > 0 && (
            <Polygon
              positions={geoJsonPolygonToLeafletPositions(boundaryGeometry)}
              pathOptions={{ color: BOUNDARY_COLOR, weight: 2, dashArray: '6 4', fill: false }}
              interactive={false}
            />
          )}

          {/* PUNTI GPS REALI: singoli dots per ogni posizione registrata */}
          {path.map((pos, idx) => (
            <CircleMarker
              key={`gps-dot-${idx}`}
              center={pos}
              radius={3}
              pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.75, weight: 1 }}
            />
          ))}
          {coverage?.gps_coverage_geometry && (
            <Polygon
              positions={polygonGeoJsonToLatLngs(coverage.gps_coverage_geometry.type === 'Polygon' ? coverage.gps_coverage_geometry : { coordinates: coverage.gps_coverage_geometry.coordinates?.[0] })}
              pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.18, weight: 1 }}
            />
          )}

          {activeAdjustments.flatMap((adj) => {
            const isExclusion = adj.adjustment_type === 'exclusion';
            const isInaccessible = adj.adjustment_type === 'inaccessible';
            // §2: exclusion = rosso distinto; manual/automatic = colore
            // dell'operatore reale.
            const strokeColor = isExclusion ? '#dc2626' : manualOperatorColor(adj.metadata?.operator_key);
            const handlers = { click: () => {
              if (!correcting) { startEditing(adj); return; }
              if (tool === 'select') startEditing(adj);
              else if (tool === 'erase') handleRevoke(adj);
            } };
            const popup = (
              <Popup>
                <strong>{TYPE_LABELS[adj.adjustment_type]}</strong>{adj.metadata?.operator_key ? ` — ${operatorLabelForKey(adj.metadata.operator_key)}` : ''}<br />
                {adj.reason}<br />
                {adj.updated_at ? new Date(adj.updated_at).toLocaleString('it-IT') : ''}
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => startEditing(adj)}>Modifica</button>{' '}
                  <button type="button" onClick={() => handleRevoke(adj)}>Revoca</button>
                </div>
              </Popup>
            );
            const rings = geometryToLeafletLines(adj.geometry);
            if (isPolygonGeometry(adj.geometry)) {
              return rings.map((ring, ri) => (
                <Polygon
                  key={`${adj.id}-p${ri}`}
                  positions={ring}
                  pathOptions={{
                    color: strokeColor,
                    fillColor: TYPE_COLORS[adj.adjustment_type] || '#a855f7',
                    fillOpacity: isInaccessible ? 0.08 : 0.22,
                    weight: 3,
                    dashArray: (isInaccessible || isExclusion) ? '8 6' : undefined,
                  }}
                  eventHandlers={handlers}
                >{ri === 0 ? popup : null}</Polygon>
              ));
            }
            // §1: LineString / MultiLineString salvate -> Polyline (linea
            // continua, mai poligono degenere). Nessun vertex marker.
            return rings.map((line, li) => (
              <Polyline
                key={`${adj.id}-l${li}`}
                positions={line}
                pathOptions={{
                  color: strokeColor,
                  weight: 4,
                  opacity: 0.95,
                  lineCap: 'round',
                  dashArray: isExclusion ? '6 5' : undefined,
                }}
                eventHandlers={handlers}
              >{li === 0 ? popup : null}</Polyline>
            ));
          })}
          {/* Un solo marker START per operatore (Fase 6: no marker per ogni
              area), sulla prima correzione attiva trovata per quell'operatore. */}
          {presentOperatorKeys.map((key) => {
            const firstAdj = activeAdjustments.find((a) => a.metadata?.operator_key === key);
            const pos = firstAdj ? geometryFirstLatLng(firstAdj.geometry) : null;
            return pos ? (
              <Marker key={`man-start-${key}`} position={pos} icon={manualOperatorDivIcon(operatorShortForKey(key), manualOperatorColor(key))} />
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
                color: activeAreaOutsideBoundary ? '#dc2626' : (isGpsLevel ? '#dc2626' : TYPE_COLORS[draftType]),
                fillColor: activeAreaOutsideBoundary ? '#dc2626' : (isGpsLevel ? '#dc2626' : TYPE_COLORS[draftType]),
                fillOpacity: 0.25,
                weight: 2,
                dashArray: '4 4',
              }}
            />
          )}
          {/* §9: vertex marker SOLO mentre si disegna/modifica (tool matita) e
              piccoli. Dopo "Chiudi" / salvataggio activeVertices e' vuoto ->
              spariscono. Nella preview Cliente non esistono (correcting=false). */}
          {correcting && tool === 'draw' && activeVertices.map((v, i) => (
            <CircleMarker key={i} center={v} radius={3} pathOptions={{ color: '#111827', fillColor: '#fff', fillOpacity: 1, weight: 1 }} />
          ))}

          {/* Bozza tratti (matita / base automatica caricata). In modalita'
              GOMMA sono cliccabili: click -> §8 split parziale nel punto
              cliccato, non rimozione dell'intero tratto. */}
          {correcting && !editingId && draftLines.map((line, i) => (
            <Polyline key={`draft-line-${i}`} positions={line}
              pathOptions={{ color: tool === 'erase' ? '#dc2626' : '#a855f7', weight: tool === 'erase' ? 8 : 3, opacity: 0.9, dashArray: '4 4', lineCap: 'round' }}
              eventHandlers={tool === 'erase' ? { click: (e) => {
                // §1: hit-test preciso di Leaflet sul tratto -> split reale.
                // Segna il timestamp cosi' il catch-all del map non raddoppia.
                justErasedRef.current = Date.now();
                L.DomEvent.stopPropagation(e);
                applyDraftLineSplit(line, [e.latlng.lat, e.latlng.lng]);
              } } : undefined} />
          ))}
          {correcting && activeLine.length > 0 && (
            <Polyline positions={activeLine} pathOptions={{ color: '#a855f7', weight: 3, opacity: 0.9, dashArray: '2 4' }} />
          )}
          {correcting && tool === 'draw' && activeLine.map((v, i) => (
            <CircleMarker key={`al-${i}`} center={v} radius={3} pathOptions={{ color: '#111827', fillColor: '#a855f7', fillOpacity: 1, weight: 1 }} />
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
        <input type="checkbox" checked={showFinalPreview} onChange={(e) => setShowFinalPreview(e.target.checked)} />
        Anteprima "Copertura finale" (identica alla vista Cliente)
      </label>

      <Legend />
      <OperatorLegend
        campaignOperators={campaignOperators}
        gpsOperators={gpsOperators}
        gpsOperatorCount={gpsOperatorCount}
        presentOperatorKeys={presentOperatorKeys}
        operatorLabelForKey={operatorLabelForKey}
      />

      {/* Storico correzioni: pannello di consultazione/revoca — nascosto in
          modalità simple (Monitor operativo). La revoca resta possibile con la
          GOMMA direttamente sulla correzione salvata sulla mappa. */}
      <div style={{ marginTop: 12, display: simple ? 'none' : 'block' }}>
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

// Legenda FISSA della simbologia (non per-operatore): confine, traccia GPS,
// copertura GPS, area non accessibile, revocata. I colori per singolo
// operatore sono nella OperatorLegend qui sotto.
function Legend() {
  const items = [
    { color: BOUNDARY_COLOR, label: 'Confine comune (zona selezionata)', dashed: true },
    { color: '#2563eb', label: 'Traccia GPS reale' },
    { color: '#22c55e', label: 'Copertura GPS', fillOnly: true },
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

// §3 — legenda OPERATORI: elenco chiaro con nome + pallino del colore reale
// usato sulla mappa (stesso getOperatorColor sia per la traccia GPS sia per
// le correzioni manuali dello stesso operatore). Mai il solo contatore
// "Operatori GPS reali: N" quando esistono nomi/id.
function OperatorLegend({ campaignOperators = [], gpsOperators = [], gpsOperatorCount = 0, presentOperatorKeys = [], operatorLabelForKey = (k) => k }) {
  // Operatori realmente ASSEGNATI alla campagna (fonte: assegnazioni reali).
  const assignedOperators = (Array.isArray(campaignOperators) ? campaignOperators : [])
    .filter((o) => o && (o.operatorId || o.assignmentId));
  const hasAssigned = assignedOperators.length > 0;
  const hasGps = gpsOperators.length > 0;
  const hasManual = presentOperatorKeys.length > 0;
  if (!hasAssigned && !hasGps && !hasManual && gpsOperatorCount === 0) return null;

  const dot = (color) => ({
    width: 11, height: 11, borderRadius: 999, background: color,
    border: '1px solid rgba(0,0,0,.35)', flex: '0 0 auto',
  });
  const groupTitle = { margin: '10px 0 4px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(255,255,255,.45)' };
  const rowStyleLocal = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.72)', padding: '2px 0' };

  return (
    <div style={{ marginTop: 10 }}>
      {/* OPERATORI CAMPAGNA — tutti gli assegnati, nome reale + colore stabile
          (stesso getOperatorColor di traccia GPS / correzioni manuali). */}
      {hasAssigned && (
        <>
          <p style={groupTitle}>Operatori campagna ({assignedOperators.length})</p>
          {assignedOperators.map((o, i) => {
            const key = String(o.operatorId || o.assignmentId);
            return (
              <div key={`camp-${key}`} style={rowStyleLocal}>
                <span style={dot(manualOperatorColor(key))} />
                {o.name || `Operatore ${key.slice(0, 8)}`}
              </div>
            );
          })}
        </>
      )}

      <p style={groupTitle}>Operatori GPS reali{hasGps ? '' : `: ${gpsOperatorCount}`}</p>
      {hasGps ? (
        gpsOperators.map((op, i) => (
          <div key={`gps-${op.id}`} style={rowStyleLocal}>
            <span style={dot(op.color)} />
            {op.name || `Operatore ${i + 1}`}
          </div>
        ))
      ) : (
        <div style={{ ...rowStyleLocal, color: 'rgba(255,255,255,.45)' }}>Nessuna traccia GPS con operatore identificato.</div>
      )}

      <p style={groupTitle}>Operatori Admin manuali{hasManual ? '' : ': 0'}</p>
      {hasManual ? (
        presentOperatorKeys.map((key) => (
          <div key={`man-${key}`} style={rowStyleLocal}>
            <span style={dot(manualOperatorColor(key))} />
            {operatorLabelForKey(key)}
          </div>
        ))
      ) : (
        <div style={{ ...rowStyleLocal, color: 'rgba(255,255,255,.45)' }}>Nessuna correzione manuale associata a un operatore.</div>
      )}
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
function toolButtonStyle(active) {
  return {
    border: active ? 'none' : '1px solid rgba(255,255,255,.16)',
    borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
    background: active ? '#2563eb' : 'rgba(255,255,255,.06)', color: '#fff',
  };
}
const errorStyle = { padding: 10, borderRadius: 8, color: '#fecaca', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', marginTop: 8, fontSize: 12 };
const autoCtlLabelStyle = { fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em' };
function autoChipStyle(active, disabled = false) {
  return {
    border: active ? 'none' : '1px solid rgba(255,255,255,.16)',
    borderRadius: 8, padding: '5px 9px', fontSize: 12, fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
    background: active ? '#0f766e' : 'rgba(255,255,255,.06)', color: '#fff',
  };
}
const formStyle = { marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 8 };
const inputStyle = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 6, color: '#fff', padding: '6px 8px', fontFamily: 'inherit', fontSize: 13 };
const coverageGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginTop: 12 };
const coverageMetricStyle = { display: 'grid', gap: 4, padding: 10, background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid' };
const legendStyle = { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.6)' };
const legendItemStyle = { display: 'flex', alignItems: 'center', gap: 6 };
const rowStyle = { display: 'flex', gap: 12, padding: 10, borderBottom: '1px solid rgba(255,255,255,.07)', alignItems: 'center', flexWrap: 'wrap', fontSize: 13 };
