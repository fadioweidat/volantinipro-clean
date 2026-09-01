// Ticket "COPERTURA AUTOMATICA MULTI-ZONA / MULTI-COMUNE".
// Test puri su mergeRoadNetworks / assignWayZoneId + contratto sorgente su
// CoverageAdjustmentPanel.jsx e GpsMonitor.jsx. Nessuna DB, nessun Edge Function.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { mergeRoadNetworks, assignWayZoneId, geometrySignature } from '../src/lib/geo/mergeRoadNetworks.js';
import { selectRoadsFromOrigin } from '../src/lib/geo/originRadialSelection.js';

const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');
const GM = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');
const COVEDIT = readFileSync(new URL('../src/pages/admin/CoverageEditor.jsx', import.meta.url), 'utf8');

const way = (id, lat, lng, len = 100) => ({ id, geometry: [[lat, lng], [lat, lng + 0.001]], lengthM: len });
const net = (ways) => ({ ways, totalLengthM: ways.reduce((s, w) => s + w.lengthM, 0) });

// ── mergeRoadNetworks ──────────────────────────────────────────────────
test('MERGE — due reti, way.id condiviso sul confine deduplicato una sola volta', () => {
  const a = net([way(1, 45, 9), way(2, 45, 9.01), way(3, 45, 9.02)]);
  const b = net([way(3, 45, 9.02), way(4, 45, 9.03)]); // way 3 = confine condiviso
  const m = mergeRoadNetworks([{ zoneId: 'A', network: a }, { zoneId: 'B', network: b }]);
  assert.deepEqual(m.ways.map((w) => w.id), [1, 2, 3, 4], 'nessun duplicato, ordinamento deterministico per id');
  assert.equal(m.totalLengthM, 400);
  assert.equal(m.loadedZoneCount, 2);
  assert.equal(m.failedZoneCount, 0);
});

test('DEDUP — fallback geometry signature quando manca way.id', () => {
  const g = [[45.0, 9.0], [45.0, 9.001], [45.001, 9.002]];
  const gRev = [...g].reverse();
  const a = { ways: [{ id: null, geometry: g, lengthM: 50 }], totalLengthM: 50 };
  const b = { ways: [{ id: null, geometry: gRev, lengthM: 50 }], totalLengthM: 50 }; // stessa via, verso invertito
  const m = mergeRoadNetworks([{ zoneId: 'A', network: a }, { zoneId: 'B', network: b }]);
  assert.equal(m.ways.length, 1, 'stessa geometria (estremi ordinati) = una sola via');
  assert.equal(geometrySignature(g), geometrySignature(gRev), 'firma indipendente dal verso');
});

test('DEDUP — geometrie diverse senza id restano entrambe', () => {
  const a = { ways: [{ id: null, geometry: [[45, 9], [45, 9.001]], lengthM: 10 }], totalLengthM: 10 };
  const b = { ways: [{ id: null, geometry: [[46, 8], [46, 8.001]], lengthM: 10 }], totalLengthM: 10 };
  const m = mergeRoadNetworks([{ zoneId: 'A', network: a }, { zoneId: 'B', network: b }]);
  assert.equal(m.ways.length, 2);
});

test('FAILED ZONE — una zona nulla non azzera le altre, contata come fallita', () => {
  const a = net([way(1, 45, 9), way(2, 45, 9.01)]);
  const m = mergeRoadNetworks([
    { zoneId: 'A', network: a },
    { zoneId: 'B', network: null },
    { zoneId: 'C', network: { ways: [] } },
  ]);
  assert.equal(m.loadedZoneCount, 1);
  assert.equal(m.failedZoneCount, 2);
  assert.deepEqual(m.failedZoneIds.sort(), ['B', 'C']);
  assert.equal(m.ways.length, 2, 'le vie della zona valida restano');
});

// ── assignWayZoneId ───────────────────────────────────────────────────
const square = (id, minLng, minLat, maxLng, maxLat) => ({
  id,
  boundaryGeometry: {
    type: 'Polygon',
    coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
  },
});

