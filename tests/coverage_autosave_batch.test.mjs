// FIX AUTOSAVE — salvataggio ATOMICO della copertura automatica.
//
// Bug reale (campagna 7406e420-9999-409c-88a9-e15a81353e35): 2474 vie salvate
// con 2474 RPC sequenziali; il loop si interrompeva dopo ~62 inserimenti
// lasciando committato solo 9.09 km su 257.17. Fix: una sola RPC batch
// atomica (migration 20260831120000) + payload unico dal frontend.
//
// Test di CONTRATTO SORGENTE (nessuna DB in questo runner): si verifica il
// testo di migration + frontend. Le prove runtime (batch 2474, linea invalida,
// errore mid-save, no partial commit, retry, reload) restano da eseguire
// sull'app autenticata.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIG = read('supabase/migrations/20260831120000_coverage_adjustments_batch.sql');
const API = read('src/lib/services/coverage-adjustments-api.js');
const PANEL = read('src/components/admin/CoverageAdjustmentPanel.jsx');
// RPC singola esistente (invariata): serve a verificare che NON condivida
// stato con la modalita' batch.
const V2_MIG = read('supabase/migrations/20260830090000_verified_coverage_line_and_source.sql');
const SINGLE_RPC = V2_MIG.slice(
  V2_MIG.indexOf('create or replace function public.admin_create_coverage_adjustment('),
  V2_MIG.indexOf('-- 4. admin_update_coverage_adjustment'),
);

