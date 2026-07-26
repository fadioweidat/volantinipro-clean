const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseUrl = process.env.AI_ADMIN_PHASE3_FLAG_OFF_URL || 'http://localhost:5179';
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'flag-off-admin', email: 'admin@test.local', role: 'authenticated', exp: 1893456000 })).toString('base64url')}.fixture`;
function json(route, body) { return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const page = await browser.newPage();
  try {
    await page.route('**/*', async (route) => { const url = new URL(route.request().url()); if (url.origin === baseUrl) return route.continue(); if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'flag-off-admin', email: 'admin@test.local' }); if (url.pathname.includes('/auth/v1/token')) return json(route, { access_token: token, refresh_token: 'x', user: { id: 'flag-off-admin', email: 'admin@test.local' } }); if (url.pathname.includes('/rest/v1/profiles')) return json(route, { role: 'admin' }); if (url.pathname.includes('/rest/v1/')) return json(route, []); return route.abort(); });
    await page.addInitScript((value) => localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: value, refreshToken: 'x' })), token);
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Dashboard Admin' }).waitFor(); await page.getByRole('textbox', { name: 'Cerca nella Dashboard Admin' }).waitFor();
    assert.equal(await page.getByText('Assistente Operativo VolantiniPro', { exact: true }).count(), 0); assert.equal(await page.getByRole('button', { name: 'Apri assistente' }).count(), 0);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('vp_ai_admin_session:'))), false);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('AdminCentralAiPanel'))), false);
    console.log('PASS Phase 3 feature flag OFF: Dashboard Admin invariata, Agent non montato e integrazione non caricata');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
