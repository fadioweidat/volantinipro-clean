import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CUSTOMER_PAYMENT_STATE, getCustomerPaymentState, normalizeCustomerCampaign } from '../src/lib/customerCampaigns.js';
import { resolveAppRoute } from '../src/app/routeResolution.js';

const supabaseClientSdk = readFileSync(new URL('../src/supabaseClient.js', import.meta.url), 'utf8');
const useCliente = readFileSync(new URL('../src/hooks/useCliente.js', import.meta.url), 'utf8');
const useCampagne = readFileSync(new URL('../src/hooks/useCampagne.js', import.meta.url), 'utf8');
const dashboardMonolith = readFileSync(new URL('../volantinipro-final.jsx', import.meta.url), 'utf8');

test('Customer adapter preserves missing, zero and positive values', () => {
  const missing = normalizeCustomerCampaign({ id: 'a', status: 'draft', metadata: {} });
  const zero = normalizeCustomerCampaign({ id: 'b', status: 'approved', quantity: 0, total_amount: 0, metadata: { payment_status: 'in_attesa' } });
  const positive = normalizeCustomerCampaign({ id: 'c', status: 'in_progress', quantity: 1250, total_amount: 420.5, metadata: {} });
  assert.equal(missing.quantita, null);
  assert.equal(missing.totale_euro, null);
  assert.equal(zero.quantita, 0);
  assert.equal(zero.totale_euro, 0);
  assert.equal(zero.stato_pagamento, 'in_attesa');
  assert.equal(positive.quantita, 1250);
  assert.equal(positive.totale_euro, 420.5);
});

test('Payment KPI e card condividono la stessa regola e null resta non disponibile', () => {
  assert.equal(getCustomerPaymentState('pagato'), CUSTOMER_PAYMENT_STATE.PAID);
  assert.equal(getCustomerPaymentState('in_attesa'), CUSTOMER_PAYMENT_STATE.PENDING);
  assert.equal(getCustomerPaymentState('in_attesa_pagamento'), CUSTOMER_PAYMENT_STATE.PENDING);
  assert.equal(getCustomerPaymentState(null), CUSTOMER_PAYMENT_STATE.UNAVAILABLE);
  assert.equal(getCustomerPaymentState('stato_sconosciuto'), CUSTOMER_PAYMENT_STATE.UNAVAILABLE);
});

test('Customer routes are explicit and invalid routes never fall through to home', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(resolveAppRoute('/dashboard'), 'dashboard');
  assert.equal(resolveAppRoute(`/dashboard/${id}`), `campaign:${id}`);
  assert.equal(resolveAppRoute(`/customer/campaigns/${id}/tracking`), `customer-tracking:${id}`);
  assert.equal(resolveAppRoute(`/customer/campaigns/${id}/report`), `customer-report:${id}`);
  assert.equal(resolveAppRoute(`/campagna/${id}/report`), `customer-report:${id}`);
  assert.equal(resolveAppRoute(`/campagna/${id}/pagamento`), `customer-payment:${id}`);
  assert.equal(resolveAppRoute('/customer/campaigns/missing/unknown'), 'not-found');
  assert.equal(resolveAppRoute('/route-inesistente'), 'not-found');
  assert.equal(resolveAppRoute('/admin/dashboard'), 'admin');
  assert.equal(resolveAppRoute('/auth/callback'), 'login');
});

// P0 regression: a stale/expired vp_supabase_session survived indefinitely —
// supabase.auth.getUser() rejected it (403 on /auth/v1/user, 400 on
// /auth/v1/token?grant_type=refresh_token, reproduced live) but nothing
// cleared it, so DashboardPage's "Sessione attiva" badge (driven only by raw
// localStorage presence at mount) kept lying while every real query failed.

test('clearBridgedSupabaseSession removes only the bridged session key, never the pending campaign claim', () => {
  assert.match(supabaseClientSdk, /export function clearBridgedSupabaseSession/);
  const fnBody = supabaseClientSdk.slice(supabaseClientSdk.indexOf('export function clearBridgedSupabaseSession'));
  assert.match(fnBody, /localStorage\.removeItem\('vp_supabase_session'\)/);
  assert.doesNotMatch(fnBody.slice(0, fnBody.indexOf('\n}')), /pending_campaign_claim/);
});

test('useCliente and useCampagne clear the bridged session and expose sessionInvalid when getUser() rejects the token', () => {
  for (const [name, src] of [['useCliente', useCliente], ['useCampagne', useCampagne]]) {
    assert.match(src, /clearBridgedSupabaseSession/, `${name} must import/call clearBridgedSupabaseSession`);
    assert.match(src, /setSessionInvalid\(true\)/, `${name} must expose a sessionInvalid signal`);
    assert.match(src, /return \{[^}]*sessionInvalid[^}]*\}/, `${name} must return sessionInvalid to callers`);
    // Cleanup must happen inside the authError branch, before the throw that
    // triggers the generic catch — not bolted on after the fact.
    const authErrorIdx = src.indexOf('if (authError)');
    const clearIdx = src.indexOf('clearBridgedSupabaseSession()', authErrorIdx);
    assert.ok(authErrorIdx >= 0 && clearIdx > authErrorIdx);
  }
});

