import { ensureSupabaseSessionBridge, supabase } from '../supabaseClient.js';

const settlementCache = new Map();
const inFlightSettlement = new Map();
const SETTLEMENT_CACHE_TTL_MS = 30_000;

function isTransientError(err) {
  if (!err) return false;
  const status = Number(err.status || err.statusCode);
  if (status >= 400 && status < 503) return false;
  if (status === 500) return false;
  if (status === 503 || status === 504) return true;
  const msg = String(err.message || err.details || '');
  if (/canceling statement|statement timeout|relation.*does not exist|syntax error|permission denied/i.test(msg)) return false;
  return /503|504|gateway timeout|service unavailable|network error|failed to fetch|fetch failed/i.test(msg);
}

export function invalidateSettlementCache(campaignId) {
  if (campaignId) {
    settlementCache.delete(campaignId);
    inFlightSettlement.delete(campaignId);
  } else {
    settlementCache.clear();
    inFlightSettlement.clear();
  }
}

export async function campaignSettlement(campaignId, { forceFresh = false } = {}) {
  if (!campaignId) return { settlement_status: 'not_applicable', amount_due_cents: null };
  const now = Date.now();
  if (!forceFresh && settlementCache.has(campaignId)) {
    const cached = settlementCache.get(campaignId);
    if (now - cached.timestamp < SETTLEMENT_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  if (!forceFresh && inFlightSettlement.has(campaignId)) {
    return inFlightSettlement.get(campaignId);
  }

  const promise = (async () => {
    await ensureSupabaseSessionBridge();
    let attempt = 0;
    const maxAttempts = 2; // 1 initial + max 1 bounded retry for transient 503/504
    while (attempt < maxAttempts) {
      attempt++;
      try {
        const { data, error } = await supabase.rpc('feasibility_campaign_settlement', { p_campaign_id: campaignId });
        if (!error && data) {
          const result = data;
          settlementCache.set(campaignId, { timestamp: Date.now(), data: result });
          return result;
        }
        if (error) {
          if (isTransientError(error) && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          // 500, 400 or exhausted retries: fail fast with controlled error status
          const fallback = { settlement_status: 'unavailable', amount_due_cents: null, error: error.message };
          // Cooldown cache (2s) to prevent tight render-loop storms without locking out for 30s
          settlementCache.set(campaignId, { timestamp: Date.now() - (SETTLEMENT_CACHE_TTL_MS - 2000), data: fallback });
          return fallback;
        }
        const fallback = { settlement_status: 'unavailable', amount_due_cents: null };
        settlementCache.set(campaignId, { timestamp: Date.now(), data: fallback });
        return fallback;
      } catch (exc) {
        if (isTransientError(exc) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        const fallback = { settlement_status: 'unavailable', amount_due_cents: null, error: exc?.message };
        settlementCache.set(campaignId, { timestamp: Date.now() - (SETTLEMENT_CACHE_TTL_MS - 2000), data: fallback });
        return fallback;
      }
    }
  })();

  inFlightSettlement.set(campaignId, promise);
  try {
    return await promise;
  } finally {
    inFlightSettlement.delete(campaignId);
  }
}

export const isCreditSettled = s => ['settled_by_credit','settled_by_verified_receipt'].includes(s?.settlement_status);

export async function withCampaignSettlement(campaign, options = {}) {
  if (!campaign) return campaign;
  const settlement = await campaignSettlement(campaign.id, options);
  if (settlement.settlement_status === 'not_applicable') return { ...campaign, settlement };
  return {
    ...campaign,
    settlement,
    amount_due_euro: settlement.amount_due_cents == null ? null : settlement.amount_due_cents / 100,
    stato_pagamento: isCreditSettled(settlement)
      ? settlement.settlement_status
      : settlement.settlement_status === 'awaiting_payment' ? 'in_attesa' : 'review_required',
  };
}

