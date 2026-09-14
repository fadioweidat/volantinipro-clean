// TICKET — CRITICAL HERO MAP FIX: la mappa Hero deve riusare il MOTORE REALE
// dello Step 2 (Step2Map = Leaflet + tile CartoDB reali + L.geoJSON confini
// comunali reali + L.circle geodetico + fitBounds), NON un SVG decorativo con
// poligoni/strade/label hardcoded. Audit statico sul sorgente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hero = readFileSync(new URL('../src/components/home/VolantiniProHeroMap.jsx', import.meta.url), 'utf8');
const step2map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
const appcss = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8');

test('Step2Map: il motore disegna raggio geodetico (L.circle in metri) e non inventa poligoni mancanti', () => {
  assert.match(step2map, /L\.circle\(\[zCity\.lat, zCity\.lng\], \{\s*\n\s*radius: zRadius \* 1000/);
  assert.match(step2map, /no_geometry|geometry_parse_error/);
  // tile reali CartoDB Voyager
  assert.match(step2map, /basemaps\.cartocdn\.com\/rastertiles\/voyager/);
});

test('Step2Map: prop opzionale centerLabel -> tooltip PERMANENTE ancorato al centro (no regressione default)', () => {
  assert.match(step2map, /centerLabel = null,/);
  assert.match(step2map, /if \(isActive && centerLabel\) \{[\s\S]{0,220}permanent: true[\s\S]{0,120}gis-center-label/);
  // il ramo di default (nessun centerLabel) resta il tooltip su hover
  assert.match(step2map, /marker\.bindTooltip\(tooltipContent, \{ direction: 'top', offset: \[0, -10\], opacity: 1 \}\)/);
  assert.match(step2map, /centerLabel, viewportShiftX\]\); \/\/ eslint-disable-line/);
});

test('Step2Map: viewportShiftX -> shift SOLO visivo del viewport (Hero), idempotente, mai in municipality mode', () => {
  assert.match(step2map, /viewportShiftX = 0,/);
  // gate: solo se != 0 e NON municipality mode
  assert.match(step2map, /if \(viewportShiftX && !isMunicipalityMode\) \{/);
  // porta [city.lat, city.lng] alla frazione target della larghezza, panBy convergente
  assert.match(step2map, /L\.point\(size\.x \* \(0\.5 \+ clampShift\), size\.y \/ 2\)/);
  assert.match(step2map, /const dx = current\.x - target\.x;/);
  assert.match(step2map, /if \(Math\.abs\(dx\) < 1\) return;/);
  assert.match(step2map, /map\.panBy\(\[dx, 0\], \{ animate: false \}\)/);
  // clamp difensivo
  assert.match(step2map, /Math\.max\(-0\.4, Math\.min\(0\.4, Number\(viewportShiftX\) \|\| 0\)\)/);
  // NON tocca city.lat/lng: nessun setView con coord modificate nel blocco shift
  assert.doesNotMatch(step2map, /if \(viewportShiftX && !isMunicipalityMode\) \{[\s\S]{0,500}setView/);
});

test('app.css: .vp-hero-map-preview senza trattamento a card (no background/border/radius/shadow/blur)', () => {
  assert.match(appcss, /\.saas-home-refinement \.vp-hero-map-preview,\s*\n\s*\.home-shell-dark \.vp-hero-map-preview \{[\s\S]{0,260}background: transparent !important;[\s\S]{0,260}border: 0 !important;[\s\S]{0,260}box-shadow: none !important/);
});

const isolated = readFileSync(new URL('../src/components/home/HomepageTerritoryMap.jsx', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../src/components/home/homepageHeroData.js', import.meta.url), 'utf8');
test('Homepage: mappa isolata reale, senza import Step2Map o stato preventivo', () => {
  assert.match(hero, /HomepageTerritoryMap/);
  assert.doesNotMatch(hero + isolated + adapter, /import.*Step2Map|localStorage|sessionStorage|saveCampaign|setQuote/);
  assert.match(isolated, /L\.map/); assert.match(isolated, /L\.geoJSON/); assert.match(isolated, /L\.circle/);
  assert.match(isolated, /radius:.*radiusKm\*1000/); assert.match(isolated, /tile\.openstreetmap\.org/);
});
test('Homepage: stessa analisi read-only, nessuna statistica sostitutiva', () => {
  assert.match(hero, /useServiceAnalysis/); assert.match(hero, /'hero_preview','comune','radius'/);
  assert.doesNotMatch(hero + adapter, /DEFAULT_MILANO_NORD_ZONES|50990|94\.8/);
  assert.match(adapter, /households_in_radius/); assert.match(adapter, /geometry_geojson/);
});
