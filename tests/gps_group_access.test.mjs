import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const migA = read('supabase/migrations/20260829170000_driver_group_access_model.sql');
const migB = read('supabase/migrations/20260829180000_gps_driver_rpc_v3.sql');
const gpsApi = read('src/lib/services/gps-api.js');
const adminApi = read('src/lib/services/admin-api.js');
const mainJsx = read('src/main.jsx');
const joinPage = read('src/pages/driver/DriverGroupJoinPage.jsx');
const groupDetail = read('src/pages/admin/CampaignGroupDetail.jsx');

// ---------------------------------------------------------------------------
// 1. Migrazione A — modello dati + driver_group_join
// ---------------------------------------------------------------------------

test('migA: tabelle group access + operator_id nullable, nessuna operazione distruttiva', () => {
  assert.match(migA, /^begin;/m);
  assert.match(migA, /^commit;/m);
  assert.match(migA, /create table if not exists public\.driver_group_access_links/);
  assert.match(migA, /create table if not exists public\.driver_group_participants/);
  assert.match(migA, /alter table public\.operator_assignments alter column operator_id drop not null/);
  assert.match(migA, /token_hash text not null unique/);            // token hashato, unico
  assert.match(migA, /unique \(group_access_link_id, device_installation_id\)/); // stesso device = stesso participant
  assert.doesNotMatch(migA, /drop table|truncate|delete from|db reset|db push|drop function/i);
});

