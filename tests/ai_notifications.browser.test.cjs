const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.AI_NOTIFICATION_BASE_URL || 'http://localhost:5176';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve('e2e-artifacts-ai-block9');
const nowIso = new Date().toISOString();
function token(sub, email) { return `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub, email, role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`; }
function json(route, body, status = 200) { return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); }

const clientToken = token('block9-client', 'cliente.block9@fixture.local');
const clientCampaigns = [
  { id: 'block9-own-active', cliente_id: 'block9-client-id', client_email: 'cliente.block9@fixture.local', stato: 'in_distribuzione', stato_pagamento: 'pagato', totale_euro: 381.25, servizio: 'd2d', comune_principale: 'Monza', quantita: 8500, updated_at: nowIso, created_at: nowIso },
  { id: 'block9-own-report', cliente_id: 'block9-client-id', client_email: 'cliente.block9@fixture.local', stato: 'report_pronto', stato_pagamento: 'da_pagare', totale_euro: 229.4, servizio: 'h2h', comune_principale: 'Milano', quantita: 4200, updated_at: nowIso, created_at: nowIso },
  { id: 'block9-foreign', cliente_id: 'other-client', client_email: 'altro@fixture.local', stato: 'report_pronto', stato_pagamento: 'da_pagare', totale_euro: 9999, servizio: 'd2d', comune_principale: 'Roma Admin', quantita: 99999, updated_at: nowIso, created_at: nowIso },
];

async function installClientFixture(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: clientToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'block9-client', email: 'cliente.block9@fixture.local' } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'block9-client', email: 'cliente.block9@fixture.local' });
    if (url.pathname.includes('/rest/v1/clienti')) return json(route, { id: 'block9-client-id', nome: 'Cliente Notifiche', email: 'cliente.block9@fixture.local' });
    if (url.pathname.includes('/rest/v1/campagne')) return json(route, clientCampaigns);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((value) => { localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: value, refreshToken: 'fixture-refresh' })); localStorage.setItem('vp_cookie_consent', 'accepted'); }, clientToken);
}

const adminToken = token('block9-admin', 'admin.block9@fixture.local');
const campaignId = '99999999-9999-4999-8999-999999999999';
const adminRows = {
  campaigns: [{ id: campaignId, client_name: 'Cliente Operativo Notifiche', service_type: 'd2d', city_name: 'Milano', total_flyers: 11731, total_amount: 767.45, status: 'active', start_date: '2026-07-10', end_date: '2026-07-19', updated_at: nowIso, created_at: nowIso }],
  campagne: [], quote_requests: [],
  delivery_sessions: [
    { id: 'session-online', campaign_id: campaignId, driver_id: 'operator-online', group_id: 'group-a', status: 'active', started_at: nowIso, updated_at: nowIso },
    { id: 'session-offline', campaign_id: campaignId, driver_id: 'operator-offline', group_id: 'group-b', status: 'active', started_at: '2026-07-19T08:00:00Z', updated_at: '2026-07-19T08:10:00Z' },
  ],
  gps_tracking_points: [{ id: 'gps-online', session_id: 'session-online', campaign_id: campaignId, lat: 45.4642, lng: 9.19, recorded_at: nowIso, created_at: nowIso }],
  proof_photos: [{ id: 'photo-1', campaign_id: campaignId, session_id: 'session-online', status: 'approved', captured_at: nowIso, created_at: nowIso }],
  smart_pairing_waitlist: [{ id: 'wait-1', nome: 'Richiesta Notifiche', email: 'wait@fixture.local', comune: 'Milano', servizio: 'd2d', gestita: false, created_at: nowIso }],
  activity_log: [{ id: 'activity-1', action: 'fixture_loaded', message: 'Dataset Block 9', created_at: nowIso }],
};

async function installAdminFixture(page, role) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) return route.continue();
    if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: adminToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'block9-admin', email: 'admin.block9@fixture.local' } });
    if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'block9-admin', email: 'admin.block9@fixture.local' });
    if (url.pathname.includes('/rest/v1/profiles')) return json(route, { role });
    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/)?.[1];
    if (table) return json(route, adminRows[table] ?? []);
    return route.abort('blockedbyclient');
  });
  await page.addInitScript((value) => { localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: value, refreshToken: 'fixture-refresh' })); localStorage.setItem('vp_cookie_consent', 'accepted'); }, adminToken);
}

