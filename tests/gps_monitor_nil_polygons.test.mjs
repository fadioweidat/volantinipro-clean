// TICKET — FINAL GPS GATE Admin (GpsMonitor): i NIL devono essere poligoni
// distinti con label permanente, click->evidenzia, fitBounds, ordine layer
// esplicito e punti GPS validi visibili sopra la coverage. Stesso contratto
// gia' verificato lato Cliente in customer_tracking_nil_polygons.test.mjs,
// portato su GpsMonitor.jsx. Audit statico (canvas/leaflet non in node:test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');

test('GpsMonitor: Pane espliciti con z-index (base < NIL < coverage < GPS validi < esclusi < live)', () => {
  assert.match(src, /<Pane name="nilPane" style=\{\{ zIndex: 400 \}\} \/>/);
  assert.match(src, /<Pane name="coveragePane" style=\{\{ zIndex: 440 \}\} \/>/);
  assert.match(src, /<Pane name="gpsValidPane" style=\{\{ zIndex: 480 \}\} \/>/);
  assert.match(src, /<Pane name="gpsExcludedPane" style=\{\{ zIndex: 490 \}\} \/>/);
  assert.match(src, /<Pane name="gpsLivePane" style=\{\{ zIndex: 520 \}\} \/>/);
  const iNil = src.indexOf('name="nilPane"');
  const iCov = src.indexOf('name="coveragePane"');
  const iVal = src.indexOf('name="gpsValidPane"');
  const iLive = src.indexOf('name="gpsLivePane"');
  assert.ok(iNil < iCov && iCov < iVal && iVal < iLive, 'ordine di dichiarazione dei pane coerente col contratto');
});

test('GpsMonitor: poligoni NIL nel nilPane con label permanente e click -> onSelectZone', () => {
  assert.match(src, /pane="nilPane"/);
  assert.match(src, /<Tooltip\s+permanent\s+direction="center"\s+className="vp-gm-nil-label">/);
  assert.match(src, /\.vp-gm-nil-label\s*\{/, 'classe CSS della label NIL definita nella pagina');
  assert.match(src, /eventHandlers=\{\{ click: \(\) => onSelectZone\?\.\(zone\.campaign_zone_id\) \}\}/);
  // stile: evidenza forte quando selezionato, tenue di default
  assert.match(src, /fillOpacity: 0\.32, weight: 3\.5/);
});

test('GpsMonitor: i poligoni NIL vengono dalla STESSA lista dei chip (zoneRows), non solo dalle zone con progress', () => {
  assert.match(src, /const nilMapZones = useMemo\(\(\) => \(zoneRows \|\| \[\]\)\.map\(/);
  assert.match(src, /geometry: resolvedBoundaries\[z\.id\] \|\| null/);
  assert.match(src, /<GpsMap[\s\S]{0,400}zones=\{nilMapZones\}/);
  assert.match(src, /<GpsMap[\s\S]{0,400}selectedZoneId=\{selectedZoneId\}/);
  assert.match(src, /<GpsMap[\s\S]{0,400}onSelectZone=\{\(id\) => setSelectedZoneId\(id\)\}/);
});

test('GpsMonitor: fitBounds sulla zona selezionata (FitToZoneBounds su selectedZoneGeometry)', () => {
  assert.match(src, /\{selectedZoneGeometry && <FitToZoneBounds geometry=\{selectedZoneGeometry\} \/>\}/);
});

test('GpsMonitor: punti GPS validi nel gpsValidPane (visibili sopra la coverage), esclusi e live nei rispettivi pane', () => {
  assert.match(src, /radius=\{4\}\s*\n\s*pane="gpsValidPane"/);
  assert.match(src, /pane="gpsExcludedPane"/);
  assert.match(src, /pane="gpsLivePane"/);
  // il filtro operatore "Tutti" passa tutte le tracce / tutti i punti
  assert.match(src, /if \(selectedOperatorFilter === 'all'\) return state\.sessionTracks;/);
  assert.match(src, /if \(selectedOperatorFilter === 'all'\) return state\.points;/);
});

test('GpsMonitor: nessun cerchio fittizio — poligono reso solo se esiste geometry risolta', () => {
  assert.match(src, /if \(!zone\.geometry \|\| !zone\.geometry\.coordinates\) return null;/);
  assert.doesNotMatch(src, /L\.circle\(|new L\.Circle\(|<Circle\s/);
});
