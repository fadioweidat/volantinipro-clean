// Studio Mappa — modello del "Map Project" (client-only, FASE 1).
//
// Nessuna dipendenza da campagne reali, RPC o DB. Un progetto e' un oggetto
// JSON serializzabile; la persistenza (localStorage) e l'export (GeoJSON)
// lavorano su questa forma. PURO e testabile.

export const PROJECT_SCHEMA_VERSION = 1;

export const DEFAULT_OPERATOR_STYLE = Object.freeze({
  lineWidth: 3,
  opacity: 1,
  lineStyle: 'solid', // 'solid' | 'dash'
  pointSize: 6,
  markerStyle: 'circle', // 'circle' | 'square' | 'diamond'
});

// Palette dedicata allo Studio (NON importata da operatorColor.js: isolamento
// dal motore operativo). 12 tinte ben distanziate; oltre le 12 si ricicla.
export const STUDIO_OPERATOR_PALETTE = Object.freeze([
  '#2563eb', // blu
  '#16a34a', // verde
  '#f97316', // arancione
  '#a855f7', // viola
  '#0891b2', // ciano
  '#dc2626', // rosso
  '#db2777', // fucsia
  '#65a30d', // lime
  '#7c3aed', // indaco
  '#0d9488', // teal
  '#ca8a04', // ambra
  '#c026d3', // magenta
]);

export function operatorColorForIndex(index) {
  return STUDIO_OPERATOR_PALETTE[((index % STUDIO_OPERATOR_PALETTE.length) + STUDIO_OPERATOR_PALETTE.length) % STUDIO_OPERATOR_PALETTE.length];
}

