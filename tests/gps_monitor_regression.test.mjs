// REGRESSION — Monitor operativo GPS (ticket "ADMIN + CLIENTE, stessa verità,
// strumenti Admin semplici").
//
// ⚠️ FIXTURE / REGRESSION TEST — NON è una prova su campagna DB reale.
// La campagna reale usata nell'audit (7406e420-9999-409c-88a9-e15a81353e35)
// possiede UNA sola operator_assignment attiva (Fenice). Il supporto a N
// operatori si verifica qui con una fixture controllata a 4 operatori; le
// prove runtime reali (Bergamo sulla mappa, automatico 80%, manuale/gomma
// salva+reload) restano da eseguire sull'app autenticata.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { getOperatorColor } from '../src/lib/geo/operatorColor.js';
import { selectRoadsFromOrigin } from '../src/lib/geo/originRadialSelection.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const GM = read('src/pages/admin/GpsMonitor.jsx');
const PANEL = read('src/components/admin/CoverageAdjustmentPanel.jsx');
const HOOK = read('src/hooks/useZoneBoundaries.js');
const RRN = read('src/lib/geo/resolveRoadNetwork.js');

// Ri-implementazione dell'algoritmo canonicalOperators di GpsMonitor.jsx —
// mantenuta allineata dal test di contratto sorgente qui sotto.
function buildCanonicalOperators(campaignOperators, gpsDriverIds) {
  const out = [];
  const seen = new Set();
  for (const o of campaignOperators) {
    const key = o.operatorId || o.assignmentId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      operatorId: o.operatorId || null,
      assignmentId: o.assignmentId || null,
      colorKey: String(key),
      displayName: o.name || `Operatore ${String(key).slice(0, 8)}`,
      color: getOperatorColor(key),
      assigned: true,
      hasGps: o.operatorId ? gpsDriverIds.has(o.operatorId) : false,
    });
  }
  for (const id of gpsDriverIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      operatorId: id, assignmentId: null, colorKey: String(id),
      displayName: `Operatore ${String(id).slice(0, 8)}`, color: getOperatorColor(id),
      assigned: false, hasGps: true,
    });
  }
  return out;
}

// ── TEST 1 — MULTI OPERATORE (fixture 4 operatori) ──────────────────────
const OP_A = '7a1c9e00-0000-0000-0000-000000000001';
const OP_B = 'b2d84f11-1111-1111-1111-111111111112';
const OP_C = 'c3e95a22-2222-2222-2222-222222222223';
const OP_D = 'd4fa6b33-3333-3333-3333-333333333334';
const FOUR_OPS = [
  { assignmentId: 'a-1', operatorId: OP_A, name: 'Mario' },
  { assignmentId: 'a-2', operatorId: OP_B, name: 'Ahmed' },
  { assignmentId: 'a-3', operatorId: OP_C, name: 'Karim' },
  { assignmentId: 'a-4', operatorId: OP_D, name: null }, // nome mancante
];

test('MULTI-OP (fixture) — 4 operatori assegnati -> 4 canonicalOperators, tutti assigned', () => {
  const canon = buildCanonicalOperators(FOUR_OPS, new Set([OP_B]));
  assert.equal(canon.length, 4);
  assert.deepEqual(canon.map((o) => o.displayName), ['Mario', 'Ahmed', 'Karim', `Operatore ${OP_D.slice(0, 8)}`]);
  assert.equal(canon.filter((o) => o.assigned).length, 4);
  assert.equal(canon.filter((o) => o.hasGps).length, 1);
  assert.equal(canon.find((o) => o.displayName === 'Ahmed').hasGps, true);
});

test('MULTI-OP (fixture) — 4 colori STABILI e distinti, invariati al "reload" (ricalcolo)', () => {
  const a = buildCanonicalOperators(FOUR_OPS, new Set());
  const b = buildCanonicalOperators(FOUR_OPS, new Set()); // simula reload / nuovo mount
  assert.deepEqual(a.map((o) => o.color), b.map((o) => o.color), 'stesso operatore -> stesso colore dopo reload');
  assert.equal(new Set(a.map((o) => o.color)).size, 4, '4 operatori -> 4 colori distinti');
  // il colore è deterministico dalla chiave operatore, mai da indice
  for (const o of a) assert.equal(o.color, getOperatorColor(o.operatorId));
});

