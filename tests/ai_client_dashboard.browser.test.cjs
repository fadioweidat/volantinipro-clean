const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_CLIENT_BASE_URL || 'http://localhost:5173';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block2');
const fixtureToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'fixture-user', email: 'cliente.block2@fixture.local', role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const campaigns = [
  { id: 'block2-client-001', cliente_id: 'block2-client', client_email: 'cliente.block2@fixture.local', stato: 'in_distribuzione', stato_pagamento: 'pagato', totale_euro: 386, servizio: 'd2d', comune_principale: 'Varedo', comuni_selezionati: ['Varedo'], quantita: 10000, updated_at: '2026-07-20T11:55:00Z', created_at: '2026-07-18T09:00:00Z' },
  { id: 'block2-client-002', cliente_id: 'block2-client', client_email: 'cliente.block2@fixture.local', stato: 'preventivo', stato_pagamento: 'da_pagare', totale_euro: 214.5, servizio: 'h2h', comune_principale: 'Milano', comuni_selezionati: ['Milano'], quantita: 4500, updated_at: '2026-07-20T10:00:00Z', created_at: '2026-07-19T09:00:00Z' },
  { id: 'block2-foreign-001', cliente_id: 'other-client', client_email: 'altro.cliente@fixture.local', stato: 'completata', stato_pagamento: 'pagato', totale_euro: 999, servizio: 'd2d', comune_principale: 'Roma riservata', comuni_selezionati: ['Roma'], quantita: 9999, updated_at: '2026-07-20T11:59:00Z', created_at: '2026-07-20T09:00:00Z' },
];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}

async function installFixture(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: fixtureToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'fixture-user', email: 'cliente.block2@fixture.local' } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'fixture-user', email: 'cliente.block2@fixture.local' });
    if (url.pathname.includes('/rest/v1/clienti')) return json(route, { id: 'block2-client', nome: 'Cliente Baseline', email: 'cliente.block2@fixture.local' });
    if (url.pathname.includes('/rest/v1/campagne')) return json(route, campaigns);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((token) => {
    localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: token, refreshToken: 'fixture-refresh' }));
  }, fixtureToken);
}

async function verifyViewport(browser, viewport, filename) {
  const page = await browser.newPage({ viewport });
  assert.deepEqual(page.viewportSize(), viewport);
  await installFixture(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  try {
    await page.getByRole('heading', { name: 'La situazione in un colpo d’occhio' }).waitFor();
  } catch (error) {
    console.error('Dashboard fixture diagnostics', { url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1200) });
    throw error;
  }
  await page.getByRole('heading', { name: /^Ciao / }).waitFor();
  await page.getByText('DATO DERIVATO', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.client-ai-kpi-grid').getByText('DATO DERIVATO', { exact: true }).count(), 9);
  assert.equal(await page.locator('.client-ai-kpi-grid').getByText('NON DISPONIBILE', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Cerca campagne e preventivi' }).count(), 1, 'La ricerca campagne deve restare presente e accessibile.');
  assert.equal(await page.getByRole('combobox', { name: 'Filtra campagne e preventivi' }).count(), 1, 'Il filtro campagne deve restare presente e accessibile.');
  assert.equal(await page.locator('.client-ai-attention').getByText('Pagamenti da verificare', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Roma riservata', { exact: true }).count(), 0, 'Una campagna di altro cliente non deve essere resa.');
  const sourceButton = page.getByRole('button', { name: 'Fonte e criterio' }).first();
  await sourceButton.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region', { name: /Dettagli fonte/ }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await sourceButton.getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `${artifactDir}/${filename}`, fullPage: true });
  await page.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifyViewport(browser, { width: 1440, height: 1000 }, 'client-dashboard-desktop.png');
    await verifyViewport(browser, { width: 390, height: 844 }, 'client-dashboard-mobile.png');
    console.log('PASS Dashboard Cliente Block 2: desktop, mobile, ownership fixture, ricerca e tastiera');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
