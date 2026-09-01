// GOMMA PARZIALE + TIMEOUT — ticket "FIX FINALE MATITA/GOMMA".
//
// Bug runtime:
//  B) "GOMMA: nessun tratto/area vicino al punto cliccato" — hit-test sulle
//     righe salvate con tolleranza troppo stretta e MultiLineString ignorate
//     oltre il primo ramo.
//  C) la gomma su una linea salvata revocava SEMPRE l'intera LineString.
//  D) "canceling statement due to statement timeout" — il trigger di sync
//     ricalcolava calculate_zone_final_coverage su ~2474 righe ad ogni edit.
//
// FIX (contratto sorgente; nessuna DB in questo runner):
//  - eraseNearest: tolleranza LINE_TOL_M anche per le righe salvate, hit-test
//    su TUTTI i rami di MultiLineString / anelli di (Multi)Polygon;
//  - GOMMA PARZIALE su linea salvata -> admin_split_coverage_adjustment
//    (revoca sorgente + segmenti residui in 1 transazione atomica, 1 sola
//    sync finale, residui che ereditano source/zone/operator/buffer);
//  - statement_timeout esteso a livello di funzione sul percorso di sync.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIG = read('supabase/migrations/20260831130000_coverage_erase_partial_and_timeout.sql');
const API = read('src/lib/services/coverage-adjustments-api.js');
const PANEL = read('src/components/admin/CoverageAdjustmentPanel.jsx');

// ── D. TIMEOUT — bump a livello di funzione (no cambio corpo) ──────────
test('MIG-D — statement_timeout = 300s sul percorso di sync (revoke/update/sync/calc)', () => {
  assert.match(MIG, /alter function public\.calculate_zone_final_coverage\(uuid\) set statement_timeout = '300s';/);
  assert.match(MIG, /alter function public\.sync_campaign_zone_progress_cache\(uuid, uuid\) set statement_timeout = '300s';/);
  assert.match(MIG, /alter function public\.admin_revoke_coverage_adjustment\(uuid, text\) set statement_timeout = '300s';/);
  assert.match(MIG, /alter function public\.admin_update_coverage_adjustment\(uuid, text, jsonb, text, text, jsonb, text, numeric\) set statement_timeout = '300s';/);
  // NON ridefinisce i corpi di quelle funzioni
  assert.doesNotMatch(MIG, /create (or replace )?function public\.(admin_revoke_coverage_adjustment|admin_update_coverage_adjustment|calculate_zone_final_coverage|sync_campaign_zone_progress_cache)\b/i);
  // NON ridefinisce calculate_campaign_final_coverage
  assert.doesNotMatch(MIG, /(create|alter) (or replace )?function public\.calculate_campaign_final_coverage/i);
});

// ── C. GOMMA PARZIALE — admin_split_coverage_adjustment ───────────────
test('MIG-C — admin_split_coverage_adjustment: SECURITY DEFINER, gate admin, sorgente FOR UPDATE, no-second-revoke', () => {
  assert.match(MIG, /create or replace function public\.admin_split_coverage_adjustment\([\s\S]{0,300}p_adjustment_id uuid,[\s\S]{0,200}p_residual_lines jsonb,[\s\S]{0,120}p_reason text default 'admin_partial_erase'[\s\S]{0,60}\) returns jsonb\s*\n\s*language plpgsql security definer set search_path to ''/);
  assert.match(MIG, /if not public\.gps_is_admin\(\) then\s*\n\s*raise exception 'ADMIN_NON_AUTORIZZATO'/);
  assert.match(MIG, /select \* into v_src from public\.campaign_coverage_adjustments where id = p_adjustment_id for update;/);
  assert.match(MIG, /if v_src\.revoked_at is not null then\s*\n\s*raise exception 'CORREZIONE_GIA_REVOCATA'/);
});

