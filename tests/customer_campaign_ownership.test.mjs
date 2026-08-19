import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const submitFunction = readFileSync(new URL('../supabase/functions/submit-campaign-request/index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/lib/supabaseClient.js', import.meta.url), 'utf8');
const step4 = readFileSync(new URL('../src/pages/public/configurator/Step4.jsx', import.meta.url), 'utf8');
const claimMigration = readFileSync(new URL('../supabase/migrations/20260817120000_claim_public_campaign_rpc.sql', import.meta.url), 'utf8');
const useCampagne = readFileSync(new URL('../src/hooks/useCampagne.js', import.meta.url), 'utf8');

test('authenticated campaign submission derives ownership from verified JWT, never from request body', () => {
  assert.match(submitFunction, /supabase\.auth\.getUser\(token\)/);
  assert.match(submitFunction, /authenticatedEmail === clientEmail\.trim\(\)\.toLowerCase\(\)/);
  assert.match(submitFunction, /user_id: authenticatedOwnerId/);
  assert.doesNotMatch(submitFunction, /user_id:\s*body\./);
});

test('SDK session is bridged before submit-campaign-request invocation', () => {
  const bridge = client.indexOf('await ensureSupabaseSessionBridge();', client.indexOf('export async function submitPublicCampaign'));
  const invoke = client.indexOf("sdkSupabase.functions.invoke('submit-campaign-request'", bridge);
  assert.ok(bridge >= 0 && invoke > bridge);
});

test('campaign confirmation has a synchronous in-flight guard against duplicate inserts', () => {
  assert.match(step4, /if \(!canConfirm \|\| campaignSaveInFlightRef\.current\) return/);
  assert.match(step4, /campaignSaveInFlightRef\.current = true/);
  assert.match(step4, /finally \{[\s\S]*campaignSaveInFlightRef\.current = false/);
});

// P0-A regression: an anonymous Step1-4 submit persists user_id = NULL
// (proven live on 2026-08-17, campaign caabb1a4-a9bd-47c7-9755-78975ac45858)
// and nothing ever relinked it, so it stayed permanently invisible in the
// Customer Dashboard. These tests guard the fix: a per-campaign claim,
// triggered on next authenticated Dashboard load, never a bulk email claim.

test('Step4 stores a pending claim for the specific new campaign id + email after a successful submit, not before', () => {
  const submitIdx = step4.indexOf('const res = await submitPublicCampaign(payload);');
  const pendingClaimIdx = step4.indexOf("localStorage.setItem(\"volantinipro_pending_campaign_claim\"");
  assert.ok(submitIdx >= 0 && pendingClaimIdx > submitIdx, 'pending claim must be stored only after submit resolves');
  assert.match(step4, /localStorage\.setItem\("volantinipro_pending_campaign_claim",\s*JSON\.stringify\(\{\s*campaignId:\s*id,\s*clientEmail:\s*clientForm\.email,?\s*\}\)\)/);
});

test('claim_public_campaign RPC requires auth, a verified email, an unowned row, and an exact email match', () => {
  assert.match(claimMigration, /security definer/i);
  assert.match(claimMigration, /auth\.uid\(\)/);
  assert.match(claimMigration, /raise exception 'AUTH_REQUIRED'/);
  assert.match(claimMigration, /email_confirmed_at is not null/);
  assert.match(claimMigration, /raise exception 'EMAIL_NOT_VERIFIED'/);
  assert.match(claimMigration, /where id = p_campaign_id\s*\n\s*and user_id is null/);
  assert.match(claimMigration, /lower\(client_email\) = lower\(v_email\)/);
  assert.match(claimMigration, /raise exception 'CLAIM_NOT_ALLOWED'/);
  // Least privilege: anon must not be able to invoke it at all (the internal
  // auth.uid() check alone is not treated as sufficient here).
  assert.match(claimMigration, /revoke execute on function public\.claim_public_campaign\(uuid\) from anon/);
});

test('Customer Dashboard load attempts exactly one per-campaign claim before querying, never a bulk claim by email alone', () => {
  const claimFnIdx = useCampagne.indexOf('async function claimPendingCampaignIfAny');
  const rpcCallIdx = useCampagne.indexOf("supabase.rpc('claim_public_campaign'", claimFnIdx);
  const queryIdx = useCampagne.indexOf(".from('campaigns')", claimFnIdx);
  assert.ok(claimFnIdx >= 0 && rpcCallIdx > claimFnIdx, 'claim must be attempted via the campaign_id-scoped RPC');
  assert.match(useCampagne, /supabase\.rpc\('claim_public_campaign',\s*\{\s*p_campaign_id:\s*pending\.campaignId\s*\}\)/);
  // Never a query/RPC that claims by email/user alone without a specific campaign id.
  assert.doesNotMatch(useCampagne, /claim.*\beq\(\s*['"]client_email['"]/i);
  const claimCallInLoad = useCampagne.indexOf('await claimPendingCampaignIfAny(authData.user)');
  assert.ok(claimCallInLoad > 0 && queryIdx > claimCallInLoad, 'claim must run before the campaigns query so the newly claimed row is included in the same load');
});
