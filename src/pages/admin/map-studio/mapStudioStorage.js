// Studio Mappa — persistenza locale (FASE 1: localStorage, nessun DB, nessuna RPC).
//
// Un solo namespace: `vp_map_studio_projects` = { [id]: project }. Piu' un
// puntatore `vp_map_studio_last` all'ultimo progetto aperto. Tutte le
// operazioni sono sincrone e difensive (storage assente / quota / JSON rotto).

import { createProject, normalizeProject, touchProject, makeId } from './mapStudioProject.js';

const INDEX_KEY = 'vp_map_studio_projects';
const LAST_KEY = 'vp_map_studio_last';

// contatore monotono di sessione: tie-breaker deterministico quando due save
// cadono nello stesso millisecondo (updatedAt ISO ha risoluzione al ms).
let __saveSeq = 0;

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const k = '__vp_ms_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readIndex() {
  const s = safeStorage();
  if (!s) return {};
  try {
    const raw = s.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeIndex(index) {
  const s = safeStorage();
  if (!s) return { ok: false, reason: 'no-storage' };
  try {
    s.setItem(INDEX_KEY, JSON.stringify(index));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.name === 'QuotaExceededError' ? 'quota' : 'error' };
  }
}

// Elenco leggero (senza geometrie) per la lista progetti.
export function listProjects() {
  const index = readIndex();
  return Object.values(index)
    .map((p) => ({
      id: p.id,
      name: p.name,
      municipality: p.municipality || null,
      status: p.status || 'draft',
      features: Array.isArray(p.features) ? p.features.length : 0,
      operators: Array.isArray(p.operators) ? p.operators.length : 0,
      updatedAt: p.updatedAt || null,
      createdAt: p.createdAt || null,
      _seq: p._seq || 0,
    }))
    .sort((a, b) => (
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || (b._seq - a._seq)
    ))
    .map(({ _seq, ...rest }) => rest);
}

export function loadProject(id) {
  if (!id) return null;
  const raw = readIndex()[id];
  return raw ? normalizeProject(raw) : null;
}

export function getLastProjectId() {
  const s = safeStorage();
  if (!s) return null;
  try {
    return s.getItem(LAST_KEY) || null;
  } catch {
    return null;
  }
}

export function setLastProjectId(id) {
  const s = safeStorage();
  if (!s || !id) return;
  try {
    s.setItem(LAST_KEY, id);
  } catch {
    /* non critico */
  }
}

// Salva (upsert). Ritorna { ok, project, reason }.
export function saveProject(project) {
  if (!project || !project.id) return { ok: false, reason: 'invalid' };
  const index = readIndex();
  __saveSeq += 1;
  const next = touchProject({ ...project, status: project.status === 'archived' ? 'archived' : 'saved' });
  index[next.id] = { ...next, _seq: __saveSeq }; // _seq: solo nell'indice, tie-breaker
  const res = writeIndex(index);
  if (res.ok) setLastProjectId(next.id);
  return res.ok ? { ok: true, project: next } : { ok: false, reason: res.reason };
}

// "Salva come" / duplica: nuovo id, nome nuovo, stessa geometria.
export function saveProjectAs(project, newName) {
  if (!project) return { ok: false, reason: 'invalid' };
  const clone = normalizeProject({
    ...project,
    id: makeId('proj'),
    name: newName || `${project.name} (copia)`,
    status: 'saved',
    createdAt: new Date().toISOString(),
  });
  return saveProject(clone);
}

export function duplicateProject(id, newName) {
  const p = loadProject(id);
  if (!p) return { ok: false, reason: 'not-found' };
  return saveProjectAs(p, newName || `${p.name} (copia)`);
}

export function renameProject(id, newName) {
  const index = readIndex();
  if (!index[id]) return { ok: false, reason: 'not-found' };
  index[id] = touchProject({ ...index[id], name: String(newName || '').trim() || index[id].name });
  const res = writeIndex(index);
  return res.ok ? { ok: true, project: normalizeProject(index[id]) } : { ok: false, reason: res.reason };
}

export function archiveProject(id, archived = true) {
  const index = readIndex();
  if (!index[id]) return { ok: false, reason: 'not-found' };
  index[id] = touchProject({ ...index[id], status: archived ? 'archived' : 'saved' });
  const res = writeIndex(index);
  return res.ok ? { ok: true, project: normalizeProject(index[id]) } : { ok: false, reason: res.reason };
}

export function deleteProject(id) {
  const index = readIndex();
  if (!index[id]) return { ok: false, reason: 'not-found' };
  delete index[id];
  const res = writeIndex(index);
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

// Crea un progetto vuoto in memoria (NON ancora persistito finche' non si
// chiama saveProject).
export function newProject(opts) {
  return createProject(opts);
}