async function verifyClient(browser, viewport, screenshot) {
  const page = await browser.newPage({ viewport });
  await installClientFixture(page);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
  const center = page.locator('.ai-notification-center');
  await center.getByRole('heading', { name: 'Centro Notifiche' }).waitFor();
  assert.equal(await center.locator('.ai-notification-item').count(), 2);
  assert.equal(await center.getByText('cliente', { exact: true }).count(), 2);
  assert.equal(await center.getByText('admin', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Roma Admin', { exact: true }).count(), 0);
  assert.match(await center.getByText(/autorizzate$/).innerText(), /^2 autorizzate$/);
  const informative = center.getByRole('button', { name: /Informative/ });
  await informative.focus(); await page.keyboard.press('Enter');
  assert.equal(await center.locator('.ai-notification-item').count(), 1);
  await center.getByText('Report disponibili', { exact: true }).waitFor();
  const source = center.getByRole('button', { name: 'Fonte e criterio' });
  await source.focus(); await page.keyboard.press('Enter');
  await center.getByRole('region', { name: /Dettagli fonte/ }).waitFor();
  await page.keyboard.press('Escape');
  const hrefs = await center.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.ok(hrefs.every((href) => href === '/dashboard'));
  assert.equal(await center.getByRole('button', { name: /Segna|Archivia|Risolvi/i }).count(), 0);
  await page.screenshot({ path: `${artifactDir}/${screenshot}`, fullPage: true });
  await page.close();
}

async function verifyAdmin(browser, role, viewport, screenshot) {
  const page = await browser.newPage({ viewport });
  await installAdminFixture(page, role);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  const center = page.locator('.ai-notification-center');
  await center.getByRole('heading', { name: 'Centro Notifiche' }).waitFor();
  assert.equal(await center.locator('.ai-notification-item').count(), 4);
  assert.equal(await center.getByText('admin', { exact: true }).count(), 4);
  assert.equal(await center.getByText('cliente', { exact: true }).count(), 0);
  const hrefs = await center.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.ok(hrefs.every((href) => ['/admin/live', '/admin/anomalie', '/admin/finance', '#campagne-attive'].includes(href)));
  assert.equal(await center.locator('input, textarea, [contenteditable="true"]').count(), 0);
  await page.screenshot({ path: `${artifactDir}/${screenshot}`, fullPage: true });
  await page.close();
}

async function verifyAdminDenied(browser, role) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installAdminFixture(page, role);
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Accesso non autorizzato' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Centro Notifiche' }).count(), 0);
  await page.close();
}

async function verifyLanding(browser, viewport, screenshot) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => localStorage.setItem('vp_cookie_consent', 'accepted'));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const hub = page.locator('#volantinipro-ai-hub');
  await hub.getByRole('heading', { name: 'AI verificabile, stato dichiarato.' }).waitFor();
  assert.equal(await hub.getByText(/Disponibile$/).count(), 2);
  assert.equal(await hub.getByText(/In sviluppo$/).count(), 2);
  assert.equal(await hub.getByText(/Roadmap$/).count(), 2);
  const roadmap = hub.getByRole('article').filter({ hasText: 'Evoluzioni future' });
  await roadmap.getByText('Routing intelligente avanzato', { exact: true }).waitFor();
  assert.equal(await hub.getByText('Centro Notifiche UI consultivo', { exact: true }).count(), 1);
  assert.equal(await hub.getByText('Centro Notifiche persistente', { exact: true }).count(), 1);
  await page.screenshot({ path: `${artifactDir}/${screenshot}`, fullPage: true });
  await page.close();
}

(async () => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await verifyClient(browser, { width: 1440, height: 1000 }, 'client-notifications-desktop.png');
    await verifyClient(browser, { width: 390, height: 844 }, 'client-notifications-mobile.png');
    await verifyAdmin(browser, 'admin', { width: 1440, height: 1000 }, 'admin-notifications-desktop.png');
    await verifyAdmin(browser, 'super_admin', { width: 390, height: 844 }, 'admin-notifications-mobile.png');
    await verifyAdminDenied(browser, 'cliente');
    await verifyAdminDenied(browser, 'operatore');
    await verifyLanding(browser, { width: 1440, height: 1000 }, 'landing-maturity-desktop.png');
    await verifyLanding(browser, { width: 390, height: 844 }, 'landing-maturity-mobile.png');
    console.log('PASS Blocco 9: notifiche Cliente/Admin separate, permessi, filtri, fonti, landing, tastiera, desktop/mobile');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
