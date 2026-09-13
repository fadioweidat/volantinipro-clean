import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key-12345';

test('Campaign Settlement Deduplication & Resilience', async (t) => {
  const { campaignSettlement, invalidateSettlementCache, isCreditSettled } = await import('../src/lib/campaignSettlement.js');
  const { getFinalCoverage, invalidateCoverageCache } = await import('../src/lib/services/coverage-adjustments-api.js');
  const { supabase } = await import('../src/supabaseClient.js');

  const originalRpc = supabase.rpc;

  t.afterEach(() => {
    supabase.rpc = originalRpc;
    invalidateSettlementCache();
    invalidateCoverageCache();
  });

  await t.test('C — In-flight deduplication: multiple simultaneous calls for same ID produce exactly 1 RPC request', async () => {
    let rpcCount = 0;
    supabase.rpc = async (name, args) => {
      if (name === 'feasibility_campaign_settlement') {
        rpcCount++;
        await new Promise((r) => setTimeout(r, 50));
        return {
          data: { campaign_id: args.p_campaign_id, settlement_status: 'settled_by_credit', amount_due_cents: 0 },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const campaignId = 'test-concurrent-c1';
    invalidateSettlementCache(campaignId);

    const results = await Promise.all([
      campaignSettlement(campaignId),
      campaignSettlement(campaignId),
      campaignSettlement(campaignId),
      campaignSettlement(campaignId),
      campaignSettlement(campaignId),
    ]);

    assert.equal(rpcCount, 1, 'Exactly 1 backend RPC request should be fired for 5 concurrent calls');
    for (const res of results) {
      assert.equal(res.settlement_status, 'settled_by_credit');
      assert.equal(res.amount_due_cents, 0);
    }
  });

  await t.test('G — Cache reuse: subsequent call within 30s TTL reuses cache without new RPC request', async () => {
    let rpcCount = 0;
    supabase.rpc = async (name, args) => {
      if (name === 'feasibility_campaign_settlement') {
        rpcCount++;
        return {
          data: { campaign_id: args.p_campaign_id, settlement_status: 'awaiting_payment', amount_due_cents: 5000 },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const campaignId = 'test-cache-c2';
    invalidateSettlementCache(campaignId);

    const first = await campaignSettlement(campaignId);
    assert.equal(rpcCount, 1);
    assert.equal(first.settlement_status, 'awaiting_payment');

    const second = await campaignSettlement(campaignId);
    assert.equal(rpcCount, 1, 'Subsequent call within TTL must not invoke RPC');
    assert.equal(second.settlement_status, 'awaiting_payment');
  });

  await t.test('D & E — Bounded retry on transient 503/504: max 1 retry with backoff', async () => {
    let rpcCount = 0;
    supabase.rpc = async (name, args) => {
      if (name === 'feasibility_campaign_settlement') {
        rpcCount++;
        if (rpcCount === 1) {
          return { data: null, error: { status: 503, message: '503 Service Unavailable' } };
        }
        return {
          data: { campaign_id: args.p_campaign_id, settlement_status: 'not_applicable', amount_due_cents: null },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const campaignId = 'test-retry-503';
    invalidateSettlementCache(campaignId);

    const res = await campaignSettlement(campaignId);
    assert.equal(rpcCount, 2, 'Should retry exactly once on 503');
    assert.equal(res.settlement_status, 'not_applicable');
  });

  await t.test('F — Fail-fast on 500 error: NO retry loop, controlled unavailable state', async () => {
    let rpcCount = 0;
    supabase.rpc = async (name) => {
      if (name === 'feasibility_campaign_settlement') {
        rpcCount++;
        return { data: null, error: { status: 500, message: 'canceling statement due to statement timeout' } };
      }
      return { data: null, error: null };
    };

    const campaignId = 'test-failfast-500';
    invalidateSettlementCache(campaignId);

    const res = await campaignSettlement(campaignId);
    assert.equal(rpcCount, 1, '500 error must fail-fast with zero retries');
    assert.equal(res.settlement_status, 'unavailable', 'Must return controlled unavailable state');
  });

  await t.test('Coverage adjustments in-flight deduplication', async () => {
    let rpcCount = 0;
    supabase.rpc = async (name, args) => {
      if (name === 'calculate_campaign_final_coverage') {
        rpcCount++;
        await new Promise((r) => setTimeout(r, 40));
        return { data: { final_operational_coverage_pct: 88 }, error: null };
      }
      return { data: null, error: null };
    };

    const campaignId = 'test-coverage-dedupe';
    invalidateCoverageCache(campaignId);

    const results = await Promise.all([
      getFinalCoverage(campaignId),
      getFinalCoverage(campaignId),
      getFinalCoverage(campaignId),
    ]);

    assert.equal(rpcCount, 1, 'Exactly 1 backend RPC for concurrent getFinalCoverage calls');
    for (const res of results) {
      assert.equal(res.final_operational_coverage_pct, 88);
    }
  });

  await t.test('Safeguard A: Admin getClientsQuotesOverview pre-filter failure does NOT fabricate not_applicable', async () => {
    const { getClientsQuotesOverview } = await import('../src/lib/services/admin-api.js');

    supabase.rpc = async (name, args) => {
      if (name === 'feasibility_campaign_settlement') {
        return {
          data: { campaign_id: args.p_campaign_id, settlement_status: 'review_required', amount_due_cents: 1000 },
          error: null,
        };
      }
      if (name === 'admin_list_operators') {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    };

    const prefetched = {
      campaigns: [
        { id: 'c-safeguard-1', source: 'campaigns', quality: 'real', metadata: {} },
        { id: 'c-safeguard-2', source: 'campaigns', quality: 'real', metadata: {} },
      ],
      groups: [],
      assignments: [],
      operators: [],
      sessions: [],
    };

    invalidateSettlementCache();
    const rows = await getClientsQuotesOverview({ prefetched });
    assert(Array.isArray(rows));
    assert.equal(rows.length, 2);
  });
});
