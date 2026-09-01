// Studio Mappa — canvas mappa (react-leaflet, renderer CANVAS per reggere
// 2500+ linee). Nessun riuso di ZoneCoverageMap / componenti Monitor.
//
// Z-ORDER esplicito via PANE dedicati (ognuno con il proprio renderer canvas):
//   ms-boundary (405)  confine comune — sotto tutto
//   ms-network  (410)  rete stradale base OSM — faint
//   ms-auto     (420)  copertura AUTOMATICA — con casing bianco per contrasto
//   ms-manual   (430)  copertura MANUALE
//   ms-points   (620)  vertici / marker — sopra le linee

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { Circle, CircleMarker, MapContainer, Pane, Polygon, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { closeRing } from './mapStudioGeometry.js';

const NEUTRAL_CENTER = [42.5, 12.5];
const NEUTRAL_ZOOM = 5;

const PANE_Z = { boundary: 405, network: 410, auto: 420, manual: 430, points: 620 };

function ClickCapture({ onClick, onMove }) {
  useMapEvents({
    click: (e) => onClick && onClick([e.latlng.lat, e.latlng.lng]),
    mousemove: (e) => onMove && onMove([e.latlng.lat, e.latlng.lng]),
  });
  return null;
}

// Adatta la vista: al confine comune (cambio comune) oppure alla copertura
// automatica appena generata (fitAutoTick).
function ViewController({ boundaryPositions, center, autoPoints, fitAutoTick }) {
  const map = useMap();
  const sigRef = useRef('');
  const tickRef = useRef(0);

  useEffect(() => {
    const sig = JSON.stringify({ b: boundaryPositions?.map((r) => r.length), c: center });
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    if (boundaryPositions && boundaryPositions.length) {
      const pts = boundaryPositions.flat();
      if (pts.length >= 2) { map.fitBounds(pts, { padding: [24, 24] }); return; }
    }
    if (Array.isArray(center) && center.length === 2) { map.setView(center, 13); return; }
    map.setView(NEUTRAL_CENTER, NEUTRAL_ZOOM);
  }, [map, boundaryPositions, center]);

  useEffect(() => {
    if (fitAutoTick === tickRef.current) return;
    tickRef.current = fitAutoTick;
    if (Array.isArray(autoPoints) && autoPoints.length >= 2) {
      map.fitBounds(autoPoints, { padding: [40, 40], maxZoom: 16 });
    }
  }, [map, fitAutoTick, autoPoints]);

  return null;
}

function boundaryToPositions(boundary) {
  if (!boundary || !Array.isArray(boundary.coordinates)) return [];
  if (boundary.type === 'Polygon') return [boundary.coordinates[0].map(([lng, lat]) => [lat, lng])];
  if (boundary.type === 'MultiPolygon') return boundary.coordinates.map((poly) => poly[0].map(([lng, lat]) => [lat, lng]));
  return [];
}

const dashFor = (style) => (style?.lineStyle === 'dash' ? '6 6' : undefined);

export function MapStudioCanvas({
  project,
  operatorsById,
  roadWays = [],
  drawing,
  fitAutoTick = 0,
  kpiOverlay = null,
}) {
  const { layers, center, boundary } = project;
  const initialCenter = Array.isArray(center) && center.length === 2 ? center : NEUTRAL_CENTER;
  const initialZoom = Array.isArray(center) && center.length === 2 ? 13 : NEUTRAL_ZOOM;

  const boundaryPositions = useMemo(() => boundaryToPositions(boundary), [boundary]);

  const polygons = project.features.filter((f) => f.type === 'polygon');
  const lines = project.features.filter((f) => f.type === 'line');
  const points = project.features.filter((f) => f.type === 'point');
  const autoLines = lines.filter((f) => f.source === 'auto');
  const manualLines = lines.filter((f) => f.source !== 'auto');

  const autoPoints = useMemo(() => autoLines.flatMap((f) => f.geometry), [autoLines]);

  // renderer canvas per-pane: stacking corretto anche con preferCanvas
  const renderers = useRef(null);
  if (!renderers.current) {
    renderers.current = {
      boundary: L.canvas({ pane: 'ms-boundary', padding: 0.5 }),
      network: L.canvas({ pane: 'ms-network', padding: 0.5 }),
      auto: L.canvas({ pane: 'ms-auto', padding: 0.5 }),
      manual: L.canvas({ pane: 'ms-manual', padding: 0.5 }),
    };
  }
  const R = renderers.current;

  // colore/stile di un feature: colore = swatch VIVO dell'operatore (match
  // esatto), poi lo style stampato sul feature come fallback.
  const styleOf = (f) => {
    const op = operatorsById.get(f.operatorId);
    const st = { ...(op?.style || {}), ...(f.style || {}) };
    const color = op?.color || f.style?.color || '#2563eb';
    const visible = op ? op.visible !== false : true;
    return { color, st, visible };
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        preferCanvas
        scrollWheelZoom
        style={{ height: '100%', width: '100%', borderRadius: 12 }}
      >
        <Pane name="ms-boundary" style={{ zIndex: PANE_Z.boundary }} />
        <Pane name="ms-network" style={{ zIndex: PANE_Z.network }} />
        <Pane name="ms-auto" style={{ zIndex: PANE_Z.auto }} />
        <Pane name="ms-manual" style={{ zIndex: PANE_Z.manual }} />
        <Pane name="ms-points" style={{ zIndex: PANE_Z.points }} />

        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickCapture onClick={drawing.actions.onMapClick} onMove={drawing.actions.onMapMouseMove} />
        <ViewController boundaryPositions={boundaryPositions} center={center} autoPoints={autoPoints} fitAutoTick={fitAutoTick} />

        {/* confine comune */}
        {layers.boundary.visible && boundaryPositions.map((pos, i) => (
          <Polygon
            key={`b${i}`}
            positions={pos}
            pane="ms-boundary"
            pathOptions={{ renderer: R.boundary, color: '#f97316', weight: 2, fill: false, opacity: layers.boundary.opacity, dashArray: '4 6' }}
          />
        ))}

        {/* rete stradale base OSM — faint, sotto le coperture */}
        {layers.network.visible && roadWays.map((line, i) => (
          <Polyline
            key={`net${i}`}
            positions={line}
            pane="ms-network"
            pathOptions={{ renderer: R.network, color: '#94a3b8', weight: 1, opacity: 0.28 * layers.network.opacity }}
            interactive={false}
          />
        ))}

        {/* aree (manuali) */}
        {layers.manual.visible && polygons.map((f) => {
          const { color, st, visible } = styleOf(f);
          if (!visible) return null;
          return (
            <Polygon
              key={f.id}
              positions={closeRing(f.geometry)}
              pane="ms-manual"
              pathOptions={{ renderer: R.manual, color, weight: st.lineWidth || 2, opacity: st.opacity ?? 1, fillOpacity: 0.12, dashArray: dashFor(st) }}
              eventHandlers={{ click: (e) => drawing.actions.onFeatureClick(f.id, [e.latlng.lat, e.latlng.lng]) }}
            />
          );
        })}

        {/* COPERTURA AUTOMATICA — casing bianco + core colore operatore */}
        {layers.auto.visible && autoLines.map((f) => {
          const { color, st, visible } = styleOf(f);
          if (!visible) return null;
          const selected = drawing.selectedFeatureId === f.id;
          const core = (st.lineWidth || 3) + 1 + (selected ? 2 : 0);
          const op = (st.opacity ?? 1) * layers.auto.opacity;
          return (
            <Fragment key={f.id}>
              <Polyline
                positions={f.geometry}
                pane="ms-auto"
                pathOptions={{ renderer: R.auto, color: '#ffffff', weight: core + 3, opacity: 0.55 * op, lineCap: 'round' }}
                interactive={false}
              />
              <Polyline
                positions={f.geometry}
                pane="ms-auto"
                pathOptions={{ renderer: R.auto, color, weight: core, opacity: op, lineCap: 'round', dashArray: dashFor(st) }}
                eventHandlers={{ click: (e) => drawing.actions.onFeatureClick(f.id, [e.latlng.lat, e.latlng.lng]) }}
              />
            </Fragment>
          );
        })}

        {/* COPERTURA MANUALE — casing scuro + core colore operatore */}
        {layers.manual.visible && manualLines.map((f) => {
          const { color, st, visible } = styleOf(f);
          if (!visible) return null;
          const selected = drawing.selectedFeatureId === f.id;
          const joinPick = drawing.joinFirstId === f.id;
          const core = (st.lineWidth || 3) + (selected ? 2 : 0);
          const op = (st.opacity ?? 1) * layers.manual.opacity;
          return (
            <Fragment key={f.id}>
              <Polyline
                positions={f.geometry}
                pane="ms-manual"
                pathOptions={{ renderer: R.manual, color: '#0f172a', weight: core + 3, opacity: 0.4 * op, lineCap: 'round' }}
                interactive={false}
              />
              <Polyline
                positions={f.geometry}
                pane="ms-manual"
                pathOptions={{ renderer: R.manual, color: joinPick ? '#22d3ee' : color, weight: core, opacity: op, lineCap: 'round', dashArray: dashFor(st) }}
                eventHandlers={{ click: (e) => drawing.actions.onFeatureClick(f.id, [e.latlng.lat, e.latlng.lng]) }}
              />
            </Fragment>
          );
        })}

        {/* vertici della feature selezionata (move / split / delete vertex) */}
        {layers.points.visible && (drawing.tool === 'move' || drawing.tool === 'split') && drawing.selectedFeatureId && (() => {
          const f = project.features.find((x) => x.id === drawing.selectedFeatureId);
          if (!f || f.type !== 'line') return null;
          return f.geometry.map((pt, vi) => (
            <CircleMarker
              key={`v${f.id}-${vi}`}
              center={pt}
              pane="ms-points"
              radius={5}
              pathOptions={{ color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 2 }}
              eventHandlers={{
                click: () => { if (drawing.tool === 'split') drawing.actions.splitSelectedAtVertex(vi); },
                contextmenu: () => drawing.actions.deleteSelectedVertex(f.id, vi),
                mousedown: (e) => {
                  if (drawing.tool !== 'move') return;
                  const map = e.target._map;
                  map.dragging.disable();
                  const onMove = (ev) => drawing.actions.moveSelectedVertex(f.id, vi, [ev.latlng.lat, ev.latlng.lng]);
                  const onUp = () => { map.off('mousemove', onMove); map.off('mouseup', onUp); map.dragging.enable(); };
                  map.on('mousemove', onMove);
                  map.on('mouseup', onUp);
                },
              }}
            />
          ));
        })()}

        {layers.points.visible && points.map((f) => {
          const { color, visible } = styleOf(f);
          if (!visible) return null;
          return <CircleMarker key={f.id} center={f.geometry} pane="ms-points" radius={6} pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 1, weight: 2 }} />;
        })}

        {/* disegno in corso */}
        {drawing.activeVertices.length > 0 && (
          <>
            <Polyline positions={drawing.activeVertices} pane="ms-points" pathOptions={{ color: '#22d3ee', weight: 3, dashArray: '4 4' }} interactive={false} />
            {drawing.activeVertices.map((pt, i) => (
              <CircleMarker key={`av${i}`} center={pt} pane="ms-points" radius={4} pathOptions={{ color: '#22d3ee', fillColor: '#0f172a', fillOpacity: 1, weight: 2 }} interactive={false} />
            ))}
          </>
        )}

        {drawing.tool === 'erase' && drawing.hoverPoint && (
          <Circle center={drawing.hoverPoint} pane="ms-points" radius={drawing.eraseRadiusM} pathOptions={{ color: '#dc2626', weight: 1, fillOpacity: 0.08 }} interactive={false} />
        )}

        {kpiOverlay}
      </MapContainer>
    </div>
  );
}