test('ZONE OWNERSHIP — midpoint dentro una sola zona', () => {
  const zones = [square('z1', 9.0, 45.0, 9.1, 45.1), square('z2', 9.2, 45.0, 9.3, 45.1)];
  const r = assignWayZoneId([[45.05, 9.04], [45.05, 9.05], [45.05, 9.06]], zones, 'fallback');
  assert.equal(r.zoneId, 'z1');
  assert.equal(r.method, 'contains_midpoint');
});

test('ZONE OWNERSHIP — via su piu\' zone -> scelta deterministica (id minore)', () => {
  const zones = [square('z_b', 9.0, 45.0, 9.2, 45.2), square('z_a', 9.1, 45.0, 9.3, 45.2)]; // overlap 9.1–9.2
  const r = assignWayZoneId([[45.1, 9.14], [45.1, 9.15], [45.1, 9.16]], zones, 'fallback');
  assert.equal(r.zoneId, 'z_a', 'ordinamento per id stringa: z_a < z_b');
  assert.equal(r.method, 'multi_zone_deterministic');
});

test('ZONE OWNERSHIP — midpoint fuori, primo vertice dentro -> first_vertex', () => {
  const zones = [square('z1', 9.0, 45.0, 9.1, 45.1)];
  // midpoint a lng 9.5 (fuori), primo vertice a 9.05 (dentro)
  const r = assignWayZoneId([[45.05, 9.05], [45.05, 9.3], [45.05, 9.5]], zones, 'fallback');
  assert.equal(r.zoneId, 'z1');
  assert.equal(r.method, 'contains_first_vertex');
});

test('ZONE OWNERSHIP — nessun match -> fallback esplicito e tracciato', () => {
  const zones = [square('z1', 9.0, 45.0, 9.1, 45.1)];
  assert.deepEqual(assignWayZoneId([[10, 10], [10, 10.01]], zones, 'fb'), { zoneId: 'fb', method: 'fallback_no_zone_match' });
  assert.deepEqual(assignWayZoneId([], zones, 'fb'), { zoneId: 'fb', method: 'fallback_empty_geometry' });
  assert.deepEqual(assignWayZoneId([[45.05, 9.05]], [], 'fb'), { zoneId: 'fb', method: 'fallback_no_campaign_zones' });
});

// ── comportamento: 70% sulla rete MERGED ──────────────────────────────
test('70% — riferito alla lunghezza totale della rete merged, non a ogni comune', () => {
  const mkNet = (base) => net(Array.from({ length: 100 }, (_, i) => way(base + i, 45, 9 + i * 0.01, 100)));
  const m = mergeRoadNetworks([{ zoneId: 'A', network: mkNet(1) }, { zoneId: 'B', network: mkNet(1001) }]);
  assert.equal(m.totalLengthM, 20000); // 200 vie × 100 m
  const sel = selectRoadsFromOrigin(m, { lat: 45, lng: 9 }, 70, []);
  const ratio = sel.selectedLengthM / m.totalLengthM;
  assert.ok(Math.abs(ratio - 0.7) <= 0.01, `atteso ~70% della rete merged, ottenuto ${(ratio * 100).toFixed(1)}%`);
});

