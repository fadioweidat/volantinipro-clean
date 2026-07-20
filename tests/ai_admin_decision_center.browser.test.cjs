const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_ADMIN_BASE_URL || 'http://localhost:5176';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block8');
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'block8-admin', email: 'admin.block8@fixture.local', role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
const nowIso = new Date().toISOString();
const campaignId = '88888888-8888-4888-8888-888888888888';
const rows = {
  campaigns: [{ id: campaignId, client_name: 'Cliente Decisionale', service_type: 'd2d', city_name: 'Milano', total_flyers: 12731, total_amount: 817.45, status: 'active', start_date: '2026-07-10', end_date: '2026-07-19', center_lat: 45.4642, center_lng: 9.19, updated_at: nowIso, created_at: '2026-07-10T08:00:00Z' }],
  campagne: [], quote_requests: [],
  delivery_sessions: [
    { id: 'session-online', campaign_id: campaignId, driver_id: 'operator-online', group_id: 'group-a', status: 'active', started_at: nowIso, updated_at: nowIso },
    { id: 'session-offline', campaign_id: campaignId, driver_id: 'operator-offline', group_id: 'group-b', status: 'active', started_at: '2026-07-19T08:00:00Z', updated_at: '2026-07-19T08:10:00Z' },
  ],
  gps_tracking_points: [{ id: 'gps-online', session_id: 'session-online', campaign_id: campaignId, lat: 45.4642, lng: 9.19, recorded_at: nowIso, created_at: nowIso }],
  proof_photos: [{ id: 'photo-1', campaign_id: campaignId, session_id: 'session-online', status: 'approved', captured_at: nowIso, created_at: nowIso }],
  smart_pairing_waitlist: [{ id: 'wait-1', nome: 'Richiesta Decisionale', email: 'decisionale@fixture.local', comune: 'Milano', servizio: 'd2d', gestita: false, created_at: nowIso }],
  activity_log: [{ id: 'activity-1', action: 'fixture_loaded', message: 'Dataset Block 8', created_at: nowIso }],
};

function json(route, body, status = 200) { return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); }
async function installFixture(page, role) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'block8-admin', email: 'admin.block8@fixture.local' } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'block8-admin', email: 'admin.block8@fixture.local' });
    if (url.pathname.includes('/rest/v1/profiles')) return json(route, { role });
    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/)?.[1];
    if (table) return json(route, rows[table] ?? []);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((fixtureToken) => {
    localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: fixtureToken, refreshToken: 'fixture-refresh' }));
    localStorage.setItem('vp_cookie_consent', 'accepted');
  }, token);
}

async function verifyAllowed(browser, role, viewport, screenshotName) {
  const page = await browser.newPage({ viewport });
  await installFixture(page, role);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Centro Decisionale' }).waitFor();
  const center = page.locator('.admin-decision-center');
  const items = center.locator('.admin-decision-item');
  await items.nth(3).waitFor({ timeout: 60_000 });
  assert.equal(await items.count(), 4);
  assert.equal(await items.first().getByRole('heading', { name: 'Anomalie gia rilevate' }).count(), 1, 'I problemi operativi devono occupare la prima posizione.');
  assert.match(await items.first().locator('code').innerText(), /^admin\.decision\.admin\.home\.attention\.operational_problems$/);
  assert.equal(await items.nth(1).getByRole('heading', { name: 'Campagne in ritardo' }).count(), 1);
  assert.equal(await center.getByText('Posizione 1', { exact: true }).count(), 1);
  assert.equal(await center.locator('input, textarea, [contenteditable="true"]').count(), 0);
  assert.equal(await center.locator('button:not(.ai-source__trigger)').count(), 0, 'Il Centro non deve avere azioni operative.');
  const hrefs = await center.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.ok(hrefs.every((href) => ['/admin/live', '/admin/anomalie', '/admin/finance', '#campagne-attive'].includes(href)));
  const explanation = items.first().locator('summary', { hasText: 'Perche compare qui' });
  await explanation.focus(); await page.keyboard.press('Enter');
  await items.first().getByText(/I problemi operativi gia rilevati precedono/).waitFor();
  const question = page.getByRole('button', { name: 'Perche questo elemento e in alto?' });
  await question.focus(); await page.keyboard.press('Enter');
  const answer = page.getByRole('region', { name: 'Risposta: Perche questo elemento e in alto?' });
  await answer.getByText(/problemi operativi gia rilevati precedono/i).waitFor();
  assert.equal(await answer.getByText('DATO DERIVATO', { exact: true }).count(), 1);
  const source = answer.getByRole('button', { name: 'Fonte e criterio' });
  await source.focus(); await page.keyboard.press('Enter');
  await answer.getByRole('region', { name: /Dettagli fonte/ }).waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${artifactDir}/${screenshotName}`, fullPage: true });
  await page.close();
}

async function verifyDenied(browser, role) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixture(page, role);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Accesso non autorizzato' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Centro Decisionale' }).count(), 0);
  await page.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifyAllowed(browser, 'admin', { width: 1440, height: 1000 }, 'admin-decision-center-desktop.png');
    await verifyAllowed(browser, 'super_admin', { width: 390, height: 844 }, 'admin-decision-center-mobile.png');
    await verifyDenied(browser, 'cliente');
    await verifyDenied(browser, 'operatore');
    console.log('PASS Blocco 8: Centro Decisionale, ordine stabile, spiegazioni, link, ruoli, tastiera, desktop/mobile');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
