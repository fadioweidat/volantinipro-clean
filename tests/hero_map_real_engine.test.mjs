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

test('Hero: nessun SVG mappa decorativo (viewBox 800x650, poligoni/strade/label hardcoded)', () => {
  assert.doesNotMatch(hero, /viewBox="0 0 800 650"/);
  assert.doesNotMatch(hero, /MILANO AFFORI DERGANO BOVISA|PADERNO DUGNANO<\/text>/);
  assert.doesNotMatch(hero, /SP44 MILANO-MEDA|A4 TANGENZIALE NORD|VIA BOVISASCA/);
  assert.doesNotMatch(hero, /heroGisGrid|heroCatchmentGlow|heroGisRadarSweep/);
  // niente <polygon>/<circle> SVG hardcoded per la mappa
  assert.doesNotMatch(hero, /<polygon points="\d/);
});

test('Hero: riusa Step2Map (stesso motore GIS) con props reali', () => {
  assert.match(hero, /import \{ Step2Map \} from "\.\.\/Step2Map\.jsx"/);
  assert.match(hero, /<Step2Map\b/);
  const call = hero.slice(hero.indexOf('<Step2Map'), hero.indexOf('<Step2Map') + 700);
  assert.match(call, /city=\{\{ lat: previewCity\.lat, lng: previewCity\.lng/);
  assert.match(call, /radius=\{radiusKm\}/);
  assert.match(call, /svcType="d2d"/);
  assert.match(call, /zonesWithCoords=\{zonesForMap\}/);
  assert.match(call, /activeLayers=\{\{ comuni: true, radius: true/);
  assert.match(call, /interactive=\{false\}/);
  // reso come layer primario (zIndex 0), non nascosto a opacity 0.15
  assert.doesNotMatch(hero, /opacity: 0\.15, pointerEvents: "none" \}\}>\s*\n\s*<Step2Map/);
});

test('Hero: comuni/geometrie dalla stessa source of truth (analisi live comuni_breakdown)', () => {
  assert.match(hero, /analysisLevel/i);
  assert.match(hero, /comuni_breakdown/);
  assert.match(hero, /geometry_geojson/);
  // zonesForMap = preview.zones (live) con fallback comuni reali, MAI NIL
  assert.match(hero, /const zonesForMap =/);
  // lat/lng reali del comune passati al motore mappa
  assert.match(hero, /const lat = firstFiniteNumber\(row\.centroid_lat/);
});

test('Step2Map: il motore disegna raggio geodetico (L.circle in metri) e non inventa poligoni mancanti', () => {
  assert.match(step2map, /L\.circle\(\[zCity\.lat, zCity\.lng\], \{\s*\n\s*radius: zRadius \* 1000/);
  assert.match(step2map, /no_geometry|geometry_parse_error/);
  // tile reali CartoDB Voyager
  assert.match(step2map, /basemaps\.cartocdn\.com\/rastertiles\/voyager/);
});

test('Hero: layout unico (headline / CTA / KPI cards / lista analisi / centro ancorato)', () => {
  assert.match(hero, /FloatingKPI[\s\S]{0,120}label="Famiglie raggiungibili"/);
  assert.match(hero, /FloatingKPI[\s\S]{0,120}label="Comuni coinvolti"/);
  assert.match(hero, /FloatingKPI[\s\S]{0,120}label="Copertura stimata"/);
  // hero UNICO: la mappa e' il livello di fondo full-bleed (left:0), non un
  // pannello sul lato destro; card treatment neutralizzato in app.css.
  assert.match(hero, /top: 0, right: 0, bottom: -60, left: 0/);
  assert.doesNotMatch(hero, /left: compact \? 0 : "45%"/);
  // scrim che unifica testo e mappa
  assert.match(hero, /className="vp-home-hero-shade"/);
  // etichetta centro ANCORATA al marker geografico (non piu' targhetta d'angolo)
  assert.match(hero, /centerLabel=\{`Cormano \(MI\) · raggio \$\{radiusKm\} km`\}/);
  assert.doesNotMatch(hero, /leaflet-radiusCenter-pane \{\s*\n\s*display: none/);
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

test('Hero: passa viewportShiftX solo su desktop (tablet/mobile invariati)', () => {
  assert.match(hero, /viewportShiftX=\{compact \? 0 : 0\.12\}/);
});

test('app.css: .vp-hero-map-preview senza trattamento a card (no background/border/radius/shadow/blur)', () => {
  assert.match(appcss, /\.saas-home-refinement \.vp-hero-map-preview,\s*\n\s*\.home-shell-dark \.vp-hero-map-preview \{[\s\S]{0,260}background: transparent !important;[\s\S]{0,260}border: 0 !important;[\s\S]{0,260}box-shadow: none !important/);
});
