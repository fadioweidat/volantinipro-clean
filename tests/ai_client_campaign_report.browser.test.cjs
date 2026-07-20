const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_CLIENT_BASE_URL || 'http://localhost:5176';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block7');
const campaignId = '77777777-7777-4777-8777-777777777777';
const email = 'cliente.block7@fixture.local';
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'block7-user', email, role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const nowIso = new Date().toISOString();
const target = {
  id: campaignId, user_id: 'block7-user', client_email: email, stato: 'completata', servizio: 'd2d', quantita: 10000, volantini_distribuiti: 9800,
  comuni_selezionati: ['Varedo', 'Paderno Dugnano'], copertura_pct: 91, copertura_rilevata_pct: 83, data_fine: '2026-07-19', totale_euro: 386,
  updated_at: nowIso, created_at: '2026-07-15T09:00:00Z', gps_punti: [{ lat: 45.56, lng: 9.16, recorded_at: nowIso }, { lat: 45.57, lng: 9.17, recorded_at: nowIso }],
  foto_proof: [{ id: 'approved-current', approved_at: nowIso, status: 'approved' }, { id: 'pending-current', status: 'pending' }],
  metadata: { zona: 'Varedo', comune: 'Varedo', selected_comuni: ['Varedo', 'Paderno Dugnano'], volantini_inseriti: 10000, comuni_count: 2, copertura_pct: 91, famiglie: 10769 },
};
const comparable = { ...target, id: '66666666-6666-4666-8666-666666666666', quantita: 9000, volantini_distribuiti: 8900, copertura_rilevata_pct: 80, data_fine: '2026-06-10', gps_punti: [{ lat: 45.5, lng: 9.1 }], foto_proof: [{ id: 'approved-old', approved: true }], updated_at: '2026-06-11T10:00:00Z' };
const foreign = { ...comparable, id: '55555555-5555-4555-8555-555555555555', user_id: 'other-user', client_email: 'other@fixture.local', copertura_rilevata_pct: 12 };
const active = { ...comparable, id: '44444444-4444-4444-8444-444444444444', stato: 'in_distribuzione', copertura_rilevata_pct: 99 };

function json(route, body, status = 200) { return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); }
async function installFixture(page, { reportCampaign = target, history = [target, comparable, foreign, active] } = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'block7-user', email } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'block7-user', email });
    if (url.pathname.includes('/rest/v1/clienti')) return json(route, { id: 'client-7', email, nome: 'Cliente Block 7' });
    if (url.pathname.includes('/rest/v1/campagne')) return json(route, url.searchParams.has('id') ? reportCampaign : history);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((sessionToken) => {
    localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: sessionToken, refreshToken: 'fixture-refresh' }));
    localStorage.setItem('vp_cookie_consent', 'accepted');
  }, token);
}