test('MULTI-OP (fixture) — assignment duplicata per lo stesso operator_id -> 1 solo canonico', () => {
  const withDup = [...FOUR_OPS, { assignmentId: 'a-5', operatorId: OP_A, name: 'Mario (2ª zona)' }];
  const canon = buildCanonicalOperators(withDup, new Set());
  assert.equal(canon.length, 4, 'dedup per operator_id');
  assert.equal(canon.filter((o) => o.displayName.startsWith('Mario')).length, 1);
});

test('MULTI-OP (fixture) — GPS driver senza assignment -> incluso ma assigned:false', () => {
  const canon = buildCanonicalOperators(
    [FOUR_OPS[0]],
    new Set(['99999999-9999-9999-9999-999999999999']),
  );
  assert.equal(canon.length, 2);
  assert.equal(canon.find((o) => o.operatorId === '99999999-9999-9999-9999-999999999999').assigned, false);
  assert.equal(canon.filter((o) => o.assigned).length, 1);
});

test('MULTI-OP — contratto sorgente: GpsMonitor usa lo stesso algoritmo (dedup + colore stabile)', () => {
  assert.match(GM, /const seen = new Set\(\);/);
  assert.match(GM, /if \(!key \|\| seen\.has\(key\)\) continue;/);
  assert.match(GM, /color: getOperatorColor\(key\)/);
  assert.match(GM, /hasGps: o\.operatorId \? gpsDriverIds\.has\(o\.operatorId\) : false/);
  assert.match(GM, /for \(const id of gpsDriverIds\) \{/);
  assert.doesNotMatch(GM, /canonicalOperators.*trackColor\(index\)/);
});

// ── TEST 2 — ISOLAMENTO ZONA / CACHE (Bergamo ≠ Milano) ─────────────────
test('STALE-ZONE — useZoneBoundaries resetta zoneRows + resolvedBoundaries al cambio campaignId', () => {
  assert.match(HOOK, /setZoneRows\(\[\]\);\s*\n\s*setResolvedBoundaries\(\{\}\);\s*\n\s*persistedZoneIdsRef\.current = new Set\(\);/);
  // reset dentro l'effetto con dep [campaignId]
  const eff = HOOK.slice(HOOK.indexOf('setZoneRows([]);'), HOOK.indexOf('}, [campaignId]);'));
  assert.ok(eff.length > 0 && eff.length < 2000, 'il reset è nell\'effetto su [campaignId]');
});

test('STALE-ZONE — priorità A: polygon_geojson dal DB usato subito, senza attendere Nominatim', () => {
  assert.match(HOOK, /const g = zone\.polygon_geojson;/);
  assert.match(HOOK, /if \(g && typeof g === 'object' && g\.type && Array\.isArray\(g\.coordinates\)\) \{\s*\n\s*seeded\[zone\.id\] = g;/);
  // Nominatim (priorità C) SOLO per le zone senza confine DB
  assert.match(HOOK, /zoneRows\.filter\(\(zone\) => zone\.zone_name && !resolvedBoundaries\[zone\.id\]\)/);
});

test('STALE-ZONE — nessun Milano hard-coded come default di zona (GpsMonitor + Cliente)', () => {
  // il center parte dal centroide del confine reale, non da coordinate fisse
  assert.match(GM, /if \(selectedZoneGeometry\) \{\s*\n\s*const c = getMunicipalityCenterPoint\(selectedZoneGeometry\);/);
  assert.match(GM, /\/\/ Priorità 2: ultimo punto GPS reale/);
  const CUSTOMER = read('src/pages/customer/CampaignTracking.jsx');
  assert.match(CUSTOMER, /const c = getMunicipalityCenterPoint\(zoneWithGeometry\.geometry\);/);
  // il Cliente limita le geometrie alle zone della campagna corrente
  assert.match(CUSTOMER, /const liveZones = useMemo\(\s*\n\s*\(\) => \(zoneRows \|\| \[\]\)\s*\n\s*\.map\(\(z\) => resolvedBoundaries\[z\.id\]\)/);
});

// ── TEST 3 — AUTOMATICO: non-zero con rete valida, errore con rete vuota ──
function syntheticNet(n = 200, wayLen = 100) {
  const ways = [];
  for (let i = 0; i < n; i += 1) {
    const lat = 45.0;
    const lng0 = 9.0 + i * 0.01;
    ways.push({ id: i + 1, geometry: [[lat, lng0], [lat, lng0 + 0.001]], lengthM: wayLen });
  }
  return { ways, totalLengthM: n * wayLen };
}
const ORIGIN = { lat: 45.0, lng: 9.0 };

test('AUTO-80 — rete valida: 80% -> vie > 0, lunghezza > 0, ~80% della rete', () => {
  const net = syntheticNet(200, 100); // 20 km totali
  const sel = selectRoadsFromOrigin(net, ORIGIN, 80, []);
  assert.ok(sel.selectedWays.length > 0, 'selectedWays > 0');
  assert.ok(sel.selectedLengthM > 0, 'selectedLengthM > 0');
  const ratio = sel.selectedLengthM / net.totalLengthM;
  assert.ok(ratio >= 0.78 && ratio <= 0.86, `copertura ~80% (ratio=${ratio.toFixed(3)})`);
  assert.ok(sel.coverageMetricPercent >= 78 && sel.coverageMetricPercent <= 86);
});

test('AUTO-80 — rete VUOTA -> 0 vie (mai un falso 80%)', () => {
  const empty = { ways: [], totalLengthM: 0 };
  const sel = selectRoadsFromOrigin(empty, ORIGIN, 80, []);
  assert.equal(sel.selectedWays.length, 0);
  assert.equal(sel.selectedLengthM, 0);
  assert.equal(sel.coverageMetricPercent, 0);
});

test('AUTO-80 — contratto: rete vuota NON cacheata + autoNetRef invalidato + errore visibile', () => {
  // resolveRoadNetwork: la guardia "risultato vuoto -> return" viene PRIMA di
  // roadCache.set, quindi una rete vuota non entra mai in cache.
  assert.match(RRN, /if \(!ways\.length \|\| totalLengthM <= 0\) \{\s*\n\s*return result;\s*\n\s*\}/);
  assert.ok(
    RRN.indexOf('if (!ways.length || totalLengthM <= 0)') < RRN.indexOf('roadCache.set(key, result)'),
    'la guardia rete-vuota precede roadCache.set',
  );
  // pannello: net vuota -> autoNetRef=null + errore
  assert.match(PANEL, /if \(!net\?\.ways\?\.length \|\| !\(net\.totalLengthM > 0\)\) \{\s*\n\s*autoNetRef\.current = null;\s*\n\s*setAutoBaseState\(\{ loading: false, error:/);
  // 0 vie selezionate -> NON è mostrato come successo
  assert.match(PANEL, /\{autoKpi && autoConfigVisible && autoKpi\.ways === 0 && \(/);
  assert.match(PANEL, /nessuna via selezionata \(0 km\)\. Non è un risultato valido/);
});

// ── TEST 4 — MODALITÀ SIMPLE nel Monitor Admin ─────────────────────────
test('SIMPLE — GpsMonitor monta il pannello simple con operatore/matita/gomma/automatico/salva, note facoltative', () => {
  assert.match(GM, /<CoverageAdjustmentPanel\s*\n\s*key=\{`\$\{campaignId\}:\$\{selectedZoneId \|\| 'none'\}`\}\s*\n\s*simple/);
  assert.match(GM, /campaignOperators=\{campaignOperators\}/);
  assert.match(GM, /gpsOperators=\{gpsOperators\}/);
  // il pannello: matita/gomma/salva presenti sempre; note facoltative; nessun motivo obbligatorio
  assert.match(PANEL, />Matita<\/button>/);
  assert.match(PANEL, />Gomma<\/button>/);
  assert.match(PANEL, /Note \(facoltative\)/);
  assert.doesNotMatch(PANEL, /required[\s\S]{0,40}[Mm]otivo/);
  assert.doesNotMatch(PANEL, /window\.prompt/);
  // simple nasconde ambito multi-zona, selettore livello, storico
  assert.match(PANEL, /\{!simple && \(\s*\n\s*<>\s*\n\s*<div style=\{\{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 \}\}>\s*\n\s*<span style=\{autoCtlLabelStyle\}>Ambito/);
});
