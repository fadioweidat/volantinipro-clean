const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_ADMIN_BASE_URL || 'http://localhost:5173';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block3');
const fixtureToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'fixture-admin', email: 'admin.block3@fixture.local', role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const nowIso = new Date().toISOString();
const campaignId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const campaign = { id: campaignId, client_name: 'Cliente Operativo Baseline', service_type: 'd2d', city_name: 'Milano', total_flyers: 12000, total_amount: 780.5, status: 'active', start_date: '2026-07-10', end_date: '2026-07-19', center_lat: 45.4642, center_lng: 9.19, updated_at: nowIso, created_at: '2026-07-10T08:00:00Z' };
const sessions = [
  { id: 'session-online', campaign_id: campaignId, driver_id: 'operator-online', group_id: 'group-a', status: 'active', started_at: nowIso, updated_at: nowIso },
  { id: 'session-offline', campaign_id: campaignId, driver_id: 'operator-offline', group_id: 'group-b', status: 'active', started_at: '2026-07-19T08:00:00Z', updated_at: '2026-07-19T08:10:00Z' },
];
const gpsPoints = [{ id: 'gps-online', session_id: 'session-online', campaign_id: campaignId, lat: 45.4642, lng: 9.19, recorded_at: nowIso, created_at: nowIso }];
const photos = [{ id: 'photo-1', campaign_id: campaignId, session_id: 'session-online', status: 'approved', captured_at: nowIso, created_at: nowIso }];
const waitlist = [{ id: 'wait-1', nome: 'Richiesta Operativa', email: 'richiesta@fixture.local', comune: 'Milano', servizio: 'd2d', gestita: false, created_at: nowIso }];
const activities = [{ id: 'activity-1', action: 'fixture_loaded', message: 'Dataset operativo caricato', created_at: nowIso }];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}

function tableRows(table) {
  if (table === 'campaigns') return [campaign];
  if (table === 'campagne' || table === 'quote_requests') return [];
  if (table === 'delivery_sessions') return sessions;
  if (table === 'gps_tracking_points') return gpsPoints;
  if (table === 'proof_photos') return photos;
  if (table === 'smart_pairing_waitlist') return waitlist;
  if (table === 'activity_log') return activities;
  return [];
}

async function installFixture(page, role) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: fixtureToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'fixture-admin', email: 'admin.block3@fixture.local' } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'fixture-admin', email: 'admin.block3@fixture.local' });
    if (url.pathname.includes('/rest/v1/profiles')) return json(route, { role });
    const tableMatch = url.pathname.match(/\/rest\/v1\/([^/]+)/);
    if (tableMatch) return json(route, tableRows(tableMatch[1]));
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((token) => localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: token, refreshToken: 'fixture-refresh' })), fixtureToken);
}

async function verifyAllowed(browser, role, viewport, screenshotName = null) {
  const page = await browser.newPage({ viewport });
  await installFixture(page, role);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  try {
    await page.getByRole('heading', { name: 'Stato delle operazioni' }).waitFor();
  } catch (error) {
    console.error('Admin fixture diagnostics', { role, url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1400) });
    throw error;
  }
  await page.getByText('DATO DERIVATO', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('DATO DERIVATO', { exact: true }).count() >= 12, true);
  assert.equal(await page.getByText('Copilota Operativo AI', { exact: true }).count(), 1);
  assert.equal(await page.locator('.admin-ai-attention').getByText('Anomalie gia rilevate', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Cerca nella Dashboard Admin' }).count(), 1);
  assert.equal(await page.getByRole('link', { name: /Monitor GPS Live/ }).count() > 0, true);
  assert.equal(await page.getByRole('link', { name: /Anomalie esistenti/ }).count(), 1);
  assert.equal(await page.getByText('Cliente Operativo Baseline', { exact: true }).count() > 0, true);
  const sourceButton = page.getByRole('button', { name: 'Fonte e criterio' }).first();
  await sourceButton.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region', { name: /Dettagli fonte/ }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await sourceButton.getAttribute('aria-expanded'), 'false');
  if (screenshotName) await page.screenshot({ path: `${artifactDir}/${screenshotName}`, fullPage: true });
  await page.close();
}

async function verifyDenied(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixture(page, 'cliente');
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Accesso non autorizzato' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Stato delle operazioni' }).count(), 0);
  await page.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifyAllowed(browser, 'admin', { width: 1440, height: 1000 }, 'admin-dashboard-desktop.png');
    await verifyAllowed(browser, 'super_admin', { width: 390, height: 844 }, 'admin-dashboard-mobile.png');
    await verifyDenied(browser);
    console.log('PASS Dashboard Admin Block 3: admin/super_admin, diniego Cliente, desktop/mobile, link e tastiera');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
