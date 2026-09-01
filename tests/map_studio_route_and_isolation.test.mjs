// Studio Mappa — route sotto AdminGuard, card nel Dashboard, ISOLAMENTO dal
// motore operativo (nessun import di GpsMonitor / CoverageAdjustmentPanel /
// CoverageEditor / CampaignTracking / RPC coverage / tabelle campagna).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

import { resolveAppRoute } from '../src/app/routeResolution.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// rimuove commenti // e /* */ per non far scattare i controlli sui commenti
// esplicativi (che citano di proposito cio' che NON si deve importare).
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const ROUTER = read('src/app/AppRouter.jsx');
const MODULES_PANEL = read('src/pages/admin/admin-dashboard/AdminDashboardModulesPanel.jsx');

test('route: /admin/map-studio → admin-map-studio', () => {
  assert.equal(resolveAppRoute('/admin/map-studio'), 'admin-map-studio');
  assert.equal(resolveAppRoute('/admin/MAP-STUDIO'), 'admin-map-studio');
});

test('T-guard: la pagina e\' renderizzata DENTRO <AdminGuard> (ramo page.startsWith("admin"))', () => {
  // il branch admin-map-studio compare dopo <AdminGuard ...> e prima della sua chiusura
  const guardOpen = ROUTER.indexOf('<AdminGuard');
  const guardClose = ROUTER.indexOf('</AdminGuard>');
  const branch = ROUTER.indexOf('page === "admin-map-studio"');
  assert.ok(guardOpen > 0 && guardClose > guardOpen);
  assert.ok(branch > guardOpen && branch < guardClose, 'il branch e\' dentro AdminGuard');
  assert.match(ROUTER, /page === "admin-map-studio" && <MapStudioPage onNav=\{goTo\} \/>/);
  assert.match(ROUTER, /lazy\(\(\) => import\("\.\.\/pages\/admin\/map-studio\/MapStudioPage\.jsx"\)/);
  // mappa page→path per la navigazione
  assert.match(ROUTER, /"admin-map-studio": "\/admin\/map-studio"/);
});

test('Dashboard Admin: card "Studio Mappa" che naviga a admin-map-studio', () => {
  assert.match(MODULES_PANEL, /title="Studio Mappa"/);
  assert.match(MODULES_PANEL, /onOpen=\{\(\) => onNav\('admin-map-studio'\)\}/);
});

test('ISOLAMENTO: nessun file map-studio importa Monitor / pannello copertura / RPC campagna', () => {
  const dir = new URL('../src/pages/admin/map-studio/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(jsx?|mjs)$/.test(f));
  assert.ok(files.length >= 15, `attesi >=15 file, trovati ${files.length}`);
  const forbidden = [
    /GpsMonitor/, /CoverageAdjustmentPanel/, /CoverageEditor/, /CampaignTracking/,
    /coverage-adjustments-api/, /campaign_coverage_adjustments/, /campaign_zone_progress/,
    /admin_split_coverage_adjustment/, /admin_create_coverage_adjustments_batch/,
    /supabase\.rpc\(/, /gps_tracking_points/, /delivery_sessions/,
  ];
  for (const f of files) {
    const src = stripComments(readFileSync(new URL(f, dir), 'utf8'));
    for (const re of forbidden) {
      assert.doesNotMatch(src, re, `${f} non deve contenere ${re}`);
    }
  }
});

test('ISOLAMENTO: operatorSplit.js del motore operativo NON e\' modificato/importato', () => {
  const dir = new URL('../src/pages/admin/map-studio/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(jsx?|mjs)$/.test(f));
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const l of importLines) assert.doesNotMatch(l, /geo\/operatorSplit/);
  }
});

test('riuso consentito (classe A audit): boundary/rete/selezione radiale — helper puri, non il motore', () => {
  const autoRaw = readFileSync(new URL('../src/pages/admin/map-studio/mapStudioAuto.js', import.meta.url), 'utf8');
  const auto = stripComments(autoRaw);
  assert.match(auto, /resolveRoadNetwork/);
  assert.match(auto, /selectRoadsFromOrigin/);
  // etichetta obbligatoria "N% della rete stradale selezionata" (nel codice, non solo commento)
  assert.match(auto, /rete stradale selezionata/);
  // il codice non produce un'etichetta "copertura finale"
  assert.doesNotMatch(auto, /'[^']*copertura finale[^']*'/i);
});
