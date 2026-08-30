// Ticket "ULTIMO GIRO — DASHBOARD ADMIN GPS": rendering delle LineString
// salvate + pulizia marker. Test puri sull'helper + contratto sorgente sul
// pannello. Nessuna DB, nessun file Marketplace toccato.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { geometryToLeafletLines, isPolygonGeometry, geometryFirstLatLng } from '../src/lib/geo/adjustmentGeometry.js';

const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');

// ── A/D: LineString -> polilinea, MAI poligono degenere ────────────────
test('A/D — LineString convertita in una polilinea [lat,lng], nessun poligono', () => {
  const g = { type: 'LineString', coordinates: [[9.0, 45.0], [9.1, 45.1], [9.2, 45.05]] };
  const lines = geometryToLeafletLines(g);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], [[45.0, 9.0], [45.1, 9.1], [45.05, 9.2]], 'swap lng,lat -> lat,lng, nessun collasso a 1 punto');
  assert.equal(isPolygonGeometry(g), false);
});

// ── B: Polygon -> anello poligonale ──────────────────────────────────
test('B — Polygon reso come anello poligonale (primo ring)', () => {
  const g = { type: 'Polygon', coordinates: [[[9, 45], [9.1, 45], [9.1, 45.1], [9, 45.1], [9, 45]]] };
  const lines = geometryToLeafletLines(g);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 5);
  assert.deepEqual(lines[0][0], [45, 9]);
  assert.equal(isPolygonGeometry(g), true);
});

// ── C: MultiLineString -> N polilinee ──────────────────────────────
test('C — MultiLineString reso come piu\' polilinee distinte', () => {
  const g = { type: 'MultiLineString', coordinates: [
    [[9.0, 45.0], [9.01, 45.0]],
    [[9.5, 45.5], [9.51, 45.5], [9.52, 45.5]],
  ] };
  const lines = geometryToLeafletLines(g);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 2);
  assert.equal(lines[1].length, 3);
  assert.equal(isPolygonGeometry(g), false);
});

test('MultiPolygon -> anello esterno per ogni poligono; geometrie vuote/ignote -> []', () => {
  const mp = { type: 'MultiPolygon', coordinates: [
    [[[9, 45], [9.1, 45], [9.1, 45.1], [9, 45]]],
    [[[8, 44], [8.1, 44], [8.1, 44.1], [8, 44]]],
  ] };
  assert.equal(geometryToLeafletLines(mp).length, 2);
  assert.equal(isPolygonGeometry(mp), true);
  assert.deepEqual(geometryToLeafletLines(null), []);
  assert.deepEqual(geometryToLeafletLines({ type: 'Point', coordinates: [9, 45] }), []);
  assert.equal(geometryFirstLatLng({ type: 'LineString', coordinates: [[9, 45], [9.1, 45.1]] })[0], 45);
  assert.equal(geometryFirstLatLng(null), null);
});

// ── contratto sorgente: il pannello usa la logica geometry-aware ──────
test('SAVED RENDER — activeAdjustments rende Polyline per LineString, Polygon per Polygon', () => {
  assert.match(PANEL, /import \{ geometryToLeafletLines, isPolygonGeometry, geometryFirstLatLng \} from '\.\.\/\.\.\/lib\/geo\/adjustmentGeometry\.js'/);
  const block = PANEL.slice(PANEL.indexOf('{activeAdjustments.flatMap((adj) =>'), PANEL.indexOf('Un solo marker START'));
  assert.match(block, /if \(isPolygonGeometry\(adj\.geometry\)\) \{[\s\S]{0,400}<Polygon/);
  assert.match(block, /return rings\.map\(\(line, li\) => \(\s*\n\s*<Polyline/);
  assert.doesNotMatch(block, /positions=\{polygonGeoJsonToLatLngs\(adj\.geometry\)\}/, 'niente piu\' conversione poligono per le LineString');
  // §2: exclusion rosso distinto
  assert.match(block, /const isExclusion = adj\.adjustment_type === 'exclusion'/);
  assert.match(block, /isExclusion \? '#dc2626' : manualOperatorColor\(adj\.metadata\?\.operator_key\)/);
  // marker START usa geometryFirstLatLng (no poligono degenere)
  assert.match(PANEL, /const pos = firstAdj \? geometryFirstLatLng\(firstAdj\.geometry\) : null/);
});

// ── E/F/G: vertex marker solo in editing, mai nel cliente ───────────
test('E/F/G — vertex CircleMarker solo con `correcting && tool === draw`, piccoli', () => {
  assert.match(PANEL, /\{correcting && tool === 'draw' && activeVertices\.map\(\(v, i\) => \(/);
  assert.match(PANEL, /\{correcting && tool === 'draw' && activeLine\.map\(\(v, i\) => \(/);
  assert.doesNotMatch(PANEL, /center=\{v\} radius=\{5\}/);
  // nessun CircleMarker di vertice fuori da `correcting`
  assert.doesNotMatch(PANEL, /\n\s*\{activeVertices\.map\(\(v/);
});

// ── L: preview cliente = solo final_coverage_geometry + stile unico ──
test('L — Anteprima Copertura finale: solo coverage.final_coverage_geometry + VERIFIED_COVERAGE_STYLE', () => {
  assert.match(PANEL, /showFinalPreview && coverage\?\.final_coverage_geometry/);
  assert.match(PANEL, /pathOptions=\{VERIFIED_COVERAGE_STYLE\}/);
  assert.match(PANEL, /Anteprima "Copertura finale" \(identica alla vista Cliente\)/);
});

// ── H/I/J/K non-regressione operatori / auto / exclusion ────────────
test('H/I/K — operatori reali, colori stabili, auto/exclusion invariati', () => {
  assert.match(PANEL, /const operatorOptions = useMemo\(/);
  assert.match(PANEL, /function manualOperatorColor\(operatorKey\) \{[\s\S]{0,200}return getOperatorColor\(operatorKey\)/);
  assert.match(PANEL, /const \[drawMode, setDrawMode\] = useState\('line'\)/);
  assert.doesNotMatch(PANEL, /manualOperatorKeyFor|MAX_MANUAL_OPERATORS/);
});

// ── M/N/O non-regressione multi-zona / eraser / undo ────────────────
test('M/N/O — multi-zona, partial eraser, undo invariati', () => {
  assert.match(PANEL, /mergeRoadNetworks\(settled\)/);
  assert.match(PANEL, /const pieces = splitPolylineByCircle\(original, pt, eraseRadiusM\)/);
  assert.match(PANEL, /last\.kind === 'split-line'/);
  assert.match(PANEL, /function EraseCursorCapture\(\{ active, radiusM \}\)/);
});

// ── P/Q: GPS raw + nessun file Marketplace ─────────────────────────
test('P — GPS raw immutabile (nessuna insert/update/delete)', () => {
  assert.doesNotMatch(PANEL, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.match(PANEL, /NON modifica mai gps_tracking_points/);
});
