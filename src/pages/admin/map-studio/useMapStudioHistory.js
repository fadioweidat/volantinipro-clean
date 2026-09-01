// Studio Mappa — storico locale con undo/redo (FASE 1: sessione corrente).
//
// NON usa lo storico del Monitor Admin. Stack di SNAPSHOT immutabili della
// sola porzione editabile del progetto: { operators, features, layers, auto,
// notes }. Ogni mutazione crea nuovi array (mai muta in place), quindi
// condividere i riferimenti negli snapshot e' sicuro. Stack limitato per non
// crescere all'infinito con 2500+ linee.

import { useCallback, useMemo, useRef, useState } from 'react';

const MAX_HISTORY = 60;
// il cambio comune (municipality/province/region/boundary/center) e'
// annullabile come qualunque altra modifica di sessione.
const EDITABLE_KEYS = ['municipality', 'province', 'region', 'boundary', 'center', 'operators', 'features', 'layers', 'auto', 'notes'];

export function snapshotOf(project) {
  const s = {};
  for (const k of EDITABLE_KEYS) s[k] = project ? project[k] : undefined;
  return s;
}

export function applySnapshot(project, snapshot) {
  return { ...project, ...snapshot, updatedAt: new Date().toISOString() };
}

// kind: 'draw' | 'erase' | 'split' | 'join' | 'move' | 'operator' | 'style' |
//       'auto' | 'clear' | 'delete' | 'duplicate' | 'import'
export function useMapStudioHistory(initialProject) {
  const [past, setPast] = useState([]); // [{ kind, label, snapshot }]
  const [future, setFuture] = useState([]);
  const currentRef = useRef(snapshotOf(initialProject));

  // Registra lo stato PRECEDENTE prima di applicare una mutazione. `project`
  // e' il NUOVO progetto gia' calcolato dal chiamante.
  const commit = useCallback((project, kind, label) => {
    const prev = currentRef.current;
    currentRef.current = snapshotOf(project);
    setPast((p) => {
      const next = [...p, { kind, label: label || kind, snapshot: prev }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    setFuture([]);
  }, []);

  // Sincronizza senza registrare storia (load / new / saveAs / import).
  const reset = useCallback((project) => {
    currentRef.current = snapshotOf(project);
    setPast([]);
    setFuture([]);
  }, []);

  // Ritorna il progetto risultante; il chiamante fa setState.
  const undo = useCallback((project) => {
    if (past.length === 0) return project;
    const entry = past[past.length - 1];
    const redoSnapshot = snapshotOf(project);
    const result = applySnapshot(project, entry.snapshot);
    currentRef.current = snapshotOf(result);
    setPast(past.slice(0, -1));
    setFuture([{ kind: entry.kind, label: entry.label, snapshot: redoSnapshot }, ...future]);
    return result;
  }, [past, future]);

  const redo = useCallback((project) => {
    if (future.length === 0) return project;
    const entry = future[0];
    const undoSnapshot = snapshotOf(project);
    const result = applySnapshot(project, entry.snapshot);
    currentRef.current = snapshotOf(result);
    setFuture(future.slice(1));
    setPast((() => {
      const next = [...past, { kind: entry.kind, label: entry.label, snapshot: undoSnapshot }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    })());
    return result;
  }, [past, future]);

  const timeline = useMemo(
    () => past.map((e, i) => ({ index: i, kind: e.kind, label: e.label })),
    [past],
  );

  return {
    commit,
    reset,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoDepth: past.length,
    redoDepth: future.length,
    timeline,
  };
}
