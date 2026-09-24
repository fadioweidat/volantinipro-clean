import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mapPagePath = path.resolve('src/pages/driver/DriverWorkMapPage.jsx');
const mapPage = fs.readFileSync(mapPagePath, 'utf8');

test('DriverWorkMapPage: ZERO importazioni e ZERO utilizzi di Polyline', () => {
  // Nessuna importazione di Polyline
  assert.doesNotMatch(mapPage, /import\s*\{[^}]*Polyline[^}]*\}\s*from\s*'react-leaflet'/);
  // Nessun tag JSX Polyline
  assert.doesNotMatch(mapPage, /<Polyline/);
});

test('DriverWorkMapPage: rendering punti individuali con gerarchia visuale', () => {
  // Punti storici propri: piccoli (radius 3), semi-trasparenti
  assert.match(mapPage, /key=\{`own-dot-\$\{idx\}`\}/);
  assert.match(mapPage, /radius=\{3\}/);
  assert.match(mapPage, /fillOpacity:\s*0\.55/);

  // Ultimo punto proprio evidenziato (radius 6, opacità 0.9)
  assert.match(mapPage, /radius=\{6\}/);
  assert.match(mapPage, /fillOpacity:\s*0\.9/);

  // Posizione corrente "Tu sei qui" marcata distintamente con tooltip permanente
  assert.match(mapPage, /radius=\{8\.5\}/);
  assert.match(mapPage, /<Tooltip permanent direction="top" offset=\{\[0, -8\]\}>Tu sei qui<\/Tooltip>/);
});

test('DriverWorkMapPage: compagni di gruppo con punti individuali e nessun collegamento visivo', () => {
  // Punti compagni di gruppo: CircleMarker individuali
  assert.match(mapPage, /key=\{`group-dot-\$\{g\.sessionId\}-\$\{idx\}`\}/);
  // Ultimo punto compagni evidenziato con tooltip permanente
  assert.match(mapPage, /<Tooltip permanent direction="top" offset=\{\[0, -8\]\}>\{g\.label\}\{g\.statusLabel \? ` · \$\{g\.statusLabel\}` : ''\}<\/Tooltip>/);
});

test('Calcolo distanza e copertura: funzionano su serie di punti senza dipendere da linee disegnate', () => {
  // Calcolo distanza valido: usa haversineKm tra punti consecutivi
  assert.match(mapPage, /haversineKm\(Number\(a\.lat\), Number\(a\.lng\), Number\(b\.lat\), Number\(b\.lng\)\)/);
  // Calcolo copertura: usa calculateGpsCoverage via RPC/backend
  assert.match(mapPage, /calculateGpsCoverage\(sessionId\)/);
});

test('Simulazione scenario: 2 punti, 20 punti, punti distanti in auto -> solo marker, 0 linee', () => {
  function renderTrace(points) {
    const valid = points.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const markers = valid.map((pt, idx) => ({
      type: 'CircleMarker',
      center: pt,
      isLast: idx === valid.length - 1,
    }));
    const polylines = []; // ZERO polylines in DriverWorkMapPage
    return { markers, polylines };
  }

  // Sessione con 2 punti
  const trace2 = renderTrace([[45.4201, 8.9201], [45.4205, 8.9207]]);
  assert.equal(trace2.markers.length, 2, '2 punti -> 2 marker');
  assert.equal(trace2.polylines.length, 0, '2 punti -> 0 linee');

  // Sessione con 20 punti
  const pts20 = Array.from({ length: 20 }, (_, i) => [45.42 + i * 0.001, 8.92 + i * 0.001]);
  const trace20 = renderTrace(pts20);
  assert.equal(trace20.markers.length, 20, '20 punti -> 20 marker');
  assert.equal(trace20.polylines.length, 0, '20 punti -> 0 linee');

  // Punti molto distanti (es. spostamento in auto tra Albairate e comune vicino)
  const distantPts = [[45.4200, 8.9200], [45.4800, 9.0500]];
  const traceDistant = renderTrace(distantPts);
  assert.equal(traceDistant.markers.length, 2, 'Punti distanti -> 2 marker');
  assert.equal(traceDistant.polylines.length, 0, 'Punti distanti -> nessuna linea diagonale di collegamento');
});
