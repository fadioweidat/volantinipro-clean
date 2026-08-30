// FLUSSO SEGNALAZIONI CLIENTE -> AUTISTA -> FOTO VERIFICA.
// Test di CONTRATTO: le due migration (schema + RLS + RPC) non sono applicate
// in questo ambiente, quindi gli scenari A-N sono verificati staticamente sul
// testo SQL e sul wiring frontend (service + UI Cliente/Driver/Admin).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const M1 = read('supabase/migrations/20260830093000_customer_issues.sql');
const M2 = read('supabase/migrations/20260830094000_customer_issue_rpcs.sql');
const API = read('src/lib/services/customer-issues-api.js');
const GPS = read('src/lib/services/gps-api.js');
const CAPI = read('src/lib/services/customer-api.js');
const CT = read('src/pages/customer/CampaignTracking.jsx');
const DRV = read('src/pages/driver/DriverAssignmentPage.jsx');
const ADM = read('src/components/admin/AdminIssuesPanel.jsx');
const GM = read('src/pages/admin/GpsMonitor.jsx');

// ── modello dati / stati ──────────────────────────────────────────────
test('MODELLO — customer_issues ha i campi e gli stati richiesti', () => {
  for (const col of ['campaign_id', 'created_by', 'municipality', 'street', 'house_number',
    'reason', 'notes', 'status', 'zone_id', 'assignment_id', 'routed_to', 'driver_id',
    'resolution_note', 'resolved_at', 'taken_at', 'created_at', 'updated_at']) {
    assert.match(M1, new RegExp(`\\b${col}\\b`), `manca colonna ${col}`);
  }
  assert.match(M1, /status text not null default 'new' check \(status in \('new', 'assigned', 'in_progress', 'resolved', 'not_resolvable'\)\)/);
  assert.match(M1, /routed_to text not null default 'admin_queue' check \(routed_to in \('driver', 'admin_queue'\)\)/);
});

test('MODELLO — issue_verification_photos e\' una tabella SEPARATA (non proof_photos), geoloc obbligatoria', () => {
  assert.match(M1, /create table if not exists public\.issue_verification_photos/);
  assert.match(M1, /lat double precision not null,\s*\n\s*lng double precision not null/);
  assert.doesNotMatch(M1, /alter table public\.proof_photos/, 'non deve toccare proof_photos');
  assert.doesNotMatch(M1, /issue_verification_photos[\s\S]{0,400}access_token/, 'nessun access_token nella tabella foto');
});

