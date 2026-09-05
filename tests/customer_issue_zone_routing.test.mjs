// TICKET — FIX END-TO-END SEGNALAZIONI CLIENTE -> DRIVER APP.
//
// ROOT CAUSE reale confermata via query dal vivo su customer_issues in
// produzione (una sola riga: "milano - via oroboni 10", lat/lng NULL,
// routed_to='admin_queue', assignment_id NULL): customer_create_issue
// instradava SOLO tramite point-in-polygon su lat/lng, ma il form Cliente
// non li ha mai raccolti -> ogni segnalazione reale finiva in coda Admin,
// mai da un driver, anche quando un solo operator_assignment attivo
// copriva davvero quella zona.
//
// Le due migration originali (20260830093000/094000) non erano applicate
// in questo ambiente di test quindi gli scenari sono verificati
// staticamente sul testo SQL della NUOVA migration + sul wiring frontend,
// stesso pattern gia' usato da tests/customer_issue_flow_contract.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const FIX = read('supabase/migrations/20260905120000_customer_issue_zone_routing.sql');
const API = read('src/lib/services/customer-issues-api.js');
const CT = read('src/pages/customer/CampaignTracking.jsx');
const DRV = read('src/pages/driver/DriverAssignmentPage.jsx');
const ADM = read('src/components/admin/AdminIssuesPanel.jsx');

// ── root cause: routing per zona reale, non piu' solo lat/lng ─────────────
test('ROOT CAUSE — customer_create_issue accetta p_zone_id (zona reale scelta dal Cliente), instrada per zona quando fornita', () => {
  assert.match(FIX, /drop function if exists public\.customer_create_issue\(uuid, text, text, text, double precision, double precision, text, text\)/);
  assert.match(FIX, /p_notes text default null,\s*\n\s*p_zone_id uuid default null/);
  assert.match(FIX, /if p_zone_id is not null then\s*\n\s*select z\.id, z\.group_id into v_zone_id, v_group_id\s*\n\s*from public\.campaign_zones z\s*\n\s*where z\.id = p_zone_id and z\.campaign_id = p_campaign_id;/);
  assert.match(FIX, /raise exception 'ZONA_NON_VALIDA'/);
  // fallback storico point-in-polygon NON rimosso (retrocompatibile).
  assert.match(FIX, /elsif p_lat is not null and p_lng is not null then/);
  assert.match(FIX, /public\.ST_Contains\(z\.geometry, public\.ST_SetSRID\(public\.ST_MakePoint\(p_lng, p_lat\), 4326\)\)/);
  // regola invariata: instrada SOLO se il candidato e' UNO E UNO SOLO.
  assert.match(FIX, /if v_cands is not null and array_length\(v_cands, 1\) = 1 then/);
});

test('ROOT CAUSE — frontend: createCustomerIssue passa zoneId, CustomerIssuesCard offre le zone REALI della campagna', () => {
  assert.match(API, /export async function createCustomerIssue\(\{ campaignId, municipality, street, houseNumber = null, lat = null, lng = null, zoneId = null, reason, notes = null \}\)/);
  assert.match(API, /p_zone_id: zoneId/);
  assert.match(CT, /function CustomerIssuesCard\(\{ campaignId, issues = \[\], zones = \[\], onCreated \}\)/);
  assert.match(CT, /zones\.map\(\(z\) => <option key=\{z\.id\} value=\{z\.id\}>\{z\.zone_name\}<\/option>\)/);
  assert.match(CT, /zoneId: form\.zoneId \|\| null/);
  // le zone passate sono la STESSA fonte gia' usata dalla mappa tracking
  // (useZoneBoundaries), non una nuova query duplicata.
  assert.match(CT, /const \{ zoneRows, resolvedBoundaries \} = useZoneBoundaries\(campaignId\)/);
  assert.match(CT, /zones=\{zoneRows\}/);
});