test('migA: driver_group_join e\' l\'UNICA porta del group token, hash sha256, SECURITY DEFINER', () => {
  assert.match(migA, /create or replace function public\.driver_group_join\(\s*p_group_token text,\s*p_device_id text,\s*p_display_name text/);
  assert.match(migA, /security definer/i);
  assert.match(migA, /set search_path to ''/);
  assert.match(migA, /encode\(extensions\.digest\(btrim\(p_group_token\), 'sha256'\), 'hex'\)/);
  // limiti + scadenza + disambiguazione nomi
  assert.match(migA, /GROUP_LINK_PIENO/);
  assert.match(migA, /GROUP_LINK_SCADUTO/);
  assert.match(migA, /GROUP_LINK_REVOCATO/);
  assert.match(migA, /NOME_OPERATIVO_OBBLIGATORIO/);
  // token personale = access_token DEFAULT della colonna operator_assignments
  assert.match(migA, /insert into public\.operator_assignments \([\s\S]*?operator_id[\s\S]*?\) values \(\s*null,/);
  // grant: aperto da device non loggato (come il link personale)
  assert.match(migA, /grant execute on function public\.driver_group_join\(text, text, text\) to anon, authenticated/);
});

test('migA: RPC Admin link gruppo sono admin-only, token raw ritornato una volta', () => {
  for (const fn of ['admin_create_group_access_link', 'admin_revoke_group_access_link', 'admin_get_group_access_link']) {
    assert.match(migA, new RegExp(`function public\\.${fn}`));
  }
  assert.match(migA, /raise exception 'SOLO_ADMIN'/);
  assert.match(migA, /gps_is_admin\(\)/);
  assert.match(migA, /v_token := encode\(extensions\.gen_random_bytes\(24\), 'hex'\)/);
  // il DB salva solo l'hash
  assert.match(migA, /token_hash,[\s\S]{0,120}encode\(extensions\.digest\(v_token, 'sha256'\)/);
  assert.doesNotMatch(migA, /grant execute on function public\.admin_create_group_access_link[\s\S]*?to anon/);
});

test('migA: funzioni esistenti resE participant-aware (operator_id NULL non rompe)', () => {
  // log_assignment_event: assignment_event_log.operator_id e' NOT NULL ->
  // per un participant deve inserire coalesce(operator_id, id), mai NULL.
  const logFn = migA.slice(migA.indexOf('create or replace function public.log_assignment_event'),
    migA.indexOf('alter function public.log_assignment_event'));
  assert.match(logFn, /v_identity := coalesce\(v_assignment\.operator_id, v_assignment\.id\)/);
  assert.doesNotMatch(logFn, /values \(p_assignment_id, v_assignment\.operator_id,/);
  assert.match(logFn, /values \(p_assignment_id, v_identity, v_assignment\.campaign_id/);
  // admin_list_campaign_assignments: participant senza display_name -> mostra participant_label
  const listFn = migA.slice(migA.indexOf('create or replace function public.admin_list_campaign_assignments'),
    migA.indexOf('alter function public.admin_list_campaign_assignments'));
  assert.match(listFn, /coalesce\(op\.display_name, oa\.participant_label, oa\.operator_id::text\)/);
  assert.match(listFn, /left join public\.operator_profiles op/);
  assert.match(listFn, /left join public\.profiles p/);
});

// ---------------------------------------------------------------------------
// 2. Migrazione B — RPC _v3 (identita' = coalesce(operator_id, id))
// ---------------------------------------------------------------------------

test('migB: _v3 create, v1/v2 intatte, identita participant', () => {
  assert.match(migB, /^begin;/m);
  assert.match(migB, /^commit;/m);
  assert.doesNotMatch(migB, /drop function|drop table|truncate|delete from|db reset|db push/i);
  for (const fn of ['gps_start_session_v3', 'gps_insert_point_v3', 'gps_transition_session_v3',
    'get_active_driver_session_v3', 'gps_transition_zone_v3', 'gps_heartbeat_session_v3']) {
    assert.match(migB, new RegExp(`create or replace function public\\.${fn}`), `${fn} deve essere creata`);
    assert.match(migB, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to anon, authenticated`), `${fn} deve essere anon+authenticated`);
  }
  // identita' unificata
  assert.match(migB, /coalesce\(v_assignment\.operator_id, v_assignment\.id\)/);
  assert.match(migB, /coalesce\(a\.operator_id, a\.id\)/);
  // validita' con LEFT JOIN operator_profiles (assignment anonime)
  assert.match(migB, /gps_assignment_is_valid_v2/);
  // blocchi server-side invariati
  assert.match(migB, /raise exception 'PAUSED_SESSION'/);
  assert.match(migB, /raise exception 'SESSION_COMPLETED'/);
  assert.match(migB, /raise exception 'DEVICE_MISMATCH'/);
});

test('migB: gps_assignment_is_valid_v2 e\' un\'aggiunta (NON tocca la v1)', () => {
  assert.match(migA, /create or replace function public\.gps_assignment_is_valid_v2/);
  assert.match(migA, /left join public\.operator_profiles o on o\.user_id = a\.operator_id/);
  assert.match(migA, /a\.operator_id is null or \(o\.active and o\.disabled_at is null\)/);
  assert.doesNotMatch(migA, /create or replace function public\.gps_assignment_is_valid\(/); // la v1 NON viene ridefinita
  assert.doesNotMatch(migB, /create or replace function public\.gps_assignment_is_valid\(/);
});

test('migB: gps_transition_zone_v3 NON auto-completa la zona precedente su start', () => {
  const zoneFn = migB.slice(migB.indexOf('function public.gps_transition_zone_v3'), migB.indexOf('gps_heartbeat_session_v3'));
  // A differenza della v1: nessun "update campaign_zones set status='Completata'
  // where id = v_previous_zone_id" nel ramo start.
  assert.doesNotMatch(zoneFn, /set status = 'Completata'[\s\S]*?where id = v_previous_zone_id/);
  // Il ramo start deve solo riportare la zona target "In corso".
  assert.match(zoneFn, /if p_action = 'start' then[\s\S]*?set status = 'In corso'/);
});

test('migB: get_driver_group_tracking supporta participant (label + coalesce) senza PII', () => {
  const g = migB.slice(migB.indexOf('create or replace function public.get_driver_group_tracking'));
  assert.match(g, /coalesce\(a\.participant_label, 'Operatore ' \|\|/);
  assert.match(g, /s\.driver_id = v_identity/);
  for (const forbidden of ['driver_phone', 'device_id', 'access_token', 'email']) {
    assert.doesNotMatch(g, new RegExp(`jsonb_build_object\\([\\s\\S]*?'${forbidden}'`));
  }
});

// ---------------------------------------------------------------------------
// 3. Frontend gps-api — versioned fallback + driver_group_join
// ---------------------------------------------------------------------------

test('gps-api: callGpsRpcVersioned prova _v3 -> _v2 -> v1, fallback solo su "not found"/"permission denied"', () => {
  assert.match(gpsApi, /async function callGpsRpcVersioned\(specs\)/);
  assert.match(gpsApi, /if \(i < specs\.length - 1 && isRpcNotFound\(error\)\) continue;/);
  assert.match(gpsApi, /message\.includes\('permission denied for function'\)/);
  // insert/transition/getActive/start/zone/heartbeat -> _v3 in testa
  for (const v3 of ['gps_insert_point_v3', 'gps_transition_session_v3', 'get_active_driver_session_v3',
    'gps_start_session_v3', 'gps_transition_zone_v3', 'gps_heartbeat_session_v3']) {
    assert.match(gpsApi, new RegExp(`name: '${v3}'`), `${v3} deve essere provata per prima`);
  }
  // v1 resta nella catena (backward compat link personali)
  for (const v1 of ["name: 'gps_insert_point'", "name: 'gps_start_session'", "name: 'gps_transition_zone'"]) {
    assert.ok(gpsApi.includes(v1), `${v1} deve restare come fallback`);
  }
});

test('gps-api: driverGroupJoin usa SOLO driver_group_join col group token; poi token personale', () => {
  assert.match(gpsApi, /export async function driverGroupJoin/);
  assert.match(gpsApi, /callGpsRpc\('driver_group_join', \{/);
  assert.match(gpsApi, /p_device_id: getDeviceInstallationId\(\)/);
  // persistenza locale per riuso stesso-device
  assert.match(gpsApi, /export function readDriverGroupJoin/);
  assert.match(gpsApi, /vp:gps:group-join:/);
  // il group token NON viene mai passato a insert/transition/session RPC
  const joinFn = gpsApi.slice(gpsApi.indexOf('export async function driverGroupJoin'), gpsApi.indexOf('export async function adminUnlockDevice'));
  assert.doesNotMatch(joinFn, /gps_insert_point|gps_transition_session|gps_start_session/);
});

async function withLocalStorage(fn) {
  const store = new Map();
  const prev = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  } };
  try { return await fn(); } finally { globalThis.window = prev; }
}

test('gps-api: readDriverGroupJoin roundtrip (stesso device -> nessun nuovo join)', async () => {
  await withLocalStorage(async () => {
    const mod = await import(`../src/lib/services/gps-api.js?case=groupjoin`);
    const tok = 'a'.repeat(48);
    assert.equal(mod.readDriverGroupJoin(tok), null);
    window.localStorage.setItem(
      'vp:gps:group-join:' + tok,
      JSON.stringify({ assignmentId: '11111111-1111-1111-1111-111111111111', accessToken: 'personal-tok' }),
    );
    const got = mod.readDriverGroupJoin(tok);
    assert.equal(got.assignmentId, '11111111-1111-1111-1111-111111111111');
    assert.equal(got.accessToken, 'personal-tok');
  });
});

// ---------------------------------------------------------------------------
// 4. Route + pagina Driver + Admin
// ---------------------------------------------------------------------------

test('main.jsx: rotta /driver/group/:token -> DriverGroupJoinPage', () => {
  assert.match(mainJsx, /DriverGroupJoinPage/);
  assert.match(mainJsx, /\/\^\\\/driver\\\/group\\\/\(\[\^\/\]\+\)\$\//);
});

test('DriverGroupJoinPage: reuse locale -> redirect al link personale; form nome operativo', () => {
  assert.match(joinPage, /readDriverGroupJoin\(token\)/);
  assert.match(joinPage, /\/driver\/assignment\/\$\{join\.assignmentId\}\?access=/);
  assert.match(joinPage, /id="group-operative-name"/);
  assert.match(joinPage, /driverGroupJoin\(token, trimmed\)/);
  assert.match(joinPage, /GROUP_LINK_PIENO/);
  assert.match(joinPage, /GROUP_LINK_REVOCATO/);
});

test('CampaignGroupDetail: pannello "Link operativo gruppo" (genera/rigenera/revoca)', () => {
  assert.match(groupDetail, /function DriverGroupAccessPanel/);
  assert.match(groupDetail, /<DriverGroupAccessPanel campaignId=\{campaignId\}/);
  assert.match(groupDetail, /adminCreateGroupAccessLink/);
  assert.match(groupDetail, /adminRevokeGroupAccessLink/);
  assert.match(groupDetail, /adminGetGroupAccessLink/);
  assert.match(groupDetail, /generateDriverGroupLink/);
  assert.match(groupDetail, /Genera link/);
  assert.match(groupDetail, /Rigenera/);
  assert.match(groupDetail, /Revoca/);
  // Non confondere col link di monitoraggio
  assert.match(groupDetail, /Copia link monitoraggio/);
  assert.match(groupDetail, /non e' il link di monitoraggio/i);
});

test('admin-api: helper group access link', () => {
  assert.match(adminApi, /export function generateDriverGroupLink/);
  assert.match(adminApi, /\/driver\/group\//);
  assert.match(adminApi, /export async function adminCreateGroupAccessLink/);
  assert.match(adminApi, /export async function adminRevokeGroupAccessLink/);
  assert.match(adminApi, /export async function adminGetGroupAccessLink/);
  assert.match(adminApi, /supabase\.rpc\('admin_create_group_access_link'/);
});

// ---------------------------------------------------------------------------
// 5. Backward compatibility — link personale invariato
// ---------------------------------------------------------------------------

test('backward-compat: link personale (generateDriverAssignmentLink) e RPC v1 intatti', () => {
  assert.match(adminApi, /export function generateDriverAssignmentLink/);
  assert.match(adminApi, /\/driver\/assignment\/\$\{assignmentId\}/);
  // get_public_driver_assignment NON toccata dalle migrazioni group access
  assert.doesNotMatch(migA, /get_public_driver_assignment/);
  assert.doesNotMatch(migB, /get_public_driver_assignment/);
});
