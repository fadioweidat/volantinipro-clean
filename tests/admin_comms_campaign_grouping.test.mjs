import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveCommunicationCampaign, groupCommunicationsByCampaign } from '../src/lib/admin/communicationCampaignGroups.js';
import { resolveConversationIdentity } from '../src/lib/admin/communicationIdentity.js';

const CAMPAIGN = 'acfb1dd9-6d89-4d4b-a5d7-420bc3010100';
const SECOND = 'df9c4bc9-0000-4000-8000-000000000000';
const dir = {
  assignments: {
    driver1: { campaign_id: CAMPAIGN, operator_name: 'Operatore 1' },
    driver2: { campaign_id: CAMPAIGN, operator_name: 'Operatore 2' },
  },
  campaigns: {
    [CAMPAIGN]: {
      title: 'Campagna Preventivo (Cliente)',
      real_zone_names: ['BRUZZANO'],
      city: 'Milano', customer_name: 'Cliente Test',
    },
    [SECOND]: { campaign_name: 'Palestra Centro', city: 'Milano' },
  },
};
const linked = [
  { key: 'client-1', id: 'client-1', kind: 'customer_admin', campaign_id: CAMPAIGN, unread_count: 2 },
  { key: 'driver-1', id: 'driver-1', kind: 'driver_admin', campaign_id: null, assignment_id: 'driver1', unread_count: 1 },
  { key: 'driver-2', id: 'driver-2', kind: 'driver_admin', assignment_id: 'driver2', unread_count: 0 },
].map(c => {
  const restored = resolveCommunicationCampaign(c, dir);
  return { ...restored, identity: resolveConversationIdentity(restored, dir) };
});

test('relink real Driver conversations from the assignment campaign, not from name or city', () => {
  assert.equal(linked[1].campaign_id, CAMPAIGN);
  assert.equal(linked[2].campaign_id, CAMPAIGN);
  assert.equal(linked[1].identity.campaign, linked[0].identity.campaign);
  assert.equal(linked[1].identity.campaign, 'Distribuzione volantini · BRUZZANO');
});

test('one card per campaign contains Cliente and multiple separate Driver threads', () => {
  const groups = groupCommunicationsByCampaign(linked);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, `campaign:${CAMPAIGN}`);
  assert.equal(groups[0].unreadCount, 3);
  assert.equal(groups[0].label, 'Distribuzione volantini · BRUZZANO');
  assert.equal(groups[0].location, 'BRUZZANO');
  assert.deepEqual(groups[0].conversations.map(c => c.key), ['client-1', 'driver-1', 'driver-2']);
});

test('real specific campaign name is shown instead of generic quote title', () => {
  const c = { key: 'gym-1', kind: 'customer_admin', id: 'gym-1', campaign_id: SECOND };
  const withIdentity = { ...c, identity: resolveConversationIdentity(c, dir) };
  const groups = groupCommunicationsByCampaign([withIdentity]);
  assert.equal(groups[0].label, 'Campagna Palestra Centro');
});

test('separate campaigns never merge even when customer, driver or location is identical', () => {
  const sameName = { key: 'new-1', kind: 'customer_admin', campaign_id: SECOND, customer_name: 'Cliente Test', city: 'Milano' };
  const unlinked = { key: 'orphan-driver', kind: 'driver_admin', assignment_id: 'unknown', operator_name: 'Operatore 1' };
  assert.equal(resolveCommunicationCampaign(unlinked, dir).campaign_id, undefined);
  const groups = groupCommunicationsByCampaign([...linked, sameName, unlinked]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find(g => g.campaignId === CAMPAIGN).conversations.length, 3);
  assert.equal(groups.find(g => g.campaignId === SECOND).conversations.length, 1);
  assert.equal(groups.find(g => g.key === 'unlinked:orphan-driver').conversations.length, 1);
});

test('UI keeps messages separated and uses one campaign card with nested thread buttons', () => {
  const hub = fs.readFileSync(new URL('../src/pages/admin/communications/AdminCommunicationsPage.jsx', import.meta.url), 'utf8');
  const identityApi = fs.readFileSync(new URL('../src/lib/services/communicationIdentityApi.js', import.meta.url), 'utf8');
  assert.match(hub, /data-testid="campaign-conversation-card"/);
  assert.match(hub, /group\.conversations\.map\(\(c\) =>/);
  assert.match(hub, /<ConversationDetail key=\{selectedConversation\.key\}/);
  assert.match(hub, /adminSendDriverMessage\(\{ assignmentId: conversation\.assignment_id/);
  assert.match(hub, /adminSendMessage\(\{ conversationId/);
  assert.doesNotMatch(hub, /customer_driver/);
  assert.match(identityApi, /\.select\('id, campaign_id, participant_label'/);
  assert.match(identityApi, /real_zone_names:/);
});
