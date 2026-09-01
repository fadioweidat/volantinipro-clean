// Studio Mappa — stato del progetto corrente + mutazioni + persistenza
// localStorage. Nessuna RPC, nessun DB.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createProject,
  createOperator,
  createFeature,
  operatorColorForIndex,
  touchProject,
} from './mapStudioProject.js';
import {
  saveProject as storageSave,
  saveProjectAs as storageSaveAs,
  renameProject as storageRename,
  archiveProject as storageArchive,
  loadProject as storageLoad,
  setLastProjectId,
} from './mapStudioStorage.js';
import { useMapStudioHistory } from './useMapStudioHistory.js';
import { importProjectFromGeoJson } from './mapStudioGeoJson.js';

export function useMapStudioProject(initial = null) {
  const [project, setProjectState] = useState(() => initial || createProject());
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState(null);
  const history = useMapStudioHistory(project);
  const projectRef = useRef(project);
  projectRef.current = project;

  // helper: applica una mutazione registrandola nello storico. Nessun
  // side-effect dentro l'updater di setState (React lo vuole puro): si calcola
  // il prossimo progetto da projectRef, si aggiorna il ref, poi setState +
  // commit come statement separati.
  const mutate = useCallback((updater, kind, label) => {
    const prev = projectRef.current;
    const draft = typeof updater === 'function' ? updater(prev) : updater;
    const next = touchProject(draft);
    projectRef.current = next;
    setProjectState(next);
    history.commit(next, kind, label);
    setDirty(true);
  }, [history]);

  // sostituzione integrale SENZA storia (load / new / saveAs / import)
  const replaceProject = useCallback((next, { markDirty = false } = {}) => {
    projectRef.current = next;
    setProjectState(next);
    history.reset(next);
    setDirty(markDirty);
  }, [history]);

  // ── OPERATORI ──────────────────────────────────────────────────────
  const addOperator = useCallback((partial = {}) => {
    mutate((prev) => {
      const idx = prev.operators.length;
      const op = createOperator({ index: idx, ...partial });
      return { ...prev, operators: [...prev.operators, op] };
    }, 'operator', 'Aggiunto operatore');
  }, [mutate]);

  const updateOperator = useCallback((operatorId, patch) => {
    mutate((prev) => ({
      ...prev,
      operators: prev.operators.map((op) => (op.id === operatorId
        ? { ...op, ...patch, style: patch.style ? { ...op.style, ...patch.style } : op.style }
        : op)),
    }), 'style', 'Modifica operatore');
  }, [mutate]);

  const removeOperator = useCallback((operatorId) => {
    mutate((prev) => {
      if (prev.operators.length <= 1) return prev;
      const remaining = prev.operators.filter((op) => op.id !== operatorId);
      const fallback = remaining[0].id;
      return {
        ...prev,
        operators: remaining,
        features: prev.features.map((f) => (f.operatorId === operatorId ? { ...f, operatorId: fallback } : f)),
        auto: { ...prev.auto, operatorId: prev.auto.operatorId === operatorId ? fallback : prev.auto.operatorId },
      };
    }, 'operator', 'Rimosso operatore');
  }, [mutate]);

  const reassignColors = useCallback(() => {
    mutate((prev) => ({
      ...prev,
      operators: prev.operators.map((op, i) => ({ ...op, color: operatorColorForIndex(i) })),
    }), 'style', 'Ricolora operatori');
  }, [mutate]);

  // ── FEATURE (linee / poligoni / punti) ────────────────────────────
  const addFeature = useCallback((partial) => {
    const ft = createFeature(partial);
    mutate((prev) => ({ ...prev, features: [...prev.features, ft] }), 'draw', 'Nuovo elemento');
    return ft.id;
  }, [mutate]);

  const addFeatures = useCallback((list, kind = 'auto', label = 'Generazione automatica') => {
    const made = (list || []).map((p) => createFeature(p));
    mutate((prev) => ({ ...prev, features: [...prev.features, ...made] }), kind, label);
    return made.map((f) => f.id);
  }, [mutate]);

  const updateFeature = useCallback((featureId, patch, kind = 'move', label = 'Modifica elemento') => {
    mutate((prev) => ({
      ...prev,
      features: prev.features.map((f) => (f.id === featureId ? { ...f, ...patch } : f)),
    }), kind, label);
  }, [mutate]);

  const replaceFeature = useCallback((featureId, newFeatures, kind = 'split', label = 'Split / erase') => {
    mutate((prev) => {
      const idx = prev.features.findIndex((f) => f.id === featureId);
      if (idx < 0) return prev;
      const made = (newFeatures || []).map((nf) => createFeature(nf));
      const next = prev.features.slice();
      next.splice(idx, 1, ...made);
      return { ...prev, features: next };
    }, kind, label);
  }, [mutate]);

  const removeFeature = useCallback((featureId) => {
    mutate((prev) => ({ ...prev, features: prev.features.filter((f) => f.id !== featureId) }), 'delete', 'Elimina elemento');
  }, [mutate]);

  const duplicateFeature = useCallback((featureId, offsetLatLng = [0.0004, 0.0004]) => {
    mutate((prev) => {
      const src = prev.features.find((f) => f.id === featureId);
      if (!src) return prev;
      const shift = (g) => (src.type === 'point'
        ? [g[0] + offsetLatLng[0], g[1] + offsetLatLng[1]]
        : g.map(([lat, lng]) => [lat + offsetLatLng[0], lng + offsetLatLng[1]]));
      const clone = createFeature({ ...src, id: undefined, geometry: shift(src.geometry) });
      return { ...prev, features: [...prev.features, clone] };
    }, 'duplicate', 'Duplica elemento');
  }, [mutate]);

  const toggleFeatureLock = useCallback((featureId) => {
    mutate((prev) => ({
      ...prev,
      features: prev.features.map((f) => (f.id === featureId ? { ...f, locked: !f.locked } : f)),
    }), 'style', 'Lock elemento');
  }, [mutate]);

  const clearFeatures = useCallback((filterFn = null) => {
    mutate((prev) => ({
      ...prev,
      features: filterFn ? prev.features.filter((f) => !filterFn(f)) : [],
    }), 'clear', 'Svuota disegno');
  }, [mutate]);

  // ── LAYERS / AUTO / NOTE ─────────────────────────────────────────
  const setLayer = useCallback((key, patch) => {
    mutate((prev) => ({ ...prev, layers: { ...prev.layers, [key]: { ...prev.layers[key], ...patch } } }), 'style', 'Layer');
  }, [mutate]);

  const setAuto = useCallback((patch) => {
    mutate((prev) => ({ ...prev, auto: { ...prev.auto, ...patch } }), 'auto', 'Config automatico');
  }, [mutate]);

  const setNotes = useCallback((notes) => {
    mutate((prev) => ({ ...prev, notes }), 'style', 'Note');
  }, [mutate]);

  // ── COMUNE ────────────────────────────────────────────────────────
  // Imposta comune + confine + centro sul progetto CORRENTE. Con
  // clearFeatures=true svuota le geometrie e la generazione automatica del
  // comune precedente (mai spostarle silenziosamente). Annullabile (undo).
  const setMunicipality = useCallback(({ name, province = null, region = null, boundary = null, center = null, clearFeatures = false }) => {
    mutate((prev) => ({
      ...prev,
      municipality: name || null,
      province: province || null,
      region: region || null,
      boundary: boundary ?? null,
      center: (Array.isArray(center) && center.length === 2) ? [Number(center[0]), Number(center[1])] : (prev.center ?? null),
      features: clearFeatures ? [] : prev.features,
      auto: clearFeatures ? { ...prev.auto, lastResult: null, originPoint: null, originMode: 'center' } : prev.auto,
    }), 'municipality', clearFeatures ? 'Cambio comune (geometrie rimosse)' : 'Comune impostato');
  }, [mutate]);

  // ── UNDO / REDO ─────────────────────────────────────────────────
  const undo = useCallback(() => {
    const next = history.undo(projectRef.current);
    projectRef.current = next;
    setProjectState(next);
    setDirty(true);
  }, [history]);
  const redo = useCallback(() => {
    const next = history.redo(projectRef.current);
    projectRef.current = next;
    setProjectState(next);
    setDirty(true);
  }, [history]);

  // ── PERSISTENZA ────────────────────────────────────────────────
  const save = useCallback(() => {
    const res = storageSave(projectRef.current);
    if (res.ok) {
      projectRef.current = res.project;
      setProjectState(res.project);
      history.reset(res.project);
      setDirty(false);
      setNotice({ type: 'ok', text: 'Progetto salvato in locale.' });
    } else {
      setNotice({ type: 'error', text: res.reason === 'quota' ? 'Spazio locale esaurito.' : 'Salvataggio non riuscito.' });
    }
    return res;
  }, [history]);

  const saveAs = useCallback((newName) => {
    const res = storageSaveAs(projectRef.current, newName);
    if (res.ok) {
      replaceProject(res.project);
      setNotice({ type: 'ok', text: `Salvato come "${res.project.name}".` });
    }
    return res;
  }, [replaceProject]);

  const rename = useCallback((newName) => {
    setProjectState((prev) => ({ ...prev, name: String(newName || '').trim() || prev.name }));
    setDirty(true);
    // se gia' persistito, aggiorna anche l'indice
    if (projectRef.current?.status !== 'draft') storageRename(projectRef.current.id, newName);
  }, []);

  const archive = useCallback((archived = true) => {
    const res = storageArchive(projectRef.current.id, archived);
    if (res.ok) {
      setProjectState(res.project);
      setNotice({ type: 'ok', text: archived ? 'Progetto archiviato.' : 'Progetto ripristinato.' });
    }
    return res;
  }, []);

  const load = useCallback((id) => {
    const p = storageLoad(id);
    if (p) {
      replaceProject(p);
      setLastProjectId(id);
      setNotice({ type: 'ok', text: `Progetto "${p.name}" caricato.` });
    }
    return p;
  }, [replaceProject]);

  const openProject = useCallback((next) => {
    replaceProject(next);
  }, [replaceProject]);

  const importGeoJson = useCallback((input) => {
    const res = importProjectFromGeoJson(input, { regenerateIds: true });
    if (res.ok) {
      replaceProject(res.project, { markDirty: true });
      setNotice({ type: 'ok', text: `Importato "${res.project.name}" (${res.project.features.length} elementi).` });
    } else {
      setNotice({ type: 'error', text: 'GeoJSON non valido.' });
    }
    return res;
  }, [replaceProject]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const operatorsById = useMemo(() => {
    const m = new Map();
    for (const op of project.operators) m.set(op.id, op);
    return m;
  }, [project.operators]);

  return {
    project,
    dirty,
    notice,
    setNotice,
    operatorsById,
    history: {
      undo, redo,
      canUndo: history.canUndo, canRedo: history.canRedo,
      undoDepth: history.undoDepth, redoDepth: history.redoDepth,
      timeline: history.timeline,
    },
    ops: {
      addOperator, updateOperator, removeOperator, reassignColors,
      addFeature, addFeatures, updateFeature, replaceFeature, removeFeature,
      duplicateFeature, toggleFeatureLock, clearFeatures,
      setLayer, setAuto, setNotes, setMunicipality,
    },
    persistence: { save, saveAs, rename, archive, load, openProject, importGeoJson },
  };
}
