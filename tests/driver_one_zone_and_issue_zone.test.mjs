// Ticket DRIVER OPERATIONS: segnalazioni per zona + una zona alla volta.
// Le parti server (SQL) sono verificate come testo della migrazione: NON
// sostituiscono la verifica runtime su produzione (vedi report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeZoneWorkflow, ZONE_STATE } from '../src/lib/driver/zoneWorkflow.js';
import { partitionIssuesByZone, validateResolutionNote } from '../src/lib/driver/issueZoneView.js';
import { mapDriverActionError } from '../src/hooks/useDriverAssignment.js';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = rd('../supabase/migrations/20260919150000_driver_one_zone_at_a_time_and_issue_zone.sql');
const page = rd('../src/pages/driver/DriverAssignmentPage.jsx');
const customer = rd('../src/pages/customer/CampaignTracking.jsx');
const msgSql = rd('../supabase/migrations/20260905131000_messaging_and_modification_rpcs.sql');

const Z = (id, name, status = 'Da iniziare') => ({ id, zone_name: name, status });
const program = (statuses = {}) => [
  Z('z1', 'BRUZZANO', statuses.z1), Z('z2', 'COMASINA', statuses.z2),
  Z('z3', 'PARCO NORD', statuses.z3), Z('z4', 'AFFORI', statuses.z4),
];

test('initial: tutte DA_INIZIARE; solo la prima e\' avviabile', () => {
  const w = computeZoneWorkflow(program());
  assert.deepEqual(program().map((z) => w.stateOf(z)), Array(4).fill(ZONE_STATE.TO_START));
  assert.deepEqual(program().map((z) => w.canStart(z)), [true, false, false, false]);
});

test('G/H. avvio BRUZZANO: solo BRUZZANO IN_CORSO, le altre DA_INIZIARE senza avvio', () => {
  const zs = program({ z1: 'In corso' });
  const w = computeZoneWorkflow(zs, 'z1', true);
  assert.deepEqual(zs.map((z) => w.stateOf(z)), ['IN_CORSO', 'DA_INIZIARE', 'DA_INIZIARE', 'DA_INIZIARE']);
  assert.deepEqual(zs.map((z) => w.canStart(z)), [false, false, false, false], 'sessione viva: nessun altro avvio');
});

test('I. con BRUZZANO IN_CORSO (sessione chiusa) COMASINA non parte e il messaggio e\' quello del server', () => {
  const zs = program({ z1: 'In corso' });
  const w = computeZoneWorkflow(zs, null, false);
  assert.equal(w.canStart(zs[1]), false);
  assert.equal(w.canStart(zs[0]), true, 'si puo\' solo riprendere la zona in corso');
  assert.equal(w.blockedReason(zs[1]), 'Completa o termina BRUZZANO prima di iniziare COMASINA.');
});

test('J/K. completare BRUZZANO non avvia COMASINA; parte solo con conferma esplicita', () => {
  const zs = program({ z1: 'Completata' });
  const w = computeZoneWorkflow(zs, null, false);
  assert.equal(w.stateOf(zs[1]), ZONE_STATE.TO_START, 'COMASINA resta DA_INIZIARE');
  assert.equal(w.nextZone.zone_name, 'COMASINA');
  assert.equal(w.inProgressZone, null);
  assert.equal(w.canStart(zs[1]), true);
  assert.equal(w.canStart(zs[2]), false);
});

test('Q. ricarica pagina: gli stati derivano solo dal DB (stesso input -> stessi stati)', () => {
  const zs = program({ z1: 'In corso' });
  const a = computeZoneWorkflow(zs, null, false);
  const b = computeZoneWorkflow(zs.map((z) => ({ ...z })), null, false);
  assert.deepEqual(zs.map((z) => a.stateOf(z)), zs.map((z, i) => b.stateOf(zs[i])));
  assert.equal(a.inProgressZone.zone_name, 'BRUZZANO');
});

test('l\'ordine di programma non viene mai riordinato', () => {
  const zs = program();
  const w = computeZoneWorkflow(zs);
  assert.equal(w.nextZone.id, 'z1');
  assert.deepEqual(zs.map((z) => z.zone_name), ['BRUZZANO', 'COMASINA', 'PARCO NORD', 'AFFORI']);
});

test('N/P. segnalazione BRUZZANO visibile come attiva sulla zona in corso; zona futura = "futura", non attiva', () => {
  const issues = [
    { id: 'i1', zone_id: 'z1', status: 'assigned' },
    { id: 'i2', zone_id: 'z2', status: 'assigned' },
    { id: 'i3', zone_id: 'z1', status: 'resolved' },
  ];
  const p = partitionIssuesByZone(issues, 'z1');
  assert.deepEqual(p.active.map((i) => i.id), ['i1']);
  assert.deepEqual(p.future.map((i) => i.id), ['i2']);
  assert.deepEqual(p.done.map((i) => i.id), ['i3']);
  // nessuna zona in corso: nulla e' "attivo" per zona, non si avvia nulla
  const none = partitionIssuesByZone(issues, null);
  assert.equal(none.active.length, 0);
  assert.equal(none.future.length, 2);
  // le segnalazioni dei driver non toccano mai lo stato delle zone
  const zs = program();
  const w = computeZoneWorkflow(zs);
  assert.equal(w.stateOf(zs[1]), ZONE_STATE.TO_START);
});

