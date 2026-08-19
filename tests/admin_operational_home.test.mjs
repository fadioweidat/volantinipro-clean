import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildOperationalGroups,
  buildTodayGroupCards,
  presenceForGroup,
  programStateForAssignments,
} from '../src/lib/admin/adminHomeModel.js';
import { buildDriverWhatsAppMessage } from '../src/lib/services/admin-api.js';

const dashboard = readFileSync(new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8');
// La gestione gruppi e il wizard "Nuovo programma" sono stati spostati dalla
// Home (control-center a 6 moduli) a una pagina dedicata /admin/groups: le
// asserzioni sul wizard/gruppo vuoto ora leggono GroupsManager.jsx, non piu'
// AdminDashboard.jsx, dove quel markup non esiste piu'.
const groupsManager = readFileSync(new URL('../src/pages/admin/GroupsManager.jsx', import.meta.url), 'utf8');
const assignWork = readFileSync(new URL('../src/pages/admin/AssignWork.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/admin/admin-dashboard.css', import.meta.url), 'utf8');

test('today model groups real assignments and sums ordered zone quantities', () => {
  const operations = [{
    id: 'assignment-1', group_id: 'group-1', campaign_id: 'campaign-1', operator_id: 'operator-1',
    operational_groups: { name: 'Gruppo Nord' }, campaigns: { title: 'Campagna Milano' },
    operator_profiles: { display_name: 'Mario' }, starts_at: '2026-08-13T08:00:00Z',
    zones: [{ name: 'Varedo', quantity: 3000, priority: 2 }, { name: 'Cormano', quantity: 2000, priority: 1 }],
    sessions: [], alerts: [], programSentAt: '2026-08-12T10:00:00Z',
  }];
  const cards = buildTodayGroupCards({ operations, operators: [{ id: 'operator-1', phone: '+3900000000' }] });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].quantity, 5000);
  assert.equal(cards[0].zoneLabel, 'Cormano, Varedo');
  assert.equal(cards[0].program.key, 'sent');
  assert.equal(cards[0].phone, '+3900000000');
});

test('presence does not invent offline state without a reliable live signal', () => {
  assert.equal(presenceForGroup('group-1', []).key, 'unavailable');
  assert.equal(presenceForGroup('group-1', [{ lifecycle: 'live', group: { id: 'group-1' } }]).key, 'online');
  assert.equal(presenceForGroup('group-1', [{ lifecycle: 'offline_recent', session: { group_id: 'group-1' } }]).key, 'offline');
});

test('program state follows prepared, sent, opened and confirmed events', () => {
  assert.equal(programStateForAssignments([{ id: 'a' }]).key, 'prepared');
  assert.equal(programStateForAssignments([{ programSentAt: 'x' }]).key, 'sent');
  assert.equal(programStateForAssignments([{ programOpenedAt: 'x' }]).key, 'opened');
  assert.equal(programStateForAssignments([{ programConfirmedAt: 'x' }]).key, 'confirmed');
});

test('group membership uses active assignments while retaining historical count', () => {
  const groups = buildOperationalGroups({
    groups: [{ id: 'g', campaign_id: 'c', name: 'Gruppo' }],
    campaigns: [{ id: 'c', name: 'Campagna' }],
    operators: [{ id: 'active', display_name: 'Attivo' }, { id: 'past', display_name: 'Storico' }],
    assignments: [
      { id: 'a1', group_id: 'g', operator_id: 'active', status: 'active', revoked_at: null },
      { id: 'a2', group_id: 'g', operator_id: 'past', status: 'revoked', revoked_at: '2026-08-12T00:00:00Z' },
    ],
  });
  assert.deepEqual(groups[0].members.map((item) => item.id), ['active']);
  assert.equal(groups[0].historicalMemberCount, 2);
});

test('WhatsApp program contains only supplied order, total, start and real assignment link', () => {
  const message = buildDriverWhatsAppMessage({
    operatorName: 'Mario', groupName: 'Gruppo Nord', campaignTitle: 'Campagna Milano',
    date: '13/08/2026', startTime: '08:30', qty: 5000,
    programRows: [{ name: 'Cormano', quantity: 2000 }, { name: 'Varedo', quantity: 3000 }],
    link: 'https://www.volantinipro.it/driver/assignment/a1',
  });
  assert.match(message, /1\. Cormano/);
  assert.match(message, /2\. Varedo/);
  assert.match(message, /(?:5000|5\.000) volantini/);
  assert.match(message, /08:30/);
  assert.match(message, /\/driver\/assignment\/a1/);
});

test('dashboard reuses existing assignment flow, central operations and real event states', () => {
  assert.match(groupsManager, /<AssignWork/);
  assert.match(dashboard, /href="\/admin\/operations"/);
  assert.match(dashboard, /sent.*opened/);
  assert.match(dashboard, /Non viene registrato come inviato/);
  assert.match(assignWork, /getCampaignZonesWithGroups/);
  assert.match(assignWork, /createOperatorAssignment/);
  assert.match(assignWork, /setAssignmentZones/);
});

test('empty group state creates and selects a campaign-specific group inside the wizard', () => {
  assert.match(groupsManager, /Nessun gruppo configurato\./);
  assert.match(groupsManager, /\+ Crea gruppo/);
  assert.match(assignWork, /createOperationalGroup/);
  assert.match(assignWork, /setSelectedGroupId\(group\.id\)/);
  assert.match(assignWork, /setSelectedOperatorId\(lead\.id\)/);
});

test('wizard explains why next is disabled and keeps group distinct from contact person', () => {
  assert.match(assignWork, /Prima crea o seleziona un gruppo\./);
  assert.match(assignWork, /selectedGroupId && selectedOperatorId/);
  assert.match(assignWork, /groupId: selectedGroupId/);
  assert.match(assignWork, /operatorId: selectedOperatorId/);
});

test('mobile layout collapses operational cards to one column without tables', () => {
  assert.match(css, /@media\s*\(max-width:\s*460px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.doesNotMatch(dashboard, /<table/i);
  assert.doesNotMatch(css, /min-width:\s*[5-9]\d{2}px/);
});
