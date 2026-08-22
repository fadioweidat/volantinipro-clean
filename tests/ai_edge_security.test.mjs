import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  canAccessCampaign,
  isAdminProfile,
} from '../supabase/functions/_shared/aiAuthorization.ts';

const adminSource = fs.readFileSync('supabase/functions/ai-admin-copilot/index.ts', 'utf8');
const reportSource = fs.readFileSync('supabase/functions/ai-campaign-report/index.ts', 'utf8');
const territorySource = fs.readFileSync('supabase/functions/ai-assistant-territory/index.ts', 'utf8');
const cacheMigration = fs.readFileSync('supabase/migrations_legacy_pre_rebaseline_20260821/036_ai_territorial_chat_cache.sql', 'utf8');
const reportMigration = fs.readFileSync('supabase/migrations_legacy_pre_rebaseline_20260821/037_campaign_ai_report.sql', 'utf8');

test('AI Copilot: solo profiles.role admin è autorizzato', () => {
  assert.equal(isAdminProfile({ role: 'admin' }), true);
  assert.equal(isAdminProfile({ role: 'client' }), false);
  assert.equal(isAdminProfile({ role: 'staff' }), false);
  assert.equal(isAdminProfile(null), false);
});

test('AI Copilot: il controllo server-side precede payload e OpenAI', () => {
  const authIndex = adminSource.indexOf('getAuthedUser(req)');
  const profileIndex = adminSource.indexOf('.from("profiles")');
  const forbiddenIndex = adminSource.indexOf('error: "FORBIDDEN"');
  const payloadIndex = adminSource.indexOf('const body = await req.json()');
  const openAiIndex = adminSource.lastIndexOf('callOpenAi(dashboardData, warnings)');
  assert(authIndex >= 0 && profileIndex > authIndex);
  assert(forbiddenIndex > profileIndex && payloadIndex > forbiddenIndex);
  assert(openAiIndex > payloadIndex);
  assert.match(adminSource, /error: "FORBIDDEN" \}, 403/);
});

test('AI Campaign Report: proprietario e Admin autorizzati, altro Cliente bloccato', () => {
  const campaign = { user_id: 'owner-id' };
  assert.equal(canAccessCampaign('owner-id', campaign, { role: 'client' }), true);
  assert.equal(canAccessCampaign('other-id', campaign, { role: 'client' }), false);
  assert.equal(canAccessCampaign('admin-id', campaign, { role: 'admin' }), true);
});

test('AI Campaign Report: ownership DB precede cache, OpenAI e persistenza', () => {
  const lookupIndex = reportSource.indexOf('.from("campaigns")');
  const authorizationIndex = reportSource.indexOf('canAccessCampaign(user.id, campaign, profile)');
  const forbiddenIndex = reportSource.indexOf('error: "FORBIDDEN"');
  const cacheIndex = reportSource.indexOf('if (campaign.ai_summary)');
  const openAiIndex = reportSource.lastIndexOf('callOpenAi(campaign, warnings)');
  const updateIndex = reportSource.indexOf('.update({');
  assert(lookupIndex >= 0 && authorizationIndex > lookupIndex);
  assert(forbiddenIndex > authorizationIndex && cacheIndex > forbiddenIndex);
  assert(openAiIndex > cacheIndex && updateIndex > openAiIndex);
  assert.match(reportSource, /error: "FORBIDDEN" \}, 403/);
  assert.doesNotMatch(reportSource, /body\?\.campaignData/);
});

test('AI Campaign Report: persistenza è obbligatoria e coperta dallo schema', () => {
  assert.match(reportSource, /ai_summary: aiResult\.summary/);
  assert.match(reportSource, /ai_suggestions: aiResult\.suggestions/);
  assert.match(reportSource, /error: "PERSISTENCE_FAILED" \}, 500/);
  assert.match(reportMigration, /add column if not exists ai_summary text/i);
  assert.match(reportMigration, /add column if not exists ai_suggestions jsonb/i);
});

test('AI territoriale: cache è per utente e payload e restituisce ai_cached', () => {
  assert.match(territorySource, /\.from\("ai_territorial_chat_cache"\)/);
  assert.match(territorySource, /\.eq\("payload_hash", payloadHash\)/);
  assert.match(territorySource, /\.eq\("user_id", user\.id\)/);
  assert.match(territorySource, /status: "ai_cached"/);
  assert.match(territorySource, /user_id: user\.id/);
  assert.match(cacheMigration, /unique \(user_id, payload_hash\)/i);
});
