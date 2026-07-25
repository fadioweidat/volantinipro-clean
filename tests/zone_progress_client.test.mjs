import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ZoneProgressError,
  createZoneProgressClient,
  isZoneProgressAuthorizationError,
} from '../src/lib/services/zone-progress-api.js';

const CAMPAIGN_ID = '30000000-0000-0000-0000-00000000000a';
const ZONE_ID = '40000000-0000-0000-0000-00000000000a';

test('zone progress client calls the three RPCs with exact typed arguments', async () => {
  const calls = [];
  const rpcRows = {
    get_campaign_zone_progress: [{
      campaign_zone_id: ZONE_ID,
      campaign_id: CAMPAIGN_ID,
      zone_name: 'Centro',
      address_label: 'Milano',
      effective_percent: '37.50',
      updated_at: null,
    }],
    admin_set_zone_manual_progress: {
      campaign_zone_id: ZONE_ID,
      campaign_id: CAMPAIGN_ID,
      effective_percent: '55',
      manual_percent: '55',
      manual_override_enabled: true,
    },
    admin_clear_zone_manual_progress: {
      campaign_zone_id: ZONE_ID,
      campaign_id: CAMPAIGN_ID,
      effective_percent: '20',
      manual_percent: null,
      manual_override_enabled: false,
    },
  };
  const client = createZoneProgressClient({
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: rpcRows[name], error: null };
    },
  });

  const zones = await client.getCampaignZoneProgress(CAMPAIGN_ID);
  const setRow = await client.setZoneManualProgress(ZONE_ID, '55', ' Verifica area ');
  const clearRow = await client.clearZoneManualProgress(ZONE_ID, ' Fine verifica ');

  assert.equal(zones[0].effective_percent, 37.5);
  assert.equal(setRow.manual_percent, 55);
  assert.equal(clearRow.manual_override_enabled, false);
  assert.deepEqual(calls, [
    {
      name: 'get_campaign_zone_progress',
      args: { p_campaign_id: CAMPAIGN_ID },
    },
    {
      name: 'admin_set_zone_manual_progress',
      args: {
        p_campaign_zone_id: ZONE_ID,
        p_manual_percent: 55,
        p_reason: 'Verifica area',
      },
    },
    {
      name: 'admin_clear_zone_manual_progress',
      args: {
        p_campaign_zone_id: ZONE_ID,
        p_reason: 'Fine verifica',
      },
    },
  ]);
});

test('zone progress client validates ids, percentage, and reason before RPC', async () => {
  let rpcCalls = 0;
  const client = createZoneProgressClient({
    async rpc() {
      rpcCalls += 1;
      return { data: null, error: null };
    },
  });

  await assert.rejects(
    client.getCampaignZoneProgress('not-a-uuid'),
    (error) => error instanceof ZoneProgressError && error.code === 'zone_progress_invalid_id',
  );
  await assert.rejects(
    client.setZoneManualProgress(ZONE_ID, 101, 'Motivo'),
    (error) => error.code === 'zone_progress_invalid_percent',
  );
  await assert.rejects(
    client.clearZoneManualProgress(ZONE_ID, '   '),
    (error) => error.code === 'zone_progress_reason_required',
  );
  assert.equal(rpcCalls, 0);
});

test('zone progress client maps authorization and backend errors safely', async () => {
  const forbidden = createZoneProgressClient({
    async rpc() {
      return { data: null, error: { code: '42501', message: 'CAMPAGNA_NON_AUTORIZZATA' } };
    },
  });
  await assert.rejects(
    forbidden.getCampaignZoneProgress(CAMPAIGN_ID),
    (error) => isZoneProgressAuthorizationError(error) && !error.message.includes('CAMPAGNA_NON_AUTORIZZATA'),
  );

  const generic = createZoneProgressClient({
    async rpc() {
      return { data: null, error: { code: 'XX000', message: 'internal detail' } };
    },
  });
  await assert.rejects(
    generic.getCampaignZoneProgress(CAMPAIGN_ID),
    (error) => error.code === 'zone_progress_request_failed' && !error.message.includes('internal detail'),
  );
});

test('history reader uses only the Admin history policy surface', async () => {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(['select', columns]);
      return this;
    },
    eq(column, value) {
      calls.push(['eq', column, value]);
      return this;
    },
    order(column, options) {
      calls.push(['order', column, options]);
      return this;
    },
    async limit(value) {
      calls.push(['limit', value]);
      return {
        data: [{
          id: 'history-1',
          campaign_zone_id_snapshot: ZONE_ID,
          campaign_id_snapshot: CAMPAIGN_ID,
          event_type: 'manual_override',
          old_effective_percent: '10',
          new_effective_percent: '55',
          reason: 'Verifica',
          created_at: '2026-07-25T12:00:00Z',
        }],
        error: null,
      };
    },
  };
  const client = createZoneProgressClient({
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'campaign_zone_progress_history');
      return query;
    },
  });

  const history = await client.getCampaignZoneProgressHistory(CAMPAIGN_ID);
  assert.equal(history.length, 1);
  assert.equal(history[0].new_effective_percent, 55);
  assert.deepEqual(calls.find((entry) => entry[0] === 'eq'), [
    'eq',
    'campaign_id_snapshot',
    CAMPAIGN_ID,
  ]);
  assert.equal(calls.some((entry) => entry[1] === 'campaign_zone_progress'), false);
});

test('zone progress client fails closed on malformed progress and history shapes', async () => {
  const malformedProgress = createZoneProgressClient({
    async rpc() {
      return { data: [{ campaign_zone_id: ZONE_ID, campaign_id: CAMPAIGN_ID }], error: null };
    },
  });
  await assert.rejects(
    malformedProgress.getCampaignZoneProgress(CAMPAIGN_ID),
    (error) => error.code === 'zone_progress_invalid_response',
  );

  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    async limit() { return { data: null, error: null }; },
  };
  const malformedHistory = createZoneProgressClient({
    from() {
      return query;
    },
  });
  await assert.rejects(
    malformedHistory.getCampaignZoneProgressHistory(CAMPAIGN_ID),
    (error) => error.code === 'zone_progress_invalid_response',
  );
});