test('DashboardPage reacts to an invalid session by clearing the badge and navigating to login, with a loop guard', () => {
  const dashboardStart = dashboardMonolith.indexOf('export function DashboardPage');
  const dashboardBody = dashboardMonolith.slice(dashboardStart, dashboardMonolith.indexOf('\nexport function', dashboardStart + 1));
  assert.match(dashboardBody, /sessionInvalid:\s*clienteSessionInvalid/);
  assert.match(dashboardBody, /sessionInvalid:\s*campagneSessionInvalid/);
  assert.match(dashboardBody, /\(clienteSessionInvalid \|\| campagneSessionInvalid\)\s*&&\s*session/);
  assert.match(dashboardBody, /setSession\(null\)/);
  assert.match(dashboardBody, /onNav\("login"\)/);
});

test('authenticated root and magic-link callbacks have intent-aware canonical landings', () => {
  const appRouter = readFileSync(new URL('../src/app/AppRouter.jsx', import.meta.url), 'utf8');
  const login = readFileSync(new URL('../volantinipro-final.jsx', import.meta.url), 'utf8');
  assert.match(appRouter, /page !== "auth-landing"/);
  assert.match(appRouter, /page === "auth-landing" && <RouteLoadingFallback/);
  // "auth-landing" (sessione presente all'apertura di "/") non ha intento di
  // login Admin: destinazione SEMPRE /dashboard. Il ruolo admin da solo non
  // promuove piu' automaticamente a /admin (nessun verifySupabaseAdminRole qui).
  const authLandingBlock = appRouter.slice(
    appRouter.indexOf('if (page !== "auth-landing")'),
    appRouter.indexOf('}, [page]);', appRouter.indexOf('if (page !== "auth-landing")')),
  );
  assert.match(authLandingBlock, /replaceState\(null, "", "\/dashboard"\)/);
  assert.match(authLandingBlock, /setPage\("dashboard"\)/);
  assert.doesNotMatch(authLandingBlock, /"\/admin"/);
  assert.doesNotMatch(authLandingBlock, /verifySupabaseAdminRole/);
  assert.match(appRouter, /paths\[p\] \|\| "\/not-found"/);
  assert.doesNotMatch(appRouter, /paths\[p\] \|\| "\/"/);
  // Callback magic link: il ruolo Admin e' verificato dal backend, ma /admin
  // scatta SOLO se anche l'intento del login era Admin (loginIntentIsAdmin).
  assert.match(login, /verifySupabaseAdminRole\(restoredSession\)/);
  assert.match(login, /const cleanPath = "\/auth\/callback"/);
  assert.match(login, /const loginIntentIsAdmin = isAdminContext/);
  assert.match(login, /if \(isAdmin && loginIntentIsAdmin\) \{/);
  assert.doesNotMatch(login, /if \(isAdmin\) \{\s*\n\s*onNav\("admin"\)/);
  assert.match(login, /onNav\("admin"\)/);
  assert.match(login, /onNav\(pendingReturnToStep4 \? "step4" : "dashboard"\)/);
  assert.doesNotMatch(login, /window\.location\.href\s*=\s*["']\/["']/);
  assert.doesNotMatch(login, /readPendingAuthReturnPath\(\) \|\| ["']\/["']/);
});

test('Customer access is canonical, owner-scoped and has no legacy fallback', () => {
  const sources = [
    readFileSync('src/hooks/useCampagne.js', 'utf8'),
    readFileSync('src/hooks/useCampagnaDetail.js', 'utf8'),
    readFileSync('src/hooks/useCliente.js', 'utf8'),
    readFileSync('src/lib/services/customer-api.js', 'utf8'),
  ].join('\n');
  assert.match(sources, /from\(['"]campaigns['"]\)/);
  assert.match(sources, /from\(['"]profiles['"]\)/);
  assert.match(sources, /\.eq\(['"]user_id['"], authData\.user\.id\)/);
  assert.doesNotMatch(sources, /from\(['"]campagne['"]\)|from\(['"]clienti['"]\)/);
  const ownershipIndex = sources.indexOf('getOwnedCustomerCampaign(campaignId)');
  // Letture GPS customer-safe (select esplicite, nessun dato operatore).
  const gpsIndex = sources.indexOf('getCustomerCampaignGpsPoints(campaignId)');
  assert.ok(ownershipIndex >= 0 && gpsIndex > ownershipIndex, 'ownership must be checked before GPS reads');
});

test('SDK session bridge serializes concurrent dashboard consumers', () => {
  const source = readFileSync('src/supabaseClient.js', 'utf8');
  assert.match(source, /let bridgeInFlight = null/);
  assert.match(source, /if \(!bridgeInFlight\)/);
  assert.match(source, /await bridgeInFlight/);
});

test('Tracking, report and payment expose required privacy-safe flows', () => {
  const tracking = readFileSync('src/pages/customer/CampaignTracking.jsx', 'utf8');
  const report = readFileSync('src/pages/customer/ClientCampaignReport.jsx', 'utf8');
  const payment = readFileSync('volantinipro-final.jsx', 'utf8');
  assert.match(tracking, /getOwnedCustomerTracking/);
  assert.match(tracking, /Ultimo ping/);
  assert.match(tracking, /AuthorizedZoneProgress/);
  assert.match(report, /getFinalDistributionReport/);
  assert.match(report, /Scarica certificazione PDF/);
  assert.doesNotMatch(report, /Scarica CSV GPS|window\.print|react-leaflet|Genera Report AI/);
  assert.doesNotMatch(report, /driver_email|driver_phone|disciplin/i);
  assert.match(payment, /from\("campaigns"\)\.select\("metadata"\)/);
  assert.doesNotMatch(payment, /from\("campagne"\)/);
});
