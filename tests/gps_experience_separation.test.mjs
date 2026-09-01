// MONITOR OPERATIVO GPS — Admin + Cliente, stessa verità, strumenti Admin
// semplici INLINE nel Monitor.
//
// Architettura (ticket "MONITOR OPERATIVO GPS: ADMIN + CLIENTE ..."):
//   - src/pages/admin/GpsMonitor.jsx        -> Monitor operativo Admin: mappa,
//     tracce, operatori, foto, geofence + CoverageAdjustmentPanel in mode
//     "simple" (operatore, matita, gomma parziale, manuale, automatico
//     50..100%, KPI/preview, salva, note facoltative). NIENTE diagnostica /
//     override legacy / selettore livello / ambito multi-zona / motivo
//     obbligatorio / link "Apri editor avanzato".
//   - src/pages/customer/CampaignTracking.jsx -> Monitor Cliente, sola lettura,
//     STESSA coverage truth (calculate_campaign_final_coverage).
//   - src/pages/admin/CoverageEditor.jsx    -> pagina separata ("Studio Mappa
//     Avanzato" futuro), NON collegata dal Monitor, lasciata intatta.
//
// Test di CONTRATTO SORGENTE (nessuna DB, nessuna migration, nessun raw GPS).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const MONITOR = read('src/pages/admin/GpsMonitor.jsx');
const EDITOR = read('src/pages/admin/CoverageEditor.jsx');
const CUSTOMER = read('src/pages/customer/CampaignTracking.jsx');
const ROUTE_RES = read('src/app/routeResolution.js');
const APP_ROUTER = read('src/app/AppRouter.jsx');
const PANEL = read('src/components/admin/CoverageAdjustmentPanel.jsx');

// ─────────────────────────────────────────────────────────────────────
// A. Monitor Admin: strumenti SEMPLICI inline, NIENTE roba avanzata
// ─────────────────────────────────────────────────────────────────────
test('A — GpsMonitor monta CoverageAdjustmentPanel in modalità simple', () => {
  assert.match(MONITOR, /import \{ CoverageAdjustmentPanel \} from '\.\.\/\.\.\/components\/admin\/CoverageAdjustmentPanel\.jsx'/);
  assert.match(MONITOR, /<CoverageAdjustmentPanel\s*\n\s*key=\{`\$\{campaignId\}:\$\{selectedZoneId \|\| 'none'\}`\}\s*\n\s*simple/);
  // una sola istanza del pannello nel Monitor (non due tab)
  assert.equal((MONITOR.match(/<CoverageAdjustmentPanel/g) || []).length, 1);
});

