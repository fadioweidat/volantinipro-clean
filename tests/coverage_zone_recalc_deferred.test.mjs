// TIMEOUT DOPO GOMMA — il ricalcolo pesante della copertura zona e' SEPARATO
// dall'edit geometrico (migration 20260831140000).
//
// Runtime (campagna 7406e420-9999-409c-88a9-e15a81353e35, ~2474 righe
// automatic_verified): la Gomma modificava davvero la copertura ma
// "canceling statement due to statement timeout" arrivava DOPO
// admin_split_coverage_adjustment, nella sync finale
// (sync_campaign_zone_progress_cache -> calculate_zone_final_coverage:
// ST_UnaryUnion(ST_Collect(ST_Buffer(...))) su ~2474 geometrie). Il
// timeout a livello di funzione (300s) non basta: il gateway PostgREST
// chiude la richiesta prima e l'INTERA transazione dell'edit farebbe
// rollback.
//
// FIX (Strategia C): il trigger e admin_split_coverage_adjustment marcano
// la zona dirty (campaign_zone_progress.stale_since, UPDATE O(1)) e
// ritornano subito; il ricalcolo pesante vive in admin_recalc_zone_coverage,
// chiamata dal frontend DOPO l'edit, best-effort. Un timeout li' NON
// annulla l'edit gia' committato.
//
// Test di CONTRATTO SORGENTE (nessuna DB in questo runner). Le prove
// runtime (gomma su automatic_verified, nessun timeout, reload, durata
// riportata) restano da eseguire sull'app autenticata.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIG = read('supabase/migrations/20260831140000_coverage_zone_recalc_deferred.sql');
const API = read('src/lib/services/coverage-adjustments-api.js');
const PANEL = read('src/components/admin/CoverageAdjustmentPanel.jsx');

// ── 1. marcatore stale_since ─────────────────────────────────────────
test('MIG — campaign_zone_progress.stale_since aggiunto in modo idempotente', () => {
  assert.match(MIG, /alter table public\.campaign_zone_progress\s*\n\s*add column if not exists stale_since timestamptz;/);
  assert.match(MIG, /begin;[\s\S]*commit;/);
});

// ── 2. trigger: solo mark-dirty, niente ST_UnaryUnion nell'edit ──────
test('MIG — trigger di sync: marca la zona dirty (UPDATE O(1)), NON chiama piu\' sync_campaign_zone_progress_cache', () => {
  const trg = MIG.slice(
    MIG.indexOf('create or replace function public.campaign_coverage_adjustments_sync_trigger'),
    MIG.indexOf('-- 3. admin_split_coverage_adjustment'),
  );
  // guardia batch invariata
  assert.match(trg, /if pg_catalog\.current_setting\('app\.coverage_batch_mode', true\) = '1' then\s*\n\s*return new;\s*\n\s*end if;/);
  // marca dirty via upsert indicizzato
  assert.match(trg, /insert into public\.campaign_zone_progress \(campaign_zone_id, campaign_id, source, stale_since\)\s*\n\s*values \(new\.zone_id, new\.campaign_id, 'geometric', now\(\)\)\s*\n\s*on conflict \(campaign_zone_id\) do update set stale_since = now\(\);/);
  // il ricalcolo pesante NON e' piu' nel trigger
  assert.doesNotMatch(trg, /sync_campaign_zone_progress_cache/);
  assert.doesNotMatch(trg, /calculate_zone_final_coverage/);
});