let __seq = 0;
export function makeId(prefix = 'id') {
  __seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${__seq.toString(36)}_${rand}`;
}

export const DEFAULT_LAYERS = Object.freeze({
  boundary: { visible: true, opacity: 1 },
  network: { visible: true, opacity: 0.5 },
  auto: { visible: true, opacity: 1 },
  manual: { visible: true, opacity: 1 },
  operators: { visible: true, opacity: 1 },
  points: { visible: true, opacity: 1 },
  labels: { visible: true, opacity: 1 },
  importedGps: { visible: false, opacity: 0.7 }, // read-only, eventuale
});

export function createOperator({ name, index = 0, kind = 'virtual', id } = {}) {
  return {
    id: id || makeId('op'),
    name: name || `Operatore ${index + 1}`,
    kind, // 'virtual' | 'real' (real = importato in sola copia da una campagna)
    color: operatorColorForIndex(index),
    visible: true,
    locked: false,
    style: { ...DEFAULT_OPERATOR_STYLE },
  };
}

// Un feature: linea / poligono / punto. geometry SEMPRE [lat,lng] internamente
// (la conversione GeoJSON [lng,lat] e' solo in mapStudioGeoJson.js).
export function createFeature({ operatorId, type = 'line', geometry = [], source = 'manual', style = null, id } = {}) {
  return {
    id: id || makeId('ft'),
    operatorId: operatorId || null,
    type, // 'line' | 'polygon' | 'point'
    source, // 'manual' | 'auto' | 'imported'
    geometry, // line: [[lat,lng],...] ; polygon: [[lat,lng],...] ; point: [lat,lng]
    style, // override opzionale sullo stile operatore
    locked: false,
  };
}

export function createProject({
  name = 'Nuovo progetto',
  municipality = null,
  province = null,
  region = null,
  boundary = null,
  center = null,
  operators = null,
  id,
} = {}) {
  const now = new Date().toISOString();
  const ops = Array.isArray(operators) && operators.length
    ? operators
    : [createOperator({ index: 0 })];
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: id || makeId('proj'),
    name,
    municipality,
    province,
    region,
    boundary, // GeoJSON Polygon/MultiPolygon reale, o null
    center, // [lat,lng] o null
    operators: ops,
    features: [],
    layers: JSON.parse(JSON.stringify(DEFAULT_LAYERS)),
    auto: { percent: 80, originMode: 'center', originPoint: null, operatorId: ops[0].id, lastResult: null },
    notes: '',
    status: 'draft', // 'draft' | 'saved' | 'archived'
    createdAt: now,
    updatedAt: now,
  };
}

// Normalizza / valida un progetto letto da storage o import: colma i campi
// mancanti, scarta geometrie malformate, garantisce id operatore validi.
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = createProject({
    name: typeof raw.name === 'string' ? raw.name : 'Progetto importato',
    municipality: raw.municipality ?? null,
    province: raw.province ?? null,
    region: raw.region ?? null,
    boundary: raw.boundary ?? null,
    center: Array.isArray(raw.center) && raw.center.length === 2 ? [Number(raw.center[0]), Number(raw.center[1])] : null,
    id: typeof raw.id === 'string' ? raw.id : undefined,
  });

  const operators = Array.isArray(raw.operators) && raw.operators.length
    ? raw.operators.map((op, i) => ({
      ...createOperator({ index: i, id: typeof op?.id === 'string' ? op.id : undefined }),
      ...pick(op, ['name', 'kind', 'color', 'visible', 'locked']),
      style: { ...DEFAULT_OPERATOR_STYLE, ...(op && typeof op.style === 'object' ? op.style : {}) },
    }))
    : base.operators;
  const opIds = new Set(operators.map((o) => o.id));
  const fallbackOpId = operators[0].id;

  const features = (Array.isArray(raw.features) ? raw.features : [])
    .map((ft) => {
      const type = ft?.type === 'polygon' || ft?.type === 'point' ? ft.type : 'line';
      const geometry = sanitizeGeometry(type, ft?.geometry);
      if (!geometry) return null;
      return {
        ...createFeature({
          id: typeof ft?.id === 'string' ? ft.id : undefined,
          operatorId: opIds.has(ft?.operatorId) ? ft.operatorId : fallbackOpId,
          type,
          source: ['manual', 'auto', 'imported'].includes(ft?.source) ? ft.source : 'manual',
          style: ft && typeof ft.style === 'object' ? ft.style : null,
          geometry,
        }),
        locked: Boolean(ft?.locked),
      };
    })
    .filter(Boolean);

  return {
    ...base,
    operators,
    features,
    layers: mergeLayers(raw.layers),
    auto: {
      ...base.auto,
      ...(raw.auto && typeof raw.auto === 'object' ? pick(raw.auto, ['percent', 'originMode', 'originPoint', 'operatorId', 'lastResult']) : {}),
      operatorId: opIds.has(raw?.auto?.operatorId) ? raw.auto.operatorId : fallbackOpId,
    },
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    status: ['draft', 'saved', 'archived'].includes(raw.status) ? raw.status : 'draft',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function mergeLayers(rawLayers) {
  const base = JSON.parse(JSON.stringify(DEFAULT_LAYERS));
  if (!rawLayers || typeof rawLayers !== 'object') return base;
  for (const key of Object.keys(base)) {
    if (rawLayers[key] && typeof rawLayers[key] === 'object') {
      base[key] = {
        visible: rawLayers[key].visible !== false,
        opacity: clamp01(rawLayers[key].opacity, base[key].opacity),
      };
    }
  }
  return base;
}
function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function isLatLng(p) {
  return Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
    && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
}

function sanitizeGeometry(type, geometry) {
  if (type === 'point') return isLatLng(geometry) ? [Number(geometry[0]), Number(geometry[1])] : null;
  if (!Array.isArray(geometry)) return null;
  const pts = geometry.filter(isLatLng).map((p) => [Number(p[0]), Number(p[1])]);
  if (type === 'polygon') return pts.length >= 3 ? pts : null;
  return pts.length >= 2 ? pts : null; // line
}

export function touchProject(project) {
  return { ...project, updatedAt: new Date().toISOString() };
}
