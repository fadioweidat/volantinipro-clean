// Studio Mappa — stato degli strumenti manuali + handler mappa.
//
// Tiene: strumento corrente, vertici in disegno, snapping, raggio gomma,
// selezione (feature / vertice), stato del join. Applica le mutazioni via
// `ops` di useMapStudioProject. Espone handler puri per <MapStudioCanvas>.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  pointToPolyline,
  polylineLengthMeters,
  haversineMeters,
  snapPoint,
  brushEraseLine,
  splitLineAtPoint,
  splitLineAtVertex,
  joinLines,
  moveVertex,
  deleteVertex,
  hitTestFeatures,
  buildSpatialIndex,
} from './mapStudioGeometry.js';

export const TOOLS = Object.freeze([
  { id: 'select', label: 'Seleziona' },
  { id: 'line', label: 'Matita linea' },
  { id: 'polygon', label: 'Poligono' },
  { id: 'move', label: 'Sposta vertice' },
  { id: 'split', label: 'Split linea' },
  { id: 'join', label: 'Unisci linee' },
  { id: 'erase', label: 'Gomma' },
]);

export const SNAP_MODES = Object.freeze([
  { id: 'off', label: 'Snap off' },
  { id: 'road', label: 'Snap strada' },
  { id: 'geometry', label: 'Snap geometria' },
]);

const DEFAULT_ERASE_RADIUS_M = 20;
const JOIN_TOLERANCE_M = 8;
const SNAP_TOLERANCE_M = 15;

// featuresToLineShapes: [{ id, operatorId, type, lines:[[[lat,lng]...]] }]
function featureLineShapes(features) {
  return (features || [])
    .filter((f) => f.type === 'line')
    .map((f) => ({ id: f.id, operatorId: f.operatorId, type: f.type, lines: [f.geometry] }));
}