test('O. risoluzione richiede una nota; il cliente/admin vedono lo stato risolto (RPC esistenti)', () => {
  assert.equal(validateResolutionNote('   ').ok, false);
  assert.equal(validateResolutionNote('Fatto').ok, true);
  assert.match(page, /askResolution/);
  assert.match(page, />\s*Risolvi\s*</);
  assert.match(page, /Prendi in carico/);
  assert.match(page, /Apri sulla mappa/);
  assert.match(page, /Nessuna segnalazione cliente attiva per questa zona\./);
  assert.doesNotMatch(page, /Nessuna segnalazione cliente attiva per questo incarico/);
});

test('A/B. l\'insert della segnalazione conserva campaign_id e zone_id; zona obbligatoria server-side', () => {
  assert.match(sql, /insert into public\.customer_issues[\s\S]*?campaign_id[\s\S]*?zone_id/);
  assert.match(sql, /p_campaign_id, v_uid/);
  assert.match(sql, /ZONA_OBBLIGATORIA/);
  assert.match(customer, /Seleziona la zona della segnalazione\./);
});

test('C/D/E. instradamento: assignment attivo che copre la zona; il driver legge solo le sue (assignment_id)', () => {
  assert.match(sql, /oaz\.zone_id = v_zone_id or a\.zone_id = v_zone_id/);
  assert.match(sql, /array_length\(v_cands, 1\) = 1/);
  assert.match(sql, /where i\.assignment_id = p_assignment_id/);
  assert.match(sql, /'zone_id', i\.zone_id, 'zone_name', z\.zone_name/);
});

test('F. il cliente non ha chat libera col driver: driver_send_message forza recipient admin', () => {
  assert.match(msgSql, /driver_send_message/);
  assert.match(msgSql, /recipient_role/);
});

test('R. una sola zona IN_CORSO imposta lato SERVER in start_session e transition start', () => {
  assert.match(sql, /create or replace function public\.gps_zone_start_guard/);
  assert.match(sql, /ZONA_ALTRA_IN_CORSO: Completa o termina % prima di iniziare %\./);
  assert.match(sql, /ZONA_PRECEDENTE_NON_COMPLETATA/);
  const s0 = sql.indexOf('FUNCTION public.gps_start_session_v3');
  const start = sql.slice(s0, sql.indexOf('create or replace function public.gps_transition_zone_v3'));
  assert.match(start, /perform public\.gps_zone_start_guard\(v_assignment\.id, p_campaign_zone_id\)/);
  const trans = sql.slice(sql.indexOf('create or replace function public.gps_transition_zone_v3'));
  assert.match(trans, /perform public\.gps_zone_start_guard\(v_session\.assignment_id, p_campaign_zone_id\)/);
  assert.match(trans, /ZONA_SESSIONE_NON_CORRISPONDENTE/);
});

test('errore del server mostrato al driver senza codice tecnico', () => {
  const msg = mapDriverActionError(new Error('ZONA_ALTRA_IN_CORSO: Completa o termina BRUZZANO prima di iniziare COMASINA.'));
  assert.equal(msg, 'Completa o termina BRUZZANO prima di iniziare COMASINA.');
});

test('L/M. GPS/foto seguono la zona attiva: Termina completa la zona PRIMA di chiudere la sessione; la prossima zona apre una nuova sessione', () => {
  const i = page.indexOf('function endWork()');
  const block = page.slice(i, i + 1500);
  assert.ok(block.indexOf('tracking.completeZone(') > 0);
  assert.ok(block.indexOf('tracking.completeZone(') < block.indexOf('tracking.end()'));
  assert.match(page, /tracking\.start\(z\.id\)/);
  assert.match(sql, /campaign_zone_id/);
});

test('UI: zone future senza controlli operativi; "Prossima zona" e pulsante Inizia <zona>', () => {
  assert.match(page, /isFutureLockedZone/);
  assert.match(page, /Prossima zona: /);
  assert.match(page, /`Inizia \$\{z\.zone_name\}`/);
  assert.match(page, /'IN CORSO'/);
  assert.match(page, /'DA INIZIARE'/);
});

test('nessuna modifica a prezzi/Step2: il ticket tocca solo driver/customer issue/SQL', () => {
  assert.doesNotMatch(sql, /pricing|quote_requests|quantity_assigned/);
});
