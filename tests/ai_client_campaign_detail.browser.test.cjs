const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_CLIENT_BASE_URL || 'http://localhost:5176';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block6');
const campaignId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const email = 'cliente.block6@fixture.local';
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'block6-user', email, role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const nowIso = new Date().toISOString();
const ownCampaign = {
  id: campaignId, user_id: 'block6-user', client_email: email, stato: 'in_distribuzione', stato_pagamento: 'pagato', quantita: 10000,
  comuni_selezionati: ['Varedo', 'Paderno Dugnano'], copertura_pct: 91, copertura_rilevata_pct: 64, tracking_enabled: true,
  comune_principale: 'Varedo', totale_euro: 386, updated_at: nowIso, created_at: '2026-07-18T09:00:00Z',
  gps_punti: [{ lat: 45.56, lng: 9.16, recorded_at: nowIso }, { lat: 45.565, lng: 9.165, recorded_at: nowIso }],
  foto_proof: [{ id: 'approved-detail', approved_at: nowIso, status: 'approved' }, { id: 'pending-detail', approved_at: null, status: 'pending' }],
  metadata: { selected_comuni: ['Varedo', 'Paderno Dugnano'], volantini_inseriti: 10000, copertura_pct: 91, extra_services: [{ id: 'tracking_gps' }] },
};
const gpsPoints = [{ id: 'gps-1', campaign_id: campaignId, lat: 45.56, lng: 9.16, recorded_at: nowIso }, { id: 'gps-2', campaign_id: campaignId, lat: 45.565, lng: 9.165, recorded_at: nowIso }];
const sessions = [{ id: 'session-1', campaign_id: campaignId, status: 'started', started_at: nowIso, updated_at: nowIso }];
const approvedPhoto = { id: 'approved-tracking', campaign_id: campaignId, approved_at: nowIso, status: 'approved', storage_path: null, created_at: nowIso };

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}

async function installFixture(page, campaign = ownCampaign) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'block6-user', email } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'block6-user', email });
    if (url.pathname.includes('/rest/v1/campagne')) return json(route, campaign);
    if (url.pathname.includes('/rest/v1/gps_tracking_points')) return json(route, gpsPoints);
    if (url.pathname.includes('/rest/v1/delivery_sessions')) return json(route, sessions);
    if (url.pathname.includes('/rest/v1/proof_photos')) return json(route, [approvedPhoto]);
    if (url.pathname.includes('/rest/v1/admin_coverage_corrections')) return json(route, []);
    if (url.pathname.includes('/rest/v1/assigned_zones')) return json(route, [{ id: 'zone-1', campaign_id: campaignId, target_km: 1.2 }]);
    if (url.pathname.includes('/storage/v1/object/sign')) return json(route, { signedURL: null });
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((sessionToken) => {
    localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: sessionToken, refreshToken: 'fixture-refresh' }));
    localStorage.setItem('vp_cookie_consent', 'accepted');
  }, token);
}

async function exerciseAssistant(page, questionName, answerPattern) {
  const question = page.getByRole('button', { name: questionName });
  await question.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((button) => button?.getAttribute('aria-pressed') === 'true', await question.elementHandle());
  const answer = page.getByRole('region', { name: `Risposta: ${questionName}` });
  await answer.getByText(answerPattern).waitFor();
  await answer.getByText(/DATO REALE|DATO DERIVATO|STIMA/).waitFor();
  const source = answer.getByRole('button', { name: 'Fonte e criterio' });
  await source.focus();
  await page.keyboard.press('Enter');
  await answer.getByRole('region', { name: /Dettagli fonte/ }).waitFor();
  await page.keyboard.press('Escape');
}