// ── contratto sorgente: CoverageAdjustmentPanel ───────────────────────
test('PANEL — prop campaignZones + filtro zone valide + canMultiZone', () => {
  assert.match(PANEL, /campaignZones = \[\]/);
  assert.match(PANEL, /const multiZonesEligible = useMemo\([\s\S]{0,260}z\.municipalityName && z\.boundaryGeometry/);
  assert.match(PANEL, /const canMultiZone = !simple && multiZonesEligible\.length > 1/);
  assert.match(PANEL, /const isCampaignScope = !simple && autoScope === 'campaign' && canMultiZone/);
});

test('PANEL — UI ambito: default single, "Tutte le zone" disabilitato con 1 sola zona', () => {
  assert.match(PANEL, /const \[autoScope, setAutoScope\] = useState\('single'\)/);
  assert.match(PANEL, />Comme?une selezionato<|>Comune selezionato</);
  assert.match(PANEL, /Tutte le zone della campagna/);
  assert.match(PANEL, /disabled=\{!canMultiZone\}/);
});

test('PANEL — multi-zone load: Promise.allSettled (mai Promise.all puro) + concorrenza limitata', () => {
  assert.match(PANEL, /Promise\.allSettled\(/);
  assert.doesNotMatch(PANEL, /Promise\.all\(batch\.map/);
  assert.match(PANEL, /AUTO_MULTIZONE_CONCURRENCY\s*=\s*4/);
  assert.match(PANEL, /AUTO_MULTIZONE_WARN_OVER\s*=\s*6/);
  assert.match(PANEL, /resolveNetworksBatched\(multiZonesEligible, AUTO_MULTIZONE_CONCURRENCY\)/);
  assert.match(PANEL, /mergeRoadNetworks\(settled\)/);
});

test('PANEL — origine map validata contro QUALSIASI campaignZone in scope campagna', () => {
  assert.match(PANEL, /multiZonesEligible\.some\(\(z\) => geoJsonContainsPoint\(z\.boundaryGeometry, lat, lng\)\)/);
  assert.match(PANEL, /Punto di partenza fuori da tutte le zone della campagna/);
});

test('PANEL — save: zone_id per via da assignWayZoneId (scope campagna), fallback zona selezionata', () => {
  assert.match(PANEL, /import \{ mergeRoadNetworks, assignWayZoneId \} from '\.\.\/\.\.\/lib\/geo\/mergeRoadNetworks\.js'/);
  assert.match(PANEL, /assignWayZoneId\(w\.geometry, multiZonesEligible, fallbackZoneId\)\.zoneId/);
  // save batch: ogni linea porta il proprio zone_id (assegnazione multi-zona
  // o zona selezionata come fallback), in un unico payload atomico.
  assert.match(PANEL, /geometry: latLngsToLineStringGeoJson\(line\),\s*\n\s*zone_id: autoLineOwnership\.get\(line\) \?\? zones\[0\]\?\.id \?\? null,/);
  assert.match(PANEL, /createCoverageAdjustmentsBatch\(\{[\s\S]{0,200}lines: linesPayload/);
});

test('PANEL — KPI multi-zone (Zone caricate / Zone fallite) + guard many-zones + elenco zone fallite', () => {
  assert.match(PANEL, /\['Zone caricate', String\(autoKpi\.zonesLoaded\)\]/);
  assert.match(PANEL, /\['Zone fallite', String\(autoKpi\.zonesFailed\)\]/);
  assert.match(PANEL, /Campagna con molte zone: il caricamento della rete può richiedere più tempo/);
  assert.match(PANEL, /Zone non caricate \(\{autoMulti\.failedZoneCount\}\)[\s\S]{0,120}NON è completa/);
});

test('PANEL — preview/load NON scrive su DB (createCoverageAdjustment solo in handleSave)', () => {
  const fn = PANEL.slice(PANEL.indexOf('const loadAutomaticBase'), PANEL.indexOf('const handleCloseShape'));
  assert.doesNotMatch(fn, /createCoverageAdjustment|updateCoverageAdjustment|\.rpc\(|calculate_campaign_final_coverage/);
});

test('PANEL — scope singolo invariato: resolveRoadNetwork(municipalityName, boundaryGeometry) nel ramo else', () => {
  assert.match(PANEL, /net = await resolveRoadNetwork\(municipalityName, boundaryGeometry\)/);
  assert.match(PANEL, /selectRoadsFromOrigin\(net, origin, pct, gpsPath\)/);
});

// ── contratto sorgente: l'Editor Copertura passa le zone reali ────────
test('COVERAGE-EDITOR — campaignZones dal solo campaign_zones reale (zoneRows + resolvedBoundaries), filtrate', () => {
  assert.match(COVEDIT, /const campaignZonesForAuto = useMemo\(/);
  assert.match(COVEDIT, /zoneRows[\s\S]{0,160}municipalityName: z\.zone_name, boundaryGeometry: resolvedBoundaries\[z\.id\] \|\| null/);
  assert.match(COVEDIT, /\.filter\(\(z\) => z\.municipalityName && z\.boundaryGeometry\)/);
  assert.match(COVEDIT, /campaignZones=\{campaignZonesForAuto\}/);
});