test('MIG-C — valida i residui PRIMA di scrivere, filtra + conta scartati, solo linee', () => {
  const v = MIG.slice(MIG.indexOf('for v_elem in select * from pg_catalog.jsonb_array_elements(p_residual_lines)'), MIG.indexOf('-- Flag TRANSAZIONE-LOCALE'));
  assert.match(v, /begin\s*\n\s*v_geom := public\.ST_MakeValid\(public\.ST_SetSRID\(public\.ST_GeomFromGeoJSON\(v_elem::text\), 4326\)\);\s*\n\s*exception when others then\s*\n\s*v_geom := null;/);
  assert.match(v, /if v_geom is null or public\.ST_IsEmpty\(v_geom\) then\s*\n\s*v_discarded := v_discarded \+ 1;/);
  assert.match(v, /v_gtype not in \('LINESTRING', 'MULTILINESTRING'\) or public\.ST_NPoints\(v_geom\) < 2/);
});

test('MIG-C — atomico: revoca sorgente + INSERT residui (unnest) + _log, in 1 transazione; UNA sola sync', () => {
  // 1 solo update di revoca della sorgente
  assert.match(MIG, /update public\.campaign_coverage_adjustments\s*\n\s*set revoked_at = now\(\), revoked_by = v_uid, revoke_reason = v_reason/);
  // INSERT ... SELECT unnest dei residui (una statement)
  assert.match(MIG, /insert into public\.campaign_coverage_adjustments\s*\n\s*\(campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by,\s*\n\s*source, line_buffer_m, verified_at, verified_by\)\s*\n\s*select v_src\.campaign_id, v_src\.zone_id, v_src\.adjustment_type, g, v_src\.reason, v_src\.notes,\s*\n\s*v_src\.metadata, v_uid, v_src\.source, v_src\.line_buffer_m/);
  assert.match(MIG, /from pg_catalog\.unnest\(v_valid_geoms\) as g/);
  // log per revoca + per ogni residuo
  assert.equal((MIG.match(/insert into public\.campaign_coverage_adjustments_log/g) || []).length, 2);
  // UNA sola chiamata a sync_campaign_zone_progress_cache in tutta la RPC split
  const splitFn = MIG.slice(MIG.indexOf('create or replace function public.admin_split_coverage_adjustment'), MIG.indexOf('alter function public.admin_split_coverage_adjustment(uuid, jsonb, text) set statement_timeout'));
  assert.equal((splitFn.match(/perform public\.sync_campaign_zone_progress_cache\(/g) || []).length, 1);
  assert.match(splitFn, /if v_src\.zone_id is not null then\s*\n\s*perform public\.sync_campaign_zone_progress_cache\(v_src\.zone_id, v_uid\);/);
  // niente loop RPC per segmento
  assert.doesNotMatch(splitFn, /for .* in .* loop[\s\S]*insert into public\.campaign_coverage_adjustments\b(?!_log)/);
});

test('MIG-C — flag transazione-locale (guardia trigger), niente ALTER TABLE DISABLE TRIGGER', () => {
  assert.match(MIG, /perform pg_catalog\.set_config\('app\.coverage_batch_mode', '1', true\);/);
  assert.match(MIG, /perform pg_catalog\.set_config\('app\.coverage_batch_mode', '', true\);/);
  assert.doesNotMatch(MIG, /^\s*alter table .*trigger/im);
  // ordine: flag=1 -> revoca+insert -> flag='' -> sync
  assert.ok(
    MIG.indexOf("set_config('app.coverage_batch_mode', '1', true)")
      < MIG.indexOf('set revoked_at = now()')
    && MIG.indexOf('set revoked_at = now()')
      < MIG.indexOf("set_config('app.coverage_batch_mode', '', true)")
    && MIG.indexOf("set_config('app.coverage_batch_mode', '', true)")
      < MIG.indexOf('perform public.sync_campaign_zone_progress_cache(v_src.zone_id, v_uid)'),
  );
});

test('MIG-C — residui ereditano source/zone/type/reason/notes/metadata/buffer dalla sorgente; ritorno + grants', () => {
  assert.match(MIG, /select v_src\.campaign_id, v_src\.zone_id, v_src\.adjustment_type, g, v_src\.reason, v_src\.notes,\s*\n\s*v_src\.metadata, v_uid, v_src\.source, v_src\.line_buffer_m, now\(\), v_uid/);
  assert.match(MIG, /'revoked_id', v_src\.id,\s*\n\s*'source', v_src\.source,\s*\n\s*'zone_id', v_src\.zone_id,\s*\n\s*'created_count', v_created,\s*\n\s*'discarded', v_discarded,\s*\n\s*'created_ids', pg_catalog\.to_jsonb\(v_created_ids\)/);
  assert.match(MIG, /alter function public\.admin_split_coverage_adjustment\(uuid, jsonb, text\) set statement_timeout = '300s';/);
  assert.match(MIG, /grant execute on function public\.admin_split_coverage_adjustment\(uuid, jsonb, text\) to authenticated, service_role;/);
  // 0 residui validi = revoca completa accettabile (nessun raise)
  assert.doesNotMatch(MIG, /raise exception 'NESSUN_RESIDUO/i);
});

test('MIG-C — non tocca gps_tracking_points/delivery_sessions né il batch automatico', () => {
  assert.doesNotMatch(MIG, /(insert|update|delete)[\s\S]{0,40}(gps_tracking_points|delivery_sessions)/i);
  assert.doesNotMatch(MIG, /admin_create_coverage_adjustments_batch/);
});

// ── API ──────────────────────────────────────────────────────────────
test('API — splitCoverageAdjustment chiama admin_split_coverage_adjustment con i residui', () => {
  assert.match(API, /export async function splitCoverageAdjustment\(\{ adjustmentId, residualLines, reason = 'admin_partial_erase' \}\)/);
  assert.match(API, /callCoverageRpc\('admin_split_coverage_adjustment', \{\s*\n\s*p_adjustment_id: adjustmentId,\s*\n\s*p_residual_lines: residualLines,\s*\n\s*p_reason: reason,/);
});

// ── B. HIT-TEST ─────────────────────────────────────────────────────
test('PANEL-B — hit-test righe salvate: tolleranza LINE_TOL_M, TUTTI i rami di MultiLineString/(Multi)Polygon', () => {
  const fn = PANEL.slice(PANEL.indexOf('const eraseNearest'), PANEL.indexOf('const handleSplitAdjustment'));
  // tolleranza = LINE_TOL_M (>= 30 m), NON piu' bare ERASE_RADIUS_M
  assert.match(fn, /let bestAdj = null; let bestAdjD = LINE_TOL_M;/);
  assert.match(fn, /const LINE_TOL_M = Math\.max\(ERASE_RADIUS_M, 30\);/);
  // MultiLineString: ogni ramo
  assert.match(fn, /else if \(g\?\.type === 'MultiLineString'\) \{\s*\n\s*\(g\.coordinates \|\| \[\]\)\.forEach\(\(seg\) => rings\.push/);
  // MultiPolygon: ogni anello di ogni poligono
  assert.match(fn, /else if \(g\?\.type === 'MultiPolygon'\) \{\s*\n\s*\(g\.coordinates \|\| \[\]\)\.forEach\(\(poly\) => \(poly \|\| \[\]\)\.forEach\(\(r\) => rings\.push/);
  assert.match(fn, /for \(const line of rings\) \{\s*\n\s*const d = pointToPolylineMeters\(pt, line\);/);
  // messaggio non tecnico
  assert.match(fn, /GOMMA: nessuna correzione entro il raggio\. Zooma o clicca più vicino/);
});

// ── C. GOMMA PARZIALE — wiring frontend ─────────────────────────────
test('PANEL-C — eraseNearest: linea salvata -> split geometrico + handleSplitAdjustment; poligono -> revoca', () => {
  const fn = PANEL.slice(PANEL.indexOf('const eraseNearest'), PANEL.indexOf('const handleSplitAdjustment'));
  assert.match(fn, /if \(g\?\.type === 'LineString' \|\| g\?\.type === 'MultiLineString'\) \{/);
  assert.match(fn, /const pieces = splitPolylineByCircle\(sub, pt, ERASE_RADIUS_M\);/);
  assert.match(fn, /if \(pieces\.length === 1 && pieces\[0\]\.length === sub\.length\) \{\s*\n\s*residuals\.push\(sub\);/);
  assert.match(fn, /if \(!touched\) \{\s*\n\s*setFormError\('GOMMA: il cerchio non interseca questo tratto\. Zooma o clicca più vicino\.'\);/);
  assert.match(fn, /handleSplitAdjustment\(bestAdj, residuals\); \/\/ residuals=\[\] -> revoca completa/);
  assert.match(fn, /handleRevoke\(bestAdj\);\s*\n\s*return;/);
});

test('PANEL-C — handleSplitAdjustment: guardie, ottimista, residui GeoJSON, CORREZIONE_GIA_REVOCATA graceful, load() finale, una sola RPC', () => {
  const fn = PANEL.slice(PANEL.indexOf('const handleSplitAdjustment = async'), PANEL.indexOf('const applyAutoSelectionFromCache'));
  assert.match(fn, /if \(!adjustment\?\.id \|\| adjustment\.revoked_at\) return;/);
  assert.match(fn, /const residualLines = \(residualLatLngs \|\| \[\]\)\s*\n\s*\.filter\(\(l\) => Array\.isArray\(l\) && l\.length >= 2\)\s*\n\s*\.map\(\(l\) => latLngsToLineStringGeoJson\(l\)\);/);
  assert.match(fn, /setAdjustments\(\(prev\) => prev\.map\(\(a\) => \(/);
  assert.match(fn, /if \(editingId === adjustment\.id\) cancelCorrecting\(\);/);
  assert.match(fn, /await splitCoverageAdjustment\(\{\s*\n\s*adjustmentId: adjustment\.id,\s*\n\s*residualLines,\s*\n\s*reason: draftNotes\.trim\(\) \|\| 'admin_partial_erase',/);
  assert.match(fn, /if \(!\/CORREZIONE_GIA_REVOCATA\/i\.test\(err\?\.message \|\| ''\)\) \{/);
  assert.match(fn, /\} finally \{\s*\n\s*await load\(\);/);
  // niente loop di RPC per segmento
  assert.equal((fn.match(/splitCoverageAdjustment\(/g) || []).length, 1);
});

// ── A / E. MATITA — source manual_verified + operator metadata ─────
test('PANEL-A/E — matita: salva via batch con source (=sourceLevel) + operator_id/assignment_id nel metadata', () => {
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke ='));
  // metadata con operatore reale (Fenice = selectedOperator)
  assert.match(save, /const metadata = \{ operator_key: selectedOperatorKey, operator_id: selectedOperator\?\.operatorId \|\| null, assignment_id: selectedOperator\?\.assignmentId \|\| null, admin_operator: true \}/);
  // il batch riceve source (= sourceLevel: manual_verified se non si e' caricato l'automatico) + metadata
  assert.match(save, /createCoverageAdjustmentsBatch\(\{[\s\S]{0,300}source,[\s\S]{0,120}metadata,[\s\S]{0,120}adjustmentType: 'manual_covered',/);
  // default: manual_verified (non confuso con automatic_verified)
  assert.match(PANEL, /defaultSourceLevel = 'manual_verified'/);
  assert.match(PANEL, /const source = sourceLevel;/);
});

test('PANEL-E — colore operatore stabile: manualOperatorColor -> getOperatorColor(operator_key)', () => {
  assert.match(PANEL, /function manualOperatorColor\(operatorKey\) \{[\s\S]{0,220}return getOperatorColor\(operatorKey\)/);
  // i residui della gomma parziale ereditano il metadata (quindi operator_key)
  // dalla sorgente: vedi MIG-C (v_src.metadata). Qui il rendering usa
  // adj.metadata?.operator_key per il colore.
  assert.match(PANEL, /adj\.metadata\?\.operator_key/);
});

// ── regressione: batch automatico invariato ────────────────────────
test('NR — il salvataggio batch automatic_verified resta invariato', () => {
  assert.match(PANEL, /await createCoverageAdjustmentsBatch\(\{/);
  assert.doesNotMatch(MIG, /admin_create_coverage_adjustments_batch/);
});
