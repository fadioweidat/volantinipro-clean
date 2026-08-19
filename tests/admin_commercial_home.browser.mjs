import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const campaignId = '20000000-0000-0000-0000-000000000001';
const today = new Date().toISOString();
const quote = {
  id: campaignId, title: 'Preventivo Seveso', client_name: 'Mario Rossi', client_phone: '+393331112222',
  client_email: 'mario@example.invalid', city_name: 'Seveso', quantity: 10000, total_amount: 0,
  status: 'pending_review', service_type: 'd2d', source: 'quote_requests', user_id: '70000000-0000-0000-0000-000000000001', created_at: today,
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 844 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('vp_supabase_session', JSON.stringify({ accessToken: 'header.payload.signature', refreshToken: 'fixture' })));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (!request.url().includes('supabase.co')) return request.continue();
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const path = new URL(request.url()).pathname;
    const body = path.endsWith('/auth/v1/user') ? { id: quote.user_id, email: 'admin@example.invalid' }
      : path.endsWith('/rpc/jwt_is_admin') ? true
        : path.includes('/rest/v1/campaigns') ? [quote]
          : [];
    return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle2' });
  try {
    await page.waitForFunction(() => document.body.innerText.includes('Preventivi rapidi'), { timeout: 15000 });
  } catch (error) {
    throw new Error(`Dashboard commerciale non renderizzata (${page.url()}): ${await page.evaluate(() => document.body.innerText.slice(0, 1200))}`, { cause: error });
  }
  const result = await page.evaluate(() => ({
    text: document.body.innerText,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    tableCount: document.querySelectorAll('table').length,
  }));
  assert.match(result.text, /Mario Rossi/);
  assert.match(result.text, /Seveso/);
  assert.match(result.text, /10\.000 volantini/);
  assert.match(result.text, /Nuovo/);
  assert.match(result.text, /Analytics non configurata/);
  assert.match(result.text, /Dati non disponibili/);
  assert.equal(result.overflow, false);
  assert.equal(result.tableCount, 0);
  assert.deepEqual(pageErrors, []);
  console.log('COMMERCIAL HOME BROWSER: PASS');
  console.log('MOBILE 400x844: PASS');
  console.log('HORIZONTAL OVERFLOW: NO');
} finally {
  await browser.close();
}