// ── 1. MIGRATION: la RPC batch esiste ed è atomica ─────────────────────
test('MIG — admin_create_coverage_adjustments_batch: SECURITY DEFINER, gate admin, search_path vuoto', () => {
  assert.match(MIG, /create or replace function public\.admin_create_coverage_adjustments_batch\(/);
  assert.match(MIG, /language plpgsql security definer set search_path to ''/);
  assert.match(MIG, /if not public\.gps_is_admin\(\) then\s*\n\s*raise exception 'ADMIN_NON_AUTORIZZATO'/);
  assert.match(MIG, /begin;[\s\S]*commit;/);
});

test('MIG — validazioni scalari PRIMA di qualunque INSERT (fail-fast, 0 righe)', () => {
  const head = MIG.slice(MIG.indexOf('if not public.gps_is_admin'), MIG.indexOf('-- 3) VALIDA'));
  assert.match(head, /p_source not in \('manual_verified', 'automatic_verified'\)[\s\S]{0,60}SOURCE_NON_VALIDA/);
  assert.match(head, /p_adjustment_type not in \('manual_covered', 'partially_covered'\)[\s\S]{0,60}TIPO_CORREZIONE_NON_VALIDO/);
  assert.match(head, /v_reason = ''[\s\S]{0,40}MOTIVO_OBBLIGATORIO/);
  assert.match(head, /v_buffer <= 0 or v_buffer > 60[\s\S]{0,40}LINE_BUFFER_NON_VALIDO/);
  assert.match(head, /pg_catalog\.jsonb_typeof\(p_lines\) <> 'array'[\s\S]{0,60}LINES_PAYLOAD_NON_VALIDO/);
  assert.match(head, /CAMPAGNA_NON_TROVATA/);
});

test('MIG — filtra le geometrie invalide PRIMA del commit e le CONTA (discarded)', () => {
  const filt = MIG.slice(MIG.indexOf('-- 2.3) VALIDA'), MIG.indexOf('-- 2.4)'));
  // try/catch attorno a ST_GeomFromGeoJSON: una geojson malformata NON alza
  assert.match(filt, /begin\s*\n\s*v_geom := public\.ST_MakeValid\(public\.ST_SetSRID\(public\.ST_GeomFromGeoJSON\(v_geo::text\), 4326\)\);\s*\n\s*exception when others then\s*\n\s*v_geom := null;/);
  // scartata: geom null/vuota
  assert.match(filt, /if v_geom is null or public\.ST_IsEmpty\(v_geom\) then\s*\n\s*v_discarded := v_discarded \+ 1;/);
  // scartata: tipo non lineare o < 2 punti
  assert.match(filt, /v_gtype not in \('LINESTRING', 'MULTILINESTRING'\) or public\.ST_NPoints\(v_geom\) < 2/);
  // conteggio + indici scartati
  assert.match(filt, /v_discarded_idx := pg_catalog\.array_append\(v_discarded_idx, v_idx\)/);
  // zero valide -> errore (nessuna riga)
  assert.match(MIG, /if pg_catalog\.array_length\(v_valid_geoms, 1\) is null then\s*\n\s*raise exception 'NESSUNA_GEOMETRIA_VALIDA/);
});

test('MIG — INSERT ATOMICO: una sola statement INSERT ... SELECT unnest + _log nella stessa CTE', () => {
  // un solo INSERT nella tabella principale (dentro il WITH)
  assert.equal((MIG.match(/insert into public\.campaign_coverage_adjustments\b(?!_log)/g) || []).length, 1);
  assert.match(MIG, /with ins as \(\s*\n\s*insert into public\.campaign_coverage_adjustments\b/);
  assert.match(MIG, /from pg_catalog\.unnest\(v_valid_geoms, v_valid_zones\) as t\(g, z\)/);
  // il log è scritto nella STESSA transazione, per tutte le righe inserite
  assert.match(MIG, /logged as \(\s*\n\s*insert into public\.campaign_coverage_adjustments_log/);
  assert.match(MIG, /select id, campaign_id, zone_id, 'created', adjustment_type, reason, notes,\s*\n\s*public\.ST_AsGeoJSON\(geometry\)::jsonb, v_uid\s*\n\s*from ins/);
  // NIENTE loop di INSERT per riga
  assert.doesNotMatch(MIG, /for .* in .*loop[\s\S]*insert into public\.campaign_coverage_adjustments\b(?!_log)/);
});

test('MIG — flag TRANSAZIONE-LOCALE (no ALTER TABLE DISABLE TRIGGER), sync 1x/zona', () => {
  // NIENTE statement DDL che disabilita/riabilita fisicamente un trigger
  // (interferirebbe con la concorrenza). Ancorato a inizio riga: i commenti
  // che citano "ALTER TABLE ... DISABLE TRIGGER" iniziano con '--'.
  assert.doesNotMatch(MIG, /^\s*alter table .*(disable|enable) trigger/im);
  // flag LOCAL impostato e poi azzerato, entrambi con set_config(..., true)
  assert.match(MIG, /perform pg_catalog\.set_config\('app\.coverage_batch_mode', '1', true\);/);
  assert.match(MIG, /perform pg_catalog\.set_config\('app\.coverage_batch_mode', '', true\);/);
  // il flag '1' viene impostato PRIMA dell'INSERT, azzerato DOPO
  assert.ok(
    MIG.indexOf("set_config('app.coverage_batch_mode', '1', true)")
      < MIG.indexOf('with ins as (')
    && MIG.indexOf('with ins as (')
      < MIG.indexOf("set_config('app.coverage_batch_mode', '', true)"),
    'ordine: flag=1  ->  INSERT  ->  flag=""',
  );
  // sync UNA volta per zona toccata, dopo l'INSERT
  assert.match(MIG, /for v_z in select distinct z from pg_catalog\.unnest\(v_valid_zones\) as z where z is not null\s*\n\s*loop\s*\n\s*perform public\.sync_campaign_zone_progress_cache\(v_z, v_uid\);/);
  // timeout esteso a livello di FUNZIONE (non solo set_config nel body)
  assert.match(MIG, /alter function public\.admin_create_coverage_adjustments_batch\([^)]*\)\s*\n\s*set statement_timeout = '300s';/);
});

test('MIG — trigger sync: guardia batch LOCAL, comportamento normale fuori dal batch', () => {
  const trg = MIG.slice(
    MIG.indexOf('create or replace function public.campaign_coverage_adjustments_sync_trigger'),
    MIG.indexOf('-- 2. RPC batch atomica'),
  );
  // create or replace della trigger function (nessun DROP/CREATE TRIGGER)
  assert.match(trg, /create or replace function public\.campaign_coverage_adjustments_sync_trigger\(\)/);
  assert.doesNotMatch(MIG, /create (or replace )?trigger|drop trigger/i);
  // legge il flag con missing_ok=true (NULL se mai impostato) e salta SOLO se '1'
  assert.match(trg, /if pg_catalog\.current_setting\('app\.coverage_batch_mode', true\) = '1' then\s*\n\s*return new;\s*\n\s*end if;/);
  // fuori dal batch: comportamento identico a prima (sync per riga)
  assert.match(trg, /if new\.zone_id is not null then\s*\n\s*perform public\.sync_campaign_zone_progress_cache\(new\.zone_id, pg_catalog\.coalesce\(new\.updated_by, new\.created_by\)\);/);
});

test('CONCORRENZA — batch + createCoverageAdjustment normale non condividono lo stato del trigger', () => {
  // Il flag e' SET LOCAL: vive SOLO nella transazione della RPC batch.
  // admin_create_coverage_adjustment (singola, invariata) non lo imposta ->
  // in una transazione concorrente current_setting('app.coverage_batch_mode',
  // true) e' NULL -> il trigger esegue il sync per-riga come sempre.
  assert.doesNotMatch(SINGLE_RPC, /app\.coverage_batch_mode/);
  // nessuno statement ALTER TABLE ... TRIGGER (righe di codice, non commenti)
  assert.doesNotMatch(MIG, /^\s*alter table .*trigger/im);
  // il flag non e' mai impostato a livello sessione/db/ruolo (solo LOCAL)
  assert.doesNotMatch(MIG, /set_config\('app\.coverage_batch_mode', '[^']*', false\)/);
  assert.doesNotMatch(MIG, /alter (database|role)[\s\S]{0,80}coverage_batch_mode/i);
  assert.doesNotMatch(MIG, /\bset\s+app\.coverage_batch_mode\b(?!.*local)/i);
});

test('MIG — ritorna received/inserted/discarded/discarded_indexes; source/type coerenti; grants', () => {
  assert.match(MIG, /'received', v_received,\s*\n\s*'inserted', v_inserted,\s*\n\s*'discarded', v_discarded,\s*\n\s*'discarded_indexes', pg_catalog\.to_jsonb\(v_discarded_idx\)/);
  assert.match(MIG, /p_source, v_buffer, now\(\), v_uid/); // source + buffer persistiti
  assert.match(MIG, /grant execute on function public\.admin_create_coverage_adjustments_batch\([^)]*\) to authenticated, service_role;/);
  assert.match(MIG, /alter function public\.admin_create_coverage_adjustments_batch\([^)]*\) owner to postgres;/);
});

test('MIG — NON ridefinisce calculate_campaign_final_coverage né tocca gps_tracking_points', () => {
  assert.doesNotMatch(MIG, /create (or replace )?function public\.calculate_campaign_final_coverage/i);
  assert.doesNotMatch(MIG, /(insert|update|delete)[\s\S]{0,40}gps_tracking_points/i);
  assert.doesNotMatch(MIG, /(insert|update|delete)[\s\S]{0,40}delivery_sessions/i);
});

// ── 2. API client ─────────────────────────────────────────────────────
test('API — createCoverageAdjustmentsBatch chiama la RPC batch con p_lines', () => {
  assert.match(API, /export async function createCoverageAdjustmentsBatch\(\{/);
  assert.match(API, /callCoverageRpc\('admin_create_coverage_adjustments_batch', \{/);
  assert.match(API, /p_lines: lines,/);
  assert.match(API, /p_source: source,/);
  assert.match(API, /p_line_buffer_m: lineBufferM,/);
});

// ── 3. FRONTEND handleSave ────────────────────────────────────────────
test('PANEL — handleSave: UNA sola RPC batch per le linee, nessun loop per-via', () => {
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke = async'));
  assert.match(save, /const linesPayload = draftLines\.map\(\(line\) => \(\{\s*\n\s*geometry: latLngsToLineStringGeoJson\(line\),\s*\n\s*zone_id: autoLineOwnership\.get\(line\) \?\? zones\[0\]\?\.id \?\? null,/);
  assert.match(save, /await createCoverageAdjustmentsBatch\(\{/);
  assert.equal((save.match(/createCoverageAdjustmentsBatch\(/g) || []).length, 1);
  assert.doesNotMatch(save, /for \(const line of draftLines\)/);
});

test('PANEL — su errore batch: draft mantenuto (nessun cancelCorrecting nel catch)', () => {
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke = async'));
  // cancelCorrecting() + load() SOLO nel percorso di successo (dopo il batch),
  // mai nel catch.
  const tail = save.slice(save.lastIndexOf('createCoverageAdjustmentsBatch'));
  assert.match(tail, /cancelCorrecting\(\);\s*\n\s*await load\(\);/);
  // il catch del ramo "nuova correzione" (l'ultimo del handleSave) NON esegue
  // cancelCorrecting/load -> il draft resta in UI.
  const lastCatch = save.slice(save.lastIndexOf('} catch (err) {'));
  assert.doesNotMatch(lastCatch, /cancelCorrecting\(\)|await load\(\)/);
  assert.match(lastCatch, /setFormError\(err\?\.message \|\| 'Salvataggio non riuscito\.'\)/);
});

test('PANEL — esito batch mostrato (inserite / scartate), source automatic_verified preservato', () => {
  assert.match(PANEL, /const \[lastBatchSave, setLastBatchSave\] = useState\(null\);/);
  assert.match(PANEL, /setLastBatchSave\(\{\s*\n\s*inserted: Number\(res\?\.inserted \|\| 0\),\s*\n\s*discarded: Number\(res\?\.discarded \|\| 0\),/);
  assert.match(PANEL, /Salvataggio automatico: \{lastBatchSave\.inserted\} linee salvate \(transazione unica\)/);
  assert.match(PANEL, /\$\{lastBatchSave\.discarded\} scartate perché geometria non valida/);
  // la generazione automatica imposta ancora source='automatic_verified'
  assert.match(PANEL, /setSourceLevel\('automatic_verified'\)/);
  // e il batch riceve source (= sourceLevel) + type manual_covered
  const save = PANEL.slice(PANEL.indexOf('const handleSave = async'), PANEL.indexOf('const handleRevoke = async'));
  assert.match(save, /createCoverageAdjustmentsBatch\(\{[\s\S]{0,260}source,[\s\S]{0,120}adjustmentType: 'manual_covered',/);
});