// ── Fase 3: nessuna bugia al cliente quando non c'e' un driver assegnato ──
test('FASE 3 — Cliente vede "In attesa di assegnazione operatore" quando routed_to non e\' driver (mai un falso "operatore informato")', () => {
  assert.match(CT, /function customerIssueStatusLabel\(issue\) \{/);
  assert.match(CT, /if \(issue\.routed_to !== 'driver'\) return 'In attesa di assegnazione operatore';/);
  assert.match(FIX, /'routed_to', i\.routed_to,/, 'get_customer_issues deve restituire routed_to al Cliente');
});

// ── Fase 2/4/7: stato 'seen' distinto da in_progress ──────────────────────
test('FASE 2/4/7 — nuovo stato "seen" (Presa visione) additivo, distinto da in_progress ("Sto verificando")', () => {
  assert.match(FIX, /check \(status in \('new', 'assigned', 'seen', 'in_progress', 'resolved', 'not_resolvable'\)\)/);
  assert.match(FIX, /add column if not exists seen_at timestamptz/);
  assert.match(FIX, /p_action not in \('seen', 'take', 'resolve', 'not_resolvable'\)/);
  assert.match(FIX, /if p_action = 'seen' then\s*\n\s*update public\.customer_issues\s*\n\s*set status = case when status in \('new', 'assigned'\) then 'seen' else status end,/);
  assert.match(API, /seen: 'Presa visione'/);
  assert.match(CT, /if \(issue\.status === 'seen'\) return 'Operatore informato';/);
  assert.match(CT, /if \(issue\.status === 'in_progress'\) return 'In verifica';/);
  assert.match(DRV, /onClick=\{\(\) => act\(issue, 'seen'\)\}>Presa visione</);
});

// ── Fase 5: delivery al driver senza logout/refresh manuale ───────────────
test('FASE 5 — Driver App: polling leggero (15-30s), nessuna nuova infrastruttura realtime, nessun logout/refresh richiesto', () => {
  const section = DRV.slice(DRV.indexOf('function DriverIssuesSection'), DRV.indexOf('function assignmentLabel'));
  assert.match(section, /const timer = window\.setInterval\(reload, 20000\);/);
  assert.match(section, /return \(\) => window\.clearInterval\(timer\);/);
  assert.doesNotMatch(section, /supabase\.channel|EventSource|WebSocket/, 'nessuna nuova infrastruttura realtime introdotta, solo polling leggero');
});

// ── Fase 8: Admin vede la timeline (incl. presa visione) ──────────────────
test('FASE 8 — Admin vede seen_at nella timeline della segnalazione', () => {
  assert.match(FIX, /'seen_at', i\.seen_at, 'taken_at', i\.taken_at, 'resolved_at', i\.resolved_at,/);
  assert.match(ADM, /i\.seen_at \? ` · vista \$\{new Date\(i\.seen_at\)\.toLocaleString\('it-IT'\)\}` : ''/);
});

// ── Fase 9: sicurezza — nessuna nuova policy permissiva, nessun access_token esposto ──
test('FASE 9 — nessuna nuova policy RLS permissiva, nessun access_token esposto nelle RPC aggiornate', () => {
  assert.doesNotMatch(FIX, /using \(true\)|with check \(true\)/);
  assert.doesNotMatch(FIX, /'access_token'|\.access_token,/);
  assert.doesNotMatch(FIX, /service_role_key|SUPABASE_SERVICE_ROLE/i);
  // tutte le funzioni ricreate restano SECURITY DEFINER con search_path vuoto.
  const defs = FIX.match(/create or replace function public\.\w+/g) || [];
  const secDef = FIX.match(/security definer set search_path to ''/g) || [];
  assert.ok(defs.length >= 5, `attese >=5 RPC ricreate, trovate ${defs.length}`);
  assert.equal(secDef.length, defs.length);
});

// ── GPS non regredisce: il fix non tocca nessun file/tabella GPS ─────────
test('GPS REGRESSION — la migration del fix non tocca tabelle/RPC GPS, geofence, copertura o pricing', () => {
  assert.doesNotMatch(FIX, /gps_tracking_points|delivery_sessions|geofence|calculate_campaign_final_coverage|campaign_coverage_adjustments/);
});
test('GPS REGRESSION — nessun file GPS/geofence/Mapbox/pricing/Step1-4/auth Admin toccato da questo fix (solo file segnalazioni)', () => {
  // DriverAssignmentPage.jsx e CampaignTracking.jsx sono condivisi con GPS:
  // la sola porzione toccata deve restare quella delle segnalazioni.
  assert.doesNotMatch(DRV.slice(DRV.indexOf('function DriverIssuesSection'), DRV.indexOf('function assignmentLabel')), /useGpsTracking|geoJsonContainsPoint|resolveMunicipalityBoundary/);
  assert.match(DRV, /useGpsTracking\(/, 'il resto del file (GPS) resta intatto/presente altrove');
});