test('A — Monitor Admin: nessuno strumento avanzato / link editor / motivo obbligatorio', () => {
  assert.doesNotMatch(MONITOR, /<ZoneProgressPanel/, 'nessun override legacy percentuale');
  assert.doesNotMatch(MONITOR, /<ZoneCoverageMap/, 'nessuna diagnostica rete');
  assert.doesNotMatch(MONITOR, /<AdminIssuesPanel/);
  assert.doesNotMatch(MONITOR, /Apri editor avanzato/, 'nessun link allo Studio Mappa Avanzato');
  assert.doesNotMatch(MONITOR, /admin-coverage-editor:/, 'il Monitor non naviga più all\'Editor');
  assert.doesNotMatch(MONITOR, /onNav\?\.\(`admin-coverage-editor/);
  // il pannello in simple nasconde selettore livello / ambito multi-zona / storico
  assert.match(PANEL, /simple = false \}\) \{/);
  assert.match(PANEL, /const canMultiZone = !simple && multiZonesEligible\.length > 1/);
  assert.match(PANEL, /\{!simple && \(\s*\n\s*<label style=\{labelStyle\}>\s*\n\s*Livello/);
  assert.match(PANEL, /marginTop: 12, display: simple \? 'none' : 'block'/); // storico correzioni
});

// ─────────────────────────────────────────────────────────────────────
// B. CoverageEditor resta come pagina separata, NON collegata dal Monitor
// ─────────────────────────────────────────────────────────────────────
test('B — CoverageEditor esiste ancora come route Admin dedicata (non collegata dal Monitor)', () => {
  assert.match(ROUTE_RES, /campaigns\\\/\(\[\^\/\]\+\)\\\/coverage-editor\$/);
  assert.match(ROUTE_RES, /return `admin-coverage-editor:\$\{adminCoverageEditor\[1\]\}`/);
  const adminBranch = APP_ROUTER.slice(APP_ROUTER.indexOf('<AdminGuard'), APP_ROUTER.indexOf('</AdminGuard>'));
  assert.match(adminBranch, /page\.startsWith\("admin-coverage-editor:"\) && <CoverageEditor key=\{page\.split\(":"\)\[1\]\} campaignId=\{page\.split\(":"\)\[1\]\} onNav=\{goTo\} \/>/);
  // e riusa lo stesso pannello (non riscritto)
  assert.match(EDITOR, /import \{ CoverageAdjustmentPanel \} from '\.\.\/\.\.\/components\/admin\/CoverageAdjustmentPanel\.jsx'/);
});

// ─────────────────────────────────────────────────────────────────────
// C. Isolamento zona/campagna: nessun residuo Bergamo/Milano
// ─────────────────────────────────────────────────────────────────────
test('C — key={campaignId} sulle route GPS + reset resolvedBoundaries al cambio campagna', () => {
  assert.match(APP_ROUTER, /<GpsMonitor key=\{page\.split\(":"\)\[1\]\} campaignId=\{page\.split\(":"\)\[1\]\}/);
  assert.match(APP_ROUTER, /<CampaignTracking key=\{page\.split\(":"\)\[1\]\} campaignId=\{page\.split\(":"\)\[1\]\}/);
  const HOOK = read('src/hooks/useZoneBoundaries.js');
  assert.match(HOOK, /setZoneRows\(\[\]\);\s*\n\s*setResolvedBoundaries\(\{\}\);/);
  // il pannello simple si rimonta al cambio campagna O zona (autoNetRef, draft, center)
  assert.match(MONITOR, /key=\{`\$\{campaignId\}:\$\{selectedZoneId \|\| 'none'\}`\}/);
});

test('C — MAI Milano hard-coded come fallback per una zona non-Milano', () => {
  // GpsMonitor: il center parte dal centroide del confine reale, non da Milano
  assert.match(MONITOR, /getMunicipalityCenterPoint\(selectedZoneGeometry\)/);
  // la mappa non viene montata se non c'è confine né punto GPS
  assert.match(MONITOR, /\(selectedZoneGeometry \|\| latest\) \? \(/);
  // Cliente: stesso principio
  assert.match(CUSTOMER, /getMunicipalityCenterPoint\(zoneWithGeometry\.geometry\)/);
  // le geometrie del Cliente sono limitate alle zone della campagna corrente
  assert.match(CUSTOMER, /\(zoneRows \|\| \[\]\)\s*\n\s*\.map\(\(z\) => resolvedBoundaries\[z\.id\]\)/);
});

// ─────────────────────────────────────────────────────────────────────
// D. Il Cliente non vede strumenti Admin
// ─────────────────────────────────────────────────────────────────────
test('D — CampaignTracking (Cliente): sola lettura, nessuno strumento Admin', () => {
  assert.doesNotMatch(CUSTOMER, /CoverageAdjustmentPanel|CoverageEditor|AdminIssuesPanel|ZoneCoverageMap/);
  assert.doesNotMatch(CUSTOMER, /isAdmin|onSetManual|onClearManual/);
  assert.doesNotMatch(CUSTOMER, /createCoverageAdjustment|updateCoverageAdjustment|revokeCoverageAdjustment/);
  assert.match(CUSTOMER, /listCoverageAdjustments\(/);
});

test('D — il Cliente non ha accesso alla route dell\'Editor', () => {
  const line = ROUTE_RES.split('\n').find((l) => l.includes('coverage-editor'));
  assert.match(line, /admin/);
  assert.doesNotMatch(ROUTE_RES, /customer[\s\S]{0,80}coverage-editor/i);
});

// ─────────────────────────────────────────────────────────────────────
// E. canonicalOperators continua a includere TUTTI gli assegnati (N operatori)
// ─────────────────────────────────────────────────────────────────────
test('E — GpsMonitor: canonicalOperators + conteggi assegnati preservati', () => {
  assert.match(MONITOR, /const canonicalOperators = useMemo\(\(\) => \{/);
  assert.match(MONITOR, /for \(const o of campaignOperators\) \{/);
  assert.match(MONITOR, /const assignedOperatorCount = canonicalOperators\.filter\(\(o\) => o\.assigned\)\.length;/);
  assert.match(MONITOR, /const operatorsWithGpsCount = canonicalOperators\.filter\(\(o\) => o\.hasGps\)\.length;/);
  assert.match(MONITOR, /export function shortOperatorId\(value\) \{/);
  assert.match(MONITOR, /displayName: o\.name \|\| `Operatore \$\{shortOperatorId\(key\)\}`/);
  assert.match(MONITOR, /color: getOperatorColor\(key\)/);
  assert.match(MONITOR, /OPERATORI CAMPAGNA/);
  assert.match(MONITOR, /<GpsMonitorOperatorsPanel/);
  assert.match(MONITOR, /canonicalOperators=\{canonicalOperators\}/);
  // gli operatori reali sono passati anche al pannello simple
  assert.match(MONITOR, /campaignOperators=\{campaignOperators\}/);
});

// ─────────────────────────────────────────────────────────────────────
// F. Automatico: cache, nessuna Overpass a cambio %, ma rete vuota invalidata
// ─────────────────────────────────────────────────────────────────────
test('F — autoNetRef: cache valida al cambio %, invalidata su rete vuota/errore', () => {
  assert.match(PANEL, /const autoNetRef = useRef\(null\);/);
  assert.match(PANEL, /const applyAutoSelectionFromCache = \(pctRaw, \{ pushUndo = false \} = \{\}\) => \{/);
  const effStart = PANEL.indexOf('useEffect(() => {\n    if (!correcting || editingId) return;\n    if (!autoNetRef.current) return;');
  assert.ok(effStart > 0, 'effetto reattivo su autoPct assente');
  const eff = PANEL.slice(effStart, effStart + 320);
  assert.match(eff, /applyAutoSelectionFromCache\(autoPct, \{ pushUndo: false \}\);/);
  assert.doesNotMatch(eff, /window\.confirm|resolveRoadNetwork|resolveNetworksBatched/);
  // §4 ticket: rete con 0 vie / lunghezza <= 0 NON è cache valida
  assert.match(PANEL, /if \(!net\?\.ways\?\.length \|\| !\(net\.totalLengthM > 0\)\) \{\s*\n\s*autoNetRef\.current = null;/);
  // rete vuota NON cacheata a livello di resolveRoadNetwork
  const RRN = read('src/lib/geo/resolveRoadNetwork.js');
  assert.match(RRN, /if \(!ways\.length \|\| totalLengthM <= 0\) \{\s*\n\s*return result;\s*\n\s*\}/);
  // percentuale non mostrata come successo se 0 vie
  assert.match(PANEL, /autoKpi && autoConfigVisible && autoKpi\.ways === 0/);
});

// ─────────────────────────────────────────────────────────────────────
// G. Stessa verità Cliente / Admin (Monitor) / Editor
// ─────────────────────────────────────────────────────────────────────
test('G — una sola verità: calculate_campaign_final_coverage ovunque', () => {
  assert.match(PANEL, /getFinalCoverage\(campaignId\)/);
  assert.match(PANEL, /coverage\.final_operational_coverage_pct/);
  // il Monitor mostra la copertura tramite il pannello (che chiama getFinalCoverage)
  assert.match(MONITOR, /<CoverageAdjustmentPanel/);
  const customerApi = read('src/lib/services/customer-api.js');
  assert.match(customerApi, /getFinalCoverage\(campaignId\)/);
  assert.doesNotMatch(MONITOR, /create (or replace )?function|create table/i);
});

test('G — nessun secondo motore GPS: nessuna scrittura su gps_tracking_points/delivery_sessions', () => {
  assert.doesNotMatch(MONITOR, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.doesNotMatch(PANEL, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
  assert.doesNotMatch(EDITOR, /from\(['"]gps_tracking_points['"]\)[\s\S]{0,120}\.(insert|update|delete)\(/);
});