// ── 3. admin_split_coverage_adjustment: nessuna sync pesante nella request ──
test('MIG — admin_split_coverage_adjustment: marca la zona dirty, NON esegue la sync pesante nella stessa request', () => {
  const splitFn = MIG.slice(
    MIG.indexOf('create or replace function public.admin_split_coverage_adjustment'),
    MIG.indexOf('-- 4. admin_recalc_zone_coverage'),
  );
  // corpo geometrico invariato: revoca sorgente + INSERT residui (unnest)
  assert.match(splitFn, /update public\.campaign_coverage_adjustments\s*\n\s*set revoked_at = now\(\), revoked_by = v_uid/);
  assert.match(splitFn, /from pg_catalog\.unnest\(v_valid_geoms\) as g/);
  // flag transazione-locale invariato
  assert.match(splitFn, /perform pg_catalog\.set_config\('app\.coverage_batch_mode', '1', true\);/);
  assert.match(splitFn, /perform pg_catalog\.set_config\('app\.coverage_batch_mode', '', true\);/);
  // passo 3: MARK DIRTY, non sync
  assert.match(splitFn, /insert into public\.campaign_zone_progress \(campaign_zone_id, campaign_id, source, stale_since\)\s*\n\s*values \(v_src\.zone_id, v_src\.campaign_id, 'geometric', now\(\)\)\s*\n\s*on conflict \(campaign_zone_id\) do update set stale_since = now\(\);/);
  assert.doesNotMatch(splitFn, /perform public\.sync_campaign_zone_progress_cache/);
  // ritorno segnala il ricalcolo pendente
  assert.match(splitFn, /'zone_recalc_pending', v_src\.zone_id is not null/);
  // niente ALTER TABLE ... TRIGGER
  assert.doesNotMatch(MIG, /^\s*alter table .*(disable|enable) trigger/im);
});

test('MIG — admin_split_coverage_adjustment: timeout ridotto (RPC ora leggera), owner/grant coerenti', () => {
  assert.match(MIG, /alter function public\.admin_split_coverage_adjustment\(uuid, jsonb, text\) set statement_timeout = '60s';/);
  assert.doesNotMatch(MIG, /alter function public\.admin_split_coverage_adjustment\(uuid, jsonb, text\) set statement_timeout = '300s';/);
});

// ── 4. admin_recalc_zone_coverage: il ricalcolo PESANTE, separato ────
test('MIG — admin_recalc_zone_coverage: SECURITY DEFINER, gate admin, esegue la sync pesante e azzera stale_since', () => {
  const fn = MIG.slice(
    MIG.indexOf('create or replace function public.admin_recalc_zone_coverage'),
    MIG.indexOf('commit;'),
  );
  assert.match(fn, /create or replace function public\.admin_recalc_zone_coverage\(p_campaign_zone_id uuid\)\s*\n\s*returns jsonb\s*\n\s*language plpgsql security definer set search_path to ''/);
  assert.match(fn, /if not public\.gps_is_admin\(\) then\s*\n\s*raise exception 'ADMIN_NON_AUTORIZZATO'/);
  assert.match(fn, /perform public\.sync_campaign_zone_progress_cache\(p_campaign_zone_id, v_uid\);/);
  assert.match(fn, /update public\.campaign_zone_progress set stale_since = null where campaign_zone_id = p_campaign_zone_id;/);
  // durata riportata
  assert.match(fn, /'duration_ms', pg_catalog\.round\(pg_catalog\.extract\(epoch from \(pg_catalog\.clock_timestamp\(\) - v_started\)\) \* 1000\)::int/);
  // timeout ampio SOLO su questa funzione separata + grants
  assert.match(MIG, /alter function public\.admin_recalc_zone_coverage\(uuid\) set statement_timeout = '600s';/);
  assert.match(MIG, /grant execute on function public\.admin_recalc_zone_coverage\(uuid\) to authenticated, service_role;/);
});

// ── 5. NON tocca cio' che deve restare invariato ────────────────────
test('MIG — non ridefinisce calculate_campaign_final_coverage / calculate_zone_final_coverage / il batch automatico', () => {
  assert.doesNotMatch(MIG, /(create|alter) (or replace )?function public\.calculate_campaign_final_coverage/i);
  assert.doesNotMatch(MIG, /create (or replace )?function public\.calculate_zone_final_coverage/i);
  assert.doesNotMatch(MIG, /create (or replace )?function public\.sync_campaign_zone_progress_cache\b/i);
  assert.doesNotMatch(MIG, /admin_create_coverage_adjustments_batch/);
  assert.doesNotMatch(MIG, /(insert|update|delete)[\s\S]{0,40}(gps_tracking_points|delivery_sessions)/i);
});

