const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_CLIENT_BASE_URL || 'http://localhost:5176';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block4');
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'block4-user', email: 'cliente.block4@fixture.local', role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const campaigns = [
  { id: 'block4-own-001', cliente_id: 'block4-client', client_email: 'cliente.block4@fixture.local', stato: 'in_distribuzione', stato_pagamento: 'pagato', totale_euro: 386, comune_principale: 'Varedo', updated_at: '2026-07-20T11:55:00Z', created_at: '2026-07-18T09:00:00Z' },
  { id: 'block4-own-002', cliente_id: 'block4-client', client_email: 'cliente.block4@fixture.local', stato: 'completata', stato_pagamento: 'da_pagare', totale_euro: 214.5, comune_principale: 'Milano', updated_at: '2026-07-20T10:00:00Z', created_at: '2026-07-19T09:00:00Z' },
  { id: 'block4-foreign', cliente_id: 'other-client', client_email: 'altro@fixture.local', stato: 'completata', stato_pagamento: 'da_pagare', totale_euro: 999, comune_principale: 'Roma riservata', updated_at: '2026-07-20T11:59:00Z', created_at: '2026-07-20T09:00:00Z' },
];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}

async function installFixture(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'block4-user', email: 'cliente.block4@fixture.local' } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'block4-user', email: 'cliente.block4@fixture.local' });
    if (url.pathname.includes('/rest/v1/clienti')) return json(route, { id: 'block4-client', nome: 'Cliente Block 4', email: 'cliente.block4@fixture.local' });
    if (url.pathname.includes('/rest/v1/campagne')) return json(route, campaigns);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((fixtureToken) => localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: fixtureToken, refreshToken: 'fixture-refresh' })), token);
}

async function verify(browser, viewport, filename) {
  const page = await browser.newPage({ viewport });
  await installFixture(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Assistente Campagna AI' }).waitFor();
  assert.equal(await page.locator('.client-ai-assistant input, .client-ai-assistant textarea').count(), 0, 'Non deve esistere chat libera.');
  assert.equal(await page.getByText('Roma riservata', { exact: true }).count(), 0, 'I dati di altri clienti non devono apparire.');

  const paymentQuestion = page.getByRole('button', { name: 'Ci sono pagamenti in attesa?' });
  await paymentQuestion.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((button) => button?.getAttribute('aria-pressed') === 'true', await paymentQuestion.elementHandle());
  assert.equal(await paymentQuestion.getAttribute('aria-pressed'), 'true');
  const answer = page.getByRole('region', { name: 'Risposta: Ci sono pagamenti in attesa?' });
  await answer.waitFor();
  await answer.getByText('1 campagna risulta in attesa di pagamento.', { exact: true }).waitFor();
  await answer.getByText('DATO DERIVATO', { exact: true }).waitFor();
  await answer.getByText(/Dato aggiornato|Dato da aggiornare/).waitFor();
  const source = answer.getByRole('button', { name: 'Fonte e criterio' });
  await source.focus();
  await page.keyboard.press('Enter');
  await answer.getByRole('region', { name: /Dettagli fonte/ }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await source.getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `${artifactDir}/${filename}`, fullPage: true });
  await page.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verify(browser, { width: 1440, height: 1000 }, 'client-assistant-desktop.png');
    await verify(browser, { width: 390, height: 844 }, 'client-assistant-mobile.png');
    console.log('PASS Assistente Cliente Block 4: guidato, ownership, fonte/freshness, tastiera, desktop/mobile');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
