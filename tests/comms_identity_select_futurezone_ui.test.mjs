// Ticket: identita' umane in Comunicazioni Admin + select zona leggibile su mobile
// + pulizia UI zone future/segnalazioni Driver. Solo presentazione.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCustomerIdentity, resolveDriverIdentity, resolveConversationIdentity } from '../src/lib/admin/communicationIdentity.js';
import { computeZoneWorkflow } from '../src/lib/driver/zoneWorkflow.js';
import { ISSUE_ZONE_SELECT_COLORS } from '../src/components/customer/IssueZoneSelect.jsx';

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const commsPage = rd('../src/pages/admin/communications/AdminCommunicationsPage.jsx');
const driverPage = rd('../src/pages/driver/DriverAssignmentPage.jsx');
const customerPage = rd('../src/pages/customer/CampaignTracking.jsx');
const guard = rd('../supabase/migrations/20260919150000_driver_one_zone_at_a_time_and_issue_zone.sql');
const msgSql = rd('../supabase/migrations/20260905131000_messaging_and_modification_rpcs.sql');

const UUID = 'dc5a5357-453c-46bc-9d1b-48a592ef6152';

test('A. riga cliente: azienda/cliente + campagna, mai il UUID della campagna come titolo', () => {
  const id = resolveCustomerIdentity({ kind: 'customer_admin', campaign_id: UUID },
    { company_name: 'ACME SRL', title: 'Milano Bruzzano', city: 'Milano' });
  assert.equal(id.title, 'ACME SRL');
  assert.equal(id.subtitle.startsWith('Campagna Milano Bruzzano'), true);
  assert.equal(id.kindLabel, 'Cliente');
  assert.equal(id.technicalId, null);
  // dati reali di produzione: campaign_name/customer_name nulli, client_name presente
  const real = resolveCustomerIdentity({ campaign_id: UUID },
    { client_name: 'Fadioweidat', title: 'Campagna Preventivo (Fadioweidat)', city: 'Milano' });
  assert.equal(real.title, 'Fadioweidat');
  assert.match(real.subtitle, /^Campagna Preventivo \(Fadioweidat\)/);
  assert.doesNotMatch(real.title + real.subtitle, /#|dc5a5357/);
});

test('B. riga driver: operatore/gruppo, mai "Assignment #..." come titolo', () => {
  const named = resolveDriverIdentity({ assignment_id: '58bb64af-7929-4de1-8375-b43fa52519a4' },
    { operator_name: 'Mario Rossi', group_name: 'Milano Nord', title: 'Milano Bruzzano' });
  assert.equal(named.title, 'Mario Rossi · Milano Nord');
  assert.equal(named.subtitle, 'Campagna Milano Bruzzano');
  const group = resolveDriverIdentity({ assignment_id: '58bb64af-7929-4de1-8375-b43fa52519a4' },
    { group_name: 'postinipubblicitari', title: 'Campagna Preventivo (Fadioweidat)' });
  assert.equal(group.title, 'Gruppo postinipubblicitari');
  assert.equal(group.kindLabel, 'Driver');
  const operatorOnly = resolveDriverIdentity({}, { operator_name: 'Mario Rossi' });
  assert.equal(operatorOnly.title, 'Mario Rossi');
});

test('C. l\'ID tecnico compare solo come ultimo fallback (e mai un UUID travestito da nome)', () => {
  const nothing = resolveDriverIdentity({ assignment_id: '58bb64af-7929-4de1-8375-b43fa52519a4' }, {});
  assert.equal(nothing.title, 'Driver');
  assert.equal(nothing.technicalId, '58bb64af');
  // il directory RPC ripiega su a.id::text: non e' un nome
  const uuidName = resolveDriverIdentity({ assignment_id: 'x' }, { operator_name: '58bb64af-7929-4de1-8375-b43fa52519a4', group_name: 'Milano Nord' });
  assert.equal(uuidName.title, 'Gruppo Milano Nord');
  const noCustomer = resolveCustomerIdentity({ campaign_id: UUID }, {});
  assert.equal(noCustomer.title, 'Cliente');
  assert.equal(noCustomer.technicalId, 'dc5a5357');
});

test('D. header conversazione e righe usano l\'identita\' risolta, non piu\' "Campagna #"/"Assignment #"', () => {
  assert.match(commsPage, /resolveConversationIdentity\(c, identityDir\)/);
  assert.match(commsPage, /conversation-header-title/);
  assert.doesNotMatch(commsPage, /Assignment #|Campagna #\$\{/);
  assert.doesNotMatch(commsPage, /Cliente — /);
  const viaConv = resolveConversationIdentity(
    { kind: 'driver_admin', assignment_id: 'a1', campaign_id: 'c1' },
    { campaigns: { c1: { title: 'Milano Bruzzano' } }, assignments: { a1: { operator_name: 'Mario Rossi', group_name: 'Milano Nord' } } });
  assert.equal(viaConv.title, 'Mario Rossi · Milano Nord');
});

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('E. select zona cliente: testo opzioni leggibile su sfondo bianco (contrasto >= 7:1), niente <select> nativo bianco-su-bianco', () => {
  const c = ISSUE_ZONE_SELECT_COLORS;
  assert.ok(contrast(c.listText, c.listBackground) >= 7);
  assert.ok(contrast(c.selectedText, c.listBackground) >= 4.5);
  assert.match(customerPage, /<IssueZoneSelect zones=\{zones\}/);
  assert.doesNotMatch(customerPage, /<select value=\{form\.zoneId\}/);
  // il select "motivo" nativo ha opzioni con colore esplicito
  assert.match(customerPage, /style=\{\{ color: '#0f172a', background: '#ffffff' \}\}/);
});

test('F. la zona attiva NON mostra "Sessione gia\' attiva"; l\'errore reale e\' solo per la zona avviabile', () => {
  const errIdx = driverPage.indexOf('data-testid="zone-session-error"');
  assert.ok(errIdx > 0);
  const cond = driverPage.slice(errIdx - 260, errIdx);
  assert.match(cond, /activeSessionElsewhere && \(zoneCanStart \|\| zoneCanReopen\)/);
  assert.match(cond, /!isCurrentZone/);
});

const Z = (id, name, status = 'Da iniziare') => ({ id, zone_name: name, status });

test('G. zone future: stato neutro "Disponibile dopo ...", non rosso', () => {
  const zs = [Z('z1', 'BRUZZANO', 'In corso'), Z('z2', 'COMASINA'), Z('z3', 'PARCO NORD'), Z('z4', 'AFFORI')];
  const w = computeZoneWorkflow(zs, 'z1', true);
  assert.equal(w.waitingLabel(zs[0]), null, 'la zona in corso non ha etichetta di attesa');
  assert.equal(w.waitingLabel(zs[1]), 'Disponibile dopo BRUZZANO');
  assert.equal(w.waitingLabel(zs[2]), 'Disponibile dopo la zona precedente');
  assert.equal(w.waitingLabel(zs[3]), 'Disponibile dopo la zona precedente');
  const i = driverPage.indexOf('data-testid="zone-waiting-label"');
  assert.ok(i > 0);
  const style = driverPage.slice(i, i + 160);
  assert.doesNotMatch(style, /b91c1c|#ef4444|danger/);
});

test('H. un vero errore di sessione resta un errore rosso con role="alert"', () => {
  const i = driverPage.indexOf('data-testid="zone-session-error"');
  const block = driverPage.slice(i, i + 200);
  assert.match(block, /role="alert"/);
  assert.match(block, /#b91c1c/);
  assert.match(driverPage, /Sessione gia&#39; attiva per questo incarico/);
});

test('I/J. segnalazioni: attive separate dallo storico risolte, che resta visibile', () => {
  assert.match(driverPage, /'Segnalazioni attive'/);
  assert.match(driverPage, /'Storico risolte'/);
  assert.match(driverPage, /Nessuna segnalazione attiva\./);
  assert.match(driverPage, /\[\.\.\.activeIssues, \.\.\.futureIssues, \.\.\.doneIssues\]/);
  assert.match(driverPage, /Segnalazioni\{zoneLabel \? ` · \$\{zoneLabel\}` : ''\}/);
});

test('K. chat diretta cliente<->driver resta bloccata (driver scrive solo ad admin)', () => {
  assert.match(msgSql, /driver_send_message/);
  assert.match(msgSql, /recipient_role/);
  assert.doesNotMatch(commsPage, /customer_driver/);
});

test('L. logica server una-zona-alla-volta intatta (nessuna nuova migrazione, guard invariato)', () => {
  assert.match(guard, /ZONA_ALTRA_IN_CORSO/);
  assert.match(guard, /ZONA_PRECEDENTE_NON_COMPLETATA/);
  assert.doesNotMatch(commsPage + rd('../src/lib/services/communicationIdentityApi.js'), /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