async function verifyDetail(browser, viewport, screenshotName) {
  const page = await browser.newPage({ viewport });
  await installFixture(page);
  await page.goto(`${baseUrl}/dashboard/${campaignId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Riepilogo AI della campagna' }).waitFor();
  const ai = page.locator('.client-campaign-ai').first();
  await ai.getByText('Proprietà verificata', { exact: true }).waitFor();
  assert.equal(await ai.locator('input, textarea, [contenteditable="true"]').count(), 0);
  const municipalityValue = await ai.locator('.ai-insight-card').filter({ hasText: 'Comuni selezionati' }).locator('.ai-insight-card__value').innerText();
  assert.match(municipalityValue, /^2\b/, 'Il conteggio comuni deve coincidere con i dati esistenti.');
  const photoCard = ai.locator('.ai-insight-card').filter({ hasText: 'Foto approvate' });
  assert.match(await photoCard.locator('.ai-insight-card__value').innerText(), /^1\b/);
  assert.equal(await ai.getByText('pending-detail', { exact: true }).count(), 0, 'La foto non approvata non deve apparire.');
  await exerciseAssistant(page, 'Qual è la copertura prevista?', /91%/);
  await page.screenshot({ path: `${artifactDir}/${screenshotName}`, fullPage: true });
  await page.close();
}

async function verifyTracking(browser, viewport, screenshotName) {
  const page = await browser.newPage({ viewport });
  await installFixture(page);
  await page.goto(`${baseUrl}/customer/campaigns/${campaignId}/tracking`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Tracking spiegato dai dati disponibili' }).waitFor();
  const ai = page.locator('.client-campaign-ai');
  assert.equal(await ai.locator('.ai-insight-card').count(), 4);
  assert.equal(await ai.getByText('45.56', { exact: true }).count(), 0, 'Il GPS grezzo non deve essere mostrato nel pannello AI.');
  assert.match(await ai.locator('.ai-insight-card').filter({ hasText: 'Punti GPS disponibili' }).locator('.ai-insight-card__value').innerText(), /^2\b/);
  assert.match(await ai.locator('.ai-insight-card').filter({ hasText: 'Foto approvate' }).locator('.ai-insight-card__value').innerText(), /^1\b/);
  const existingCoverage = await page.locator('div').filter({ hasText: /^Copertura verificata\d+%$/ }).first().innerText();
  const existingValue = existingCoverage.match(/(\d+)%/)?.[1];
  assert.ok(existingValue, 'La copertura esistente deve essere leggibile.');
  const aiCoverage = await ai.locator('.ai-insight-card').filter({ hasText: 'Copertura rilevata' }).locator('.ai-insight-card__value').innerText();
  assert.match(aiCoverage, new RegExp(`^${existingValue}\\b`));
  await exerciseAssistant(page, 'Sono disponibili dati GPS?', /2 punti GPS/);
  await page.screenshot({ path: `${artifactDir}/${screenshotName}`, fullPage: true });
  await page.close();
}

async function verifyForeignAndDisabled(browser) {
  const foreign = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixture(foreign, { ...ownCampaign, user_id: 'other-user', client_email: 'other@fixture.local' });
  await foreign.goto(`${baseUrl}/dashboard/${campaignId}`, { waitUntil: 'networkidle' });
  const foreignAi = foreign.locator('.client-campaign-ai').first();
  await foreignAi.getByText('Accesso non verificato', { exact: true }).waitFor();
  assert.equal(await foreignAi.getByText('NON DISPONIBILE', { exact: true }).count(), 8);
  assert.equal(await foreignAi.getByText('10.000', { exact: true }).count(), 0);
  await foreign.close();

  const disabled = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixture(disabled, { ...ownCampaign, tracking_enabled: false, metadata: { ...ownCampaign.metadata, extra_services: [] } });
  await disabled.goto(`${baseUrl}/customer/campaigns/${campaignId}/tracking`, { waitUntil: 'networkidle' });
  const disabledAi = disabled.locator('.client-campaign-ai');
  await disabledAi.getByText('Tracking spiegato dai dati disponibili').waitFor();
  assert.equal(await disabledAi.getByText('NON DISPONIBILE', { exact: true }).count(), 3);
  assert.equal(await disabledAi.locator('.ai-insight-card').filter({ hasText: 'Punti GPS disponibili' }).getByText('0', { exact: true }).count(), 0);
  await disabled.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifyDetail(browser, { width: 1440, height: 1000 }, 'client-campaign-detail-desktop.png');
    await verifyDetail(browser, { width: 390, height: 844 }, 'client-campaign-detail-mobile.png');
    await verifyTracking(browser, { width: 1440, height: 1000 }, 'client-tracking-ai-desktop.png');
    await verifyTracking(browser, { width: 390, height: 844 }, 'client-tracking-ai-mobile.png');
    await verifyForeignAndDisabled(browser);
    console.log('PASS Blocco 6: dettaglio/tracking, ownership, tracking disabilitato, foto approvate, valori esistenti, tastiera, desktop/mobile');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
