const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const baseUrl = process.env.AI_CUSTOMER_FLAG_OFF_BASE_URL || 'http://localhost:5178';
const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'flag-off-user', email: 'flag.off@fixture.local', exp: 1893456000 })).toString('base64url')}.fixture`;

function json(route, body) { return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === baseUrl) return route.continue();
      if (url.pathname.includes('/auth/v1/user')) return json(route, { id: 'flag-off-user', email: 'flag.off@fixture.local' });
      if (url.pathname.includes('/rest/v1/clienti')) return json(route, { id: 'flag-off-customer', nome: 'Flag Off', email: 'flag.off@fixture.local' });
      if (url.pathname.includes('/rest/v1/campagne')) return json(route, []);
      return route.abort('blockedbyclient');
    });
    await page.addInitScript((fixtureToken) => localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: fixtureToken })), token);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'La situazione in un colpo d’occhio' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Assistente VolantiniPro' }).count(), 0);
    assert.equal(await page.locator('[class*="customer-central-ai"]').count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Cerca campagne e preventivi' }).count(), 1);
    console.log('PASS feature flag off: Dashboard Cliente invariata e CentralAiAgent non montato');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