// ── 6. API client ──────────────────────────────────────────────────
test('API — recalcZoneCoverage chiama admin_recalc_zone_coverage', () => {
  assert.match(API, /export async function recalcZoneCoverage\(\{ campaignZoneId \}\)/);
  assert.match(API, /callCoverageRpc\('admin_recalc_zone_coverage', \{\s*\n\s*p_campaign_zone_id: campaignZoneId,\s*\n\s*\}\);/);
});

// ── 7. frontend: edit -> load -> recalc best-effort -> load ─────────
test('PANEL — recalcZonesAfterEdit: best-effort, dedup, timeout NON propaga (try/catch interno), zoneRecalcPending', () => {
  assert.match(PANEL, /import \{[\s\S]{0,400}\brecalcZoneCoverage,[\s\S]{0,160}\} from '\.\.\/\.\.\/lib\/services\/coverage-adjustments-api\.js';/);
  assert.match(PANEL, /const \[zoneRecalcPending, setZoneRecalcPending\] = useState\(false\);/);
  const fn = PANEL.slice(PANEL.indexOf('const recalcZonesAfterEdit = async'), PANEL.indexOf('const handleSplitAdjustment = async'));
  assert.match(fn, /const ids = \[\.\.\.new Set\(\(zoneIds \|\| \[\]\)\.filter\(Boolean\)\)\];/);
  assert.match(fn, /setZoneRecalcPending\(true\);/);
  assert.match(fn, /await recalcZoneCoverage\(\{ campaignZoneId: id \}\);/);
  // un fallimento del ricalcolo NON viene rilanciato
  assert.match(fn, /\} catch \{\s*\n\s*\/\* zona resta dirty[\s\S]{0,80}\*\/\s*\n\s*\}/);
  assert.match(fn, /\} finally \{\s*\n\s*setZoneRecalcPending\(false\);/);
});

test('PANEL — Gomma parziale: split RPC prima, POI recalc separato (edit gia\' committato)', () => {
  const fn = PANEL.slice(PANEL.indexOf('const handleSplitAdjustment = async'), PANEL.indexOf('const applyAutoSelectionFromCache'));
  // la split RPC resta una sola
  assert.equal((fn.match(/splitCoverageAdjustment\(/g) || []).length, 1);
  // ordine nel finally: load -> recalc -> load
  assert.match(fn, /\} finally \{\s*\n\s*await load\(\);\s*\n\s*\/\/[^\n]*\n\s*await recalcZonesAfterEdit\(\[adjustment\.zone_id, \.\.\.zones\.map\(\(z\) => z\.id\)\]\);\s*\n\s*await load\(\);/);
});

test('PANEL — Revoca e Modifica: stesso ricalcolo differito dopo l\'edit', () => {
  const rev = PANEL.slice(PANEL.indexOf('const handleRevoke = async'), PANEL.indexOf('const activeAdjustments ='));
  assert.match(rev, /await recalcZonesAfterEdit\(\[adjustment\.zone_id, \.\.\.zones\.map\(\(z\) => z\.id\)\]\);/);
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke = async'));
  assert.match(save, /cancelCorrecting\(\);\s*\n\s*await load\(\);\s*\n\s*await recalcZonesAfterEdit\(zones\.map\(\(z\) => z\.id\)\);\s*\n\s*await load\(\);/);
});

// ── 8. FIX UI — messaggio coerente con la Gomma ────────────────────
test('PANEL — in modalita\' Gomma NON mostra il messaggio del disegno', () => {
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke = async'));
  // guardia erase PRIMA del check "Disegna almeno un'area o un tratto..."
  assert.match(save, /if \(tool === 'erase'\) \{\s*\n\s*setFormError\('Seleziona una parte del tratto da rimuovere\.'\);\s*\n\s*return;\s*\n\s*\}/);
  assert.ok(
    save.indexOf("if (tool === 'erase') {")
      < save.indexOf("Disegna almeno un\\'area o un tratto"),
    'la guardia erase precede il messaggio di disegno',
  );
});

test('PANEL — indicatore "ricalcolo in corso" visibile quando zoneRecalcPending', () => {
  assert.match(PANEL, /\{zoneRecalcPending && \(/);
  assert.match(PANEL, /Ricalcolo della copertura della zona in corso/);
});
