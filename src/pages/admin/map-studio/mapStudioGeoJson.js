// Studio Mappa — export / import GeoJSON.
//
// Un progetto → FeatureCollection GeoJSON che PRESERVA:
//   - project metadata (nome, comune, provincia, regione, boundary, center,
//     layers, note, timestamps) in `properties` della collection
//   - la lista operatori (id, name, color, style, kind, visible, locked)
//   - per ogni feature: operatorId, operatorName, source, style, geometry
//
// Round-trip garantito: importProjectFromGeoJson(exportProjectToGeoJson(p))
// ricostruisce un progetto equivalente (id nuovi solo se richiesto).
//
// GeoJSON usa [lng,lat]; internamente lo Studio usa [lat,lng]. La conversione
// avviene SOLO qui.

import { normalizeProject, createProject } from './mapStudioProject.js';

const NS = 'volantinipro:map-studio';

function latLngLineToGeo(line) {
  return (line || []).map(([lat, lng]) => [lng, lat]);
}
function geoLineToLatLng(coords) {
  return (coords || []).map(([lng, lat]) => [lat, lng]);
}

function featureToGeoJson(feature, operator) {
  const props = {
    [`${NS}:featureId`]: feature.id,
    operatorId: feature.operatorId,
    operatorName: operator?.name || null,
    operatorColor: operator?.color || null,
    source: feature.source,
    featureType: feature.type,
    style: feature.style || null,
    locked: Boolean(feature.locked),
  };
  let geometry;
  if (feature.type === 'point') {
    geometry = { type: 'Point', coordinates: [feature.geometry[1], feature.geometry[0]] };
  } else if (feature.type === 'polygon') {
    const ring = latLngLineToGeo(feature.geometry);
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push(ring[0]);
    }
    geometry = { type: 'Polygon', coordinates: [ring] };
  } else {
    geometry = { type: 'LineString', coordinates: latLngLineToGeo(feature.geometry) };
  }
  return { type: 'Feature', properties: props, geometry };
}

export function exportProjectToGeoJson(project) {
  const p = project || createProject();
  return {
    type: 'FeatureCollection',
    [`${NS}:schema`]: 1,
    properties: {
      generator: NS,
      project: {
        id: p.id,
        name: p.name,
        municipality: p.municipality || null,
        province: p.province || null,
        region: p.region || null,
        boundary: p.boundary || null,
        center: p.center || null,
        layers: p.layers || null,
        auto: p.auto || null,
        notes: p.notes || '',
        status: p.status || 'draft',
        createdAt: p.createdAt || null,
        updatedAt: p.updatedAt || null,
      },
      operators: (p.operators || []).map((op) => ({
        id: op.id,
        name: op.name,
        kind: op.kind,
        color: op.color,
        visible: op.visible,
        locked: op.locked,
        style: op.style,
      })),
    },
    features: (p.features || []).map((ft) => featureToGeoJson(ft, (p.operators || []).find((o) => o.id === ft.operatorId))),
  };
}

export function exportProjectToGeoJsonString(project) {
  return JSON.stringify(exportProjectToGeoJson(project), null, 2);
}

// Import: accetta sia una FeatureCollection prodotta da noi (con metadata
// completo) sia una FeatureCollection GeoJSON generica (crea un operatore
// "Importato" e assegna tutte le geometrie a lui).
export function importProjectFromGeoJson(input, { regenerateIds = false } = {}) {
  const fc = typeof input === 'string' ? safeParse(input) : input;
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    return { ok: false, reason: 'not-a-featurecollection' };
  }

  const meta = fc.properties && typeof fc.properties === 'object' ? fc.properties : {};
  const projMeta = meta.project && typeof meta.project === 'object' ? meta.project : {};
  const isNative = meta.generator === NS || fc[`${NS}:schema`] != null;

  let operators = Array.isArray(meta.operators) && meta.operators.length
    ? meta.operators.map((op) => ({ ...op }))
    : null;

  if (!operators) {
    operators = [{ id: 'op_imported', name: 'Importato', kind: 'virtual', color: '#2563eb', visible: true, locked: false }];
  }
  const opIds = new Set(operators.map((o) => o.id));
  const fallbackOpId = operators[0].id;

  const features = fc.features.map((f) => {
    const g = f?.geometry;
    const props = f?.properties && typeof f.properties === 'object' ? f.properties : {};
    const opId = opIds.has(props.operatorId) ? props.operatorId : fallbackOpId;
    if (!g) return null;
    if (g.type === 'Point') {
      return { id: props[`${NS}:featureId`], operatorId: opId, type: 'point', source: props.source || 'imported', style: props.style || null, geometry: [g.coordinates[1], g.coordinates[0]], locked: Boolean(props.locked) };
    }
    if (g.type === 'LineString') {
      return { id: props[`${NS}:featureId`], operatorId: opId, type: 'line', source: props.source || 'imported', style: props.style || null, geometry: geoLineToLatLng(g.coordinates), locked: Boolean(props.locked) };
    }
    if (g.type === 'MultiLineString') {
      // ogni ramo diventa un feature linea autonomo
      return (g.coordinates || []).map((seg) => ({ id: undefined, operatorId: opId, type: 'line', source: props.source || 'imported', style: props.style || null, geometry: geoLineToLatLng(seg), locked: Boolean(props.locked) }));
    }
    if (g.type === 'Polygon') {
      return { id: props[`${NS}:featureId`], operatorId: opId, type: 'polygon', source: props.source || 'imported', style: props.style || null, geometry: geoLineToLatLng(g.coordinates?.[0]), locked: Boolean(props.locked) };
    }
    return null;
  }).flat().filter(Boolean);

  const draft = {
    ...createProject({
      name: projMeta.name || (isNative ? 'Progetto importato' : 'Import GeoJSON'),
      municipality: projMeta.municipality ?? null,
      province: projMeta.province ?? null,
      region: projMeta.region ?? null,
      boundary: projMeta.boundary ?? null,
      center: projMeta.center ?? null,
      id: regenerateIds ? undefined : projMeta.id,
    }),
    operators: operators.map((op, i) => ({
      id: regenerateIds ? undefined : op.id,
      name: op.name || `Operatore ${i + 1}`,
      kind: op.kind || 'virtual',
      color: op.color,
      visible: op.visible !== false,
      locked: Boolean(op.locked),
      style: op.style || undefined,
    })),
    features: regenerateIds ? features.map((ft) => ({ ...ft, id: undefined })) : features,
    layers: projMeta.layers || undefined,
    auto: projMeta.auto || undefined,
    notes: projMeta.notes || '',
    status: 'draft',
    createdAt: projMeta.createdAt || new Date().toISOString(),
  };

  const project = normalizeProject(draft);
  return project
    ? { ok: true, project, native: isNative }
    : { ok: false, reason: 'normalization-failed' };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