export function useMapStudioDrawing({ project, ops, roadWays }) {
  const [tool, setTool] = useState('select');
  const [snapMode, setSnapMode] = useState('off');
  const [eraseRadiusM, setEraseRadiusM] = useState(DEFAULT_ERASE_RADIUS_M);
  const [activeVertices, setActiveVertices] = useState([]);
  const [activeOperatorId, setActiveOperatorId] = useState(project.operators[0]?.id || null);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [selectedVertex, setSelectedVertex] = useState(null); // { featureId, vertexIndex }
  const [joinFirstId, setJoinFirstId] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);

  // indice spaziale ricostruito solo quando cambia il numero/id dei feature
  // linea (NON ad ogni mousemove).
  const indexRef = useRef({ sig: '', index: null });
  const spatialIndex = useMemo(() => {
    const shapes = featureLineShapes(project.features);
    const sig = shapes.map((s) => s.id).join('|') + ':' + project.features.length;
    if (indexRef.current.sig !== sig) {
      indexRef.current = { sig, index: buildSpatialIndex(shapes) };
    }
    return indexRef.current.index;
  }, [project.features]);

  const snapTargets = useMemo(() => {
    if (snapMode === 'road') return roadWays || [];
    if (snapMode === 'geometry') return project.features.filter((f) => f.type === 'line').map((f) => f.geometry);
    return [];
  }, [snapMode, roadWays, project.features]);

  const applySnap = useCallback((latlng) => {
    if (snapMode === 'off' || snapTargets.length === 0) return latlng;
    return snapPoint(latlng, snapTargets, SNAP_TOLERANCE_M);
  }, [snapMode, snapTargets]);

  // ── DISEGNO (matita / poligono) ─────────────────────────────────
  const addPoint = useCallback((latlng) => {
    const snapped = applySnap(latlng);
    setActiveVertices((prev) => [...prev, snapped]);
  }, [applySnap]);

  const undoLastPoint = useCallback(() => {
    setActiveVertices((prev) => prev.slice(0, -1));
  }, []);

  const cancelActive = useCallback(() => setActiveVertices([]), []);

  const closeShape = useCallback(() => {
    setActiveVertices((prev) => {
      if (tool === 'line' && prev.length >= 2) {
        ops.addFeature({ operatorId: activeOperatorId, type: 'line', source: 'manual', geometry: prev });
      } else if (tool === 'polygon' && prev.length >= 3) {
        ops.addFeature({ operatorId: activeOperatorId, type: 'polygon', source: 'manual', geometry: prev });
      }
      return [];
    });
  }, [tool, ops, activeOperatorId]);

  // ── GOMMA (parziale, per feature) ──────────────────────────────
  const eraseAt = useCallback((latlng) => {
    const shapes = featureLineShapes(project.features);
    const hit = hitTestFeatures(shapes, latlng, Math.max(eraseRadiusM, 30), spatialIndex);
    if (!hit) return { ok: false, reason: 'no-hit' };
    const src = project.features.find((f) => f.id === hit.featureId);
    if (!src || src.locked) return { ok: false, reason: 'locked-or-missing' };
    const residuals = brushEraseLine(src.geometry, latlng, eraseRadiusM);
    if (residuals.length === 1 && residuals[0] === src.geometry) {
      return { ok: false, reason: 'circle-misses' };
    }
    if (residuals.length === 0) {
      ops.removeFeature(src.id);
      return { ok: true, removed: true };
    }
    ops.replaceFeature(src.id, residuals.map((geometry) => ({
      operatorId: src.operatorId, type: 'line', source: src.source, style: src.style, geometry,
    })), 'erase', 'Gomma parziale');
    return { ok: true, pieces: residuals.length };
  }, [project.features, eraseRadiusM, ops, spatialIndex]);

  // ── SPLIT ─────────────────────────────────────────────────────
  const splitAt = useCallback((latlng) => {
    const shapes = featureLineShapes(project.features);
    const hit = hitTestFeatures(shapes, latlng, 25, spatialIndex);
    if (!hit) return { ok: false };
    const src = project.features.find((f) => f.id === hit.featureId);
    if (!src || src.locked) return { ok: false };
    const parts = splitLineAtPoint(src.geometry, latlng);
    if (parts.length < 2) return { ok: false };
    ops.replaceFeature(src.id, parts.map((geometry) => ({
      operatorId: src.operatorId, type: 'line', source: src.source, style: src.style, geometry,
    })), 'split', 'Split linea');
    return { ok: true };
  }, [project.features, ops, spatialIndex]);

  const splitSelectedAtVertex = useCallback((vertexIndex) => {
    if (!selectedFeatureId) return;
    const src = project.features.find((f) => f.id === selectedFeatureId);
    if (!src || src.type !== 'line') return;
    const parts = splitLineAtVertex(src.geometry, vertexIndex);
    if (parts.length < 2) return;
    ops.replaceFeature(src.id, parts.map((geometry) => ({
      operatorId: src.operatorId, type: 'line', source: src.source, style: src.style, geometry,
    })), 'split', 'Split linea');
  }, [selectedFeatureId, project.features, ops]);

  // ── JOIN ──────────────────────────────────────────────────────
  const pickForJoin = useCallback((featureId) => {
    if (!joinFirstId) { setJoinFirstId(featureId); return { ok: true, pending: true }; }
    if (joinFirstId === featureId) { setJoinFirstId(null); return { ok: true, cancelled: true }; }
    const a = project.features.find((f) => f.id === joinFirstId);
    const b = project.features.find((f) => f.id === featureId);
    setJoinFirstId(null);
    if (!a || !b || a.type !== 'line' || b.type !== 'line') return { ok: false };
    const merged = joinLines(a.geometry, b.geometry, JOIN_TOLERANCE_M);
    if (!merged) return { ok: false, reason: 'not-contiguous' };
    // sostituisce A con la linea unita, elimina B
    ops.replaceFeature(a.id, [{ operatorId: a.operatorId, type: 'line', source: a.source, style: a.style, geometry: merged }], 'join', 'Unione linee');
    ops.removeFeature(b.id);
    return { ok: true };
  }, [joinFirstId, project.features, ops]);

  // ── MOVE VERTEX ───────────────────────────────────────────────
  const moveSelectedVertex = useCallback((featureId, vertexIndex, latlng) => {
    const src = project.features.find((f) => f.id === featureId);
    if (!src || src.locked) return;
    const snapped = applySnap(latlng);
    const nextGeom = moveVertex(src.geometry, vertexIndex, snapped);
    ops.updateFeature(featureId, { geometry: nextGeom }, 'move', 'Sposta vertice');
  }, [project.features, ops, applySnap]);

  const deleteSelectedVertex = useCallback((featureId, vertexIndex) => {
    const src = project.features.find((f) => f.id === featureId);
    if (!src || src.locked) return;
    ops.updateFeature(featureId, { geometry: deleteVertex(src.geometry, vertexIndex) }, 'move', 'Elimina vertice');
  }, [project.features, ops]);

  // ── HANDLER MAPPA (dispatch per tool) ────────────────────────
  const onMapClick = useCallback((latlng) => {
    switch (tool) {
      case 'line':
      case 'polygon':
        addPoint(latlng);
        break;
      case 'erase':
        eraseAt(latlng);
        break;
      case 'split':
        splitAt(latlng);
        break;
      case 'select': {
        const hit = hitTestFeatures(featureLineShapes(project.features), latlng, 20, spatialIndex);
        setSelectedFeatureId(hit ? hit.featureId : null);
        break;
      }
      default:
        break;
    }
  }, [tool, addPoint, eraseAt, splitAt, project.features, spatialIndex]);

  const onMapMouseMove = useCallback((latlng) => {
    if (tool === 'erase') setHoverPoint(latlng);
    else if (hoverPoint) setHoverPoint(null);
  }, [tool, hoverPoint]);

  const onFeatureClick = useCallback((featureId, latlng) => {
    if (tool === 'join') return pickForJoin(featureId);
    if (tool === 'erase') { eraseAt(latlng); return undefined; }
    if (tool === 'split') { splitAt(latlng); return undefined; }
    setSelectedFeatureId(featureId);
    return undefined;
  }, [tool, pickForJoin, eraseAt, splitAt]);

  // ── metriche live del disegno in corso ──────────────────────
  const activeLengthM = useMemo(() => polylineLengthMeters(activeVertices), [activeVertices]);
  const lastSegmentM = useMemo(() => {
    if (activeVertices.length < 2) return 0;
    return haversineMeters(activeVertices[activeVertices.length - 2], activeVertices[activeVertices.length - 1]);
  }, [activeVertices]);

  const distanceToPreview = useCallback((latlng) => {
    if (activeVertices.length === 0) return 0;
    return haversineMeters(activeVertices[activeVertices.length - 1], latlng);
  }, [activeVertices]);

  return {
    tool, setTool,
    snapMode, setSnapMode,
    eraseRadiusM, setEraseRadiusM,
    activeVertices, activeLengthM, lastSegmentM, distanceToPreview,
    activeOperatorId, setActiveOperatorId,
    selectedFeatureId, setSelectedFeatureId,
    selectedVertex, setSelectedVertex,
    joinFirstId,
    hoverPoint,
    spatialIndex,
    actions: {
      addPoint, undoLastPoint, cancelActive, closeShape,
      eraseAt, splitAt, splitSelectedAtVertex, pickForJoin,
      moveSelectedVertex, deleteSelectedVertex,
      onMapClick, onMapMouseMove, onFeatureClick,
      pointToPolyline,
    },
  };
}