// ── A: customer crea issue ───────────────────────────────────────────
test('A — createCustomerIssue chiama customer_create_issue con l\'indirizzo del cliente', () => {
  assert.match(API, /callIssueRpc\('customer_create_issue', \{[\s\S]{0,260}p_campaign_id[\s\S]{0,260}p_municipality[\s\S]{0,260}p_street[\s\S]{0,260}p_house_number[\s\S]{0,260}p_reason/);
  assert.match(CT, /await createCustomerIssue\(\{[\s\S]{0,300}campaignId,[\s\S]{0,300}municipality:[\s\S]{0,300}street:[\s\S]{0,300}houseNumber:[\s\S]{0,300}reason:[\s\S]{0,300}notes:/);
  assert.match(M2, /create or replace function public\.customer_create_issue\(/);
});

// ── B: routing verso l'assignment corretto ───────────────────────────
test('B — routing automatico: point-in-polygon zona + assignment attivo, instrada solo se candidato UNICO', () => {
  assert.match(M2, /public\.ST_Contains\(z\.geometry, public\.ST_SetSRID\(public\.ST_MakePoint\(p_lng, p_lat\), 4326\)\)/);
  assert.match(M2, /from public\.operator_assignments a\s*\n\s*left join public\.operator_assignment_zones oaz/);
  assert.match(M2, /a\.status = 'active' and a\.revoked_at is null/);
  assert.match(M2, /a\.starts_at <= now\(\) and \(a\.ends_at is null or a\.ends_at > now\(\)\)/);
  assert.match(M2, /if v_cands is not null and array_length\(v_cands, 1\) = 1 then/);
  assert.match(M2, /v_routed := 'driver';\s*\n\s*v_status := 'assigned';/);
  assert.match(M2, /v_driver_id := coalesce\(v_assignment\.operator_id, v_assignment\.id\)/);
});

// ── C: routing ambiguo -> admin queue ───────────────────────────────
test('C — nessun candidato certo: routed_to admin_queue, status new, mai al driver sbagliato', () => {
  assert.match(M2, /v_routed text := 'admin_queue';/);
  assert.match(M2, /v_status text := 'new';/);
  // l'assignment_id resta null quando non instradato
  assert.match(M2, /case when v_routed = 'driver' then v_assignment\.id else null end/);
});

// ── D: driver A non legge issue di driver B ──────────────────────────
test('D — RLS driver: solo issue di una PROPRIA assignment (auth) o del proprio token', () => {
  assert.match(M1, /create policy customer_issues_driver_select on public\.customer_issues for select to authenticated/);
  assert.match(M1, /where a\.id = customer_issues\.assignment_id and a\.operator_id = auth\.uid\(\)/);
  assert.match(M2, /select \* into v_assignment from public\.operator_assignments where id = p_assignment_id and operator_id = v_uid/);
  assert.match(M2, /where id = p_assignment_id and access_token = p_access_token/);
  assert.match(M2, /driver_list_issues[\s\S]{0,1600}where i\.assignment_id = p_assignment_id/);
});

// ── E: customer A non legge issue di customer B ─────────────────────
test('E — RLS cliente: solo issue delle proprie campagne', () => {
  assert.match(M1, /create policy customer_issues_owner_select on public\.customer_issues for select to authenticated\s*\n\s*using \(public\.current_user_owns_campaign\(campaign_id\)\)/);
  assert.match(M1, /customer_issues_owner_insert[\s\S]{0,160}current_user_owns_campaign\(campaign_id\) and created_by = auth\.uid\(\)/);
  assert.match(M2, /get_customer_issues[\s\S]{0,400}public\.gps_is_admin\(\) or public\.current_user_owns_campaign\(p_campaign_id\)/);
});

// ── F: driver vede la nuova issue + badge ───────────────────────────
test('F — DriverIssuesSection: lista via driver_list_issues + badge "N nuove segnalazioni" (§9, in-app)', () => {
  assert.match(DRV, /const rows = await driverListIssues\(assignmentId, accessToken \|\| null\)/);
  const section = DRV.slice(DRV.indexOf('function DriverIssuesSection'), DRV.indexOf('function assignmentLabel'));
  assert.match(section, /const newCount = issues\.filter\(\(i\) => i\.status === 'new' \|\| i\.status === 'assigned'\)\.length/);
  assert.match(section, /\{newCount\} nuov\{newCount === 1 \? 'a' : 'e'\} segnalazion/);
  assert.doesNotMatch(section, /\.serviceWorker|new Notification\(|webpush|firebase|twilio|sendSms\(|wa\.me\/|api\/whatsapp/i, 'niente integrazioni push/SMS/WhatsApp nella sezione segnalazioni');
});

// ── G: prendi in carico ────────────────────────────────────────────
test('G — take: status in_progress + taken_at, dalla UI "Sono sul posto"', () => {
  assert.match(M2, /if p_action = 'take' then\s*\n\s*update public\.customer_issues\s*\n\s*set status = 'in_progress', taken_at = coalesce\(taken_at, now\(\)\)/);
  assert.match(DRV, /onClick=\{\(\) => act\(issue, 'take'\)\}>Sono sul posto/);
});

// ── H: foto verifica richiede geolocalizzazione ────────────────────
test('H — foto verifica: coordinate OBBLIGATORIE lato client e lato RPC', () => {
  assert.match(GPS, /Posizione GPS obbligatoria per la foto di verifica/);
  assert.match(GPS, /if \(!Number\.isFinite\(Number\(lat\)\) \|\| !Number\.isFinite\(Number\(lng\)\)\)/);
  assert.match(M2, /if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then\s*\n\s*raise exception 'COORDINATE_OBBLIGATORIE'/);
  assert.match(DRV, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(DRV, /Posizione GPS negata: la foto di verifica richiede il GPS/);
});

// ── I: foto collegata alla issue corretta ─────────────────────────
test('I — foto: prefisso storage dedicato campaign/<cid>/issue/<iid>/photo/, verificata dalla RPC', () => {
  assert.match(GPS, /return `campaign\/\$\{campaignId\}\/issue\/\$\{issueId\}\/photo\/\$\{photoId\}\.jpg`/);
  assert.match(M2, /v_prefix := 'campaign\/' \|\| v_issue\.campaign_id::text \|\| '\/issue\/' \|\| v_issue\.id::text \|\| '\/photo\/'/);
  assert.match(M2, /if p_storage_path not like \(v_prefix \|\| '%'\) or p_storage_path like '%\.\.%' then/);
  assert.match(M2, /if not exists \(select 1 from storage\.objects o where o\.bucket_id = 'proof-photos' and o\.name = p_storage_path\)/);
  assert.match(M2, /insert into public\.issue_verification_photos\s*\n\s*\(issue_id, campaign_id, assignment_id, driver_id, storage_path/);
});

// ── J: foto issue NON nella gallery normale ───────────────────────
test('J — foto issue isolata: caricata a parte, mai in approvedPhotos/proof gallery', () => {
  assert.match(CAPI, /issues: issuesWithPhotos/);
  assert.match(CAPI, /photos: approvedPhotos/);
  assert.match(CAPI, /MAI mescolate con approvedPhotos \(gallery\)/);
  // get_customer_issues annida le foto SOLO dentro la issue
  assert.match(M2, /'photos', coalesce\(\(\s*\n\s*select jsonb_agg\(jsonb_build_object\(\s*\n\s*'id', p\.id, 'storage_path', p\.storage_path/);
  assert.doesNotMatch(CT, /state\.photos[\s\S]{0,200}issue/i, 'la gallery normale non deve iterare foto issue');
});

// ── K: risolvi ───────────────────────────────────────────────────
test('K — resolve: status resolved + resolution_note + resolved_at/by + eventi cliente', () => {
  assert.match(M2, /elsif p_action = 'resolve' then\s*\n\s*update public\.customer_issues\s*\n\s*set status = 'resolved', resolution_note = nullif\(btrim\(p_note\), ''\),\s*\n\s*resolved_at = now\(\), resolved_by = v_identity/);
  assert.match(M2, /'DRIVER_ISSUE_RESOLVED'[\s\S]{0,200}'CUSTOMER_ISSUE_RESOLVED'/);
  assert.match(DRV, /act\(issue, 'resolve', n\)/);
  assert.match(DRV, /Verifica effettuata e distribuzione completata/);
});

// ── L: risposta cliente + foto dedicata ─────────────────────────
test('L — Dashboard Cliente: risposta risolta nella issue (stato, data/ora, foto geoloc, nota) + badge §9', () => {
  assert.match(CT, /issue\.status === 'resolved' &&/);
  assert.match(CT, /Verifica completata<\/strong> · \{formatDateTime\(issue\.resolved_at\)\}/);
  assert.match(CT, /issue\.resolution_note &&/);
  assert.match(CT, /\(issue\.photos \|\| \[\]\)\.filter\(\(p\) => p\.signedUrl\)\.map/);
  assert.match(CT, /\(issue\.photos \|\| \[\]\)\.some\(\(p\) => p\.lat != null\)/);
  assert.match(CT, /const resolvedCount = issues\.filter\(\(i\) => i\.status === 'resolved'\)\.length/);
  assert.match(CT, />\s*Verifica completata\{resolvedCount > 1 \? ` \(\$\{resolvedCount\}\)` : ''\}/);
});

// ── M: admin vede tutto ─────────────────────────────────────────
test('M — Admin: lista completa + routing manuale, montata in GpsMonitor', () => {
  assert.match(M2, /create or replace function public\.admin_list_issues\(p_campaign_id uuid default null\)/);
  assert.match(M2, /if not public\.gps_is_admin\(\) then raise exception 'ADMIN_NON_AUTORIZZATO'/);
  assert.match(M2, /'open_seconds', extract\(epoch from \(coalesce\(i\.resolved_at, now\(\)\) - i\.created_at\)\)::bigint/);
  assert.match(ADM, /adminListIssues\(campaignId\)/);
  assert.match(ADM, /await adminRouteIssue\(issueId, assignmentId\)/);
  assert.match(GM, /<AdminIssuesPanel campaignId=\{campaignId\} \/>/);
});

// ── N: nessun token/secret esposto ─────────────────────────────
test('N — nessun access_token restituito o loggato', () => {
  // Le RPC che ritornano jsonb non includono mai la chiave access_token
  for (const fn of ['get_customer_issues', 'driver_list_issues', 'admin_list_issues']) {
    const start = M2.indexOf(`function public.${fn}`);
    const body = M2.slice(start, start + 2000);
    assert.doesNotMatch(body, /'access_token'|p\.access_token|a\.access_token,/, `${fn} non deve esporre access_token`);
  }
  assert.match(API, /Nessun access_token[\s\S]{0,40}nei payload/);
  assert.doesNotMatch(GPS.slice(GPS.indexOf('uploadIssueVerificationPhoto'), GPS.indexOf('uploadIssueVerificationPhoto') + 1400), /console\.(log|warn|error)\([^)]*token/i);
  assert.doesNotMatch(M2, /service_role_key|SUPABASE_SERVICE_ROLE/);
});

// ── RLS generale ──────────────────────────────────────────────
test('RLS — force RLS su tutte le tabelle issue, nessuna policy permissiva, anon senza lettura', () => {
  for (const tbl of ['customer_issues', 'issue_verification_photos', 'issue_events']) {
    assert.match(M1, new RegExp(`alter table public\\.${tbl} enable row level security`));
    assert.match(M1, new RegExp(`alter table public\\.${tbl} force row level security`));
    assert.doesNotMatch(M1, new RegExp(`create policy [a-z_]+ on public\\.${tbl} for select to anon`), `${tbl}: anon non deve avere SELECT`);
  }
  assert.doesNotMatch(M1, /using \(true\)|with check \(true\)/, 'nessuna policy aperta');
  // storage: upload consentito SOLO sul prefisso dedicato
  assert.match(M1, /bucket_id = 'proof-photos'\s*\n\s*and name like 'campaign\/%\/issue\/%\/photo\/%'\s*\n\s*and name not like '%\.\.%'/);
});

// ── RPC hardening ─────────────────────────────────────────────
test('RPC — tutte SECURITY DEFINER con search_path vuoto; grant mirati', () => {
  const defs = M2.match(/create or replace function public\.\w+/g) || [];
  assert.ok(defs.length >= 7, `attese >=7 RPC, trovate ${defs.length}`);
  const secDef = M2.match(/security definer set search_path to ''/g) || [];
  assert.equal(secDef.length, defs.length, 'ogni RPC deve essere SECURITY DEFINER search_path \'\'');
  assert.match(M2, /revoke execute on function public\.customer_create_issue\([\s\S]{0,200}\) from public, anon/);
  assert.match(M2, /revoke execute on function public\.get_customer_issues\(uuid\) from public, anon/);
  assert.match(M2, /revoke execute on function public\.admin_list_issues\(uuid\) from public, anon/);
});
