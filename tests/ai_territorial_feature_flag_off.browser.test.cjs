const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseUrl = process.env.AI_TERRITORIAL_PHASE4_OFF_URL || 'http://127.0.0.1:5181';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.route('**/*', async (route) => { const url = new URL(route.request().url()); if (url.origin === baseUrl) return route.continue(); if (url.pathname.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); if (url.pathname.includes('/functions/v1/')) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); return route.abort('blockedbyclient'); });
    await page.goto(`${baseUrl}/zona?service=d2d&comune=Varedo&qty=10000`, { waitUntil: 'domcontentloaded' }); await page.getByText('Scegli la zona di distribuzione', { exact: true }).waitFor(); await page.getByPlaceholder('Cerca comune').waitFor();
    assert.equal(await page.getByText('Assistente Analisi Territoriale', { exact: true }).count(), 0); assert.equal(await page.locator('.territorial-central-ai').count(), 0); assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('vp_ai_territory_session:'))), false); assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => /TerritorialStep2AiBoundary|TerritorialAiAssistantPanel|buildTerritorialAiSnapshot/.test(entry.name))), false);
    console.log('PASS Phase 4 feature flag OFF: Step 2 invariato, pannello non montato, integrazione e sessione non caricate');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
