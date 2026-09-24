// BUG CRITICO — "Link per operatore" Driver non funziona: nessuna riga
// driver_group_access_links esisteva per il campaign/group dell'assignment
// originaria (verificato in prod: 58bb64af-... active, group_access_link_id
// NULL, campaign dc5a5357-..., group cbbed7ba-..., 0 righe attive nella
// tabella). Fix: RPC driver_get_or_create_group_access_link, autorizzata
// solo da assignment_id + access_token, campaign/group derivati server-side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = rd('../supabase/migrations/20260924120000_driver_group_link_self_service.sql');
const gpsApi = rd('../src/lib/services/gps-api.js');
const page = rd('../src/pages/driver/DriverAssignmentPage.jsx');
const joinPage = rd('../src/pages/driver/DriverGroupJoinPage.jsx');
const groupModel = rd('../supabase/migrations/20260829170000_driver_group_access_model.sql');

test('root cause: la RPC deriva campaign_id/group_id SOLO dall\'assignment validata, mai da parametri client', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.driver_get_or_create_group_access_link'));
  assert.match(fn, /p_assignment_id uuid,\s*\n\s*p_access_token text/);
  assert.doesNotMatch(fn, /p_campaign_id|p_group_id/, 'nessun campaign/group in input: solo assignment_id+access_token');
  assert.match(fn, /where id = p_assignment_id and access_token = p_access_token/);
  assert.match(fn, /where campaign_id = v_assignment\.campaign_id\s*\n\s*and group_id = v_assignment\.group_id/);
});

test('solo l\'assignment ORIGINARIA (non un participant OP) puo\' chiamarla', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.driver_get_or_create_group_access_link'));
  assert.match(fn, /if v_assignment\.group_access_link_id is not null then\s*\n\s*raise exception 'PARTECIPANTE_NON_AUTORIZZATO'/);
});

test('assignment non attiva/revocata/scaduta -> nessun link (server-side)', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.driver_get_or_create_group_access_link'));
  assert.match(fn, /v_assignment\.status <> 'active' or v_assignment\.revoked_at is not null/);
  assert.match(fn, /v_assignment\.starts_at is not null and v_assignment\.starts_at > now\(\)/);
  assert.match(fn, /v_assignment\.ends_at is not null and v_assignment\.ends_at <= now\(\)/);
});

test('token: mai ricostruito da token_hash; derivato con HMAC da un segreto per-riga, verificabile con lo stesso sha256 di sempre', () => {
  assert.match(sql, /add column if not exists driver_secret text/);
  assert.match(sql, /extensions\.hmac\(v_link\.id::text, v_link\.driver_secret, 'sha256'\)/);
  assert.match(sql, /encode\(extensions\.digest\(v_token, 'sha256'\), 'hex'\)/);
  // driver_group_join non cambia: stessa verifica sha256(token)=token_hash di sempre.
  assert.match(groupModel, /token_hash text not null unique/);
  assert.doesNotMatch(sql, /alter function public\.driver_group_join|create or replace function public\.driver_group_join/);
});

test('idempotenza: link attivo con segreto -> stesso token ritornato, nessuna insert/rigenerazione', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.driver_get_or_create_group_access_link'));
  const foundBranch = fn.slice(fn.indexOf('if found then'), fn.indexOf('-- Nessun link attivo per questo gruppo'));
  assert.match(foundBranch, /v_link\.driver_secret is not null/);
  assert.match(foundBranch, /'created', false/);
  assert.doesNotMatch(foundBranch, /insert into|update public\.driver_group_access_links\s+set status/, 'nessuna scrittura sul ramo "link gia esistente"');
});

test('link Admin storico (token random, non derivabile) -> mai rigenerato/revocato automaticamente', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.driver_get_or_create_group_access_link'));
  const foundBranch = fn.slice(fn.indexOf('if found then'), fn.indexOf('-- Nessun link attivo per questo gruppo'));
  assert.match(foundBranch, /'recoverable', false/);
  assert.doesNotMatch(foundBranch, /revoked|status = 'revoked'/i);
});

test('grant coerente con driver_group_join: anon+authenticated (nessun login richiesto, come il link personale)', () => {
  assert.match(sql, /grant execute on function public\.driver_get_or_create_group_access_link\(uuid, text\) to anon, authenticated;/);
  assert.match(groupModel, /grant execute on function public\.driver_group_join\(text, text, text\) to anon, authenticated;/);
});

test('client: driverGetOrCreateGroupLink chiama la RPC con assignmentId+accessToken', () => {
  assert.match(gpsApi, /export async function driverGetOrCreateGroupLink\(assignmentId, accessToken\)/);
  assert.match(gpsApi, /callGpsRpc\('driver_get_or_create_group_access_link', \{\s*\n\s*p_assignment_id: assignmentId,\s*\n\s*p_access_token: accessToken,/);
});

test('UI Driver: sezione "Link per operatore" costruisce /driver/group/:token con getPublicAppUrl, nessun token personale coinvolto', () => {
  assert.match(page, /function DriverGroupLinkSection/);
  assert.match(page, /driverGetOrCreateGroupLink\(assignmentId, accessToken/);
  assert.match(page, /\/driver\/group\/\$\{encodeURIComponent\(result\.token\)\}/);
  assert.doesNotMatch(page.slice(page.indexOf('function DriverGroupLinkSection'), page.indexOf('function DriverGroupLinkSection') + 3500), /accessToken\}\`|personal.*access_token|p_access_token: accessToken\}\)[^;]*link/i);
});

test('UI Driver: participant/gruppo non disponibile -> sezione nascosta, nessun errore mostrato', () => {
  const section = page.slice(page.indexOf('const GROUP_LINK_ERROR_MESSAGES'), page.indexOf('// ─── Segnalazioni Cliente'));
  assert.match(section, /PARTECIPANTE_NON_AUTORIZZATO: null/);
  assert.match(section, /GRUPPO_NON_DISPONIBILE: null/);
  assert.match(section, /if \(state === 'hidden'\) return null;/);
});

test('non tocca link personale/GPS/messaggi/tracking/join esistenti', () => {
  assert.doesNotMatch(sql, /alter table public\.delivery_sessions|alter table public\.gps_tracking_points|alter table public\.conversation_messages/);
  assert.doesNotMatch(sql, /create or replace function public\.(gps_start_session|gps_transition|gps_insert_point|get_active_driver_session)/);
  assert.match(joinPage, /driverGroupJoin\(token, ''\)/, 'DriverGroupJoinPage invariato');
});
