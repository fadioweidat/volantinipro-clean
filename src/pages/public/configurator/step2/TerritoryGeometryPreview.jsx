import React, { useEffect, useRef, useState } from 'react';
import { loadMilanoMunicipi, MUNICIPI_SOURCE, MUNICIPI_ATTRIBUTION } from '../../../../lib/geo/territories/municipioMilano.js';
import { InvalidTerritoryGeometry, TERRITORY_STATUS } from '../../../../lib/geo/territories/territoryTypes.js';

const buttonStyle = { padding: '7px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };
const areaLabel = value => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value);
const demographicMessage = 'Dati demografici non ancora disponibili';

function PreviewMap({ focusedMunicipio = null }) {
  const container = useRef(null);
  const layers = useRef(new Map());
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(TERRITORY_STATUS.LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let map, observer;
    const localLayers = new Map();
    layers.current = localLayers;
    setStatus(TERRITORY_STATUS.LOADING);
    setSelectedId(null);
    setRecords([]);
    Promise.all([loadMilanoMunicipi({ signal: controller.signal }), import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([territories, module]) => {
      if (controller.signal.aborted || !container.current) return;
      const L = module.default || module;
      map = L.map(container.current, { scrollWheelZoom: false, zoomSnap: 0.25 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).on('tileerror', () => { if (!controller.signal.aborted) setStatus(TERRITORY_STATUS.DEGRADED); }).addTo(map);
      const group = L.featureGroup().addTo(map);
      for (const territory of territories) {
        const layer = L.geoJSON(territory.geometry, { style: { color: '#e88938', weight: 2, fillColor: '#f5a452', fillOpacity: 0.16 } }).addTo(group);
        const tooltip = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = territory.name;
        const area = document.createElement('div'); area.textContent = `Area: ${areaLabel(territory.areaKm2)} km²`;
        const message = document.createElement('div'); message.textContent = demographicMessage;
        tooltip.append(title, area, message);
        layer.bindTooltip(tooltip, { sticky: true });
        layer.on('mouseover', () => { layer.setStyle({ weight: 4, fillOpacity: 0.35 }); layer.bringToFront(); });
        layer.on('mouseout', () => layer.setStyle({ weight: 2, fillOpacity: 0.16 }));
        layer.on('click', () => setSelectedId(territory.id));
        localLayers.set(territory.id, layer);
      }
      map.fitBounds(group.getBounds(), { padding: [16, 16] });
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(container.current);
      setRecords(territories);
      setStatus(TERRITORY_STATUS.AVAILABLE);
    }).catch(error => {
      if (!controller.signal.aborted) setStatus(error instanceof InvalidTerritoryGeometry ? TERRITORY_STATUS.INVALID_GEOMETRY : TERRITORY_STATUS.UNAVAILABLE);
    });
    return () => { controller.abort(); observer?.disconnect(); map?.remove(); localLayers.clear(); };
  }, [attempt]);

  useEffect(() => {
    for (const [id, layer] of layers.current) {
      layer.setStyle({ color: id === selectedId ? '#a54409' : '#e88938', fillColor: id === selectedId ? '#db691e' : '#f5a452' });
    }
  }, [selectedId]);

  useEffect(() => {
    if (!focusedMunicipio || !records.length) return;
    const id = `milano-municipio-${focusedMunicipio}`;
    if (!layers.current.has(id)) return;
    setSelectedId(id);
    layers.current.get(id)?.openTooltip();
  }, [focusedMunicipio, records]);

  const selected = records.find(record => record.id === selectedId);
  const failed = status === TERRITORY_STATUS.UNAVAILABLE || status === TERRITORY_STATUS.INVALID_GEOMETRY;
  return <div data-testid="municipi-preview" data-status={status}>
    <p style={{ margin: '10px 0', fontSize: 12 }}>Anteprima geografica · la scelta sulla mappa serve solo alla consultazione.</p>
    <div role="status" aria-live="polite" style={{ fontSize: 12, marginBottom: 8 }}>
      {status === TERRITORY_STATUS.LOADING ? 'Caricamento Municipi…' : failed ? 'Geometrie dei Municipi non disponibili.' : status === TERRITORY_STATUS.DEGRADED ? 'Sfondo cartografico non disponibile; confini dei Municipi visibili.' : `${records.length} Municipi disponibili`}
    </div>
    {failed && <button type="button" style={buttonStyle} onClick={() => setAttempt(value => value + 1)}>Riprova</button>}
    <div ref={container} aria-label="Mappa di consultazione dei Municipi di Milano" style={{ height: 390, maxHeight: '55vh', minHeight: 240, borderRadius: 10, background: '#ece9e3', position: 'relative', zIndex: 0, display: failed ? 'none' : 'block' }} />
    <div role="group" aria-label="Consulta un Municipio" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {records.map(record => <button key={record.id} type="button" aria-pressed={selectedId === record.id} style={{ ...buttonStyle, background: selectedId === record.id ? '#994007' : 'transparent' }} onClick={() => { setSelectedId(record.id); layers.current.get(record.id)?.openTooltip(); }}>{record.name}</button>)}
    </div>
    <p aria-live="polite" data-testid="municipio-preview-detail" style={{ fontSize: 12, lineHeight: 1.6 }}>
      {selected ? <><strong>{selected.name}</strong> · Area: {areaLabel(selected.areaKm2)} km²<br /></> : null}
      {demographicMessage}
    </p>
    <p style={{ fontSize: 10, lineHeight: 1.5, opacity: 0.8 }}>
      <a href={MUNICIPI_SOURCE.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{MUNICIPI_SOURCE.name}</a>
      {' · '}<a href={MUNICIPI_SOURCE.licenseUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>CC BY 4.0</a>
      <br />{MUNICIPI_ATTRIBUTION}<br />Riferimento dati: 13 gennaio 2017.
    </p>
  </div>;
}

// The optional focus request only controls this local read-only preview.
export default function TerritoryGeometryPreview({ focusRequest = null }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  useEffect(() => {
    if (focusRequest?.number) setOpen(true);
  }, [focusRequest?.nonce]);
  return <div style={{ fontSize: 12, color: '#f1f5f9', fontFamily: 'inherit' }}>
    <button ref={trigger} type="button" aria-expanded={open} style={buttonStyle} onClick={() => setOpen(value => !value)}>Visualizza Municipi 1–9</button>
    {open && <section aria-label="Anteprima Municipi di Milano" style={{ marginTop: 10 }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
      <button type="button" style={buttonStyle} onClick={() => { setOpen(false); trigger.current?.focus(); }}>Chiudi anteprima</button>
      <PreviewMap focusedMunicipio={focusRequest?.number || null} />
    </section>}
  </div>;
}
