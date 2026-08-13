import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeCustomerCampaign } from '../src/lib/customerCampaigns.js';
import { resolveAppRoute } from '../src/app/routeResolution.js';

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
  const gpsIndex = sources.indexOf('getCampaignGpsPoints(campaignId)');
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
  assert.match(report, /customerOwned:\s*true/);
  assert.match(report, /Scarica certificazione PDF/);
  assert.match(report, /FinalDistributionReportView/);
  assert.doesNotMatch(report, /driver_email|driver_phone|disciplin/i);
  assert.match(payment, /from\("campaigns"\)\.select\("metadata"\)/);
  assert.doesNotMatch(payment, /from\("campagne"\)/);
});
