// Studio Mappa — pannello progetto: COMUNE (ricerca reale, primo passo),
// salva / salva come / duplica / rinomina / archivia, lista progetti locali,
// export / import GeoJSON.
import { useRef, useState } from 'react';
import { btn, input, panel, panelTitle, smallBtn } from './mapStudioStyles.js';
import { listProjects, loadProject } from './mapStudioStorage.js';
import { exportProjectToGeoJsonString } from './mapStudioGeoJson.js';
import { resolveMunicipalityBoundary } from '../../../lib/geo/resolveMunicipalityBoundary.js';
import { boundaryCentroid } from './mapStudioGeometry.js';
import { createProject, createOperator } from './mapStudioProject.js';
import { MunicipalitySearch } from './MunicipalitySearch.jsx';

export function MapStudioProjectPanel({ project, dirty, persistence, ops }) {
  const [projects, setProjects] = useState(() => listProjects());
  const [boundaryState, setBoundaryState] = useState({ status: 'idle', error: null }); // idle|loading|ok|error
  const fileRef = useRef(null);

  const refreshList = () => setProjects(listProjects());

  async function applyMunicipality(sel, { force = false } = {}) {
    // sel: { name, province, provinceCode, region, lat, lng }
    if (project.features.length > 0 && !force
      && (project.municipality || '').toLowerCase() !== (sel.name || '').toLowerCase()) {
      const ok = window.confirm('Cambiando comune verranno rimosse le geometrie del progetto corrente. Continuare?');
      if (!ok) return;
      return applyMunicipality(sel, { force: true });
    }
    const clearFeatures = project.features.length > 0
      && (project.municipality || '').toLowerCase() !== (sel.name || '').toLowerCase();

    // centro provvisorio = coordinate reali del comune scelto (MAI Milano).
    setBoundaryState({ status: 'loading', error: null });
    ops.setMunicipality({
      name: sel.name,
      province: sel.provinceCode || sel.province || null,
      region: sel.region || null,
      boundary: null,
      center: [sel.lat, sel.lng],
      clearFeatures,
    });

    let boundary = null;
    try {
      boundary = await resolveMunicipalityBoundary(sel.name, { lat: sel.lat, lng: sel.lng });
    } catch {
      boundary = null;
    }
    if (!boundary) {
      setBoundaryState({ status: 'error', error: `Confine non disponibile per "${sel.name}". La mappa resta centrata sul comune.` });
      return;
    }
    const center = boundaryCentroid(boundary) || [sel.lat, sel.lng];
    ops.setMunicipality({
      name: sel.name,
      province: sel.provinceCode || sel.province || null,
      region: sel.region || null,
      boundary,
      center,
      clearFeatures: false, // gia' svuotato sopra se serviva
    });
    setBoundaryState({ status: 'ok', error: null });
  }

  function handleNewEmptyProject() {
    persistence.openProject(createProject({
      name: 'Nuovo progetto',
      operators: [createOperator({ index: 0, name: 'Operatore 1' }), createOperator({ index: 1, name: 'Operatore 2' })],
    }));
    setBoundaryState({ status: 'idle', error: null });
  }

  function handleExport() {
    const text = exportProjectToGeoJsonString(project);
    const blob = new Blob([text], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.name || 'map-studio').replace(/[^\w.-]+/g, '_')}.geojson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { persistence.importGeoJson(String(reader.result || '')); refreshList(); };
    reader.readAsText(file);
    e.target.value = '';
  }

  const provLabel = project.province ? ` (${project.province})` : '';

  return (
    <div style={panel}>
      <p style={panelTitle}>Progetto</p>

      <input
        style={{ ...input, marginBottom: 6, fontWeight: 800 }}
        value={project.name}
        onChange={(e) => persistence.rename(e.target.value)}
        placeholder="Nome progetto"
      />

      {/* ── COMUNE — primo passo ──────────────────────────────────── */}
      <div style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
        <p style={{ ...panelTitle, marginBottom: 6 }}>Comune</p>
        <MunicipalitySearch onSelect={(sel) => applyMunicipality(sel)} />

        <div style={{ marginTop: 8, fontSize: 12 }}>
          {!project.municipality && (
            <span style={{ color: 'rgba(255,255,255,.55)' }}>Cerca un comune per iniziare.</span>
          )}
          {project.municipality && boundaryState.status === 'loading' && (
            <span style={{ color: '#93c5fd' }}>Caricamento confine di {project.municipality}…</span>
          )}
          {project.municipality && boundaryState.status === 'error' && (
            <span style={{ color: '#fca5a5' }}>{boundaryState.error}</span>
          )}
          {project.municipality && boundaryState.status !== 'loading' && boundaryState.status !== 'error' && (
            <span style={{ color: project.boundary ? '#86efac' : '#fbbf24', fontWeight: 800 }}>
              {project.municipality}{provLabel}
              {project.region ? ` · ${project.region}` : ''}
              {project.boundary ? ' · confine caricato' : ' · confine non disponibile'}
            </span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginBottom: 8 }}>
        {project.features.length} elementi · {dirty ? 'modifiche non salvate' : project.status}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" onClick={() => { persistence.save(); refreshList(); }} style={btn(true)}>Salva</button>
        <button type="button" onClick={() => { persistence.saveAs(`${project.name} (copia)`); refreshList(); }} style={btn(false)}>Salva come</button>
        <button type="button" onClick={() => { persistence.archive(project.status !== 'archived'); refreshList(); }} style={btn(false)}>
          {project.status === 'archived' ? 'Ripristina' : 'Archivia'}
        </button>
        <button type="button" onClick={handleNewEmptyProject} style={btn(false)}>Nuovo vuoto</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" onClick={handleExport} style={smallBtn}>Export GeoJSON</button>
        <button type="button" onClick={() => fileRef.current?.click()} style={smallBtn}>Import GeoJSON</button>
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={handleImportFile} style={{ display: 'none' }} />
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 10 }}>
        <p style={{ ...panelTitle, marginBottom: 6 }}>Progetti locali ({projects.length})</p>
        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {projects.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Nessun progetto salvato.</span>}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { persistence.load(p.id); setBoundaryState({ status: 'idle', error: null }); }}
              style={{
                ...smallBtn,
                textAlign: 'left',
                borderColor: p.id === project.id ? '#2563eb' : 'rgba(255,255,255,.14)',
                opacity: p.status === 'archived' ? 0.5 : 1,
              }}
            >
              {p.name} · {p.municipality || 'n/d'} · {p.features} elem.
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function reloadProjectFromStorage(id) {
  return loadProject(id);
}