async function verifyReport(browser, viewport, screenshotName) {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installFixture(page);
  await page.goto(`${baseUrl}/campagna/${campaignId}/report`, { waitUntil: 'networkidle' });
  try {
    await page.getByRole('heading', { name: 'Lettura AI del risultato' }).waitFor({ timeout: 60_000 });
  } catch (error) {
    console.error('Report fixture diagnostics', { url: page.url(), aiSections: await page.locator('.client-report-ai').count(), pageErrors, body: (await page.locator('body').innerText()).slice(0, 1800) });
    throw error;
  }
  const ai = page.locator('.client-report-ai');
  await ai.getByText('Proprieta verificata', { exact: true }).waitFor();
  assert.equal(await ai.locator('input, textarea, [contenteditable="true"]').count(), 0);
  assert.match(await ai.locator('.ai-insight-card').filter({ hasText: 'Quantita distribuita' }).locator('.ai-insight-card__value').innerText(), /^9\.?800\b/);
  assert.match(await ai.locator(':scope > .client-campaign-ai__grid .ai-insight-card').filter({ has: page.locator('.ai-insight-card__label', { hasText: /^Copertura finale$/ }) }).locator('.ai-insight-card__value').innerText(), /^83\b/);
  assert.match(await ai.locator(':scope > .client-campaign-ai__grid .ai-insight-card').filter({ has: page.locator('.ai-insight-card__label', { hasText: /^Foto approvate$/ }) }).locator('.ai-insight-card__value').innerText(), /^1\b/);
  assert.match(await ai.locator('.ai-insight-card').filter({ hasText: 'Campagne storiche comparabili' }).locator('.ai-insight-card__value').innerText(), /^1\b/);
  assert.equal(await ai.getByText('12', { exact: true }).count(), 0, 'Il valore della campagna esterna non deve apparire.');
  assert.equal(await ai.getByText('99', { exact: true }).count(), 0, 'La campagna non conclusa non deve apparire.');
  assert.equal(await ai.getByText('45.56', { exact: true }).count(), 0, 'Le coordinate GPS non devono apparire.');
  const existingCoverage = await page.getByText('91%', { exact: true }).first().innerText();
  const aiPlannedCoverage = await ai.locator(':scope > .client-campaign-ai__grid .ai-insight-card').filter({ has: page.locator('.ai-insight-card__label', { hasText: /^Copertura prevista$/ }) }).locator('.ai-insight-card__value').innerText();
  assert.match(aiPlannedCoverage, new RegExp(`^${existingCoverage.replace('%', '')}\\b`));
  const historyQuestion = ai.getByRole('button', { name: 'Cosa emerge dal confronto storico?' });
  await historyQuestion.focus(); await page.keyboard.press('Enter');
  await ai.getByRole('region', { name: 'Risposta: Cosa emerge dal confronto storico?' }).locator('.client-ai-assistant__answer-text').filter({ hasText: /Superiore a 1/ }).waitFor();
  const sourceButton = ai.getByRole('region', { name: 'Risposta: Cosa emerge dal confronto storico?' }).getByRole('button', { name: 'Fonte e criterio' }).first();
  await sourceButton.focus(); await page.keyboard.press('Enter');
  await ai.getByRole('region', { name: /Dettagli fonte/ }).first().waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${artifactDir}/${screenshotName}`, fullPage: true });
  await page.close();
}

async function verifyUnavailableAndDenied(browser) {
  const empty = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixture(empty, { history: [target] });
  await empty.goto(`${baseUrl}/campagna/${campaignId}/report`, { waitUntil: 'networkidle' });
  const emptyAi = empty.locator('.client-report-ai');
  await emptyAi.getByText('Migliora la prossima campagna').waitFor();
  assert.match(await emptyAi.locator('.ai-insight-card').filter({ hasText: 'Campagne storiche comparabili' }).locator('.ai-insight-card__value').innerText(), /^0\b/);
  assert.equal(await emptyAi.getByText('NON DISPONIBILE', { exact: true }).count(), 2);
  await empty.close();

  const denied = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixture(denied, { reportCampaign: { ...target, user_id: 'other-user', client_email: 'other@fixture.local' }, history: [foreign] });
  await denied.goto(`${baseUrl}/campagna/${campaignId}/report`, { waitUntil: 'networkidle' });
  const deniedAi = denied.locator('.client-report-ai');
  await deniedAi.getByText('Accesso non verificato', { exact: true }).waitFor();
  assert.equal(await deniedAi.getByText('NON DISPONIBILE', { exact: true }).count(), 11);
  assert.equal(await deniedAi.locator('.ai-insight-card__value').filter({ hasText: /9\.?800|83/ }).count(), 0);
  await denied.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifyReport(browser, { width: 1440, height: 1000 }, 'client-report-ai-desktop.png');
    await verifyReport(browser, { width: 390, height: 844 }, 'client-report-ai-mobile.png');
    await verifyUnavailableAndDenied(browser);
    console.log('PASS Blocco 7: report finale, storico stesso Cliente, comparabilita, diniego, tastiera, desktop/mobile');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
