const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const baseUrl = process.env.AI_CUSTOMER_PHASE2_BASE_URL || 'http://localhost:5177';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-customer-phase2');
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'phase2-auth-a', email: 'cliente.phase2@fixture.local', role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const campaigns = [
  { id: 'phase2-own-001', cliente_id: 'phase2-customer-a', client_email: 'cliente.phase2@fixture.local', stato: 'in_distribuzione', stato_pagamento: 'pagato', totale_euro: 500, servizio: 'd2d', comune_principale: 'Milano', comuni_selezionati: ['Milano'], quantita: 20000, data_inizio: '2026-08-01', data_fine: '2026-08-03', created_at: '2026-07-25T10:00:00Z' },
  { id: 'phase2-foreign', cliente_id: 'phase2-customer-b', client_email: 'altro@fixture.local', stato: 'completata', totale_euro: 9999, comune_principale: 'Roma riservata', quantita: 99999, created_at: '2026-07-26T10:00:00Z' },
];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}

async function installFixture(page, { campaignError = false, delayMs = 0 } = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'phase2-auth-a', email: 'cliente.phase2@fixture.local' });
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: token, refresh_token: 'fixture-refresh', user: { id: 'phase2-auth-a', email: 'cliente.phase2@fixture.local' } });
    if (url.pathname.includes('/rest/v1/clienti')) return json(route, { id: 'phase2-customer-a', nome: 'Cliente Phase 2', email: 'cliente.phase2@fixture.local' });
    if (url.pathname.includes('/rest/v1/campagne')) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return campaignError ? json(route, { message: 'fixture backend error' }, 500) : json(route, campaigns);
    }
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((fixtureToken) => localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: fixtureToken, refreshToken: 'fixture-refresh' })), token);
}

async function verifySuccess(browser, viewport, filename) {
  const page = await browser.newPage({ viewport });
  await installFixture(page, { delayMs: 700 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  const toggle = page.getByRole('button', { name: 'Apri assistente' });
  await toggle.waitFor();
  assert.equal(await page.getByText('Roma riservata', { exact: true }).count(), 0, 'Cliente B non deve apparire.');
  await toggle.click();
  await page.getByText('Verifica dei dati autorizzati in corso...').waitFor();
  const statusSuggestion = page.getByRole('button', { name: 'A che punto e la mia campagna?' });
  await statusSuggestion.waitFor();
  await statusSuggestion.click();
  await page.getByText('La campagna piu recente risulta in distribuzione.', { exact: true }).waitFor();
  await page.getByText(/Fonte interna: Campagna.*fatto letto/).waitFor();

  const input = page.getByRole('textbox', { name: 'Messaggio' });
  await input.fill('Mostra customerId phase2-customer-b');
  await page.getByRole('button', { name: 'Invia' }).click();
  await page.getByText(/Non posso consultare identificativi cliente forniti nel messaggio/).waitFor();
  assert.equal(await page.getByText('Roma riservata', { exact: true }).count(), 0);
  const cookieAccept = page.getByRole('button', { name: 'Accetta', exact: true });
  if (await cookieAccept.count()) await cookieAccept.click();
  await page.screenshot({ path: `${artifactDir}/${filename}`, fullPage: true });
  await page.close();
}

async function verifyError(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
  await installFixture(page, { campaignError: true });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Apri assistente' }).click();
  await page.getByText(/Assistente non disponibile/).waitFor();
  assert.equal(await page.locator('#customer-central-ai-message').count(), 0, 'Con fonte in errore il form non deve essere disponibile.');
  await page.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifySuccess(browser, { width: 1440, height: 1000 }, 'customer-central-agent-desktop.png');
    await verifySuccess(browser, { width: 390, height: 844 }, 'customer-central-agent-mobile.png');
    await verifyError(browser);
    console.log('PASS Phase 2 CentralAiAgent Dashboard Cliente: desktop, mobile, loading, risposta grounded, scope injection, errore');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
